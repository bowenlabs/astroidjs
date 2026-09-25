# Lessons

Things that cost real time to learn here, written down so they don't cost it
twice. Each one names what you see, the cause, and what to do instead. The
architecture is in [`ARCHITECTURE.md`](ARCHITECTURE.md), and the checks CI runs
are in [`CLAUDE.md`](../CLAUDE.md). Lessons that apply to any site on the toolkit,
such as declaring every host in `routes` or reading `.astro/dev.log` when the dev
server won't start, live in louise-toolkit's
[`docs/LESSONS.md`](https://github.com/bowenlabs/louise-toolkit/blob/main/docs/LESSONS.md).

## Generated code

### The generators emit strings, so only a scaffold can check them

A generator writes TypeScript as text. Inside this package, that text type-checks
as a string, whatever it says. During one pre-release audit, seven type errors in
generated code passed every check here and failed only in a scaffolded project.
Some examples:

- Passing `bufferKv` to `saveRoute`, which doesn't accept it. Only `versionsRoute`
  does.
- Importing `realtimeRoute` from `louise-toolkit/editor`. It lives in
  `louise-toolkit/realtime`.
- Treating `readCatalog`'s result as `{ items }`. It returns an array.

Read the real signature in louise-toolkit before you write generated code that
calls it, and then run the scaffold smoke test. It's the only check that compiles
the output.

### `astro check` can't see the component library

`astro check` diagnoses only files inside the project. The section library is
installed under `node_modules/astroidjs/src/components`, so a type error there
passes `astro check` in every scaffold. To check the components, copy them into a
scaffold's `src/` and run `astro check` again. CI doesn't do this yet (#32).

### A write path must answer 422, and only a served site shows it

An invalid section once came back as 200 and was stored, and elsewhere as 500
with an internal error string. Neither showed up in tests, `astro check`, or
`astroid doctor`, only against a running Worker. Two things make these checks
tricky:

- Reaching the throw needs a real D1, so there's no unit test for the versions
  path. A served scaffold is its only guard, and CI doesn't serve one yet (#32).
- The `DRAFTS` write buffer used to defer validation to publish: a bad write
  that merged into an open buffer returned 200 and failed later. Since
  louise-toolkit 0.31.1 (#529), a buffered save runs the collection's hooks
  first, so it answers 422 like any other. On louise-toolkit 0.31.0 or earlier,
  test validation on a fresh page.

### Read the module before inferring a data model

The inquiries table has no read-state column, which suggested an inbox count that
could never go down, so the count was left out. The Inquiries tab reviews and
deletes, and deleting is the acknowledgement, so `COUNT(*)` is the number still
waiting, and it does fall. Read a module's header comment before you reason from
its column names.

### Assert every scripted text replacement

A scripted `str.replace` that doesn't match changes nothing and reports nothing.
Two such edits silently did nothing during one pass, and only the scaffold smoke
test caught them. Assert that the old text is present, or use a tool that fails
when it isn't.

## The clean room

### A clean room can hide what a real user installs

A smoke test that installs Astroid from a local tarball has to override the
scaffold's dependency, and an override erases the version range the template
declares, which is the one thing that decides what a user gets. Stale ranges
rotted unseen behind it. Now `toolkitRanges()` derives the ranges, and
`scripts/ci/checks/scaffold-versions.mjs` fails the build if they become literals.

The same shape happened again inside the clean room. The template shipped no
build approvals for esbuild and workerd, so `pnpm install` failed on a fresh
scaffold, but every test replaced the scaffold's `pnpm-workspace.yaml` with its
own and hid the failure. The smoke test now appends to the template's file
instead of replacing it. Whenever a test rewrites something a user would receive
untouched, ask what that rewrite hides.

### A derived value and its check must agree on the source

`toolkitRanges()` once read create-astroid's declared range (`^0.31.0`), while
`scaffold-versions.mjs` expected a caret on the resolved version. They agreed
until the day `louise-toolkit` 0.31.1 shipped. After that, the smoke test failed
on every PR with no code change. The declared value had been exact in the
monorepo, and the repo split turned it into a range. When a derivation and the
check that guards it can each read a different input, name the one they share.

### pnpm 11 reads settings only from `pnpm-workspace.yaml`

pnpm 11 ignores `pnpm.overrides` in `package.json`, even for a project that
isn't a workspace. Overrides and build approvals belong in `pnpm-workspace.yaml`.

### A clean `pnpm audit` isn't a clean Snyk

`pnpm audit` reads GitHub's advisory database, and Snyk has its own. An advisory
was once "fixed" against a clean `pnpm audit` while Snyk still reported a critical
finding. When the Snyk check fails, get the finding itself rather than inferring it.

### knip reads `ci.yml` as shell

knip parses a workflow's `run:` blocks as shell, so a backtick string that starts
with a command name reads as command substitution and gets reported as an unlisted
binary. Don't start a backtick string in a CI script with a binary's name.

## Serving a scaffold locally

- **`.dev.vars` must sit beside the config in use.** `wrangler dev -c
dist/server/wrangler.json` lists a root `.dev.vars` in its startup table but
  doesn't pass it to the Worker. Check `Object.keys(env)`.
- **Declared `hosts` change the host the Worker sees.** Wrangler forwards local
  requests with the declared route host, so the `localhost` fallback for
  `SESSION_SECRET` never applies, and every editor route fails until you set the
  secret.
- **`@astrojs/cloudflare` bakes `routes` into the build output.** After a build,
  `wrangler dev` rewrites every incoming host to the route's zone, so a test that
  spoofs a subdomain tests the apex instead. To test host dispatch, remove
  `routes`, rebuild, test, then restore it and rebuild again.
- **Test tenancy on the real host.** A rewrite that works through the path form
  (`/t/<tenant>/…`) can still be broken on the subdomain it serves.
- **Free a port by process, not by name.** `pkill -f "wrangler dev"` can leave
  `workerd` holding the port, and a stale server makes a fix look like it changed
  nothing. Use `lsof -ti tcp:PORT | xargs kill -9`.
- **Sign in through miniflare's mail folder.** Miniflare writes every
  `send_email` message under `.wrangler/tmp/email/`, so a real magic-link sign-in
  can be scripted. The mail arrives after the response, so poll for it. A repeat
  request for the same address inside the send window returns 200 and sends
  nothing, and deleting the folder while the server runs leaves it writing to a
  deleted file.
- **Seed with the server stopped.** A `wrangler d1 execute --local` that runs
  while `wrangler dev` is up can see a different database. Trust HTTP responses
  over CLI queries.
- **A page seeded with SQL isn't searchable** until it's published or you call
  `POST /api/louise/pages/reindex`. And because `pages.id` is `AUTOINCREMENT`, a
  delete and reseed doesn't get ID 1 back.

## Deploying a site

### Tell the two kinds of 404 apart

A route that never ran falls through to server rendering and returns the site's
own HTML 404 page. A route that ran and found nothing returns its own short
plain-text `Not found`. Check `content-type` before you decide routing is broken.

### Wrangler tracks D1 migrations by filename

When a concurrent change takes your migration number, renaming the file makes it
look new, and Wrangler runs it again. The symptom is a deploy failing on
`duplicate column` or `no such column` while the schema is already right. Don't
rewrite the SQL. Check `d1_migrations` for the old name, and then insert the new
name as applied. Never delete old ledger rows, because that reruns them.

### A branch deploy must never migrate production

If the non-production deploy command runs `d1 migrations apply --remote`, every
push to any branch migrates the live database before review. Use `wrangler
versions upload` for branch builds, and keep `--remote` migrations in the
production command only.

### Workers Builds in a pnpm workspace needs `--dir`

With the build path at the repository root, a bare `wrangler` refuses to run from
a workspace root. Write both deploy commands as `pnpm --dir workers/site exec
wrangler …`. When the non-production command loses the wrapper, every branch build
fails while `main` stays green.

## Versions

### Bump astroidjs and louise-toolkit together

Pre-1.0, a caret range never crosses a minor: `^0.31.0` means below 0.32.0. A
site that moves to a new toolkit minor needs the Astroid release that accepts it,
and the two move in one change. That's also why the toolkit is a peer dependency
here: a direct dependency resolved a second, nested toolkit on a mismatch, which
showed up as dozens of phantom Drizzle type errors.

To confirm a single toolkit, read the lockfile, not `node_modules/.pnpm`, which
can keep directories from earlier installs.
