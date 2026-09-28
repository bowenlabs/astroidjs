---
"astroidjs": minor
"create-astroid": patch
---

`astroidPageDraft(config, env, pageId)`, in the new `astroidjs/pages` subpath, reads the editor's work-in-progress on a page for a page route in edit mode. It checks the `DRAFTS` buffer before D1, the order every save writes, with the pages collection's slug and versions table derived from your config. It replaces the wrapper around louise-toolkit's `resumeDraft` that each site kept in `src/lib/louise-drafts.ts`, and a new project's `src/lib/pages.ts` now calls it.

**`drizzle-orm` is now a peer dependency** (`^0.45.0`), as it already is for louise-toolkit. Every Astroid project has it, because the generated schema imports it, so nothing changes for an existing site. `astroidPageDraft` is a subpath of its own so that the main `astroidjs` entry, which `astroid.config.ts` and the CLI load, doesn't import the editor.

**To adopt it:** delete your own draft wrapper, and in each page that called it, read the draft with `await astroidPageDraft(astroidConfig, env, pageId)`, then pick the fields you render (`sections`, `body`, `title`) from the snapshot it returns. Pass `env` with `DB` and, when bound, `DRAFTS`.
