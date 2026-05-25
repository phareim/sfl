import app from './app.js';
import { searchIdeas } from './db/ideas.js';

/**
 * Cron handler — runs each saved search against the current corpus, diffs
 * against `saved_search_hits`, persists new hits, and posts new matches to
 * `env.WEBHOOK_URL`. Killswitch via `env.SAVED_SEARCH_ENABLED !== 'true'`.
 */
async function scheduled(_event, env, _ctx) {
  if (env.SAVED_SEARCH_ENABLED !== 'true') {
    console.log('[saved-search] killswitch off (SAVED_SEARCH_ENABLED!=true)');
    return;
  }

  const { results: searches } = await env.DB.prepare(
    'SELECT id, query, label FROM saved_searches ORDER BY id ASC',
  ).all();
  if (!searches?.length) return;

  const webhook = env.WEBHOOK_URL;
  const secret = env.SFL_WEBHOOK_SECRET;
  if (!webhook || !secret) {
    console.error('[saved-search] WEBHOOK_URL or SFL_WEBHOOK_SECRET missing — skipping push');
    return;
  }

  for (const s of searches) {
    try {
      let matches = [];
      try {
        matches = await searchIdeas(env.DB, s.query, { limit: 50 });
      } catch (err) {
        console.error(`[saved-search] ${s.label}: search failed: ${err.message}`);
        continue;
      }

      const { results: priorRows } = await env.DB.prepare(
        'SELECT idea_id FROM saved_search_hits WHERE saved_search_id = ?',
      )
        .bind(s.id)
        .all();
      const prior = new Set((priorRows ?? []).map((r) => r.idea_id));

      const fresh = matches.filter((m) => !prior.has(m.id));
      if (fresh.length === 0) continue;

      const now = Date.now();
      for (const m of fresh) {
        await env.DB.prepare(
          'INSERT OR IGNORE INTO saved_search_hits (saved_search_id, idea_id, seen_at) VALUES (?, ?, ?)',
        )
          .bind(s.id, m.id, now)
          .run();
      }

      const payload = {
        saved_search_id: s.id,
        label: s.label,
        query: s.query,
        matches: fresh.map((m) => ({
          idea_id: m.id,
          title: m.title ?? '(untitled)',
          snippet: (m.summary ?? m.body ?? '').slice(0, 240),
          url: m.url ?? '',
        })),
      };

      const res = await fetch(webhook, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${secret}`,
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        console.error(`[saved-search] ${s.label}: webhook ${res.status}`);
      } else {
        console.log(`[saved-search] ${s.label}: pushed ${fresh.length} new hits`);
      }
    } catch (err) {
      console.error(`[saved-search] ${s.label}: ${err.message}`);
    }
  }
}

export default {
  fetch: app.fetch,
  scheduled,
};
