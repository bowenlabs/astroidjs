// Copyright (c) 2026 BowenLabs. Astroid is MIT licensed.
//
// What `astroid ship` runs, as a plan: Workers Builds calls
// `astroid ship production` on the `deploy/production` build and
// `astroid ship preview` on every other branch.
//
// By default both targets apply D1 migrations first. An app whose database
// another app migrates sets `deploy.migrations: false`, and then neither target
// touches the migrations ledger. Two apps on one database that both migrated
// would race: one release tag deploys both Workers in no guaranteed order,
// nothing serializes two `wrangler d1 migrations apply` runs, and a
// non-idempotent statement such as `ALTER TABLE … ADD COLUMN` then fails the
// second deploy.
//
// Pure: config and wrangler.jsonc text in, steps out, so it's tested directly
// and the CLI only runs them.

import type { AstroidConfig } from "../config.js";
import { parseJsonc } from "./previews.js";

/** Whether this app applies D1 migrations when it deploys. Default `true`. */
export function astroidRunsMigrations(config: AstroidConfig): boolean {
  return config.deploy?.migrations !== false;
}

/** One step of a ship, in order. */
export type ShipStep =
  /** Run `wrangler` with these arguments; a non-zero exit stops the ship. */
  | { run: string[] }
  /** Print a line. */
  | { note: string }
  /** Write a file, relative to the project root, before the next step. */
  | { write: { path: string; contents: string } };

/** Where `ship preview` writes the config that names the staging database. */
export const ASTROID_PREVIEW_MIGRATIONS_CONFIG = ".wrangler/astroid-preview-migrations.jsonc";

/** Printed in place of the migrations step when `deploy.migrations` is `false`. */
export const ASTROID_SKIP_MIGRATIONS_NOTE =
  "(deploy.migrations is false, so this app applies no migrations: another app owns this database's schema)";

interface D1Entry {
  binding?: string;
  database_name?: string;
  database_id?: string;
  migrations_dir?: string;
}

interface ShipContext {
  /** The project's `wrangler.jsonc` text. */
  wrangler: string;
  /** The project root's absolute path. */
  root: string;
  /** Workers Builds' `WORKERS_CI_BRANCH`, which names the Preview. */
  branch?: string;
}

/** The steps `astroid ship <target>` runs for a project. */
export function astroidShipPlan(
  target: "production" | "preview",
  config: AstroidConfig,
  { wrangler, root, branch }: ShipContext,
): ShipStep[] {
  const migrate = astroidRunsMigrations(config);
  if (target === "production") {
    return [
      migrate
        ? { run: ["d1", "migrations", "apply", "DB", "--remote"] }
        : { note: ASTROID_SKIP_MIGRATIONS_NOTE },
      { run: ["deploy"] },
    ];
  }

  const steps: ShipStep[] = [];
  if (!migrate) {
    steps.push({ note: ASTROID_SKIP_MIGRATIONS_NOTE });
  } else {
    // The staging database is declared only inside `previews`, and wrangler's
    // migrations command reads top-level `d1_databases`. So write a throwaway
    // config naming it, derived from wrangler.jsonc on every run, rather than a
    // second committed file that could drift from the binding.
    const parsed = parseJsonc(wrangler) as {
      d1_databases?: D1Entry[];
      previews?: { d1_databases?: D1Entry[] };
    };
    const prodDb = (parsed.d1_databases ?? []).find((d) => d.binding === "DB");
    const stagingDb = (parsed.previews?.d1_databases ?? []).find((d) => d.binding === "DB");
    if (stagingDb && prodDb) {
      steps.push(
        {
          write: {
            path: ASTROID_PREVIEW_MIGRATIONS_CONFIG,
            contents: JSON.stringify(
              {
                d1_databases: [
                  {
                    binding: "PREVIEW_DB",
                    database_name: stagingDb.database_name,
                    database_id: stagingDb.database_id,
                    // Absolute, so it doesn't depend on how Wrangler resolves a
                    // relative path in a config that lives in `.wrangler/`.
                    migrations_dir: fromRoot(root, prodDb.migrations_dir ?? "migrations"),
                  },
                ],
              },
              null,
              2,
            ),
          },
        },
        {
          run: [
            "d1",
            "migrations",
            "apply",
            "PREVIEW_DB",
            "--remote",
            "--config",
            ASTROID_PREVIEW_MIGRATIONS_CONFIG,
          ],
        },
      );
    } else {
      steps.push({ note: "(no staging D1 in `previews`, so no staging migrations to apply)" });
    }
  }

  // Workers Builds names the branch in WORKERS_CI_BRANCH; a Preview name is a
  // DNS label, so a branch like feature/12-login becomes feature-12-login.
  const name = branch
    ? branch
        .toLowerCase()
        .replace(/[^a-z0-9-]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 63)
    : undefined;
  steps.push({ run: ["preview", ...(name ? ["--name", name] : [])] });
  return steps;
}

/** A project-relative path made absolute. An absolute one is kept. */
function fromRoot(root: string, path: string): string {
  if (path.startsWith("/")) return path;
  const relative = path.replace(/^\.\//, "").replace(/\/+$/, "");
  return `${root.replace(/\/+$/, "")}/${relative}`;
}

/**
 * `astroid doctor`'s check on who migrates this app's database. Returns an
 * error when `deploy.migrations` is `false` but `wrangler.jsonc` still names a
 * `migrations_dir` for `DB`, since that contradiction means someone expects
 * this app to migrate. `null` when there's nothing to report.
 */
export function migrationsOwnershipError(config: AstroidConfig, wrangler: string): string | null {
  if (astroidRunsMigrations(config)) return null;
  if (!/"migrations_dir"\s*:/.test(wrangler)) return null;
  return (
    "astroid.config sets deploy.migrations to false, but wrangler.jsonc still declares a " +
    "`migrations_dir`. Remove `migrations_dir` if another app owns this database's schema, " +
    "or drop `migrations: false` if this app does."
  );
}
