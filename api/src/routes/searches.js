import { Hono } from 'hono';
import { badRequest, notFound } from '../lib/errors.js';

const searches = new Hono();

// GET /api/searches
searches.get('/', async (c) => {
  const { results } = await c.env.DB.prepare(
    'SELECT id, query, label, created_at FROM saved_searches ORDER BY created_at DESC',
  ).all();
  return c.json({ searches: results });
});

// POST /api/searches { query, label }
searches.post('/', async (c) => {
  let body;
  try {
    body = await c.req.json();
  } catch {
    return badRequest('Invalid JSON');
  }
  const { query, label } = body ?? {};
  if (!query || typeof query !== 'string') return badRequest('query is required');
  if (!label || typeof label !== 'string') return badRequest('label is required');

  const now = Date.now();
  const res = await c.env.DB.prepare(
    'INSERT INTO saved_searches (query, label, created_at) VALUES (?, ?, ?)',
  )
    .bind(query, label, now)
    .run();
  const id = res?.meta?.last_row_id;
  return c.json({ id, query, label, created_at: now }, 201);
});

// DELETE /api/searches/:id
searches.delete('/:id', async (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isFinite(id)) return badRequest('Invalid id');
  const existing = await c.env.DB.prepare('SELECT id FROM saved_searches WHERE id = ?').bind(id).first();
  if (!existing) return notFound('Saved search not found');
  await c.env.DB.prepare('DELETE FROM saved_searches WHERE id = ?').bind(id).run();
  return c.json({ deleted: id });
});

export default searches;
