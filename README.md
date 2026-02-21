# SFL — Save For Later

Personal idea-capture tool. Everything becomes an **idea** — web pages, quotes, images, tweets, books, notes, conversations. Ideas connect to each other as a graph, support annotations, and tags are themselves ideas.

Deploys entirely to **Cloudflare** (Worker + Pages + D1 + R2). Single-user, JavaScript.

---

## Architecture

| Layer | Tech | What it does |
|---|---|---|
| API | Cloudflare Worker + Hono.js | REST API, auth, D1 + R2 glue |
| Database | D1 (SQLite) | Queryable metadata, FTS5 search |
| Storage | R2 | Per-type JSON blobs + media files |
| Web | SvelteKit (static) + Cloudflare Pages | UI: list, detail, graph, tags |
| Extension | Chrome MV3 | Right-click save, popup quick-capture |
| Graph | Sigma.js + Graphology | WebGL force-directed graph |

**Key idea:** D1 holds only indexed metadata. All type-specific content lives as a JSON blob in R2 at `ideas/{id}/data.json` — no schema migrations as types evolve.

---

## First-time setup

### 1. Create Cloudflare resources

```bash
wrangler d1 create sfl-db
# → paste the database_id into api/wrangler.toml

wrangler r2 bucket create sfl-data
```

### 2. Initialize the database schema

```bash
cd api
npm install
npm run db:init        # remote D1
npm run db:init:local  # local dev
```

### 3. Set the API key secret

```bash
wrangler secret put API_KEY
# → enter a strong random string; keep it safe
```

### 4. Deploy the Worker

```bash
cd api
npm run deploy
# → note the deployed URL, e.g. https://sfl-api.your-worker.workers.dev
```

### 5. Build and deploy the web app

```bash
cd web
npm install
npm run build
# → deploy the build/ directory to Cloudflare Pages
```

Then open the web app, go to **Settings**, and enter your Worker URL + API key.

### 6. Load the Chrome extension

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked** → select the `chrome-extension/` directory
4. Click the extension icon → **⚙ Settings** → enter Worker URL + API key

You also need to generate icons (the directory only contains a README):

```bash
# ImageMagick
for size in 16 48 128; do
  convert -size ${size}x${size} xc:#1a73e8 chrome-extension/icons/icon-${size}.png
done
```

---

## API

All routes require `Authorization: Bearer <API_KEY>`.

```
GET    /api/ideas                    list (paginated, ?type=, ?tag=, ?limit=, ?cursor=)
POST   /api/ideas                    create idea
GET    /api/ideas/search?q=term      full-text search
GET    /api/ideas/:id                idea + connections + notes + media
PUT    /api/ideas/:id                update
DELETE /api/ideas/:id                delete (cascades R2 objects)

POST   /api/connections              create edge { from_id, to_id, label }
DELETE /api/connections/:id

POST   /api/ideas/:id/notes          add note
PUT    /api/notes/:id
DELETE /api/notes/:id

POST   /api/ideas/:id/media          upload file (multipart)
GET    /api/media/:id/url            stream media file
DELETE /api/media/:id

GET    /api/tags                     tags with usage counts
GET    /api/graph                    all nodes + edges
GET    /api/graph/:id/neighbors      idea + 1-hop neighbors
GET    /health                       health check (no auth)
```

### Create idea body

```json
{
  "type": "note",
  "title": "Optional title",
  "url": "https://...",
  "summary": "Short excerpt for search",
  "data": { "content": "Markdown content..." }
}
```

---

## Data model

Tags are ideas with `type = 'tag'`. Tagging = connection with `label = 'tagged_with'`.

See `api/src/db/schema.sql` for the full D1 schema.

---

## Local development

```bash
cd api && npm run dev    # wrangler dev (local D1 + R2)
cd web && npm run dev    # vite dev server
```

Set `sfl_api_url` to `http://localhost:8787` and `sfl_api_key` to your local key in the web app Settings.
