// louise-toolkit 0.35's three opt-ins, wired for every Astroid site: page
// redirects (#84), the Pages panel's draft carry (#83), and the decorative alt
// state (#85).
import { describe, expect, it } from "vitest";
import type { AstroidConfig } from "../src/config.js";
import {
  ASTROID_MEDIA_ALT_MIGRATION,
  ASTROID_PAGE_REDIRECTS_MIGRATION,
  generateAstroidScaffoldFiles,
} from "../src/project/scaffold.js";
import { generateAstroidSchema } from "../src/schema/generate.js";
import { generateAstroidMiddleware, generateAstroidWorker } from "../src/worker/generate.js";

const base: AstroidConfig = {
  key: "acme",
  archetype: "marketing",
  theme: { name: "Acme", colors: { brand: "#1f6e6d" } },
};
const worker = generateAstroidWorker(base);
const line = (factory: string) => worker.split("\n").find((l) => l.includes(`${factory}({`)) ?? "";

describe("page redirects (#84)", () => {
  it("exports pageRedirects from the generated schema, so drizzle-kit sees it", () => {
    const schema = generateAstroidSchema(base);
    expect(schema).toMatch(/import \{[^}]*\bpageRedirects\b[^}]*\} from "louise-toolkit\/db";/);
    expect(schema).toMatch(/export \{[^}]*\bpageRedirects\b[^}]*\};/);
  });

  it("passes the table to both routes that change a slug", () => {
    expect(line("pagesRoute")).toContain("redirects: pageRedirects");
    expect(line("versionsRoute")).toContain("redirects: pageRedirects");
    expect(worker).toMatch(/import \{[^}]*\bpageRedirects\b[^}]*\} from "\.\/schema\.js";/);
  });

  it("serves them from the middleware, after a 404", () => {
    const middleware = generateAstroidMiddleware(base);
    expect(middleware).toContain(
      'import { db, pageRedirects, resolvePageRedirect } from "louise-toolkit/db";',
    );
    expect(middleware).toContain(
      "redirectFor: (path) => resolvePageRedirect(db(env.DB), pageRedirects, path),",
    );
  });

  it("scaffolds the table's migration, safe on a site that already has it", () => {
    const file = generateAstroidScaffoldFiles(base).find(
      (f) => f.path === "migrations/0004_page_redirects.sql",
    );
    expect(file?.contents).toBe(ASTROID_PAGE_REDIRECTS_MIGRATION);
    expect(ASTROID_PAGE_REDIRECTS_MIGRATION).toContain(
      "CREATE TABLE IF NOT EXISTS `page_redirects`",
    );
    for (const column of [
      "`from_path` text PRIMARY KEY NOT NULL",
      "`to_path` text NOT NULL",
      "`code` integer DEFAULT 301 NOT NULL",
      "`created_at` integer",
    ]) {
      expect(ASTROID_PAGE_REDIRECTS_MIGRATION).toContain(column);
    }
  });
});

describe("Pages panel draft carry (#83)", () => {
  it("gives pagesRoute the same config and buffer versionsRoute uses", () => {
    expect(line("pagesRoute")).toContain(
      "drafts: { config: pagesCollection, bufferKv: (env) => env.DRAFTS }",
    );
    expect(line("versionsRoute")).toContain("config: pagesCollection");
    expect(line("versionsRoute")).toContain("bufferKv: (env) => env.DRAFTS");
    // `drafts` needs versionsTable.
    expect(line("pagesRoute")).toContain("versionsTable: pagesVersions");
  });
});

describe("decorative alt text (#85)", () => {
  it("counts only an unwritten alt as missing, with the toolkit's condition", () => {
    expect(worker).toContain("SELECT COUNT(*) AS n FROM media WHERE ${MEDIA_ALT_MISSING_SQL}");
    expect(worker).not.toContain("alt = ''");
    const editorBlock = worker.slice(0, worker.indexOf('} from "louise-toolkit/editor";'));
    // Imported, not copied, so the count follows the toolkit's definition.
    expect(editorBlock).toContain("  MEDIA_ALT_MISSING_SQL,");
  });

  it("ships the toolkit's one-time migration, word for word", () => {
    // louise-toolkit's `MEDIA_ALT_UNDECIDED_SQL("media")`. Pinned here rather
    // than imported, because `louise-toolkit/editor` loads drizzle-orm, a peer
    // this repo doesn't install; a site does.
    const file = generateAstroidScaffoldFiles(base).find(
      (f) => f.path === "migrations/0005_media_alt_undecided.sql",
    );
    expect(file?.contents).toBe(ASTROID_MEDIA_ALT_MIGRATION);
    const statements = ASTROID_MEDIA_ALT_MIGRATION.split("\n").filter(
      (l) => l && !l.startsWith("--"),
    );
    expect(statements).toEqual([`UPDATE "media" SET "alt" = NULL WHERE "alt" = '';`]);
  });

  it("numbers the redirects migration before the alt one, both after the catalog's 0003", () => {
    const migrations = generateAstroidScaffoldFiles({ ...base, commerce: { provider: "square" } })
      .map((f) => f.path)
      .filter((p) => p.startsWith("migrations/"))
      .sort();
    expect(migrations).toEqual([
      "migrations/0003_catalog.sql",
      "migrations/0004_page_redirects.sql",
      "migrations/0005_media_alt_undecided.sql",
    ]);
  });
});
