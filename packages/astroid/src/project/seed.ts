// Copyright (c) 2026 BowenLabs. Astroid is MIT licensed.
//
// The home page a new project seeds, built from its own config.
//
// This used to be a fixed file in the `create-astroid` template, and it seeded
// the marketing sections (`hero`, `featureGrid`, `cta`) for every archetype. A
// portfolio's config listed `hero`, `gallery`, `aboutIntro`, and `contact`, but
// its first page showed a feature grid and a call to action instead. Building
// the seed from the same section list the config holds means the two can't
// disagree.
//
// It isn't in `generateAstroidScaffoldFiles`, on purpose: a seed runs once,
// against a fresh database, so `astroid generate` has no reason to write it
// back into a project that deleted it.

import { ASTROID_ARCHETYPE_SECTIONS } from "../config.js";
import type { AstroidConfig, SectionKind } from "../config.js";

/** A stored section item: its `_type`, field values, and settings tokens. */
export interface AstroidSeedSection {
  _type: SectionKind;
  _settings?: Record<string, string>;
  [field: string]: unknown;
}

/** The field values for one sample section. Settings are tokens, never CSS. */
type SectionSample = Omit<AstroidSeedSection, "_type">;

/**
 * Sample content for every section kind, keyed by `SectionKind`.
 *
 * A `Record` over the whole vocabulary rather than just the kinds an archetype
 * uses today, so adding a section to the catalog is a compile error here until
 * it has a sample. That keeps a site's `sections` override seedable, whatever
 * it lists.
 *
 * The copy tells the owner how to replace it, because it's the first thing they
 * see after signing in. Images are left empty: a new project has no media, and
 * every section with an image renders without one.
 */
const SAMPLES: Record<SectionKind, (brand: string) => SectionSample> = {
  hero: (brand) => ({
    heading: brand,
    subheading: "Sign in, switch on edit mode, and type to change this text.",
    ctaLabel: "Get in touch",
    ctaHref: "/contact",
    _settings: { colorway: "base", align: "center" },
  }),
  featureGrid: () => ({
    heading: "What you offer",
    items: [
      { title: "First thing", body: "Describe it here." },
      { title: "Second thing", body: "And this one." },
      { title: "Third thing", body: "And this one too." },
    ],
    _settings: { colorway: "base" },
  }),
  cta: () => ({
    heading: "Ready when you are",
    body: "Replace this copy with your own.",
    ctaLabel: "Contact us",
    ctaHref: "/contact",
    _settings: { colorway: "brand", align: "center" },
  }),
  gallery: () => ({
    heading: "Selected work",
    items: [],
    _settings: { colorway: "base" },
  }),
  media: () => ({
    heading: "A closer look",
    _settings: { colorway: "base" },
  }),
  splitImage: () => ({
    heading: "Tell your story",
    body: "<p>Add an image and a few sentences about what makes this place yours.</p>",
    _layout: "imageStart",
    _settings: { colorway: "base" },
  }),
  steps: () => ({
    heading: "How it works",
    items: [
      { title: "Get in touch", body: "Say what you need." },
      { title: "Plan it together", body: "Agree on the details." },
      { title: "Done", body: "Describe the result here." },
    ],
    _settings: { colorway: "base" },
  }),
  banner: () => ({
    text: "Announce something here, like new hours or a seasonal special.",
    _settings: { colorway: "brand", align: "center" },
  }),
  faq: () => ({
    heading: "Questions",
    items: [
      { question: "What's the first question people ask?", answer: "<p>Answer it here.</p>" },
      { question: "And the second?", answer: "<p>Answer that one here.</p>" },
    ],
    _settings: { colorway: "base" },
  }),
  pricingTiers: () => ({
    heading: "Pricing",
    items: [
      {
        name: "Starter",
        price: "$10",
        period: "/mo",
        features: [{ text: "Describe what's included" }],
        featured: "no",
      },
      {
        name: "Plus",
        price: "$20",
        period: "/mo",
        features: [{ text: "Everything in Starter" }, { text: "And more" }],
        featured: "yes",
      },
    ],
    _settings: { colorway: "base" },
  }),
  testimonial: () => ({
    quote: "Put a favorite thing a customer said about you here.",
    attribution: "Alex",
    role: "Customer",
    _settings: { colorway: "base", align: "center" },
  }),
  aboutIntro: (brand) => ({
    heading: `About ${brand}`,
    body: "<p>Say who you are, what you make, and why it matters to you.</p>",
    _settings: { colorway: "base" },
  }),
  productGrid: () => ({
    heading: "Featured",
    items: [
      { name: "First product", price: "$12" },
      { name: "Second product", price: "$18" },
      { name: "Third product", price: "$24" },
    ],
    _settings: { colorway: "base" },
  }),
  locationHours: () => ({
    heading: "Visit",
    address: "Your street address\nCity, region, and postal code",
    phone: "800-555-0100",
    items: [
      { day: "Monday to Friday", hours: "8 AM to 6 PM" },
      { day: "Saturday and Sunday", hours: "9 AM to 4 PM" },
    ],
    _settings: { colorway: "base" },
  }),
  contact: () => ({
    heading: "Get in touch",
    blurb: "Questions, orders, or just saying hello: send a message.",
    _settings: { colorway: "secondary" },
  }),
};

/**
 * The sections a new project's home page starts with: the config's `sections`,
 * or its archetype's default when the config doesn't list any, each with
 * sample content.
 */
export function astroidHomeSeedSections(config: AstroidConfig): AstroidSeedSection[] {
  const kinds = config.sections ?? ASTROID_ARCHETYPE_SECTIONS[config.archetype];
  return kinds.map((kind) => ({ _type: kind, ...SAMPLES[kind](config.theme.name) }));
}

/** A SQLite string literal. Doubling `'` is the only escape SQLite needs. */
function sqlString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

/**
 * `seed/home.seed.sql`: one idempotent insert of the published `home` page,
 * with the sections from {@link astroidHomeSeedSections}.
 *
 * Every value is escaped here, so a brand name with an apostrophe produces
 * valid SQL. The template's token substitution can't escape, which is why the
 * seed isn't a template file.
 */
export function generateAstroidHomeSeed(config: AstroidConfig): string {
  const brand = config.theme.name;
  const sections = JSON.stringify(astroidHomeSeedSections(config), null, 2);
  const body = `<p>Welcome to ${escapeHtml(brand)}. Sign in at <code>/login</code>, switch on edit mode, and change this text in place, then select Publish.</p>`;
  return [
    "-- Seed the editable home page (slug `home`) that src/pages/index.astro renders.",
    "-- Idempotent. Apply once after migrations:",
    "--   wrangler d1 execute DB --file seed/home.seed.sql --remote",
    "--   (drop --remote for the local dev D1)",
    "--",
    "-- `sections` is the page-builder array: the same shape the on-canvas editor",
    "-- reads and the server validates against the section catalog on write. Each item",
    '-- is `{"_type": …, …fields, "_settings": {…}}`, and `_settings` holds TOKENS',
    "-- (colorway, align), never CSS, so a re-theme needs no content change. The list",
    "-- matches `sections` in astroid.config.ts.",
    "--",
    "-- Seeding it is deliberate: an empty array renders an empty page, and a blank",
    "-- canvas is a worse first run than having something real to click on and edit.",
    "--",
    "-- Full-text search (the editor's Pages search) is kept in sync on PUBLISH, so a",
    "-- row inserted with raw SQL like this isn't in the index until you either",
    "-- publish an edit to it or backfill once with `POST /api/louise/pages/reindex`",
    "-- (signed in). The page renders fine either way; only in-editor search is",
    "-- affected.",
    "--",
    "-- To override just the <head> title and description (not the on-page H1), add",
    "-- `seo_title` and `seo_description` columns below. `seo_title` is run through the",
    "-- config's title template, which already appends the brand, so set the page",
    '-- part only ("Pricing"), not "Pricing | Your brand".',
    "INSERT OR IGNORE INTO pages (slug, title, body, sections, status, sort_order, created_at, updated_at)",
    "VALUES (",
    "  'home',",
    `  ${sqlString(brand)},`,
    `  ${sqlString(body)},`,
    `  json(${sqlString(sections)}),`,
    "  'published',",
    "  0,",
    "  unixepoch(),",
    "  unixepoch()",
    ");",
    "",
  ].join("\n");
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
