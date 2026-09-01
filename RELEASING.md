# Releasing

How to publish `astroidjs` and `create-astroid` to npm. Publishing is **manual**
(no release Action). The version bump happens in its own PR (`pnpm changeset` →
`changeset version`, reviewed and merged); this covers the publish that follows.

## Before you start: the toolkit comes first

Both packages depend on `louise-toolkit`, and `create-astroid` also depends on
`@louise-toolkit/astro`. Both are released from
[bowenlabs/louise-toolkit](https://github.com/bowenlabs/louise-toolkit) and
installed here from npm like any other dependency.

So if this release is meant to pick up toolkit changes, **the toolkit has to be
on npm first**, and the dependency ranges in `packages/*/package.json` bumped to
match. A release that quietly ships against the old toolkit is the failure mode
to watch for; the scaffold smoke test catches it, because the scaffold declares
the versions create-astroid actually resolved.

## Publish

```sh
cd ~/GitHub/astroidjs
git checkout main && git pull --ff-only
nvm use                    # Node 26. Homebrew's node shadows it if nvm isn't loaded.
corepack pnpm install

corepack pnpm release      # ← the release. Sign in to npm when it prompts.
```

**Use `pnpm release`, not a bare `changeset publish`.** It builds first, then
publishes. `changeset publish` runs every package's `prepublishOnly`
concurrently, so building there is a race whenever one package's build reads
another's output — which is exactly how a louise-toolkit release once went out
three-packages-of-four. `prepublishOnly` here asserts the build happened
(`scripts/ci/checks/dist-present.mjs`) and only reads, so it cannot race.

`changeset publish` rewrites `workspace:*` (create-astroid → astroidjs) to the
exact published version and publishes in dependency order. It creates a git tag
per package, so push them:

```sh
git push --follow-tags origin main
```

## Verify

Read the expected numbers off `main` rather than out of this file:

```sh
for p in packages/astroid packages/create-astroid; do
  node -e "const p=require('./$p/package.json');console.log(p.name, p.version)"
done
```

Then scaffold from the LIVE registry — the only check that exercises what a
stranger actually gets, because CI's smoke test installs from local tarballs and
therefore cannot catch a broken `files` entry or an export map that only resolves
in-workspace:

```sh
cd "$(mktemp -d)"
pnpm create astroid@<just-published> my-site --key mysite --name "My Site" --archetype marketing
cd my-site && pnpm install && pnpm exec astro check && pnpm exec astro build
```

**Pin the version.** `@latest` can serve a cached older copy, which scaffolds the
previous release's toolkit ranges and mimics a broken version derivation exactly.

## If something goes wrong

- **Interrupted mid-publish** (astroidjs published, create-astroid didn't): re-run
  `corepack pnpm release`. It skips versions already on npm and publishes the
  rest. This is a normal state, not a corrupt one.

- **npm lies to you for a minute after a publish, and it lies convincingly.**
  `npm view <pkg> version` and `https://registry.npmjs.org/<pkg>` can both keep
  serving the 404 they cached while the package genuinely did not exist. Do not
  conclude a publish failed from a 404. The reliable tells:

  - `npm view <pkg> --prefer-online`, and the versioned endpoint
    `registry.npmjs.org/<pkg>/<version>`, which is cached separately.
  - A `403 ... cannot publish over the previously published versions` on retry
    means it **succeeded**. That error is the proof.
  - A git tag proves changesets _attempted_ the publish, not that npm accepted
    it — `git push --follow-tags` pushes tags either way.

- **You cannot cleanly unpublish.** If a bad version ships, roll forward with a
  patch, don't unpublish.

## Pre-1.0

Versions are pre-1.0, so a **minor bump is where breaking changes live** and
there is no deprecation cycle. Write the changeset for someone upgrading blind:
what changed, why, and what they have to do about it.
