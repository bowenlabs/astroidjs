// Copyright (c) 2026 BowenLabs. Astroid is MIT licensed.
//
// Astroid → Louise content mapping. This is the opinionated seam: given an
// Astroid project config, derive the Louise `CollectionConfig`(s) a site needs.
// Astroid decides WHICH collections and fields exist (its opinions); Louise's
// codegen decides HOW they become D1 tables. Dependency flows one way — this
// imports `louise-toolkit/content`, never the reverse.

// `content/define` rather than the `content` barrel: the barrel eagerly pulls the
// codegen/localApi/validation chunks, and those import drizzle-orm for real — an
// *optional* peer of louise-toolkit, so importing it here forced a package on
// consumers who only ever describe collections. This entry is the drizzle-free
// half (see louise-toolkit/src/core/content/define.ts).
import {
  type CollectionConfig,
  type ContentConfig,
  defineCollection,
  type FieldConfig,
} from "louise-toolkit/content/define";
import { sanitizeRichHtml } from "louise-toolkit/security";
import type { AstroidConfig } from "../config.js";

/**
 * The opinionated `pages` collection — the EDITABLE page fields, versioned
 * drafts, and full-text search. Keyed to the same names as Louise's `pagesColumns`
 * so a publish's `.set()` maps straight onto the physical columns; bookkeeping
 * columns (`id`/`status`/timestamps/`publishedVersionId`) live on the table via
 * `pagesColumns`, never here — matching the site's `pages-collection.ts`.
 *
 * Validated by `defineCollection` at build time, so a malformed field shape throws
 * here rather than at codegen.
 */
export function astroidPagesCollection(config: AstroidConfig): CollectionConfig {
  // The `body` is rich HTML edited in place (`<Editable type="richtext">`) and
  // staged as a draft, so sanitize it on every write — never store raw HTML. A
  // pasted `<img>` pointing off-origin (a hotlink) is dropped: body images must
  // live in the media library. Mirrors the reference site's pages-collection hook.
  const mediaBase = config.deploy?.mediaBase ?? "/media";

  const fields: Record<string, FieldConfig> = {};
  fields.slug = { type: "text", required: true };
  fields.title = { type: "text", required: true };
  // Sanitized rich HTML (a string), not TipTap JSON — matches `pagesColumns.body`.
  fields.body = { type: "text" };
  fields.seoTitle = { type: "text" };
  fields.seoDescription = { type: "text" };
  fields.ogImage = { type: "text" };
  fields.noindex = { type: "checkbox" };
  fields.sortOrder = { type: "number" };
  // Structured page-builder blocks (the editable home) — deep-validated against
  // the section catalog on write in a later slice.
  fields.sections = { type: "json" };

  return defineCollection({
    slug: "pages",
    fields,
    hooks: {
      beforeChange: [
        ({ data }) => {
          if (typeof data.body === "string") {
            return { ...data, body: sanitizeRichHtml(data.body, { mediaBase }) };
          }
          return data;
        },
      ],
    },
    versions: { drafts: true },
    search: { fields: ["title", "body", "sections"] },
  });
}

/**
 * The Louise `ContentConfig` for an Astroid project. Today: the `pages`
 * collection. Archetype- and module-specific collections (e.g. a portfolio
 * `gallery`) layer in here as they land — this is the single place that maps
 * brand config down to Louise content.
 */
export function astroidContentConfig(config: AstroidConfig): ContentConfig {
  return { collections: [astroidPagesCollection(config)] };
}
