#!/usr/bin/env bash
# Scaffold a project the way a stranger would, and build it.
#
#   scripts/ci/scaffold-smoke.sh <archetype> <workdir>
#
# This is the only check that exercises `packages/create-astroid/template/`.
# Nothing type-checks that tree until it is scaffolded: its files carry
# `__ASTROID_*__` placeholders and several are not valid TypeScript standalone,
# which is why oxfmt, oxlint and knip are all configured to skip it. So a change
# that breaks the template passes every other leg of CI and fails in a user's
# terminal.
#
# The shape differs from the monorepo's version of this test, and the difference
# is the point. There, every toolkit package was packed from source and pinned by
# `overrides`, which meant the scaffold's DECLARED ranges were never exercised.
# Here `louise-toolkit` and `@louise-toolkit/astro` install from npm exactly as a
# user gets them, and only `astroidjs` — the thing this repo builds — is pinned to
# a local tarball. A broken published range now fails here.
set -euo pipefail

ARCHETYPE="${1:?usage: scaffold-smoke.sh <archetype> <workdir>}"
WORK="${2:?usage: scaffold-smoke.sh <archetype> <workdir>}"
REPO="$(cd "$(dirname "$0")/../.." && pwd)"

PACK="$WORK/pack"
ROOM="$WORK/room"
rm -rf "$WORK" && mkdir -p "$PACK" "$ROOM"

echo "==> packing astroidjs + create-astroid"
(cd "$REPO/packages/astroid" && corepack pnpm pack --pack-destination "$PACK" >/dev/null)
(cd "$REPO/packages/create-astroid" && corepack pnpm pack --pack-destination "$PACK" >/dev/null)
ASTROID_TGZ="$(ls "$PACK"/astroidjs-*.tgz)"
CREATE_TGZ="$(ls "$PACK"/create-astroid-*.tgz)"
echo "    $(basename "$ASTROID_TGZ")"
echo "    $(basename "$CREATE_TGZ")"

# The clean room installs create-astroid from its tarball. Installing it (rather
# than running index.mjs out of the repo) is what makes `scaffold-versions.mjs`
# meaningful: the versions it compares against are the ones a real install
# resolved, not whatever the workspace happens to link.
echo "==> clean room"
cd "$ROOM"
cat > package.json <<'JSON'
{ "name": "astroid-scaffold-smoke", "private": true, "type": "module" }
JSON

# pnpm 11 reads overrides from pnpm-workspace.yaml, NOT package.json — a
# `pnpm.overrides` block there is silently ignored, with only a warning.
{
  echo "overrides:"
  printf '  astroidjs: "file:%s"\n' "$ASTROID_TGZ"
  # Toolkit versions published minutes before a release smoke test are younger
  # than pnpm's supply-chain gate; without this the install refuses them.
  echo "minimumReleaseAgeExclude:"
  echo '  - "louise-toolkit"'
  echo '  - "@louise-toolkit/astro"'
} > pnpm-workspace.yaml

corepack pnpm add "$CREATE_TGZ" >/dev/null

echo "==> scaffolding ($ARCHETYPE)"
node ./node_modules/create-astroid/index.mjs smoke \
  --key smoke --name "Smoke Site" --archetype "$ARCHETYPE"

echo "==> the scaffold declares the versions it was built against"
node "$REPO/scripts/ci/checks/scaffold-versions.mjs" smoke ./node_modules/create-astroid

echo "==> install + verify the scaffolded project"
cd "$ROOM/smoke"

# APPEND to the scaffold's own pnpm-workspace.yaml; never overwrite it. That file
# is generated content carrying `allowBuilds` (without which `pnpm install` fails
# outright on esbuild/workerd) and two security `overrides`. Replacing it makes
# the smoke test pass or fail for reasons that have nothing to do with the
# scaffold — and silently stops testing the settings a real user gets. The
# template comments its `overrides:` key as "KEEP THIS KEY LAST" precisely so this
# append is safe.
#
# The release-age exclusions go at the TOP, as their own key, so `overrides:`
# stays last and the next appender inherits the same guarantee.
{
  echo "minimumReleaseAgeExclude:"
  echo '  - "louise-toolkit"'
  echo '  - "@louise-toolkit/astro"'
  cat pnpm-workspace.yaml
  printf '  astroidjs: "file:%s"\n' "$ASTROID_TGZ"
} > pnpm-workspace.yaml.new
mv pnpm-workspace.yaml.new pnpm-workspace.yaml

corepack pnpm install
corepack pnpm exec astro check
corepack pnpm exec astro build

echo "==> OK: $ARCHETYPE scaffolds, type-checks and builds"
