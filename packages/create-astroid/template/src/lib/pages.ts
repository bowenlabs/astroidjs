// Read one `pages` row for rendering. The home page and the catch-all page route
// both call this, so every page renders the same way: a visitor sees the live
// row, and an editor in edit mode sees the latest pending draft laid over it, so
// in-progress edits resume across reloads.
import { astroidPageDraft } from "astroidjs/pages";
import { isPageLive } from "louise-toolkit/content";
import astroidConfig from "../../astroid.config.js";

/** The bindings a page read uses: the database, and the draft buffer. */
type PageEnv = Pick<CloudflareEnv, "DB" | "DRAFTS">;

/** The columns a page render reads. */
export interface PageRow {
  id: number;
  slug: string;
  /** The on-page H1. The head's <title> comes from `seo_title`, else this. */
  title: string;
  body: string | null;
  /** The page-builder array, stored as a JSON string in D1. */
  sections: string | null;
  status: string | null;
  seo_title: string | null;
  seo_description: string | null;
  og_image: string | null;
  noindex: number | null;
}

/** What a page renders: its row, plus the title, body, and sections to show. */
export interface RenderedPage {
  row: PageRow;
  title: string;
  body: string;
  sections: unknown[];
}

interface ReadPageOptions {
  /** Edit mode shows every page, live or not, with its pending draft. */
  editMode: boolean;
  /**
   * Show a visitor only a live page (`status = 'published'`). Default `true`.
   * The home page passes `false`, so an unpublished home keeps rendering
   * rather than turning the site's front door into a 404.
   */
  requireLive?: boolean;
}

// `sections` is a JSON string in D1. Bad JSON is a render-time non-event: the
// page falls back to its prose body rather than failing on one malformed row.
function parseSections(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (typeof raw !== "string" || !raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * The page at `slug`, or `null` when there's none a visitor may see (or no
 * database yet, before provisioning). A `null` is a 404, and the middleware's
 * `redirectFor` then answers a renamed page's old URL with a redirect.
 */
export async function readPage(
  env: PageEnv,
  slug: string,
  { editMode, requireLive = true }: ReadPageOptions,
): Promise<RenderedPage | null> {
  let row: PageRow | null = null;
  try {
    row = await env.DB
      .prepare(
        "SELECT id, slug, title, body, sections, status, seo_title, seo_description, og_image, noindex FROM pages WHERE slug = ?",
      )
      .bind(slug)
      .first<PageRow>();
  } catch {
    // No DB binding yet (pre-provision).
    return null;
  }
  if (!row) return null;
  // The toolkit's one definition of "a visitor can see it" (ADR 0021).
  if (!editMode && requireLive && !isPageLive({ status: row.status ?? undefined })) return null;

  const page: RenderedPage = {
    row,
    title: row.title,
    body: row.body ?? "",
    sections: parseSections(row.sections),
  };
  if (!editMode) return page;

  // The editor's work-in-progress: the DRAFTS buffer first, since every save
  // writes through it and reaches D1 only when it flushes, then the newest
  // pending draft in D1. Reading D1 alone showed an editor who reloaded before
  // the flush an older page than the one they had just saved.
  try {
    const draft = await astroidPageDraft(astroidConfig, env, row.id);
    if (draft) {
      if (typeof draft.title === "string") page.title = draft.title;
      if (typeof draft.body === "string") page.body = draft.body;
      // Sections stage as drafts like any other field, so edit mode renders the
      // draft's array; otherwise section edits would vanish on reload while
      // title edits survive.
      if (draft.sections !== undefined) page.sections = parseSections(draft.sections);
    }
  } catch {
    // Non-fatal: fall back to the live row.
  }
  return page;
}
