import { serve } from '@hono/node-server';
import app from './app.js';
import { createEnv, initDb } from './env.js';

const env = createEnv();

// Initialize DB schema on first run (idempotent — uses CREATE IF NOT EXISTS)
initDb();

const port = parseInt(process.env.PORT ?? '8080');
serve({ fetch: (req) => app.fetch(req, env), port });
console.log(`SFL API listening on port ${port}`);
