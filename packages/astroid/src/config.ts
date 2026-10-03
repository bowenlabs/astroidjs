// Copyright (c) 2026 BowenLabs. Astroid is MIT licensed.
//
// `defineAstroid`—the Astroid project configuration surface.
//
// Astroid is the opinionated layer over Louise Toolkit + Astro. A site's whole
// shape—its brand + theme + editable home, its commerce backend, its optional
// modules—collapses into ONE typed config here. Astroid consumes it to generate
// the Louise wiring (worker routes, middleware, Drizzle schema, theme tokens) a
// site would otherwise hand-write per repo.
//
// ONE brand per project. Every site Astroid targets (the client sites its
// patterns came from, and louise-web) serves a single brand from a
// single deploy. The axis that genuinely multiplexes is *editors* (Louise's org
// plugin, #100) and *audiences*—a gated portal alongside the public site, or a
// per-merchant storefront on its own subdomain (`tenancy`)—not brands. So all
// of them live here as options on the one brand, not as a `brands[]` array.
//
// `tenancy` is worth being precise about, because "serves many hosts" sounds like
// the thing this paragraph rules out and isn't. It serves scoped VIEWS OF ONE
// BRAND'S DATA—the same theme, the same catalog, the same editors—narrowed by
// host. It is the portal's axis, one step further out. A second brand still means
// a second project.
//
// The vocabulary below is not invented: `Archetype`, `SectionKind`, and
// `ModuleKind` are extracted from the real sites Astroid targets—a storefront,
// a wholesale front, an artist portfolio, and a plain marketing baseline
// (louise-web).

import type { BlockCatalog, SectionCatalog } from "louise-toolkit/content";
import type { RateRule } from "louise-toolkit/security";
import { assertAuthIsolation } from "./auth/index.js";
import { assertBusiness } from "./business.js";
import type { CatalogMirrorConfig } from "./commerce/mirror.js";
import { assertCommerceRoles } from "./commerce/roles.js";
import { AstroidConfigError } from "./errors.js";
// The cron facts come from the module that derives them, so the duplicate check
// can't drift from what `astroidCrons` actually emits. A real import rather than
// a type-only one, which is safe here: `queues/messages.ts` imports this file
// type-only, so the cycle erases at build and nothing circular exists at runtime.
// It is also dependency-free, so `create-astroid`'s graph is unchanged.
import { ASTROID_HEALTH_CRON, astroidCron, astroidUsesQueues } from "./queues/messages.js";
import type { astroidSectionCatalog } from "./components/sections.js";
import type { PortalRoute } from "./portal/guard.js";
import type { PwaConfig } from "./pwa/generate.js";
import { astroidHasEditor } from "./shape.js";

/**
 * The starting shape the front-end takes. Not a fork—each archetype is a preset
 * of defaults (which sections/modules are on, nav shape) that the site then tunes.
 * `marketing` = the lean brochure floor (louise-web, no commerce); `storefront` =
 * DTC shop; `wholesale` = B2B/private-label; `portfolio` = gallery + prints +
 * client portal.
 */
export type Archetype = "marketing" | "storefront" | "wholesale" | "portfolio";

/**
 * The section vocabulary—the editable home page is an ordered list of these,
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
 * Lives here, in TypeScript, rather than in `create-astroid`'s plain JS—the
 * other half of #277. As a JS object literal it could name a section that
 * didn't exist and nothing would say so; typed against {@link SectionKind}
 * (itself derived from the catalog) a stale name is a compile error, and CI
 * type-checks this package.
 *
 * The four kinds this used to name—`marquee`, `featured`, `story`, `visit`—had
 * no catalog entry or component and could never render. Each is replaced by
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
 * Optional capabilities the site switches on. Pluggable, not core—a portfolio
 * site runs none of the commerce ones.
 *
 * **Every value here is read by something.** The union used to also name
 * `orderTracking`, `subscriptions`, `giftCards`, and `privateLabel`, none of
 * which had a single consumer anywhere in the package: setting one type-checked,
 * passed validation, and did nothing at all—no scaffold, no CSP origin, no
 * rate rule, no table. A config surface that accepts a setting it ignores is
 * worse than a smaller one, because the only way to discover the truth is to
 * deploy and notice the absence.
 *
 * They are removed rather than left as TODOs. `orderTracking` in particular has
 * a real implementation waiting—`src/workflow/` is a client site's order tracker,
 * generalized—but it is reached through `defineWorkflow`, not this flag, and
 * pretending otherwise is what made the flag misleading. Re-add each one in the
 * change that wires it.
 */
export type ModuleKind = "authRateLimit" | "map" | "pwa" | "realtime" | "wholesaleInquiry";

/** Commerce backend—mirrors Louise's provider set (louise-toolkit/commerce). */
export type CommerceProvider = "stripe" | "square" | "fourthwall";

export interface Theme {
  /** Display name—the brand, used in nav, `<title>`, OG cards. */
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
  /**
   * @deprecated NOT IMPLEMENTED—`defineAstroid` throws if this is set.
   *
   * It was meant to require a session for the whole site (a pre-launch client
   * gallery), not just the account area, but nothing ever read it: the guard
   * table is built from {@link Portal.routes} and `portalGuard` allows any
   * unmatched path. Until it's wired, gate the site by naming the prefixes in
   * `routes`—that is the mechanism this would have been sugar for.
   */
  gated?: boolean;
  /** Modules exposed inside the account area (for example, `wholesaleInquiry`, which
   *  adds the inquiries table even on an archetype that wouldn't have one). */
  features?: ModuleKind[];
  /**
   * Roles a portal account can hold, first being the default for a new account.
   * Default `["customer"]`. These are the portal's OWN roles—entirely separate
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
   * Where a portal user lands, per role—used to bounce someone who reached an
   * area they don't belong in. Default `/portal` for everyone.
   */
  home?: Record<string, string>;
  /**
   * Allow public sign-up. Default `false`: both consuming sites provision portal
   * accounts by hand, and a portal is usually for people you already know.
   */
  signUp?: boolean;
  /**
   * Where the portal's Better Auth instance mounts—its own handler, separate
   * from the editor's `/api/auth`. Default `/api/portal-auth`. Override when a
   * site already ships a second instance at a different path (for example, a shop
   * account at `/api/shop-auth`) whose live cookies must not change.
   */
  basePath?: string;
  /**
   * Cookie prefix for the portal instance—MUST differ from the editor's
   * (Better Auth's default), or signing into one instance signs you out of the
   * other. Default `"portal"`. `defineAstroid` rejects a colliding value.
   */
  cookiePrefix?: string;
  /**
   * Table-name prefix for the portal's Better Auth tables. Default `"portal_"`
   * (`portal_user`, …); set `""` to take the unprefixed `user`/`session` tables
   * (the editor owns `louise_*`, so they don't collide). MUST differ from the
   * editor's `louise_` prefix.
   */
  tablePrefix?: string;
}

export interface CommerceConfig {
  /**
   * Shorthand for a single-provider site. Assigns the provider to a role it can
   * actually serve—`square`/`fourthwall` become the storefront, `stripe`
   * becomes invoicing (its client has no catalog API).
   */
  provider?: CommerceProvider;
  /** Catalog, cart, checkout. Needs a provider with a catalog API. */
  storefront?: CommerceProvider;
  /**
   * Invoices for work that isn't a catalog item—commissions, originals.
   * Independent of `storefront`: a site can invoice through one provider (say,
   * Stripe) and run its storefront through another (say, Fourthwall), because
   * neither can do the other's job.
   */
  invoicing?: CommerceProvider;
  /**
   * In-person selling: physical inventory held at real places, sold at a
   * counter or a market stall rather than through the site's own cart.
   *
   * Separate from `storefront` because they are genuinely different jobs and a
   * site commonly runs both. An artist's site might sell print-on-demand merch
   * through Fourthwall (`storefront`) while originals and self-stocked prints
   * live in Square (`pos`) across several shops and galleries—one catalog per
   * rail, neither able to do the other's job.
   *
   * What `pos` turns on that `storefront` does not: locations, per-location
   * pricing, and per-location inventory.
   */
  pos?: CommerceProvider;
  /** The catalog mirror's shape—its mode, table name, and owned columns. */
  catalog?: CatalogMirrorConfig;
  /** Square-specific options. Only meaningful when Square fills some role. */
  square?: SquareCommerceConfig;
  /**
   * Whether this project runs the commerce pipeline: the webhook receivers, the
   * queue consumer that processes them, and the hourly catalog re-sync. Default
   * `true`.
   *
   * Set `false` for a project that only takes payments while another project,
   * or another Worker in the same repository, runs the pipeline against the
   * same account. It keeps what a checkout needs, the provider's CSP origins,
   * the checkout rate rule, and the checkout route, and drops the rest, along
   * with the webhook signing secret nothing would verify.
   */
  pipeline?: boolean;
}

export interface SquareCommerceConfig {
  /**
   * How many Square Locations this project sells at.
   *
   * `"single"` (the default) is the ordinary case: one location, its id supplied
   * once as `SQUARE_LOCATION_ID`, and every order placed against it.
   *
   * `"multi"` is the multi-merchant model—each merchant is a Location, and the
   * id comes from the *request* (which merchant's storefront is this?) rather
   * than from the environment. Setting it stops Astroid requiring
   * `SQUARE_LOCATION_ID`: a single ambient location id is not merely unnecessary
   * there, it is a hazard, because anything defaulting to it would silently ring
   * one merchant's sale against another merchant's books.
   */
  locations?: "single" | "multi";
}

export interface QueuesConfig {
  /**
   * Force the queue consumer + cron on or off. Defaults to on whenever
   * `commerce` is configured with its pipeline: a commerce provider means
   * webhooks, and a webhook you process inline is a webhook you drop when the
   * provider times out.
   */
  enabled?: boolean;
  /**
   * Cron for the safety-net re-sync, or `false` for none. Webhooks get missed—a
   * provider outage, a deploy mid-delivery, a DLQ'd message—and without a
   * periodic re-sync the site serves stale data until someone notices. Default
   * hourly.
   */
  cron?: string | false;
  /** Deliveries before Cloudflare routes a message to the DLQ. Default 5. */
  maxRetries?: number;
  /**
   * Seconds Cloudflare waits before redelivering a failed message. Default
   * 30. The queue owns retries, so keep a handler's own client retries off
   * rather than stacking them on top of these.
   */
  retryDelay?: number;
  /** Messages per consumer invocation. Default 10. */
  maxBatchSize?: number;
  /** Seconds the consumer waits to fill a batch. Default 30. */
  maxBatchTimeout?: number;
}

/**
 * One project-declared scheduled trigger, beyond the two Astroid derives (the
 * daily health scan and the hourly catalog re-sync).
 *
 * Declaring it here rather than by hand is what keeps `wrangler.jsonc` and the
 * generated `scheduled` dispatch in agreement. Adding a cron to `triggers.crons`
 * alone produces a trigger Cloudflare fires and the dispatch never matches—unreachable
 * code that costs an invocation and does nothing, with no error
 * anywhere. Adding it in the dashboard instead drifts from the config that is
 * supposed to describe the deploy.
 */
/**
 * Serve `*.example.com` from this one Worker—scoped views of **this brand's**
 * data, narrowed by host. A per-merchant storefront, a per-client gallery.
 *
 * Not multi-brand: see the note at the top of this file. Same theme, same
 * catalog, same editors; the host selects a slice.
 *
 * Astroid provides only the plumbing that cannot live in a site: the wildcard
 * Worker route (which `hosts` cannot express) and the one middleware file Astro
 * permits. **Everything that decides anything stays yours**—what a label maps
 * to, whether the lookup is cached, and what an unknown host should do. Those
 * live in the scaffolded `src/tenancy.ts`, which is yours to edit.
 */
export interface TenancyConfig {
  /**
   * The wildcard host, for example, `"*.example.com"`. Emitted as a **zone route**
   * (`{ pattern, zone_name }`), never `custom_domain: true`—a wildcard cannot
   * be a custom domain, which is exactly why `hosts` cannot express this.
   */
  hostPattern: string;
  /**
   * The Cloudflare zone the pattern belongs to. Defaults to `hostPattern` minus
   * its leading `*.`, which is right whenever the wildcard sits directly under
   * the zone apex. Set it explicitly for a deeper pattern—`*.shop.example.com`
   * is served by the `example.com` zone, not a `shop.example.com` one.
   */
  zone?: string;
  /**
   * Labels that are **not** tenants—`www`, `admin`, `studio`, `api`. These
   * skip the tenant lookup entirely and render the ordinary site.
   *
   * Declared here rather than in the seam because the generated middleware needs
   * it before it can decide whether to call the seam at all, and because
   * forgetting `www` is the mistake that turns your marketing homepage into a
   * failed tenant lookup.
   */
  reserved?: string[];
  /**
   * Internal path prefix a tenant request is rewritten to. Default `"/t"`, so
   * `acme.example.com/prints` renders `/t/acme/prints`.
   *
   * The visitor's URL never changes—this is an internal rewrite, so links
   * built from `Astro.url` stay public and correct.
   */
  rewritePrefix?: string;
  /**
   * First-party apps on their own labels, mapped to the internal path prefix
   * each serves from—`{ studio: "/studio" }` serves
   * `studio.example.com/<path>` from `src/pages/studio/<path>`.
   *
   * This is the missing half of {@link PwaConfig.emitDir}'s subdomain story:
   * an app label is not a tenant (there is no lookup—the studio exists
   * whether or not any tenant does) and not merely reserved (a reserved label
   * renders the ordinary site, which turns the admin host into a second copy
   * of the marketing homepage). It is a static rewrite, decided at config time.
   *
   * An app label is implicitly reserved: `tenantLabel` never offers it to
   * `resolveTenant`, and listing it in `reserved` too is refused—one list
   * per fact, or the two drift.
   *
   * Same internal-rewrite semantics as tenants: the visitor's URL never
   * changes, and the path form stays reachable on the apex—which is what
   * makes local dev work, since `wrangler dev` cannot serve subdomains.
   */
  apps?: Record<string, string>;
  /**
   * What a syntactically-valid tenant host whose label resolves to NOTHING
   * (`resolveTenant` returned `null`) should get.
   *
   * `"fallthrough"` (the default) renders the ordinary site—which means a
   * stranger who points a CNAME at your zone gets your homepage. `"404"` emits
   * a guard that refuses the request instead, which is the right answer the
   * moment tenant hosts are commercial surfaces: an unknown storefront must be
   * unambiguously *not a page*, not a copy of the marketing site under someone
   * else's name.
   *
   * Either way the decision stays visible in config rather than buried in the
   * seam: `resolveTenant` decides *what exists*; this decides what not-existing
   * means. Reserved labels, app labels, the apex, and off-pattern hosts are
   * never affected—they aren't tenant candidates at all.
   */
  unknown?: "fallthrough" | "404";
  /**
   * Path prefixes the host rewrite must leave alone. Default `["/api"]`.
   *
   * The rewrite exists to choose which PAGE renders for a host. An API route
   * is not a page: its address is absolute, chosen by the client that calls
   * it, and it reads the host from `locals.tenant` rather than from its own
   * path. Rewriting it moves it somewhere no route matches—and on an app
   * host with a catch-all page, somewhere much worse than a 404: the page
   * catch-all answers, so `fetch("/api/…")` gets HTML (or a redirect to a
   * sign-in) instead of JSON, and every data load on that host silently fails
   * while the same code works on the apex.
   *
   * That is not hypothetical—it is why this default exists (found on a client
   * site's studio host, where the whole admin app loaded and then fetched
   * nothing).
   *
   * Set `[]` to rewrite everything, or add prefixes for other host-agnostic
   * surfaces (`/_actions`, `/webhooks`). Matching is prefix-based on a path
   * segment, so `/api` matches `/api/x` and `/api` but never `/apiary`.
   */
  rewriteExclude?: string[];
}

export interface AstroidCron {
  /** Standard 5-field cron, UTC—for example, `"*&#47;15 * * * *"`. */
  expression: string;
  /**
   * The queue message this trigger sends. **Enqueued, never run inline**, so the
   * work takes the same retry and DLQ path as every other message and a slow job
   * can't hold the scheduled handler open.
   *
   * Typed `unknown` because the consumer owns the message vocabulary: whatever
   * you put here arrives at your `handleQueueMessage`'s `onMessage`.
   */
  message: unknown;
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
   * specific subtype whenever you know one—`"CafeOrCoffeeShop"`,
   * `"ArtGallery"`, `"HomeAndConstructionBusiness"`—since a narrower type is
   * strictly better for rich results.
   */
  businessType?: string;
  /** `@handle` for Twitter/X card attribution. */
  twitterHandle?: string;
  /**
   * Open Graph locale, for example, `"de_DE"`. Defaults to `business.locale`
   * in Open Graph form, so set this only when the two differ. Read it through
   * `astroidSeoLocale(config)`, which applies that default.
   */
  locale?: string;
}

/**
 * Facts about the business the site serves, which louise-toolkit takes as
 * parameters rather than guessing: `louise-toolkit/dates` needs the time zone,
 * `formatMoney` the currency and locale, and the Square wallet sheet the
 * country and currency.
 *
 * None has a default, since a default would be a guess about someone else's
 * business. `commerce` requires `currency`; the rest stay unset until the site
 * states them. Read them through `astroidBusiness(config)`.
 *
 * ```ts
 * business: {
 *   timeZone: "Europe/Berlin",
 *   currency: "EUR",
 *   country: "DE",
 *   locale: "de-DE",
 * },
 * ```
 */
export interface BusinessConfig {
  /**
   * IANA time zone of the business, for example, `"Europe/Berlin"`. Opening
   * hours, "open now", and any date shown as the business's local time read
   * it, never the Worker's clock or the visitor's browser.
   */
  timeZone?: string;
  /**
   * ISO 4217 code of the currency the site charges in, for example, `"EUR"`,
   * in uppercase. Required with `commerce`, which supports only currencies
   * with 2 minor-unit digits.
   */
  currency?: string;
  /**
   * ISO 3166-1 alpha-2 code of the country the business operates in, for
   * example, `"DE"`, in uppercase. A payment provider's wallet sheet, such as
   * Apple Pay through Square, needs it.
   */
  country?: string;
  /**
   * BCP 47 language tag the site is written in, for example, `"de-DE"`, in
   * canonical form. It formats money and dates, and it's the default for
   * `seo.locale`, in Open Graph form (`de_DE`) when it has a region.
   */
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
  /** Rendered by the generated middleware (it owns `style-src`), not by Astro. */
  style?: string[];
  frame?: string[];
  connect?: string[];
  font?: string[];
  img?: string[];
  worker?: string[];
}

export interface SettingsConfig {
  /**
   * Override the editable base `site_settings` columns. Defaults to Astroid's
   * standard set (`ASTROID_SETTINGS_COLUMNS`). A **custom-heavy** site whose
   * settings shape doesn't align with the base column names keeps everything in
   * `custom` by passing `[]`—otherwise a key that happens to match a base
   * column name (for example, `contactEmail`) would route to that column instead of
   * `custom`, where the site's render reads it.
   */
  columns?: string[];
  /**
   * Site-specific settings keys stored in the `site_settings.custom` JSON column,
   * on top of (or, with `columns: []`, instead of) Astroid's base columns. The
   * generated `settingsRoute` + Action accept these; the Settings panel writes
   * them through the `settingsExtension` groups a site supplies to
   * `mountSettings`. A site with a rich settings shape (footer columns, an hours
   * table, UI strings, shop/order config) lists their top-level keys here.
   */
  customKeys?: string[];
  /** Extra media-library image keys beyond the base logo/favicon/OG defaults—*
    settings values validated as media-library URLs on write. */
  imageKeys?: string[];
  /**
   * Take per-key sanitizers and a GET transform from the scaffold-once
   * `src/settings-hooks.ts`. The generated `settingsRoute` and the scaffolded
   * settings Action both spread them in, so the two write paths clean a value
   * the same way.
   *
   * The allowlist alone decides only which keys are written, not what's in
   * them. Turn this on when a site's settings need clamping or normalizing
   * before they're stored, such as a length limit, an email address, or a
   * nested config object. The hooks live in a module rather than in this config
   * because a sanitizer usually imports runtime code, which the CLI can't load.
   */
  hooks?: boolean;
}

/** Media-library upload policy. */
export interface MediaConfig {
  /**
   * Largest accepted upload, in bytes. Default 10 MB (louise-toolkit's
   * `DEFAULT_MAX_BYTES`).
   *
   * Raise it when the masters ARE the product—a photographer's or painter's
   * portfolio uploads 40 MB camera files and only ever serves Cloudflare-
   * resized derivatives, so the master's size costs storage, not page weight.
   *
   * Bounded by the platform, not by this setting: a Cloudflare Worker rejects
   * a request body over 100 MB before any handler runs, so a value above that
   * would fail at the edge with no error you can catch. Validated at generate
   * time rather than surfacing as a mystery upload failure in production.
   */
  maxUploadBytes?: number;
}

export interface PagesConfig {
  /**
   * Take a transform and extra reserved slugs for the `pages` route from the
   * scaffold-once `src/pages-hooks.ts`. The generated worker passes them to
   * `astroidPagesWriteHooks`, so the site's transform runs before Astroid's own
   * section sanitize and validate.
   *
   * Turn this on when a site cleans a page write itself: normalizing the slug,
   * clamping a title, or filling a new page's defaults.
   */
  hooks?: boolean;
  /**
   * Reserved slugs this site serves as pages. `contact` and `login` are
   * reserved because a new scaffold has file routes there, and `work` because
   * a portfolio has its gallery there. A site without that file, whose page at
   * the path comes from its own catch-all route, lists the slug here so the
   * Pages route accepts it. Only those three can be allowed
   * ({@link ASTROID_SCAFFOLD_ROUTE_SLUGS}): the platform serves the other
   * reserved slugs, such as `api` and `sitemap.xml`, before any page.
   */
  allowSlugs?: string[];
}

/**
 * The reserved slugs that come from a scaffolded file route rather than the
 * platform, so a site without that file can allow them with `pages.allowSlugs`.
 */
export const ASTROID_SCAFFOLD_ROUTE_SLUGS: readonly string[] = ["contact", "login", "work"];

export interface StatusConfig {
  /**
   * Add the site's own checks to the public status route, from the
   * scaffold-once `src/status-checks.ts`: for example, the catalog snapshot's
   * age, or the last health scan's. The generated worker spreads them after
   * Astroid's own `d1` and `content` checks.
   */
  checks?: boolean;
}

/**
 * Incident capture (louise-toolkit ADR 0022). Every Astroid site counts its
 * failures into its own D1 and an Analytics Engine dataset; these settings add
 * to that.
 */
export interface IncidentsConfig {
  /**
   * The failures that should alert: dotted names (`commerce.checkout`) and
   * path prefixes (`/cart`). A site fact, so there's no default list.
   */
  critical?: string[];
  /**
   * Also send each incident to Sentry, the operator's issue system for a
   * Monitored or Supported site. It reads the DSN from the `SENTRY_DSN`
   * secret, and stays dormant while that's unset or a placeholder.
   */
  sentry?: boolean;
}

export interface DeployConfig {
  platform: "cloudflare";
  /** Media base for R2 + `cf-image` resizing—matches Louise's media route
   *  (`media.<brand>/cdn-cgi/image`). Default `"/media"`. */
  mediaBase?: string;
  /**
   * Whether `astroid ship` applies D1 migrations before it deploys. Default
   * `true`. Set `false` for an app whose database another app migrates, such
   * as a second Worker in the same repository that binds the first one's D1.
   * One app owns a database's schema. When both migrate, one release tag runs
   * two `wrangler d1 migrations apply` at once against one ledger, and a
   * non-idempotent statement fails the second deploy.
   */
  migrations?: boolean;
}

/**
 * The object form of `inquiries`. Setting it turns inquiries on, like
 * `inquiries: true`: the `inquiries` table, the editor's Inquiries tab, and the
 * Home inbox count.
 */
export interface InquiriesConfig {
  /**
   * Mount the generated public contact form route, `POST
   * /api/louise/forms/inquiries`, which stores a submission and sends the
   * owner notification and the sender confirmation. Defaults to `true`.
   *
   * Set `false` when the site has its own contact endpoint that writes the
   * `inquiries` table. Otherwise the generated route stays reachable beside
   * yours, with none of your endpoint's captcha, field limits, or mail rules.
   * The scaffolded `src/pages/contact.astro` posts to the generated route, so
   * point its form at your endpoint, or remove the page.
   */
  publicForm?: boolean;
}

/**
 * A small "Site by …" line the footer renders for the agency that built the
 * site. A site fact, so it has no default: omit it and nothing renders.
 */
export interface CreditConfig {
  /** Who built the site, for example `"Example Organization"`. */
  name: string;
  /** Where the credit links, as an absolute `http` or `https` URL. */
  href: string;
  /**
   * An optional mark shown before the name: a root-relative path (for example
   * `"/credit-mark.svg"`) or an `https:` URL. It's drawn as a mask filled with
   * the text color, so one single-color SVG works on every theme. Only its
   * shape counts; its own fill is ignored.
   */
  logo?: string;
  /** The link's `rel`, for example `"noopener"` or `"noopener nofollow"`. The
   *  site decides; omitted, the link carries none. */
  rel?: string;
  /** The words before the name. Default `"Site by"`. */
  label?: string;
}

export interface AstroidConfig {
  /**
   * Stable project slug—the worker/D1/R2 base name and default subdomain (for example,
   * `"example"`). Required and non-empty; it drives the generated binding names.
   */
  key: string;
  /** Hostnames this site serves (prod + preview), for custom-domain routes. */
  hosts?: string[];
  /**
   * Serve a wildcard host from this Worker, mapping each subdomain to an
   * internal path prefix. See {@link TenancyConfig}—and note it is an
   * *audiences* axis, not multi-brand.
   */
  tenancy?: TenancyConfig;
  /** Starting shape; sets section/module/nav defaults the site can override. */
  archetype: Archetype;
  /**
   * Whether the project has a Louise editor. Default `true`.
   *
   * Set `false` for an app with no pages to edit, such as an order app whose
   * menu comes from a commerce provider and whose few settings another site's
   * editor owns. The generated worker and middleware then carry no editor
   * routes and no sign-in, the schema carries no content tables, and
   * `wrangler.jsonc` binds no draft buffer, media bucket, or AI. What stays is
   * the rate limiter, the CSP, the security headers, the public status route,
   * and the `portal`, `pwa`, `commerce`, and `tenancy` modules.
   *
   * `defineAstroid` refuses every option that configures the editor
   * alongside it, such as `sections` or `media`, rather than ignore it.
   */
  editor?: boolean;
  /** The single brand's theme (display name + color tokens + font). */
  theme: Theme;
  /** The editable home page, top to bottom. Omit to take the archetype default. */
  sections?: SectionKind[];
  /**
   * A site-provided section catalog that REPLACES the built-in one for
   * SERVER-side validation + sanitization of `pages.sections` (the generated
   * pages route + versions route). A site with bespoke section designs—its own
   * `.astro` components and field defs (a dozen or more sections)—registers them
   * here so writes to its custom `_type`s validate instead of 422-ing against the
   * built-in vocabulary. The on-canvas editor already uses the site's catalog
   * (its `mountSections` call passes it); this closes the server half so both
   * write paths agree. Omit to use Astroid's built-in catalog.
   */
  sectionCatalog?: SectionCatalog;
  /**
   * The site's catalog of BLOCK types (ADR 0005)—the block-level analogue of
   * {@link sectionCatalog}, and required for any section whose def declares a
   * `blocks` policy.
   *
   * Without it the server has no field shape to check a block against, so
   * `validateSections` rejects every block `_type` as unknown and a block-bearing
   * write returns 422—the on-canvas block toolbar appears to work and then nothing
   * saves. It also gates block rich-text **sanitization**: block fields are only
   * scrubbed when their def is resolvable here.
   *
   * Omit for a sections-only site (no section declares `blocks`).
   */
  blockCatalog?: BlockCatalog;
  /** Optional capabilities switched on for this site. */
  modules?: ModuleKind[];
  /** Gated account/portal area (order tracking, client galleries). */
  portal?: Portal;
  /** Commerce backend. */
  commerce?: CommerceConfig;
  /** Queue consumer + cron safety net. Defaults on when `commerce` is set. */
  queues?: QueuesConfig;
  /**
   * Extra scheduled triggers beyond Astroid's two. Each is emitted into **both**
   * `triggers.crons` and the generated `scheduled` dispatch, so the pair cannot
   * drift. See {@link AstroidCron}.
   *
   * Requires the queue consumer, since a cron's work is enqueued rather than run
   * inline; `defineAstroid` refuses the combination rather than generating a
   * `send` against a binding that doesn't exist.
   */
  crons?: AstroidCron[];
  /** The business's time zone, currency, country, and locale. None has a default. */
  business?: BusinessConfig;
  /** Title template, structured-data type, and social-card attribution. */
  seo?: SeoConfig;
  /** Additions to the rate-limit rules + CSP origins Astroid derives. */
  security?: SecurityConfig;
  /** Site-specific editable settings—extra `custom` keys + image keys on top
   *  of Astroid's base `site_settings` columns. */
  settings?: SettingsConfig;
  /** Media-library upload policy (for example, a larger `maxUploadBytes`). */
  media?: MediaConfig;
  /** The editable `pages` collection's site-owned write hooks. */
  pages?: PagesConfig;
  /** The public status route's site-owned checks. */
  status?: StatusConfig;
  /** Incident capture settings: what alerts, and whether Sentry gets a copy. */
  incidents?: IncidentsConfig;
  /**
   * Force the contact form + `inquiries` table on or off. Omit to detect from
   * the config (a `contact` section, or a wholesale-inquiry module). Set `true`
   * when a bespoke section captures inquiries under a name Astroid can't see
   * (for example, a custom `contactForm` section); set `false` to suppress it
   * entirely.
   *
   * An object turns inquiries on, like `true`, and configures them. Set
   * `{ publicForm: false }` when the site's own endpoint writes the
   * `inquiries` table: the editor's Inquiries tab and the inbox count stay,
   * and the generated public form route isn't mounted. See
   * {@link InquiriesConfig}.
   */
  inquiries?: boolean | InquiriesConfig;
  /** Installable-app settings. Only read when `modules` includes `"pwa"`. */
  pwa?: PwaConfig;
  /** The agency credit `<Credit>` renders in the footer. Omit for none. */
  credit?: CreditConfig;
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
 *   key: "example",
 *   archetype: "storefront",
 *   theme: { name: "Example Organization", colors: { brand: "#5b4bff" } },
 *   sections: ["hero", "banner", "productGrid", "locationHours", "contact"],
 *   commerce: { provider: "square" },
 *   business: { timeZone: "Europe/Berlin", currency: "EUR", country: "DE", locale: "de-DE" },
 *   deploy: { platform: "cloudflare" },
 * });
 * ```
 */
/**
 * Both ways a project-declared cron silently does nothing.
 *
 * A duplicate expression is the sharper one: the generated dispatch matches on
 * `controller.cron` in order, so a custom trigger colliding with a derived one
 * (or another custom one) never reaches its own branch. Cloudflare fires it, the
 * first branch handles it, and the config reads as though both are live—exactly
 * the unreachable-trigger failure `config.crons` exists to prevent.
 */
function assertCrons(config: AstroidConfig): void {
  // `queues.cron` schedules the catalog re-sync, which belongs to the pipeline.
  // Without one it would be accepted and never scheduled.
  if (config.commerce?.pipeline === false && typeof config.queues?.cron === "string") {
    throw new AstroidConfigError(
      "`queues.cron` schedules the catalog re-sync, which `commerce.pipeline: false` " +
        "leaves to the project that runs the pipeline. Remove `queues.cron`, or use " +
        "`crons` for a job of this project's own.",
    );
  }

  const crons = config.crons ?? [];
  if (crons.length === 0) return;

  if (!astroidUsesQueues(config)) {
    throw new AstroidConfigError(
      "`crons` needs the queue consumer: a cron's work is enqueued, not run inline, and " +
        "without it the generated handler would `send` to a binding this project never creates. " +
        "Set `queues: { enabled: true }`, or drop the crons.",
    );
  }

  const seen = new Map<string, string>(
    astroidHasEditor(config) ? [[ASTROID_HEALTH_CRON, "the daily health scan"]] : [],
  );
  const catalog = astroidCron(config);
  if (catalog) seen.set(catalog, "the catalog re-sync (`queues.cron`)");

  for (const cron of crons) {
    const expression = cron.expression?.trim();
    if (!expression) {
      throw new AstroidConfigError("Every entry in `crons` needs a non-empty `expression`");
    }
    const owner = seen.get(expression);
    if (owner) {
      throw new AstroidConfigError(
        `Duplicate cron \`${expression}\`: it already belongs to ${owner}. One \`scheduled\` ` +
          "handler dispatches on the expression, so the first branch wins and this one would " +
          "never run. Use a different minute.",
      );
    }
    seen.set(expression, "another entry in `crons`");
  }
}

/**
 * `pages.allowSlugs` may only name a slug reserved for a scaffolded file route.
 * Allowing `api` or `sitemap.xml` would let an editor save a page nobody can
 * reach, which is the silent failure the reserved list exists to prevent.
 */
function assertAllowSlugs(config: AstroidConfig): void {
  for (const slug of config.pages?.allowSlugs ?? []) {
    if (!ASTROID_SCAFFOLD_ROUTE_SLUGS.includes(slug)) {
      throw new AstroidConfigError(
        `\`pages.allowSlugs\` can't allow "${slug}". Only the slugs reserved for a scaffolded ` +
          `file route can be allowed (${ASTROID_SCAFFOLD_ROUTE_SLUGS.join(", ")}); the ` +
          "platform serves the others before any page.",
      );
    }
  }
}

/**
 * The tenancy misconfigurations that fail late, or not at all.
 *
 * All three are cheap to state and expensive to discover: two surface as a
 * wrangler deploy error naming a zone or a pattern rather than the config that
 * produced it, and the third never surfaces at all—it just serves the wrong
 * page.
 */
function assertTenancy(config: AstroidConfig): void {
  const tenancy = config.tenancy;
  if (!tenancy) return;

  const pattern = tenancy.hostPattern?.trim();
  if (!pattern) {
    throw new AstroidConfigError(
      '`tenancy.hostPattern` is required: a wildcard such as `"*.example.com"`',
    );
  }
  if (!pattern.startsWith("*.")) {
    throw new AstroidConfigError(
      `\`tenancy.hostPattern\` must be a wildcard starting with "*.", but it's "${pattern}". ` +
        "A fixed host is a custom domain: put it in `hosts` instead.",
    );
  }

  const apex = pattern.slice(2);
  if (!apex.includes(".")) {
    throw new AstroidConfigError(
      `\`tenancy.hostPattern\` "${pattern}" has no domain after the wildcard`,
    );
  }

  // A wildcard does NOT match its own apex, so the apex needs its own route.
  // Without one it returns 404—and the symptom is "the marketing site is down"
  // immediately after enabling a feature that reads like it only adds hosts.
  if (!(config.hosts ?? []).some((host) => host.toLowerCase() === apex.toLowerCase())) {
    throw new AstroidConfigError(
      `\`tenancy.hostPattern\` is "${pattern}", but "${apex}" is not in \`hosts\`. ` +
        "A wildcard route does not match its own apex, so the apex would 404. " +
        `Add "${apex}" to \`hosts\`.`,
    );
  }

  // App labels: each failure below otherwise surfaces as a rewrite to a path
  // that renders the wrong page, with nothing pointing back at the config.
  for (const [label, prefix] of Object.entries(tenancy.apps ?? {})) {
    if (!label || label.includes(".")) {
      throw new AstroidConfigError(
        `\`tenancy.apps\` label "${label}" must be a single subdomain label, ` +
          "because Cloudflare's wildcard matches one level.",
      );
    }
    if ((tenancy.reserved ?? []).includes(label)) {
      throw new AstroidConfigError(
        `"${label}" is in both \`tenancy.apps\` and \`tenancy.reserved\`. ` +
          "An app label is implicitly reserved, so keep it in `apps` only, or the " +
          "two lists drift and `reserved` silently wins.",
      );
    }
    if (!prefix.startsWith("/") || prefix === "/" || prefix.endsWith("/")) {
      throw new AstroidConfigError(
        `\`tenancy.apps.${label}\` must be an internal path prefix like "/studio" ` +
          `(leading slash, no trailing slash, not "/"), but it's "${prefix}". ` +
          'The rewrite is `prefix + pathname`, so "/" or a trailing slash produces "//…".',
      );
    }
  }
}

/** Cloudflare rejects a request body over 100 MB at the edge, before any Worker
 *  handler runs—so an upload limit above it can never be honoured, and the
 *  failure arrives as an opaque edge error rather than the route's own 413. */
const WORKERS_MAX_REQUEST_BODY_BYTES = 100 * 1024 * 1024;

function assertMediaConfig(media: MediaConfig | undefined): void {
  const max = media?.maxUploadBytes;
  if (max === undefined) return;
  if (!Number.isInteger(max) || max <= 0) {
    throw new AstroidConfigError(
      `\`media.maxUploadBytes\` must be a positive integer number of BYTES; got ${max}`,
    );
  }
  if (max > WORKERS_MAX_REQUEST_BODY_BYTES) {
    throw new AstroidConfigError(
      `\`media.maxUploadBytes\` (${max}) exceeds Cloudflare's 100 MB request-body limit. ` +
        "A body that large is rejected at the edge before the Worker runs, so the upload " +
        "would fail with an error the media route never sees.",
    );
  }
}

/**
 * A credit that would render as a broken link or an empty mark.
 *
 * The logo is limited to a root-relative path or `https:` because it lands in a
 * CSS `url()`: a `data:` or `javascript:` value there is at best unrenderable,
 * and a relative one resolves against each page's path rather than the site.
 */
function assertCredit(credit: CreditConfig | undefined): void {
  if (!credit) return;
  if (!credit.name?.trim()) {
    throw new AstroidConfigError("`credit.name` is required: the name the footer credits");
  }
  let href: URL | undefined;
  try {
    href = new URL(credit.href);
  } catch {
    // Reported below with the value that failed.
  }
  if (!href || (href.protocol !== "https:" && href.protocol !== "http:")) {
    throw new AstroidConfigError(
      `\`credit.href\` must be an absolute http or https URL, such as "https://example.com", ` +
        `but it's "${credit.href}"`,
    );
  }
  const logo = credit.logo;
  if (
    logo !== undefined &&
    !(logo.startsWith("/") && !logo.startsWith("//")) &&
    !logo.startsWith("https://")
  ) {
    throw new AstroidConfigError(
      `\`credit.logo\` must be a root-relative path such as "/credit-mark.svg" or an ` +
        `https URL, but it's "${logo}"`,
    );
  }
}

/**
 * The options an app with no editor can't honor. Each configures the editor, a
 * table it edits, or a surface only an editor reviews, so accepting one would
 * be accepting a setting nothing reads.
 */
const EDITOR_ONLY_OPTIONS = [
  ["sections", "the editable home page"],
  ["sectionCatalog", "the page editor's sections"],
  ["blockCatalog", "the page editor's blocks"],
  ["media", "the media library"],
  ["pages", "the editable pages"],
  ["settings", "the Settings panel"],
] as const;

/** Modules that only work with an editor, and why. */
const EDITOR_ONLY_MODULES: Partial<Record<ModuleKind, string>> = {
  realtime: "it syncs editors editing one page",
  wholesaleInquiry: "its inquiries are reviewed in the editor",
};

function assertEditorFree(config: AstroidConfig): void {
  if (astroidHasEditor(config)) return;
  const without = "An app with `editor: false` has no editor";
  for (const [key, what] of EDITOR_ONLY_OPTIONS) {
    if (config[key] !== undefined) {
      throw new AstroidConfigError(
        `${without}, so \`${key}\` (${what}) would do nothing. Remove it, or drop \`editor: false\`.`,
      );
    }
  }
  if (config.inquiries === true || isInquiriesObject(config.inquiries)) {
    const given = config.inquiries === true ? "`inquiries: true`" : "an `inquiries` object";
    throw new AstroidConfigError(
      `${without} to review inquiries in, so ${given} would collect messages ` +
        "nobody reads. Remove it, or drop `editor: false`.",
    );
  }
  for (const module of [...(config.modules ?? []), ...(config.portal?.features ?? [])]) {
    const why = EDITOR_ONLY_MODULES[module];
    if (why) {
      throw new AstroidConfigError(
        `${without}, so the \`${module}\` module can't work: ${why}. Remove it, or drop \`editor: false\`.`,
      );
    }
  }
  if (config.deploy?.mediaBase !== undefined) {
    throw new AstroidConfigError(
      `${without} and no media library, so \`deploy.mediaBase\` would do nothing. Remove it.`,
    );
  }
  // The limiter guards sign-in, and an app with no editor signs people in only
  // through its portal.
  if ((config.modules ?? []).includes("authRateLimit") && !config.portal?.enabled) {
    throw new AstroidConfigError(
      `${without} and no portal, so nobody signs in and the \`authRateLimit\` module has ` +
        "nothing to guard. Remove it, or turn the portal on.",
    );
  }
}

/** True for the object form of `inquiries`, which turns inquiries on. */
function isInquiriesObject(value: unknown): value is InquiriesConfig {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * `inquiries` is a boolean or an object whose `publicForm` is a boolean. A
 * config loaded without type-checking can carry anything, and a truthy value
 * of the wrong shape, such as `{ publicForm: "no" }`, would otherwise keep the
 * public form route mounted on a site that meant to turn it off.
 */
function assertInquiries(value: AstroidConfig["inquiries"]): void {
  if (value === undefined || typeof value === "boolean") return;
  if (!isInquiriesObject(value)) {
    throw new AstroidConfigError(
      `\`inquiries\` must be a boolean or an object, such as \`{ publicForm: false }\`, but it's ${JSON.stringify(value)}`,
    );
  }
  if (value.publicForm !== undefined && typeof value.publicForm !== "boolean") {
    throw new AstroidConfigError(
      `\`inquiries.publicForm\` must be a boolean, but it's ${JSON.stringify(value.publicForm)}`,
    );
  }
}

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

  // A time zone, currency, country, or locale that `Intl` doesn't know fails
  // here, and so does `commerce` without the currency it charges in.
  assertBusiness(config);

  // A media limit above the platform's own body cap is unhonourable—reject it
  // here rather than let an editor watch a 120 MB upload die at the edge.
  assertMediaConfig(config.media);

  // A portal is a SECOND Better Auth instance beside the editor's. Reject any
  // isolation that would collide with the editor on the same origin (a shared
  // cookie prefix silently cross-signs-out; a shared table prefix merges the two
  // user tables)—the intermittent-prod failure the fixed defaults prevent.
  assertAuthIsolation(config);

  // `portal.gated` is declared and resolved but read by NOTHING—the guard
  // table is built from `portal.routes` alone, and `portalGuard` allows any
  // unmatched path. So a site that set it believed the whole site sat behind a
  // login (a pre-launch client gallery) while every page outside /portal was
  // public, and it type-checked.
  //
  // Refusing the flag is the only safe state until it's implemented. A security
  // control that silently does nothing is strictly worse than one that isn't
  // offered: the first gives false confidence, the second sends you looking for
  // an answer. Fail loudly, at config load, naming the workaround.
  assertCrons(config);
  assertTenancy(config);
  assertAllowSlugs(config);
  assertInquiries(config.inquiries);
  assertEditorFree(config);
  assertCredit(config.credit);

  if (config.portal?.gated) {
    throw new AstroidConfigError(
      "`portal.gated` is not implemented: it is accepted but wires no guard, so the site " +
        "would be fully public while appearing gated. Remove it, and gate the whole site by " +
        'listing the prefixes you mean in `portal.routes` (for example, `[{ prefix: "/" }]` with your ' +
        "login and auth paths ahead of it).",
    );
  }

  return config;
}
