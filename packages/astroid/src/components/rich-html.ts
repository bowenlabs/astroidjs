// Copyright (c) 2026 BowenLabs. Astroid is MIT licensed.
//
// Stored rich text, sanitized again where it renders (ADR 0026).
//
// The pages collection sanitizes `body` and every section's rich-text fields on
// write. That covers what's written from now on, not what's already stored:
// HTML saved before a sanitizer fix, or written around the write hook, reaches
// `set:html` exactly as it is. So every place Astroid renders stored rich text
// runs it through `sanitizeRichHtml` again, with the same media base the write
// used, and stored HTML is covered by the sanitizer the site runs today without
// re-saving anything.
//
// Sanitizing is a parse per field per render, so the result is memoized. The
// output is a pure function of the input and the media base, so a memo shared by
// every request in an isolate can't leak one request's content into another's.
//
// Self-contained (ships as source): imports only louise-toolkit, never astroid
// `src/*`.

import { sanitizeRichHtml } from "louise-toolkit/security";

/** Options for {@link sanitizeAstroidRichHtml}. */
export interface AstroidRichHtmlOptions {
  /**
   * The site's media base, `env.MEDIA_URL`. An `<img>` that isn't served from
   * it is dropped, as the pages collection's write hook drops it. Omit it to
   * keep any safe `src`, which never drops an image the site serves from
   * elsewhere.
   */
  mediaBase?: string;
}

/** At most this many sanitized fields stay in the memo. */
const MEMO_ENTRIES = 256;
/** At most this many characters, inputs and outputs together, stay in the memo,
 *  so a few long bodies can't hold an isolate's memory. */
const MEMO_CHARS = 2_000_000;
/** A field longer than this is sanitized every time rather than memoized, so
 *  one long body can't flush every other entry. */
const MEMO_ENTRY_CHARS = MEMO_CHARS / 8;

// A `Map` iterates in insertion order, so the first key is the least recently
// used one: a hit moves its entry to the end, and eviction takes from the front.
const memo = new Map<string, string>();
let memoChars = 0;

function remember(key: string, value: string): void {
  const size = key.length + value.length;
  if (size > MEMO_ENTRY_CHARS) return;
  memo.set(key, value);
  memoChars += size;
  while (memo.size > MEMO_ENTRIES || memoChars > MEMO_CHARS) {
    const oldest = memo.keys().next();
    if (oldest.done) break;
    memoChars -= oldest.value.length + (memo.get(oldest.value) ?? "").length;
    memo.delete(oldest.value);
  }
}

/**
 * Stored rich text, safe to render with `set:html`: the page's `body` or a
 * section's rich-text field, run through louise-toolkit's `sanitizeRichHtml`.
 *
 * Use it wherever a component renders stored rich text, including a site's own
 * section components:
 *
 * ```astro
 * <Fragment set:html={sanitizeAstroidRichHtml(page.body, { mediaBase: env.MEDIA_URL })} />
 * ```
 *
 * Content the write hook already sanitized comes back byte for byte, because
 * sanitizing the sanitizer's output changes nothing. A value that isn't a string
 * renders as an empty string. Results are memoized per isolate, so rendering the
 * same content again costs a lookup rather than a parse.
 */
export function sanitizeAstroidRichHtml(
  html: unknown,
  options: AstroidRichHtmlOptions = {},
): string {
  if (typeof html !== "string" || html === "") return "";
  // Trimmed the way `setAstroidMediaBase` trims `MEDIA_URL`, so a render checks
  // against the same base as the write did.
  const mediaBase = options.mediaBase?.replace(/\/+$/, "") || undefined;
  // The base's length prefixes the key, so no base and input pair can produce
  // another pair's key.
  const key = `${mediaBase?.length ?? -1}:${mediaBase ?? ""}${html}`;
  const hit = memo.get(key);
  if (hit !== undefined) {
    memo.delete(key);
    memo.set(key, hit);
    return hit;
  }
  const clean = sanitizeRichHtml(html, mediaBase ? { mediaBase } : {});
  remember(key, clean);
  return clean;
}
