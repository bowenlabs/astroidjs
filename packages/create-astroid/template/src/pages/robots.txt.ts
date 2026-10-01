// robots.txt—origin-aware, with the disallow list derived from your Astroid
// config: the editor and every `/api` route, which no crawler should fetch.
// Pages that print `noindex` (sign-in, the account area) stay crawlable so a
// crawler can see the tag; the sitemap leaves them out instead.
//
// With **Hide from search engines** on in Settings, it serves `Disallow: /`,
// and every page prints `noindex` (src/layouts/Site.astro reads the same
// switch). Scaffolded once and yours to edit: pass
// `{ disallow: [...astroidDisallowPaths(astroidConfig), "/drafts"] }` as the
// third argument for a route crawlers shouldn't reach.
import type { APIRoute } from "astro";
import { astroidRobotsRoute } from "astroidjs/seo";
import { env } from "cloudflare:workers";
import astroidConfig from "../../astroid.config.js";

export const prerender = false;

export const GET: APIRoute = astroidRobotsRoute(astroidConfig, env);
