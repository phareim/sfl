# SFL repo status

**Verdict: neglected** — production is stable and every downstream service is happy, but the repo itself has gone silent (0 commits in the last 30 days vs. 64 in the prior 90), with no recorded decision either way.

_Council assessment, 2026-05-25. If you read this and the verdict is wrong, change the one-liner above and edit the next-actions list._

## Asset inventory

| Layer | 180d commits | 60d | 30d | Last commit | Deployed? | Build state |
|---|---:|---:|---:|---|---|---|
| `api/` | 23 | 1 | 0 | 2026-04-06 | yes — Cloudflare Worker at `sfl-api.aiwdm.workers.dev` | Workers, post-Node-revert (`560b236`). `wrangler deploy`. `/health` returns 200. |
| `web/` | 34 | 3 | 0 | 2026-04-06 | yes — Cloudflare Pages at `sfl.hareim.no` | SvelteKit + Vite. Live, recent overflow/line-clamp fixes. |
| `chrome-extension/` | 8 | 0 | 0 | 2026-03-13 | unknown (developer-side install) | MV3, `type-aware popup form with meta support`. |
| `cli/` | 7 | 1 | 0 | 2026-04-06 | yes — installed globally as `sfl` (`bin/sfl.js`). Load-bearing for `/find-*` and `/council` workflows. | Vanilla Node ESM. |
| `ios/` | 32 | 0 | 0 | 2026-03-08 | **superseded by `SleeperShare/` in `~/chat/frontend/`** — that extension posts directly to `sfl-api`, doesn't use this folder. | Xcode project tree, not built on this host. |
| `macos/` | 4 | 0 | 0 | 2026-03-04 | unknown (developer-side install) | Swift Package menu-bar capture tool. |

The last commit anywhere in the repo is `ba824ae add AGENTS instructions` (2026-04-17). AGENTS.md is the boilerplate template, with the Repo Notes section still unfilled — i.e. the path was set up to enable agentic edits but never used.

## Downstream-contract scan

Five surfaces on this server depend on SFL. All five touch a small, append-only API; none reads anything past `id`, `type`, `url`, `title`, `created`, plus the `/api/messages` POST.

- **`~/chat/articles/src/services/sfl.ts`** — polls `GET /api/ideas?type=page` every 5 min. Reads `id`, `url`, `title`, `type`, `created`. Articles poller heartbeat shows 126 rows / 108 ready / last poll just now. No write path. Stable.
- **`~/sfl-hook/server.js`** — `POST $SFL_API_URL/api/messages` with `{ body, sender: 'sleeper' }`. Bearer auth via `SFL_API_KEY`. Receives webhooks from the SFL Worker → answers back via the Anthropic SDK (since G1 of this council). Stable.
- **iOS `SleeperShare/` (`~/chat/frontend/SleeperChat/SleeperChat/SleeperShare/`)** — `POST $sflURL/api/ideas` with `{ url, title, type: 'page' or 'meta' }`. Bearer auth. Replaces the `ios/SFL/` tree inside this repo. Stable.
- **`sfl` CLI on PATH (`cli/bin/sfl.js`)** — reads `GET /api/ideas?type=meta&project=…`, writes `POST /api/ideas`. Used by `/idea` and inside the council's session-start / session-end rituals for every brief. Stable.
- **Claude.ai MCP route (`api/src/routes/mcp.js`, mounted at `app.post('/mcp', …)`)** — OAuth-protected. Used from claude.ai conversations. Stable.

If SFL's API contract changed (rename `type`, drop `sender` from `/api/messages`, change `/api/ideas` query shape), all five would break. Today none of them is asking for change.

## Verdict reasoning

Three signals point to "neglected" rather than "frozen" or "dead":

1. **Commit pattern is "stopped", not "wound down".** A graceful freeze usually has a final commit that says "freezing the repo, see X". The actual last commit is the empty AGENTS.md template — the kind of thing you do when you want agents to make small edits next, not when you're putting a project down.
2. **The Node→Workers revert immediately before the silence** (`774ccea` → `560b236`, 4 commits apart) is the shape of "tried a thing, it didn't pan out, reset, paused". That's a "back to working state, will resume later" inflection, not an "everything is fine" inflection.
3. **Production is healthy AND nothing downstream is asking for change.** That's why "frozen" is tempting — there's nothing pressing. But frozen-by-drift is exactly what produces the council's original problem: no documented decision means every future "should we add field X?" stays blocked. The right verdict here is the one that makes the next move explicit.

"Dead" is wrong: production is running and every downstream depends on it. No replacement.

## If work resumes — top 3 to file as `sfl meta`

These are the loose threads visible from the audit, not a roadmap:

1. **Decide what to do with the Node-migration scar.** The Workers revert reads as "the migration was the wrong move, but only after partial work". Either close out the loose ends (anything left untouched from the migration attempt?) or document why Workers stays.
2. **Triage the dormant layers: `chrome-extension/`, `macos/`, and the in-repo `ios/`.** The in-repo iOS app is superseded by `SleeperShare/` in the chat repo — the folder can be deleted. The Chrome extension and macOS menu bar are ambiguous: are they installed somewhere and worth maintaining, or vestigial? A one-line note per directory in the top-level README is enough.
3. **Wire AGENTS.md for real or remove it.** The Apr 17 commit set up the template but never filled the Repo Notes section, and no agent commits followed. Either fill it (preferred commands, conventions, guardrails) or remove it — leaving the empty template in place is worse than either.

## Downstream impact

Nothing currently in flight on this server is blocked by SFL's state. The five downstream services use a stable contract and the council can safely propose changes that touch any of them without coordinating with SFL itself. The exception is anything that wants to *add* a field to ideas / messages — that requires a `wrangler deploy` from this repo and at minimum a CLI / iOS update; the council should still flag those as cross-repo work rather than single-brief work.
