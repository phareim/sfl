import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import app from '../src/app.js';
import { createMockEnv } from './helpers.js';
import { createSqliteD1, sqliteAvailable } from './sqlite-d1.js';

// The services the Worker calls: TypeSafe Jev for tagging and GitHub for repo search. Each test answers with a
// hand-written response in the shape the code reads; none of them reaches the network.

let env;
let background;
const executionCtx = { waitUntil: (p) => background.push(p), passThroughOnException: () => {} };

function req(path, { method = 'GET', body } = {}) {
  const init = { method, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-api-key' } };
  if (body !== undefined) init.body = JSON.stringify(body);
  return app.request(path, init, env, executionCtx);
}

async function save(body) {
  const res = await req('/api/ideas', { method: 'POST', body });
  expect(res.status).toBe(201);
  return (await res.json()).idea;
}

describe.skipIf(!sqliteAvailable)('outbound services', () => {
  beforeEach(() => {
    env = createMockEnv({ DB: createSqliteD1() });
    background = [];
    // Silent model: the enrichment that runs when an idea is saved changes nothing.
    env.AI = { run: vi.fn(async () => ({ response: '' })) };
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe('TypeSafe Jev tagging', () => {
    let tags;
    let idea;

    function tagsOn(id) {
      return env.DB._db
        .prepare(
          "SELECT t.title FROM connections c JOIN ideas t ON t.id = c.to_id WHERE c.from_id = ? AND c.label = 'tagged_with'",
        )
        .all(id)
        .map((r) => r.title)
        .sort();
    }

    beforeEach(async () => {
      tags = {
        aiNews: await save({ type: 'tag', title: 'ai-news' }),
        anthropic: await save({ type: 'tag', title: 'Anthropic' }),
        manual: await save({ type: 'tag', title: 'holiday' }),
      };
      idea = await save({
        type: 'note',
        title: 'Claude gets a new model',
        summary: 'Anthropic released a model today.',
      });
      // Let the enrichment those saves started finish, so what follows is the enrich call alone.
      await Promise.all(background);
      env.AI.run.mockClear();
    });

    it('sends title, summary and url with the key, and applies the vocabulary tags that score 0.6 or more', async () => {
      const fetchSpy = vi.fn(async () =>
        Response.json({
          answers: {
            ai_news: { noul: 0.92 },
            anthropic: { noul: 0.61 },
            security: { noul: 0.95 }, // in the vocabulary, but no such tag exists here
            mcp: { noul: 0.59 },
          },
        }),
      );
      vi.stubGlobal('fetch', fetchSpy);
      env.TYPESAFE_API_KEY = 'jev-key';

      const res = await req(`/api/ideas/${idea.id}/enrich?mode=tags`, { method: 'POST' });
      expect(res.status).toBe(200);

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const [url, init] = fetchSpy.mock.calls[0];
      expect(url).toBe('https://api.typesafe.ai/v1/systemone');
      expect(init.method).toBe('POST');
      expect(init.headers.Authorization).toBe('Bearer jev-key');
      const sent = JSON.parse(init.body);
      expect(sent.model).toBe('jev-latest');
      expect(sent.state).toEqual({
        title: 'Claude gets a new model',
        summary: 'Anthropic released a model today.',
        url: '',
      });
      expect(sent.questions.ai_news).toEqual({ type: 'noul', instructions: expect.any(String) });

      expect(tagsOn(idea.id)).toEqual(['Anthropic', 'ai-news']);
      expect(env.AI.run).not.toHaveBeenCalled();
    });

    it('falls back to the Workers AI tagger when Jev answers with an error, and logs no key', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => new Response('down', { status: 503 })),
      );
      const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
      env.TYPESAFE_API_KEY = 'jev-key';
      env.AI = { run: vi.fn(async () => ({ response: JSON.stringify([tags.manual.id, 'not-a-tag-id']) })) };

      await req(`/api/ideas/${idea.id}/enrich?mode=tags`, { method: 'POST' });

      expect(env.AI.run).toHaveBeenCalledTimes(1);
      expect(tagsOn(idea.id)).toEqual(['holiday']);
      expect(logged).toHaveBeenCalledTimes(1);
      expect(logged.mock.calls[0].map(String).join(' ')).not.toContain('jev-key');
    });

    it('uses the Workers AI tagger alone when there is no TYPESAFE_API_KEY', async () => {
      const fetchSpy = vi.fn();
      vi.stubGlobal('fetch', fetchSpy);
      env.AI = { run: vi.fn(async () => ({ response: `Here you go: ["${tags.aiNews.id}"]` })) };

      await req(`/api/ideas/${idea.id}/enrich?mode=tags`, { method: 'POST' });

      expect(fetchSpy).not.toHaveBeenCalled();
      expect(tagsOn(idea.id)).toEqual(['ai-news']);
    });
  });

  describe('GitHub repo search', () => {
    it('searches with the server-side token and answers with four fields per repo', async () => {
      const fetchSpy = vi.fn(async () =>
        Response.json({
          total_count: 1,
          items: [
            {
              id: 1,
              full_name: 'owner/repo',
              html_url: 'https://github.com/owner/repo',
              description: 'A repo',
              private: true,
              stargazers_count: 3,
            },
          ],
        }),
      );
      vi.stubGlobal('fetch', fetchSpy);
      env.GITHUB_TOKEN = 'gh-token';

      const res = await req('/api/github/repos?q=owner%2Frepo');
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({
        items: [
          { full_name: 'owner/repo', html_url: 'https://github.com/owner/repo', description: 'A repo', private: true },
        ],
      });

      const [url, init] = fetchSpy.mock.calls[0];
      expect(url).toBe('https://api.github.com/search/repositories?q=owner%2Frepo&per_page=10&sort=updated');
      expect(init.headers.Authorization).toBe('Bearer gh-token');
    });

    it('answers 502 without the token when GitHub refuses, 503 when no token is set, and nothing for a one-letter query', async () => {
      const fetchSpy = vi.fn(async () => new Response('rate limited', { status: 403 }));
      vi.stubGlobal('fetch', fetchSpy);

      const unset = await req('/api/github/repos?q=owner');
      expect(unset.status).toBe(503);

      env.GITHUB_TOKEN = 'gh-token';
      const refused = await req('/api/github/repos?q=owner');
      expect(refused.status).toBe(502);
      expect(await refused.text()).not.toContain('gh-token');

      fetchSpy.mockClear();
      expect(await (await req('/api/github/repos?q=o')).json()).toEqual({ items: [] });
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });
});
