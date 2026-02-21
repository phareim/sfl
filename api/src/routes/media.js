import { Hono } from 'hono';
import { generateId } from '../lib/nanoid.js';
import { putBinary, deleteObject, mediaKey } from '../lib/r2.js';
import { badRequest, notFound } from '../lib/errors.js';
import { getIdea } from '../db/ideas.js';

const media = new Hono();

/**
 * POST /api/ideas/:id/media
 * Accepts multipart/form-data with a 'file' field.
 */
media.post('/', async (c) => {
  const idea_id = c.req.param('id');
  const idea = await getIdea(c.env.DB, idea_id);
  if (!idea) return notFound('Idea not found');

  const formData = await c.req.formData();
  const file = formData.get('file');
  if (!file || typeof file === 'string') return badRequest('file field required');

  const id = generateId();
  const filename = `${id}_${file.name}`;
  const key = mediaKey(idea_id, filename);
  const bytes = await file.arrayBuffer();

  await putBinary(c.env.R2, key, bytes, file.type);

  await c.env.DB
    .prepare(
      `INSERT INTO media (id, idea_id, r2_key, filename, mime_type, size_bytes, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(id, idea_id, key, file.name, file.type, bytes.byteLength, Date.now())
    .run();

  const row = await c.env.DB.prepare('SELECT * FROM media WHERE id = ?').bind(id).first();
  return c.json({ media: row }, 201);
});

/**
 * POST /api/ideas/:id/media/fetch
 * Worker-side image fetch: takes { url } in JSON body, downloads the image
 * from the URL (no browser CORS restrictions), and stores it in R2.
 */
media.post('/fetch', async (c) => {
  const idea_id = c.req.param('id');
  const idea = await getIdea(c.env.DB, idea_id);
  if (!idea) return notFound('Idea not found');

  let body;
  try {
    body = await c.req.json();
  } catch {
    return badRequest('Invalid JSON');
  }

  const { url } = body;
  if (!url) return badRequest('url is required');

  let res;
  try {
    res = await fetch(url);
  } catch (e) {
    return badRequest(`Could not fetch URL: ${e.message}`);
  }
  if (!res.ok) return badRequest(`Remote returned ${res.status}`);

  const contentType = res.headers.get('content-type') ?? 'application/octet-stream';
  const bytes = await res.arrayBuffer();

  // Derive a filename from the URL path
  const urlPath = new URL(url).pathname;
  const rawName = urlPath.split('/').pop().split('?')[0] || 'image';
  const filename = rawName.includes('.') ? rawName : `${rawName}.jpg`;

  const id = generateId();
  const key = mediaKey(idea_id, `${id}_${filename}`);

  await putBinary(c.env.R2, key, bytes, contentType);

  await c.env.DB
    .prepare(
      `INSERT INTO media (id, idea_id, r2_key, filename, mime_type, size_bytes, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(id, idea_id, key, filename, contentType, bytes.byteLength, Date.now())
    .run();

  const row = await c.env.DB.prepare('SELECT * FROM media WHERE id = ?').bind(id).first();
  return c.json({ media: row }, 201);
});

// Standalone media router for GET signed URL and DELETE
export const mediaStandalone = new Hono();

/**
 * GET /api/media/:id/url
 * Returns the media object proxied through this Worker (R2 doesn't have native presigned URLs
 * accessible from Workers without an additional setup). We stream the R2 object directly.
 */
mediaStandalone.get('/:id/url', async (c) => {
  const id = c.req.param('id');
  const row = await c.env.DB.prepare('SELECT * FROM media WHERE id = ?').bind(id).first();
  if (!row) return notFound('Media not found');

  const obj = await c.env.R2.get(row.r2_key);
  if (!obj) return notFound('Media object not found in storage');

  return new Response(obj.body, {
    headers: {
      'Content-Type': row.mime_type,
      'Content-Disposition': `inline; filename="${row.filename}"`,
      'Cache-Control': 'private, max-age=3600',
    },
  });
});

/**
 * DELETE /api/media/:id
 */
mediaStandalone.delete('/:id', async (c) => {
  const id = c.req.param('id');
  const row = await c.env.DB.prepare('SELECT * FROM media WHERE id = ?').bind(id).first();
  if (!row) return notFound('Media not found');

  await deleteObject(c.env.R2, row.r2_key);
  await c.env.DB.prepare('DELETE FROM media WHERE id = ?').bind(id).run();

  return c.json({ deleted: id });
});

export default media;
