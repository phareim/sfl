import { Hono } from 'hono';

const github = new Hono();

// GET /api/github/repos?q=query
// Proxies GitHub repo search using the server-side GITHUB_TOKEN secret.
github.get('/repos', async (c) => {
  const q = c.req.query('q');
  if (!q || q.trim().length < 2) return c.json({ items: [] });

  const token = c.env.GITHUB_TOKEN;
  if (!token) return c.json({ error: 'GITHUB_TOKEN not configured' }, 503);

  const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&per_page=10&sort=updated`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'sfl-app',
    },
  });

  if (!res.ok) {
    return c.json({ error: `GitHub API error: ${res.status}` }, 502);
  }

  const json = await res.json();
  const items = (json.items ?? []).map((r) => ({
    full_name: r.full_name,
    html_url: r.html_url,
    description: r.description,
    private: r.private,
  }));

  return c.json({ items });
});

export default github;
