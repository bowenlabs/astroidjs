// The Hide from search engines switch, read through louise-toolkit's
// `site_settings` table against a real SQLite database: the scaffold's own
// migration, behind a D1-shaped binding. A hand-written stub would answer
// whatever the test expects, including after the column it reads is renamed,
// which is exactly the failure this reader has to report.

import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { onDegraded } from "louise-toolkit/errors";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import type { AstroidConfig } from "../src/config.js";
import {
  ASTROID_INDEXING_DEGRADED,
  astroidIndexingDisabled,
  type AstroidIndexingEnv,
  astroidRobotsRoute,
} from "../src/seo/runtime.js";

const config: AstroidConfig = {
  key: "acme",
  archetype: "marketing",
  theme: { name: "Example Organization", colors: { brand: "#1f6e6d" } },
};

const migration = readFileSync(
  new URL("../../create-astroid/template/migrations/0000_content.sql", import.meta.url),
  "utf8",
);

/** The D1 surface Drizzle's driver calls, over node:sqlite. */
function d1(sqlite: DatabaseSync): NonNullable<AstroidIndexingEnv["DB"]> {
  const prepare = (sql: string) => {
    const bound = (params: unknown[]) => {
      const run = (arrays: boolean) => {
        const statement = sqlite.prepare(sql);
        statement.setReturnArrays(arrays);
        return statement.all(...(params as never[]));
      };
      return {
        all: async () => ({ results: run(false), success: true, meta: {} }),
        raw: async () => run(true),
        first: async () => run(false)[0] ?? null,
        run: async () => ({ results: [], success: true, meta: {} }),
      };
    };
    return { ...bound([]), bind: (...params: unknown[]) => bound(params) };
  };
  return { prepare } as unknown as NonNullable<AstroidIndexingEnv["DB"]>;
}

/** A database with the scaffold's tables and, optionally, a settings row. */
function database(row?: { disableIndexing: boolean }): DatabaseSync {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(migration.replaceAll("--> statement-breakpoint", ""));
  if (row) {
    sqlite
      .prepare("INSERT INTO site_settings (id, disable_indexing) VALUES (1, ?)")
      .run(row.disableIndexing ? 1 : 0);
  }
  return sqlite;
}

const degrades: string[] = [];
const stop = onDegraded((event) => degrades.push(event.name));
afterEach(() => {
  degrades.length = 0;
});
afterAll(stop);

const robots = async (env: AstroidIndexingEnv, cfg = config) => {
  const res = await astroidRobotsRoute(
    cfg,
    env,
  )({ request: new Request("https://acme.example.com/robots.txt") });
  return { status: res.status, cache: res.headers.get("cache-control"), body: await res.text() };
};

describe("astroidIndexingDisabled", () => {
  it("reads the switch from the settings row", async () => {
    expect(
      await astroidIndexingDisabled(config, { DB: d1(database({ disableIndexing: true })) }),
    ).toBe(true);
    expect(
      await astroidIndexingDisabled(config, { DB: d1(database({ disableIndexing: false })) }),
    ).toBe(false);
    expect(degrades).toEqual([]);
  });

  it("is off, quietly, with no binding or no settings row", async () => {
    expect(await astroidIndexingDisabled(config, {})).toBe(false);
    expect(await astroidIndexingDisabled(config, { DB: d1(database()) })).toBe(false);
    expect(degrades).toEqual([]);
  });

  it("doesn't query at all for an app without an editor", async () => {
    const DB = new Proxy({} as NonNullable<AstroidIndexingEnv["DB"]>, {
      get() {
        throw new Error("read D1 for a project with no settings table");
      },
    });
    expect(await astroidIndexingDisabled({ ...config, editor: false }, { DB })).toBe(false);
  });

  it("reports a failed read rather than reading it as off", async () => {
    const sqlite = database({ disableIndexing: true });
    sqlite.exec("ALTER TABLE site_settings RENAME COLUMN disable_indexing TO hide_from_search");
    expect(await astroidIndexingDisabled(config, { DB: d1(sqlite) })).toBe(false);
    expect(degrades).toEqual([ASTROID_INDEXING_DEGRADED]);
  });
});

describe("astroidRobotsRoute", () => {
  it("serves the config's rules for the serving origin while the switch is off", async () => {
    const res = await robots({ DB: d1(database({ disableIndexing: false })) });
    expect(res.status).toBe(200);
    expect(res.cache).toBe("public, max-age=3600");
    expect(res.body).toContain("Allow: /\n");
    expect(res.body).toContain("Disallow: /api/\n");
    expect(res.body).toContain("Sitemap: https://acme.example.com/sitemap.xml");
  });

  it("disallows the whole site while the switch is on", async () => {
    const res = await robots({ DB: d1(database({ disableIndexing: true })) });
    expect(res.body).toBe("User-agent: *\nDisallow: /\n");
  });

  it("stays crawlable before provisioning", async () => {
    expect((await robots({})).body).toContain("Allow: /\n");
  });

  it("answers 503, uncached, when the switch can't be read", async () => {
    const sqlite = database();
    sqlite.exec("DROP TABLE site_settings");
    const res = await robots({ DB: d1(sqlite) });
    expect(res.status).toBe(503);
    expect(res.cache).toBe("no-store");
    expect(degrades).toEqual([ASTROID_INDEXING_DEGRADED]);
  });

  it("takes a disallow list of your own", async () => {
    const res = await astroidRobotsRoute(
      config,
      {},
      { disallow: ["/drafts"] },
    )({
      request: new Request("https://acme.example.com/robots.txt"),
    });
    const body = await res.text();
    expect(body).toContain("Disallow: /drafts/\n");
    expect(body).not.toContain("/api");
  });
});
