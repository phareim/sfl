import { Hono } from 'hono';
import { generateId } from '../lib/nanoid.js';
import { putJson, getJson, deleteObject, dataKey } from '../lib/r2.js';
import { badRequest, notFound, serverError } from '../lib/errors.js';
import {
  insertIdea,
  getIdea,
  listIdeas,
  updateIdea,
  deleteIdea,
  searchIdeas,
  getIdeaConnections,
  getIdeaNotes,
  getIdeaMedia,
} from '../db/ideas.js';
import { getAllConnections } from '../db/connections.js';

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

  const id = generateId();
  const now = Date.now();
  const r2_key = dataKey(id);

  // Write content blob to R2
  await putJson(c.env.R2, r2_key, data ?? {});

  // For meta ideas, store project URL in D1 url for efficient filtering
  const resolvedUrl = url ?? (type === 'meta' ? (data?.project ?? null) : null);

  // Write metadata row to D1
  await insertIdea(c.env.DB, {
    id,
    type,
    title: title ?? null,
    url: resolvedUrl,
    summary: summary ?? null,
    r2_key,
    created_at: now,
    updated_at: now,
  });

  const idea = await getIdea(c.env.DB, id);
  return c.json({ idea, data: data ?? {} }, 201);
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

  // Update D1 row
  await updateIdea(c.env.DB, id, {
    title: title !== undefined ? title : existing.title,
    url: url !== undefined ? url : existing.url,
    summary: summary !== undefined ? summary : existing.summary,
    updated_at: now,
  });

  const idea = await getIdea(c.env.DB, id);
  const blobData = await getJson(c.env.R2, idea.r2_key);
  return c.json({ idea, data: blobData ?? {} });
});

// POST /api/ideas/:id/fetch-content
ideas.post('/:id/fetch-content', async (c) => {
  const id = c.req.param('id');
  const idea = await getIdea(c.env.DB, id);
  if (!idea) return notFound('Idea not found');
  if (idea.type !== 'page') return badRequest('Only page ideas support content fetching');
  if (!idea.url) return badRequest('Idea has no URL');

  const existing = (await getJson(c.env.R2, idea.r2_key)) ?? {};
  const text = await extractArticleText(idea.url);

  const updated = text ? { ...existing, text } : { ...existing, article: false };
  await putJson(c.env.R2, idea.r2_key, updated);
  return c.json({ data: updated });
});

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
        el.onEndTag(() => { skipDepth--; });
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
  const { results: mediaRows } = await c.env.DB
    .prepare('SELECT r2_key FROM media WHERE idea_id = ?')
    .bind(id)
    .all();

  await Promise.all([
    deleteObject(c.env.R2, existing.r2_key),
    ...mediaRows.map((m) => deleteObject(c.env.R2, m.r2_key)),
  ]);

  // D1 CASCADE handles connections/notes/media rows
  await deleteIdea(c.env.DB, id);

  return c.json({ deleted: id });
});

export default ideas;
