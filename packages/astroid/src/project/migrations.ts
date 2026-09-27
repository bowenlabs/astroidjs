// Copyright (c) 2026 BowenLabs. Astroid is MIT licensed.
//
// Where a scaffolded D1 migration lands in a site. The scaffold names each
// migration with a default path (`migrations/0004_page_redirects.sql`), but a
// site can point its `DB` binding at another directory with `migrations_dir`,
// and it may already number its own migrations past the default. Wrangler
// applies only the directory in `migrations_dir` and tracks each file by name,
// so a migration written anywhere else never runs, and one written onto a
// number the site already uses leaves two files claiming that number.

import { parseJsonc } from "./previews.js";
import type { ScaffoldFile } from "./scaffold.js";

/** Wrangler's own default when a D1 binding sets no `migrations_dir`. */
const DEFAULT_MIGRATIONS_DIR = "migrations";

/** `0004_page_redirects.sql` → number `"0004"`, name `page_redirects`. */
const MIGRATION_FILE = /^(\d+)_(.+)\.sql$/;

/**
 * The `DB` binding's `migrations_dir` from `wrangler.jsonc`, or Wrangler's
 * default `migrations` when the binding sets none or the file is missing.
 * Returned as written, without a trailing slash.
 */
export function astroidMigrationsDir(wrangler: string | null | undefined): string {
  if (!wrangler) return DEFAULT_MIGRATIONS_DIR;
  let parsed: { d1_databases?: { binding?: string; migrations_dir?: string }[] };
  try {
    parsed = parseJsonc(wrangler) as typeof parsed;
  } catch {
    return DEFAULT_MIGRATIONS_DIR;
  }
  const dir = (parsed.d1_databases ?? []).find((d) => d.binding === "DB")?.migrations_dir;
  return dir ? dir.replace(/\/+$/, "") : DEFAULT_MIGRATIONS_DIR;
}

/**
 * Resolve each scaffold file's path against the site's migrations directory.
 * Files that aren't migrations pass through unchanged. For a migration:
 *
 * - **Already there under any number:** the path is that file's, so a caller
 *   that skips existing files skips it. A site that copied `page_redirects`
 *   in by hand as `0009_page_redirects.sql` keeps that file and gets no second.
 * - **Default number free and past the newest migration:** the default, so a
 *   standard project numbers exactly as before.
 * - **Otherwise:** the next number after the newest migration, at the same
 *   width. A migration never takes a number the site already uses, and never
 *   sorts before one that already ran.
 *
 * `existing` is the file names in `migrationsDir`, in any order.
 */
export function resolveAstroidScaffoldPaths(
  files: ScaffoldFile[],
  { migrationsDir, existing }: { migrationsDir: string; existing: string[] },
): ScaffoldFile[] {
  const taken = new Map<number, string>();
  const byName = new Map<string, string>();
  for (const file of existing) {
    const match = MIGRATION_FILE.exec(file);
    if (!match) continue;
    taken.set(Number(match[1]), file);
    byName.set(match[2]!, file);
  }
  let newest = taken.size ? Math.max(...taken.keys()) : -1;

  return files.map((file) => {
    if (!file.migration) return file;
    const base = file.path.slice(file.path.lastIndexOf("/") + 1);
    const match = MIGRATION_FILE.exec(base);
    if (!match) return { ...file, path: `${migrationsDir}/${base}` };
    const [, digits, name] = match as unknown as [string, string, string];

    const present = byName.get(name);
    if (present) return { ...file, path: `${migrationsDir}/${present}` };

    const wanted = Number(digits);
    const number = !taken.has(wanted) && wanted > newest ? wanted : newest + 1;
    const filename = `${String(number).padStart(digits.length, "0")}_${name}.sql`;
    taken.set(number, filename);
    byName.set(name, filename);
    newest = Math.max(newest, number);
    return { ...file, path: `${migrationsDir}/${filename}` };
  });
}
