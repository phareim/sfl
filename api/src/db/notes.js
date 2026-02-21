/**
 * D1 query helpers for the notes table.
 */

export async function insertNote(db, { id, idea_id, body, created_at, updated_at }) {
  await db
    .prepare(
      `INSERT INTO notes (id, idea_id, body, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`
    )
    .bind(id, idea_id, body, created_at, updated_at)
    .run();
}

export async function getNote(db, id) {
  return db.prepare('SELECT * FROM notes WHERE id = ?').bind(id).first();
}

export async function updateNote(db, id, { body, updated_at }) {
  await db
    .prepare('UPDATE notes SET body = ?, updated_at = ? WHERE id = ?')
    .bind(body, updated_at, id)
    .run();
}

export async function deleteNote(db, id) {
  await db.prepare('DELETE FROM notes WHERE id = ?').bind(id).run();
}
