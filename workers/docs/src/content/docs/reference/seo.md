---
title: SEO
description: Sitemaps, robots, structured data, and the switch that hides a site from search engines.
sidebar:
  order: 10
---

`astroidSitemapXml`, `astroidRobotsTxt`, `astroidStructuredData`,
`resolvePageSeo`, `escapeJsonLd`, `astroidDisallowPaths`, `astroidNoindexPaths`.

From `astroidjs/seo`, which reads the database during a request:
`astroidIndexingDisabled`, `astroidRobotsRoute`.

`escapeJsonLd` escapes `<`, `>`, `&` as `\uXXXX` so a `</script>` in CMS content
can't break out of a JSON-LD block.

## What crawlers can fetch, and what's indexed

Two lists, both derived from the config:

- **`astroidDisallowPaths`** is what no crawler should fetch at all: `/api` and,
  when there's an editor, `/louise`. Only these go in `robots.txt`.
- **`astroidNoindexPaths`** is everything kept out of the index: the list above,
  plus pages that print `noindex` themselves. Those are `/login` when there's an
  editor or a portal; `/account`, `/register`, `/reset-password`, and the
  portal's guarded routes when the portal is on; and `/cart` and `/checkout`
  when `commerce` is set. The sitemap leaves all of them out.

The `noindex` pages aren't in `robots.txt` on purpose. A crawler that can't
fetch a page never sees its `noindex`, so a blocked page can still be indexed
from links to it, which is louise-toolkit's `robotsTxt` guidance too. A page on
the second list that you write yourself, such as a cart, has to print
`noindex`: pass `noindex` to the layout.

Every entry covers the path and everything beneath it, matched on path
segments: `/account` covers `/account/orders`, but a published page at
`/accounts` stays in the sitemap and crawlable. In `robots.txt` that's two rules
per path, `Disallow: /louise$` and `Disallow: /louise/`. An entry you pass that
already uses `*` or `$` is written as given.

## Hide from search engines

The Settings panel's **Hide from search engines** switch is the
`disable_indexing` column of louise-toolkit's `site_settings` table. While it's
on, `robots.txt` serves `Disallow: /`, the sitemap lists nothing, and every page
prints `<meta name="robots" content="noindex, nofollow">`. Blocking the crawl
alone isn't enough: a page already in an index stays there until a crawler
fetches it and sees `noindex`.

`astroidIndexingDisabled(config, env)` is the one reader for all three. A new
project's `src/layouts/Site.astro` passes it to `<Seo>` as
`settings.disableIndexing`, its sitemap passes it to `astroidSitemapXml`, and
its `robots.txt` route is one line:

```ts
import type { APIRoute } from "astro";
import { astroidRobotsRoute } from "astroidjs/seo";
import { env } from "cloudflare:workers";
import astroidConfig from "../../astroid.config.js";

export const prerender = false;

export const GET: APIRoute = astroidRobotsRoute(astroidConfig, env);
```

To block a route of your own, pass
`{ disallow: [...astroidDisallowPaths(astroidConfig), "/drafts"] }` as the third
argument.

The switch reads as off, quietly, when there's no `DB` binding (before you
provision), no settings row (before the first seed), or no editor
(`editor: false`). Any other failure, such as a missing table or a renamed
column, is reported with `reportDegraded` under `seo.indexing`. Pages stay
indexable meanwhile, and `robots.txt` answers `503` with `no-store`: a crawler
treats that as "don't crawl for now" until the read works again, where a
guess cached for an hour would either open a hidden site to the crawl or close
a live one.
