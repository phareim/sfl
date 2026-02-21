import { apiFetch } from './client.js';

export function createConnection(body) {
  return apiFetch('/api/connections', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export function deleteConnection(id) {
  return apiFetch(`/api/connections/${id}`, { method: 'DELETE' });
}
