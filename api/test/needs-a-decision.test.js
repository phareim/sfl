import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import app from '../src/app.js';
import { createMockEnv } from './helpers.js';
import { createSqliteD1, sqliteAvailable } from './sqlite-d1.js';

// Proved problems that are left as they are, because the fix changes a contract or what Petter sees. Each is
// described in QUALITY-REPORT.md under "Needs a decision". `it.fails` passes while the problem is there and
// turns red the day it is fixed: change it to `it` then.

let env;
const executionCtx = { waitUntil: () => {}, passThroughOnException: () => {} };

function req(path, { method = 'GET', body } = {}) {
  const init = { method, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-api-key' } };
  if (body !== undefined) init.body = JSON.stringify(body);
  return app.request(path, init, env, executionCtx);
}

describe.skipIf(!sqliteAvailable)('needs a decision', () => {
  beforeEach(() => {
    env = createMockEnv({ DB: createSqliteD1() });
    env.AI = { run: async () => ({ response: '' }) };
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, headers: { get: () => null } })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.fails('paging reaches every idea when several were saved in the same millisecond', async () => {
    const insert = env.DB._db.prepare(
      "INSERT INTO ideas (id, type, title, created_at, updated_at) VALUES (?, 'page', ?, ?, ?)",
    );
    for (const id of ['a', 'b', 'c']) insert.run(id, id, 5000, 5000);

    const seen = [];
    let cursor = null;
    do {
      const page = await (await req(`/api/ideas?type=page&limit=2${cursor ? `&cursor=${cursor}` : ''}`)).json();
      seen.push(...page.ideas.map((i) => i.id));
      cursor = page.nextCursor;
    } while (cursor);

    expect(seen.sort()).toEqual(['a', 'b', 'c']);
  });

  it.fails('two saves of the same url arriving together make one idea', async () => {
    const body = { type: 'page', title: 'An article', url: 'https://example.com/article' };
    const answers = await Promise.all([
      req('/api/ideas', { method: 'POST', body }),
      req('/api/ideas', { method: 'POST', body }),
    ]);

    expect(answers.map((r) => r.status).sort()).toEqual([200, 201]);
    expect(env.DB._db.prepare("SELECT COUNT(*) AS n FROM ideas WHERE type = 'page'").get().n).toBe(1);
  });

  it.fails('a second quote from the same url is saved, not answered with the first', async () => {
    const url = 'https://example.com/article';
    const first = await req('/api/ideas', {
      method: 'POST',
      body: { type: 'quote', url, data: { text: 'the first line' } },
    });
    const second = await req('/api/ideas', {
      method: 'POST',
      body: { type: 'quote', url, data: { text: 'another line' } },
    });

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect((await second.json()).data).toEqual({ text: 'another line' });
  });

  it.fails('a new idea with a short title is offered recent ideas to connect to', async () => {
    const save = async (body) => (await (await req('/api/ideas', { method: 'POST', body })).json()).idea;
    const older = await save({ type: 'note', title: 'Burrowing owls', data: { text: 'x' } });
    const idea = await save({ type: 'note', title: 'Owl habitats', data: { text: 'y' } });

    const offered = [];
    env.AI = {
      run: async (_model, { messages }) => {
        offered.push(messages[1].content);
        return { response: JSON.stringify([older.id]) };
      },
    };
    await req(`/api/ideas/${idea.id}/enrich?mode=connections`, { method: 'POST' });

    // The search for candidates finds the idea itself and nothing else, so the fallback to recent ideas never
    // runs and the model is never asked.
    expect(offered).toHaveLength(1);
    expect(env.DB._db.prepare("SELECT COUNT(*) AS n FROM connections WHERE label = 'related_to'").get().n).toBe(1);
  });
});
