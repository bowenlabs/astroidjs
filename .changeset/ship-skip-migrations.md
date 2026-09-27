---
"astroidjs": minor
---

An app whose D1 database another app migrates can now skip migrations. Set `deploy: { platform: "cloudflare", migrations: false }` in `defineAstroid`, and `astroid ship production` and `astroid ship preview` print one line saying migrations are skipped, then deploy as before. `astroid deploy` skips its migrations step the same way.

Two Workers in one repository that bind the same database, such as a marketing site and an order-ahead app, used to both migrate. One release tag deploys both in no guaranteed order, and nothing serializes two `wrangler d1 migrations apply` runs against one ledger, so both could apply the same migration, and a non-idempotent statement such as `ALTER TABLE … ADD COLUMN` failed the second deploy.

`astroid doctor` no longer warns about a missing migrations directory for an app with `migrations: false`. Instead, it fails when that app's `wrangler.jsonc` still declares a `migrations_dir`, since that contradiction means someone expects the app to migrate.

- `astroidjs` exports `astroidShipPlan`, `astroidRunsMigrations`, `migrationsOwnershipError`, `ASTROID_SKIP_MIGRATIONS_NOTE`, `ASTROID_PREVIEW_MIGRATIONS_CONFIG`, and the `ShipStep` type. `astroid ship` runs the plan `astroidShipPlan` returns, and it now loads `astroid.config.ts` to read the option.

**What to do:** nothing, unless your site runs two apps on one database. The default is unchanged, and every existing project still migrates on both targets. If yours does, set `migrations: false` on the app that doesn't own the schema and remove `migrations_dir` from its `wrangler.jsonc`. The Releases guide explains the release order that shared schema requires.
