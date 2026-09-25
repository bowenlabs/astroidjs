---
"create-astroid": patch
---

**New projects start on TypeScript 6 and pnpm 12.** The scaffold's `package.json` now declares `typescript` `^6.0.3`, up from `^5.9.3`, and `packageManager` `pnpm@12.6.0`, up from `pnpm@11.13.0`. This matches the toolchain louise-toolkit and astroidjs build and test with. `astro check` passes on TypeScript 6 with the scaffold's `@astrojs/check`, and no template source needed a change.

TypeScript 7 isn't allowed yet. It waits until 7.1 ships and `@astrojs/check` supports it.

**What to do:** nothing, for an existing project. It keeps the versions it was scaffolded with. To move one to the new toolchain, set the same two versions in its `package.json`, run `corepack pnpm install`, and commit the new `pnpm-lock.yaml`. pnpm 12 adds a leading YAML document to the lockfile that records the package manager. A CI job that installs with `--frozen-lockfile` fails until that lockfile is committed.
