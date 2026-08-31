// sitemap.xml — the published `pages` rows, plus whatever else this site serves.
// Scaffolded once and yours to edit: add your own routes (a product catalog, a
// gallery) to the `entries` array below.
//
// `astroidSitemapXml` drops anything matching the config's noindex prefixes, so
// this file and robots.txt can never disagree about what's crawlable.
import type { APIRoute } from "astro";
import { astroidSitemapXml, type SitemapEntry } from "astroidjs";
import { env } from "cloudflare:workers";
import astroidConfig from "../../astroid.config.js";

export const prerender = false;

export const GET: APIRoute = async (context) => {
  const origin = new URL(context.request.url).origin;
  const entries: SitemapEntry[] = [{ path: "/" }];

  try {
    const { results } = await env.DB.prepare(
      "SELECT slug, updated_at FROM pages WHERE status = 'published' AND noindex = 0",
    ).all<{ slug: string; updated_at: number | null }>();
    for (const row of results ?? []) {
      // `home` is served at "/", which is already listed — never at "/home".
      if (row.slug === "home") continue;
      // Drizzle stores `updated_at` as a Unix timestamp in SECONDS; <lastmod>
      // wants a W3C datetime, so a raw epoch number would be invalid.
      const lastmod = row.updated_at ? new Date(row.updated_at * 1000) : undefined;
      entries.push({ path: `/${row.slug}`, lastmod });
    }
  } catch {
    // No DB binding yet (pre-provision) — ship the root-only sitemap.
  }

  return new Response(astroidSitemapXml(astroidConfig, entries, { origin }), {
    headers: {
      "content-type": "application/xml; charset=utf-8",
      "cache-control": "public, max-age=3600",
    },
  });
};
