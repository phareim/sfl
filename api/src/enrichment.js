import { getIdea, searchIdeas, listIdeas } from './db/ideas.js';
import { generateId } from './lib/nanoid.js';
import { getJson } from './lib/r2.js';

/**
 * Auto-tag and auto-connect a newly created idea using Workers AI.
 * Called via ctx.waitUntil() — errors are swallowed so they never affect the response.
 */
export async function enrichIdea(env, ideaId) {
  try {
    await runEnrichment(env, ideaId, 'all');
  } catch {
    // Best-effort: never surface enrichment errors
  }
}

/**
 * Run enrichment for an idea with a specific mode.
 * Throws on error — callers are responsible for handling.
 *
 * @param {'tags'|'connections'|'all'} mode
 */
export async function runEnrichment(env, ideaId, mode = 'all') {
  const idea = await getIdea(env.DB, ideaId);
  if (!idea) return;
  if (idea.type === 'tag') return;

  const data = (await getJson(env.R2, idea.r2_key)) ?? {};
  const description = buildIdeaDescription(idea, data);

  const tasks = [];
  if (mode === 'tags' || mode === 'all') tasks.push(applyTags(env, idea, description));
  if (mode === 'connections' || mode === 'all') tasks.push(applyConnections(env, idea, description));
  await Promise.all(tasks);
}

async function applyTags(env, idea, description) {
  try {
    const { results: tags } = await env.DB
      .prepare("SELECT id, title FROM ideas WHERE type = 'tag' ORDER BY title ASC")
      .all();

    if (tags.length === 0) return;

    const tagList = tags.map((t) => `${t.id}: ${t.title}`).join('\n');
    const messages = [
      {
        role: 'system',
        content:
          'You are a tagging assistant. Given an idea and a list of available tags, return a JSON array of tag IDs that best describe the idea. Return only the JSON array, nothing else. If no tags fit, return [].',
      },
      {
        role: 'user',
        content: `Idea:\n${description}\n\nAvailable tags:\n${tagList}`,
      },
    ];

    const ids = await callAI(env, messages, new Set(tags.map((t) => t.id)));
    if (ids.length === 0) return;

    const now = Date.now();
    for (const tagId of ids) {
      await env.DB
        .prepare(
          `INSERT OR IGNORE INTO connections (id, from_id, to_id, label, created_at)
           VALUES (?, ?, ?, 'tagged_with', ?)`
        )
        .bind(generateId(), idea.id, tagId, now)
        .run();
    }
  } catch {
    // Best-effort
  }
}

async function applyConnections(env, idea, description) {
  try {
    const candidates = await findCandidates(env, idea);
    if (candidates.length === 0) return;

    const candidateList = candidates
      .map((c) => {
        const line = `${c.id}: ${c.title ?? '(untitled)'}`;
        return c.summary ? `${line} — ${c.summary.slice(0, 120)}` : line;
      })
      .join('\n');

    const messages = [
      {
        role: 'system',
        content:
          'You are a knowledge graph assistant. Given a new idea and a list of existing ideas, return a JSON array of IDs of ideas that are meaningfully related to the new idea. Be selective — only include genuinely related ideas, not superficial matches. Return only the JSON array, nothing else. If nothing is related, return [].',
      },
      {
        role: 'user',
        content: `New idea:\n${description}\n\nExisting ideas:\n${candidateList}`,
      },
    ];

    const ids = await callAI(env, messages, new Set(candidates.map((c) => c.id)));
    if (ids.length === 0) return;

    const now = Date.now();
    for (const relatedId of ids) {
      await env.DB
        .prepare(
          `INSERT OR IGNORE INTO connections (id, from_id, to_id, label, created_at)
           VALUES (?, ?, ?, 'related_to', ?)`
        )
        .bind(generateId(), idea.id, relatedId, now)
        .run();
    }
  } catch {
    // Best-effort
  }
}

async function findCandidates(env, idea) {
  const queryTerms = [idea.title, idea.summary].filter(Boolean).join(' ').slice(0, 200);

  let candidates = [];
  if (queryTerms) {
    try {
      candidates = await searchIdeas(env.DB, queryTerms, { limit: 25 });
    } catch {
      // FTS can fail on certain inputs (special chars); fall through
    }
  }

  // Fall back to recent ideas if search yields nothing
  if (candidates.length === 0) {
    const { ideas } = await listIdeas(env.DB, { limit: 25 });
    candidates = ideas;
  }

  return candidates.filter((c) => c.id !== idea.id && c.type !== 'tag');
}

async function callAI(env, messages, validIds) {
  const response = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', { messages });
  const text = response?.response?.trim() ?? '';

  let ids;
  try {
    ids = JSON.parse(text);
  } catch {
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) return [];
    ids = JSON.parse(match[0]);
  }

  if (!Array.isArray(ids)) return [];
  return ids.filter((id) => validIds.has(id));
}

function buildIdeaDescription(idea, data) {
  const parts = [];
  if (idea.title) parts.push(`Title: ${idea.title}`);
  if (idea.summary) parts.push(`Summary: ${idea.summary}`);
  if (idea.url) parts.push(`URL: ${idea.url}`);

  const skipKeys = new Set(['text']); // skip long full-text content
  for (const [k, v] of Object.entries(data)) {
    if (skipKeys.has(k) || v == null || v === '') continue;
    if (typeof v === 'string' || typeof v === 'number') {
      parts.push(`${k}: ${v}`);
    }
  }

  return parts.join('\n') || '(no description)';
}
