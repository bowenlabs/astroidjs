---
"astroidjs": minor
"create-astroid": patch
---

Astroid owns the **Hide from search engines** switch: one reader, `astroidIndexingDisabled`, behind robots.txt, the sitemap, and every page's `noindex`. `robots.txt` now blocks only what no crawler should fetch, and every path matches on segment boundaries.

**The switch.** Sites read the `disable_indexing` column of louise-toolkit's `site_settings` table by hand, with raw SQL and a bare `catch`. robots.txt served `Disallow: /`, but a site whose layout didn't read the column printed no `noindex`, so pages already indexed stayed indexed. The bare `catch` also read a failed query, such as one after a column rename, as "switch off", silently.

The new `astroidjs/seo` subpath reads the database during a request:

- `astroidIndexingDisabled(config, env)` reads the switch through louise-toolkit's `siteSettings` table. It's `false` with no `DB` binding, no settings row, or no editor (`editor: false`). Any other failure is reported with `reportDegraded` under `seo.indexing`, and returns `false`.
- `astroidRobotsRoute(config, env, { disallow? })` is a complete `GET` handler for `src/pages/robots.txt.ts`. When the switch can't be read, it answers `503` with `no-store`, which a crawler treats as "don't crawl for now", rather than caching a guess for an hour.

`astroidSitemapXml` takes `disableIndexing` and lists nothing while it's set.

**robots.txt and the sitemap.** `astroidRobotsTxt` used to disallow `astroidNoindexPaths`, which included `/login`, `/account`, `/register`, `/reset-password`, `/cart`, and `/checkout`. Those pages print `noindex`, and a crawler that can't fetch a page never sees its `noindex`, so a blocked page can still be indexed from links to it (louise-toolkit's `robotsTxt` guidance). Now:

- `astroidDisallowPaths(config)` (new) is what robots.txt blocks by default: `/api`, `/louise` when there's an editor, and the portal's auth mount when the config moves it out of `/api`.
- `astroidNoindexPaths(config)` is what the sitemap leaves out: the list above, `/login` whenever there's an editor or a portal, the portal's pages and its guarded routes (`/portal` by default), and `/cart` and `/checkout` with `commerce`. Its entries no longer carry a trailing slash (`/api`, not `/api/`).
- Every entry matches on path segments: `/account` covers `/account/orders`, not a published page at `/accounts`. robots.txt writes each plain path as two rules, `Disallow: /louise$` and `Disallow: /louise/`; an entry that already uses `*` or `$` is written as given.

A new project's robots route is one line, its sitemap honors the switch, and `src/layouts/Site.astro` passes the switch to `<Seo>`.

**Upgrading.** The robots route, the sitemap, and the layout are scaffold-once, so an existing site changes them by hand:

1. Replace the body of `src/pages/robots.txt.ts` with `export const GET: APIRoute = astroidRobotsRoute(astroidConfig, env);`, importing `astroidRobotsRoute` from `astroidjs/seo` and `env` from `cloudflare:workers`. Drop any `disallow` built from `astroidNoindexPaths`; pass `{ disallow: [...astroidDisallowPaths(astroidConfig), "/your-path"] }` only for a route no crawler should fetch.
2. In `src/pages/sitemap.xml.ts`, pass `disableIndexing: await astroidIndexingDisabled(astroidConfig, env)` to `astroidSitemapXml`.
3. In the layout, set `disableIndexing: await astroidIndexingDisabled(astroidConfig, env)` in the settings you pass to `<Seo>`, or OR it into the `noindex` your own SEO component prints. Drop `disable_indexing` from any raw settings query.
4. A cart, checkout, or account page you wrote yourself is now crawlable, so it has to print `noindex`: pass `noindex` to the layout.

A site that calls `astroidRobotsTxt` without `disallow` serves the shorter list after upgrading, with no code change.
