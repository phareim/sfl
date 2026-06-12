import { beforeEach, describe, expect, it } from 'vitest';
import app from '../src/app.js';
import { createMockEnv } from './helpers.js';

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
