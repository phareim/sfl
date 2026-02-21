import { Hono } from 'hono';
import { generateId } from '../lib/nanoid.js';
import { badRequest, notFound } from '../lib/errors.js';
import { insertNote, getNote, updateNote, deleteNote } from '../db/notes.js';
import { getIdea } from '../db/ideas.js';

const notes = new Hono();

// POST /api/ideas/:id/notes  — mounted under /api/ideas, so param is :id
notes.post('/', async (c) => {
  const idea_id = c.req.param('id');
  const idea = await getIdea(c.env.DB, idea_id);
  if (!idea) return notFound('Idea not found');

  let body;
  try {
    body = await c.req.json();
  } catch {
    return badRequest('Invalid JSON');
  }

  const { body: noteBody } = body;
  if (!noteBody) return badRequest('body is required');

  const id = generateId();
  const now = Date.now();
  await insertNote(c.env.DB, { id, idea_id, body: noteBody, created_at: now, updated_at: now });

  const note = await getNote(c.env.DB, id);
  return c.json({ note }, 201);
});

// Standalone notes router for PUT/DELETE (mounted at /api/notes)
export const notesStandalone = new Hono();

notesStandalone.put('/:id', async (c) => {
  const id = c.req.param('id');
  const existing = await getNote(c.env.DB, id);
  if (!existing) return notFound('Note not found');

  let body;
  try {
    body = await c.req.json();
  } catch {
    return badRequest('Invalid JSON');
  }

  const { body: noteBody } = body;
  if (!noteBody) return badRequest('body is required');

  await updateNote(c.env.DB, id, { body: noteBody, updated_at: Date.now() });
  const note = await getNote(c.env.DB, id);
  return c.json({ note });
});

notesStandalone.delete('/:id', async (c) => {
  const id = c.req.param('id');
  const existing = await getNote(c.env.DB, id);
  if (!existing) return notFound('Note not found');

  await deleteNote(c.env.DB, id);
  return c.json({ deleted: id });
});

export default notes;
