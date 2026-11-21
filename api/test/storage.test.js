import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import app from '../src/app.js';
import { createMockEnv } from './helpers.js';
import { createSqliteD1, sqliteAvailable } from './sqlite-d1.js';

// Tags, connections, the graph and media on the real schema, where UNIQUE, foreign keys and D1's limit of 100
// bound parameters decide the outcome.

let env;
const executionCtx = { waitUntil: () => {}, passThroughOnException: () => {} };

function req(path, { method = 'GET', body, form } = {}) {
  const headers = { Authorization: 'Bearer test-api-key' };
  const init = { method, headers };
  if (form) {
    init.body = form;
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  return app.request(path, init, env, executionCtx);
}

async function save(body) {
  const res = await req('/api/ideas', { method: 'POST', body });
  expect(res.status).toBe(201);
  return (await res.json()).idea;
}

function tag(idea, tagIdea) {
  return req('/api/connections', {
    method: 'POST',
    body: { from_id: idea.id, to_id: tagIdea.id, label: 'tagged_with' },
  });
}

describe.skipIf(!sqliteAvailable)('on the real schema', () => {
  beforeEach(() => {
    env = createMockEnv({ DB: createSqliteD1() });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('connections', () => {
    it('answers a second identical connection with 400, which the capture apps read as "already tagged"', async () => {
      const reading = await save({ type: 'tag', title: 'reading' });
      const idea = await save({ type: 'note', title: 'a note' });
      expect((await tag(idea, reading)).status).toBe(201);
      const again = await tag(idea, reading);
      expect(again.status).toBe(400);
      expect((await again.json()).error).toBe('Connection already exists');
    });

    it('answers 404 for an idea that does not exist and 400 without both ends', async () => {
      const idea = await save({ type: 'note', title: 'a note' });
      expect(
        (await req('/api/connections', { method: 'POST', body: { from_id: idea.id, to_id: 'gone' } })).status,
      ).toBe(404);
      expect((await req('/api/connections', { method: 'POST', body: { from_id: idea.id } })).status).toBe(400);
    });
  });

  describe('tags', () => {
    it('lists tags with their usage, most used first', async () => {
      const reading = await save({ type: 'tag', title: 'reading' });
      await save({ type: 'tag', title: 'unused' });
      await tag(await save({ type: 'note', title: 'one' }), reading);
      await tag(await save({ type: 'note', title: 'two' }), reading);

      const { tags } = await (await req('/api/tags')).json();
      expect(tags.map((t) => [t.title, t.usage_count])).toEqual([
        ['reading', 2],
        ['unused', 0],
      ]);
    });

    it('merges one tag into another, dropping the edge an idea would otherwise have twice', async () => {
      const source = await save({ type: 'tag', title: 'books' });
      const target = await save({ type: 'tag', title: 'reading' });
      const both = await save({ type: 'note', title: 'has both' });
      const one = await save({ type: 'note', title: 'has the source only' });
      await tag(both, source);
      await tag(both, target);
      await tag(one, source);

      const res = await req(`/api/tags/${source.id}/merge`, { method: 'POST', body: { into: target.id } });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ merged: source.id, into: target.id, rewired: 1, deduped: 1 });

      const { tags } = await (await req('/api/tags')).json();
      expect(tags.map((t) => [t.title, t.usage_count])).toEqual([['reading', 2]]);
    });

    it('refuses to rename a tag onto a title another tag has', async () => {
      const a = await save({ type: 'tag', title: 'books' });
      await save({ type: 'tag', title: 'reading' });
      expect((await req(`/api/tags/${a.id}`, { method: 'PUT', body: { title: 'reading' } })).status).toBe(409);
      expect((await req(`/api/tags/${a.id}`, { method: 'PUT', body: { title: 'novels' } })).status).toBe(200);
    });
  });

  describe('graph', () => {
    it('answers with every idea as a node and every connection as an edge', async () => {
      const reading = await save({ type: 'tag', title: 'reading' });
      const idea = await save({ type: 'note', title: 'a note' });
      await tag(idea, reading);

      const { nodes, edges } = await (await req('/api/graph')).json();
      expect(nodes.map((n) => n.id).sort()).toEqual([idea.id, reading.id].sort());
      expect(edges).toHaveLength(1);
      expect(edges[0]).toMatchObject({ from_id: idea.id, to_id: reading.id, label: 'tagged_with' });
    });

    it('answers with the neighbours of a tag that more than 100 ideas carry', async () => {
      const reading = await save({ type: 'tag', title: 'reading' });
      const db = env.DB._db;
      const idea = db.prepare(
        "INSERT INTO ideas (id, type, title, created_at, updated_at) VALUES (?, 'note', ?, ?, ?)",
      );
      const edge = db.prepare(
        "INSERT INTO connections (id, from_id, to_id, label, created_at) VALUES (?, ?, ?, 'tagged_with', ?)",
      );
      for (let i = 0; i < 150; i++) {
        idea.run(`n${i}`, `note ${i}`, i, i);
        edge.run(`c${i}`, `n${i}`, reading.id, i);
      }

      const res = await req(`/api/graph/${reading.id}/neighbors`);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.idea.id).toBe(reading.id);
      expect(json.connections).toHaveLength(150);
      expect(json.neighbors).toHaveLength(150);
      expect(json.neighbors[0]).toEqual({
        id: expect.any(String),
        type: 'note',
        title: expect.any(String),
        url: null,
      });
    });
  });

  describe('media', () => {
    const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

    it('stores an uploaded file, lists it on the idea, streams it back and deletes it', async () => {
      const idea = await save({ type: 'image', title: 'a picture' });
      const form = new FormData();
      form.append('file', new File([PNG], 'Skjermbilde 📷.png', { type: 'image/png' }));

      const up = await req(`/api/ideas/${idea.id}/media`, { method: 'POST', form });
      expect(up.status).toBe(201);
      const { media } = await up.json();
      expect(media).toMatchObject({
        idea_id: idea.id,
        filename: 'Skjermbilde 📷.png',
        mime_type: 'image/png',
        size_bytes: 8,
      });

      const listed = await (await req(`/api/ideas/${idea.id}`)).json();
      expect(listed.media.map((m) => m.id)).toEqual([media.id]);

      const stored = await env.R2.get(media.r2_key);
      expect(new Uint8Array(stored.body)).toEqual(PNG);

      expect((await req(`/api/media/${media.id}`, { method: 'DELETE' })).status).toBe(200);
      expect(await env.R2.get(media.r2_key)).toBeNull();
      expect((await req(`/api/media/${media.id}/url`)).status).toBe(404);
    });

    it('streams a stored file with its content type', async () => {
      const idea = await save({ type: 'image', title: 'a picture' });
      const form = new FormData();
      form.append('file', new File([PNG], 'a.png', { type: 'image/png' }));
      const { media } = await (await req(`/api/ideas/${idea.id}/media`, { method: 'POST', form })).json();

      const res = await req(`/api/media/${media.id}/url`);
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toBe('image/png');
      expect(new Uint8Array(await res.arrayBuffer())).toEqual(PNG);
    });

    it('fetches an image by url on the Worker and stores it', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => new Response(PNG, { headers: { 'content-type': 'image/png' } })),
      );
      const idea = await save({ type: 'image', title: 'a picture' });

      const res = await req(`/api/ideas/${idea.id}/media/fetch`, {
        method: 'POST',
        body: { url: 'https://example.com/pictures/owl?size=large' },
      });
      expect(res.status).toBe(201);
      const { media } = await res.json();
      expect(media).toMatchObject({ filename: 'owl.jpg', mime_type: 'image/png', size_bytes: 8 });
    });

    it('answers 400 when the remote refuses, and 404 for an idea that does not exist', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => new Response('no', { status: 403 })),
      );
      const idea = await save({ type: 'image', title: 'a picture' });
      const refused = await req(`/api/ideas/${idea.id}/media/fetch`, {
        method: 'POST',
        body: { url: 'https://example.com/a.png' },
      });
      expect(refused.status).toBe(400);
      expect(
        (await req('/api/ideas/gone/media/fetch', { method: 'POST', body: { url: 'https://example.com/a.png' } }))
          .status,
      ).toBe(404);
    });

    it('deleting an idea removes its blob and its media from storage', async () => {
      const idea = await save({ type: 'image', title: 'a picture', data: { caption: 'x' } });
      const form = new FormData();
      form.append('file', new File([PNG], 'a.png', { type: 'image/png' }));
      const { media } = await (await req(`/api/ideas/${idea.id}/media`, { method: 'POST', form })).json();

      expect((await req(`/api/ideas/${idea.id}`, { method: 'DELETE' })).status).toBe(200);
      expect(await env.R2.get(media.r2_key)).toBeNull();
      expect(await env.R2.get(idea.r2_key)).toBeNull();
      expect(env.DB._db.prepare('SELECT COUNT(*) AS n FROM media').get().n).toBe(0);
    });
  });
});
