import { describe, expect, it } from "vitest";
import type { AstroidConfig } from "../src/config.js";
import {
  ASTROID_PREVIEW_MIGRATIONS_CONFIG,
  ASTROID_SKIP_MIGRATIONS_NOTE,
  astroidRunsMigrations,
  astroidShipPlan,
  migrationsOwnershipError,
  type ShipStep,
} from "../src/project/ship.js";

const base: AstroidConfig = {
  key: "acme",
  archetype: "marketing",
  theme: { name: "Acme", colors: { brand: "#1f6e6d" } },
};
// An app whose database another app in the same repository migrates.
const tenant: AstroidConfig = { ...base, deploy: { platform: "cloudflare", migrations: false } };

const wrangler = `{
  // Production.
  "d1_databases": [
    { "binding": "DB", "database_name": "acme", "database_id": "prod-db", "migrations_dir": "drizzle" },
  ],
  "previews": {
    "d1_databases": [{ "binding": "DB", "database_name": "acme-staging", "database_id": "staging-db" }],
  },
}`;
const ctx = { wrangler, root: "/srv/acme", branch: "feature/12-Login" };

const runs = (steps: ShipStep[]) => steps.flatMap((s) => ("run" in s ? [s.run] : []));
const migrates = (steps: ShipStep[]) => runs(steps).some((args) => args[0] === "d1");

describe("astroidRunsMigrations", () => {
  it("defaults to true, so every existing project still migrates", () => {
    expect(astroidRunsMigrations(base)).toBe(true);
    expect(astroidRunsMigrations({ ...base, deploy: { platform: "cloudflare" } })).toBe(true);
    expect(
      astroidRunsMigrations({ ...base, deploy: { platform: "cloudflare", migrations: true } }),
    ).toBe(true);
  });

  it("is false only when the config says so", () => {
    expect(astroidRunsMigrations(tenant)).toBe(false);
  });
});

describe("astroidShipPlan production", () => {
  it("migrates, then deploys, by default", () => {
    expect(runs(astroidShipPlan("production", base, ctx))).toEqual([
      ["d1", "migrations", "apply", "DB", "--remote"],
      ["deploy"],
    ]);
  });

  it("with migrations: false, says so and deploys without migrating", () => {
    const steps = astroidShipPlan("production", tenant, ctx);
    expect(migrates(steps)).toBe(false);
    expect(steps).toEqual([{ note: ASTROID_SKIP_MIGRATIONS_NOTE }, { run: ["deploy"] }]);
  });
});

describe("astroidShipPlan preview", () => {
  it("migrates the staging database, then previews, by default", () => {
    const steps = astroidShipPlan("preview", base, ctx);
    const write = steps.find((s) => "write" in s);
    expect(write && "write" in write && write.write.path).toBe(ASTROID_PREVIEW_MIGRATIONS_CONFIG);
    const written = JSON.parse(write && "write" in write ? write.write.contents : "{}");
    expect(written.d1_databases).toEqual([
      {
        binding: "PREVIEW_DB",
        database_name: "acme-staging",
        database_id: "staging-db",
        // The production entry's directory, made absolute.
        migrations_dir: "/srv/acme/drizzle",
      },
    ]);
    expect(runs(steps)).toEqual([
      [
        "d1",
        "migrations",
        "apply",
        "PREVIEW_DB",
        "--remote",
        "--config",
        ASTROID_PREVIEW_MIGRATIONS_CONFIG,
      ],
      ["preview", "--name", "feature-12-login"],
    ]);
    // The config is written before the command that reads it.
    expect(steps.findIndex((s) => "write" in s)).toBeLessThan(steps.findIndex((s) => "run" in s));
  });

  it("with migrations: false, writes nothing and previews without migrating", () => {
    const steps = astroidShipPlan("preview", tenant, ctx);
    expect(steps.some((s) => "write" in s)).toBe(false);
    expect(steps).toEqual([
      { note: ASTROID_SKIP_MIGRATIONS_NOTE },
      { run: ["preview", "--name", "feature-12-login"] },
    ]);
  });

  it("defaults the migrations directory to migrations/", () => {
    const steps = astroidShipPlan("preview", base, {
      ...ctx,
      wrangler: wrangler.replace(', "migrations_dir": "drizzle"', ""),
    });
    const write = steps.find((s) => "write" in s);
    const written = JSON.parse(write && "write" in write ? write.write.contents : "{}");
    expect(written.d1_databases[0].migrations_dir).toBe("/srv/acme/migrations");
  });

  it("notes a missing staging database and still previews", () => {
    const steps = astroidShipPlan("preview", base, {
      wrangler: '{ "d1_databases": [{ "binding": "DB", "database_id": "prod-db" }] }',
      root: "/srv/acme",
    });
    expect(runs(steps)).toEqual([["preview"]]);
    expect(steps[0]).toHaveProperty("note");
  });
});

describe("migrationsOwnershipError", () => {
  it("errors when migrations: false but wrangler.jsonc still names a migrations_dir", () => {
    expect(migrationsOwnershipError(tenant, wrangler)).toMatch(/migrations_dir/);
  });

  it("passes an app that migrates, or one that doesn't and names no directory", () => {
    expect(migrationsOwnershipError(base, wrangler)).toBeNull();
    expect(
      migrationsOwnershipError(tenant, wrangler.replace(', "migrations_dir": "drizzle"', "")),
    ).toBeNull();
  });
});
