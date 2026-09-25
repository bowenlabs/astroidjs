---
"astroidjs": patch
---

Three fixes found while moving ghostfire.coffee onto Astroid.

- **`astroid doctor` reads `migrations_dir` from `wrangler.jsonc`.** It looked only for `migrations/`, so a site that keeps its D1 migrations in `drizzle/` got a warning on every run, and CI had to grep doctor's output instead of trusting its exit code. It now checks the directory wrangler applies migrations from, and falls back to `migrations/` when none is named.
- **`resolvePortalSession` keeps your user type.** It's generic now, so the result is whatever your `resolvePortalUser` returns (a customer ID, display initials) instead of `PortalUser`. Nothing to change: a resolver that returns `PortalUser` gets `PortalUser`. If your own identity type is an `interface`, make it a `type` alias; only a type alias is assignable to `PortalUser`'s index signature.
- **The scaffolded `src/actions/index.ts` no longer imports `ASTROID_SETTINGS_COLUMNS` when `settings.columns` is set.** The import went unused, which a lint run reports as an error in the site's own file. This only changes new scaffolds; delete the unused import from an existing file by hand.
