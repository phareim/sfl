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
      body = notesRow?.body ?? blob.body ?? blob.text ?? blob.content ?? '';
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
 * The page size a caller asked for, at most 100. Anything that is no positive whole number is the default: SQLite
 * reads a negative LIMIT as no limit at all and refuses a fraction.
 */
const MAX_RUN = 1000; // ideas sharing one created_at that a page takes in whole

function pageSize(limit) {
  const n = Number(limit);
  return Number.isInteger(n) && n > 0 ? Math.min(n, 100) : 20;
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
 * Fetch the idea rows for a list of ids, in one query. Ids that match nothing
 * are simply absent from the answer.
 */
export async function getIdeasByIds(db, ids) {
  if (!ids.length) return [];
  const marks = ids.map(() => '?').join(',');
  const { results } = await db.prepare(`SELECT * FROM ideas WHERE id IN (${marks})`).bind(...ids).all();
  return results ?? [];
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
  limit = pageSize(limit);

  // One query shape for both the page and, below, the rest of a run of equal timestamps.
  function select(createdOp, createdValue, rowLimit) {
    const p = tag ? 'i.' : '';
    const clauses = [];
    const params = [];
    if (tag) params.push(tag, tag);
    if (type) {
      clauses.push(`AND ${p}type = ?`);
      params.push(type);
    }
    if (url) {
      clauses.push(`AND ${p}url = ?`);
      params.push(url);
    }
    if (createdOp) {
      clauses.push(`AND ${p}created_at ${createdOp} ?`);
      params.push(createdValue);
    }
    params.push(rowLimit);
    const sql = tag
      ? `
      SELECT i.* FROM ideas i
      JOIN connections c ON c.from_id = i.id AND c.label = 'tagged_with'
      JOIN ideas t ON t.id = c.to_id AND t.type = 'tag'
      WHERE (t.id = ? OR t.title = ?)
      ${clauses.join('\n      ')}
      ORDER BY i.created_at DESC
      LIMIT ?
    `
      : `
      SELECT * FROM ideas
      WHERE 1=1
      ${clauses.join('\n      ')}
      ORDER BY created_at DESC
      LIMIT ?
    `;
    return db
      .prepare(sql)
      .bind(...params)
      .all()
      .then((r) => r.results);
  }

  let results = await select(cursor ? '<' : null, Number(cursor), limit + 1);

  let nextCursor = null;
  if (results.length > limit) {
    const extra = results.pop();
    nextCursor = results[results.length - 1].created_at;
    // The cursor is a timestamp and the next page starts below it, so a page that ends inside a run of ideas saved
    // in the same millisecond would skip the rest of the run. Such a page runs to the end of the run instead.
    if (extra.created_at === nextCursor) {
      const run = (await select('=', nextCursor, MAX_RUN)).filter((r) => r.created_at === nextCursor);
      results = [...results.filter((r) => r.created_at !== nextCursor), ...run];
    }
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
/**
 * A user's words as an FTS5 query: every word a quoted term, all of them required. A word ending in `*` matches by
 * prefix. Quoting keeps apostrophes, colons, hyphens and FTS keywords in a query from being read as syntax, which
 * SQLite answers with an error. Returns '' when there is nothing to search for.
 */
export function ftsQuery(input) {
  return String(input ?? '')
    .split(/\s+/)
    .map((word) => {
      const prefix = word.endsWith('*');
      const term = word.replace(/["*]/g, '');
      return term ? `"${term}"${prefix ? '*' : ''}` : '';
    })
    .filter(Boolean)
    .join(' ');
}

export async function searchIdeas(db, query, { limit = 20 } = {}) {
  limit = pageSize(limit);
  const match = ftsQuery(query);
  if (!match) return [];
  const { results } = await db
    .prepare(
      `SELECT i.* FROM ideas i
       JOIN ideas_fts f ON i.rowid = f.rowid
       WHERE ideas_fts MATCH ?
       ORDER BY rank
       LIMIT ?`,
    )
    .bind(match, limit)
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
