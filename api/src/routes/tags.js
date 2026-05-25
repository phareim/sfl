import { Hono } from 'hono';
import { badRequest, notFound } from '../lib/errors.js';

const tags = new Hono();

/**
 * GET /api/tags
 * Returns all ideas with type='tag' plus a usage count (number of connections to that tag).
 */
tags.get('/', async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT t.*, COUNT(c.id) as usage_count
       FROM ideas t
       LEFT JOIN connections c ON c.to_id = t.id AND c.label = 'tagged_with'
       WHERE t.type = 'tag'
       GROUP BY t.id
       ORDER BY usage_count DESC, t.title ASC`,
  ).all();

  return c.json({ tags: results });
});

/**
 * PUT /api/tags/:id  { title }
 * Rename a tag. The ideas_fts_update trigger handles FTS resync.
 *   404 — id missing or row is not a tag
 *   400 — empty title
 *   409 — another tag already uses that title
 */
tags.put('/:id', async (c) => {
  const id = c.req.param('id');

  let body;
  try {
    body = await c.req.json();
  } catch {
    return badRequest('Invalid JSON');
  }

  const title = typeof body?.title === 'string' ? body.title.trim() : '';
  if (!title) return badRequest('title is required');

  const existing = await c.env.DB.prepare('SELECT id, type, title FROM ideas WHERE id = ?').bind(id).first();
  if (!existing || existing.type !== 'tag') return notFound('Tag not found');

  // No-op rename short-circuits
  if (existing.title === title) {
    return c.json({ id, title });
  }

  const clash = await c.env.DB.prepare("SELECT id FROM ideas WHERE type = 'tag' AND title = ? AND id != ?")
    .bind(title, id)
    .first();
  if (clash) {
    return c.json({ error: `Another tag already has title ${JSON.stringify(title)} (id=${clash.id})` }, 409);
  }

  const now = Date.now();
  await c.env.DB.prepare("UPDATE ideas SET title = ?, updated_at = ? WHERE id = ? AND type = 'tag'")
    .bind(title, now, id)
    .run();

  return c.json({ id, title, updated_at: now });
});

/**
 * POST /api/tags/:id/merge  { into }
 * Rewire all connections that point at <id> over to <into>, then delete the source tag.
 *   400 — missing/invalid body, self-merge
 *   404 — either id is missing or not a tag
 */
tags.post('/:id/merge', async (c) => {
  const sourceId = c.req.param('id');

  let body;
  try {
    body = await c.req.json();
  } catch {
    return badRequest('Invalid JSON');
  }

  const intoId = typeof body?.into === 'string' ? body.into.trim() : '';
  if (!intoId) return badRequest('into is required');
  if (intoId === sourceId) return badRequest('Cannot merge a tag into itself');

  const source = await c.env.DB.prepare('SELECT id, type, title FROM ideas WHERE id = ?').bind(sourceId).first();
  if (!source || source.type !== 'tag') return notFound(`Source tag ${sourceId} not found`);

  const target = await c.env.DB.prepare('SELECT id, type, title FROM ideas WHERE id = ?').bind(intoId).first();
  if (!target || target.type !== 'tag') return notFound(`Target tag ${intoId} not found`);

  // Snapshot connections pointing at the source. We rewire row-by-row instead
  // of a single UPDATE so dedupe collisions (UNIQUE(from_id, to_id, label))
  // don't abort the whole batch.
  const { results: incoming } = await c.env.DB.prepare(
    "SELECT id, from_id FROM connections WHERE to_id = ? AND label = 'tagged_with'",
  )
    .bind(sourceId)
    .all();

  let rewired = 0;
  let deduped = 0;

  for (const row of incoming) {
    try {
      const res = await c.env.DB.prepare(
        "UPDATE connections SET to_id = ? WHERE id = ? AND label = 'tagged_with'",
      )
        .bind(intoId, row.id)
        .run();
      const changes = res?.meta?.changes ?? res?.changes ?? 1;
      rewired += Number(changes) > 0 ? 1 : 0;
    } catch (err) {
      // Unique-constraint hit: this from_id was already tagged with the target.
      // Drop the loser row and count it as a dedupe.
      const msg = String(err?.message ?? err);
      if (/UNIQUE/i.test(msg) || /constraint/i.test(msg)) {
        await c.env.DB.prepare('DELETE FROM connections WHERE id = ?').bind(row.id).run();
        deduped += 1;
      } else {
        throw err;
      }
    }
  }

  // Mop up any rows that still point at the source (defensive — shouldn't happen
  // after the loop above, but the schema's ON DELETE CASCADE catches stragglers
  // too).
  await c.env.DB.prepare("DELETE FROM connections WHERE to_id = ? AND label = 'tagged_with'").bind(sourceId).run();

  await c.env.DB.prepare("DELETE FROM ideas WHERE id = ? AND type = 'tag'").bind(sourceId).run();

  return c.json({ merged: sourceId, into: intoId, rewired, deduped });
});

export default tags;
