// Copyright (c) 2026 BowenLabs. Astroid is MIT licensed.
//
// `defineAstroid` — the Astroid project configuration surface.
//
// Astroid is the opinionated layer over Louise Toolkit + Astro. A site's whole
// shape — its brand + theme + editable home, its commerce backend, its optional
// modules — collapses into ONE typed config here. Astroid consumes it to generate
// the Louise wiring (worker routes, middleware, Drizzle schema, theme tokens) a
// site would otherwise hand-write per repo.
//
// ONE brand per project. Every site Astroid targets (coracle.coffee,
// ghostfire.coffee, themidwestartist.com, louise-web) serves a single brand from a
// single deploy — none does host/tenant dispatch. The axis that genuinely
// multiplexes is *editors* (Louise's org plugin, #100) and *audiences* (a gated
// portal alongside the public site), not brands — so both live here as options on
// the one brand, not as a `brands[]` array.
//
// The vocabulary below is not invented: `Archetype`, `SectionKind`, and
// `ModuleKind` are extracted from the real sites Astroid targets — a storefront
// (coracle), a wholesale front (ghostfire), an artist portfolio (megbowen), and a
// plain marketing baseline (louise-web).

import type { RateRule } from "louise-toolkit/security";
import type { CatalogMirrorConfig } from "./commerce/mirror.js";
import { assertCommerceRoles } from "./commerce/roles.js";
import { AstroidConfigError } from "./errors.js";
import type { astroidSectionCatalog } from "./components/sections.js";
import type { PortalRoute } from "./portal/guard.js";
import type { PwaConfig } from "./pwa/generate.js";

/**
 * The starting shape the front-end takes. Not a fork — each archetype is a preset
 * of defaults (which sections/modules are on, nav shape) that the site then tunes.
 * `marketing` = the lean brochure floor (louise-web, no commerce); `storefront` =
 * DTC shop (coracle); `wholesale` = B2B/private-label (ghostfire); `portfolio` =
 * gallery + prints + client portal (megbowen).
 */
export type Archetype = "marketing" | "storefront" | "wholesale" | "portfolio";

/**
 * The section vocabulary — the editable home page is an ordered list of these,
 * top to bottom.
 *
 * DERIVED from the section catalog, not hand-written (#277). It used to be its
 * own union, and the two drifted in both directions: this named four kinds with
 * no catalog entry and no component (`marquee`, `featured`, `story`, `visit`),
 * while omitting eight that were real and renderable. A scaffold's config then
 * listed sections that could never render, and nothing type-checked the gap.
 *
 * A type-only import, so the derivation adds no runtime dependency: `config.ts`
 * is loaded by the `create-astroid` CLI, and this keeps its import graph
 * exactly as it was.
 */
export type SectionKind = keyof typeof astroidSectionCatalog;

/**
 * Each archetype's default home-page sections.
 *
 * Lives here, in TypeScript, rather than in `create-astroid`'s plain JS — the
 * other half of #277. As a JS object literal it could name a section that
 * didn't exist and nothing would say so; typed against {@link SectionKind}
 * (itself derived from the catalog) a stale name is a compile error, and CI
 * type-checks this package.
 *
 * The four kinds this used to name — `marquee`, `featured`, `story`, `visit` —
 * had no catalog entry or component and could never render. Each is replaced by
 * the real section that does its job: a marquee is a `banner`, curated picks
 * are a `productGrid`, a brand-origin block is `aboutIntro`, and "visit" is
 * exactly `locationHours`.
 */
export const ASTROID_ARCHETYPE_SECTIONS: Record<Archetype, SectionKind[]> = {
  marketing: ["hero", "featureGrid", "cta", "contact"],
  storefront: ["hero", "banner", "productGrid", "locationHours", "contact"],
  wholesale: ["hero", "featureGrid", "aboutIntro", "contact"],
  portfolio: ["hero", "gallery", "aboutIntro", "contact"],
};

/**
 * Optional capabilities the site switches on. Pluggable, not core — a portfolio
 * site runs none of the commerce ones. `orderTracking` is shared across both
 * coffee brands, so it's first-class but still opt-in.
 */
export type ModuleKind =
  | "map"
  | "orderTracking"
  | "pwa"
  | "subscriptions"
  | "giftCards"
  | "wholesaleInquiry"
  | "privateLabel";

/** Commerce backend — mirrors Louise's provider set (louise-toolkit/commerce). */
export type CommerceProvider = "stripe" | "square" | "fourthwall";

export interface Theme {
  /** Display name — the brand, used in nav, `<title>`, OG cards. */
  name: string;
  /** Path to the primary logo (media-library asset or a `/brand/*` file). */
  logo?: string;
  /**
   * Brand color tokens → CSS variables + a daisyUI theme, surfaced in Louise
   * Settings so the brand is editable in place (not hard-coded). `brand` is
   * required; `secondary`/`tertiary` mirror `site_settings`' existing columns.
   */
  colors: { brand: string; secondary?: string; tertiary?: string };
  /** Font preset key (a bundled `@font-face` set) or a custom family name. */
  font?: string;
}

export interface Portal {
  enabled: boolean;
  /** Require a session to view the whole site (Meg Bowen's gated preview), not
   *  just the account area. Default `false`. */
  gated?: boolean;
  /** Modules exposed inside the account area (e.g. `orderTracking`). */
  features?: ModuleKind[];
  /**
   * Roles a portal account can hold, first being the default for a new account.
   * Default `["customer"]`. These are the portal's OWN roles — entirely separate
   * from the editor's `admin`, because the two auth instances don't share a
   * user table.
   */
  roles?: string[];
  /**
   * Route guard table: everything under `prefix` needs one of `roles`. Matched
   * in order, first match wins. Defaults to `/portal` + `/api/portal` for any
   * signed-in portal user.
   */
  routes?: PortalRoute[];
  /**
   * Where a portal user lands, per role — used to bounce someone who reached an
   * area they don't belong in. Default `/portal` for everyone.
   */
  home?: Record<string, string>;
  /**
   * Allow public sign-up. Default `false`: both consuming sites provision portal
   * accounts by hand, and a portal is usually for people you already know.
   */
  signUp?: boolean;
}

export interface CommerceConfig {
  /**
   * Shorthand for a single-provider site. Assigns the provider to a role it can
   * actually serve — `square`/`fourthwall` become the storefront, `stripe`
   * becomes invoicing (its client has no catalog API).
   */
  provider?: CommerceProvider;
  /** Catalog, cart, checkout. Needs a provider with a catalog API. */
  storefront?: CommerceProvider;
  /**
   * Invoices for work that isn't a catalog item — commissions, originals.
   * Independent of `storefront`: themidwestartist.com runs Stripe here and
   * Fourthwall as the storefront, because neither can do the other's job.
   */
  invoicing?: CommerceProvider;
  /** The catalog mirror's shape — its mode, table name, and owned columns. */
  catalog?: CatalogMirrorConfig;
}

export interface QueuesConfig {
  /**
   * Force the queue consumer + cron on or off. Defaults to on whenever
   * `commerce` is configured: a commerce provider means webhooks, and a webhook
   * you process inline is a webhook you drop when the provider times out.
   */
  enabled?: boolean;
  /**
   * Cron for the safety-net re-sync, or `false` for none. Webhooks get missed —
   * a provider outage, a deploy mid-delivery, a DLQ'd message — and without a
   * periodic re-sync the site serves stale data until someone notices. Default
   * hourly.
   */
  cron?: string | false;
  /** Deliveries before Cloudflare routes a message to the DLQ. Default 5. */
  maxRetries?: number;
  /** Messages per consumer invocation. Default 10. */
  maxBatchSize?: number;
  /** Seconds the consumer waits to fill a batch. Default 30. */
  maxBatchTimeout?: number;
}

export interface SeoConfig {
  /**
   * `<title>` template, `%s` standing in for the page title. Applied only when
   * a page supplies its own title, so the home page reads "Acme Coffee" and not
   * "Acme Coffee | Acme Coffee". Default `"%s | <site name>"`.
   */
  titleTemplate?: string;
  /**
   * schema.org `@type` for the business node in the JSON-LD graph. Defaults to
   * the archetype's broad type (see `ARCHETYPE_BUSINESS_TYPE`); set a more
   * specific subtype whenever you know one — `"CafeOrCoffeeShop"`,
   * `"ArtGallery"`, `"HomeAndConstructionBusiness"` — since a narrower type is
   * strictly better for rich results.
   */
  businessType?: string;
  /** `@handle` for Twitter/X card attribution. */
  twitterHandle?: string;
  /** Open Graph locale, e.g. `"en_US"`. */
  locale?: string;
}

export interface SecurityConfig {
  /**
   * Extra rate-limit rules for surfaces Astroid doesn't know about, and the seam
   * for overriding a default budget. These are matched BEFORE the derived
   * defaults (first match wins), so declaring a rule for a path Astroid already
   * covers replaces that one rule rather than the whole set.
   */
  rateRules?: RateRule[];
  /**
   * Extra origins to allow in the generated Content-Security-Policy, merged with
   * the ones Astroid derives from the enabled modules. Add a host here when you
   * pull in a third party Astroid can't see (a chat widget, a video embed).
   */
  cspOrigins?: CspOrigins;
}

/** Per-directive origin lists contributed to the CSP. */
export interface CspOrigins {
  script?: string[];
  frame?: string[];
  connect?: string[];
  font?: string[];
  img?: string[];
  worker?: string[];
}

export interface DeployConfig {
  platform: "cloudflare";
  /** Media base for R2 + `cf-image` resizing — matches Louise's media route
   *  (`media.<brand>/cdn-cgi/image`). Default `"/media"`. */
  mediaBase?: string;
}

export interface AstroidConfig {
  /**
   * Stable project slug — the worker/D1/R2 base name and default subdomain (e.g.
   * `"coracle"`). Required and non-empty; it drives the generated binding names.
   */
  key: string;
  /** Hostname(s) this site serves (prod + preview), for custom-domain routes. */
  hosts?: string[];
  /** Starting shape; sets section/module/nav defaults the site can override. */
  archetype: Archetype;
  /** The single brand's theme (display name + color tokens + font). */
  theme: Theme;
  /** The editable home page, top to bottom. Omit to take the archetype default. */
  sections?: SectionKind[];
  /** Optional capabilities switched on for this site. */
  modules?: ModuleKind[];
  /** Gated account/portal area (order tracking, client galleries). */
  portal?: Portal;
  /** Commerce backend. */
  commerce?: CommerceConfig;
  /** Queue consumer + cron safety net. Defaults on when `commerce` is set. */
  queues?: QueuesConfig;
  /** Title template, structured-data type, and social-card attribution. */
  seo?: SeoConfig;
  /** Additions to the rate-limit rules + CSP origins Astroid derives. */
  security?: SecurityConfig;
  /** Installable-app settings. Only read when `modules` includes `"pwa"`. */
  pwa?: PwaConfig;
  deploy?: DeployConfig;
}

/**
 * Define an Astroid project. An identity function in the shape of Astro's
 * `defineConfig`: it returns the config verbatim with full type-checking +
 * inference, and validates the invariants that would otherwise fail deep inside
 * generation (a non-empty project `key`, since it names the generated bindings;
 * a brand `theme.name` + `colors.brand`, since they seed the site and theme).
 *
 * ```ts
 * export default defineAstroid({
 *   key: "coracle",
 *   archetype: "storefront",
 *   theme: { name: "Coracle Coffee", colors: { brand: "#1f6f78" } },
 *   sections: ["hero", "marquee", "featured", "productGrid", "visit"],
 *   commerce: { provider: "square" },
 *   deploy: { platform: "cloudflare" },
 * });
 * ```
 */
export function defineAstroid(config: AstroidConfig): AstroidConfig {
  if (!config.key || config.key.trim().length === 0) {
    throw new AstroidConfigError(
      "Astroid config requires a non-empty `key` (it names the generated worker/D1/R2 bindings)",
    );
  }
  if (!config.theme || !config.theme.name || config.theme.name.trim().length === 0) {
    throw new AstroidConfigError("Astroid config requires `theme.name` (the brand's display name)");
  }
  if (!config.theme.colors || !config.theme.colors.brand) {
    throw new AstroidConfigError(
      "Astroid config requires `theme.colors.brand` (the primary brand color)",
    );
  }
  // A provider assigned to a role its client can't serve (invoicing over
  // Fourthwall, a storefront over Stripe) fails here rather than at runtime on
  // the first invoice, as a missing function.
  assertCommerceRoles(config.commerce);

  return config;
}
