// Copyright (c) 2026 BowenLabs. Astroid is MIT licensed.
//
// JSON-LD structured data — the `@graph` that describes the business to rich
// results and AI answer surfaces.
//
// Everything here is generic except the business `@type`, which is the one thing
// that genuinely differs per site — so it comes from the archetype, with a
// config escape hatch for the many cases where schema.org has a more specific
// subtype (a coffee shop is a `CafeOrCoffeeShop`, not a bare `Store`).

import type { Archetype, AstroidConfig } from "../config.js";
import type { AstroidSeoSettings } from "./resolve.js";

/** JSON-LD is a plain JSON tree; this is as much typing as it deserves. */
export type JsonLdNode = Record<string, unknown>;

/**
 * The schema.org `@type` each archetype describes its owner with. These are
 * intentionally the broad parent types: pick a subtype (`CafeOrCoffeeShop`,
 * `ArtGallery`, `HomeAndConstructionBusiness`) via `seo.businessType` when you
 * know one — a more specific type is strictly better for rich results.
 */
export const ARCHETYPE_BUSINESS_TYPE: Record<Archetype, string> = {
  marketing: "Organization",
  storefront: "Store",
  wholesale: "Organization",
  // A portfolio site is a person's body of work far more often than a company's.
  portfolio: "Person",
};

export interface StructuredDataInput {
  config: AstroidConfig;
  settings: AstroidSeoSettings & {
    logoUrl?: string | null;
    contactEmail?: string | null;
    contactPhone?: string | null;
    contactAddress?: string | null;
    /** Profile URLs, as stored in `site_settings.social_links`. */
    socialLinks?: unknown;
  };
  /** Absolute origin serving this page (the canonical host). */
  siteUrl: string;
  /**
   * An extra node for the thing this page is *about* — a Product, a
   * VisualArtwork, an Article. Joined into the same `@graph` so crawlers see
   * one connected description rather than three unrelated blobs.
   */
  entity?: JsonLdNode;
}

/** Absolute URL, or undefined when the value is empty or unparseable. */
function absolute(value: string | null | undefined, base: string): string | undefined {
  const raw = value?.trim();
  if (!raw) return undefined;
  try {
    return new URL(raw, base).toString();
  } catch {
    return undefined;
  }
}

/** Pull profile URLs out of `socialLinks`, which the editor stores as either a
 *  `{ instagram: "…" }` map or a plain array. */
function sameAs(links: unknown): string[] {
  const values = Array.isArray(links)
    ? links
    : links && typeof links === "object"
      ? Object.values(links as Record<string, unknown>)
      : [];
  return values
    .filter((v): v is string => typeof v === "string")
    .map((v) => v.trim())
    .filter((v) => /^https?:\/\//.test(v));
}

/**
 * Build the JSON-LD `@graph` for a page: the business node, a `WebSite` node,
 * and the page's own entity when there is one.
 *
 * The business gets a stable `@id` (`<origin>/#business`) so other nodes — a
 * product's `seller`, a future `Article` author — can reference it by id
 * instead of restating it.
 */
export function astroidStructuredData(input: StructuredDataInput): JsonLdNode {
  const { config, settings, siteUrl, entity } = input;
  const origin = siteUrl.replace(/\/$/, "");
  const businessId = `${origin}/#business`;
  const name = settings.siteName?.trim() || config.theme.name;
  const profiles = sameAs(settings.socialLinks);
  const image =
    absolute(settings.defaultOgImageUrl, siteUrl) ?? absolute(settings.logoUrl, siteUrl);

  const business: JsonLdNode = {
    "@type": config.seo?.businessType ?? ARCHETYPE_BUSINESS_TYPE[config.archetype],
    "@id": businessId,
    name,
    url: origin,
    ...(settings.tagline?.trim() ? { description: settings.tagline.trim() } : {}),
    ...(image ? { image, logo: image } : {}),
    ...(settings.contactEmail?.trim() ? { email: settings.contactEmail.trim() } : {}),
    ...(settings.contactPhone?.trim() ? { telephone: settings.contactPhone.trim() } : {}),
    ...(settings.contactAddress?.trim()
      ? { address: { "@type": "PostalAddress", streetAddress: settings.contactAddress.trim() } }
      : {}),
    ...(profiles.length ? { sameAs: profiles } : {}),
  };

  const website: JsonLdNode = {
    "@type": "WebSite",
    "@id": `${origin}/#website`,
    url: origin,
    name,
    publisher: { "@id": businessId },
  };

  return {
    "@context": "https://schema.org",
    "@graph": entity ? [business, website, entity] : [business, website],
  };
}

/**
 * Serialize JSON-LD for injection into a `<script type="application/ld+json">`.
 *
 * `application/ld+json` is data, not executable script, so `script-src` doesn't
 * govern it and no CSP hash is needed. But `JSON.stringify` does **not** escape
 * `<`, so any value folded into the graph that contains a literal `</script>` —
 * a product description, an artist statement, anything editor-authored — would
 * close the tag early and inject markup straight into `<head>`. Escaping the
 * HTML-significant characters as `\uXXXX` keeps the payload valid JSON while
 * making it impossible to break out of the element.
 */
export function escapeJsonLd(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
}
