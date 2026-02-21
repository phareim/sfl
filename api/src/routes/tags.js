import { Hono } from 'hono';

const tags = new Hono();

/**
 * GET /api/tags
 * Returns all ideas with type='tag' plus a usage count (number of connections to that tag).
 */
tags.get('/', async (c) => {
  const { results } = await c.env.DB
    .prepare(
      `SELECT t.*, COUNT(c.id) as usage_count
       FROM ideas t
       LEFT JOIN connections c ON c.to_id = t.id AND c.label = 'tagged_with'
       WHERE t.type = 'tag'
       GROUP BY t.id
       ORDER BY usage_count DESC, t.title ASC`
    )
    .all();

  return c.json({ tags: results });
});

export default tags;
