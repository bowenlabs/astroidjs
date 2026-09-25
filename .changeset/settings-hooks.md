---
"astroidjs": patch
---

A site can now clean what editors save, in settings and in pages, and the generated `pagesRoute` fixes three gaps every site had. Settings hooks need louise-toolkit 0.31.1 or later.

**Why.** The generated routes enforced which keys an editor could write, and nothing about their values. A site whose settings need a length limit or a valid email address, or whose pages need a normalized slug, had to hand-write its own route. The route plan mounts the generated one first, so that wasn't possible.

**Settings hooks.** Set `settings: { hooks: true }` and `astroid generate` scaffolds `src/settings-hooks.ts`, once, exporting `settingsHooks` (louise-toolkit's `SettingsRouteHooks`):

- `sanitize` maps a settings key to a function that returns the value to store. The generated `settingsRoute` and the scaffolded settings Action both use it, so a value is cleaned the same way on either write path. Sanitized values still go through the link-scheme and media-URL checks.
- `read` transforms the settings the panel loads, for example to fill keys an older row lacks from your defaults.

**Pages hooks.** Set `pages: { hooks: true }` and `astroid generate` scaffolds `src/pages-hooks.ts`, once, exporting `pagesHooks` (`AstroidPagesHooks`):

- `transform` cleans a page write before Astroid's section sanitize and validate run: normalize the slug, clamp a title, fill a new page's defaults.
- `validate` rejects a write, before Astroid's own section validation. Throw a `LouiseValidationError` for a 422.
- `reservedSlugs` adds to the paths no page may take.

**Fixed for every site, with no config:**

- Deleting a page now deletes its version snapshots. They have no foreign key to the page, so they used to orphan.
- A page write through the Pages panel now rebuilds the search index. A renamed page used to keep matching its old title until the next publish.
- `pagesRoute` now refuses the slugs in `ASTROID_RESERVED_SLUGS` (`404`, `_astro`, `api`, `cdn-cgi`, `robots.txt`, `sitemap.xml`) with a 422. A page saved under one was unreachable, and nothing said why.
- The media library's delete-safety scan now reads `site_settings.custom`, where a site's own image settings live. Deleting an image a custom setting used reported no references.

**What you have to do.** Run `astroid generate` and commit the regenerated `src/worker.ts`; `astroid doctor` reports it stale until you do. The hooks are opt-in, and a project that doesn't turn them on gets no new files. If you turn on `settings.hooks` in a project that already has `src/actions/index.ts`, that file isn't rewritten, because the site owns it. Add `import { settingsHooks } from "../settings-hooks.js";` and pass `sanitize: settingsHooks.sanitize` to `louiseSettingsAction` yourself.
