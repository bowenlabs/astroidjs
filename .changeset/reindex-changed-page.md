---
"astroidjs": minor
"create-astroid": patch
---

A save from the Pages panel now reindexes only the page it changed. The generated `reindexPagesSearch`, which `pagesRoute` runs as its `afterWrite` hook, used to rebuild the whole search index on every create, update, and delete. It now calls `reindexDoc` for the written row, using the `{ operation, id }` argument that louise-toolkit 0.34.0 gives `afterWrite`. After a delete, `reindexDoc` finds no row and removes the page's entry.

- `astroidjs`: the `louise-toolkit` peer range is `^0.34.0`, because the generated worker imports the `PagesWrite` type, which 0.33 doesn't export.
- `create-astroid`: new scaffolds get `louise-toolkit` `^0.34.0`.

**What to do:** upgrade `louise-toolkit` to 0.34, and `@louise-toolkit/astro` to the release that pins it, along with this release. Then run `astroid generate` to rewrite `src/worker.ts`. If you run `astroid generate` while still on louise-toolkit 0.33, `astro check` fails on the `PagesWrite` import. One side effect goes away: a Pages panel save no longer indexes pages that were seeded straight into D1, because it no longer rebuilds the whole index. To index those, publish them or call `POST /api/louise/pages/reindex` once after seeding.
