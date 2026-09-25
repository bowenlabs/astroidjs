---
"create-astroid": patch
---

**The scaffold's CI now runs `astroid doctor`.** `doctor` is also a pnpm built-in, and pnpm runs a built-in before a script of the same name. So the `Doctor` step in the generated `.github/workflows/ci.yml`, `run: pnpm doctor`, ran pnpm's own self-check and passed without ever running `astroid doctor`. On pnpm 10 it printed nothing and exited 0. A stale generated file or a missing binding never failed CI. The step is now `pnpm run doctor`, and the scaffold's README, `docs/RUNBOOK.md`, and post-scaffold help say the same.

**What to do:** in a project you've already scaffolded, change the `Doctor` step in `.github/workflows/ci.yml` from `run: pnpm doctor` to `run: pnpm run doctor`, and run `pnpm run doctor` (or `pnpm exec astroid doctor`) locally too. Expect the first run to report problems a bare `pnpm doctor` has been hiding, such as a generated file that has drifted from `astroid.config.ts`: fix those, usually with `pnpm generate`, before you merge.
