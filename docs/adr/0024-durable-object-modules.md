# ADR 0024—Durable Object modules: one block, a named migration tag each, appended

- **Status:** Proposed (2026-10-02)
- **Deciders:** Baylee (solo maintainer)
- **Related:** louise-toolkit ADR 0002 (the realtime Durable Object), whose
  "Draft wrangler config" shows the single-binding form this generalizes;
  louise-toolkit ADR 0017 (Worker Previews); the `realtime` and `authRateLimit`
  modules
- **Scope:** `packages/astroid/src/project/generate.ts`, the generated
  `wrangler.jsonc`, and every module that adds a Durable Object class

## Context

Until the `authRateLimit` module, one module provisioned a Durable Object:
`realtime`, whose class `EditSessionDO` took the migration tag `v1`. The
generated `wrangler.jsonc` wrote one `durable_objects` block and one
`migrations` list for it.

A second module brings three questions that one module never raised:

- **Two blocks or one.** `wrangler.jsonc` allows one `durable_objects` key and
  one `migrations` key. Two modules can't each write their own.
- **Which tag.** Wrangler records the last migration tag it applied and applies
  only the entries after it in the list. A tag must be unique, and its position
  matters more than its name.
- **Which order.** A project can turn the modules on in either order, and
  wrangler only ever applies entries after the last one it ran.

## Decision

1. **One block each.** The generator collects every Durable Object the enabled
   modules need and writes a single `durable_objects.bindings` list and a single
   `migrations` list.
2. **A named tag per module.** Each module owns a tag named after it, such as
   `auth-rate-limit-v1`, rather than the next `vN`. `realtime` keeps `v1`, the
   tag it already shipped under, because renaming an applied tag is a deploy
   error. A later change to a module's class takes that module's next tag
   (`auth-rate-limit-v2`).
3. **SQLite storage.** Every class uses `new_sqlite_classes`. A class's storage
   backend can't change after it first deploys, and SQLite is what Cloudflare
   offers new classes on every plan.
4. **Modules are listed in a fixed order, and a project appends.** The
   generator writes `realtime` first, then later modules in the order they were
   added to Astroid. Only a new scaffold gets that order: `wrangler.jsonc` is
   scaffold-once for every project, so a project that turns a module on later
   appends its entry to the end of its own list, whatever order that leaves.
5. **`astroid doctor` checks each module's half.** A Durable Object module
   brings a doctor check for its binding, a migration that creates its class,
   and, when a `previews` block exists, the binding in
   `previews.durable_objects`. The generic previews check only asks whether that
   key exists, which a project with an earlier Durable Object already passes.
   `authRateLimit` has this check; `realtime` predates the rule and doesn't yet.

## Alternatives considered

- **Sequential tags (`v1`, `v2`).** Whichever module a project turned on second
  would get `v2`, so the same module would carry different tags in different
  projects, and a module's own later migration would have no name to take.
- **Sort the list by tag.** Sorting puts a newly turned-on module's entry before
  one wrangler already applied, so it never runs, and the class fails to
  resolve at deploy.
- **A block per module under its own key.** Wrangler reads one key of each.

## Consequences

- A project that turned on `authRateLimit` before `realtime` keeps its own
  order, with `auth-rate-limit-v1` first. Nothing regenerates its
  `wrangler.jsonc`, so nothing reorders the list behind its back. `doctor`
  checks that each class has a migration, not where in the list it sits.
- The next Durable Object module adds an entry to the generator's list after
  `authRateLimit`, a named tag, and its own `doctor` check, following
  `src/auth-rate-limit/`.
