import { Hono } from 'hono';
import { generateId } from '../lib/nanoid.js';
import { badRequest } from '../lib/errors.js';

const messages = new Hono();

// GET /api/messages?limit=50&cursor=<timestamp>
messages.get('/', async (c) => {
  const limit = Math.min(parseInt(c.req.query('limit') ?? '50', 10), 100);
  const cursor = c.req.query('cursor');

  let rows;
  if (cursor) {
    const { results } = await c.env.DB
      .prepare('SELECT * FROM messages WHERE created_at < ? ORDER BY created_at DESC LIMIT ?')
      .bind(parseInt(cursor, 10), limit)
      .all();
    rows = results;
  } else {
    const { results } = await c.env.DB
      .prepare('SELECT * FROM messages ORDER BY created_at DESC LIMIT ?')
      .bind(limit)
      .all();
    rows = results;
  }

  const nextCursor = rows.length === limit ? rows[rows.length - 1].created_at : null;
  return c.json({ messages: rows, nextCursor });
});

// POST /api/messages — store user message, fire-and-forget AI reply or webhook
messages.post('/', async (c) => {
  let body;
  try {
    body = await c.req.json();
  } catch {
    return badRequest('Invalid JSON');
  }

  const { body: msgBody, sender } = body;
  if (!msgBody?.trim()) return badRequest('body is required');

  // Allow "sleeper" sender to post replies without triggering webhooks/AI
  if (sender === 'sleeper') {
    const id = generateId();
    const now = Date.now();
    await c.env.DB
      .prepare('INSERT INTO messages (id, body, sender, created_at) VALUES (?, ?, ?, ?)')
      .bind(id, msgBody.trim(), 'sleeper', now)
      .run();
    return c.json({ message: { id, body: msgBody.trim(), sender: 'sleeper', created_at: now } }, 201);
  }

  const id = generateId();
  const now = Date.now();
  await c.env.DB
    .prepare('INSERT INTO messages (id, body, sender, created_at) VALUES (?, ?, ?, ?)')
    .bind(id, msgBody.trim(), 'user', now)
    .run();

  const message = { id, body: msgBody.trim(), sender: 'user', created_at: now };

  if (c.env.WEBHOOK_URL) {
    c.executionCtx.waitUntil(fireWebhook(c.env, message));
  } else {
    c.executionCtx.waitUntil(generateReply(c.env, msgBody.trim()));
  }

  return c.json({ message }, 201);
});

async function fireWebhook(env, message) {
  try {
    await fetch(env.WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-SFL-Secret': env.WEBHOOK_SECRET ?? '',
      },
      body: JSON.stringify(message),
    });
  } catch {
    // Best-effort: never surface webhook errors
  }
}

async function generateReply(env, userMessage) {
  try {
    // Fetch last 5 meta ideas for context
    const { results: metas } = await env.DB
      .prepare("SELECT title FROM ideas WHERE type = 'meta' ORDER BY created_at DESC LIMIT 5")
      .all();

    const contextLines = metas.map((m) => `- ${m.title}`).join('\n');
    const systemPrompt = contextLines
      ? `You are Sleeper, a personal server assistant. Be concise.\n\nRecent tasks:\n${contextLines}`
      : 'You are Sleeper, a personal server assistant. Be concise.';

    const response = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
    });

    const replyText = response?.response?.trim();
    if (!replyText) return;

    const replyId = generateId();
    await env.DB
      .prepare('INSERT INTO messages (id, body, sender, created_at) VALUES (?, ?, ?, ?)')
      .bind(replyId, replyText, 'sleeper', Date.now())
      .run();
  } catch {
    // Best-effort: never surface AI reply errors
  }
}

export default messages;
