# Contributing

## The layout

| package                   | published as     | what it is                                                             |
| ------------------------- | ---------------- | ---------------------------------------------------------------------- |
| `packages/astroid`        | `astroidjs`      | the meta-framework and its CLI                                         |
| `packages/create-astroid` | `create-astroid` | `pnpm create astroid` — the scaffold                                   |
| `workers/docs`            | —                | the Starlight site at [docs.astroidjs.org](https://docs.astroidjs.org) |

**Dependencies flow one way: `astroidjs` → `louise-toolkit`, never the reverse.**
Louise is the unopinionated toolkit; the opinions live here. If a change here
would be easier with a change in Louise, ask first whether the opinion belongs
here instead — usually it does. Louise enforces its half in its own CI: the
string "astro" may not appear anywhere in its source.

## Setup

```sh
nvm use                 # Node 26, pinned in .nvmrc
corepack pnpm install   # corepack, not a global pnpm
```

Both matter. Homebrew's node shadows nvm when nvm isn't sourced, and a global
pnpm of a different major fails with a store error that names nothing useful.

## Before you push

```sh
corepack pnpm run lint
corepack pnpm run lint:solid
corepack pnpm run fmt:check
corepack pnpm run knip
corepack pnpm run lint:release
corepack pnpm run lint:docs
corepack pnpm run typecheck
corepack pnpm test
corepack pnpm run build:packages
corepack pnpm run build:docs
```

**Check exit codes, not summary lines.** A suite can print a passing summary
while the run fails.

And for anything touching `packages/create-astroid/template/`:

```sh
scripts/ci/scaffold-smoke.sh marketing /tmp/smoke
```

That is the only check that ever compiles the template — see below.

## `template/` is not source

`packages/create-astroid/template/` is scaffold **payload**. Its files carry
`__ASTROID_*__` placeholders and several are not valid TypeScript standalone, so
oxfmt, oxlint, knip and Renovate are all configured to skip it. Formatting one
produces `SQUARE_ENVIRONMENT: string;;` in every scaffolded project.

Its toolkit versions are **derived**, never written. `toolkitRanges()` in
`index.mjs` reads create-astroid's own resolved dependencies, and
`scripts/ci/checks/scaffold-versions.mjs` fails the build if they become
literals — which is exactly what a well-meaning edit writes.

Nothing type-checks the template until it is scaffolded. The smoke test is the
only thing that can catch damage to it.

## Tests resolve the published toolkit

`packages/astroid/vitest.config.ts` deliberately has **no `louise-toolkit/*`
aliases**. Aliasing to source would let the suite pass against symbols that were
never publicly re-exported. These tests import the dependency the way a consumer
does. Please don't add aliases back.

## Changesets

```sh
corepack pnpm changeset
```

Pre-1.0, so a **breaking change ships as `minor`** — there is no deprecation
cycle to lean on. Write it for someone upgrading blind: what changed, why, and
what they have to do about it. A change users can't observe (CI, internal
refactor) needs no changeset.

Releases: [RELEASING.md](RELEASING.md). Conventions a reviewer will hold you to:
[CLAUDE.md](CLAUDE.md).
