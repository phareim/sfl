import { Hono } from 'hono';
import { getIdea, getIdeaNotes, projectBody, setIdeaBody } from '../db/ideas.js';
import { deleteNote, getNote, insertNote, updateNote } from '../db/notes.js';
import { badRequest, notFound } from '../lib/errors.js';
import { generateId } from '../lib/nanoid.js';
import { getJson } from '../lib/r2.js';

export async function resyncNoteIdeaBody(env, idea_id) {
  const idea = await getIdea(env.DB, idea_id);
  if (!idea || idea.type !== 'note') return;
  const data = (await getJson(env.R2, idea.r2_key)) ?? {};
  const notesList = await getIdeaNotes(env.DB, idea_id);
  const body = projectBody('note', data, notesList[0]);
  await setIdeaBody(env.DB, idea_id, body);
}

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
  await resyncNoteIdeaBody(c.env, idea_id);

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
  await resyncNoteIdeaBody(c.env, existing.idea_id);
  const note = await getNote(c.env.DB, id);
  return c.json({ note });
});

notesStandalone.delete('/:id', async (c) => {
  const id = c.req.param('id');
  const existing = await getNote(c.env.DB, id);
  if (!existing) return notFound('Note not found');

  await deleteNote(c.env.DB, id);
  await resyncNoteIdeaBody(c.env, existing.idea_id);
  return c.json({ deleted: id });
});

export default notes;
