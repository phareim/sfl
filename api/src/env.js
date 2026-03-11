import { createDb, initDb as initDbFile } from './lib/db-shim.js';
import { createR2 } from './lib/r2-shim.js';
import Anthropic from '@anthropic-ai/sdk';

function requireEnv(name) {
  const val = process.env[name];
  if (!val) throw new Error(`Missing required environment variable: ${name}`);
  return val;
}

export function createEnv() {
  return {
    DB: createDb(requireEnv('SQLITE_PATH')),
    R2: createR2(
      requireEnv('R2_ACCOUNT_ID'),
      requireEnv('R2_ACCESS_KEY_ID'),
      requireEnv('R2_SECRET_ACCESS_KEY'),
      requireEnv('R2_BUCKET')
    ),
    AI: new Anthropic({ apiKey: requireEnv('ANTHROPIC_API_KEY') }),
    API_KEY: requireEnv('API_KEY'),
    WEBHOOK_URL: process.env.WEBHOOK_URL,
    WEBHOOK_SECRET: process.env.WEBHOOK_SECRET,
  };
}

export function initDb() {
  initDbFile(requireEnv('SQLITE_PATH'));
}
