import { Hono } from 'hono';
import { generateId } from '../lib/nanoid.js';
import { badRequest, notFound } from '../lib/errors.js';
import { insertConnection, getConnection, deleteConnection } from '../db/connections.js';
import { getIdea } from '../db/ideas.js';

const connections = new Hono();

// POST /api/connections
connections.post('/', async (c) => {
  let body;
  try {
    body = await c.req.json();
  } catch {
    return badRequest('Invalid JSON');
  }

  const { from_id, to_id, label } = body;
  if (!from_id || !to_id) return badRequest('from_id and to_id are required');

  // Verify both ideas exist
  const [from, to] = await Promise.all([getIdea(c.env.DB, from_id), getIdea(c.env.DB, to_id)]);
  if (!from) return notFound(`Idea ${from_id} not found`);
  if (!to) return notFound(`Idea ${to_id} not found`);

  const id = generateId();
  const now = Date.now();

  try {
    await insertConnection(c.env.DB, { id, from_id, to_id, label: label ?? null, created_at: now });
  } catch (err) {
    if (err.message?.includes('UNIQUE')) {
      return badRequest('Connection already exists');
    }
    throw err;
  }

  const connection = await getConnection(c.env.DB, id);
  return c.json({ connection }, 201);
});

// DELETE /api/connections/:id
connections.delete('/:id', async (c) => {
  const id = c.req.param('id');
  const existing = await getConnection(c.env.DB, id);
  if (!existing) return notFound('Connection not found');

  await deleteConnection(c.env.DB, id);
  return c.json({ deleted: id });
});

export default connections;
