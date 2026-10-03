# ADR 0025—Release workflow action pins: commits, and a newer release of the same major version

- **Status:** Proposed (2026-10-03)
- **Deciders:** Baylee (solo maintainer)
- **Related:** ADR 0017 in louise-toolkit (releases and deploys, amended), which
  introduced the generated release workflow; the shared Renovate preset in
  louise-toolkit's `default.json`
- **Scope:** `packages/astroid/src/project/release.ts`, and the release
  workflow check in `astroid doctor`

## Context

`astroid generate` writes each site's `.github/workflows/release.yml`, and
`astroid doctor` fails when the file differs from what it would write. The
workflow mints a GitHub App token that can move `deploy/production`, which
Workers Builds deploys to production.

Its actions were pinned by tag, `actions/checkout@v4`. A tag runs whatever
commit it points at when the job starts, so anyone who controls the tag, the
action's owner or someone who took over the account, controls code that runs
with that token. A commit SHA can't be moved.

Every site extends the shared Renovate preset, which updates GitHub Actions,
digests included. With SHA pins, Renovate opens a pull request whenever an
action publishes a release, and that pull request changes `release.yml`. If
`astroid doctor` accepted only astroid's exact output, every one of those pull
requests would fail CI on every site until the next astroid release, and a
maintainer would learn to close Renovate's GitHub Actions pull requests, the
other files in them included.

## Decision

### 1. Each action is pinned to a release's commit

The workflow writes `uses: <action>@<40-character SHA> # v<major>.<minor>.<patch>`.
`ASTROID_RELEASE_ACTIONS` lists the pins, and a custom Renovate manager in this
repository keeps that list current, so a new site starts from a recent release.

### 2. A site may move to a newer release of the same major version

`generateAstroidReleaseWorkflow(existing)` takes the site's current file. For
each action, when the file pins a newer release of the same major version, by a
full lowercase SHA with the release in the comment, the output keeps that pin.
`astroid generate` passes the file it's about to overwrite, so it never moves a
newer pin back, and `astroid doctor` accepts the file only when it equals that
output. Everything else in the file must still match byte for byte.

### 3. Everything else stays drift

- **The same release at a different commit.** That's what a moved tag looks
  like: Renovate opens a digest update for it. Doctor refuses it.
- **An older release, another major version, a tag, or a short SHA.** A new
  major version is a change astroid makes after it has checked the action.

## Consequences

- Renovate's minor and patch updates to `release.yml` pass CI on every site.
  Its major updates fail `astroid doctor`, and a maintainer closes them.
- Doctor checks the pin's shape, not that the SHA is the commit its comment
  names. A pull request could pair a newer version with any commit, so the
  review of Renovate's pull request is what verifies a pin, as for every other
  dependency. Doctor's job here is to catch an accidental edit, and an edit
  that weakens a pin, such as going back to a tag.
- A site whose file carries a newer release notes it in doctor's output, so the
  difference from astroid's pin is visible.

## Alternatives considered

- **Accept only the exact output.** Simplest, and astroid alone would move
  the pins. It fails CI on every site's Renovate pull request until each site
  also turns off Renovate for `release.yml`, which leaves the pins as fresh as
  the site's last astroid upgrade.
- **Accept any SHA for a known action.** Also accepts a moved tag's commit,
  the exact thing the pin exists to stop.
- **Have doctor ask GitHub which commit a tag names.** Doctor would then need
  the network and a token in CI, and would still trust the tag it's checking.
