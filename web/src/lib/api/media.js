import { apiFetch } from './client.js';

function getApiUrl() {
  return (localStorage.getItem('sfl_api_url') ?? '').replace(/\/$/, '');
}

function getApiKey() {
  return localStorage.getItem('sfl_api_key') ?? '';
}

export async function uploadMedia(ideaId, file) {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`${getApiUrl()}/api/ideas/${ideaId}/media`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${getApiKey()}` },
    body: form,
  });
  if (!res.ok) throw new Error(`Upload failed: ${res.statusText}`);
  return res.json();
}

export function getMediaUrl(id) {
  return `${getApiUrl()}/api/media/${id}/url?key=${getApiKey()}`;
}

export function deleteMedia(id) {
  return apiFetch(`/api/media/${id}`, { method: 'DELETE' });
}
