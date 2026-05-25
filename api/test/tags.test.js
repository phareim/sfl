import { beforeEach, describe, expect, it } from 'vitest';
import app from '../src/app.js';
import { createMockEnv } from './helpers.js';

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

function seedTag(id, title, { uses = 0, type = 'tag' } = {}) {
  env.DB._tables.ideas.push({
    id,
    type,
    title,
    url: null,
    summary: null,
    r2_key: `ideas/${id}/data.json`,
    created_at: Date.now(),
    updated_at: Date.now(),
    rowid: env.DB._tables.ideas.length + 1,
  });
  for (let i = 0; i < uses; i++) {
    env.DB._tables.connections.push({
      id: `c-${id}-${i}`,
      from_id: `idea-${id}-${i}`,
      to_id: id,
      label: 'tagged_with',
      created_at: Date.now(),
    });
  }
}

describe('Tag rename + merge', () => {
  it('PUT /api/tags/:id renames a tag', async () => {
    seedTag('t1', 'AI', { uses: 3 });
    const res = await req('/api/tags/t1', { method: 'PUT', body: { title: 'ai' } });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.title).toBe('ai');
  });

  it('PUT rejects empty title with 400', async () => {
    seedTag('t1', 'AI', { uses: 1 });
    const res = await req('/api/tags/t1', { method: 'PUT', body: { title: '   ' } });
    expect(res.status).toBe(400);
  });

  it('PUT 404 when id is not a tag', async () => {
    seedTag('t1', 'AI', { type: 'note' });
    const res = await req('/api/tags/t1', { method: 'PUT', body: { title: 'X' } });
    expect(res.status).toBe(404);
  });

  it('PUT 409 when another tag already owns that title', async () => {
    seedTag('t1', 'AI');
    seedTag('t2', 'ai-news');
    const res = await req('/api/tags/t1', { method: 'PUT', body: { title: 'ai-news' } });
    expect(res.status).toBe(409);
  });

  it('POST /:id/merge rewires connections', async () => {
    seedTag('src', 'AI');
    seedTag('dst', 'ai-news');
    // 3 distinct ideas tagged only with src
    env.DB._tables.connections.push(
      { id: 'a1', from_id: 'i1', to_id: 'src', label: 'tagged_with', created_at: 1 },
      { id: 'a2', from_id: 'i2', to_id: 'src', label: 'tagged_with', created_at: 1 },
      { id: 'a3', from_id: 'i3', to_id: 'src', label: 'tagged_with', created_at: 1 },
    );
    const res = await req('/api/tags/src/merge', { method: 'POST', body: { into: 'dst' } });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.merged).toBe('src');
    expect(json.into).toBe('dst');
    expect(json.rewired).toBe(3);
    expect(json.deduped).toBe(0);
    // Source tag is gone
    expect(env.DB._tables.ideas.find((r) => r.id === 'src')).toBeUndefined();
  });

  it('POST /:id/merge dedupes when an idea is double-tagged', async () => {
    seedTag('src', 'AI');
    seedTag('dst', 'ai-news');
    // idea 'i1' is tagged with both src AND dst already → must be deduped on merge
    env.DB._tables.connections.push(
      { id: 'a1', from_id: 'i1', to_id: 'src', label: 'tagged_with', created_at: 1 },
      { id: 'a2', from_id: 'i1', to_id: 'dst', label: 'tagged_with', created_at: 1 },
      { id: 'a3', from_id: 'i2', to_id: 'src', label: 'tagged_with', created_at: 1 },
    );
    const res = await req('/api/tags/src/merge', { method: 'POST', body: { into: 'dst' } });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.rewired).toBe(1); // only i2 actually rewired
    expect(json.deduped).toBe(1); // i1 was already in dst, dropped
    // dst should now have exactly 2 edges (i1 from before + i2 rewired)
    const dstEdges = env.DB._tables.connections.filter((c) => c.to_id === 'dst' && c.label === 'tagged_with');
    expect(dstEdges.length).toBe(2);
  });

  it('POST /:id/merge rejects self-merge with 400', async () => {
    seedTag('src', 'AI');
    const res = await req('/api/tags/src/merge', { method: 'POST', body: { into: 'src' } });
    expect(res.status).toBe(400);
  });

  it('POST /:id/merge 404 when target missing', async () => {
    seedTag('src', 'AI');
    const res = await req('/api/tags/src/merge', { method: 'POST', body: { into: 'does-not-exist' } });
    expect(res.status).toBe(404);
  });
});
