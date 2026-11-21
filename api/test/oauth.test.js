import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import app from '../src/app.js';
import { createMockEnv } from './helpers.js';
import { createSqliteD1, sqliteAvailable } from './sqlite-d1.js';

// The OAuth server as claude.ai uses it (register, authorize, token, then /mcp), and as an attacker would.

let env;
const executionCtx = { waitUntil: () => {}, passThroughOnException: () => {} };

const REDIRECT = 'https://claude.ai/api/mcp/auth_callback';
const VERIFIER = 'a-code-verifier-that-is-long-enough-to-be-valid-0123456789';
const CHALLENGE = createHash('sha256').update(VERIFIER).digest('base64url');

function request(path, init = {}) {
  return app.request(path, init, env, executionCtx);
}

function form(fields) {
  return {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(fields).toString(),
  };
}

function json(body) {
  return { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

async function register(redirect_uris = [REDIRECT]) {
  const res = await request('/oauth/register', json({ redirect_uris }));
  expect(res.status).toBe(201);
  return (await res.json()).client_id;
}

async function approve(client_id, fields = {}) {
  return request(
    '/oauth/authorize',
    form({
      client_id,
      redirect_uri: REDIRECT,
      state: 'st4te',
      code_challenge: CHALLENGE,
      code_challenge_method: 'S256',
      api_key: 'test-api-key',
      ...fields,
    }),
  );
}

async function codeFor(client_id, fields) {
  const res = await approve(client_id, fields);
  expect(res.status).toBe(302);
  return new URL(res.headers.get('location')).searchParams.get('code');
}

function exchange(fields) {
  return request(
    '/oauth/token',
    form({ grant_type: 'authorization_code', redirect_uri: REDIRECT, code_verifier: VERIFIER, ...fields }),
  );
}

describe.skipIf(!sqliteAvailable)('OAuth server', () => {
  beforeEach(() => {
    env = createMockEnv({ DB: createSqliteD1() });
  });

  describe('the flow claude.ai runs', () => {
    it('publishes its endpoints without auth', async () => {
      const res = await request('/.well-known/oauth-authorization-server');
      expect(res.status).toBe(200);
      const meta = await res.json();
      expect(meta.authorization_endpoint).toMatch(/\/oauth\/authorize$/);
      expect(meta.token_endpoint).toMatch(/\/oauth\/token$/);
      expect(meta.registration_endpoint).toMatch(/\/oauth\/register$/);
      expect(meta.code_challenge_methods_supported).toEqual(['S256']);
    });

    it('registers a client, shows the approval page, issues a code and trades it for a token that opens /mcp', async () => {
      const client_id = await register();

      const page = await request(
        `/oauth/authorize?response_type=code&client_id=${client_id}&redirect_uri=${encodeURIComponent(REDIRECT)}` +
          `&state=st4te&code_challenge=${CHALLENGE}&code_challenge_method=S256`,
      );
      expect(page.status).toBe(200);
      const html = await page.text();
      expect(html).toContain(`name="client_id" value="${client_id}"`);
      expect(html).toContain(`name="code_challenge" value="${CHALLENGE}"`);

      const approved = await approve(client_id);
      expect(approved.status).toBe(302);
      const back = new URL(approved.headers.get('location'));
      expect(back.origin + back.pathname).toBe(REDIRECT);
      expect(back.searchParams.get('state')).toBe('st4te');
      const code = back.searchParams.get('code');
      expect(code).toBeTruthy();

      const tokenRes = await exchange({ code, client_id });
      expect(tokenRes.status).toBe(200);
      const { access_token, token_type } = await tokenRes.json();
      expect(token_type).toBe('Bearer');

      const mcp = await request('/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${access_token}` },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
      });
      expect(mcp.status).toBe(200);
      expect((await mcp.json()).result.tools.length).toBeGreaterThan(0);

      const api = await request('/api/ideas', { headers: { Authorization: `Bearer ${access_token}` } });
      expect(api.status).toBe(200);
    });

    it('takes the token request as JSON too', async () => {
      const client_id = await register();
      const code = await codeFor(client_id);
      const res = await request(
        '/oauth/token',
        json({ grant_type: 'authorization_code', code, client_id, redirect_uri: REDIRECT, code_verifier: VERIFIER }),
      );
      expect(res.status).toBe(200);
      expect((await res.json()).access_token).toBeTruthy();
    });
  });

  describe('as an attacker', () => {
    it('refuses /mcp and /api without a token, and with a made-up one', async () => {
      const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
      const headers = { 'Content-Type': 'application/json' };
      expect((await request('/mcp', { method: 'POST', headers, body })).status).toBe(401);
      expect(
        (await request('/mcp', { method: 'POST', headers: { ...headers, Authorization: 'Bearer made-up' }, body }))
          .status,
      ).toBe(401);
      expect((await request('/api/ideas', { headers: { Authorization: 'Bearer ' } })).status).toBe(401);
    });

    it('issues no code for a wrong API key', async () => {
      const client_id = await register();
      const res = await approve(client_id, { api_key: 'wrong' });
      expect(res.status).toBe(401);
      expect(res.headers.get('location')).toBeNull();
      expect(env.DB._db.prepare('SELECT COUNT(*) AS n FROM oauth_codes').get().n).toBe(0);
    });

    it('issues no code when the Worker has no API_KEY and the form sends none', async () => {
      env = createMockEnv({ DB: createSqliteD1(), API_KEY: undefined });
      const client_id = await register();
      const res = await request(
        '/oauth/authorize',
        form({ client_id, redirect_uri: REDIRECT, state: 's', code_challenge: CHALLENGE }),
      );
      expect(res.status).toBe(401);
      expect(env.DB._db.prepare('SELECT COUNT(*) AS n FROM oauth_codes').get().n).toBe(0);
    });

    it('shows no approval page for a redirect_uri the client did not register', async () => {
      const client_id = await register();
      const res = await request(
        `/oauth/authorize?response_type=code&client_id=${client_id}&redirect_uri=${encodeURIComponent('https://evil.example/cb')}`,
      );
      expect(res.status).toBe(400);
    });

    it('sends no code to an unregistered redirect_uri when the approval form is posted directly', async () => {
      const client_id = await register();
      const res = await approve(client_id, { redirect_uri: 'https://evil.example/cb' });
      expect(res.status).toBe(400);
      expect(res.headers.get('location')).toBeNull();
      expect(env.DB._db.prepare('SELECT COUNT(*) AS n FROM oauth_codes').get().n).toBe(0);
    });

    it('escapes what it reflects into the approval page', async () => {
      const client_id = await register();
      const res = await request(
        `/oauth/authorize?response_type=code&client_id=${client_id}&redirect_uri=${encodeURIComponent(REDIRECT)}` +
          `&state=${encodeURIComponent('"><script>alert(1)</script>')}`,
      );
      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).not.toContain('<script>');
      expect(html).toContain('&quot;>&lt;script>');
    });

    it('answers 400, not 500, when required parameters are missing', async () => {
      expect((await request('/oauth/authorize?response_type=code')).status).toBe(400);
      expect((await request('/oauth/token', form({ grant_type: 'authorization_code' }))).status).toBe(400);
      expect((await request('/oauth/register', json(null))).status).toBe(400);
      expect((await request('/oauth/token', json(null))).status).toBe(400);
    });

    it('trades a code once only', async () => {
      const client_id = await register();
      const code = await codeFor(client_id);
      expect((await exchange({ code, client_id })).status).toBe(200);
      const again = await exchange({ code, client_id });
      expect(again.status).toBe(400);
      expect((await again.json()).error).toBe('invalid_grant');
    });

    it('trades a code once only when two requests arrive together', async () => {
      const client_id = await register();
      const code = await codeFor(client_id);
      const results = await Promise.all([exchange({ code, client_id }), exchange({ code, client_id })]);
      expect(results.map((r) => r.status).sort()).toEqual([200, 400]);
      expect(env.DB._db.prepare('SELECT COUNT(*) AS n FROM oauth_tokens').get().n).toBe(1);
    });

    it('refuses a code without the PKCE verifier, with a wrong one, for another client or another redirect_uri', async () => {
      const client_id = await register();
      const other = await register();

      const noVerifier = await request(
        '/oauth/token',
        form({ grant_type: 'authorization_code', code: await codeFor(client_id), client_id, redirect_uri: REDIRECT }),
      );
      expect(noVerifier.status).toBe(400);

      expect((await exchange({ code: await codeFor(client_id), client_id, code_verifier: 'wrong' })).status).toBe(400);
      expect((await exchange({ code: await codeFor(client_id), client_id: other })).status).toBe(400);
      expect(
        (await exchange({ code: await codeFor(client_id), client_id, redirect_uri: 'https://evil.example/cb' })).status,
      ).toBe(400);
      expect(env.DB._db.prepare('SELECT COUNT(*) AS n FROM oauth_tokens').get().n).toBe(0);
    });

    it('refuses an expired code', async () => {
      const client_id = await register();
      const code = await codeFor(client_id);
      env.DB._db.prepare('UPDATE oauth_codes SET expires_at = ? WHERE code = ?').run(Date.now() - 1, code);
      const res = await exchange({ code, client_id });
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe('invalid_grant');
    });

    it('refuses other grant types', async () => {
      const res = await request('/oauth/token', form({ grant_type: 'client_credentials' }));
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe('unsupported_grant_type');
    });
  });
});
