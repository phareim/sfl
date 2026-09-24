# AGENTS.md

Guidance for coding agents (Claude Code, Codex, OpenCode) working in this repository.

## Project overview

Sleeper For Life — personal idea-capture tool. Everything becomes an **idea** — web pages, quotes, images, tweets, books, notes. Ideas connect as a graph. Tags are ideas; tagging is a graph edge.

Deploys entirely to Cloudflare (Worker + Pages + D1 + R2). Single-user. Push to `master` → auto-deploy via GitHub Actions.

| Layer | Tech |
|---|---|
| API | Cloudflare Worker + Hono.js, D1 (metadata), R2 (JSON blobs + media) |
| Web | SvelteKit (static) + Cloudflare Pages |
| Extension | Chrome MV3 — context menus, type-aware popup (incl. meta), social post detection |
| iOS | SwiftUI + Share Extension + Chat tab |
| macOS | Swift menu bar app — global hotkey (⌃⌥I), text grabber, type/tag/project picker |
| CLI | Node.js `sfl` command — browse/search ideas, manage meta tasks from terminal |
| MCP | Streamable HTTP at `/mcp`; OAuth 2.0 server at `/oauth` for Claude.ai |
| AI | Workers AI (`@cf/meta/llama-3.1-8b-instruct`) — enrichment + chat replies |
| Chat | Persistent message thread via D1; AI replies or webhook forwarding |

**The API and data model are the center of the service.** All other layers feed data in and out of the API.

Key data model: D1 holds indexed metadata; type-specific content lives as JSON in R2 at `ideas/{id}/data.json`. Auth via Bearer token (`API_KEY`) or OAuth token. Schema source of truth: `api/src/db/schema.sql`.

Meta ideas are retired (2026-08-27); per-repo backlogs live in sleeper-tasks. The meta endpoints and CLI commands below still run, but `sfl meta board` lists no projects (2026-09-24).

## Build commands

```bash
pnpm install                              # install all workspaces
pnpm dev                                  # dev servers (api + web in parallel)
cd api && pnpm exec wrangler deploy       # deploy API worker
cd web && pnpm build                      # build static site
cd api && pnpm run db:init                # apply schema to remote D1
cd api && pnpm run db:init:local          # apply schema to local D1
```

Tests: `pnpm test` at the repo root (vitest). No linter or formatter is configured.

## Conventions

- **Keep concepts close.** Code that belongs together stays together. Don't scatter related logic across layers for the sake of abstraction.
- **No premature abstraction.** Don't create helpers or utilities for one-off operations. Three similar lines of code is fine; don't extract an abstraction until the pattern is proven and reused.
- **Add tests where complexity warrants it.** Test non-trivial logic — parsing, data transformations, edge cases. Don't test trivial wrappers. Tests serve as documentation for the reasoning behind tricky code.
- **No unnecessary comments.** Comments explain *why*, not *what*. Self-evident code needs no annotation.
- **The API schema is the source of truth.** When in doubt about data shape, refer to `api/src/db/schema.sql` and the route handlers in `api/src/routes/`.

## Tag and meta primitives

The Worker exposes tag-merge / rename and a per-project meta digest:

- `PUT /api/tags/:id { title }` — rename a tag; 400/404/409 as expected
- `POST /api/tags/:id/merge { into }` — rewires every `tagged_with` edge from `:id` to `into`, dedupes via row-by-row UPDATE (UNIQUE collision → DELETE the loser; counted as `deduped`), then deletes the source tag. Returns `{ merged, into, rewired, deduped }`. FTS resyncs automatically via existing triggers.
- `GET /api/meta/digest?range=7d|14d|30d` — done-this-period grouped by project. No consumer found in `~/chat` (checked 2026-09-24).

CLI commands (`cli/bin/sfl.js`):

- `sfl tags` / `sfl tags list` — usage-sorted inventory
- `sfl tags rename <id-or-title> <new-title>`
- `sfl tags merge <source-id-or-title> <into-id-or-title>` — accepts title with case-insensitive fallback; bails on ambiguity
- `sfl meta board` — project × {draft, in_progress, done-7d} grid, sorted by most-recent activity
- `sfl meta stale [--days N]` — draft/in_progress metas older than N days (default 30); prints `nothing stale` on empty

One-shot cleanup utility at `api/scripts/cleanup-tags.js` — `--dry-run` (default) prints the planned merges/renames against live inventory; `--apply` executes.

## Auto-tagging

Enrichment's auto-tag step (`applyTags` in `api/src/enrichment.js`) uses **TypeSafe Jev** (`api/src/lib/jev-tagger.js`) first, because the llama tagger over-applies tags. When the `TYPESAFE_API_KEY` secret is set, each new idea's `{title, summary, url}` is scored against a curated 27-tag vocabulary (`TAG_VOCABULARY`) via `POST https://api.typesafe.ai/v1/systemone`; tags scoring ≥ `JEV_THRESHOLD` (0.6) are applied, highest first, capped at `JEV_MAX_TAGS` (5). Only vocabulary tags are ever auto-applied — every other tag in the DB stays manual-only. Tag titles are resolved to existing tag ids case-insensitively; unmatched titles are skipped (no new tags are created).

On any Jev error (network failure, non-2xx, no `TYPESAFE_API_KEY` set) it falls back to the original llama tagger (`tagIdsFromLlama`), unchanged. Ideas created before 2026-09-17 were tagged by llama and have not been retagged. `buildJevQuestions`/`pickJevTags` are pure and unit-tested in `api/src/lib/jev-tagger.test.js` (`pnpm test`, vitest).

## Workflow rules

- **Before committing:** run tests and clean up the code (remove debug logs, tidy formatting).
- **Auto-commit and push** after completing a task unless the changes are large enough that manual testing in production is warranted. If unsure, ask.
- **`master` = production.** Every push deploys to the live Cloudflare Worker and Pages. Be deliberate about what goes in.
- **Never force-push to master.**
