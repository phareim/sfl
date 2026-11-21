/**
 * A D1 stand-in that runs the real schema (api/src/db/schema.sql) in SQLite, for the tests where SQL semantics
 * matter: LIMIT, foreign keys, UNIQUE, FTS5. The hand-written mock in helpers.js answers by matching query text
 * and cannot show those.
 *
 * It behaves as D1 does where the two differ from a bare SQLite binding (checked against local workerd/miniflare):
 * binding `undefined` throws D1_TYPE_ERROR, a query takes at most 100 bound parameters, `run()` answers with
 * `meta.changes`, and foreign keys are enforced.
 *
 * `node:sqlite` needs Node 22.5 or newer. On an older Node `sqliteAvailable` is false and the suites skip.
 */
import { readFileSync } from 'node:fs';

const sqlite = await import('node:sqlite').catch(() => null);

export const sqliteAvailable = sqlite !== null;

const SCHEMA = new URL('../src/db/schema.sql', import.meta.url);
const MAX_BOUND_PARAMS = 100;

export function createSqliteD1() {
  const db = new sqlite.DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec(readFileSync(SCHEMA, 'utf8'));

  function execute(sql, params) {
    for (const p of params) {
      if (p === undefined) throw new Error("D1_TYPE_ERROR: Type 'undefined' not supported for value 'undefined'");
    }
    const bound = params.map((p) => (typeof p === 'boolean' ? Number(p) : p));

    function statement() {
      if (bound.length > MAX_BOUND_PARAMS) throw new Error('D1_ERROR: too many SQL variables: SQLITE_ERROR');
      try {
        return db.prepare(sql);
      } catch (err) {
        throw new Error(`D1_ERROR: ${err.message}`);
      }
    }

    function call(method) {
      const stmt = statement();
      try {
        return stmt[method](...bound);
      } catch (err) {
        throw new Error(`D1_ERROR: ${err.message}`);
      }
    }

    return {
      async first() {
        const row = call('get');
        return row ? { ...row } : null;
      },
      async all() {
        return { results: call('all').map((row) => ({ ...row })) };
      },
      async run() {
        const info = call('run');
        return { results: [], meta: { changes: Number(info.changes), last_row_id: Number(info.lastInsertRowid) } };
      },
    };
  }

  return {
    _db: db,
    prepare(sql) {
      return {
        bind: (...params) => execute(sql, params),
        first: () => execute(sql, []).first(),
        all: () => execute(sql, []).all(),
        run: () => execute(sql, []).run(),
      };
    },
  };
}
