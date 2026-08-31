// Copyright (c) 2026 BowenLabs. Astroid is MIT licensed.
//
// SEO resolution — settings defaults + per-page overrides, collapsed into the
// exact set of values a `<head>` needs.
//
// Both sites that hand-built this layer converged on the same three-level
// fallback (page override → the page's computed default → the site-wide
// setting) and the same non-obvious details: an empty string is *unset*, not a
// blank tag, so clearing a field in the editor falls back instead of publishing
// an empty `<meta>`; and the title template applies only when a page supplies
// its own title, so the home page reads "Acme Coffee" rather than
// "Acme Coffee | Acme Coffee".
//
// Kept as a pure function rather than baked into the component so it can be
// unit-tested, and so a route that isn't rendering a page (an OG-image endpoint,
// a feed) can resolve the same values.

/**
 * The `site_settings` subset the SEO layer reads. Structurally typed, so a
 * composed settings table (or a plain object in a test) satisfies it without
 * Astroid knowing anything about the rest of the row.
 */
export interface AstroidSeoSettings {
  siteName?: string | null;
  tagline?: string | null;
  metaDescription?: string | null;
  defaultOgImageUrl?: string | null;
  /** Site-wide kill switch — noindex every page (staging, pre-launch). */
  disableIndexing?: boolean | null;
}

/** Per-page SEO: an editor's overrides, or a built-in page's own defaults. */
export interface PageSeoInput {
  /** Bare title, pre-template. Omit for the site-wide default. */
  title?: string | null;
  description?: string | null;
  /** Absolute URL or a site-root path; resolved against the serving origin. */
  ogImage?: string | null;
  /** `"website"` (default), or `"article"` / `"product"` for a richer card. */
  ogType?: string | null;
  /** Keep this page out of the index (cart, checkout, account, auth). */
  noindex?: boolean | null;
}

export interface AstroidSeoOptions {
  /** Canonical URL of the page being rendered — absolute. */
  canonical: string;
  /**
   * Title template, `%s` standing in for the page title. Applied ONLY when the
   * page supplies a title. Default `"%s | <siteName>"`.
   */
  titleTemplate?: string;
  /** `@<handle>` for Twitter/X card attribution. */
  twitterHandle?: string;
  /** OG locale, e.g. `"en_US"`. */
  locale?: string;
}

/** Everything a `<head>` needs, fully resolved and absolute. */
export interface ResolvedSeo {
  /** Final `<title>` — templated when the page supplied one. */
  title: string;
  /** Untemplated page title, for OG/Twitter (which shouldn't carry the site
   *  suffix twice — the OG `site_name` already says it). */
  bareTitle: string;
  description?: string;
  canonical: string;
  ogType: string;
  ogImage?: string;
  ogImageAlt?: string;
  siteName?: string;
  locale?: string;
  twitterHandle?: string;
  noindex: boolean;
}

/** Trimmed value, or undefined — an empty/whitespace string counts as unset. */
const clean = (value: string | null | undefined): string | undefined => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
};

/** Absolute URL for a path or URL, or undefined if it can't be resolved. */
function absolute(value: string | null | undefined, base: string): string | undefined {
  const raw = clean(value);
  if (!raw) return undefined;
  try {
    return new URL(raw, base).toString();
  } catch {
    return undefined;
  }
}

/**
 * Resolve a page's SEO against the site settings.
 *
 * ```ts
 * const seo = resolvePageSeo(settings, { title: page.seoTitle, noindex: page.noindex }, {
 *   canonical: Astro.url.href,
 * });
 * ```
 *
 * `settings.disableIndexing` wins over everything: it's the site-wide kill
 * switch, so a page that asks to be indexed on a staging deploy still isn't.
 */
export function resolvePageSeo(
  settings: AstroidSeoSettings,
  page: PageSeoInput = {},
  options: AstroidSeoOptions,
): ResolvedSeo {
  const siteName = clean(settings.siteName);
  const pageTitle = clean(page.title);
  const template = options.titleTemplate ?? (siteName ? `%s | ${siteName}` : "%s");

  // No page title → the site-wide title stands alone. Templating it would read
  // "Acme Coffee | Acme Coffee".
  const bareTitle = pageTitle ?? siteName ?? "";
  const title = pageTitle ? template.replace("%s", pageTitle) : bareTitle;

  const description = clean(page.description) ?? clean(settings.metaDescription);
  const ogImage =
    absolute(page.ogImage, options.canonical) ??
    absolute(settings.defaultOgImageUrl, options.canonical);

  return {
    title,
    bareTitle,
    description,
    canonical: options.canonical,
    ogType: clean(page.ogType) ?? "website",
    ogImage,
    ogImageAlt: ogImage
      ? [siteName, bareTitle].filter(Boolean).join(" — ") || undefined
      : undefined,
    siteName,
    locale: clean(options.locale),
    twitterHandle: clean(options.twitterHandle),
    // The site-wide switch is deliberately not overridable per page.
    noindex: Boolean(settings.disableIndexing) || Boolean(page.noindex),
  };
}
