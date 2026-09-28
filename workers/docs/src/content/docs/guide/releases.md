---
title: Releases
description: How a tag reaches production, and the one-time setup of the GitHub App and ruleset that guard `deploy/production`.
sidebar:
  order: 5
---

## How a release works

A release is a tag, `v<major>.<minor>.<patch>`, on a commit of `main`, or of a
`release/<version>` branch when a released version needs a patch. `astroid
generate` writes `.github/workflows/release.yml` at the repository root, and on
each tag it does four things:

1. Checks that the tag is `v<major>.<minor>.<patch>` and sits on `main` or a
   `release/` branch.
1. Checks that the tagged commit's `CI` check passed, and waits for it while
   it runs. A tag releases only a commit with a green `CI`.
1. Force-pushes the tagged commit to `deploy/production`. Workers Builds deploys
   that branch to production.
1. Creates a GitHub release with generated notes.

Nobody commits to `deploy/production`. It's a tag carried as a branch, because
Workers Builds deploys branch pushes and can't watch tags. To roll back, tag the
earlier commit with the next patch version.

The workflow holds no Cloudflare credential. `astroid doctor` fails when the
file is missing or stale, so a hand edit can't quietly change which commits
reach production.

## A release needs a green CI

Before it moves `deploy/production`, the release workflow reads the check run
named `CI` on the tagged commit, from GitHub Actions, and releases only when its
latest run succeeded:

- **It passed:** the release goes ahead.
- **It failed, or ended any other way:** the release fails, naming the result
  and linking the run. Fix CI on a new commit and tag that, or, for a flaky
  failure, rerun CI and then rerun the release.
- **It's queued or running:** the release waits for it, checking every 20
  seconds for up to 30 minutes. Releases already run one at a time, so a
  waiting release only holds up the tags after it. If CI still hasn't finished,
  the release fails; rerun it once CI passes.
- **There's no `CI` run:** the release fails. CI runs on pushes to `main` and
  `release/` branches, so a commit on either has a run unless its CI has no job
  named `CI`.

So a site's CI workflow needs a job named `CI` that runs on pushes to `main`
and `release/**`. Make it an aggregator: one job that needs every other job and
passes only when they all did. The workflow that `pnpm create astroid` scaffolds
has one:

```yaml
ci:
  name: CI
  runs-on: ubuntu-latest
  needs: [build]
  if: always()
  steps:
    - name: Fail if any job did not succeed
      run: |
        echo "build=${{ needs.build.result }}"
        [ "${{ needs.build.result }}" = "success" ]
```

Add each new job to its `needs`. The same job is the one required status to
protect `main` with, so adding a job never means editing branch protection or
the release. `if: always()` makes it report a failure when a job it needs
fails, instead of being skipped.

The workflow reads checks with its own `GITHUB_TOKEN`, so it asks for the
`checks: read` permission. There's nothing to set up.

## What Workers Builds runs

Both Workers Builds deploy commands call `astroid ship`, so the deploy steps
live in the repository rather than a dashboard field:

- **`astroid ship production`**, on the `deploy/production` build, applies the
  D1 migrations to the production database, then runs `wrangler deploy`.
- **`astroid ship preview`**, on every other branch, applies them to the staging
  database named in the `previews` block, then runs `wrangler preview`, named
  for the branch.

Migrations run first, so new code never meets an old schema.

## Two apps in one repository

A repository can hold more than one Astroid app, such as a marketing site and
an order-ahead app on its own subdomain. They share one pnpm workspace, one
lockfile, and one release. Scaffold the second one into the repository from its
root:

```sh
pnpm create astroid --into workers/order --app
```

`--into` writes only the app's own files at that path, and refuses a path that
already holds files. At the repository root it:

- adds the path to `pnpm-workspace.yaml`'s `packages`, unless a glob such as
  `workers/*` already covers it, and writes the file when the root has none
- adds `dev:order`, `build:order`, `doctor:order`, `ship:order:production`, and
  `ship:order:preview`, each a `pnpm --dir workers/order …` call, and never
  replaces a script the root already has
- writes the `docs/` trio and `.gitignore` only when the root has none. When
  the root's `.gitignore` doesn't keep the app's `.dev.vars` out, the app gets
  its own

It changes nothing else: not the first app's files, not its scripts, and not the
CI workflow. Add the second app's `doctor` and `build` scripts to the workflow
yourself. Run `pnpm install` from the root; one lockfile serves both apps.

### One tag, two projects

Each app is its own Worker, so each is its own Workers Builds project. Create
the second one with the settings `--into` prints:

| Setting                              | Value                               |
| ------------------------------------ | ----------------------------------- |
| Root directory                       | `workers/order`                     |
| Build command                        | `pnpm run build`                    |
| Deploy command                       | `pnpm exec astroid ship production` |
| Non-production branch deploy command | `pnpm exec astroid ship preview`    |
| Production branch                    | `deploy/production`                 |

There's still one release workflow. Every app's `astroid generate` writes the
same `.github/workflows/release.yml` at the repository root, so a tag moves
`deploy/production` once, and both projects deploy from it, in no guaranteed
order.

### Two apps on one database

A repository can run two Workers that bind the same D1 database, such as a
marketing site and an order-ahead app on its own subdomain. Only one of them
owns the schema. Set `deploy.migrations` to `false` in the other app's
`astroid.config.ts`:

```ts
deploy: { platform: "cloudflare", migrations: false },
```

That app's `astroid ship` then skips the migrations step on both targets and
says so, and `astroid deploy` does the same. Remove `migrations_dir` from its
`wrangler.jsonc`: `astroid doctor` fails when an app sets `migrations: false`
but still names a migrations directory, because that means someone expects it
to migrate.

Both apps can't migrate. One release tag deploys both Workers, in no guaranteed
order, and nothing serializes two `wrangler d1 migrations apply` runs against
one ledger. Both can see a migration as pending, and a non-idempotent statement
such as `ALTER TABLE … ADD COLUMN` then fails the second deploy.

The same missing order constrains the schema. A migration the other app's code
depends on must ship in an earlier release than that code. Keep each migration
additive, release it, and only then release the code that reads the new column
or table.

## Why a GitHub App pushes the branch

A repository ruleset keeps everyone off `deploy/production` except the release
workflow. The workflow's own `GITHUB_TOKEN` can't be that exception: its actor
is the GitHub Actions app, and GitHub rejects it as a ruleset bypass actor with
"Actor GitHub Actions integration must be part of the ruleset source or owner
organization." A ruleset that guards the branch blocks `GITHUB_TOKEN` too.

So the workflow mints a token for a GitHub App that you own, with
`actions/create-github-app-token`, and pushes with that. The ruleset names the
app as its only bypass actor. Creating the GitHub release still uses
`GITHUB_TOKEN`.

The workflow reads two values:

- **`RELEASE_APP_ID`**, an Actions variable: the app's App ID.
- **`RELEASE_APP_PRIVATE_KEY`**, an Actions secret: a private key generated for
  the app.

Either can be set on the organization or on the repository. When either is
empty, the release fails at its first step and names both.

## One-time setup

Do this before a site's first release, and before you regenerate an existing
site's `release.yml`. Otherwise its next release fails. The same goes for a
job named `CI`: add one to the site's CI workflow, as
[A release needs a green CI](#a-release-needs-a-green-ci) describes, before you
regenerate.

### Create the GitHub App

One app can serve every site an account owns. In the organization's settings
(or your personal settings, for a user-owned repository), go to **Developer
settings** > **GitHub Apps** > **New GitHub App**, and set:

- **GitHub App name:** any, such as `Example Organization releases`.
- **Homepage URL:** the organization's page, such as
  `https://github.com/example-org`.
- **Webhook:** clear **Active**. The app never receives events.
- **Repository permissions:** **Contents**, **Read and write**, and
  **Workflows**, **Read and write**. GitHub refuses a push by an app when the
  commits it moves the branch across change a file under `.github/workflows/`
  and the app lacks **Workflows**, so a release that changes a workflow would
  fail without it.
- **Where can this GitHub App be installed?:** **Only on this account**.

Create it, then note the **App ID** on its settings page. Under **Private
keys**, select **Generate a private key**, which downloads a `.pem` file.

### Install it and store its credentials

From the app's settings page, select **Install App** and install it on the
site's repository. Then, in a checkout of that repository:

```sh
gh variable set RELEASE_APP_ID --body 123456
gh secret set RELEASE_APP_PRIVATE_KEY < example-org-releases.private-key.pem
rm example-org-releases.private-key.pem
```

To share one app across several sites, set both on the organization instead,
and install the app on each site's repository:

```sh
gh variable set RELEASE_APP_ID --org example-org --visibility selected --repos example-site --body 123456
gh secret set RELEASE_APP_PRIVATE_KEY --org example-org --visibility selected --repos example-site < example-org-releases.private-key.pem
```

### Guard the branch with a ruleset

Add a repository ruleset on `refs/heads/deploy/production` that blocks creating,
updating, deleting, and force-pushing the branch, with the app as its only
bypass actor. Run this in a checkout of the site's repository, with the App ID
from earlier. `gh` fills in `{owner}` and `{repo}` from the checkout.

```sh
app_id=123456
gh api -X POST "repos/{owner}/{repo}/rulesets" --input - <<EOF
{
  "name": "deploy/production",
  "target": "branch",
  "enforcement": "active",
  "conditions": {
    "ref_name": { "include": ["refs/heads/deploy/production"], "exclude": [] }
  },
  "rules": [
    { "type": "creation" },
    { "type": "update" },
    { "type": "deletion" },
    { "type": "non_fast_forward" }
  ],
  "bypass_actors": [
    { "actor_id": $app_id, "actor_type": "Integration", "bypass_mode": "always" }
  ]
}
EOF
```

GitHub accepts the app as a bypass actor only once it's installed on the
repository, so install it first.

Then point the Workers Builds production branch at `deploy/production`, and
tag a release.

### Things to know

- A push by an app token starts workflows, unlike one by `GITHUB_TOKEN`. A
  workflow in the site that runs on every branch push also runs when a release
  moves `deploy/production`.
- Whoever holds the private key can push to any branch of every repository the
  app is installed on, `deploy/production` included. Keep it only in the Actions
  secret, and if it leaks, generate a new one on the app's settings page and
  delete the old one.
- Each repository needs its own ruleset, even when the sites share one app.
