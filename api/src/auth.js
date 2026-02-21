import { unauthorized } from './lib/errors.js';

/**
 * Hono middleware that validates Bearer token against the API_KEY secret.
 */
export function bearerAuth() {
  return async (c, next) => {
    const header = c.req.header('Authorization') ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;

    if (!token || token !== c.env.API_KEY) {
      return unauthorized();
    }

    await next();
  };
}
