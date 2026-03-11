import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export function createDb(path) {
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  function makeStatement(sql, params = []) {
    return {
      bind(...bindParams) {
        return makeStatement(sql, bindParams);
      },
      async run() {
        return db.prepare(sql).run(...params);
      },
      async all() {
        return { results: db.prepare(sql).all(...params) };
      },
      async first() {
        return db.prepare(sql).get(...params) ?? null;
      },
    };
  }

  return {
    prepare(sql) {
      return makeStatement(sql);
    },
  };
}

export function initDb(dbPath) {
  const db = new Database(dbPath);
  const schema = readFileSync(join(__dirname, '../db/schema.sql'), 'utf8');
  db.exec(schema);
  db.close();
  console.log(`Database initialized at ${dbPath}`);
}
