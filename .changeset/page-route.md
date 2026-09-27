---
"astroidjs": minor
"create-astroid": minor
---

A new scaffold serves every page at its slug. A page an owner made in the Pages panel, such as `about`, used to have nowhere to render: `/about` answered 404 whether or not it was published, while the scaffold's `sitemap.xml` listed it.

- **`create-astroid`:** the template adds `src/pages/[...slug].astro` and `src/lib/pages.ts`, and the home page now reads through the same `readPage`.
  - A visitor sees a page only while it's live (louise-toolkit's `isPageLive`); a hidden or never-published page answers the new branded "Page not found" page with a 404 and `noindex`. Because it's a 404, the middleware's `redirectFor` still answers a renamed page's old path with a 301.
  - An editor in edit mode sees any page with its latest pending draft, and edits and publishes it like the home page.
  - The head uses the page's own SEO fields, the edge cache follows the home page's rule, and `/home` redirects to `/`.
  - Edit mode now skips a superseded draft (one at or below the newest published version) instead of resuming it. The home page behaves as before for visitors: it renders whether or not it's published.
- **`astroidjs`:** `ASTROID_RESERVED_SLUGS` adds `contact` and `login`, the scaffold's own file routes, which always win over the catch-all. `astroidReservedSlugs(config)` adds `work` on a portfolio, and `astroidPagesWriteHooks` uses it. The Pages route refuses those slugs with a 422, where it used to save a page nobody could reach.

**What to do:** the template is copied once, so an existing site doesn't get the route automatically. To add it, copy `src/pages/[...slug].astro` and `src/lib/pages.ts` from a new scaffold (`pnpm create astroid@latest`), and optionally point `src/pages/index.astro` at `readPage`. Add the slugs of any file routes of your own to `reservedSlugs` in `src/pages-hooks.ts`. After `astroid generate`, a page already saved as `contact`, `login`, or, on a portfolio, `work` gets a 422 when saved from the Pages panel with its slug. That page was already unreachable, because the file route wins, so rename it.
