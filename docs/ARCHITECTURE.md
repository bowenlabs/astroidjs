# Architecture

How Astroid fits together, for someone about to change it. The Starlight docs at
[docs.astroidjs.org](https://docs.astroidjs.org) describe what each option does;
this page explains why the pieces are shaped the way they are. Decisions with a
history have an ADR in [`adr/`](adr/), and the traps are in
[`LESSONS.md`](LESSONS.md).

## Layers

```text
a site
  └─ create-astroid     scaffolds the site once
  └─ astroidjs          the opinions: one config, generators, sections, CLI
       └─ @louise-toolkit/astro   the unopinionated Astro adapter
       └─ louise-toolkit          the unopinionated primitives
```

Dependencies flow one way. `astroidjs` imports `louise-toolkit`; `louise-toolkit`
never imports, names, or documents `astroidjs`. When a change here would be easier
with a change in the toolkit, first ask whether the opinion belongs here instead.
It usually does.

`louise-toolkit` is a **peer** dependency, not a direct one. A site installs one
copy, and Astroid uses it. A direct dependency on a caret range would resolve a
second, nested toolkit whenever the site's range and Astroid's disagreed, and pre-1.0
a caret never crosses a minor, so that happened on every toolkit minor.

## Packages

- **`packages/astroid`** publishes `astroidjs`: the config, the generators, the
  `astroid` CLI, the section library, and the module implementations.
- **`packages/create-astroid`** publishes `create-astroid`: `index.mjs` and a
  `template/` tree. The template is payload, not source; see `CLAUDE.md`.
- **`workers/docs`** is the Starlight site at docs.astroidjs.org.

## Build

`astroidjs` is plain TypeScript, built by `tsgo -p tsconfig.build.json` into
`dist/`. The `.` and `./astro` exports point at `dist/`. There's no Vite+ here,
because `tsgo`, oxlint, oxfmt, and Vitest do the same jobs directly, without a
separately installed binary to keep in step.

Components ship as **source**. The `.astro` files, `Collection.tsx`, and the
small `.ts` helpers beside them are exported straight from `src/components/`,
because a `.astro` file can't be prebuilt. Two consequences:

- Everything under `src/components/` must be self-contained. An import from
  elsewhere in `src/` works in the repo and fails in a site, where only
  `src/components/` ships as source. `tsconfig.build.json` excludes the folder.
- Tailwind v4 doesn't scan `node_modules`, so the template's `site.css` carries
  an `@source` line that points at the installed components. Without it, the
  section library's utility classes never make it into the site's CSS.

## One config

A site describes itself once, in `astroid.config.ts`, with `defineAstroid`. One
config is one brand and one deploy: `key`, `archetype` (`marketing`,
`storefront`, `wholesale`, or `portfolio`), `theme`, `sections`, `modules`, and
the optional `portal`, `commerce`, `queues`, and `tenancy` blocks.

- **Modules** are opt-in capabilities: `map`, `pwa`, `realtime`, and
  `wholesaleInquiry`. A module kind that nothing wires doesn't belong in the
  union.
- **Tenancy** is wildcard host dispatch within one brand. Astroid owns the parts
  every site needs (the wildcard route and the rewrite in the one middleware file
  Astro allows). What a subdomain means, and what an unknown host does, is site
  policy in the scaffolded `src/tenancy.ts`.
- **A placeholder secret means dormant.** Every module secret is seeded with a
  sentinel, so the bindings exist and read as unconfigured. A module then takes
  its dormant path on purpose, instead of failing on an undefined binding, and a
  fresh scaffold runs with no accounts.

## Generated and scaffolded files

Astroid writes two kinds of file into a site, and the difference is the whole
contract.

- **Regenerated:** `src/schema.ts`, `src/worker.ts`, and `src/middleware.ts`
  (`generateAstroidProject`). `astroid generate` rewrites them from the config
  every time, so nobody edits them by hand. `astroid doctor` fails when they're
  stale.
- **Scaffolded once:** everything in `generateAstroidScaffoldFiles`, plus
  `wrangler.jsonc`. They're written when missing and never overwritten, so a
  site can own them. `wrangler.jsonc` is kept out of regeneration so the binding
  IDs filled in at provisioning survive.

The CLI and `create-astroid` share the one scaffold list. When they each had
their own, enabling a module after the first scaffold made `generate` import
files that nothing wrote, while `doctor` reported the project healthy.

The `astroid` CLI (`generate`, `doctor`, `dev`, `build`, `deploy`) loads the
site's config with Node's built-in type stripping. That works only because the
config's one import, bare `astroidjs`, resolves to built JavaScript. Node doesn't
rewrite a package's internal `.js` specifiers to `.ts` the way a bundler does.

## The route plan

`src/worker/routes.ts` is the one place that knows the order of the editor routes,
and every ordering rule is written there with its reason:

- `pagesRoute` claims every path under `/api/louise/pages/` as an item ID. Any
  route mounted below that prefix (versions, search, SEO backfill) must come
  before it, or it's never reached and the request fails as a bad ID.
- A factory that isn't an editor route is imported from its own subpath:
  `realtimeRoute` from `louise-toolkit/realtime` and `vitalsRoute` from
  `louise-toolkit/analytics`. The generator keeps a set of these, excluded from
  the editor import block. Add any new one to it.
- Cloudflare runs one `scheduled` handler for every cron trigger and tells them
  apart by `controller.cron`. `astroidCrons(config)` produces the list for both
  `wrangler.jsonc` and the handler's dispatch, and CI checks that they match.

## Auth

A site can run two Better Auth instances.

- **The studio** is for editors. It mounts at `/api/auth`, which the editor
  client expects, and its tables carry the `louise_` prefix. The admin
  `louise_user` rows are both the role source and the sign-in allowlist, so only
  an existing editor can request a magic link. The first editor comes from
  `seed:editors`, and the rest are added in the Users panel.
- **The portal** is for customers. It defaults to `/api/portal-auth`, the
  `portal` cookie prefix, and `portal_*` tables. A site with an existing second
  instance can override those, and `defineAstroid` rejects any value that
  collides with the studio. Two instances that share a cookie prefix sign each
  other out, intermittently, in production.

## Commerce

- **Providers fill roles,** not one "the provider" slot: `storefront`,
  `invoicing`, and `pos`. Each provider fills only the roles its API supports.
  For example, Stripe has invoicing and no catalog, and Fourthwall has a catalog
  and no invoicing.
- **The catalog mirror has two modes.** `mirror` pulls the catalog into D1 and
  owns it there; `overlay` keeps only the owner's columns in D1, keyed by the
  provider's ID. The sync never writes an owner-side column.
- **Astroid generates the payment seam, not a store.** The scaffold is a
  server-authoritative checkout route and a card input. It doesn't generate a
  cart, a checkout page, shipping, or tax. Where a cart lives is a project's
  decision. The route rejects a cross-origin request first, re-prices every line
  from the mirror, and derives its idempotency key from the cart and a per-cart
  ID the client sends, so two buyers with identical carts never share a charge.

## Verification

`CLAUDE.md` lists the checks. The one to understand is why the scaffold smoke
test exists: the generators emit strings, so nothing inside this package can
type-check what they produce. Only a scaffolded project, installed and compiled
the way a user's is, can. See [`LESSONS.md`](LESSONS.md).
