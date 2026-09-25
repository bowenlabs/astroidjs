// Copyright (c) 2026 BowenLabs. Astroid is MIT licensed.
//
// The home seed. It used to be a fixed template file that seeded the marketing
// sections for every archetype, so a portfolio's first page didn't match its
// own config. These tests hold the seed to the config: the same sections, in the
// same order, each one valid against the catalog the editor enforces on write.

import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { ASTROID_ARCHETYPE_SECTIONS } from "../src/config.js";
import type { AstroidConfig, Archetype, SectionKind } from "../src/config.js";
import { astroidSectionCatalog } from "../src/components/sections.js";
import { astroidHomeSeedSections, generateAstroidHomeSeed } from "../src/project/seed.js";
import { assertAstroidPageSections } from "../src/schema/collections.js";

const configFor = (
  archetype: Archetype,
  overrides: Partial<AstroidConfig> = {},
): AstroidConfig => ({
  key: "example",
  archetype,
  theme: { name: "Example Organization", colors: { brand: "#1f6e6d" } },
  ...overrides,
});

const ARCHETYPES = Object.keys(ASTROID_ARCHETYPE_SECTIONS) as Archetype[];

/** The template's content migration, so the seed runs against the real table. */
const CONTENT_MIGRATION = readFileSync(
  new URL("../../create-astroid/template/migrations/0000_content.sql", import.meta.url),
  "utf8",
);

function seededHome(sql: string): { title: string; body: string; sections: string } {
  const db = new DatabaseSync(":memory:");
  db.exec(CONTENT_MIGRATION);
  db.exec(sql);
  return db.prepare("SELECT title, body, sections FROM pages WHERE slug = 'home'").get() as {
    title: string;
    body: string;
    sections: string;
  };
}

describe("home seed", () => {
  it.each(ARCHETYPES)("seeds the %s archetype's own sections, in order", (archetype) => {
    const types = astroidHomeSeedSections(configFor(archetype)).map((s) => s._type);
    expect(types).toEqual(ASTROID_ARCHETYPE_SECTIONS[archetype]);
  });

  it.each(ARCHETYPES)("seeds %s sections that pass write validation", async (archetype) => {
    const config = configFor(archetype);
    await expect(
      assertAstroidPageSections(config, { sections: astroidHomeSeedSections(config) }, "create"),
    ).resolves.toBeUndefined();
  });

  it("has a valid sample for every section kind, so any `sections` override seeds", async () => {
    const every = Object.keys(astroidSectionCatalog) as SectionKind[];
    const config = configFor("marketing", { sections: every });
    const sections = astroidHomeSeedSections(config);
    expect(sections.map((s) => s._type)).toEqual(every);
    await expect(
      assertAstroidPageSections(config, { sections }, "create"),
    ).resolves.toBeUndefined();
  });

  it("follows the config's `sections` over the archetype default", () => {
    const config = configFor("portfolio", { sections: ["hero", "faq"] });
    expect(astroidHomeSeedSections(config).map((s) => s._type)).toEqual(["hero", "faq"]);
  });

  it.each(ARCHETYPES)("inserts a %s home page the template's pages table accepts", (archetype) => {
    const config = configFor(archetype);
    const row = seededHome(generateAstroidHomeSeed(config));
    expect(row.title).toBe("Example Organization");
    expect(JSON.parse(row.sections)).toEqual(astroidHomeSeedSections(config));
  });

  it("escapes a brand name with an apostrophe and HTML characters", () => {
    const config = configFor("marketing", {
      theme: { name: "Kai's <Bakery> & Café", colors: { brand: "#1f6e6d" } },
    });
    const row = seededHome(generateAstroidHomeSeed(config));
    expect(row.title).toBe("Kai's <Bakery> & Café");
    expect(row.body).toContain("Welcome to Kai's &lt;Bakery&gt; &amp; Café.");
    expect(JSON.parse(row.sections)[0].heading).toBe("Kai's <Bakery> & Café");
  });

  it("is idempotent, so a second run leaves an edited home page alone", () => {
    const sql = generateAstroidHomeSeed(configFor("storefront"));
    const db = new DatabaseSync(":memory:");
    db.exec(CONTENT_MIGRATION);
    db.exec(sql);
    db.exec("UPDATE pages SET title = 'Edited' WHERE slug = 'home'");
    db.exec(sql);
    const row = db.prepare("SELECT count(*) AS n, max(title) AS title FROM pages").get();
    expect(row).toEqual({ n: 1, title: "Edited" });
  });
});
