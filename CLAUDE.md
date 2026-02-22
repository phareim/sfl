# SFL — Claude Instructions

## Project overview

Personal idea-capture tool. Everything becomes an **idea** — web pages, quotes, images, tweets, books, notes. Ideas connect to each other as a graph. Tags are themselves ideas; tagging is a graph edge.

Deploys entirely to Cloudflare (Worker + Pages + D1 + R2). Single-user. Push to `master` → auto-deploy to production via GitHub Actions.

| Layer | Tech |
|---|---|
| API | Cloudflare Worker + Hono.js, D1 (metadata), R2 (JSON blobs + media) |
| Web | SvelteKit (static) + Cloudflare Pages |
| Extension | Chrome MV3 — context menus, popup, social post detection |

**The API and data model are the center of the service.** The web app and Chrome extension exist to feed data in and out of the API — they are secondary.

Key data model facts:
- D1 holds indexed metadata only; type-specific content lives as JSON in R2 at `ideas/{id}/data.json`
- Tags are ideas with `type='tag'`; tagging = connection with `label='tagged_with'`
- IDs are nanoid 21 chars; auth is a single Bearer token (`API_KEY` Cloudflare secret)

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
- **`master` = production.** Every push deploys to the live Cloudflare Worker and Pages. Be deliberate about what goes in.
- **Never force-push to master.**
