// Copyright (c) 2026 BowenLabs. Astroid is MIT licensed.
//
// The CSP origins a config implies, as plain data.
//
// Split out of `astro/csp.ts` (build-time only: `node:crypto`, `solid-js/web`)
// so the worker generator can read it too: Astro's `security.csp` renders every
// directive except `style-src`, and the generated middleware renders that one.
// Both have to see the same origin set, or a module's stylesheet host lands in
// one half of the policy and not the other.

import { squareWebPaymentsCsp } from "louise-toolkit/commerce/square-web";
import { turnstileCsp } from "louise-toolkit/forms/turnstile";
import { astroidCommerceProviders } from "../commerce/roles.js";
import type { AstroidConfig, CspOrigins } from "../config.js";

/** Origins a commerce provider's client-side SDK needs. Server-only providers
 *  (Fourthwall's storefront API) contribute nothing but their image host. */
const COMMERCE_ORIGINS: Record<string, CspOrigins> = {
  // Square Web Payments, from the toolkit that mounts it, so a host Square adds
  // arrives with an upgrade instead of as a console violation on every site. A
  // hand copy lived here and had already missed two (Square's Sentry ingest,
  // and Cash Sans's font host). Both environments by default, so ONE build
  // serves either: which environment you're in is a runtime secret, not a
  // build-time one.
  square: squareWebPaymentsCsp(),
  // Stripe.js and its Elements/Checkout iframes.
  stripe: {
    script: ["https://js.stripe.com"],
    frame: ["https://js.stripe.com", "https://hooks.stripe.com"],
    connect: ["https://api.stripe.com"],
  },
  // Fourthwall is read server-side; nothing runs in the browser.
  fourthwall: {},
};

// Turnstile. Always allowed, not gated on the captcha being configured: the
// scaffold ships the widget dormant (see the dormant-until-provisioned
// convention) and it must not need a rebuild to switch on—CSP is baked at
// build time, the secret is a runtime value.
const TURNSTILE: CspOrigins = turnstileCsp();

// The map module. MapLibre spins its tile-decoding workers up from blob: URLs,
// so `worker-src blob:` is not optional—without it the map renders an empty
// canvas and the console fills with worker-construction errors.
//
// Nothing else is needed, and that's the whole argument for the self-hosted
// basemap: the PMTiles archive is served same-origin, so `connect-src` stays
// `'self'` with no tile host and no API key to allow.
const MAP: CspOrigins = { worker: ["blob:"] };

const DIRECTIVE_KEYS = ["script", "style", "frame", "connect", "font", "img", "worker"] as const;

/** Merge origin lists, de-duplicated, order preserved. */
function mergeOrigins(...sets: CspOrigins[]): Required<CspOrigins> {
  const out = {} as Required<CspOrigins>;
  for (const key of DIRECTIVE_KEYS) {
    out[key] = [...new Set(sets.flatMap((set) => set[key] ?? []))];
  }
  return out;
}

/**
 * Every origin the project's enabled modules need, merged with the config's own
 * `security.cspOrigins`. Exported so a site (or `astroid doctor`) can inspect
 * what a config implies without rebuilding the whole policy.
 */
export function astroidCspOrigins(config: AstroidConfig): Required<CspOrigins> {
  return mergeOrigins(
    TURNSTILE,
    ...((config.modules ?? []).includes("map") ? [MAP] : []),
    // EVERY provider in play, not "the" provider: a site can run Stripe for
    // invoicing beside Fourthwall for the storefront, and a policy that allowed
    // only one of them blocks the other's SDK at runtime.
    ...astroidCommerceProviders(config.commerce).map((p) => COMMERCE_ORIGINS[p] ?? {}),
    config.security?.cspOrigins ?? {},
  );
}

/**
 * The `style-src` value the generated middleware rewrites every response to.
 *
 * `'unsafe-inline'` is required (Louise's data-driven `style=""` carriers and
 * the editor's runtime `<style>`), which is why Astro can't own this directive:
 * per spec a single hash here voids `'unsafe-inline'`. Module and config
 * `style` origins ride along, for example, the Square SDK's own stylesheet.
 */
export function astroidCspStyleSrc(config: AstroidConfig): string {
  return ["'self'", "'unsafe-inline'", ...astroidCspOrigins(config).style].join(" ");
}
