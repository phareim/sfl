import { unauthorized } from './lib/errors.js';

/**
 * Hono middleware that validates Bearer token — accepts both the raw API_KEY
 * and tokens issued via the OAuth flow.
 */
export function bearerAuth() {
  return async (c, next) => {
    const header = c.req.header('Authorization') ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;

    if (!token) return unauthorized();

    // Direct API key — always valid
    if (token === c.env.API_KEY) {
      await next();
      return;
    }

    // OAuth-issued token
    const row = await c.env.DB
      .prepare('SELECT 1 FROM oauth_tokens WHERE token = ?')
      .bind(token)
      .first();

    if (!row) return unauthorized();

    await next();
  };
}
