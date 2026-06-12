/**
 * D1 query helpers for the ideas table.
 */

const MAX_BODY_BYTES = 1024 * 1024; // 1 MB cap to keep FTS sane.

/**
 * Project the per-kind R2 blob (and, for notes, the joined notes row) into a
 * single plain-text body string for FTS5 indexing. Always returns a string;
 * truncates at 1 MB.
 *
 * @param {string} kind     ideas.type
 * @param {object} blob     parsed R2 JSON blob (`{}` if missing)
 * @param {{body?:string}=} notesRow first joined notes row, for kind='note'
 */
export function projectBody(kind, blob, notesRow) {
  blob = blob ?? {};
  let body = '';

  switch (kind) {
    case 'note': {
      body = notesRow?.body ?? blob.body ?? blob.text ?? '';
      break;
    }
    case 'page': {
      body = blob.content_md ?? blob.html_excerpt ?? blob.text ?? blob.description ?? '';
      break;
    }
    case 'post':
    case 'tweet': {
      const t = blob.text ?? '';
      const q = blob.quoted_text ?? blob.quoted?.text ?? '';
      body = q ? `${t}\n${q}` : t;
      break;
    }
    case 'book': {
      const a = blob.author ?? '';
      const d = blob.description ?? '';
      body = a && d ? `${a}\n${d}` : a || d;
      break;
    }
    case 'quote': {
      body = blob.text ?? '';
      break;
    }
    case 'video': {
      body = blob.transcript ?? blob.description ?? '';
      break;
    }
    default:
      body = '';
  }

  if (typeof body !== 'string') body = String(body ?? '');
  if (body.length > MAX_BODY_BYTES) body = body.slice(0, MAX_BODY_BYTES);
  return body;
}

/**
 * Insert a new idea row.
 */
export async function insertIdea(db, { id, type, title, url, summary, body, r2_key, created_at, updated_at }) {
  await db
    .prepare(
      `INSERT INTO ideas (id, type, title, url, summary, body, r2_key, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(id, type, title ?? null, url ?? null, summary ?? null, body ?? null, r2_key, created_at, updated_at)
    .run();
}

/**
 * Fetch one idea row by id. Returns null if not found.
 */
export async function getIdea(db, id) {
  return db.prepare('SELECT * FROM ideas WHERE id = ?').bind(id).first();
}

/**
 * Fetch the first idea row matching a URL (and type, when given).
 * Returns null if not found. Dedup is type-scoped so e.g. a quote
 * captured from a page doesn't collide with the page idea itself.
 */
export async function getIdeaByUrl(db, url, type) {
  if (type) {
    return db.prepare('SELECT * FROM ideas WHERE url = ? AND type = ? LIMIT 1').bind(url, type).first();
  }
  return db.prepare('SELECT * FROM ideas WHERE url = ? LIMIT 1').bind(url).first();
}

/**
 * List ideas with optional cursor-based pagination and type/tag/url filter.
 * Returns { ideas, nextCursor }
 */
export async function listIdeas(db, { type, tag, url, limit = 20, cursor } = {}) {
  limit = Math.min(Number(limit) || 20, 100);

  let sql;
  let params;

  if (tag) {
    // Filter by tag via connections table
    const cursorClause = cursor ? 'AND i.created_at < ?' : '';
    const typeClause = type ? 'AND i.type = ?' : '';
    const urlClause = url ? 'AND i.url = ?' : '';
    sql = `
      SELECT i.* FROM ideas i
      JOIN connections c ON c.from_id = i.id AND c.label = 'tagged_with'
      JOIN ideas t ON t.id = c.to_id AND t.type = 'tag'
      WHERE (t.id = ? OR t.title = ?)
      ${typeClause}
      ${urlClause}
      ${cursorClause}
      ORDER BY i.created_at DESC
      LIMIT ?
    `;
    params = [tag, tag];
    if (type) params.push(type);
    if (url) params.push(url);
    if (cursor) params.push(Number(cursor));
    params.push(limit + 1);
  } else {
    const cursorClause = cursor ? 'AND created_at < ?' : '';
    const typeClause = type ? 'AND type = ?' : '';
    const urlClause = url ? 'AND url = ?' : '';
    sql = `
      SELECT * FROM ideas
      WHERE 1=1
      ${typeClause}
      ${urlClause}
      ${cursorClause}
      ORDER BY created_at DESC
      LIMIT ?
    `;
    params = [];
    if (type) params.push(type);
    if (url) params.push(url);
    if (cursor) params.push(Number(cursor));
    params.push(limit + 1);
  }

  const stmt = db.prepare(sql);
  const { results } = await stmt.bind(...params).all();

  let nextCursor = null;
  if (results.length > limit) {
    results.pop();
    nextCursor = results[results.length - 1].created_at;
  }

  return { ideas: results, nextCursor };
}

/**
 * Update an idea row. `body` is updated when provided (undefined leaves it
 * untouched; null clears it).
 */
export async function updateIdea(db, id, { title, url, summary, body, updated_at }) {
  if (body === undefined) {
    await db
      .prepare(`UPDATE ideas SET title = ?, url = ?, summary = ?, updated_at = ? WHERE id = ?`)
      .bind(title ?? null, url ?? null, summary ?? null, updated_at, id)
      .run();
  } else {
    await db
      .prepare(`UPDATE ideas SET title = ?, url = ?, summary = ?, body = ?, updated_at = ? WHERE id = ?`)
      .bind(title ?? null, url ?? null, summary ?? null, body ?? null, updated_at, id)
      .run();
  }
}

/**
 * Update only the body column on an idea row. Touches updated_at so the FTS
 * trigger fires.
 */
export async function setIdeaBody(db, id, body) {
  await db
    .prepare('UPDATE ideas SET body = ?, updated_at = ? WHERE id = ?')
    .bind(body ?? null, Date.now(), id)
    .run();
}

/**
 * Delete an idea row (cascades to connections, notes, media).
 */
export async function deleteIdea(db, id) {
  await db.prepare('DELETE FROM ideas WHERE id = ?').bind(id).run();
}

/**
 * Full-text search across title + summary + body.
 * Returns matching idea rows.
 */
export async function searchIdeas(db, query, { limit = 20 } = {}) {
  limit = Math.min(Number(limit) || 20, 100);
  const { results } = await db
    .prepare(
      `SELECT i.* FROM ideas i
       JOIN ideas_fts f ON i.rowid = f.rowid
       WHERE ideas_fts MATCH ?
       ORDER BY rank
       LIMIT ?`,
    )
    .bind(query, limit)
    .all();
  return results;
}

/**
 * Get connections for an idea (both directions).
 */
export async function getIdeaConnections(db, id) {
  const { results } = await db
    .prepare(
      `SELECT c.*,
              fi.id as from_id, fi.type as from_type, fi.title as from_title,
              ti.id as to_id, ti.type as to_type, ti.title as to_title
       FROM connections c
       JOIN ideas fi ON fi.id = c.from_id
       JOIN ideas ti ON ti.id = c.to_id
       WHERE c.from_id = ? OR c.to_id = ?`,
    )
    .bind(id, id)
    .all();
  return results;
}

/**
 * Get notes for an idea.
 */
export async function getIdeaNotes(db, id) {
  const { results } = await db.prepare('SELECT * FROM notes WHERE idea_id = ? ORDER BY created_at ASC').bind(id).all();
  return results;
}

/**
 * Get media for an idea.
 */
export async function getIdeaMedia(db, id) {
  const { results } = await db.prepare('SELECT * FROM media WHERE idea_id = ? ORDER BY created_at ASC').bind(id).all();
  return results;
}
