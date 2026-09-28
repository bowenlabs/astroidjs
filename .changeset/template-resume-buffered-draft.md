---
"create-astroid": patch
---

A new project's edit mode resumes the draft an editor just saved. Every save writes through the `DRAFTS` buffer and reaches D1 only when the buffer flushes, but the scaffold's `src/lib/pages.ts` read drafts from D1 alone, so an editor who reloaded before the flush saw an older page than the one they'd just saved. `readPage` now reads through louise-toolkit's `resumeDraft`, which checks the buffer first, keyed by the page collection's slug from `astroid.config.ts`.

`src/lib/pages.ts` is scaffold-once, so an existing project applies this by hand. `readPage` now takes the Worker's `env` rather than `env.DB`, and its draft read is the `resumeDraft` call in this release's template.
