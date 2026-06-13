import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import app from '../src/app.js';
import { apiRequest, createMockEnv } from './helpers.js';

let env;
const executionCtx = { waitUntil: () => {}, passThroughOnException: () => {} };

beforeEach(() => {
  env = createMockEnv();
  // Page saves now fetch the article in the background; keep it hermetic.
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: false, headers: { get: () => null } })),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function req(path, options = {}) {
  const { method = 'GET', body, token = 'test-api-key' } = options;
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const init = { method, headers };
  if (body) init.body = JSON.stringify(body);
  return app.request(path, init, env, executionCtx);
}

// ── Auth ─────────────────────────────────────────────────────────────

describe('Auth', () => {
  it('rejects requests without token', async () => {
    const res = await req('/api/ideas', { token: null });
    expect(res.status).toBe(401);
  });

  it('rejects requests with wrong token', async () => {
    const res = await req('/api/ideas', { token: 'wrong' });
    expect(res.status).toBe(401);
  });

  it('accepts requests with valid API key', async () => {
    const res = await req('/api/ideas');
    expect(res.status).toBe(200);
  });
});

// ── Health ───────────────────────────────────────────────────────────

describe('Health', () => {
  it('returns ok', async () => {
    const res = await req('/health', { token: null });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ ok: true });
  });
});

// ── Ideas CRUD ───────────────────────────────────────────────────────

describe('Ideas', () => {
  it('lists ideas (empty)', async () => {
    const res = await req('/api/ideas');
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ideas).toEqual([]);
    expect(json.nextCursor).toBeNull();
  });

  it('creates an idea', async () => {
    const res = await req('/api/ideas', {
      method: 'POST',
      body: { type: 'note', title: 'Test note', data: { text: 'hello' } },
    });
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.idea.type).toBe('note');
    expect(json.idea.title).toBe('Test note');
    expect(json.data).toEqual({ text: 'hello' });
  });

  it('requires type on create', async () => {
    const res = await req('/api/ideas', {
      method: 'POST',
      body: { title: 'No type' },
    });
    expect(res.status).toBe(400);
  });

  it('gets an idea by id', async () => {
    // Create first
    const createRes = await req('/api/ideas', {
      method: 'POST',
      body: { type: 'page', title: 'My page', url: 'https://example.com', data: { text: 'content' } },
    });
    const { idea } = await createRes.json();

    const getRes = await req(`/api/ideas/${idea.id}`);
    expect(getRes.status).toBe(200);
    const json = await getRes.json();
    expect(json.idea.id).toBe(idea.id);
    expect(json.data.text).toBe('content');
  });

  it('returns 404 for missing idea', async () => {
    const res = await req('/api/ideas/nonexistent');
    expect(res.status).toBe(404);
  });

  it('updates an idea', async () => {
    const createRes = await req('/api/ideas', {
      method: 'POST',
      body: { type: 'note', title: 'Original' },
    });
    const { idea } = await createRes.json();

    const updateRes = await req(`/api/ideas/${idea.id}`, {
      method: 'PUT',
      body: { title: 'Updated', data: { text: 'new content' } },
    });
    expect(updateRes.status).toBe(200);
    const json = await updateRes.json();
    expect(json.idea.title).toBe('Updated');
    expect(json.data.text).toBe('new content');
  });

  it('deletes an idea', async () => {
    const createRes = await req('/api/ideas', {
      method: 'POST',
      body: { type: 'note', title: 'To delete' },
    });
    const { idea } = await createRes.json();

    const delRes = await req(`/api/ideas/${idea.id}`, { method: 'DELETE' });
    expect(delRes.status).toBe(200);
    const json = await delRes.json();
    expect(json.deleted).toBe(idea.id);

    // Verify gone
    const getRes = await req(`/api/ideas/${idea.id}`);
    expect(getRes.status).toBe(404);
  });

  it('deduplicates by URL', async () => {
    await req('/api/ideas', {
      method: 'POST',
      body: { type: 'page', title: 'First', url: 'https://dup.com' },
    });

    const res2 = await req('/api/ideas', {
      method: 'POST',
      body: { type: 'page', title: 'Second', url: 'https://dup.com' },
    });
    const json = await res2.json();
    expect(json.existing).toBe(true);
    expect(json.idea.title).toBe('First');
  });

  it('URL dedup is type-scoped — a quote from a saved page is not discarded', async () => {
    await req('/api/ideas', {
      method: 'POST',
      body: { type: 'page', title: 'The Page', url: 'https://dup.com' },
    });

    const res2 = await req('/api/ideas', {
      method: 'POST',
      body: { type: 'quote', title: 'A quote', url: 'https://dup.com', data: { text: 'quoted text' } },
    });
    expect(res2.status).toBe(201);
    const json = await res2.json();
    expect(json.existing).toBeUndefined();
    expect(json.idea.type).toBe('quote');
  });

  it('projects page meta description into the FTS body', async () => {
    const res = await req('/api/ideas', {
      method: 'POST',
      body: {
        type: 'page',
        title: 'Article',
        url: 'https://meta.example.com',
        data: { url: 'https://meta.example.com', description: 'a thorough look at burrowing owls' },
      },
    });
    expect(res.status).toBe(201);
    const { idea } = await res.json();

    const row = env.DB._tables.ideas.find((r) => r.id === idea.id);
    expect(row.body).toBe('a thorough look at burrowing owls');
  });

  it('search requires q parameter', async () => {
    const res = await req('/api/ideas/search');
    expect(res.status).toBe(400);
  });
});

// ── Article fetch ────────────────────────────────────────────────────

describe('fetch-content', () => {
  // The happy path runs the page through HTMLRewriter, a Workers-runtime global
  // unavailable in the Node test runner, so it's exercised via wrangler/prod
  // rather than here.
  it('rejects fetch-content for non-page ideas', async () => {
    const createRes = await req('/api/ideas', { method: 'POST', body: { type: 'note', data: { text: 'hi' } } });
    const { idea } = await createRes.json();
    const res = await req(`/api/ideas/${idea.id}/fetch-content`, { method: 'POST' });
    expect(res.status).toBe(400);
  });
});

// ── Ad-hoc tag suggestions ───────────────────────────────────────────

describe('POST /api/ideas/suggest-tags (ad-hoc)', () => {
  it('suggests tags for not-yet-saved content', async () => {
    await req('/api/ideas', { method: 'POST', body: { type: 'tag', title: 'birds' } });
    env.AI = { run: async () => ({ response: '["birds", "conservation"]' }) };

    const res = await req('/api/ideas/suggest-tags', {
      method: 'POST',
      body: { title: 'Owls', text: 'an article about burrowing owls and grassland conservation', count: 2 },
    });
    expect(res.status).toBe(200);
    const { suggestions } = await res.json();
    expect(suggestions).toHaveLength(2);
    expect(suggestions[0]).toMatchObject({ title: 'birds', existing: true });
    expect(suggestions[1]).toEqual({ id: null, title: 'conservation', existing: false });
  });

  it('is not captured as an :id route', async () => {
    env.AI = { run: async () => ({ response: '[]' }) };
    const res = await req('/api/ideas/suggest-tags', { method: 'POST', body: { title: 'x' } });
    expect(res.status).toBe(200); // 200 with [], not 404 from /:id/suggest-tags
  });
});
