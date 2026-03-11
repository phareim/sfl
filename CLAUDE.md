# SFL — Claude Instructions

## Project overview

Sleeper For Life — personal idea-capture tool. Everything becomes an **idea** — web pages, quotes, images, tweets, books, notes. Ideas connect to each other as a graph. Tags are themselves ideas; tagging is a graph edge.

API runs on Ubuntu/Node.js. Web deploys to Cloudflare Pages. Single-user. Push to `master` → web auto-deploys via GitHub Actions.

| Layer | Tech |
|---|---|
| API | Node.js + Hono.js (`@hono/node-server`), SQLite via `better-sqlite3`, R2 (JSON blobs + media) |
| Web | SvelteKit (static) + Cloudflare Pages |
| Extension | Chrome MV3 — context menus, popup, social post detection |
| iOS | SwiftUI + Share Extension |
| MCP | Streamable HTTP at `/mcp`; OAuth 2.0 server at `/oauth` for Claude.ai |
| AI | Anthropic Claude (`claude-haiku-4-5-20251001`) — enrichment |

**The API and data model are the center of the service.** The web app, extension, iOS app, MCP server, and AI enrichment exist to feed data in and out of the API — they are secondary.

Key data model facts:
- SQLite holds indexed metadata only; type-specific content lives as JSON in R2 at `ideas/{id}/data.json`
- Tags are ideas with `type='tag'`; tagging = connection with `label='tagged_with'`
- IDs are nanoid 21 chars
- Auth: Bearer token (`API_KEY` env var) or OAuth-issued token (stored in `oauth_tokens` SQLite table)
- MCP tools: `list_tags`, `capture_idea`, `search_ideas`, `list_ideas`, `get_idea`, `create_idea`, `tag_idea`, `create_connection`, `add_note`, `update_idea`
- When listing or creating `meta` ideas, always pass the current repo's GitHub URL: `list_ideas(type="meta", project="https://github.com/owner/repo")` and `create_idea(type="meta", data={ project, priority, status, ... })`. Detect the project URL from `git remote get-url origin`.
- AI enrichment runs via `api/src/enrichment.js` after every POST /ideas (fire-and-forget). It auto-applies tags, finds related ideas (`related_to` connections), and formats `data.text` as markdown when present (100–6 000 chars, non-page types). Sets `data.markdown = true` when done. Manual trigger: `POST /api/ideas/:id/enrich?mode=tags|connections|markdown|all`.

## Conventions

- **Keep concepts close.** Code that belongs together stays together. Don't scatter related logic across layers for the sake of abstraction.
- **Write straight-forward, readable code.** Prefer clarity over cleverness. The simplest solution that works correctly is the right solution.
- **No premature abstraction.** Don't create helpers or utilities for one-off operations. Three similar lines of code is fine; don't extract an abstraction until the pattern is proven and reused.
- **Add tests where complexity warrants it.** Test non-trivial logic — parsing, data transformations, edge cases. Don't test trivial wrappers. Tests serve as documentation for the reasoning behind tricky code.
- **No unnecessary comments.** Comments explain *why*, not *what*. Self-evident code needs no annotation.
- **The API schema is the source of truth.** When in doubt about data shape, refer to `api/src/db/schema.sql` and the route handlers in `api/src/routes/`.

## Workflow rules

- **Before committing:** run tests and clean up the code (remove debug logs, tidy formatting).
- **Auto-commit and push** after completing a task unless the changes are large enough that manual testing in production is warranted. If unsure, ask.
- **`master` = production for web.** Every push auto-deploys Cloudflare Pages. The API must be deployed manually to the Ubuntu server. Be deliberate about what goes in.
- **Never force-push to master.**
