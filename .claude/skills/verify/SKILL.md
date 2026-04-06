---
name: verify
description: Verify that the API and web app compile successfully. Use after making changes to catch build errors before pushing.
---

Run these checks from the repo root and report results:

1. **API** — dry-run deploy to check Worker compiles:
   ```bash
   cd api && pnpm exec wrangler deploy --dry-run --outdir /tmp/sfl-verify 2>&1
   ```

2. **Web** — build the static site:
   ```bash
   cd web && pnpm build 2>&1
   ```

Report pass/fail for each step. If anything fails, show the relevant error output and suggest a fix.
