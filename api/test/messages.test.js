import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import app from '../src/app.js';
import { createMockEnv } from './helpers.js';
import { createSqliteD1, sqliteAvailable } from './sqlite-d1.js';

// The chat thread behind the iOS app's Chat tab: what a message does with and without CHAT_WEBHOOK_URL.

let env;
let background;
const executionCtx = { waitUntil: (p) => background.push(p), passThroughOnException: () => {} };

function req(path, { method = 'GET', body } = {}) {
  const init = { method, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-api-key' } };
  if (body !== undefined) init.body = JSON.stringify(body);
  return app.request(path, init, env, executionCtx);
}

async function thread(query = '') {
  const res = await req(`/api/messages${query}`);
  expect(res.status).toBe(200);
  return res.json();
}

describe.skipIf(!sqliteAvailable)('chat messages', () => {
  beforeEach(() => {
    env = createMockEnv({ DB: createSqliteD1() });
    background = [];
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('without CHAT_WEBHOOK_URL: stores the message and adds a Workers AI reply from "sleeper"', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    env.AI = { run: vi.fn(async () => ({ response: ' Hello Petter. ' })) };

    const res = await req('/api/messages', { method: 'POST', body: { body: '  hi  ' } });
    expect(res.status).toBe(201);
    const { message } = await res.json();
    expect(message).toMatchObject({ body: 'hi', sender: 'user' });
    expect(typeof message.created_at).toBe('number');

    await Promise.all(background);
    expect(fetchSpy).not.toHaveBeenCalled();
    const { messages } = await thread();
    expect(messages.map((m) => [m.sender, m.body]).sort()).toEqual([
      ['sleeper', 'Hello Petter.'],
      ['user', 'hi'],
    ]);
  });

  it('with CHAT_WEBHOOK_URL: posts the message there with X-SFL-Secret and writes no reply of its own', async () => {
    const fetchSpy = vi.fn(async () => new Response('ok'));
    vi.stubGlobal('fetch', fetchSpy);
    env.CHAT_WEBHOOK_URL = 'https://hook.example/chat';
    env.WEBHOOK_SECRET = 's3cret';
    env.AI = { run: vi.fn() };

    const { message } = await (await req('/api/messages', { method: 'POST', body: { body: 'hi' } })).json();
    await Promise.all(background);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('https://hook.example/chat');
    expect(init.method).toBe('POST');
    expect(init.headers['X-SFL-Secret']).toBe('s3cret');
    expect(JSON.parse(init.body)).toEqual(message);
    expect(env.AI.run).not.toHaveBeenCalled();
    expect((await thread()).messages.map((m) => m.sender)).toEqual(['user']);
  });

  it('with CHAT_WEBHOOK_URL pointing at a dead backend: the message is stored, nothing answers, nothing is reported', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('getaddrinfo ENOTFOUND');
      }),
    );
    env.CHAT_WEBHOOK_URL = 'https://retired.example/chat';

    const res = await req('/api/messages', { method: 'POST', body: { body: 'anyone there?' } });
    expect(res.status).toBe(201);
    await Promise.all(background);
    expect((await thread()).messages.map((m) => [m.sender, m.body])).toEqual([['user', 'anyone there?']]);
  });

  it('lets a backend post the reply as sender "sleeper", which triggers nothing further', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    env.CHAT_WEBHOOK_URL = 'https://hook.example/chat';

    const res = await req('/api/messages', { method: 'POST', body: { body: 'the answer', sender: 'sleeper' } });
    expect(res.status).toBe(201);
    expect((await res.json()).message).toMatchObject({ body: 'the answer', sender: 'sleeper' });
    expect(background).toHaveLength(0);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('refuses an empty message and a body that is not an object', async () => {
    expect((await req('/api/messages', { method: 'POST', body: { body: '   ' } })).status).toBe(400);
    expect((await req('/api/messages', { method: 'POST', body: null })).status).toBe(400);
    expect((await req('/api/messages', { method: 'POST', body: { body: 5 } })).status).toBe(400);
  });

  it('lists newest first, pages by cursor, and reads a limit that is no positive number as the default 50', async () => {
    const insert = env.DB._db.prepare('INSERT INTO messages (id, body, sender, created_at) VALUES (?, ?, ?, ?)');
    for (let i = 0; i < 120; i++) insert.run(`m${i}`, `message ${i}`, 'user', 1000 + i);

    const first = await thread('?limit=50');
    expect(first.messages).toHaveLength(50);
    expect(first.messages[0].id).toBe('m119');
    expect(first.nextCursor).toBe(first.messages[49].created_at);

    const second = await thread(`?limit=50&cursor=${first.nextCursor}`);
    expect(second.messages[0].id).toBe('m69');

    expect((await thread('?limit=1000')).messages).toHaveLength(100);
    for (const limit of ['-1', '0', 'abc']) {
      const res = await req(`/api/messages?limit=${limit}`);
      expect(res.status, `limit=${limit}`).toBe(200);
      expect((await res.json()).messages, `limit=${limit}`).toHaveLength(50);
    }
  });
});
