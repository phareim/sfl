import { unauthorized } from './lib/errors.js';

/**
 * Hono middleware that validates Bearer token — accepts both the raw API_KEY
 * and tokens issued via the OAuth flow.
 *
 * With `resourceMetadata`, a 401 points the client at the protected-resource document (RFC 9728), which is how an
 * MCP client finds the OAuth server.
 */
export function bearerAuth({ resourceMetadata = false } = {}) {
  return async (c, next) => {
    const header = c.req.header('Authorization') ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;

    const deny = () =>
      unauthorized(
        resourceMetadata
          ? {
              'WWW-Authenticate': `Bearer resource_metadata="${new URL(c.req.url).origin}/.well-known/oauth-protected-resource"`,
            }
          : undefined,
      );

    if (!token) return deny();

    // Direct API key — always valid
    if (token === c.env.API_KEY) {
      await next();
      return;
    }

    // OAuth-issued token
    const row = await c.env.DB.prepare('SELECT 1 FROM oauth_tokens WHERE token = ?').bind(token).first();

    if (!row) return deny();

    await next();
  };
}
