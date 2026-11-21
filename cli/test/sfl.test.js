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
