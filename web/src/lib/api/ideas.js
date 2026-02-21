import { apiFetch } from './client.js';

export function listIdeas(params = {}) {
  const qs = new URLSearchParams(
    Object.fromEntries(Object.entries(params).filter(([, v]) => v != null))
  ).toString();
  return apiFetch(`/api/ideas${qs ? `?${qs}` : ''}`);
}

export function getIdea(id) {
  return apiFetch(`/api/ideas/${id}`);
}

export function createIdea(body) {
  return apiFetch('/api/ideas', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export function updateIdea(id, body) {
  return apiFetch(`/api/ideas/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export function deleteIdea(id) {
  return apiFetch(`/api/ideas/${id}`, { method: 'DELETE' });
}

export function searchIdeas(q, params = {}) {
  const qs = new URLSearchParams({ q, ...params }).toString();
  return apiFetch(`/api/ideas/search?${qs}`);
}
