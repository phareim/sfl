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
- **Claude / MCP** — remote MCP server with OAuth so Claude (Code or web) can capture and query ideas directly

---

## Architecture

| Layer | Tech | What it does |
|---|---|---|
| API | Cloudflare Worker + Hono.js | REST API, Bearer auth, D1 + R2 glue |
| Database | D1 (SQLite) | Queryable metadata, FTS5 search, OAuth state |
| Storage | R2 | Per-type JSON blobs + media binaries |
| Web | SvelteKit (static) + Cloudflare Pages | UI: list, detail, graph, tags, settings |
| Extension | Chrome MV3 | Context menus, popup, social detection |
| iOS | SwiftUI + Share Extension | Native capture from any app |
| MCP | Streamable HTTP + OAuth 2.0 | Claude Code and Claude.ai connector |
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
| `note` | `text` |
| `text` | `text` |
| `tag` | _(no data; the title is the tag name)_ |

Tags are ideas with `type = 'tag'`. Tagging an idea = creating a connection with `label = 'tagged_with'`.

---

## iOS app

Native SwiftUI app (iOS 16+) with a Share Extension for capturing from any app.

### Install

```bash
open ios/SFL.xcodeproj
# Signing & Capabilities → set Team for both targets (SFL + SFLShareExtension)
# Add App Group "group.no.phareim.sfl" to both targets
```

First launch: Settings → General → VPN & Device Management → Trust your cert.
Then open the app → Settings tab → enter your Worker URL and API key.

### Re-deploy from the command line

```bash
cd ios
make install   # build + push to connected iPhone
make devices   # list connected devices
```

Requires Xcode 15+, phone connected via USB and unlocked.

### Share Extension

In any app: Share → SFL (or More → enable SFL if not visible).

---

## Claude / MCP

The Worker exposes a remote MCP server at `/mcp` (Streamable HTTP transport) so Claude can read and write your ideas directly.

### Claude Code

```bash
claude mcp add --transport http --scope user sfl https://sfl-api.aiwdm.workers.dev/mcp \
  --header "Authorization: Bearer <your-api-key>"
```

Then ask Claude things like:
- *"Save this to SFL: …"*
- *"Search my ideas for anything about Cloudflare"*
- *"What have I saved about machine learning?"*

### Claude.ai web / mobile

The Worker also runs an OAuth 2.0 server so Claude.ai can connect without exposing the raw API key.

1. Go to **claude.ai/settings/connectors** → add custom connector
2. URL: `https://sfl-api.aiwdm.workers.dev/mcp`
3. Leave OAuth client ID/secret blank — Claude.ai auto-registers and redirects you to an approval page
4. Enter your API key on the approval page to grant access

### Available MCP tools

| Tool | Description |
|---|---|
| `list_tags` | All tags with usage counts |
| `capture_idea` | Create a note and tag it (primary capture tool) |
| `search_ideas` | Full-text search |
| `list_ideas` | List with optional type/tag filter |
| `get_idea` | Full idea details with notes and connections |
| `create_idea` | Create any idea type |
| `tag_idea` | Tag an idea |
| `create_connection` | Connect two ideas |
| `add_note` | Add a note to an existing idea |

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
pnpm install
cd api && npx wrangler d1 execute sfl-db --remote --file=src/db/schema.sql
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
cd web && pnpm build
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

POST   /mcp                           MCP Streamable HTTP (Bearer auth)

GET    /.well-known/oauth-authorization-server   OAuth discovery (no auth)
POST   /oauth/register                dynamic client registration
GET    /oauth/authorize               authorization page (enter API key to approve)
POST   /oauth/token                   exchange code for token (PKCE S256)
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
# Install pnpm if you don't have it
npm install -g pnpm

# Install all dependencies
pnpm install

# Start API + web in parallel
pnpm dev
```

API runs on `http://localhost:8787`, web on `http://localhost:5173`.

In the web app Settings, set API URL to `http://localhost:8787` and enter any string as the API key (local Wrangler doesn't enforce it by default — add `[vars] API_KEY = "dev"` to `wrangler.toml` for local auth).

---

## Data model

See [`api/src/db/schema.sql`](api/src/db/schema.sql) for the full D1 schema.

```
ideas          id | type | title | url | summary | r2_key | created_at | updated_at
connections    id | from_id | to_id | label | created_at
notes          id | idea_id | body | created_at | updated_at
media          id | idea_id | r2_key | filename | mime_type | size_bytes | created_at
ideas_fts      FTS5 virtual table on title + summary (auto-synced via triggers)
oauth_clients  client_id | redirect_uris | created_at
oauth_codes    code | client_id | redirect_uri | code_challenge | code_challenge_method | created_at | expires_at
oauth_tokens   token | client_id | created_at
```

R2 layout:
```
ideas/{id}/data.json          ← type-specific JSON blob
ideas/{id}/media/{filename}   ← binary files
```
