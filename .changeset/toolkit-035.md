---
"astroidjs": minor
"create-astroid": patch
---

Astroid moves to louise-toolkit 0.35 and wires three of its opt-ins into every generated site: renamed pages keep their old URL, a Pages panel rename survives a publish, and decorative images leave the Health card's to-do list.

- **Page redirects (#84):** the generated schema exports louise-toolkit's `pageRedirects` table. `pagesRoute` and `versionsRoute` get `redirects: pageRedirects`, so a slug change records `/old → /new`, and the generated middleware's `redirectFor` answers a request for the old path with a 301. It runs only after the page answered 404, so a page created on the old path wins, and creating one clears the redirect. The visitor's query string carries over.
- **Pages panel rename (#83):** `pagesRoute` gets `drafts: { config: pagesCollection, bufferKv: (env) => env.DRAFTS }`, the same config and buffer `versionsRoute` uses. A rename or slug change made in the Pages panel while the page had a pending draft used to come undone at the next publish, which copies the whole draft snapshot onto the live row. Now the change is also saved into the pending draft.
- **Decorative alt text (#85):** the generated health scan counts missing alt text with louise-toolkit's `MEDIA_ALT_MISSING_SQL` (`"alt" IS NULL`) instead of `alt IS NULL OR alt = ''`, so an image the owner marked decorative (`""`) leaves the "missing a description" count.
- **Two scaffolded migrations,** numbered after the catalog's `0003`: `migrations/0004_page_redirects.sql` creates `page_redirects` (with `IF NOT EXISTS`), and `migrations/0005_media_alt_undecided.sql` is louise-toolkit's `MEDIA_ALT_UNDECIDED_SQL("media")`. That statement turns every existing `''` alt into `NULL`, because `''` used to mean both "not written" and "cleared", so nothing silently becomes decorative. `astroidjs` exports both as `ASTROID_PAGE_REDIRECTS_MIGRATION` and `ASTROID_MEDIA_ALT_MIGRATION`, and `AstroidFrameworkTable` gains `"pageRedirects"`.
- The `louise-toolkit` peer range is `^0.35.0`. `create-astroid`: new scaffolds get `louise-toolkit` `^0.35.0` and `@louise-toolkit/astro` `^0.4.0`, and the adapter pins the toolkit exactly, so a new scaffold installs one copy.

**What to do:**

1. Upgrade `louise-toolkit` to 0.35 and `@louise-toolkit/astro` to 0.4 along with this release. Before 1.0, a caret range stays within one minor version.
2. Run `astroid generate`. It rewrites the trio and writes the two migrations, since a missing scaffold file is always written. Wrangler tracks migrations by filename, so a site that already has its own `0004_…` or `0005_…` keeps both.
3. Apply the migrations before the new code serves traffic. `astroid ship` does this on both targets. The alt migration must run before the new count goes live, or every `''` alt counts as decorative. A site with `deploy.migrations: false` needs the app that owns its database to ship the migrations first.
4. Read louise-toolkit 0.35's upgrade notes, especially the page lifecycle change (#672). Pages unpublished before 0.35 keep `status = 'published'`, so they're still public. List them with `SELECT id, slug FROM pages WHERE status = 'published' AND published_version_id IS NULL`, and unpublish the ones meant to be hidden. A write of `status` through `pagesRoute` now gets a 422; use publish and unpublish instead.
