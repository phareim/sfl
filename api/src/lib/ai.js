// Workers AI text-generation model, centralized on purpose: a scattered model
// literal silently broke every AI feature (auto-tag/summary/connections/markdown
// and chat replies) when the previous model `@cf/meta/llama-3.1-8b-instruct` was
// deprecated on 2026-05-30 — the error was swallowed by each call site's
// try/catch. Keep one source of truth; change here when CF deprecates again.
//
// Pick a model whose AI.run returns `{ response: <string> }` (the 8b-instruct
// family does). Larger models like llama-3.3-70b sometimes return a pre-parsed
// array, which breaks the string-based JSON parsing in enrichment.js.
export const TEXT_MODEL = '@cf/meta/llama-3.1-8b-instruct-fp8';
