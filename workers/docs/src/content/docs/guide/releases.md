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
each tag it does three things:

1. Checks that the tag is `v<major>.<minor>.<patch>` and sits on `main` or a
   `release/` branch.
1. Force-pushes the tagged commit to `deploy/production`. Workers Builds deploys
   that branch to production.
1. Creates a GitHub release with generated notes.

Nobody commits to `deploy/production`. It's a tag carried as a branch, because
Workers Builds deploys branch pushes and can't watch tags. To roll back, tag the
earlier commit with the next patch version.

The workflow holds no Cloudflare credential. `astroid doctor` fails when the
file is missing or stale, so a hand edit can't quietly change which commits
reach production.

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
site's `release.yml`. Otherwise its next release fails.

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
