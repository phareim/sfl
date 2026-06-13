import { getIdea, getIdeaNotes, listIdeas, projectBody, searchIdeas, setIdeaBody } from './db/ideas.js';
import { generateId } from './lib/nanoid.js';
import { getJson, putJson } from './lib/r2.js';

/**
 * Auto-tag, auto-connect, and optionally format text for a newly created idea.
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
 * @param {'tags'|'connections'|'markdown'|'summary'|'all'} mode
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
  if (mode === 'markdown' || mode === 'all') tasks.push(formatAsMarkdown(env, idea, data));
  if (mode === 'summary' || mode === 'all') tasks.push(applySummary(env, idea, data));
  await Promise.all(tasks);
}

/**
 * Generate a 1–2 sentence summary when the user didn't write one.
 * "No summary" includes the lazy defaults the capture clients send:
 * the title itself, or the first N chars of the content.
 */
async function applySummary(env, idea, data) {
  try {
    if (idea.type === 'meta') return;

    const content = [data.text, data.description, data.html_excerpt].find(
      (v) => typeof v === 'string' && v.trim().length >= 80,
    );
    if (!content) return;

    const existing = (idea.summary ?? '').trim();
    const isLazyDefault =
      !existing || existing === (idea.title ?? '').trim() || content.startsWith(existing.replace(/…$/, ''));
    if (!isLazyDefault) return;

    const messages = [
      {
        role: 'system',
        content:
          'You write one to two sentence descriptions of saved content. Be concrete and specific about what the content covers. Return only the description, no preamble or quotes.',
      },
      { role: 'user', content: content.slice(0, 4000) },
    ];

    const response = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', { messages, max_tokens: 200 });
    const summary = response?.response?.trim();
    if (!summary || summary.length < 10) return;

    await env.DB.prepare('UPDATE ideas SET summary = ?, updated_at = ? WHERE id = ?')
      .bind(summary.slice(0, 500), Date.now(), idea.id)
      .run();
  } catch {
    // Best-effort
  }
}

/**
 * Suggest up to `count` tags for an idea: existing tags preferred, new tag
 * titles allowed. Tags already on the idea are excluded.
 * Returns [{ id, title, existing }] — id is null for proposed new tags.
 */
export async function suggestTags(env, ideaId, count = 2) {
  const idea = await getIdea(env.DB, ideaId);
  if (!idea || idea.type === 'tag') return [];

  const data = (await getJson(env.R2, idea.r2_key)) ?? {};
  const description = buildIdeaDescription(idea, data);

  const { results: applied } = await env.DB.prepare(
    "SELECT to_id FROM connections WHERE from_id = ? AND label = 'tagged_with'",
  )
    .bind(ideaId)
    .all();
  const appliedIds = new Set(applied.map((r) => r.to_id));

  return suggestTagsForDescription(env, description, count, appliedIds);
}

/**
 * Suggest tags for not-yet-saved content (used by the popup before the idea
 * exists). Builds a description from the provided fields.
 */
export async function suggestTagsForContent(env, { title, url, summary, text, count = 2 } = {}) {
  const parts = [];
  if (title) parts.push(`Title: ${title}`);
  if (summary) parts.push(`Summary: ${summary}`);
  if (url) parts.push(`URL: ${url}`);
  if (text) parts.push(String(text).slice(0, 2000));
  const description = parts.join('\n') || '(no description)';
  return suggestTagsForDescription(env, description, count);
}

async function suggestTagsForDescription(env, description, count = 2, appliedIds = new Set()) {
  const { results: tags } = await env.DB.prepare(
    "SELECT id, title FROM ideas WHERE type = 'tag' ORDER BY title ASC",
  ).all();

  const available = tags.filter((t) => !appliedIds.has(t.id));
  const tagList = available.map((t) => t.title).join(', ') || '(none yet)';

  const messages = [
    {
      role: 'system',
      content: `You suggest tags for saved ideas. Return a JSON array of exactly ${count} tag names (short, lowercase strings) that best describe the idea. Prefer names from the existing tags list; only invent a new name when nothing fits. Return only the JSON array, nothing else.`,
    },
    {
      role: 'user',
      content: `Idea:\n${description}\n\nExisting tags: ${tagList}`,
    },
  ];

  const response = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', { messages });
  const text = response?.response?.trim() ?? '';

  let titles;
  try {
    titles = JSON.parse(text);
  } catch {
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) return [];
    try {
      titles = JSON.parse(match[0]);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(titles)) return [];

  const seen = new Set();
  const suggestions = [];
  for (const raw of titles) {
    if (typeof raw !== 'string') continue;
    const title = raw.trim().replace(/^#/, '');
    if (!title || seen.has(title.toLowerCase())) continue;
    seen.add(title.toLowerCase());

    const existing = tags.find((t) => t.title?.toLowerCase() === title.toLowerCase());
    if (existing && appliedIds.has(existing.id)) continue;
    suggestions.push(
      existing ? { id: existing.id, title: existing.title, existing: true } : { id: null, title, existing: false },
    );
    if (suggestions.length >= count) break;
  }
  return suggestions;
}

async function applyTags(env, idea, description) {
  try {
    const { results: tags } = await env.DB.prepare(
      "SELECT id, title FROM ideas WHERE type = 'tag' ORDER BY title ASC",
    ).all();

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
      await env.DB.prepare(
        `INSERT OR IGNORE INTO connections (id, from_id, to_id, label, created_at)
           VALUES (?, ?, ?, 'tagged_with', ?)`,
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
      await env.DB.prepare(
        `INSERT OR IGNORE INTO connections (id, from_id, to_id, label, created_at)
           VALUES (?, ?, ?, 'related_to', ?)`,
      )
        .bind(generateId(), idea.id, relatedId, now)
        .run();
    }
  } catch {
    // Best-effort
  }
}

async function formatAsMarkdown(env, idea, data) {
  try {
    const text = data.text;
    if (!text || typeof text !== 'string') return;
    // Skip very short texts (nothing to structure) and very long ones (token limits)
    if (text.length < 100 || text.length > 6000) return;

    const messages = [
      {
        role: 'system',
        content:
          'You are a Markdown formatter. Add Markdown syntax to the text below to improve its visual structure. STRICT RULES: do NOT change, add, remove, or reorder any words. Do NOT paraphrase, summarize, or expand anything. Only insert Markdown characters (# ## ### * - ** __ ` etc.) where they genuinely help. Every word in your output must appear in the input, unchanged and in the same order. Return only the formatted text, no preamble.',
      },
      { role: 'user', content: text },
    ];

    const response = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', { messages, max_tokens: 4096 });
    const formatted = response?.response?.trim();
    if (!formatted) return;

    const updated = { ...data, text: formatted, markdown: true };
    await putJson(env.R2, idea.r2_key, updated);

    // Re-project body so FTS picks up the formatted text.
    let notesRow;
    if (idea.type === 'note') {
      const notes = await getIdeaNotes(env.DB, idea.id);
      notesRow = notes[0];
    }
    const body = projectBody(idea.type, updated, notesRow);
    await setIdeaBody(env.DB, idea.id, body);
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
