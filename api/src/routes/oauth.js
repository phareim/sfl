import { Hono } from 'hono';
import { generateId } from '../lib/nanoid.js';

const BASE_URL = 'https://sfl-api.aiwdm.workers.dev';

const oauth = new Hono();

// /.well-known/oauth-authorization-server — discovery (mounted at root in app.js)
export async function oauthMetadata(c) {
  return c.json({
    issuer: BASE_URL,
    authorization_endpoint: `${BASE_URL}/oauth/authorize`,
    token_endpoint: `${BASE_URL}/oauth/token`,
    registration_endpoint: `${BASE_URL}/oauth/register`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none'],
  });
}

// POST /oauth/register — dynamic client registration (RFC 7591)
oauth.post('/register', async (c) => {
  let body;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'invalid_request' }, 400);
  }

  const { redirect_uris } = body;
  if (!Array.isArray(redirect_uris) || redirect_uris.length === 0) {
    return c.json({ error: 'invalid_request', error_description: 'redirect_uris required' }, 400);
  }

  const client_id = generateId();
  const now = Date.now();

  await c.env.DB
    .prepare('INSERT INTO oauth_clients (client_id, redirect_uris, created_at) VALUES (?, ?, ?)')
    .bind(client_id, JSON.stringify(redirect_uris), now)
    .run();

  return c.json({
    client_id,
    redirect_uris,
    client_id_issued_at: Math.floor(now / 1000),
    grant_types: ['authorization_code'],
    response_types: ['code'],
    token_endpoint_auth_method: 'none',
  }, 201);
});

// GET /oauth/authorize — show approval page
oauth.get('/authorize', async (c) => {
  const { client_id, redirect_uri, state, code_challenge, code_challenge_method, response_type } = c.req.query();

  if (response_type !== 'code') {
    return c.json({ error: 'unsupported_response_type' }, 400);
  }

  const client = await c.env.DB
    .prepare('SELECT * FROM oauth_clients WHERE client_id = ?')
    .bind(client_id)
    .first();

  if (!client) return c.json({ error: 'invalid_client' }, 400);

  const redirectUris = JSON.parse(client.redirect_uris);
  if (!redirectUris.includes(redirect_uri)) {
    return c.json({ error: 'invalid_request', error_description: 'redirect_uri mismatch' }, 400);
  }

  return c.html(authorizePage({ client_id, redirect_uri, state, code_challenge, code_challenge_method }));
});

// POST /oauth/authorize — process approval
oauth.post('/authorize', async (c) => {
  const form = await c.req.parseBody();
  const { client_id, redirect_uri, state, code_challenge, code_challenge_method, api_key } = form;

  if (api_key !== c.env.API_KEY) {
    return c.html(
      authorizePage({ client_id, redirect_uri, state, code_challenge, code_challenge_method, error: 'Invalid API key.' }),
      401
    );
  }

  const client = await c.env.DB
    .prepare('SELECT * FROM oauth_clients WHERE client_id = ?')
    .bind(client_id)
    .first();

  if (!client) return c.json({ error: 'invalid_client' }, 400);

  const code = generateId();
  const now = Date.now();

  await c.env.DB
    .prepare(
      `INSERT INTO oauth_codes (code, client_id, redirect_uri, code_challenge, code_challenge_method, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(code, client_id, redirect_uri, code_challenge || null, code_challenge_method || null, now, now + 60_000)
    .run();

  const url = new URL(redirect_uri);
  url.searchParams.set('code', code);
  if (state) url.searchParams.set('state', state);

  return c.redirect(url.toString());
});

// POST /oauth/token — exchange code for access token
oauth.post('/token', async (c) => {
  let body;
  const ct = c.req.header('content-type') ?? '';
  try {
    body = ct.includes('application/json') ? await c.req.json() : await c.req.parseBody();
  } catch {
    return c.json({ error: 'invalid_request' }, 400);
  }

  const { grant_type, code, redirect_uri, client_id, code_verifier } = body;

  if (grant_type !== 'authorization_code') {
    return c.json({ error: 'unsupported_grant_type' }, 400);
  }

  const now = Date.now();
  const authCode = await c.env.DB
    .prepare('SELECT * FROM oauth_codes WHERE code = ?')
    .bind(code)
    .first();

  if (!authCode) return c.json({ error: 'invalid_grant' }, 400);
  if (authCode.client_id !== client_id) return c.json({ error: 'invalid_grant' }, 400);
  if (authCode.redirect_uri !== redirect_uri) return c.json({ error: 'invalid_grant' }, 400);
  if (authCode.expires_at < now) return c.json({ error: 'invalid_grant', error_description: 'Code expired' }, 400);

  // Verify PKCE (S256)
  if (authCode.code_challenge) {
    if (!code_verifier) {
      return c.json({ error: 'invalid_grant', error_description: 'code_verifier required' }, 400);
    }
    const valid = await verifyPKCE(code_verifier, authCode.code_challenge);
    if (!valid) {
      return c.json({ error: 'invalid_grant', error_description: 'PKCE verification failed' }, 400);
    }
  }

  // Single-use: delete the code
  await c.env.DB.prepare('DELETE FROM oauth_codes WHERE code = ?').bind(code).run();

  // Issue access token
  const token = generateId() + generateId();
  await c.env.DB
    .prepare('INSERT INTO oauth_tokens (token, client_id, created_at) VALUES (?, ?, ?)')
    .bind(token, client_id, now)
    .run();

  return c.json({ access_token: token, token_type: 'Bearer' });
});

async function verifyPKCE(codeVerifier, codeChallenge) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(codeVerifier));
  const computed = btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
  return computed === codeChallenge;
}

function esc(str) {
  return String(str ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function authorizePage({ client_id, redirect_uri, state, code_challenge, code_challenge_method, error }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>SFL — Authorize</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; background: #f4f4f5; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 1rem; }
    .card { background: #fff; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,.08), 0 8px 24px rgba(0,0,0,.06); padding: 2rem; width: 100%; max-width: 380px; }
    .logo { font-size: 1.5rem; font-weight: 800; letter-spacing: -0.04em; margin-bottom: 1.5rem; }
    h1 { font-size: 1.05rem; font-weight: 600; margin-bottom: 0.4rem; }
    .sub { color: #71717a; font-size: 0.875rem; margin-bottom: 1.5rem; line-height: 1.5; }
    .error { background: #fef2f2; color: #b91c1c; border-radius: 6px; padding: 0.6rem 0.8rem; font-size: 0.85rem; margin-bottom: 1rem; }
    label { display: block; font-size: 0.8rem; font-weight: 600; color: #3f3f46; margin-bottom: 0.35rem; }
    input[type=password] { width: 100%; padding: 0.6rem 0.75rem; border: 1px solid #e4e4e7; border-radius: 7px; font-size: 0.95rem; outline: none; transition: border-color .15s; }
    input[type=password]:focus { border-color: #18181b; }
    button { margin-top: 1rem; width: 100%; padding: 0.7rem; background: #18181b; color: #fff; border: none; border-radius: 7px; font-size: 0.95rem; font-weight: 600; cursor: pointer; transition: background .15s; }
    button:hover { background: #3f3f46; }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">SFL</div>
    <h1>Authorize access</h1>
    <p class="sub">Claude wants to read and write your ideas. Enter your API key to approve.</p>
    ${error ? `<div class="error">${esc(error)}</div>` : ''}
    <form method="POST" action="/oauth/authorize">
      <input type="hidden" name="client_id" value="${esc(client_id)}">
      <input type="hidden" name="redirect_uri" value="${esc(redirect_uri)}">
      <input type="hidden" name="state" value="${esc(state)}">
      <input type="hidden" name="code_challenge" value="${esc(code_challenge)}">
      <input type="hidden" name="code_challenge_method" value="${esc(code_challenge_method)}">
      <label for="api_key">API Key</label>
      <input type="password" id="api_key" name="api_key" placeholder="your-api-key" autofocus required>
      <button type="submit">Approve</button>
    </form>
  </div>
</body>
</html>`;
}

export default oauth;
