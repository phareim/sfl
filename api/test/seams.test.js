import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import app from '../src/app.js';
import { createMockEnv } from './helpers.js';
import { createSqliteD1, sqliteAvailable } from './sqlite-d1.js';

// What the neighbouring systems send and read, as AGENTS.md and the clients in this repo state it, run against
// the real schema. The payloads are written by hand from chrome-extension/, ios/, macos/ and web/src/routes/share.

let env;
const executionCtx = { waitUntil: () => {}, passThroughOnException: () => {} };

function req(path, { method = 'GET', body, token = 'test-api-key' } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const init = { method, headers };
  if (body !== undefined) init.body = JSON.stringify(body);
  return app.request(path, init, env, executionCtx);
}

async function save(body) {
  const res = await req('/api/ideas', { method: 'POST', body });
  expect(res.status).toBe(201);
  return (await res.json()).idea;
}

// Ideas with created_at set by hand, newest last, so paging is deterministic.
function seed(rows) {
  const insert = env.DB._db.prepare(
    'INSERT INTO ideas (id, type, title, url, summary, body, r2_key, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
  );
  for (const r of rows) {
    insert.run(r.id, r.type ?? 'page', r.title ?? r.id, r.url ?? null, null, r.body ?? '', null, r.at, r.at);
  }
}

describe.skipIf(!sqliteAvailable)('seams', () => {
  beforeEach(() => {
    env = createMockEnv({ DB: createSqliteD1() });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, headers: { get: () => null } })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('POST /api/ideas accepts what the capture clients send', () => {
    const payloads = {
      'extension: page': {
        type: 'page',
        title: 'An article',
        url: 'https://example.com/article',
        summary: 'A description',
        data: { url: 'https://example.com/article', title: 'An article', description: 'A description', image: null },
      },
      'extension: quote without a top-level url': {
        type: 'quote',
        title: 'The selected text',
        summary: 'The selected text',
        data: { text: 'The selected text', source_url: 'https://example.com/article', page_title: 'An article' },
      },
      'extension: tweet': {
        type: 'tweet',
        title: 'Post text',
        url: 'https://x.com/someone/status/123',
        summary: 'Post text',
        data: { url: 'https://x.com/someone/status/123', text: 'Post text', author: '@someone', platform: 'twitter' },
      },
      'extension: video': {
        type: 'video',
        title: 'A talk',
        url: 'https://www.youtube.com/watch?v=abc',
        summary: 'A talk',
        data: { url: 'https://www.youtube.com/watch?v=abc', platform: 'youtube', video_id: 'abc', description: null },
      },
      'extension: image': {
        type: 'image',
        title: 'Image from a page',
        url: 'https://example.com/a.png',
        summary: 'a page',
        data: { source_url: 'https://example.com/a.png', page_url: 'https://example.com', caption: 'a page' },
      },
      'extension and macOS: meta': {
        type: 'meta',
        title: 'A task',
        url: 'https://github.com/owner/repo',
        data: {
          project: 'https://github.com/owner/repo',
          priority: 'B',
          status: 'draft',
          implementation_details: null,
        },
      },
      'phone apps: nulls for what is left out': {
        type: 'note',
        title: null,
        url: null,
        summary: 'text',
        data: { text: 'text' },
      },
      'phone apps: a tag': { type: 'tag', title: 'reading' },
      'web share target: a note': {
        type: 'note',
        title: null,
        url: null,
        summary: 'shared',
        data: { content: 'shared' },
      },
      'web share target: a page': {
        type: 'page',
        title: 'Shared',
        url: 'https://example.com/shared',
        summary: 'Shared',
        data: { url: 'https://example.com/shared', selected_text: '' },
      },
      'a type nobody has used yet': { type: 'recipe', title: 'Bread', data: { flour: '500 g' } },
    };

    for (const [name, payload] of Object.entries(payloads)) {
      it(name, async () => {
        const res = await req('/api/ideas', { method: 'POST', body: payload });
        expect(res.status).toBe(201);
        const { idea, data } = await res.json();
        expect(idea).toMatchObject({ type: payload.type, title: payload.title ?? null });
        expect(typeof idea.id).toBe('string');
        expect(typeof idea.created_at).toBe('number');
        expect(data).toEqual(payload.data ?? {});

        // toMatchObject: a page's background article fetch may already have added to the blob.
        const read = await (await req(`/api/ideas/${idea.id}`)).json();
        expect(read.idea.id).toBe(idea.id);
        expect(read.data).toMatchObject(payload.data ?? {});
        expect(read).toMatchObject({ connections: [], notes: [], media: [] });
      });
    }

    it('files a meta idea under its project when it has no url of its own', async () => {
      const idea = await save({ type: 'meta', title: 'A task', data: { project: 'https://github.com/owner/repo' } });
      expect(idea.url).toBe('https://github.com/owner/repo');
      const { ideas } = await (
        await req(`/api/ideas?type=meta&project=${encodeURIComponent('https://github.com/owner/repo')}`)
      ).json();
      expect(ideas.map((i) => i.id)).toEqual([idea.id]);
    });

    it('answers a second save of the same url and type with the first idea and existing: true', async () => {
      const first = await save({ type: 'page', title: 'First', url: 'https://example.com/a' });
      const res = await req('/api/ideas', {
        method: 'POST',
        body: { type: 'page', title: 'Second', url: 'https://example.com/a' },
      });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.existing).toBe(true);
      expect(json.idea.id).toBe(first.id);
    });

    it('answers 400 for a body that is JSON but not an object', async () => {
      for (const body of [null, 5, 'note', ['note']]) {
        const res = await req('/api/ideas', { method: 'POST', body });
        expect(res.status).toBe(400);
      }
    });
  });

  it('answers a JSON body of null with 400 on every route that reads one, and changes nothing', async () => {
    const idea = await save({ type: 'note', title: 'kept', data: { text: 'kept' } });
    const noteRes = await req(`/api/ideas/${idea.id}/notes`, { method: 'POST', body: { body: 'a note' } });
    const { note } = await noteRes.json();

    const routes = [
      ['POST', '/api/connections'],
      ['POST', `/api/ideas/${idea.id}/notes`],
      ['PUT', `/api/notes/${note.id}`],
      ['POST', `/api/ideas/${idea.id}/media/fetch`],
    ];
    for (const [method, path] of routes) {
      expect((await req(path, { method, body: null })).status, `${method} ${path}`).toBe(400);
    }

    // PUT /api/ideas/:id takes every field as optional, so null is an update that changes nothing.
    const put = await req(`/api/ideas/${idea.id}`, { method: 'PUT', body: null });
    expect(put.status).toBe(200);
    expect(await put.json()).toMatchObject({ idea: { title: 'kept' }, data: { text: 'kept' } });
  });

  describe('GET /api/ideas, as the articles pipeline and the workbook read it', () => {
    it('lists pages newest first with the fields the neighbours read, and pages through all of them', async () => {
      seed([
        { id: 'p1', at: 1000, url: 'https://example.com/1' },
        { id: 'n1', at: 1500, type: 'note' },
        { id: 'p2', at: 2000, url: 'https://example.com/2' },
        { id: 'p3', at: 3000, url: 'https://example.com/3' },
      ]);

      const first = await (await req('/api/ideas?type=page&limit=2')).json();
      expect(first.ideas.map((i) => i.id)).toEqual(['p3', 'p2']);
      expect(first.ideas[0]).toMatchObject({
        id: 'p3',
        type: 'page',
        title: 'p3',
        url: 'https://example.com/3',
        summary: null,
        created_at: 3000,
      });
      expect(first.nextCursor).toBe(2000);

      const second = await (await req(`/api/ideas?type=page&limit=2&cursor=${first.nextCursor}`)).json();
      expect(second.ideas.map((i) => i.id)).toEqual(['p1']);
      expect(second.nextCursor).toBeNull();
    });

    it('caps limit at 100 and reads a limit that is no positive whole number as the default 20', async () => {
      seed(Array.from({ length: 130 }, (_, i) => ({ id: `i${i}`, at: 1000 + i })));

      expect((await (await req('/api/ideas?limit=1000')).json()).ideas).toHaveLength(100);
      for (const limit of ['-1', '-5', '0', '1.5', 'abc']) {
        const res = await req(`/api/ideas?limit=${limit}`);
        expect(res.status, `limit=${limit}`).toBe(200);
        const json = await res.json();
        expect(json.ideas, `limit=${limit}`).toHaveLength(20);
        expect(json.nextCursor, `limit=${limit}`).toBe(json.ideas[19].created_at);
      }
    });

    it('filters by tag title and by tag id', async () => {
      const tag = await save({ type: 'tag', title: 'reading' });
      const idea = await save({ type: 'note', title: 'tagged', data: { text: 'x' } });
      await save({ type: 'note', title: 'untagged', data: { text: 'y' } });
      const conn = await req('/api/connections', {
        method: 'POST',
        body: { from_id: idea.id, to_id: tag.id, label: 'tagged_with' },
      });
      expect(conn.status).toBe(201);

      for (const ref of ['reading', tag.id]) {
        const { ideas } = await (await req(`/api/ideas?tag=${ref}`)).json();
        expect(ideas.map((i) => i.id)).toEqual([idea.id]);
      }
    });

    it('answers ?ids= with those rows only, up to 100 of them', async () => {
      seed(Array.from({ length: 100 }, (_, i) => ({ id: `i${i}`, at: 1000 + i })));
      const all = Array.from({ length: 100 }, (_, i) => `i${i}`).join(',');
      expect((await (await req(`/api/ideas?ids=${all}`)).json()).ideas).toHaveLength(100);
      expect((await (await req('/api/ideas?ids=i1,gone,i2')).json()).ideas.map((i) => i.id).sort()).toEqual([
        'i1',
        'i2',
      ]);
      expect((await (await req('/api/ideas?ids=')).json()).ideas).toEqual([]);
    });
  });

  describe('GET /api/ideas/search, on real FTS5', () => {
    beforeEach(async () => {
      await save({ type: 'note', title: "Petter's owl notes", data: { text: 'burrowing owls nest underground' } });
      await save({
        type: 'page',
        title: 'Rock & roll: a history',
        url: 'https://example.com/rock',
        summary: 'AND OR NOT',
      });
      await save({ type: 'quote', title: 'On habit', data: { text: 'we are what we repeatedly do' } });
    });

    async function search(q, extra = '') {
      const res = await req(`/api/ideas/search?q=${encodeURIComponent(q)}${extra}`);
      expect(res.status, q).toBe(200);
      return (await res.json()).ideas.map((i) => i.title);
    }

    it('finds words in the title, the summary and the body', async () => {
      expect(await search('owl')).toEqual(["Petter's owl notes"]);
      expect(await search('underground')).toEqual(["Petter's owl notes"]);
      expect(await search('repeatedly')).toEqual(['On habit']);
    });

    it('requires every word, and matches a prefix after *', async () => {
      expect(await search('owl history')).toEqual([]);
      expect(await search('burrow*')).toEqual(["Petter's owl notes"]);
    });

    it('takes punctuation and FTS keywords as plain text', async () => {
      expect(await search("Petter's")).toEqual(["Petter's owl notes"]);
      expect(await search('rock & roll: a')).toEqual(['Rock & roll: a history']);
      expect(await search('AND OR NOT')).toEqual(['Rock & roll: a history']);
      expect(await search('"unbalanced (near')).toEqual([]);
      expect(await search('-')).toEqual([]);
    });

    it('reads a limit that is no positive whole number as the default', async () => {
      for (const limit of ['-1', '0', '1.5', 'abc']) {
        expect(await search('owl', `&limit=${limit}`)).toEqual(["Petter's owl notes"]);
      }
    });
  });

  describe('inbox and Reader', () => {
    it('keeps a note with its text searchable and a later note on it winning the body', async () => {
      const idea = await save({ type: 'note', title: 'From the inbox', data: { text: 'remember the milk' } });
      const res = await req(`/api/ideas/${idea.id}/notes`, { method: 'POST', body: { body: 'and the bread' } });
      expect(res.status).toBe(201);
      const { ideas } = await (await req('/api/ideas/search?q=bread')).json();
      expect(ideas.map((i) => i.id)).toEqual([idea.id]);
    });

    it('keeps a quote next to the page it came from', async () => {
      const page = await save({ type: 'page', title: 'An article', url: 'https://example.com/a' });
      const quote = await save({
        type: 'quote',
        title: 'A line',
        url: 'https://example.com/a',
        data: { text: 'a line' },
      });
      expect(quote.id).not.toBe(page.id);
      expect(quote.type).toBe('quote');
    });

    it('deletes an idea with its notes and connections', async () => {
      const tag = await save({ type: 'tag', title: 'reading' });
      const idea = await save({ type: 'page', title: 'An article', url: 'https://example.com/a' });
      await req('/api/connections', {
        method: 'POST',
        body: { from_id: idea.id, to_id: tag.id, label: 'tagged_with' },
      });
      await req(`/api/ideas/${idea.id}/notes`, { method: 'POST', body: { body: 'a note' } });

      expect((await req(`/api/ideas/${idea.id}`, { method: 'DELETE' })).status).toBe(200);
      expect(env.DB._db.prepare('SELECT COUNT(*) AS n FROM connections').get().n).toBe(0);
      expect(env.DB._db.prepare('SELECT COUNT(*) AS n FROM notes').get().n).toBe(0);
      expect((await (await req(`/api/ideas?ids=${idea.id}`)).json()).ideas).toEqual([]);
    });
  });
});
