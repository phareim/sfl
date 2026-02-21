/**
 * Base API client. Reads config from localStorage.
 */

function getConfig() {
  if (typeof localStorage === 'undefined') return { apiUrl: '', apiKey: '' };
  return {
    apiUrl: localStorage.getItem('sfl_api_url') ?? '',
    apiKey: localStorage.getItem('sfl_api_key') ?? '',
  };
}

export async function apiFetch(path, options = {}) {
  const { apiUrl, apiKey } = getConfig();
  if (!apiUrl || !apiKey) throw new Error('API URL and key not configured. Open Settings.');

  const url = `${apiUrl.replace(/\/$/, '')}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      ...options.headers,
    },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? `HTTP ${res.status}`);
  }

  return res.json();
}
