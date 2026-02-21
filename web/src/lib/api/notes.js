import { apiFetch } from './client.js';

export function createNote(ideaId, body) {
  return apiFetch(`/api/ideas/${ideaId}/notes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export function updateNote(id, body) {
  return apiFetch(`/api/notes/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export function deleteNote(id) {
  return apiFetch(`/api/notes/${id}`, { method: 'DELETE' });
}
