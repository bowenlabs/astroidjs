// Copyright (c) 2026 BowenLabs. Astroid is MIT licensed.
//
// `robots.txt` + `sitemap.xml` builders.
//
// Both are ORIGIN-AWARE rather than built against a configured `site` URL, and
// that's deliberate: a project serves from several hosts (`*.workers.dev`, a
// preview subdomain, the custom domain), and a sitemap that advertises the
// canonical host from a preview deploy invites the preview's content to be
// indexed under the real domain. Deriving the origin from the request means each
// host describes only itself.
//
// The disallow list is derived from the config for the same reason the rate
// rules are: which routes exist is a function of which modules are enabled, and
// a hand-maintained list drifts the moment someone turns a portal on.

import type { AstroidConfig } from "../config.js";
import { ASTROID_PORTAL_BASE_PATH } from "../security/rate-rules.js";

/**
 * Paths that must never be indexed, derived from the config: the editor and its
 * API always, plus the portal's account + auth surfaces and checkout when those
 * are enabled.
 *
 * These are *prefixes* — `robots.txt` matches by prefix, so `/api/` covers every
 * endpoint beneath it.
 */
export function astroidNoindexPaths(config: AstroidConfig): string[] {
  const paths = [
    // Every worker route (editor CRUD, media, forms) and Better Auth.
    "/api/",
    // The editor entry point.
    "/louise",
  ];
  if (config.portal?.enabled) {
    paths.push(ASTROID_PORTAL_BASE_PATH, "/account", "/login", "/register", "/reset-password");
  }
  if (config.commerce) {
    // The checkout PAGE, not `ASTROID_CHECKOUT_PATH` — that's the POST endpoint,
    // already covered by the `/api/` prefix. What a crawler would actually reach
    // is the UI route.
    paths.push("/checkout", "/cart");
  }
  return [...new Set(paths)].sort();
}

export interface RobotsOptions {
  /** Serving origin, e.g. `new URL(request.url).origin`. */
  origin: string;
  /** Paths to disallow — defaults to {@link astroidNoindexPaths}. */
  disallow?: string[];
  /**
   * Disallow the entire site. Pass `settings.disableIndexing` so the same
   * switch that noindexes the pages also stops the crawl, rather than relying
   * on crawlers fetching every page to discover the meta tag.
   */
  disableIndexing?: boolean;
}

/** Render `robots.txt`, pointing at the sitemap on the SAME origin. */
export function astroidRobotsTxt(config: AstroidConfig, options: RobotsOptions): string {
  const origin = options.origin.replace(/\/$/, "");
  if (options.disableIndexing) {
    return ["User-agent: *", "Disallow: /", ""].join("\n");
  }
  const disallow = options.disallow ?? astroidNoindexPaths(config);
  return [
    "User-agent: *",
    "Allow: /",
    ...disallow.map((path) => `Disallow: ${path}`),
    "",
    `Sitemap: ${origin}/sitemap.xml`,
    "",
  ].join("\n");
}

export interface SitemapEntry {
  /** Site-root-relative path (`"/shop/beans"`) or an absolute URL. */
  path: string;
  /** Last modified — a Date or an ISO string. */
  lastmod?: Date | string;
}

export interface SitemapOptions {
  origin: string;
  /** Paths to exclude; defaults to {@link astroidNoindexPaths}. */
  exclude?: string[];
}

const XML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&apos;",
};
const escapeXml = (value: string) => value.replace(/[&<>"']/g, (c) => XML_ESCAPES[c] ?? c);

/**
 * Render `sitemap.xml` from a set of paths.
 *
 * Entries are de-duplicated and sorted (a stable document diffs cleanly and
 * caches predictably), excluded paths are dropped by prefix, and every `loc` is
 * XML-escaped — a slug containing `&` would otherwise produce a malformed
 * document that search engines reject wholesale.
 */
export function astroidSitemapXml(
  config: AstroidConfig,
  entries: (SitemapEntry | string)[],
  options: SitemapOptions,
): string {
  const origin = options.origin.replace(/\/$/, "");
  const exclude = options.exclude ?? astroidNoindexPaths(config);

  const seen = new Map<string, SitemapEntry>();
  for (const raw of entries) {
    const entry = typeof raw === "string" ? { path: raw } : raw;
    const path = entry.path.startsWith("/") ? entry.path : `/${entry.path}`;
    if (exclude.some((prefix) => path.startsWith(prefix))) continue;
    if (!seen.has(path)) seen.set(path, { ...entry, path });
  }

  const urls = [...seen.values()]
    .sort((a, b) => a.path.localeCompare(b.path))
    .map((entry) => {
      const lastmod =
        entry.lastmod instanceof Date
          ? entry.lastmod.toISOString()
          : typeof entry.lastmod === "string"
            ? entry.lastmod
            : undefined;
      const loc = `<loc>${escapeXml(`${origin}${entry.path}`)}</loc>`;
      return `  <url>${loc}${lastmod ? `<lastmod>${escapeXml(lastmod)}</lastmod>` : ""}</url>`;
    });

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls,
    "</urlset>",
    "",
  ].join("\n");
}
