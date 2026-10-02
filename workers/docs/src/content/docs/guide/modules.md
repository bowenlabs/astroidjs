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
- **`authRateLimit`**—a Durable Object for Better Auth's sign-in rate limiter
  to count in, instead of KV or each isolate's memory. See below.

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

### Every page at its slug

A page made in the Pages panel is served at its slug, so `about` is `/about`,
by `src/pages/[...slug].astro`. It renders a page the way the home page does,
through `src/lib/pages.ts`:

- A visitor sees the page only while it's live (published, not hidden).
  Anything else answers the site's 404 page, with `noindex`.
- An editor in edit mode sees any page, with its latest pending draft, and
  edits it in place and publishes it like the home page. The draft comes from
  `astroidPageDraft(config, env, pageId)` in `astroidjs/pages`, which checks
  the `DRAFTS` buffer before D1, the order every save writes. A page route of
  your own reads it the same way, or a reload before the buffer flushes shows
  the editor an older page.
- The head uses the page's own SEO title, description, share image, and
  `noindex`, and the edge cache follows the home page's rule.

A file route always wins over the catch-all, so `/contact` and `/login` stay
theirs, and the Pages route refuses those slugs with a 422, along with `work` on
a portfolio. Add your own file routes' slugs to `reservedSlugs` in
`src/pages-hooks.ts` (turn it on with `pages: { hooks: true }`).

A site that deleted one of those file routes, or never had it, and serves the
path as a page from its own catch-all instead, allows the slug with
`pages: { allowSlugs: ["contact"] }`. Only `contact`, `login`, and `work` can be
allowed. The platform serves the other reserved paths, such as `api` and
`sitemap.xml`, before any page, and `defineAstroid` refuses them.

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

### Incidents

Every generated worker captures its failures (louise-toolkit ADR 0022): a throw
from a route, the page handler, the queue consumer, or a cron, and every
`reportDegraded` call. Each becomes one incident per distinct failure, counted
into two places:

- **The `incidents` table in the site's own D1.** It's the record: the Health
  panel and Watchtower read it. `astroid generate` scaffolds its migration,
  `migrations/0006_incidents.sql` (renumbered past your own), with the
  `dead_letters` table beside it.
- **The `INCIDENT_EVENTS` Analytics Engine dataset**, for counts over time. A
  new project's `wrangler.jsonc` binds it; for an older one, add
  `{ "binding": "INCIDENT_EVENTS", "dataset": "<key>_incidents" }` to
  `analytics_engine_datasets`. Without it, the table still counts.

Each incident records the deployed version from the `CF_VERSION_METADATA`
binding, which a new project's `wrangler.jsonc` also has. For an older one, add
`"version_metadata": { "binding": "CF_VERSION_METADATA" }`.

With commerce's queue, the worker also consumes the queue's dead-letter queue:
each message the queue gave up on is kept in `dead_letters`, counted as an
incident, and acked, so a failed webhook event is never lost unseen. The worker
knows which queue that is from `wrangler.jsonc`: the `dead_letter_queue` of the
consumer for the queue the `COMMERCE_QUEUE` producer sends to. `astroid
generate` reads it there, so a site whose queues are named differently from its
`key` works unchanged; run `astroid generate` again after you rename one.

A new project's `wrangler.jsonc` names its queues `<key>-commerce` and
`<key>-commerce-dlq`, and declares the dead-letter queue's consumer. An older
one may need that consumer added to `queues.consumers`, with the dead-letter
queue's own name:
`{ "queue": "<your dead-letter queue>", "max_batch_size": 10, "max_retries": 0 }`.
`astroid doctor` reports a dead-letter queue with no consumer, and a
`src/worker.ts` that captures dead letters from a different queue than
`wrangler.jsonc` routes them to.

Two settings in `astroid.config.ts` add to it:

```ts
incidents: {
  // What alerts. Dotted names and path prefixes; no default list.
  critical: ["commerce.checkout", "/cart"],
  // A copy to Sentry, for a Monitored or Supported site.
  sentry: true,
},
```

`sentry: true` sends each incident to Sentry with its stack, through Sentry's
envelope endpoint with no SDK. It reads the DSN from the `SENTRY_DSN` secret,
and stays dormant while that's unset or a placeholder. What reaches Sentry is
the redacted message, the fingerprint, the path without its query string, and
the stack's frames, tagged `louise_fingerprint`, so Watchtower can join each
Sentry issue to its row.

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

### Auth rate limiting

louise-toolkit turns Better Auth's rate limiter on for every `getLouiseAuth`
instance whose `baseURL` isn't on `localhost` or `127.0.0.1`. It counts per
instance, client address, and path, and where it counts decides how well it
holds. Without help it counts in KV when the instance caches sessions there,
and otherwise in each isolate's memory. KV can undercount under a burst, and a
burst spread across isolates gets a budget in each. A Durable Object handles one
request at a time, so it's the one atomic counter on Workers.

`modules: ["authRateLimit"]` (`--auth-rate-limit` in `create-astroid`) wires
one:

- **`src/auth-rate-limiter.ts`**, the `AuthRateLimitDO` class, scaffolded once.
  It delegates to `createRateLimiter` from `louise-toolkit/security` and exists
  because only the site can import `cloudflare:workers`.
- **The re-export** from the generated `src/worker.ts`, so wrangler can resolve
  the binding's `class_name`.
- **The `AUTH_RATE_LIMIT` binding and its migration** in a new scaffold's
  `wrangler.jsonc`, tagged `auth-rate-limit-v1` so it never collides with the
  realtime module's `v1`.
- **`rateLimitDo: env.AUTH_RATE_LIMIT`** in a new scaffold's auth seams.

**Turning it on in an existing project.** `wrangler.jsonc` and the auth seams
are scaffold-once, so `astroid generate` writes the class and the re-export and
nothing else. `astroid doctor` then names what's left:

1. Add the binding to `durable_objects.bindings`:
   `{ "name": "AUTH_RATE_LIMIT", "class_name": "AuthRateLimitDO" }`.
2. Append the migration to the **end** of `migrations`:
   `{ "tag": "auth-rate-limit-v1", "new_sqlite_classes": ["AuthRateLimitDO"] }`.
   Wrangler applies only the entries after the last tag it has applied, so an
   entry inserted earlier never runs.
3. Pass `rateLimitDo: env.AUTH_RATE_LIMIT` to every `getLouiseAuth` call, in
   `src/auth.ts` and `src/portal-auth.ts`, and type the binding in
   `src/env.d.ts`.
4. If `wrangler.jsonc` has a `previews` block, copy the binding into its
   `durable_objects` too. A Preview inherits nothing, but the binding needs no
   staging resource: Cloudflare gives each Preview its own instances of the
   class. `astroid doctor` checks this too: the general previews check only
   asks whether `previews` has a `durable_objects` key, which a project with the
   realtime module already passes.

ADR 0024 records the convention every Durable Object module follows: one
`durable_objects` list, a migration tag named after the module, and entries
appended, never inserted.

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
