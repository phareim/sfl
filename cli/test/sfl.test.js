import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

// The CLI against a local stand-in for the API that answers with hand-written responses.

const run = promisify(execFile);
const CLI = fileURLToPath(new URL('../bin/sfl.js', import.meta.url));

const TAGS = [
  { id: 'V1StGXR8_Z5jdHi6B-myT', type: 'tag', title: 'reading', usage_count: 12 },
  { id: 'V1StGXR8_Z5jQ0000000x', type: 'tag', title: 'Reading list', usage_count: 3 },
];
const IDEAS = [
  { id: 'aaaaaaaaaaaaaaaaaaaa1', type: 'page', title: 'Owls of the north', url: 'https://example.com/owls' },
  { id: 'aaaaaaaaaaaaaaaaaaaa2', type: 'note', title: 'An owl I saw', url: null },
  { id: 'aaaaaaaaaaaaaaaaaaaa3', type: 'quote', title: null, url: null },
];

let server;
let baseUrl;
let requests;

beforeAll(async () => {
  server = createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
      const url = new URL(req.url, 'http://localhost');
      requests.push({
        method: req.method,
        path: url.pathname,
        query: url.searchParams,
        auth: req.headers.authorization,
        body,
      });
      const answer = (status, json) => {
        res.writeHead(status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(json));
      };
      if (req.headers.authorization !== 'Bearer test-key') return answer(401, { error: 'Unauthorized' });
      if (req.method === 'GET' && url.pathname === '/api/tags') return answer(200, { tags: TAGS });
      if (req.method === 'GET' && url.pathname === '/api/ideas') return answer(200, { ideas: IDEAS, nextCursor: null });
      if (req.method === 'GET' && url.pathname === '/api/ideas/search') return answer(200, { ideas: IDEAS });
      if (req.method === 'POST' && url.pathname === '/api/ideas') {
        const sent = JSON.parse(body);
        if (sent.url === 'https://example.com/owls') return answer(200, { idea: { ...IDEAS[0] }, existing: true });
        return answer(201, { idea: { id: `new${requests.length}`, ...sent }, data: sent.data ?? {} });
      }
      if (req.method === 'POST' && url.pathname === '/api/connections') {
        const sent = JSON.parse(body);
        const already = requests.filter((r) => r.path === '/api/connections' && r.body === body).length > 1;
        if (already) return answer(400, { error: 'Connection already exists' });
        return answer(201, { connection: { id: 'c1', ...sent } });
      }
      const rename = url.pathname.match(/^\/api\/tags\/([^/]+)$/);
      if (req.method === 'PUT' && rename) return answer(200, { id: rename[1], title: JSON.parse(body).title });
      return answer(404, { error: 'Not found' });
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

afterAll(() => new Promise((resolve) => server.close(resolve)));

beforeEach(() => {
  requests = [];
});

async function sfl(...args) {
  const { stdout } = await run(process.execPath, [CLI, ...args], {
    env: { ...process.env, SFL_API_URL: baseUrl, SFL_API_KEY: 'test-key' },
  });
  return stdout;
}

describe('sfl', () => {
  it('ideas: asks for the list with the bearer key and prints whole ids', async () => {
    const out = await sfl('ideas', '--type', 'page', '--limit', '5');
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({ method: 'GET', path: '/api/ideas', auth: 'Bearer test-key' });
    expect(requests[0].query.get('type')).toBe('page');
    expect(requests[0].query.get('limit')).toBe('5');
    expect(out).toContain('aaaaaaaaaaaaaaaaaaaa1  page       Owls of the north');
    expect(out).toContain('aaaaaaaaaaaaaaaaaaaa3  quote      (untitled)');
  });

  it('ideas search: sends the words as q', async () => {
    const out = await sfl('ideas', 'search', 'owl', 'north');
    expect(requests[0].path).toBe('/api/ideas/search');
    expect(requests[0].query.get('q')).toBe('owl north');
    expect(out).toContain('Owls of the north');
    expect(out).toContain('An owl I saw');
  });

  it('ideas search --type: prints that type only', async () => {
    const out = await sfl('ideas', 'search', 'owl', '--type', 'page');
    expect(out).toContain('Owls of the north');
    expect(out).not.toContain('An owl I saw');
    expect(out).not.toContain('quote');
  });

  it('tags: prints ids that tags rename takes', async () => {
    const out = await sfl('tags');
    const line = out.split('\n').find((l) => l.endsWith(' Reading list'));
    const printedId = line.trim().split(/\s+/)[0];
    expect(printedId).toBe('V1StGXR8_Z5jQ0000000x');

    const renamed = await sfl('tags', 'rename', printedId, 'to-read');
    expect(renamed).toContain('Renamed: Reading list → to-read');
    const put = requests.find((r) => r.method === 'PUT');
    expect(put.path).toBe('/api/tags/V1StGXR8_Z5jQ0000000x');
    expect(JSON.parse(put.body)).toEqual({ title: 'to-read' });
  });

  it('tags rename: takes a title, whatever its case', async () => {
    await sfl('tags', 'rename', 'READING', 'books');
    expect(requests.find((r) => r.method === 'PUT').path).toBe('/api/tags/V1StGXR8_Z5jdHi6B-myT');
  });
});

describe('sfl add', () => {
  const posts = (path) => requests.filter((r) => r.method === 'POST' && r.path === path).map((r) => JSON.parse(r.body));

  it('saves a url as a page and prints the new id', async () => {
    const out = await sfl('add', 'https://example.com/new', '--title', 'A new page');
    expect(posts('/api/ideas')).toEqual([{ type: 'page', url: 'https://example.com/new', title: 'A new page' }]);
    expect(out.trim()).toMatch(/^new\d+$/);
  });

  it('saves text as a note with the body inbox sends', async () => {
    const text = 'a thought that is rather longer than eighty characters, so the title has to be cut short here ok';
    await sfl('add', ...text.split(' '));
    expect(posts('/api/ideas')).toEqual([
      { type: 'note', title: text.slice(0, 80), summary: text, data: { text, source: 'cli' } },
    ]);
  });

  it('saves a quote with --type quote, and tags it with existing and new tags', async () => {
    await sfl('add', 'be yourself', '--type', 'quote', '--tag', 'READING', '--tag', 'wisdom');
    const ideas = posts('/api/ideas');
    expect(ideas[0]).toEqual({
      type: 'quote',
      title: 'be yourself',
      summary: 'be yourself',
      data: { text: 'be yourself', source: 'cli' },
    });
    expect(ideas[1]).toEqual({ type: 'tag', title: 'wisdom' });
    const id = posts('/api/connections')[0].from_id;
    expect(posts('/api/connections')).toEqual([
      { from_id: id, to_id: TAGS[0].id, label: 'tagged_with' },
      { from_id: id, to_id: expect.stringMatching(/^new\d+$/), label: 'tagged_with' },
    ]);
  });

  it('treats a tag the idea already has as done', async () => {
    const out = await sfl('add', 'twice', '--tag', 'reading', '--tag', 'reading');
    expect(out.trim()).toMatch(/^new\d+$/);
    expect(posts('/api/connections')).toHaveLength(2);
  });

  it('says so when the url was saved before', async () => {
    const out = await sfl('add', 'https://example.com/owls');
    expect(out.trim()).toBe('aaaaaaaaaaaaaaaaaaaa1 (already saved)');
  });

  it('refuses no input and a page that is no url', async () => {
    await expect(sfl('add')).rejects.toThrow();
    await expect(sfl('add', 'just words', '--type', 'page')).rejects.toThrow();
    expect(posts('/api/ideas')).toEqual([]);
  });
});
