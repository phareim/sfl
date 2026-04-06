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

    // INSERT INTO ideas
    if (s.startsWith('INSERT INTO ideas')) {
      const [id, type, title, url, summary, r2_key, created_at, updated_at] = params;
      tables.ideas.push({
        id,
        type,
        title,
        url,
        summary,
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

    // SELECT * FROM ideas WHERE url = ? LIMIT 1
    if (s.includes('FROM ideas WHERE url = ?')) {
      const row = tables.ideas.find((r) => r.url === params[0]) ?? null;
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

    // UPDATE ideas
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

    // Notes for idea
    if (s.includes('FROM notes WHERE idea_id')) {
      return { all: [] };
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
          (r) => (r.title && r.title.toLowerCase().includes(q)) || (r.summary && r.summary.toLowerCase().includes(q)),
        )
        .slice(0, limit);
      return { all: rows };
    }

    // Default — return empty
    return { first: null, all: [], run: true };
  }

  return {
    _tables: tables,
    prepare(sql) {
      return {
        bind(...params) {
          const result = matchQuery(sql, params);
          return {
            async first() {
              return result.first ?? null;
            },
            async all() {
              return { results: result.all ?? [] };
            },
            async run() {
              return {};
            },
          };
        },
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
