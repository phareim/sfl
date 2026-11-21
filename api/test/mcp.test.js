import { beforeEach, describe, expect, it } from 'vitest';
import app from '../src/app.js';
import { createMockEnv } from './helpers.js';
import { createSqliteD1, sqliteAvailable } from './sqlite-d1.js';

let env;
let waitUntilCalls;
const executionCtx = {
  waitUntil: (p) => waitUntilCalls.push(p),
  passThroughOnException: () => {},
};

beforeEach(() => {
  env = createMockEnv();
  waitUntilCalls = [];
});

async function callTool(name, args) {
  const res = await app.request(
    '/mcp',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-api-key' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }),
    },
    env,
    executionCtx,
  );
  expect(res.status).toBe(200);
  const json = await res.json();
  return JSON.parse(json.result.content[0].text);
}

describe('MCP capture parity with REST', () => {
  it('capture_idea projects content into the FTS body and schedules enrichment', async () => {
    const { idea } = await callTool('capture_idea', { content: 'the quick brown fox', title: 'Fox' });

    const row = env.DB._tables.ideas.find((r) => r.id === idea.id);
    expect(row.body).toBe('the quick brown fox');
    expect(waitUntilCalls.length).toBe(1);

    const { ideas } = await callTool('search_ideas', { q: 'brown fox' });
    expect(ideas.map((i) => i.id)).toContain(idea.id);
  });

  it('create_idea projects type-specific content into the FTS body', async () => {
    const { idea } = await callTool('create_idea', {
      type: 'quote',
      title: 'Wilde',
      data: { text: 'be yourself', attribution: 'Oscar Wilde' },
    });

    const row = env.DB._tables.ideas.find((r) => r.id === idea.id);
    expect(row.body).toContain('be yourself');
    expect(waitUntilCalls.length).toBe(1);
  });

  it('create_idea deduplicates by URL like REST', async () => {
    const first = await callTool('create_idea', { type: 'page', title: 'First', url: 'https://dup.com' });
    const second = await callTool('create_idea', { type: 'page', title: 'Second', url: 'https://dup.com' });

    expect(second.existing).toBe(true);
    expect(second.idea.id).toBe(first.idea.id);
    expect(env.DB._tables.ideas.filter((r) => r.type === 'page').length).toBe(1);
  });

  it('create_idea dedup is type-scoped', async () => {
    await callTool('create_idea', { type: 'page', title: 'Page', url: 'https://dup.com' });
    const quote = await callTool('create_idea', {
      type: 'quote',
      title: 'Quote',
      url: 'https://dup.com',
      data: { text: 'quoted' },
    });

    expect(quote.existing).toBeUndefined();
    expect(quote.idea.type).toBe('quote');
  });

  it('add_note resyncs the parent note idea body', async () => {
    const { idea } = await callTool('capture_idea', { content: 'original' });
    await callTool('add_note', { idea_id: idea.id, body: 'note text wins' });

    const row = env.DB._tables.ideas.find((r) => r.id === idea.id);
    expect(row.body).toBe('note text wins');
  });

  it('update_idea re-projects the FTS body from merged data', async () => {
    const { idea } = await callTool('create_idea', { type: 'quote', data: { text: 'before' } });
    await callTool('update_idea', { id: idea.id, data: { text: 'after' } });

    const row = env.DB._tables.ideas.find((r) => r.id === idea.id);
    expect(row.body).toContain('after');
    expect(row.body).not.toContain('before');
  });
});

// On the real schema: foreign keys and UNIQUE decide what a half-finished tool call leaves behind.
describe.skipIf(!sqliteAvailable)('MCP tool calls that fail leave nothing behind', () => {
  beforeEach(() => {
    env = createMockEnv({ DB: createSqliteD1() });
  });

  function post(body) {
    return app.request(
      '/mcp',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-api-key' },
        body: JSON.stringify(body),
      },
      env,
      executionCtx,
    );
  }

  async function rawTool(name, args) {
    const res = await post({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } });
    expect(res.status).toBe(200);
    return (await res.json()).result;
  }

  const ideaCount = () => env.DB._db.prepare("SELECT COUNT(*) AS n FROM ideas WHERE type != 'tag'").get().n;

  it('capture_idea with a tag id that does not exist saves no note', async () => {
    const result = await rawTool('capture_idea', { content: 'a thought', tag_ids: ['no-such-tag'] });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('no-such-tag');
    expect(ideaCount()).toBe(0);
    expect(waitUntilCalls).toHaveLength(0);
  });

  it('capture_idea tags the note once when a tag id is given twice', async () => {
    const { idea: tag } = await callTool('create_idea', { type: 'tag', title: 'reading' });
    const { idea } = await callTool('capture_idea', { content: 'a thought', tag_ids: [tag.id, tag.id] });
    expect(ideaCount()).toBe(1);
    const rows = env.DB._db.prepare('SELECT to_id, label FROM connections WHERE from_id = ?').all(idea.id);
    expect(rows.map((r) => ({ ...r }))).toEqual([{ to_id: tag.id, label: 'tagged_with' }]);
  });

  it('create_idea without a type writes no blob and no row', async () => {
    const puts = [];
    const put = env.R2.put;
    env.R2.put = async (key, ...rest) => {
      puts.push(key);
      return put(key, ...rest);
    };
    const result = await rawTool('create_idea', { title: 'No type' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('type is required');
    expect(puts).toEqual([]);
    expect(ideaCount()).toBe(0);
  });

  it('answers a body that is no JSON-RPC message with an error, not a crash', async () => {
    const res = await post(null);
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe(-32600);

    const batch = await post([null, { jsonrpc: '2.0', id: 7, method: 'ping' }]);
    expect(batch.status).toBe(200);
    const answers = await batch.json();
    expect(answers[0].error.code).toBe(-32600);
    expect(answers[1]).toEqual({ jsonrpc: '2.0', id: 7, result: {} });
  });

  it('speaks the handshake claude.ai opens with', async () => {
    const init = await (await post({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} })).json();
    expect(init.result).toMatchObject({ serverInfo: { name: 'sfl' }, capabilities: { tools: {} } });
    expect(typeof init.result.protocolVersion).toBe('string');

    const notified = await post({ jsonrpc: '2.0', method: 'notifications/initialized' });
    expect(notified.status).toBe(202);

    const list = await (await post({ jsonrpc: '2.0', id: 2, method: 'tools/list' })).json();
    expect(list.result.tools.map((t) => t.name).sort()).toEqual([
      'add_note',
      'capture_idea',
      'create_connection',
      'create_idea',
      'get_idea',
      'list_ideas',
      'list_tags',
      'search_ideas',
      'tag_idea',
      'update_idea',
    ]);

    const unknown = await (await post({ jsonrpc: '2.0', id: 3, method: 'resources/list' })).json();
    expect(unknown.error.code).toBe(-32601);
  });

  it('list_ideas and search_ideas read a limit that is no positive whole number as the default', async () => {
    for (let i = 0; i < 25; i++) await callTool('capture_idea', { content: `owl number ${i}` });
    waitUntilCalls.length = 0;
    expect((await callTool('list_ideas', { limit: -5 })).ideas).toHaveLength(20);
    expect((await callTool('search_ideas', { q: 'owl', limit: -5 })).ideas).toHaveLength(20);
  });
});
