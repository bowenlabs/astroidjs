// Copyright (c) 2026 BowenLabs. Astroid is MIT licensed.
//
// `astroidjs/seo`—the part of SEO that reads the database during a request.
// A subpath of its own because it reads through louise-toolkit's `db` and
// Drizzle, which the main entry (loaded by astroid.config.ts and the CLI)
// stays free of. The pure builders it calls (`astroidRobotsTxt`,
// `resolvePageSeo`) are on the main entry.
//
// The **Hide from search engines** switch is the `disable_indexing` column of
// louise-toolkit's base `site_settings` table. Sites read it by hand in their
// robots route and their layout, each with raw SQL and a bare `catch`, and the
// two drifted: robots.txt said `Disallow: /` while no page printed `noindex`,
// so pages already in an index stayed there. A bare `catch` also read a failed
// query, for example after a column rename, as "switch off", silently. This is
// the one reader both places call.

import { eq } from "drizzle-orm";
import { type D1Client, db, siteSettings } from "louise-toolkit/db";
import { reportDegraded } from "louise-toolkit/errors";
import type { AstroidConfig } from "../config.js";
import { astroidHasEditor } from "../shape.js";
import { astroidRobotsTxt, type RobotsOptions } from "./routes.js";

/** The binding the switch is read from. Missing before a site is provisioned. */
export interface AstroidIndexingEnv {
  DB?: D1Client;
}

/** The `reportDegraded` name a failed read reports under. */
export const ASTROID_INDEXING_DEGRADED = "seo.indexing";

type SwitchState = "on" | "off" | "unreadable";

async function readSwitch(config: AstroidConfig, env: AstroidIndexingEnv): Promise<SwitchState> {
  // The switch is an editor setting, in the editor's settings table. An app
  // without an editor has neither, so there's nothing to read.
  if (!astroidHasEditor(config) || !env.DB) return "off";
  try {
    const row = await db(env.DB)
      .select({ disableIndexing: siteSettings.disableIndexing })
      .from(siteSettings)
      .where(eq(siteSettings.id, 1))
      .get();
    // No settings row yet (before the first seed) means nobody turned it on.
    return row?.disableIndexing ? "on" : "off";
  } catch (error) {
    reportDegraded(ASTROID_INDEXING_DEGRADED, error);
    return "unreadable";
  }
}

/**
 * Whether the site's **Hide from search engines** switch is on. Pass the
 * result to `<Seo>` as `settings.disableIndexing`, or OR it into your own
 * layout's `noindex`, so every page prints `noindex` while the switch is on.
 *
 * ```ts
 * import { astroidIndexingDisabled } from "astroidjs/seo";
 * import { env } from "cloudflare:workers";
 *
 * const disableIndexing = await astroidIndexingDisabled(astroidConfig, env);
 * ```
 *
 * `false` when there's no `DB` binding (before provisioning), no settings row
 * (before the first seed), or no editor (`editor: false`). A query that fails
 * for any other reason, such as a missing table or a renamed column, is
 * reported with `reportDegraded` under `"seo.indexing"`, and the page stays
 * indexable: `astroidRobotsRoute` answers `503` meanwhile, which stops the
 * crawl until the read works again.
 */
export async function astroidIndexingDisabled(
  config: AstroidConfig,
  env: AstroidIndexingEnv,
): Promise<boolean> {
  return (await readSwitch(config, env)) === "on";
}

/** What a robots route handler reads from the request context. */
export interface AstroidRobotsContext {
  request: Request;
}

/**
 * A complete `GET` handler for `src/pages/robots.txt.ts`: the rules from
 * {@link astroidRobotsTxt} for the serving origin, with the **Hide from search
 * engines** switch read on every request.
 *
 * ```ts
 * import { astroidRobotsRoute } from "astroidjs/seo";
 * import { env } from "cloudflare:workers";
 * import astroidConfig from "../../astroid.config.js";
 *
 * export const prerender = false;
 * export const GET = astroidRobotsRoute(astroidConfig, env);
 * ```
 *
 * With the switch on, it serves `Disallow: /`. When the switch can't be read
 * (see {@link astroidIndexingDisabled}), it answers `503` with `no-store`
 * rather than guessing: a crawler treats a `5xx` robots.txt as "don't crawl
 * for now", and a guess cached for an hour either opens a hidden site to the
 * crawl or closes a live one.
 *
 * `options.disallow` replaces the default list, `astroidDisallowPaths`.
 */
export function astroidRobotsRoute(
  config: AstroidConfig,
  env: AstroidIndexingEnv,
  options: Pick<RobotsOptions, "disallow"> = {},
): (context: AstroidRobotsContext) => Promise<Response> {
  return async ({ request }) => {
    const state = await readSwitch(config, env);
    if (state === "unreadable") {
      return new Response("robots.txt is unavailable. Try again later.\n", {
        status: 503,
        headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
      });
    }
    // The origin actually serving this request, never a configured domain: a
    // preview deploy that advertises the production host invites its content
    // to be indexed under the real domain.
    const origin = new URL(request.url).origin;
    const body = astroidRobotsTxt(config, {
      origin,
      disallow: options.disallow,
      disableIndexing: state === "on",
    });
    return new Response(body, {
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "public, max-age=3600",
      },
    });
  };
}
