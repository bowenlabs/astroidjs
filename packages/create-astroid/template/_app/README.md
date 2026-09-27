# __BRAND_NAME__

An app on Cloudflare Workers with no pages to edit, scaffolded with
[Astroid](https://docs.astroidjs.org) (Astro + Louise Toolkit) in its
editor-free shape (`editor: false`).

It has no Louise editor: no sign-in for editors, no content tables, no media
library. Its settings, if it reads any, belong to a site that has an editor, and
that site stays the only place they're edited. What Astroid still generates
here is the rate limiter, the Content-Security-Policy, the security headers,
the public status route, and whatever modules the config switches on: a
customer portal, an installable app (PWA), or commerce.

The whole shape lives in one typed config, [`astroid.config.ts`](./astroid.config.ts).
`src/schema.ts`, `src/worker.ts`, and `src/middleware.ts` are **generated** from
it (they carry a "do not hand-edit" banner). Run `pnpm generate` after any
config change, or use `pnpm dev` and `pnpm build`, which regenerate first.

## Develop

```sh
pnpm install
cp .env.example .dev.vars   # local secrets for `astro dev`
pnpm dev                    # astroid dev: regenerate, then astro dev
```

## The API

The web app is the first client of a versioned JSON API under `/api/v1`
(`src/pages/api/v1/`). A native client later calls the same routes, so each
one answers JSON, reads its input from the body or the URL, and needs no
browser-only header. The middleware rate-limits every POST under `/api/v1`.

## Deploy

Astroid wrote `wrangler.jsonc` with placeholder binding ids:

```sh
pnpm astroid provision   # create the D1 database and the RL namespace, filling in their ids
pnpm run doctor          # validate config, bindings, and generated-file freshness
pnpm astroid ship production
```

### Sharing another app's database

To read tables another app owns, such as its `site_settings`, bind its D1
database by id in `wrangler.jsonc` and set `deploy: { migrations: false }` in
`astroid.config.ts`. One app owns a database's schema: this one then applies no
migrations, and an additive migration in the other app ships in a release
before this app's code reads it.

## Layout

| Path | What |
| --- | --- |
| `astroid.config.ts` | The one typed config. |
| `src/schema.ts` · `src/worker.ts` · `src/middleware.ts` | **Generated**—don't hand-edit. |
| `src/schema.site.ts` | This app's own Drizzle tables, if it has any. |
| `wrangler.jsonc` | Yours to edit—real binding ids, routes, secrets. |
| `src/pages/api/v1/` | The versioned JSON API. |
| `src/pages/` · `src/components/` · `src/layouts/` | Your Astro app. |
| `docs/` | ARCHITECTURE · RUNBOOK · DECISIONS—stubs to fill in as you go. |
