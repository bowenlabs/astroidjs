// Copyright (c) 2026 BowenLabs. Astroid is MIT licensed.
//
// `astroidjs/pages`—the editor's work-in-progress on a page, for a page route
// in edit mode. A subpath of its own because it reads through louise-toolkit's
// editor and Drizzle, which the main entry (loaded by astroid.config.ts and the
// CLI) stays free of.
//
// The generated worker saves pages through the DRAFTS buffer, keyed by the pages
// collection's slug, and flushes to `pages_versions` in D1 behind it. A page
// route has to read the same way, buffer first, or an editor who reloads before
// the flush sees an older page than the one they just saved. Every site that
// read D1 alone hit that, and each wrapped louise-toolkit's `resumeDraft` in the
// same few lines to fix it. This is those lines, with the slug and the versions
// table derived from the config rather than restated.

import { collectionVersionsTable } from "louise-toolkit/content";
import type { D1Client } from "louise-toolkit/db";
import { type DraftBufferKV, resumeDraft } from "louise-toolkit/editor";
import type { AstroidConfig } from "../config.js";
import { astroidPagesCollection } from "../schema/collections.js";

/** The bindings a page draft read uses: the database, and the draft buffer. */
export interface AstroidPageDraftEnv {
  DB: D1Client;
  /** The draft buffer the generated routes save through, when bound. */
  DRAFTS?: DraftBufferKV;
}

/**
 * The editor's work-in-progress snapshot of the page with id `pageId`, or
 * `null` when there's none (render the live row). The buffer comes first, then
 * the newest pending draft in D1, the same order a save builds on.
 *
 * Returns the whole snapshot: which fields a page renders from it (`sections`,
 * `body`, `title`) is the site's call. Call it only in edit mode; a visitor
 * sees the live row.
 */
export function astroidPageDraft(
  config: AstroidConfig,
  env: AstroidPageDraftEnv,
  pageId: number,
): Promise<Record<string, unknown> | null> {
  const collection = astroidPagesCollection(config);
  return resumeDraft(
    env.DB,
    {
      versionsTable: collectionVersionsTable(collection),
      collection: collection.slug,
      bufferKv: env.DRAFTS,
    },
    { id: pageId },
  );
}
