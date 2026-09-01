# astroidjs

**Astroid** — an opinionated meta-framework over
[Louise Toolkit](https://github.com/bowenlabs/louise-toolkit) and Astro, for
building editable, multi-editor sites on Cloudflare Workers.

| package                                     | npm                                                                                                 | what it is                               |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| [`astroidjs`](packages/astroid)             | [![npm](https://img.shields.io/npm/v/astroidjs)](https://www.npmjs.com/package/astroidjs)           | the meta-framework and its CLI           |
| [`create-astroid`](packages/create-astroid) | [![npm](https://img.shields.io/npm/v/create-astroid)](https://www.npmjs.com/package/create-astroid) | `pnpm create astroid` — scaffolds a site |

> **Status: pre-1.0.** Breaking changes ship as **minor** versions; there is no
> deprecation cycle yet. Pin an exact version if you depend on this.

## Start here

```sh
pnpm create astroid my-site
cd my-site && pnpm install && pnpm dev
```

## The layering

Louise is the unopinionated toolkit — primitives you assemble by hand. Astroid is
the opinionated preset on top: a theme system, a section library, and one typed
`defineAstroid` config that generates the Louise wiring (worker routes,
middleware, Drizzle schema, theme) a site would otherwise hand-write per repo.

```
Astro        →  renderer / router / build
  Louise     →  unopinionated primitives + framework glue   (louise-toolkit)
    Astroid  →  opinions: theme, sections, config, scaffold  (astroidjs)
```

**Dependencies flow one way: `astroidjs → louise-toolkit`, never the reverse.**
Louise stays unopinionated; the opinions live here. That rule is why these are
separate repos at all — `louise-toolkit` enforces in CI that the string "astro"
does not appear anywhere in its own source.

Astro-specific glue that Louise itself needs lives in a third package,
[`@louise-toolkit/astro`](https://www.npmjs.com/package/@louise-toolkit/astro),
which is released from the louise-toolkit repo. Astroid depends on it; it is not
part of this repo.

## Working on it

```sh
nvm use                    # Node 26, pinned in .nvmrc
corepack pnpm install      # corepack, not a global pnpm
corepack pnpm test
```

Everything CI runs, in the order it runs it:

```sh
corepack pnpm run lint
corepack pnpm run lint:solid
corepack pnpm run fmt:check
corepack pnpm run knip
corepack pnpm run lint:release
corepack pnpm run typecheck
corepack pnpm test
corepack pnpm run build:packages
```

Plus the one that matters most and is easiest to forget:

```sh
scripts/ci/scaffold-smoke.sh marketing /tmp/smoke
```

`packages/create-astroid/template/` is **scaffold payload, not source** — its
files carry `__ASTROID_*__` placeholders and several are not valid TypeScript
standalone, so oxfmt, oxlint and knip are all configured to skip it. That smoke
test is the only thing in the repo that ever type-checks the template, by
scaffolding a real project and building it.

Releases: see [RELEASING.md](RELEASING.md). Conventions a reviewer will hold you
to: [CLAUDE.md](CLAUDE.md).

## License

MIT © BowenLabs. See [LICENSE](LICENSE).
