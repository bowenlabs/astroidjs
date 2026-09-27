---
"astroidjs": minor
"create-astroid": minor
---

A project can be an app with no pages to edit, with `editor: false` in `defineAstroid`. Every project used to be a Louise-edited site, so an app with no pages to edit, such as an order app whose menu comes from Square, carried an editor, an auth seam, a draft buffer, and a media bucket it never used, or dropped Astroid and hand-wrote its middleware, CSP, and rate limiting.

- **Generated files:** with `editor: false`, the generated worker and middleware carry no editor routes, no `./auth.js` seam, and no edit mode. The worker keeps the gate, so everything under `/api/louise` except the public status route is refused, and route responses keep their security headers.
- **Schema:** `src/schema.ts` emits no `pages`, versions, or framework tables. An app reads a table another app owns by importing it from `louise-toolkit/db`.
- **Bindings:** `wrangler.jsonc` binds no draft buffer, media bucket, Images, Workers AI, or vitals dataset. It binds mail only when a portal sends password resets. There's no daily health scan, so an app with nothing scheduled has no `triggers` and no `scheduled` handler.
- **Scaffold-once files:** no content migrations, CWV beacon, Actions surface, or gallery page.
- **Rate rules:** the editor's sign-in rules are replaced by one covering every POST under `/api/v1` (`ASTROID_API_PREFIX`), the app's versioned JSON API.
- **Doctor:** `astroid doctor` checks only what the shape uses: no `DRAFTS`, `MEDIA`, or `send_email` unless a portal needs it, and no cron check when nothing is scheduled.
- **What stays:** the rate limiter, CSP, security headers, status route, and the `portal`, `pwa`, `commerce`, `map`, and `tenancy` modules.
- **Refused options:** `defineAstroid` refuses every option that configures the editor alongside `editor: false`: `sections`, `sectionCatalog`, `blockCatalog`, `media`, `pages`, `settings`, `inquiries: true`, `deploy.mediaBase`, and the `realtime` and `wholesaleInquiry` modules.
- **`deploy.migrations: false` fix:** the generated `wrangler.jsonc` now leaves out `migrations_dir` under this setting, which `astroid doctor` otherwise reports as a contradiction on a fresh scaffold.
- **`create-astroid --app`:** scaffolds the shape. It uses the same template without the editor's files, plus an app layout, a home screen, and the root of the `/api/v1` API.

**What to do:** nothing for an existing site. `editor` defaults to `true`, and every generated file is unchanged. To start an app, run `create-astroid --app`.
