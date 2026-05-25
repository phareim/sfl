#!/usr/bin/env node
/**
 * One-shot backfill of `ideas.body` from the deployed Worker.
 *
 *   node api/scripts/backfill-body.mjs            # skip rows that already have body
 *   node api/scripts/backfill-body.mjs --force    # re-project everything
 *
 * Reads each idea via `GET /api/ideas/:id` (so we get the parsed R2 blob and
 * the joined notes), computes the body via the same `projectBody` helper the
 * Worker uses, and PATCHes the body back via `PUT /api/ideas/:id` — but only
 * when the projected body differs from what's already in the row.
 *
 * The PUT path triggers the FTS5 update trigger because updated_at changes.
 *
 * Loads SFL_API_URL / SFL_API_KEY from env or ~/.config/sfl/config.json.
 */

import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { projectBody } from '../src/db/ideas.js';

function loadConfig() {
  const url = process.env.SFL_API_URL;
  const key = process.env.SFL_API_KEY;
  if (url && key) return { url, key };
  try {
    const raw = readFileSync(join(homedir(), '.config', 'sfl', 'config.json'), 'utf8');
    const cfg = JSON.parse(raw);
    if (cfg.SFL_API_URL && cfg.SFL_API_KEY) return { url: cfg.SFL_API_URL, key: cfg.SFL_API_KEY };
  } catch {}
  console.error('Error: SFL_API_URL / SFL_API_KEY missing');
  process.exit(1);
}

async function api(cfg, path, init = {}) {
  const res = await fetch(`${cfg.url}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${cfg.key}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(`${init.method ?? 'GET'} ${path} → ${res.status} ${await res.text()}`);
  return res.json();
}

async function listAllIdeas(cfg) {
  // The list endpoint paginates by created_at cursor; fetch in 100-row pages.
  const all = [];
  let cursor;
  for (;;) {
    const path = `/api/ideas?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
    const { ideas, nextCursor } = await api(cfg, path);
    if (!ideas?.length) break;
    all.push(...ideas);
    if (!nextCursor) break;
    cursor = nextCursor;
  }
  return all;
}

async function main() {
  const cfg = loadConfig();
  const force = process.argv.includes('--force');

  console.log(`[backfill-body] listing all ideas from ${cfg.url}…`);
  const list = await listAllIdeas(cfg);
  console.log(`[backfill-body] found ${list.length} ideas`);

  let processed = 0;
  let updated = 0;
  let skipped_existing = 0;
  let empty = 0;
  let errors = 0;

  for (const summary of list) {
    processed++;
    try {
      const full = await api(cfg, `/api/ideas/${encodeURIComponent(summary.id)}`);
      const idea = full.idea;
      const data = full.data ?? {};
      const noteRow = (full.notes ?? [])[0];
      const newBody = projectBody(idea.type, data, noteRow);

      if (!newBody) {
        empty++;
        if (processed % 50 === 0) {
          console.log(`  [${processed}/${list.length}] updated=${updated} skipped=${skipped_existing} empty=${empty} errors=${errors}`);
        }
        continue;
      }
      if (!force && idea.body && idea.body === newBody) {
        skipped_existing++;
        if (processed % 50 === 0) {
          console.log(`  [${processed}/${list.length}] updated=${updated} skipped=${skipped_existing} empty=${empty} errors=${errors}`);
        }
        continue;
      }

      // PUT triggers the FTS5 update trigger because updated_at changes. We
      // pass data unchanged so the R2 blob is rewritten verbatim, and let the
      // route handler re-project body identically to what we computed above.
      await api(cfg, `/api/ideas/${encodeURIComponent(idea.id)}`, {
        method: 'PUT',
        body: JSON.stringify({ data }),
      });
      updated++;
    } catch (err) {
      errors++;
      console.error(`  [${summary.id}] ${err.message}`);
    }

    if (processed % 50 === 0) {
      console.log(`  [${processed}/${list.length}] updated=${updated} skipped=${skipped_existing} empty=${empty} errors=${errors}`);
    }
  }

  console.log(`\n[backfill-body] done: processed=${processed} updated=${updated} skipped_existing=${skipped_existing} empty=${empty} errors=${errors}`);
}

main().catch((err) => {
  console.error(`Error: ${err.message}`);
  process.exit(1);
});
