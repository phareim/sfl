import { Hono } from 'hono';
import { badRequest } from '../lib/errors.js';
import { getJson } from '../lib/r2.js';

const meta = new Hono();

const RANGE_MS = {
  '7d': 7 * 24 * 60 * 60 * 1000,
  '14d': 14 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
};

/**
 * GET /api/meta/digest?range=7d|14d|30d
 *
 * Returns metas with status='done' that were last updated inside the window,
 * grouped by project. We treat updated_at as the proxy for completed_at —
 * the data model doesn't track status transitions, so the last update on a
 * done meta is the best signal we have.
 *
 * Response:
 *   { range, generated_at, projects: [{ project, done: [{ wordly_id, title, completed_at }] }] }
 */
meta.get('/digest', async (c) => {
  const range = c.req.query('range') ?? '7d';
  const windowMs = RANGE_MS[range];
  if (!windowMs) return badRequest('range must be 7d, 14d, or 30d');

  const now = Date.now();
  const since = now - windowMs;

  // Pull every meta updated inside the window. Cheap at this scale (dozens of
  // rows per week) and avoids reading status from R2 for ideas that can't
  // possibly qualify.
  const { results: rows } = await c.env.DB.prepare(
    `SELECT id, title, url, updated_at, r2_key
       FROM ideas
      WHERE type = 'meta' AND updated_at >= ?
      ORDER BY updated_at DESC`,
  )
    .bind(since)
    .all();

  // Filter to status='done' by reading R2; group by project.
  const byProject = new Map();
  await Promise.all(
    rows.map(async (row) => {
      const data = (await getJson(c.env.R2, row.r2_key)) ?? {};
      if (data.status !== 'done') return;
      const project = data.project ?? row.url ?? '(no project)';
      if (!byProject.has(project)) byProject.set(project, []);
      byProject.get(project).push({
        wordly_id: data.wordly_id ?? null,
        title: row.title,
        completed_at: row.updated_at,
      });
    }),
  );

  const projects = [...byProject.entries()]
    .map(([project, done]) => ({ project, done }))
    .sort((a, b) => {
      const aMax = Math.max(...a.done.map((d) => d.completed_at));
      const bMax = Math.max(...b.done.map((d) => d.completed_at));
      return bMax - aMax;
    });

  return c.json({ range, generated_at: now, projects });
});

export default meta;
