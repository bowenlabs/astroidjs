---
"astroidjs": minor
---

The generated `.github/workflows/release.yml` now moves `deploy/production` with a GitHub App's token instead of the workflow's own `GITHUB_TOKEN`, so a repository ruleset can keep everyone else off the branch. GitHub rejects the GitHub Actions app as a ruleset bypass actor ("Actor GitHub Actions integration must be part of the ruleset source or owner organization"), so a ruleset that guarded `deploy/production` blocked the release workflow too.

- The workflow mints the token with `actions/create-github-app-token`, from the `RELEASE_APP_ID` Actions variable and the `RELEASE_APP_PRIVATE_KEY` Actions secret, which can be set on the organization or the repository. It checks out with that token and pushes with it. Creating the GitHub release still uses `GITHUB_TOKEN`.
- When either value is empty, the release fails at its first step with a message that names both and links the setup.
- `astroidjs` exports `ASTROID_RELEASE_APP_ID_VAR`, `ASTROID_RELEASE_APP_KEY_SECRET`, and `ASTROID_RELEASE_SETUP_URL`.

A push by an app token starts workflows, unlike one by `GITHUB_TOKEN`, so a site workflow that runs on every branch push now also runs when a release moves `deploy/production`.

**What to do:** set up the app, the variable, and the secret **before** you regenerate, or the site's next release fails. `astroid doctor` reports `release.yml` as stale until you regenerate, and that's safe to leave while you set up. The full steps are in the [Releases guide](https://docs.astroidjs.org/guide/releases/):

1. Create a GitHub App owned by the organization or user: clear **Webhook** > **Active**, give it the repository permissions **Contents** and **Workflows**, both **Read and write**, and choose **Only on this account**. **Workflows** is there because GitHub refuses an app's push that moves a branch across a change to `.github/workflows/`, and regenerating `release.yml` is such a change.
2. Install it on the site's repository. Store its App ID as the `RELEASE_APP_ID` variable and a generated private key as the `RELEASE_APP_PRIVATE_KEY` secret.
3. Add a repository ruleset on `refs/heads/deploy/production` with the rules `creation`, `update`, `deletion`, and `non_fast_forward`, whose only bypass actor is `{ "actor_id": <app id>, "actor_type": "Integration", "bypass_mode": "always" }`. The guide has the `gh api -X POST repos/{owner}/{repo}/rulesets` command.
4. Run `astroid generate`, and commit the regenerated `.github/workflows/release.yml`.
