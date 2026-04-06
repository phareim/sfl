---
name: deploy
description: Deploy the API worker and web app to Cloudflare production. Use when you want to manually deploy outside of the CI pipeline.
disable-model-invocation: true
---

Deploy both the API and web app to Cloudflare:

1. **Deploy API Worker:**
   ```bash
   cd api && pnpm exec wrangler deploy
   ```

2. **Build and deploy Web:**
   ```bash
   cd web && pnpm build && cd ../api && pnpm exec wrangler pages deploy ../web/build --project-name sfl-web --branch master
   ```

Report the result of each step. If any step fails, stop and show the error.
