---
title: Modules and defaults
description: What ships on by default, what is opt-in, and what stays dormant until you provision it.
sidebar:
  order: 4
---

## Modules

Opt-in capabilities, each pulling real infrastructure:

- **`commerce`**—a catalog mirror in D1 with a pulled/owned split, a webhook
  receiver, a queue consumer, and a cron safety net. Providers fill **roles**
  (`storefront` / `invoicing`) rather than being "the" provider, because
  `commerce/stripe` has no catalog API and `commerce/fourthwall` has no invoicing.
  A **Square** storefront also gets the server-authoritative payment seam:
  `src/pages/api/checkout.ts` re-prices every line from the D1 mirror (the
  client's price is a staleness check, never an input to the charge), derives an
  idempotency key from the cart _and_ a cart id, and charges only once commerce
  is really provisioned—otherwise it simulates rather than calling Square with
  a placeholder credential. `<SquareCard>` mounts the Web Payments card field,
  which is an iframe from Square's CDN, so the raw card number never reaches the
  Worker. **The cart itself is yours**—where it lives and what it holds is a
  project decision, and a half-opinionated cart is worse than none.
- **`portal`**—a second, fully isolated Better Auth instance for
  customers/members: its own mount, cookie prefix, and `portal_*` tables, so a
  portal account can't sign into the studio.
- **`map`**—a self-hosted PMTiles basemap served from R2, brand-recoloured. No
  API key, no external tile host.
- **`pwa`**—a scoped service worker that never caches `/api/*` or the editor,
  plus a derived manifest.
- **`realtime`**—live multi-editor editing on a page: a per-page Durable Object
  holding presence, field sync, and a rich-text soft-lock. See below.

## What's on by default

Three things are wired into every scaffold rather than hidden behind a flag,
because each has a client half that already ships in the editor drawer—leaving
them unmounted meant rendering UI for a subsystem that could never have data.

- **The Home dashboard** (`overviewRoute`)—draft counts, unpublished changes,
  last edit. It's the drawer's initial panel, so it's the first screen an owner
  sees.
- **AI assists** (`aiRoute`, `seoFixRoute`, alt-text on upload)—rewrite a
  selection, suggest SEO, describe an image. All editor-gated, and all degrade to
  a hidden button when the `AI` binding is absent, so they cost nothing unused.
- **The typed Actions surface** (`src/actions/index.ts`)—`save`, `saveDraft`,
  and `settings` as Astro Actions beside the raw routes. Not a second
  implementation: each shares its route's store path, so a field is validated
  once and written in one place however it was called. Add your own beside them.
- **Real-visitor Core Web Vitals**—a beacon in `public/vitals.js` posts LCP,
  CLS, and INP to an Analytics Engine dataset, and the daily health scan reads
  the p75 back. Collection is free and needs nothing; the read-back needs
  `CF_ACCOUNT_ID` + `CF_API_TOKEN` (the SQL API is account-scoped and has no
  binding), and until those are real the badge reads "not measured yet".
- **Site health** (`healthRoute` + a daily cron)—broken links, images missing
  alt text, published pages with SEO gaps. The summary is stored in the existing
  `RL` namespace under its own key, so there's no extra binding to provision.
  Until the first scan runs the panel says "not checked yet". The inbox card
  counts unhandled inquiries—the whole table, because the Inquiries tab
  reviews and _clears_ submissions, so a surviving row is one still waiting.

### Renamed pages keep their old URL

When an editor changes a page's slug, the Pages route records `/old → /new` in
the `page_redirects` table, and the middleware answers a request for the old
path with a 301 to the new one. It only runs after the page answered 404, so a
page later created on the old path wins, and creating one clears the redirect.
The query string carries over. `migrations/0004_page_redirects.sql` creates the
table.

A rename made in the Pages panel while the page has a pending draft also goes
into that draft, so the next Publish keeps it instead of putting the old title
or slug back.

### Where scaffolded migrations go

`astroid generate` writes a migration into the `migrations_dir` of the `DB`
binding in `wrangler.jsonc`, the directory Wrangler applies, and `migrations`
when the binding sets none. The paths on this page are the defaults. A site
that numbers its own migrations past the default gets the next free number
instead, and a migration the site already has under any number, such as a
hand-copied `0009_page_redirects.sql`, isn't written again.

### Decorative images

An image's alt text has three states: `NULL` is not written yet, `""` is
decorative (the owner marked it for screen readers to skip), and anything else
is its description. The Health card's "missing a description" count includes
only `NULL`, so marking an image decorative in the Media panel takes it off the
list. `migrations/0005_media_alt_undecided.sql` turns every `""` written before
decorative images existed into `NULL`, because it used to mean both "not
written" and "cleared".

### AI Gateway (off by default)

The AI assists call Workers AI directly, so no successful call is logged
anywhere: there's no latency or error rate to read, and nothing is cached. To
route them through [AI Gateway](https://developers.cloudflare.com/ai-gateway/),
create a gateway and set its id as `AI_GATEWAY_ID` in the `vars` of
`wrangler.jsonc`. The generated worker passes it to `aiRoute` and `seoFixRoute`
through `astroidAiGateway`, and an empty or missing value keeps the direct path.
Alt text on upload has no gateway option yet, so it stays direct.

The gateway's log holds the text editors send to the assists, so say so on the
site's privacy page before you set it. A `previews` block needs the variable
too, since a Preview inherits no vars: set it to `""` there to keep staging
text out of the log.

### The status route

Every generated worker mounts `statusRoute` at `/api/louise/status`, for an
outside probe such as an uptime monitor to read. It's public, so the editor API
gate lets an anonymous request through. It answers `GET` and `HEAD` with 200
when every check passes and 503 when any fails, throws, or takes over two
seconds, always with `Cache-Control: no-store`. The body reports each check as
a boolean, never as error text:

```json
{ "ok": true, "checks": { "d1": { "ok": true }, "content": { "ok": true } } }
```

Astroid supplies two checks:

- **`d1`**: the `DB` binding answers `SELECT 1`.
- **`content`**: the home page's `pages` row exists, so the public site
  serves real content rather than the seed-me prompt. It fails on an unseeded
  database, and on one whose migrations never ran. Seed the home page with
  `seed/home.seed.sql` and the route answers 200.

To add your own, such as a catalog snapshot's age or the last health scan's,
set `status: { checks: true }` in `astroid.config.ts` and run `astroid
generate`. That scaffolds `src/status-checks.ts` once. Export your checks from
it as `statusChecks`, and the worker adds them after Astroid's. A check's name
is in the public response, so don't put anything in one you wouldn't publish.

### Edge caching (off by default)

The generated worker wraps Astro's SSR fallback in `withEdgeCache`, Louise's
**cookie-aware** Worker Cache API layer. It ships wrapped but inert: the var
`ASTROID_EDGE_CACHE` is `"false"`, so every render emits `no-store` and the layer
stores nothing.

Why cookie-aware matters: Cloudflare's _automatic_ edge cache is keyed by URL and
runs **before** your Worker, so it cannot see the edit cookie—it will serve a
cached public page to a signed-in editor, drafts and all. `withEdgeCache` runs
inside the Worker, inspects the request first, and strips the CDN directive from
every response so the automatic cache never engages. This feature was reverted
twice before that distinction was understood.

**Do not enable it straight on production.** `caches.default` is not cleared by
Cloudflare Dev Mode or "Purge Everything," so a bad flip is hard to walk back.
Turn it on for a preview deploy and walk the activation runbook in
`docs/adr/0004-edge-caching.md` first: verify an anonymous second request is
served from cache, an editor always renders fresh, and a publish shows up within
the 60 s TTL.

That TTL is short on purpose—`caches.default` is per-colo with no global purge,
so `maxAge` is the real worldwide freshness floor after a publish.

### Crons

`wrangler.jsonc` gets a `triggers.crons` list, and the generated worker's one
`scheduled` handler dispatches on `controller.cron`—Cloudflare fires a single
handler for every trigger and that string is the only way to tell them apart.

| Cron         | What runs                                                                        |
| ------------ | -------------------------------------------------------------------------------- |
| `17 4 * * *` | The daily site-health scan. Always.                                              |
| `0 * * * *`  | The catalog re-sync safety net. Commerce only; `queues.cron: false` disables it. |

### Realtime editing

`modules: ["realtime"]` turns editing into a live session. A per-page Durable
Object holds presence and authoritative field state, broadcasts changes to the
other editors on that page, and coalesces writes to D1 on an alarm.

Two properties are worth knowing:

- **It augments, it does not replace.** With the module off, the socket unopened,
  or the connection dropped, the client falls back to the existing debounced
  auto-save. Realtime is an accelerator, never a dependency.
- **There is one write path.** The session's flush goes through `applySaveDraft`—the
  same merge-over-pending-draft the fetch auto-save uses—so drafts,
  version history, publish semantics, and read-your-writes are all unchanged. The
  DO is a new front end to that path, not a parallel store.

The rich-text body takes a **soft-lock** (one editor at a time) rather than being
last-writer-wins clobbered, and locked values are never fanned out to peers—so
raw rich text doesn't cross sockets.

Astroid scaffolds `src/edit-session.ts` (the DO subclass—it must import
`cloudflare:workers`, so it can't live in the toolkit), the `durable_objects`
binding, and the migration block. That last one is the part nobody gets right
from memory: a DO class needs a migration tag, it must be `new_sqlite_classes`
rather than `new_classes`, and the storage backend **cannot be changed after the
class is first deployed**.

## Dormant until provisioned

Astroid's modules are opt-in at the **config** level but not at the **account**
level: switching commerce on must not require a Square account before `pnpm dev`
will boot.

So every module follows one rule—a module whose secrets are unprovisioned is
**dormant**. It renders, it serves, it says out loud that it is simulated, and it
never calls upstream with a dummy credential. `create-astroid` seeds every secret
with a loud `DUMMY_REPLACE_ME` sentinel, so a fresh clone has a complete, valid
binding set and zero real credentials.

`astroid doctor` reports which modules are dormant and exactly which secrets are
still missing.

## Next steps

- [Astroid API reference](/reference/config/)—the exported surface.
- [Sections](https://docs.louisetoolkit.org/guide/sections/)—the underlying section/block model Astroid's
  catalog is built on.
- [Inline editing](https://docs.louisetoolkit.org/guide/inline-editing/)—how the edit markers work.
