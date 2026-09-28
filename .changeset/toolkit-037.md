---
"astroidjs": minor
"create-astroid": patch
---

Astroid moves to louise-toolkit 0.37 and @louise-toolkit/astro 0.6. Nothing in the generated trio changes; this release lets a site take the toolkit's new features without installing a second copy of it.

- The `louise-toolkit` peer range is `^0.37.0`. `create-astroid`: new scaffolds get `louise-toolkit` `^0.37.0` and `@louise-toolkit/astro` `^0.6.0`.
- Among what 0.37 adds: incident capture through `composeWorker`'s `onIncident`, scoped agent tokens for the MCP endpoint, opening hours and pickup times in `louise-toolkit/dates`, order-ahead menu tabs from Square's category tree, tip math, and Square catalog reads that leave out archived items.

**What to do:**

1. Upgrade `louise-toolkit` to 0.37 and `@louise-toolkit/astro` to 0.6 along with this release. Before 1.0, a caret range stays within one minor version, so a site that bumps only one side installs two copies of the toolkit.
2. Run `astroid generate`, then `astroid doctor`.
3. Read louise-toolkit 0.37's upgrade notes. The ones a site is likely to meet: `createLouiseMiddleware` now reports a page's thrown error as an incident, which does nothing unless `composeWorker` has `onIncident`; the rich-text color picker offers the brand roles and no longer the state colors; a published document comes back with nested group fields (`page.seo.title`, not `page.seo_title`); and `saveRoute` refuses a table with no primary key at startup.
