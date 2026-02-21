CREATE TABLE IF NOT EXISTS ideas (
  id         TEXT PRIMARY KEY,
  type       TEXT NOT NULL,
  title      TEXT,
  url        TEXT,
  summary    TEXT,
  r2_key     TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS connections (
  id         TEXT PRIMARY KEY,
  from_id    TEXT NOT NULL REFERENCES ideas(id) ON DELETE CASCADE,
  to_id      TEXT NOT NULL REFERENCES ideas(id) ON DELETE CASCADE,
  label      TEXT,
  created_at INTEGER NOT NULL,
  UNIQUE(from_id, to_id, label)
);

CREATE TABLE IF NOT EXISTS notes (
  id         TEXT PRIMARY KEY,
  idea_id    TEXT NOT NULL REFERENCES ideas(id) ON DELETE CASCADE,
  body       TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS media (
  id         TEXT PRIMARY KEY,
  idea_id    TEXT NOT NULL REFERENCES ideas(id) ON DELETE CASCADE,
  r2_key     TEXT NOT NULL UNIQUE,
  filename   TEXT NOT NULL,
  mime_type  TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_connections_from ON connections(from_id);
CREATE INDEX IF NOT EXISTS idx_connections_to   ON connections(to_id);
CREATE INDEX IF NOT EXISTS idx_notes_idea       ON notes(idea_id);
CREATE INDEX IF NOT EXISTS idx_media_idea       ON media(idea_id);
CREATE INDEX IF NOT EXISTS idx_ideas_type       ON ideas(type);
CREATE INDEX IF NOT EXISTS idx_ideas_created    ON ideas(created_at DESC);

CREATE VIRTUAL TABLE IF NOT EXISTS ideas_fts USING fts5(
  title, summary, content=ideas, content_rowid=rowid
);

CREATE TRIGGER IF NOT EXISTS ideas_fts_insert AFTER INSERT ON ideas BEGIN
  INSERT INTO ideas_fts(rowid, title, summary) VALUES (new.rowid, new.title, new.summary);
END;

CREATE TRIGGER IF NOT EXISTS ideas_fts_update AFTER UPDATE ON ideas BEGIN
  INSERT INTO ideas_fts(ideas_fts, rowid, title, summary)
    VALUES ('delete', old.rowid, old.title, old.summary);
  INSERT INTO ideas_fts(rowid, title, summary) VALUES (new.rowid, new.title, new.summary);
END;

CREATE TRIGGER IF NOT EXISTS ideas_fts_delete AFTER DELETE ON ideas BEGIN
  INSERT INTO ideas_fts(ideas_fts, rowid, title, summary)
    VALUES ('delete', old.rowid, old.title, old.summary);
END;
