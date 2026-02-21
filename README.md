# SFL — Save For Later

Personal idea-capture tool. Everything becomes an **idea** — web pages, quotes, images, tweets, books, notes, conversations. Ideas connect to each other as a graph, support annotations, and tags are themselves ideas.

Deploys entirely to **Cloudflare** (Worker + Pages + D1 + R2). Single-user, JavaScript. Pushes to `master` deploy automatically via GitHub Actions.

**Live:**
- Web app: https://sfl-web.pages.dev
- API: https://sfl-api.aiwdm.workers.dev

---

## Features

- **Capture anything** — pages, quotes, tweets, images, books, notes
- **Social post detection** — X/Twitter, Threads, and Bluesky URLs are automatically saved as `type: tweet` with author, platform, and post text extracted from the DOM
- **Image upload** — pick a local file or paste a URL; the Worker fetches and stores the binary in R2 so you own a copy
- **Graph view** — WebGL force-directed graph (Sigma.js + ForceAtlas2); click a node to navigate
- **Full-text search** — FTS5 on title + summary
- **Tags** — tags are ideas; tagging is a graph edge. Add/remove/create tags inline on any idea's detail page
- **Notes** — annotate any idea with freeform notes, editable in place
- **Media gallery** — attach files to any idea; served directly from R2
- **Chrome extension** — right-click context menus, popup quick-capture, options page

---

## Architecture

| Layer | Tech | What it does |
|---|---|---|
| API | Cloudflare Worker + Hono.js | REST API, Bearer auth, D1 + R2 glue |
| Database | D1 (SQLite) | Queryable metadata, FTS5 search |
| Storage | R2 | Per-type JSON blobs + media binaries |
| Web | SvelteKit (static) + Cloudflare Pages | UI: list, detail, graph, tags, settings |
| Extension | Chrome MV3 | Context menus, popup, social detection |
| Graph | Sigma.js + Graphology | WebGL rendering, ForceAtlas2 layout |
| CI/CD | GitHub Actions | Deploy on push to master |

**Key idea:** D1 holds only indexed metadata. All type-specific content lives as a JSON blob in R2 at `ideas/{id}/data.json` — no schema migrations needed as types evolve.

---

## Idea types

| Type | R2 data blob fields |
|---|---|
| `page` | `url`, `title`, `selected_text` |
| `tweet` | `url`, `text`, `author`, `platform`, `post_id` |
| `quote` | `text`, `attribution`, `source_url` |
| `image` | `source_url`, `caption` |
| `book` | `title`, `author`, `isbn`, `cover_url` |
| `note` | `content` |
| `text` | `content` |
| `tag` | _(no data; the title is the tag name)_ |

Tags are ideas with `type = 'tag'`. Tagging an idea = creating a connection with `label = 'tagged_with'`.

---

## Chrome extension

### What it captures

| Action | Result |
|---|---|
| Right-click selected text → **Save selection to SFL** | `type: quote` with selected text + source URL |
| Right-click page → **Save page to SFL** | `type: page`, or `type: tweet` if URL is a social post |
| Right-click image → **Save image to SFL** | `type: image` + binary uploaded to R2 |
| Click extension icon (popup) | Quick-capture with type auto-detection and tag picker |

### Social post auto-detection

Opening any of these URLs and saving (popup or right-click) automatically sets `type: tweet` and tries to extract the post text from the DOM:

| Platform | URL pattern |
|---|---|
| X / Twitter | `x.com/{user}/status/{id}` |
| Threads | `threads.com/@{user}/post/{id}` |
| Bluesky | `bsky.app/profile/{user}/post/{id}` |

### Setup

1. `chrome://extensions` → enable **Developer mode** → **Load unpacked** → select `chrome-extension/`
2. Click ⚙ on the extension → enter your Worker URL and API key

---

## First-time deployment

### 1. Create Cloudflare resources

```bash
npx wrangler d1 create sfl-db
# → paste the database_id into api/wrangler.toml

npx wrangler r2 bucket create sfl-data
```

### 2. Initialize the database schema

```bash
cd api
npm install
npx wrangler d1 execute sfl-db --remote --file=src/db/schema.sql
```

### 3. Set the API key

```bash
npx wrangler secret put API_KEY
# → any strong random string, e.g. openssl rand -hex 32
```

### 4. Deploy the Worker

```bash
cd api && npx wrangler deploy
```

### 5. Deploy the web app

```bash
cd web
npm install && npm run build
npx wrangler pages project create sfl-web --production-branch master
npx wrangler pages deploy build --project-name sfl-web
```

Open the web app → **Settings** → enter your Worker URL and API key.

### 6. CI/CD (GitHub Actions)

Add a `CLOUDFLARE_API_TOKEN` secret to your GitHub repo:

1. [Create a token](https://dash.cloudflare.com/profile/api-tokens) using the **Edit Cloudflare Workers** template, plus **Cloudflare Pages: Edit** permission
2. **GitHub repo → Settings → Secrets → Actions → New repository secret** → name: `CLOUDFLARE_API_TOKEN`

After that, every push to `master` deploys both the Worker and Pages automatically.

---

## API

All routes require `Authorization: Bearer <API_KEY>`.

```
GET    /api/ideas                     list (paginated, ?type=, ?tag=, ?limit=, ?cursor=)
POST   /api/ideas                     create idea
GET    /api/ideas/search?q=term       FTS5 full-text search
GET    /api/ideas/:id                 idea + connections + notes + media list
PUT    /api/ideas/:id                 update metadata + replace R2 blob
DELETE /api/ideas/:id                 delete (cascades connections/notes/media + R2)

POST   /api/connections               create edge { from_id, to_id, label }
DELETE /api/connections/:id           delete edge

POST   /api/ideas/:id/notes           add note { body }
PUT    /api/notes/:id                 update note { body }
DELETE /api/notes/:id                 delete note

POST   /api/ideas/:id/media           upload file (multipart/form-data, field: file)
POST   /api/ideas/:id/media/fetch     fetch image by URL server-side { url }
GET    /api/media/:id/url             stream media file from R2
DELETE /api/media/:id                 delete from R2 + DB

GET    /api/tags                      all tags with usage counts
GET    /api/graph                     { nodes: [...ideas], edges: [...connections] }
GET    /api/graph/:id/neighbors       idea + immediate neighbors (1-hop)
GET    /health                        health check (no auth required)
```

### Create idea — example body

```json
{
  "type": "tweet",
  "title": "Interesting take on AI",
  "url": "https://x.com/someone/status/123",
  "summary": "First 200 chars for search...",
  "data": {
    "text": "Full post text",
    "author": "@someone",
    "platform": "twitter",
    "post_id": "123"
  }
}
```

---

## Local development

```bash
# Terminal 1 — API (local D1 + R2 via Wrangler)
cd api && npm run dev

# Terminal 2 — Web
cd web && npm run dev
```

In the web app Settings, set API URL to `http://localhost:8787` and enter any string as the API key (local Wrangler doesn't enforce it by default — add `[vars] API_KEY = "dev"` to `wrangler.toml` for local auth).

---

## Data model

See [`api/src/db/schema.sql`](api/src/db/schema.sql) for the full D1 schema.

```
ideas        id | type | title | url | summary | r2_key | created_at | updated_at
connections  id | from_id | to_id | label | created_at
notes        id | idea_id | body | created_at | updated_at
media        id | idea_id | r2_key | filename | mime_type | size_bytes | created_at
ideas_fts    FTS5 virtual table on title + summary (auto-synced via triggers)
```

R2 layout:
```
ideas/{id}/data.json          ← type-specific JSON blob
ideas/{id}/media/{filename}   ← binary files
```
