-- Migration 001 — adds body column to ideas, rebuilds ideas_fts to cover body,
-- and adds saved_searches + saved_search_hits tables (G8).
--
-- D1 has no IF NOT EXISTS on ALTER, and no native migration runner. This file
-- is idempotent at the table level (`CREATE TABLE IF NOT EXISTS`) but the
-- `ALTER TABLE ideas ADD COLUMN body` line will fail on the second run.
-- That's expected — apply once, then the schema.sql is the source of truth
-- for any fresh DB.
--
-- Apply: cd ~/github/sfl/api && npx wrangler d1 execute sfl-db --remote --file=src/db/migration-001-body-saved-searches.sql

ALTER TABLE ideas ADD COLUMN body TEXT;

DROP TRIGGER IF EXISTS ideas_fts_insert;
DROP TRIGGER IF EXISTS ideas_fts_update;
DROP TRIGGER IF EXISTS ideas_fts_delete;
DROP TABLE IF EXISTS ideas_fts;

CREATE VIRTUAL TABLE ideas_fts USING fts5(
  title, summary, body, content=ideas, content_rowid=rowid
);

CREATE TRIGGER ideas_fts_insert AFTER INSERT ON ideas BEGIN
  INSERT INTO ideas_fts(rowid, title, summary, body) VALUES (new.rowid, new.title, new.summary, new.body);
END;

CREATE TRIGGER ideas_fts_update AFTER UPDATE ON ideas BEGIN
  INSERT INTO ideas_fts(ideas_fts, rowid, title, summary, body)
    VALUES ('delete', old.rowid, old.title, old.summary, old.body);
  INSERT INTO ideas_fts(rowid, title, summary, body) VALUES (new.rowid, new.title, new.summary, new.body);
END;

CREATE TRIGGER ideas_fts_delete AFTER DELETE ON ideas BEGIN
  INSERT INTO ideas_fts(ideas_fts, rowid, title, summary, body)
    VALUES ('delete', old.rowid, old.title, old.summary, old.body);
END;

-- Rebuild the FTS index against existing rows so the title+summary content
-- comes back online immediately. Bodies fill in via the backfill script.
INSERT INTO ideas_fts(ideas_fts) VALUES ('rebuild');

-- G8: saved searches
CREATE TABLE IF NOT EXISTS saved_searches (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  query      TEXT NOT NULL,
  label      TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS saved_search_hits (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  saved_search_id  INTEGER NOT NULL REFERENCES saved_searches(id) ON DELETE CASCADE,
  idea_id          TEXT NOT NULL,
  seen_at          INTEGER NOT NULL,
  UNIQUE(saved_search_id, idea_id)
);
CREATE INDEX IF NOT EXISTS idx_saved_search_hits_search ON saved_search_hits(saved_search_id);
