import { describe, expect, it } from 'vitest';
import app from '../src/app.js';
import { createMockEnv } from './helpers.js';

// The allowlist: which routes answer without a token. Read from the routes the app has registered, so a route
// mounted outside the auth middleware shows up here.

const executionCtx = { waitUntil: () => {}, passThroughOnException: () => {} };

const PUBLIC = [
  'GET /.well-known/oauth-authorization-server',
  'GET /health',
  'GET /oauth/authorize',
  'POST /oauth/authorize',
  'POST /oauth/register',
  'POST /oauth/token',
];

const routes = [
  ...new Set(app.routes.filter((r) => r.method !== 'ALL').map((r) => `${r.method} ${r.path.replace(/:\w+/g, 'x')}`)),
].sort();

function request(route, headers = {}) {
  const [method, path] = route.split(' ');
  const init = { method, headers: { 'Content-Type': 'application/json', ...headers } };
  if (method !== 'GET') init.body = '{}';
  return app.request(path, init, createMockEnv(), executionCtx);
}

describe('auth allowlist', () => {
  it('has routes to check', () => {
    expect(routes.length).toBeGreaterThan(25);
    expect(routes).toContain('POST /api/ideas');
    expect(routes).toContain('POST /mcp');
  });

  it('leaves exactly the health check and the OAuth endpoints open', () => {
    expect(routes.filter((r) => !/ \/(api|mcp)(\/|$)/.test(r))).toEqual(PUBLIC);
  });

  it('answers 401 on every other route without a token, with a wrong one, and with the key in the query', async () => {
    for (const route of routes.filter((r) => !PUBLIC.includes(r))) {
      expect((await request(route)).status, `${route} without a token`).toBe(401);
      expect((await request(route, { Authorization: 'Bearer wrong' })).status, `${route} with a wrong token`).toBe(401);
      expect((await request(route, { Authorization: 'test-api-key' })).status, `${route} without Bearer`).toBe(401);
      expect((await request(`${route}?key=test-api-key&api_key=test-api-key`)).status, `${route} key in query`).toBe(
        401,
      );
    }
  });

  it('does not let an encoded line terminator or a doubled slash step around the middleware', async () => {
    const twists = ['%0A', '%0D', '%E2%80%A8', '%E2%80%A9', '%00', '%09'];
    for (const route of ['GET /api/ideas', 'GET /api/ideas/x', 'GET /api/tags', 'POST /api/ideas', 'POST /mcp']) {
      const [method, path] = route.split(' ');
      const variants = twists.flatMap((t) => [`${path}${t}`, `${path}/${t}`, path.replace('/', `/${t}`), `/${path}`]);
      for (const variant of variants) {
        const status = (await request(`${method} ${variant}`)).status;
        expect([401, 404], `${method} ${variant}`).toContain(status);
      }
    }
  });
});
