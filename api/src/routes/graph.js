import { Hono } from 'hono';
import { getAllConnections } from '../db/connections.js';
import { getIdea, getIdeaConnections } from '../db/ideas.js';
import { notFound } from '../lib/errors.js';

const graph = new Hono();

/**
 * GET /api/graph
 * Returns all nodes (ideas) and edges (connections).
 */
graph.get('/', async (c) => {
  const [{ results: nodes }, edges] = await Promise.all([
    c.env.DB.prepare('SELECT id, type, title, url, created_at FROM ideas ORDER BY created_at DESC').all(),
    getAllConnections(c.env.DB),
  ]);

  return c.json({ nodes, edges });
});

/**
 * GET /api/graph/:id/neighbors
 * Returns the idea and its immediate neighbors (1-hop).
 */
graph.get('/:id/neighbors', async (c) => {
  const id = c.req.param('id');
  const idea = await getIdea(c.env.DB, id);
  if (!idea) return notFound('Idea not found');

  const connections = await getIdeaConnections(c.env.DB, id);

  // Collect neighbor IDs
  const neighborIds = new Set();
  for (const conn of connections) {
    if (conn.from_id !== id) neighborIds.add(conn.from_id);
    if (conn.to_id !== id) neighborIds.add(conn.to_id);
  }

  let neighbors = [];
  if (neighborIds.size > 0) {
    const placeholders = [...neighborIds].map(() => '?').join(', ');
    const { results } = await c.env.DB
      .prepare(`SELECT id, type, title, url FROM ideas WHERE id IN (${placeholders})`)
      .bind(...neighborIds)
      .all();
    neighbors = results;
  }

  return c.json({ idea, connections, neighbors });
});

export default graph;
