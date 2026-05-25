#!/usr/bin/env node
/**
 * One-shot tag-inventory cleanup against the live SFL Worker.
 *
 *   node api/scripts/cleanup-tags.js            # dry-run (default)
 *   node api/scripts/cleanup-tags.js --apply    # do it
 *
 * Loads SFL_API_URL / SFL_API_KEY from env or ~/.config/sfl/config.json.
 */

import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

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

function pickTag(tags, predicate) {
  return tags.find(predicate);
}

function pad(s, n) {
  s = String(s ?? '');
  return s.length >= n ? s : s + ' '.repeat(n - s.length);
}

async function main() {
  const cfg = loadConfig();
  const apply = process.argv.includes('--apply');

  const { tags } = await api(cfg, '/api/tags');
  console.log(`\nLive tag inventory (${tags.length} tags, ${tags.reduce((a, t) => a + (t.usage_count ?? 0), 0)} edges)\n`);
  console.log(`  ${pad('id', 10)} ${pad('count', 6)} title`);
  for (const t of tags) {
    console.log(`  ${pad(String(t.id).slice(0, 10), 10)} ${pad(t.usage_count, 6)} ${t.title}`);
  }
  console.log();

  // ── Build the plan ───────────────────────────────────────────────────
  const plan = [];

  // 1. AI → ai-news (case-exact lookup; brief calls this out explicitly).
  const ai = pickTag(tags, (t) => t.title === 'AI');
  const aiNews = pickTag(tags, (t) => t.title === 'ai-news');
  if (ai && aiNews) {
    plan.push({ kind: 'merge', source: ai, into: aiNews, why: 'AI is the same concept as ai-news' });
  }

  // 2. Case-insensitive lab-name dedupe — propose merges only when both
  // titles actually exist in the live inventory.
  const labs = ['openai', 'anthropic', 'google', 'meta', 'baidu', 'xai', 'mistral', 'cohere', 'apple', 'microsoft'];
  for (const lab of labs) {
    const lower = pickTag(tags, (t) => t.title === lab);
    const upper = pickTag(tags, (t) => t.title !== lab && t.title.toLowerCase() === lab);
    if (lower && upper) {
      plan.push({ kind: 'merge', source: upper, into: lower, why: `casing dupe (${upper.title} → ${lab})` });
    }
  }

  // 3. Resolve the `meta` tag/type collision. If the tag exists, rename it
  // (preserves the 2 uses) to meta-tag. If a meta-tag tag already exists,
  // merge instead.
  const metaTag = pickTag(tags, (t) => t.title === 'meta');
  if (metaTag) {
    const existingMetaTag = pickTag(tags, (t) => t.title === 'meta-tag');
    if (existingMetaTag) {
      plan.push({ kind: 'merge', source: metaTag, into: existingMetaTag, why: 'meta-tag already exists' });
    } else {
      plan.push({ kind: 'rename', source: metaTag, newTitle: 'meta-tag', why: 'collides with type=meta' });
    }
  }

  // ── Print + (optionally) execute ─────────────────────────────────────
  console.log(`Plan (${apply ? 'APPLY' : 'DRY-RUN'}):\n`);
  if (plan.length === 0) {
    console.log('  (nothing to do — inventory already clean for the cases we recognise)');
    return;
  }
  for (const step of plan) {
    if (step.kind === 'merge') {
      console.log(
        `  merge ${pad(step.source.title, 16)} (${step.source.usage_count} uses) → ${step.into.title} — ${step.why}`,
      );
    } else if (step.kind === 'rename') {
      console.log(
        `  rename ${pad(step.source.title, 16)} (${step.source.usage_count} uses) → ${step.newTitle} — ${step.why}`,
      );
    }
  }
  console.log();

  if (!apply) {
    console.log('Re-run with --apply to execute.');
    return;
  }

  for (const step of plan) {
    if (step.kind === 'merge') {
      const res = await api(cfg, `/api/tags/${step.source.id}/merge`, {
        method: 'POST',
        body: JSON.stringify({ into: step.into.id }),
      });
      console.log(`  merged ${step.source.title} → ${step.into.title}: rewired=${res.rewired} deduped=${res.deduped}`);
    } else if (step.kind === 'rename') {
      const res = await api(cfg, `/api/tags/${step.source.id}`, {
        method: 'PUT',
        body: JSON.stringify({ title: step.newTitle }),
      });
      console.log(`  renamed ${step.source.title} → ${res.title}`);
    }
  }

  const after = await api(cfg, '/api/tags');
  console.log(`\nAfter: ${after.tags.length} tags (was ${tags.length}).`);
}

main().catch((err) => {
  console.error(`Error: ${err.message}`);
  process.exit(1);
});
