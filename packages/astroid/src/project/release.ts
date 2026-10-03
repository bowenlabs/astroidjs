// Copyright (c) 2026 BowenLabs. Astroid is MIT licensed.
//
// The release workflow every site runs (louise-toolkit ADR 0017, amended).
//
// Releases are trunk-based: a `v<version>` tag on a commit of `main` is the
// release, and a `release/<version>` branch exists only when a released version
// needs a patch and `main` has moved on. Workers Builds deploys on branch
// pushes and can't watch tags, so the tag's workflow moves one branch,
// `deploy/production`, to the tagged commit, and Workers Builds deploys that.
// Nobody commits to the branch; it's a tag carried as a branch, and GitHub never
// holds a Cloudflare credential.
//
// The push uses a GitHub App's token, not the workflow's own `GITHUB_TOKEN`. A
// repository ruleset keeps everyone else off `deploy/production`, and GitHub
// rejects the GitHub Actions app as a ruleset bypass actor, so a ruleset that
// guards the branch blocks `GITHUB_TOKEN` too. A GitHub App can be the bypass
// actor. The setup is in the docs site's Releases guide.
//
// A release needs a green CI. Before it moves the branch, the workflow reads
// the tagged commit's check run named `CI`, the one required status that each
// site's aggregator job reports, and refuses the release unless it passed. It
// waits for a run that hasn't finished, since the `release` concurrency group
// already serializes releases. Tagging a commit doesn't make it tested.
//
// A regenerated file, like the worker trio: `astroid generate` rewrites it and
// `astroid doctor` fails when it drifts, so a hand edit can't quietly change
// which commits reach production.
//
// Each action is pinned to a commit, with its release in a trailing comment.
// The job holds a token that moves `deploy/production`, so an action pinned by
// tag would run whatever commit its owner, or anyone who took over the tag,
// pointed the tag at next. One exception keeps Renovate useful: a site's file
// may carry a newer release of the same major version than astroid's, pinned
// the same way, and `astroid generate` keeps it rather than move it back. A
// different commit for the same release is never accepted, since that's what a
// moved tag looks like. ADR 0025 has the reasoning.

/** The branch Workers Builds deploys to production from. */
export const ASTROID_DEPLOY_BRANCH = "deploy/production";

/** Where the workflow lives, relative to the repository root. */
export const ASTROID_RELEASE_WORKFLOW_PATH = ".github/workflows/release.yml";

/** The Actions variable that holds the release app's App ID. */
export const ASTROID_RELEASE_APP_ID_VAR = "RELEASE_APP_ID";

/** The Actions secret that holds the release app's private key. */
export const ASTROID_RELEASE_APP_KEY_SECRET = "RELEASE_APP_PRIVATE_KEY";

/** The check run a tagged commit needs to have passed: each site's aggregator job. */
const CI_CHECK = "CI";

/** How long the release waits for an unfinished `CI` run, polled every 20 seconds. */
const CI_WAIT_MINUTES = 30;

/** An action the release workflow runs, pinned to the commit of one release. */
export interface AstroidActionPin {
  /** The action's repository, such as `actions/checkout`. */
  readonly action: string;
  /** The release's full commit SHA: 40 lowercase hex digits. */
  readonly sha: string;
  /** The release's tag, `v<major>.<minor>.<patch>`. */
  readonly version: string;
}

/**
 * The actions the release workflow runs, at the releases astroid pins: the
 * latest release of each major version that astroid has checked. Renovate keeps
 * them current in this repository, through a custom manager that reads this
 * list, so keep each entry's three fields together and in this order.
 */
export const ASTROID_RELEASE_ACTIONS = {
  createGithubAppToken: {
    action: "actions/create-github-app-token",
    sha: "fee1f7d63c2ff003460e3d139729b119787bc349",
    version: "v2.2.2",
  },
  checkout: {
    action: "actions/checkout",
    sha: "11d5960a326750d5838078e36cf38b85af677262",
    version: "v4.4.0",
  },
} as const satisfies Record<string, AstroidActionPin>;

/** The pin for each action in `ASTROID_RELEASE_ACTIONS`. */
export type AstroidReleaseActionPins = Record<
  keyof typeof ASTROID_RELEASE_ACTIONS,
  AstroidActionPin
>;

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const parseVersion = (version: string) => {
  const m = /^v(\d+)\.(\d+)\.(\d+)$/.exec(version);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : undefined;
};

/**
 * Whether `found` is a later release of the same major version as `pinned`.
 * A different major version is an upgrade for astroid to vet, and the same
 * release with a different commit is a moved tag, so neither counts.
 */
function isNewerSameMajor(found: AstroidActionPin, pinned: AstroidActionPin): boolean {
  const a = parseVersion(found.version);
  const b = parseVersion(pinned.version);
  if (!a || !b || a[0] !== b[0]) return false;
  return a[1] > b[1] || (a[1] === b[1] && a[2] > b[2]);
}

/**
 * The pin for each action that the release workflow uses. Without `existing`,
 * these are astroid's own. With the contents of a site's current file, an
 * action whose `uses:` line pins a newer release of the same major version,
 * by full commit SHA with the release in a trailing comment, keeps that pin.
 * This is the shape a Renovate digest update writes.
 */
export function astroidReleaseWorkflowPins(existing?: string): AstroidReleaseActionPins {
  const pins: AstroidReleaseActionPins = { ...ASTROID_RELEASE_ACTIONS };
  if (existing === undefined) return pins;
  for (const key of Object.keys(pins) as (keyof AstroidReleaseActionPins)[]) {
    const pinned = pins[key];
    const line = new RegExp(
      `^ +(?:- )?uses: ${escapeRegExp(pinned.action)}@([0-9a-f]{40}) # (v\\d+\\.\\d+\\.\\d+)$`,
      "m",
    ).exec(existing);
    const [, sha, version] = line ?? [];
    if (!sha || !version) continue;
    const found = { action: pinned.action, sha, version };
    if (isNewerSameMajor(found, pinned)) pins[key] = found;
  }
  return pins;
}

const uses = (pin: AstroidActionPin) => `${pin.action}@${pin.sha} # ${pin.version}`;

/** Where the one-time release setup is written down. */
export const ASTROID_RELEASE_SETUP_URL = "https://docs.astroidjs.org/guide/releases/";

/**
 * The release workflow's contents. Pure, and the same for every site, apart
 * from an action pin that `existing`, the site's current file, has moved to a
 * newer release of the same major version (see `astroidReleaseWorkflowPins`).
 * `astroid generate` writes this, and `astroid doctor` accepts only this.
 */
export function generateAstroidReleaseWorkflow(existing?: string): string {
  const pins = astroidReleaseWorkflowPins(existing);
  const appId = ASTROID_RELEASE_APP_ID_VAR;
  const appKey = ASTROID_RELEASE_APP_KEY_SECRET;
  const polls = (CI_WAIT_MINUTES * 60) / 20;
  return `# Generated by astroid. Don't edit: \`astroid generate\` rewrites this file and
# \`astroid doctor\` fails when it drifts.
#
# A release is a tag, v<major>.<minor>.<patch>, on a commit of main, or of a
# release/<version> branch when a released version needs a patch. This moves
# ${ASTROID_DEPLOY_BRANCH} to the tagged commit, and Workers Builds deploys it to
# production. Nobody commits to ${ASTROID_DEPLOY_BRANCH}; a repository ruleset lets
# only the release GitHub App update it. To roll back, tag the earlier commit
# with the next patch version.
#
# A release needs a green CI: the tagged commit's ${CI_CHECK} check must have
# passed. While ${CI_CHECK} is still running, the release waits for it, for up to
# ${CI_WAIT_MINUTES} minutes. CI runs on pushes to main and release/ branches.
#
# The push uses the release app's token, from the ${appId} variable and
# the ${appKey} secret. The workflow's own GITHUB_TOKEN can't push:
# GitHub rejects the GitHub Actions app as a ruleset bypass actor, so the
# ruleset blocks it too. One-time setup, the app and the ruleset:
# ${ASTROID_RELEASE_SETUP_URL}
#
# Each action is pinned to a release's commit, since this job holds a token
# that can move ${ASTROID_DEPLOY_BRANCH}. \`astroid doctor\` also accepts a newer
# release of the same major version, pinned the same way, which is how Renovate
# updates it, and \`astroid generate\` keeps that pin.
name: Release

on:
  push:
    tags: ["v*"]

permissions:
  contents: write
  # To read the tagged commit's ${CI_CHECK} check.
  checks: read

# One release at a time, in the order the tags arrived.
concurrency:
  group: release
  cancel-in-progress: false

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - name: Check the release app
        env:
          APP_ID: \${{ vars.${appId} }}
          APP_KEY: \${{ secrets.${appKey} }}
        run: |
          if [ -z "$APP_ID" ] || [ -z "$APP_KEY" ]; then
            echo "::error::Releasing needs the ${appId} variable and the ${appKey} secret, from the GitHub App that the ${ASTROID_DEPLOY_BRANCH} ruleset lets through. Set them up as ${ASTROID_RELEASE_SETUP_URL} describes."
            exit 1
          fi

      - name: Mint the release app's token
        id: app-token
        uses: ${uses(pins.createGithubAppToken)}
        with:
          app-id: \${{ vars.${appId} }}
          private-key: \${{ secrets.${appKey} }}

      - uses: ${uses(pins.checkout)}
        with:
          fetch-depth: 0
          # The push below uses the credentials checkout leaves in place.
          token: \${{ steps.app-token.outputs.token }}

      - name: Check the tag
        run: |
          tag="$GITHUB_REF_NAME"
          if ! [[ "$tag" =~ ^v[0-9]+\\.[0-9]+\\.[0-9]+$ ]]; then
            echo "::error::A release tag is v<major>.<minor>.<patch>, such as v1.4.0. Got $tag."
            exit 1
          fi
          sha="$(git rev-list -n 1 "$tag")"
          if git merge-base --is-ancestor "$sha" origin/main; then
            echo "$tag is on main."
          elif git branch -r --contains "$sha" | grep -q "origin/release/"; then
            echo "$tag is on a release branch."
          else
            echo "::error::$tag isn't on main or a release/ branch, so it can't be released."
            exit 1
          fi
          echo "SHA=$sha" >> "$GITHUB_ENV"

      - name: Check that CI passed
        env:
          GH_TOKEN: \${{ github.token }}
        run: |
          # ${CI_CHECK} is the aggregator job that needs every other job, and GitHub
          # creates its check run only once they finish. So a commit with no
          # ${CI_CHECK} run but other jobs still running is waiting for ${CI_CHECK}, not
          # missing it.
          for _ in $(seq ${polls}); do
            ci="$(gh api "repos/$GITHUB_REPOSITORY/commits/$SHA/check-runs?check_name=${CI_CHECK}&filter=latest" \\
              --jq '[.check_runs[] | select(.app.slug == "github-actions")] | sort_by(.started_at) | last // empty | [.status, (.conclusion // "none"), .html_url] | join(" ")')"
            if [ -n "$ci" ]; then
              read -r status conclusion url <<< "$ci"
              if [ "$status" = completed ] && [ "$conclusion" = success ]; then
                echo "${CI_CHECK} passed on $SHA: $url"
                exit 0
              elif [ "$status" = completed ]; then
                echo "::error::${CI_CHECK} on $SHA ended in $conclusion, so it can't be released: $url"
                exit 1
              fi
              echo "${CI_CHECK} on $SHA is $status. Waiting for it: $url"
            else
              # Other jobs on the commit that are still running, apart from this one.
              running="$(gh api "repos/$GITHUB_REPOSITORY/commits/$SHA/check-runs?filter=latest&per_page=100" \\
                --jq '[.check_runs[] | select(.app.slug == "github-actions" and .status != "completed") | select(.details_url | contains("/actions/runs/" + $ENV.GITHUB_RUN_ID + "/") | not)] | length')"
              if [ "$running" = 0 ]; then
                echo "::error::$SHA has no ${CI_CHECK} run, so it can't be released. CI runs on pushes to main and release/ branches, and a release needs its job named ${CI_CHECK} to pass."
                exit 1
              fi
              echo "${CI_CHECK} hasn't started on $SHA, and $running other jobs are running on it. Waiting for ${CI_CHECK}."
            fi
            sleep 20
          done
          echo "::error::${CI_CHECK} on $SHA didn't finish within ${CI_WAIT_MINUTES} minutes, so it can't be released yet. When it passes, rerun this workflow."
          exit 1

      - name: Move ${ASTROID_DEPLOY_BRANCH} to the tag
        run: git push --force origin "$SHA:refs/heads/${ASTROID_DEPLOY_BRANCH}"

      - name: Create the GitHub release
        env:
          GH_TOKEN: \${{ github.token }}
        run: gh release create "$GITHUB_REF_NAME" --verify-tag --generate-notes
`;
}
