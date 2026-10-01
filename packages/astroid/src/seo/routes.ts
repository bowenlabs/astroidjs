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
import { astroidPortal } from "../portal/config.js";
import { astroidHasEditor } from "../shape.js";

/**
 * Paths no crawler should fetch at all, derived from the config: every Worker
 * route under `/api` (the editor's API, Better Auth, the portal's auth mount),
 * and the editor itself when there is one. None of them is a page a search
 * result could use.
 *
 * Only these go in `robots.txt`. A page that prints `noindex` (sign-in, the
 * account area, the cart) stays crawlable, because a crawler that can't fetch
 * a page never sees its `noindex`, and the page can still be indexed from links
 * to it. Those pages are in {@link astroidNoindexPaths} instead, which the
 * sitemap leaves out.
 *
 * Each entry covers the path and everything beneath it, matched on path
 * segments: `/louise` covers `/louise/settings` but not `/louise-story`.
 */
export function astroidDisallowPaths(config: AstroidConfig): string[] {
  const paths = [
    // Every worker route (editor CRUD, media, forms) and Better Auth.
    "/api",
    // The editor entry point, when there is an editor.
    ...(astroidHasEditor(config) ? ["/louise"] : []),
  ];
  // The portal's auth mount is under `/api` unless the config moves it.
  const portal = astroidPortal(config);
  if (portal) paths.push(portal.basePath);
  return withoutCovered(paths);
}

/**
 * Paths kept out of the index, derived from the config: everything in
 * {@link astroidDisallowPaths}, plus the pages that print `noindex` themselves.
 * Those are the sign-in page when there's an editor or a portal, the portal's
 * account and sign-up pages and the routes it guards, and the cart and checkout
 * pages when `commerce` is set.
 *
 * The sitemap leaves all of them out. A page on this list that a site writes
 * itself (a cart, an account page) has to print `noindex` too: pass `noindex`
 * to the layout.
 *
 * Each entry covers the path and everything beneath it, matched on path
 * segments: `/account` covers `/account/orders` but not `/accounts`.
 */
export function astroidNoindexPaths(config: AstroidConfig): string[] {
  const paths = astroidDisallowPaths(config);
  const portal = astroidPortal(config);
  if (astroidHasEditor(config) || portal) paths.push("/login");
  if (portal) {
    paths.push("/account", "/register", "/reset-password");
    for (const route of portal.routes) paths.push(route.prefix);
  }
  if (config.commerce) {
    // The checkout PAGE, not `ASTROID_CHECKOUT_PATH`—that's the POST endpoint,
    // already covered by `/api`. What a crawler would actually reach is the UI
    // route.
    paths.push("/checkout", "/cart");
  }
  return withoutCovered(paths);
}

/** `path` without a trailing slash, so `/api/` and `/api` are one entry. */
const bare = (path: string): string => (path.length > 1 ? path.replace(/\/+$/, "") : path);

/**
 * Whether `path` is `prefix` or beneath it, on a path-segment boundary:
 * `/account` matches `/account` and `/account/orders`, not `/accounts`.
 */
function astroidPathMatches(path: string, prefix: string): boolean {
  const base = bare(prefix);
  if (base === "/") return true;
  const pathname = path.split(/[?#]/, 1)[0] ?? path;
  return pathname === base || pathname.startsWith(`${base}/`);
}

/** De-duplicated and sorted, with any entry another entry covers dropped. */
function withoutCovered(paths: string[]): string[] {
  const unique = [...new Set(paths.map(bare))];
  return unique
    .filter((path) => !unique.some((other) => other !== path && astroidPathMatches(path, other)))
    .sort();
}

/**
 * The `robots.txt` rules for one path. A plain path becomes two rules, the
 * path itself (`$` ends the match) and everything under it, so `/louise` blocks
 * `/louise/settings` but not a page at `/louise-story`. RFC 9309 defines both
 * `$` and `*`, so an entry that already uses either is a pattern of your own,
 * and passes through unchanged.
 */
function robotsRules(path: string): string[] {
  const clean = path.replace(/[\r\n]/g, "");
  if (/[*$]/.test(clean)) return [clean];
  const base = bare(clean);
  return base === "/" ? ["/"] : [`${base}$`, `${base}/`];
}

export interface RobotsOptions {
  /** Serving origin, for example, `new URL(request.url).origin`. */
  origin: string;
  /**
   * Paths no crawler should fetch—defaults to {@link astroidDisallowPaths}.
   * Each plain path covers itself and everything beneath it; an entry with `*`
   * or `$` is written as given. Don't list a page that prints `noindex`.
   */
  disallow?: string[];
  /**
   * Disallow the entire site. Pass the site's **Hide from search engines**
   * switch (`astroidIndexingDisabled` from `astroidjs/seo`, which
   * `astroidRobotsRoute` reads for you), so the switch that noindexes the
   * pages also stops the crawl.
   */
  disableIndexing?: boolean;
}

/** Render `robots.txt`, pointing at the sitemap on the SAME origin. */
export function astroidRobotsTxt(config: AstroidConfig, options: RobotsOptions): string {
  const origin = options.origin.replace(/\/$/, "");
  if (options.disableIndexing) {
    return ["User-agent: *", "Disallow: /", ""].join("\n");
  }
  const disallow = options.disallow ?? astroidDisallowPaths(config);
  return [
    "User-agent: *",
    "Allow: /",
    ...disallow.flatMap(robotsRules).map((rule) => `Disallow: ${rule}`),
    "",
    `Sitemap: ${origin}/sitemap.xml`,
    "",
  ].join("\n");
}

export interface SitemapEntry {
  /** Site-root-relative path (`"/shop/beans"`) or an absolute URL. */
  path: string;
  /** Last modified—a Date or an ISO string. */
  lastmod?: Date | string;
}

export interface SitemapOptions {
  origin: string;
  /**
   * Paths to leave out, each with everything beneath it, matched on path
   * segments; defaults to {@link astroidNoindexPaths}.
   */
  exclude?: string[];
  /**
   * List nothing. Pass the site's **Hide from search engines** switch, so a
   * hidden site doesn't advertise its pages.
   */
  disableIndexing?: boolean;
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
 * caches predictably), excluded paths are dropped on path-segment boundaries
 * (`/account` drops `/account/orders`, not `/accounts`), and every `loc` is
 * XML-escaped—a slug containing `&` would otherwise produce a malformed
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
  for (const raw of options.disableIndexing ? [] : entries) {
    const entry = typeof raw === "string" ? { path: raw } : raw;
    const path = entry.path.startsWith("/") ? entry.path : `/${entry.path}`;
    if (exclude.some((prefix) => astroidPathMatches(path, prefix))) continue;
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
