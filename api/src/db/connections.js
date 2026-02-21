/**
 * D1 query helpers for the connections table.
 */

export async function insertConnection(db, { id, from_id, to_id, label, created_at }) {
  await db
    .prepare(
      `INSERT INTO connections (id, from_id, to_id, label, created_at)
       VALUES (?, ?, ?, ?, ?)`
    )
    .bind(id, from_id, to_id, label ?? null, created_at)
    .run();
}

export async function getConnection(db, id) {
  return db.prepare('SELECT * FROM connections WHERE id = ?').bind(id).first();
}

export async function deleteConnection(db, id) {
  await db.prepare('DELETE FROM connections WHERE id = ?').bind(id).run();
}

/**
 * Get all connections for graph view.
 */
export async function getAllConnections(db) {
  const { results } = await db
    .prepare('SELECT * FROM connections ORDER BY created_at DESC')
    .all();
  return results;
}
