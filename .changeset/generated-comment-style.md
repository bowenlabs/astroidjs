---
"astroidjs": patch
---

The comments that `astroid generate` writes into a site now follow the house prose style (Google developer documentation style, louise-toolkit ADR 0013). Dashes are closed up (`word—word`, not `word — word`), a plural status code now reads "answers 404," and "e.g." now reads "For example." Only comment text changed. Generated code, identifiers, and string values are byte-for-byte the same.

This covers the regenerated trio (`src/schema.ts`, `src/worker.ts`, `src/middleware.ts`), the scaffold-once files that `generateAstroidScaffoldFiles` and `generateAstroidWrangler` emit, and the `generateWorkflowSchema` and `generateWorkflowRoute` output. Linting a site's committed trio used to report about 40 errors, which is why sites excluded it from `lint:docs`. It now reports none.

What to do after you upgrade:

1. Run `astroid generate` (or `pnpm build`, which runs it) and commit the regenerated trio. Until you do, `astroid doctor` reports the committed trio as stale, because its comments no longer match what the generator writes.
2. Drop the trio from your `lint:docs` `--exclude` list, so the trio is linted like the rest of the site.

Scaffold-once files that a site already has aren't rewritten, because the site owns them. Only new scaffolds, and modules you turn on later, get the new comments. To bring an existing file in line, fix its dashes by hand, or let `lint:docs` find them.
