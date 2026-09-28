---
"astroidjs": minor
"create-astroid": patch
---

The generated `.github/workflows/release.yml` now releases only a commit whose `CI` check passed. A tag used to move `deploy/production` whatever CI said, so a commit that failed CI, or never ran it, could reach production.

- A new step, **Check that CI passed**, runs after the tag check and before the push. It reads the latest check run named `CI` from GitHub Actions on the tagged commit.
- When `CI` passed, the release goes ahead. When it ended any other way, the release fails, naming the result and linking the run.
- When `CI` is queued or running, the release waits for it, checking every 20 seconds for up to 30 minutes, and fails if it still hasn't finished. Releases already run one at a time, in the `release` concurrency group.
- When the commit has no `CI` run, the release fails. It waits instead while the commit's other GitHub Actions jobs are still running, because GitHub creates an aggregator job's check run only once the jobs it needs finish.
- The workflow's `permissions` add `checks: read`.

A new project's `.github/workflows/ci.yml` has an aggregator job named `CI` that needs `build`, and it runs on pushes to `release/**` as well as `main`.

**What to do:** before you regenerate, give the site's CI workflow a job named `CI` that runs on pushes to `main` and `release/**`. The house pattern is an aggregator that needs every other job, with `if: always()`, and passes only when they all succeeded. The [Releases guide](https://docs.astroidjs.org/guide/releases/#a-release-needs-a-green-ci) has one to copy. Then run `astroid generate` and commit the regenerated `release.yml`. Without a `CI` job, every release fails with "has no CI run". `astroid doctor` reports `release.yml` as stale until you regenerate.
