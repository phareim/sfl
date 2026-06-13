import { Hono } from 'hono';
import { getAllConnections } from '../db/connections.js';
import {
  deleteIdea,
  getIdea,
  getIdeaByUrl,
  getIdeaConnections,
  getIdeaMedia,
  getIdeaNotes,
  insertIdea,
  listIdeas,
  projectBody,
  searchIdeas,
  setIdeaBody,
  updateIdea,
} from '../db/ideas.js';
import { enrichIdea, runEnrichment, suggestTags, suggestTagsForContent } from '../enrichment.js';
import { badRequest, notFound, serverError } from '../lib/errors.js';
import { generateId } from '../lib/nanoid.js';
import { dataKey, deleteObject, getJson, putJson } from '../lib/r2.js';

const ideas = new Hono();

// GET /api/ideas/search?q=term  — must be before /:id
ideas.get('/search', async (c) => {
  const q = c.req.query('q');
  if (!q) return badRequest('Missing q parameter');

  const limit = c.req.query('limit');
  const rows = await searchIdeas(c.env.DB, q, { limit });
  return c.json({ ideas: rows });
});

// GET /api/ideas
ideas.get('/', async (c) => {
  const { type, tag, project, limit, cursor } = c.req.query();
  const result = await listIdeas(c.env.DB, { type, tag, url: project, limit, cursor });
  return c.json(result);
});

// POST /api/ideas
ideas.post('/', async (c) => {
  let body;
  try {
    body = await c.req.json();
  } catch {
    return badRequest('Invalid JSON');
  }

  const { type, title, url, summary, data } = body;
  if (!type) return badRequest('type is required');

  // Return existing idea if URL already captured as the same type
  if (url) {
    const existing = await getIdeaByUrl(c.env.DB, url, type);
    if (existing) {
      const [existingData, connections, notes, media] = await Promise.all([
        getJson(c.env.R2, existing.r2_key),
        getIdeaConnections(c.env.DB, existing.id),
        getIdeaNotes(c.env.DB, existing.id),
        getIdeaMedia(c.env.DB, existing.id),
      ]);
      return c.json({ idea: existing, data: existingData ?? {}, connections, notes, media, existing: true });
    }
  }

  const id = generateId();
  const now = Date.now();
  const r2_key = dataKey(id);

  // Write content blob to R2
  await putJson(c.env.R2, r2_key, data ?? {});

  // For meta ideas, store project URL in D1 url for efficient filtering
  const resolvedUrl = url ?? (type === 'meta' ? (data?.project ?? null) : null);

  // Note ideas store body in the notes table; at POST time there's no notes
  // row yet, so this is "" unless a body field was inlined into `data`.
  const projectedBody = projectBody(type, data ?? {});

  // Write metadata row to D1
  await insertIdea(c.env.DB, {
    id,
    type,
    title: title ?? null,
    url: resolvedUrl,
    summary: summary ?? null,
    body: projectedBody,
    r2_key,
    created_at: now,
    updated_at: now,
  });

  const idea = await getIdea(c.env.DB, id);

  // Pages: pull the full article first so enrichment summarizes the real
  // content, not just the meta description. Everything else enriches directly.
  if (type === 'page' && resolvedUrl) {
    c.executionCtx.waitUntil(fetchThenEnrich(c.env, id));
  } else {
    c.executionCtx.waitUntil(enrichIdea(c.env, id));
  }

  return c.json({ idea, data: data ?? {} }, 201);
});

// POST /api/ideas/suggest-tags { title?, url?, text?, summary?, count? }
// Ad-hoc suggestions for not-yet-saved content (popup). Must be declared
// before /:id routes so "suggest-tags" isn't captured as an :id.
ideas.post('/suggest-tags', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const count = Math.min(Math.max(Number(body?.count) || 2, 1), 5);
  const suggestions = await suggestTagsForContent(c.env, { ...body, count });
  return c.json({ suggestions });
});

// GET /api/ideas/:id
ideas.get('/:id', async (c) => {
  const id = c.req.param('id');
  const idea = await getIdea(c.env.DB, id);
  if (!idea) return notFound('Idea not found');

  const [data, connections, notes, media] = await Promise.all([
    getJson(c.env.R2, idea.r2_key),
    getIdeaConnections(c.env.DB, id),
    getIdeaNotes(c.env.DB, id),
    getIdeaMedia(c.env.DB, id),
  ]);

  return c.json({ idea, data: data ?? {}, connections, notes, media });
});

// PUT /api/ideas/:id
ideas.put('/:id', async (c) => {
  const id = c.req.param('id');
  const existing = await getIdea(c.env.DB, id);
  if (!existing) return notFound('Idea not found');

  let body;
  try {
    body = await c.req.json();
  } catch {
    return badRequest('Invalid JSON');
  }

  const { title, url, summary, data } = body;
  const now = Date.now();

  // Update R2 blob if data provided
  if (data !== undefined) {
    await putJson(c.env.R2, existing.r2_key, data);
  }

  // Re-project body when the blob (or, for notes, the joined notes row)
  // might affect FTS. For notes, the body lives in a joined notes row, so we
  // re-fetch.
  let projectedBody;
  if (data !== undefined) {
    let notesRow;
    if (existing.type === 'note') {
      const notes = await getIdeaNotes(c.env.DB, id);
      notesRow = notes[0];
    }
    projectedBody = projectBody(existing.type, data, notesRow);
  }

  // Update D1 row
  await updateIdea(c.env.DB, id, {
    title: title !== undefined ? title : existing.title,
    url: url !== undefined ? url : existing.url,
    summary: summary !== undefined ? summary : existing.summary,
    body: projectedBody,
    updated_at: now,
  });

  const idea = await getIdea(c.env.DB, id);
  const blobData = await getJson(c.env.R2, idea.r2_key);
  return c.json({ idea, data: blobData ?? {} });
});

// POST /api/ideas/:id/enrich?mode=tags|connections|all
ideas.post('/:id/enrich', async (c) => {
  const id = c.req.param('id');
  const idea = await getIdea(c.env.DB, id);
  if (!idea) return notFound('Idea not found');

  const mode = c.req.query('mode') ?? 'all';
  if (!['tags', 'connections', 'markdown', 'summary', 'all'].includes(mode)) {
    return badRequest('mode must be tags, connections, markdown, summary, or all');
  }

  await runEnrichment(c.env, id, mode);

  const [connections, data] = await Promise.all([getIdeaConnections(c.env.DB, id), getJson(c.env.R2, idea.r2_key)]);
  return c.json({ connections, data: data ?? {} });
});

// POST /api/ideas/:id/suggest-tags  { count? } → { suggestions: [{ id, title, existing }] }
ideas.post('/:id/suggest-tags', async (c) => {
  const id = c.req.param('id');
  const idea = await getIdea(c.env.DB, id);
  if (!idea) return notFound('Idea not found');

  const body = await c.req.json().catch(() => ({}));
  const count = Math.min(Math.max(Number(body?.count) || 2, 1), 5);

  const suggestions = await suggestTags(c.env, id, count);
  return c.json({ suggestions });
});

// POST /api/ideas/:id/fetch-content
ideas.post('/:id/fetch-content', async (c) => {
  const id = c.req.param('id');
  const idea = await getIdea(c.env.DB, id);
  if (!idea) return notFound('Idea not found');
  if (idea.type !== 'page') return badRequest('Only page ideas support content fetching');
  if (!idea.url) return badRequest('Idea has no URL');

  const updated = await fetchAndStoreArticle(c.env, idea);
  return c.json({ data: updated });
});

/**
 * Fetch a page's article text, store it on the R2 blob, and re-project the
 * FTS body so the article becomes searchable. Returns the updated blob.
 */
async function fetchAndStoreArticle(env, idea) {
  const existing = (await getJson(env.R2, idea.r2_key)) ?? {};
  const text = await extractArticleText(idea.url);

  const updated = text ? { ...existing, text } : { ...existing, article: false };
  await putJson(env.R2, idea.r2_key, updated);

  if (text) {
    await setIdeaBody(env.DB, idea.id, projectBody(idea.type, updated));
  }
  return updated;
}

/**
 * For a freshly saved page: fetch the full article (best-effort) and only
 * then run enrichment, so the auto-summary and tagging see the whole article
 * rather than just the meta description.
 */
async function fetchThenEnrich(env, ideaId) {
  try {
    const idea = await getIdea(env.DB, ideaId);
    if (idea?.type === 'page' && idea.url) {
      await fetchAndStoreArticle(env, idea);
    }
  } catch {
    // Best-effort: a failed fetch still leaves the meta-description summary.
  }
  await enrichIdea(env, ideaId);
}

async function extractArticleText(url) {
  let response;
  try {
    response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SFL/1.0)' },
      redirect: 'follow',
    });
  } catch {
    return null;
  }

  if (!response.ok) return null;
  if (!(response.headers.get('content-type') ?? '').includes('text/html')) return null;

  let skipDepth = 0;
  let currentPara = null;
  const paragraphs = [];

  await new HTMLRewriter()
    .on('nav, header, footer, aside, script, style, noscript', {
      element(el) {
        skipDepth++;
        el.onEndTag(() => {
          skipDepth--;
        });
      },
    })
    .on('p', {
      element(el) {
        if (skipDepth > 0) return;
        currentPara = '';
        el.onEndTag(() => {
          if (currentPara !== null && currentPara.trim().split(/\s+/).length >= 8) {
            paragraphs.push(currentPara.trim());
          }
          currentPara = null;
        });
      },
      text(chunk) {
        if (currentPara !== null && skipDepth === 0) {
          currentPara += chunk.text;
        }
      },
    })
    .transform(response)
    .arrayBuffer();

  const joined = paragraphs.join('\n\n');
  if (paragraphs.length < 3 || joined.length < 500) return null;
  return joined;
}

// DELETE /api/ideas/:id
ideas.delete('/:id', async (c) => {
  const id = c.req.param('id');
  const existing = await getIdea(c.env.DB, id);
  if (!existing) return notFound('Idea not found');

  // Delete all media from R2
  const { results: mediaRows } = await c.env.DB.prepare('SELECT r2_key FROM media WHERE idea_id = ?').bind(id).all();

  await Promise.all([
    deleteObject(c.env.R2, existing.r2_key),
    ...mediaRows.map((m) => deleteObject(c.env.R2, m.r2_key)),
  ]);

  // D1 CASCADE handles connections/notes/media rows
  await deleteIdea(c.env.DB, id);

  return c.json({ deleted: id });
});

export default ideas;
