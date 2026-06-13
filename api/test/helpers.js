/**
 * Mock bindings for Cloudflare Worker environment (D1, R2, secrets).
 * Provides an in-memory D1 stub that supports prepare().bind().first/all/run
 * and an in-memory R2 stub that supports get/put/delete.
 */

// ── In-memory R2 bucket ──────────────────────────────────────────────

export function createMockR2() {
  const store = new Map();
  return {
    async put(key, body, opts) {
      store.set(key, { body, opts });
    },
    async get(key) {
      const entry = store.get(key);
      if (!entry) return null;
      return {
        async json() {
          return typeof entry.body === 'string' ? JSON.parse(entry.body) : entry.body;
        },
        async text() {
          return typeof entry.body === 'string' ? entry.body : JSON.stringify(entry.body);
        },
        body: entry.body,
      };
    },
    async delete(key) {
      store.delete(key);
    },
  };
}

// ── In-memory D1 database ────────────────────────────────────────────

export function createMockDB() {
  const tables = {
    ideas: [],
    connections: [],
    notes: [],
    media: [],
    oauth_tokens: [],
  };

  function matchQuery(sql, params) {
    const s = sql.trim().replace(/\s+/g, ' ');

    // SELECT id, type, title FROM ideas WHERE id = ?  (tag merge / rename lookups)
    if (s.startsWith('SELECT id, type, title FROM ideas WHERE id = ?')) {
      const row = tables.ideas.find((r) => r.id === params[0]) ?? null;
      return { first: row };
    }

    // SELECT id FROM ideas WHERE type='tag' AND title=? AND id != ?  (rename clash)
    if (s.includes("FROM ideas WHERE type = 'tag' AND title = ? AND id != ?")) {
      const row = tables.ideas.find((r) => r.type === 'tag' && r.title === params[0] && r.id !== params[1]) ?? null;
      return { first: row };
    }

    // SELECT id, title, url, updated_at, r2_key FROM ideas WHERE type='meta' AND updated_at >= ?
    if (s.includes("FROM ideas WHERE type = 'meta' AND updated_at >= ?")) {
      const since = Number(params[0]);
      const rows = tables.ideas
        .filter((r) => r.type === 'meta' && r.updated_at >= since)
        .sort((a, b) => b.updated_at - a.updated_at);
      return { all: rows };
    }

    // SELECT t.*, COUNT(c.id) … FROM ideas t LEFT JOIN connections c …
    if (s.includes('LEFT JOIN connections c ON c.to_id = t.id')) {
      const tags = tables.ideas.filter((r) => r.type === 'tag');
      const out = tags.map((t) => ({
        ...t,
        usage_count: tables.connections.filter((c) => c.to_id === t.id && c.label === 'tagged_with').length,
      }));
      out.sort((a, b) => b.usage_count - a.usage_count || (a.title ?? '').localeCompare(b.title ?? ''));
      return { all: out };
    }

    // SELECT id, from_id FROM connections WHERE to_id = ? AND label='tagged_with'
    if (s.includes('FROM connections WHERE to_id = ? AND label =')) {
      const rows = tables.connections.filter((c) => c.to_id === params[0] && c.label === 'tagged_with');
      return { all: rows };
    }

    // SELECT to_id FROM connections WHERE from_id = ? AND label='tagged_with'
    if (s.includes('FROM connections WHERE from_id = ? AND label =')) {
      const rows = tables.connections.filter((c) => c.from_id === params[0] && c.label === 'tagged_with');
      return { all: rows };
    }

    // SELECT id, title FROM ideas WHERE type = 'tag' ORDER BY title ASC
    if (s.includes("FROM ideas WHERE type = 'tag' ORDER BY title")) {
      const rows = tables.ideas
        .filter((r) => r.type === 'tag')
        .sort((a, b) => (a.title ?? '').localeCompare(b.title ?? ''));
      return { all: rows };
    }

    // UPDATE ideas SET summary = ?, updated_at = ? WHERE id = ?  (applySummary)
    if (s.startsWith('UPDATE ideas SET summary = ?, updated_at = ? WHERE id = ?')) {
      const [summary, updated_at, id] = params;
      const idx = tables.ideas.findIndex((r) => r.id === id);
      if (idx >= 0) Object.assign(tables.ideas[idx], { summary, updated_at });
      return { run: true };
    }

    // UPDATE connections SET to_id = ? WHERE id = ? AND label='tagged_with'
    if (s.startsWith('UPDATE connections SET to_id = ?')) {
      const [newToId, connId] = params;
      const idx = tables.connections.findIndex((c) => c.id === connId);
      if (idx < 0) return { run: true, changes: 0 };
      // Simulate UNIQUE(from_id, to_id, label) — if a connection already exists
      // with the same triple, throw the way D1 would.
      const from = tables.connections[idx].from_id;
      const dupe = tables.connections.find(
        (c) => c.from_id === from && c.to_id === newToId && c.label === 'tagged_with' && c.id !== connId,
      );
      if (dupe) {
        const err = new Error('UNIQUE constraint failed: connections.from_id, connections.to_id, connections.label');
        throw err;
      }
      tables.connections[idx].to_id = newToId;
      return { run: true, changes: 1 };
    }

    // INSERT [OR IGNORE] INTO connections — label is either a bound param (5)
    // or a string literal in the SQL (4, used by enrichment)
    if (s.startsWith('INSERT INTO connections') || s.startsWith('INSERT OR IGNORE INTO connections')) {
      let id, from_id, to_id, label, created_at;
      if (params.length === 5) {
        [id, from_id, to_id, label, created_at] = params;
      } else {
        [id, from_id, to_id, created_at] = params;
        label = s.match(/'(\w+)'/)?.[1] ?? null;
      }
      const dupe = tables.connections.find((c) => c.from_id === from_id && c.to_id === to_id && c.label === label);
      if (dupe) {
        if (s.includes('OR IGNORE')) return { run: true, changes: 0 };
        throw new Error('UNIQUE constraint failed: connections.from_id, connections.to_id, connections.label');
      }
      tables.connections.push({ id, from_id, to_id, label, created_at });
      return { run: true, changes: 1 };
    }

    // SELECT * FROM connections WHERE id = ?
    if (s.startsWith('SELECT') && s.includes('FROM connections WHERE id = ?')) {
      const row = tables.connections.find((c) => c.id === params[0]) ?? null;
      return { first: row };
    }

    // DELETE FROM connections WHERE id = ?
    if (s.startsWith('DELETE FROM connections WHERE id = ?')) {
      tables.connections = tables.connections.filter((c) => c.id !== params[0]);
      return { run: true };
    }

    // DELETE FROM connections WHERE to_id = ? AND label='tagged_with'
    if (s.startsWith('DELETE FROM connections WHERE to_id = ?')) {
      tables.connections = tables.connections.filter((c) => !(c.to_id === params[0] && c.label === 'tagged_with'));
      return { run: true };
    }

    // UPDATE ideas SET title=?, updated_at=? WHERE id=? AND type='tag'
    if (s.startsWith("UPDATE ideas SET title = ?, updated_at = ? WHERE id = ? AND type = 'tag'")) {
      const [title, updated_at, id] = params;
      const idx = tables.ideas.findIndex((r) => r.id === id && r.type === 'tag');
      if (idx >= 0) Object.assign(tables.ideas[idx], { title, updated_at });
      return { run: true };
    }

    // DELETE FROM ideas WHERE id = ? AND type = 'tag'
    if (s.startsWith("DELETE FROM ideas WHERE id = ? AND type = 'tag'")) {
      const id = params[0];
      // Cascade simulation:
      tables.ideas = tables.ideas.filter((r) => !(r.id === id && r.type === 'tag'));
      tables.connections = tables.connections.filter((c) => c.from_id !== id && c.to_id !== id);
      return { run: true };
    }

    // INSERT INTO ideas
    if (s.startsWith('INSERT INTO ideas')) {
      // New signature: (id, type, title, url, summary, body, r2_key, created_at, updated_at)
      const [id, type, title, url, summary, body, r2_key, created_at, updated_at] = params;
      tables.ideas.push({
        id,
        type,
        title,
        url,
        summary,
        body,
        r2_key,
        created_at,
        updated_at,
        rowid: tables.ideas.length + 1,
      });
      return { run: true };
    }

    // SELECT * FROM ideas WHERE id = ?
    if (s.startsWith('SELECT') && s.includes('FROM ideas') && s.includes('WHERE id = ?') && !s.includes('JOIN')) {
      const row = tables.ideas.find((r) => r.id === params[0]) ?? null;
      return { first: row, all: row ? [row] : [] };
    }

    // SELECT * FROM ideas WHERE url = ? [AND type = ?] LIMIT 1
    if (s.includes('FROM ideas WHERE url = ?')) {
      let rows = tables.ideas.filter((r) => r.url === params[0]);
      if (s.includes('AND type = ?')) rows = rows.filter((r) => r.type === params[1]);
      const row = rows[0] ?? null;
      return { first: row, all: row ? [row] : [] };
    }

    // SELECT * FROM ideas WHERE 1=1 ... (list)
    if (s.includes('FROM ideas') && s.includes('WHERE 1=1')) {
      let rows = [...tables.ideas];
      let pi = 0;
      if (s.includes('AND type = ?')) {
        rows = rows.filter((r) => r.type === params[pi++]);
      }
      if (s.includes('AND url = ?')) {
        rows = rows.filter((r) => r.url === params[pi++]);
      }
      if (s.includes('AND created_at < ?')) {
        const cursor = Number(params[pi++]);
        rows = rows.filter((r) => r.created_at < cursor);
      }
      rows.sort((a, b) => b.created_at - a.created_at);
      const limit = Number(params[params.length - 1]);
      rows = rows.slice(0, limit);
      return { all: rows };
    }

    // UPDATE ideas SET body = ?, updated_at = ? WHERE id = ?  (setIdeaBody)
    if (s.startsWith('UPDATE ideas SET body = ?, updated_at = ? WHERE id = ?')) {
      const [body, updated_at, id] = params;
      const idx = tables.ideas.findIndex((r) => r.id === id);
      if (idx >= 0) Object.assign(tables.ideas[idx], { body, updated_at });
      return { run: true };
    }

    // UPDATE ideas SET title=?, url=?, summary=?, body=?, updated_at=? WHERE id=?
    if (s.startsWith('UPDATE ideas SET title = ?, url = ?, summary = ?, body = ?, updated_at = ? WHERE id = ?')) {
      const [title, url, summary, body, updated_at, id] = params;
      const idx = tables.ideas.findIndex((r) => r.id === id);
      if (idx >= 0) Object.assign(tables.ideas[idx], { title, url, summary, body, updated_at });
      return { run: true };
    }

    // UPDATE ideas SET title=?, url=?, summary=?, updated_at=? WHERE id=?
    if (s.startsWith('UPDATE ideas SET title = ?, url = ?, summary = ?, updated_at = ? WHERE id = ?')) {
      const [title, url, summary, updated_at, id] = params;
      const idx = tables.ideas.findIndex((r) => r.id === id);
      if (idx >= 0) Object.assign(tables.ideas[idx], { title, url, summary, updated_at });
      return { run: true };
    }

    // UPDATE ideas (legacy / fallthrough)
    if (s.startsWith('UPDATE ideas')) {
      const [title, url, summary, updated_at, id] = params;
      const idx = tables.ideas.findIndex((r) => r.id === id);
      if (idx >= 0) Object.assign(tables.ideas[idx], { title, url, summary, updated_at });
      return { run: true };
    }

    // DELETE FROM ideas
    if (s.startsWith('DELETE FROM ideas')) {
      tables.ideas = tables.ideas.filter((r) => r.id !== params[0]);
      return { run: true };
    }

    // Connections for idea
    if (s.includes('FROM connections') && s.includes('WHERE c.from_id = ? OR c.to_id = ?')) {
      return { all: [] };
    }

    // INSERT INTO notes (id, idea_id, body, created_at, updated_at)
    if (s.startsWith('INSERT INTO notes')) {
      const [id, idea_id, body, created_at, updated_at] = params;
      tables.notes.push({ id, idea_id, body, created_at, updated_at });
      return { run: true };
    }

    // Notes for idea
    if (s.includes('FROM notes WHERE idea_id')) {
      const rows = tables.notes.filter((n) => n.idea_id === params[0]).sort((a, b) => a.created_at - b.created_at);
      return { all: rows };
    }

    // SELECT * FROM notes WHERE id = ?
    if (s.includes('FROM notes WHERE id = ?')) {
      const row = tables.notes.find((n) => n.id === params[0]) ?? null;
      return { first: row };
    }

    // Media for idea
    if (s.includes('FROM media WHERE idea_id')) {
      return { all: [] };
    }

    // OAuth token check
    if (s.includes('FROM oauth_tokens')) {
      const row = tables.oauth_tokens.find((r) => r.token === params[0]) ?? null;
      return { first: row };
    }

    // FTS search
    if (s.includes('ideas_fts MATCH')) {
      const q = (params[0] ?? '').toLowerCase();
      const limit = Number(params[1]) || 20;
      const rows = tables.ideas
        .filter(
          (r) =>
            (r.title && r.title.toLowerCase().includes(q)) ||
            (r.summary && r.summary.toLowerCase().includes(q)) ||
            (r.body && r.body.toLowerCase().includes(q)),
        )
        .slice(0, limit);
      return { all: rows };
    }

    // Default — return empty
    return { first: null, all: [], run: true };
  }

  // matchQuery may throw (used for UNIQUE constraint sim); rethrow lazily
  // from first/all/run so callers see the same shape as D1.
  function execute(sql, params) {
    let result;
    let thrown;
    try {
      result = matchQuery(sql, params);
    } catch (err) {
      thrown = err;
      result = {};
    }
    return {
      async first() {
        if (thrown) throw thrown;
        return result.first ?? null;
      },
      async all() {
        if (thrown) throw thrown;
        return { results: result.all ?? [] };
      },
      async run() {
        if (thrown) throw thrown;
        return { meta: { changes: result.changes ?? 1 } };
      },
    };
  }

  return {
    _tables: tables,
    prepare(sql) {
      // Support both prepare().bind(...).run() and the bind-less
      // prepare().all() form used by some queries with no parameters.
      return {
        bind(...params) {
          return execute(sql, params);
        },
        first: () => execute(sql, []).first(),
        all: () => execute(sql, []).all(),
        run: () => execute(sql, []).run(),
      };
    },
  };
}

// ── Create full mock env ─────────────────────────────────────────────

export function createMockEnv(overrides = {}) {
  return {
    DB: createMockDB(),
    R2: createMockR2(),
    API_KEY: 'test-api-key',
    AI: { run: async () => ({ response: 'mock' }) },
    ...overrides,
  };
}

// ── Request helper ───────────────────────────────────────────────────

export function apiRequest(app, path, options = {}) {
  const { method = 'GET', body, token = 'test-api-key', headers = {} } = options;
  const init = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
  };
  if (body) init.body = JSON.stringify(body);
  return app.request(path, init);
}
