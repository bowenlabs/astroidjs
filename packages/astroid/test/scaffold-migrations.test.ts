// Scaffolded migrations land where Wrangler applies them: the `DB` binding's
// `migrations_dir`, numbered past the site's own migrations, and never twice.
import { describe, expect, it } from "vitest";
import type { AstroidConfig } from "../src/config.js";
import { astroidMigrationsDir, resolveAstroidScaffoldPaths } from "../src/project/migrations.js";
import { generateAstroidScaffoldFiles, type ScaffoldFile } from "../src/project/scaffold.js";

const base: AstroidConfig = {
  key: "acme",
  archetype: "marketing",
  theme: { name: "Acme", colors: { brand: "#1f6e6d" } },
};

const migrationPaths = (files: ScaffoldFile[]) =>
  files.filter((f) => f.migration).map((f) => f.path);

describe("astroidMigrationsDir", () => {
  it("reads the DB binding's migrations_dir", () => {
    const wrangler = `{
      // comments are fine
      "d1_databases": [
        { "binding": "OTHER", "migrations_dir": "elsewhere" },
        { "binding": "DB", "database_name": "acme", "migrations_dir": "drizzle/" },
      ],
    }`;
    expect(astroidMigrationsDir(wrangler)).toBe("drizzle");
  });
  it("defaults to migrations with no DB binding, no migrations_dir, or no file", () => {
    expect(astroidMigrationsDir(`{ "d1_databases": [{ "binding": "DB" }] }`)).toBe("migrations");
    expect(astroidMigrationsDir(`{}`)).toBe("migrations");
    expect(astroidMigrationsDir(null)).toBe("migrations");
  });
});

describe("resolveAstroidScaffoldPaths", () => {
  const scaffold = generateAstroidScaffoldFiles({ ...base, commerce: { provider: "square" } });

  it("keeps the default numbers for a standard project", () => {
    const resolved = resolveAstroidScaffoldPaths(scaffold, {
      migrationsDir: "migrations",
      existing: ["0000_content.sql", "0001_auth.sql", "0002_auth_studio.sql"],
    });
    expect(migrationPaths(resolved)).toEqual([
      "migrations/0003_catalog.sql",
      "migrations/0004_page_redirects.sql",
      "migrations/0005_media_alt_undecided.sql",
    ]);
  });

  it("writes into migrations_dir and numbers past the site's own migrations", () => {
    const existing = Array.from({ length: 9 }, (_, i) => `000${i}_site_${i}.sql`);
    const resolved = resolveAstroidScaffoldPaths(generateAstroidScaffoldFiles(base), {
      migrationsDir: "drizzle",
      existing: [...existing, "meta"],
    });
    expect(migrationPaths(resolved)).toEqual([
      "drizzle/0009_page_redirects.sql",
      "drizzle/0010_media_alt_undecided.sql",
    ]);
  });

  it("never numbers below the newest migration, even on a free default", () => {
    const resolved = resolveAstroidScaffoldPaths(generateAstroidScaffoldFiles(base), {
      migrationsDir: "migrations",
      existing: ["0000_content.sql", "0007_site.sql"],
    });
    expect(migrationPaths(resolved)).toEqual([
      "migrations/0008_page_redirects.sql",
      "migrations/0009_media_alt_undecided.sql",
    ]);
  });

  it("finds a migration the site already has under another number", () => {
    const resolved = resolveAstroidScaffoldPaths(generateAstroidScaffoldFiles(base), {
      migrationsDir: "drizzle",
      existing: ["0008_site.sql", "0009_page_redirects.sql"],
    });
    expect(migrationPaths(resolved)).toEqual([
      "drizzle/0009_page_redirects.sql",
      "drizzle/0010_media_alt_undecided.sql",
    ]);
  });

  it("leaves files that aren't migrations alone", () => {
    const resolved = resolveAstroidScaffoldPaths(scaffold, {
      migrationsDir: "drizzle",
      existing: [],
    });
    expect(resolved.filter((f) => !f.migration)).toEqual(scaffold.filter((f) => !f.migration));
  });
});
