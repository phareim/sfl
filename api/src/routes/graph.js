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

  // The neighbours in one statement with three parameters, however many there are: D1 takes at most 100 bound
  // parameters, and a tag is easily carried by more ideas than that.
  const { results: neighbors } = await c.env.DB.prepare(
    `SELECT id, type, title, url FROM ideas
      WHERE id != ?
        AND id IN (SELECT from_id FROM connections WHERE to_id = ?
                   UNION SELECT to_id FROM connections WHERE from_id = ?)`,
  )
    .bind(id, id, id)
    .all();

  return c.json({ idea, connections, neighbors });
});

export default graph;
