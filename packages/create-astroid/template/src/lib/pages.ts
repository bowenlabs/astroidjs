// Read one `pages` row for rendering. The home page and the catch-all page route
// both call this, so every page renders the same way: a visitor sees the live
// row, and an editor in edit mode sees the latest pending draft laid over it, so
// in-progress edits resume across reloads.
import { isPageLive } from "louise-toolkit/content";

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
  db: D1Database,
  slug: string,
  { editMode, requireLive = true }: ReadPageOptions,
): Promise<RenderedPage | null> {
  let row: PageRow | null = null;
  try {
    row = await db
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

  // The latest PENDING draft: newer than every version ever published. An
  // older draft is superseded, since a publish already moved past it, so it
  // must not come back just because it's the newest row marked `draft`.
  try {
    const draft = await db
      .prepare(
        "SELECT version_data FROM pages_versions WHERE parent_id = ?1 AND status = 'draft'" +
          " AND id > COALESCE((SELECT MAX(id) FROM pages_versions WHERE parent_id = ?1 AND status = 'published'), 0)" +
          " ORDER BY id DESC LIMIT 1",
      )
      .bind(row.id)
      .first<{ version_data: string }>();
    if (draft?.version_data) {
      const d = JSON.parse(draft.version_data) as {
        title?: unknown;
        body?: unknown;
        sections?: unknown;
      };
      if (typeof d.title === "string") page.title = d.title;
      if (typeof d.body === "string") page.body = d.body;
      // Sections stage as drafts like any other field, so edit mode renders the
      // draft's array; otherwise section edits would vanish on reload while
      // title edits survive.
      if (d.sections !== undefined) page.sections = parseSections(d.sections);
    }
  } catch {
    // Non-fatal: fall back to the live row.
  }
  return page;
}
