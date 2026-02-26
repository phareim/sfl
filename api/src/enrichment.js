import { getIdea } from './db/ideas.js';
import { generateId } from './lib/nanoid.js';
import { getJson } from './lib/r2.js';

/**
 * Auto-tag a newly created idea using Workers AI.
 * Called via ctx.waitUntil() — errors are swallowed so they never affect the response.
 */
export async function enrichIdea(env, ideaId) {
  try {
    const idea = await getIdea(env.DB, ideaId);
    if (!idea) return;

    // No point tagging a tag
    if (idea.type === 'tag') return;

    const { results: tags } = await env.DB
      .prepare("SELECT id, title FROM ideas WHERE type = 'tag' ORDER BY title ASC")
      .all();

    if (tags.length === 0) return;

    const data = (await getJson(env.R2, idea.r2_key)) ?? {};

    const ideaDescription = buildIdeaDescription(idea, data);
    const tagList = tags.map((t) => `${t.id}: ${t.title}`).join('\n');

    const messages = [
      {
        role: 'system',
        content:
          'You are a tagging assistant. Given an idea and a list of available tags, return a JSON array of tag IDs that best describe the idea. Return only the JSON array, nothing else. If no tags fit, return [].',
      },
      {
        role: 'user',
        content: `Idea:\n${ideaDescription}\n\nAvailable tags:\n${tagList}`,
      },
    ];

    const response = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', { messages });
    const text = response?.response?.trim() ?? '';

    let tagIds;
    try {
      tagIds = JSON.parse(text);
    } catch {
      // Try to extract a JSON array from the response if model added surrounding text
      const match = text.match(/\[[\s\S]*\]/);
      if (!match) return;
      tagIds = JSON.parse(match[0]);
    }

    if (!Array.isArray(tagIds) || tagIds.length === 0) return;

    const validTagIds = new Set(tags.map((t) => t.id));
    const now = Date.now();

    for (const tagId of tagIds) {
      if (!validTagIds.has(tagId)) continue;

      await env.DB
        .prepare(
          `INSERT OR IGNORE INTO connections (id, from_id, to_id, label, created_at)
           VALUES (?, ?, ?, 'tagged_with', ?)`
        )
        .bind(generateId(), ideaId, tagId, now)
        .run();
    }
  } catch {
    // Best-effort: never let enrichment errors surface
  }
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
