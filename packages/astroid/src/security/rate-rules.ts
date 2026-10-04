// Copyright (c) 2026 BowenLabs. Astroid is MIT licensed.
//
// Rate-limit rules as data.
//
// The limiter mechanism lives in `louise-toolkit/security` and is deliberately
// unopinionated: which routes, and which budgets, are policy. But the policy
// turned out not to vary. All three consuming sites independently wrote the same
// `RateRule[]`—the same public POST surfaces, the same 10-minute windows,
// budgets within a factor of one of each other—differing only where the site
// had a surface the others didn't (a portal, a checkout). That is a default, not
// a per-site decision, so Astroid derives the whole set from the config.
//
// What's in scope: the public, UNAUTHENTICATED POST surfaces, plus the one
// kind of GET that spends money on every request: an image resize proxy, which
// the site declares in `security.imageProxies`. Editor endpoints
// (`/api/louise/*`) are session-gated and stay out on purpose—a limiter that
// can lock the owner out of their own studio is worse than the abuse it stops.
// The contact form is also absent by design: it's a worker route with its own
// per-form limiter, and worker routes are matched before Astro's middleware ever
// runs, so a rule here would never fire.

import type { RateRule } from "louise-toolkit/security";
import type { AstroidConfig } from "../config.js";
import { astroidHasEditor } from "../shape.js";

export type { RateRule };

/**
 * Base path the customer/portal Better Auth instance mounts at—its own
 * handler, separate from the editor's `/api/auth`. Fixed by Astroid so the rate
 * rules, the middleware, and the portal routes can't drift apart.
 */
export const ASTROID_PORTAL_BASE_PATH = "/api/portal-auth";

/** Path the commerce module's checkout POSTs to. */
export const ASTROID_CHECKOUT_PATH = "/api/checkout";

/**
 * Where an app with no editor (`editor: false`) serves its versioned JSON API.
 * A web client and a later native client call the same routes, so a new
 * version is a new prefix rather than a change to the one clients already use.
 */
export const ASTROID_API_PREFIX = "/api/v1";

/** Ten minutes. Every default budget uses this window—long enough that a
 *  burst can't wait it out, short enough that a false positive self-heals. */
const WINDOW = 600;

const exact = (path: string) => (p: string) => p === path;

/** Requests per window an image proxy path takes from one address. A page of
 *  about 50 images at its first visit, which the browser then caches, is about
 *  twenty first visits, enough for a shop full of customers behind one Wi-Fi
 *  address. */
const IMAGE_PROXY_LIMIT = 1000;

/**
 * The rule set for a project, derived from its config: the editor sign-in
 * surface unless the project has no editor, the portal's credential surfaces
 * when a portal is enabled, checkout when commerce is configured, a `GET` rule
 * for each image proxy in `security.imageProxies`, and the versioned API for an
 * app with no editor.
 *
 * Rules are matched first-wins, and `security.rateRules` from the config are
 * placed FIRST—so a site tightens or loosens any default by declaring its own
 * rule for that path, rather than losing the whole set to override one budget.
 */
export function astroidRateRules(config: AstroidConfig): RateRule[] {
  const rules: RateRule[] = [...(config.security?.rateRules ?? [])];

  // The editor's sign-in, which an app with no editor doesn't serve.
  if (astroidHasEditor(config)) {
    // Magic-link sign-in is the email-bombing target: without a cap, anyone who
    // knows an editor's address can trigger unbounded sign-in mail (their inbox,
    // your Email + Worker spend). Tightest budget in the set.
    rules.push({
      name: "magic-link",
      method: "POST",
      match: exact("/api/auth/sign-in/magic-link"),
      limit: 5,
      windowSec: WINDOW,
    });
    // Everything else Better Auth serves (passkey challenges, sign-out, callbacks)
    // behind a looser catch-all. Ordered after the specific rule above, which
    // matters: `matchRateRule` takes the first match.
    rules.push({
      name: "auth",
      method: "POST",
      match: (p) => p.startsWith("/api/auth/"),
      limit: 30,
      windowSec: WINDOW,
    });
  }

  if (config.portal?.enabled) {
    // The portal's mount is configurable (a site may already ship a second
    // instance at its own path), so the credential-surface rules must track the
    // resolved base path, not the default constant—mirrors `astroidPortal`.
    const base = config.portal.basePath ?? ASTROID_PORTAL_BASE_PATH;
    // Customer credentials, unlike the editor's, are password-based—so these
    // guard credential stuffing and enumeration, not just mail volume.
    rules.push({
      name: "portal-signup",
      method: "POST",
      match: exact(`${base}/sign-up/email`),
      limit: 10,
      windowSec: WINDOW,
    });
    rules.push({
      name: "portal-signin",
      method: "POST",
      match: exact(`${base}/sign-in/email`),
      limit: 15,
      windowSec: WINDOW,
    });
    rules.push({
      name: "portal-reset-request",
      method: "POST",
      match: exact(`${base}/request-password-reset`),
      limit: 5,
      windowSec: WINDOW,
    });
    rules.push({
      name: "portal-reset",
      method: "POST",
      match: exact(`${base}/reset-password`),
      limit: 15,
      windowSec: WINDOW,
    });
  }

  if (config.commerce) {
    // Loosest budget in the set: a real shopper retries, edits, and re-submits a
    // cart, so this is abuse control, not flow control.
    rules.push({
      name: "checkout",
      method: "POST",
      match: exact(ASTROID_CHECKOUT_PATH),
      limit: 20,
      windowSec: WINDOW,
    });
  }

  for (const path of config.security?.imageProxies ?? []) {
    // One resize per request, billed to the zone. The budget is loose by
    // design: it counts in KV, which reads before it writes, so the burst a
    // single page view sends mostly reads the same count, and a KV failure lets
    // the request through. It bounds a sustained abuser, not one page view.
    // Named per path, so two proxies keep separate budgets. Two Workers that
    // share a KV namespace share the budget too, as they do for every default.
    rules.push({
      name: `image-proxy:${path}`,
      method: "GET",
      match: exact(path),
      limit: IMAGE_PROXY_LIMIT,
      windowSec: WINDOW,
    });
  }

  if (!astroidHasEditor(config)) {
    // An app's own JSON API: quotes, orders, account changes. Looser than
    // checkout because a client posts here as a cart changes, not once per
    // purchase, so this is abuse control rather than flow control. After the
    // specific rules, so a tighter budget for one route wins.
    rules.push({
      name: "api",
      method: "POST",
      match: (p) => p.startsWith(`${ASTROID_API_PREFIX}/`),
      limit: 120,
      windowSec: WINDOW,
    });
  }

  return rules;
}
