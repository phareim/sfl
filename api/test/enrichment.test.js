import { beforeEach, describe, expect, it } from 'vitest';
import app from '../src/app.js';
import { createMockEnv } from './helpers.js';

let env;
const executionCtx = { waitUntil: () => {}, passThroughOnException: () => {} };

beforeEach(() => {
  env = createMockEnv();
});

function req(path, options = {}) {
  const { method = 'GET', body } = options;
  const headers = { 'Content-Type': 'application/json', Authorization: 'Bearer test-api-key' };
  const init = { method, headers };
  if (body) init.body = JSON.stringify(body);
  return app.request(path, init, env, executionCtx);
}

async function createIdea(body) {
  const res = await req('/api/ideas', { method: 'POST', body });
  expect(res.status).toBe(201);
  return (await res.json()).idea;
}

describe('POST /api/ideas/:id/suggest-tags', () => {
  it('maps suggestions to existing tags and marks new ones', async () => {
    await createIdea({ type: 'tag', title: 'Reading' });
    const idea = await createIdea({
      type: 'page',
      title: 'On books',
      url: 'https://books.example.com',
      data: { description: 'an essay about reading habits' },
    });

    env.AI = { run: async () => ({ response: '["reading", "philosophy"]' }) };

    const res = await req(`/api/ideas/${idea.id}/suggest-tags`, { method: 'POST', body: { count: 2 } });
    expect(res.status).toBe(200);
    const { suggestions } = await res.json();

    expect(suggestions).toHaveLength(2);
    expect(suggestions[0].existing).toBe(true);
    expect(suggestions[0].title).toBe('Reading');
    expect(suggestions[0].id).toBeTruthy();
    expect(suggestions[1]).toEqual({ id: null, title: 'philosophy', existing: false });
  });

  it('excludes tags already applied to the idea', async () => {
    const tag = await createIdea({ type: 'tag', title: 'reading' });
    const idea = await createIdea({ type: 'page', title: 'On books', url: 'https://books2.example.com' });
    const connRes = await req('/api/connections', {
      method: 'POST',
      body: { from_id: idea.id, to_id: tag.id, label: 'tagged_with' },
    });
    expect(connRes.status).toBe(201);

    env.AI = { run: async () => ({ response: '["reading", "philosophy"]' }) };

    const res = await req(`/api/ideas/${idea.id}/suggest-tags`, { method: 'POST', body: { count: 2 } });
    const { suggestions } = await res.json();
    expect(suggestions.map((s) => s.title)).toEqual(['philosophy']);
  });

  it('returns [] when the AI responds with garbage', async () => {
    const idea = await createIdea({ type: 'note', data: { text: 'hello' } });
    env.AI = { run: async () => ({ response: 'I think these tags would be great!' }) };

    const res = await req(`/api/ideas/${idea.id}/suggest-tags`, { method: 'POST' });
    const { suggestions } = await res.json();
    expect(suggestions).toEqual([]);
  });

  it('404s for a missing idea', async () => {
    const res = await req('/api/ideas/nope/suggest-tags', { method: 'POST' });
    expect(res.status).toBe(404);
  });
});

describe('summary enrichment', () => {
  it('generates a summary when none was provided', async () => {
    const idea = await createIdea({
      type: 'page',
      title: 'Owls',
      url: 'https://owls.example.com',
      data: { description: 'a long and thorough article about the burrowing owl, its habitat and diet, easily over eighty characters' },
    });

    env.AI = { run: async () => ({ response: 'An article about burrowing owls.' }) };

    const res = await req(`/api/ideas/${idea.id}/enrich?mode=summary`, { method: 'POST' });
    expect(res.status).toBe(200);

    const row = env.DB._tables.ideas.find((r) => r.id === idea.id);
    expect(row.summary).toBe('An article about burrowing owls.');
  });

  it('overwrites the lazy title-as-summary default', async () => {
    const idea = await createIdea({
      type: 'page',
      title: 'Owls',
      summary: 'Owls',
      url: 'https://owls2.example.com',
      data: { description: 'a long and thorough article about the burrowing owl, its habitat and diet, easily over eighty characters' },
    });

    env.AI = { run: async () => ({ response: 'An article about burrowing owls.' }) };
    await req(`/api/ideas/${idea.id}/enrich?mode=summary`, { method: 'POST' });

    const row = env.DB._tables.ideas.find((r) => r.id === idea.id);
    expect(row.summary).toBe('An article about burrowing owls.');
  });

  it('leaves a hand-written summary alone', async () => {
    const idea = await createIdea({
      type: 'page',
      title: 'Owls',
      summary: 'My own carefully written take on this owl article.',
      url: 'https://owls3.example.com',
      data: { description: 'a long and thorough article about the burrowing owl, its habitat and diet, easily over eighty characters' },
    });

    env.AI = { run: async () => ({ response: 'AI generated summary that should not win.' }) };
    await req(`/api/ideas/${idea.id}/enrich?mode=summary`, { method: 'POST' });

    const row = env.DB._tables.ideas.find((r) => r.id === idea.id);
    expect(row.summary).toBe('My own carefully written take on this owl article.');
  });

  it('skips when there is no content to summarize', async () => {
    const idea = await createIdea({ type: 'page', title: 'Bare', url: 'https://bare.example.com' });

    env.AI = { run: async () => ({ response: 'Should never be stored.' }) };
    await req(`/api/ideas/${idea.id}/enrich?mode=summary`, { method: 'POST' });

    const row = env.DB._tables.ideas.find((r) => r.id === idea.id);
    expect(row.summary).toBeNull();
  });
});
