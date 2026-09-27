// sitemap.xml—the app's public screens. Scaffolded once and yours to edit: add
// each screen a search engine should find to `entries`.
//
// It doesn't read a `pages` table, even when this app shares a database with a
// site that has one: those pages are served from the site's origin, not this
// app's. `astroidSitemapXml` drops anything matching the config's noindex
// prefixes, so this file and robots.txt can never disagree.
import type { APIRoute } from "astro";
import { astroidSitemapXml, type SitemapEntry } from "astroidjs";
import astroidConfig from "../../astroid.config.js";

export const prerender = false;

export const GET: APIRoute = (context) => {
  const origin = new URL(context.request.url).origin;
  const entries: SitemapEntry[] = [{ path: "/" }];

  return new Response(astroidSitemapXml(astroidConfig, entries, { origin }), {
    headers: {
      "content-type": "application/xml; charset=utf-8",
      "cache-control": "public, max-age=3600",
    },
  });
};
