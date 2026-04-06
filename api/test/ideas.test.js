import { beforeEach, describe, expect, it } from 'vitest';
import app from '../src/app.js';
import { apiRequest, createMockEnv } from './helpers.js';

let env;
const executionCtx = { waitUntil: () => {}, passThroughOnException: () => {} };

beforeEach(() => {
  env = createMockEnv();
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

  it('search requires q parameter', async () => {
    const res = await req('/api/ideas/search');
    expect(res.status).toBe(400);
  });
});
