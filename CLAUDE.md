# Working in this repo

Conventions CI or a reviewer enforces, written down so you meet them before they
meet you. Deliberately short — a long file rots, and a rotted one is worse than
none.

## The one rule everything else serves

**Dependencies flow one way: `astroidjs → louise-toolkit`, never the reverse.**
Louise is the unopinionated toolkit; the opinions live here. If you find yourself
wanting a change in Louise to make something here easier, ask first whether the
opinion belongs here instead — usually it does.

`louise-toolkit` enforces the other half of this in its own CI: the string
"astro" may not appear anywhere in its source, code or prose. That is why these
are separate repos.

## Toolchain

- **Node 26** — `.nvmrc` and `engines`, matching the CI runner.
- **Installs go through `corepack pnpm`**, against the pinned `packageManager`
  version. A globally-installed pnpm of a different major produces a store error
  rather than a clear message.
- **`nvm use` before anything.** nvm is installed but not always sourced, and
  Homebrew's node shadows it. A louise-toolkit release once published artifacts
  built on Node 24 this way, with every `engines` warning scrolling past unread.

## `packages/create-astroid/template/` is not source

It is scaffold **payload**, and three tools are configured to leave it alone
(`.oxfmtignore`, `.oxlintrc.json`, `knip.jsonc`). All three exclusions exist for
the same reason: its files carry `__ASTROID_*__` placeholders and several are not
valid TypeScript standalone. Formatting one produces
`SQUARE_ENVIRONMENT: string;;` in every scaffolded project.

Its toolkit versions are **derived**, never written. `toolkitRanges()` in
`index.mjs` reads create-astroid's own resolved dependencies;
`scripts/ci/checks/scaffold-versions.mjs` fails the build if they become
literals — which is exactly what a well-meaning edit writes.

**Nothing type-checks the template until it is scaffolded.** So:

```sh
scripts/ci/scaffold-smoke.sh marketing /tmp/smoke
```

is the only check that ever compiles it, and the only one that can catch damage
to it. Run it for any change under `template/`.

## Verifying a change

Run the full set, not just the tests, and **check exit codes** rather than
grepping a summary line — a suite can report success while the run fails.

```sh
corepack pnpm run lint
corepack pnpm run lint:solid
corepack pnpm run fmt:check
corepack pnpm run knip
corepack pnpm run lint:release
corepack pnpm run typecheck
corepack pnpm test
corepack pnpm run build:packages
scripts/ci/scaffold-smoke.sh marketing /tmp/smoke
```

`lint:release` loads the changesets stack. Nothing else does, so a dependency
resolution that breaks releasing is otherwise invisible until you try to ship —
which is how it was found.

## Tests resolve the PUBLISHED toolkit

`packages/astroid/vitest.config.ts` deliberately has **no `louise-toolkit/*`
aliases**. In the monorepo it aliased every subpath to the library's source,
which meant the suite could pass against symbols that existed in `src/` and were
never publicly re-exported. Here the tests import the dependency the way a
consumer does, so a subpath that stops resolving fails immediately. Don't add
aliases back.

## Decisions get an ADR

`docs/adr/`. Numbers are shared with louise-toolkit rather than restarted — see
the index there for why, and check both repos before claiming a number.

An ADR that has stopped being true gets **amended**, not quietly outdated. A
stale ADR is worse than none, because people trust it.

## Changesets

Pre-1.0, so a **breaking change ships as `minor`** — there is no deprecation
cycle to lean on. Write the changeset for someone upgrading blind: what changed,
why, and what they have to do about it.

Releasing: [RELEASING.md](RELEASING.md). Read it before your first release; the
npm-cache and publish-race notes there are both things that cost real time.
