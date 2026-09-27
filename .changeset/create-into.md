---
"create-astroid": minor
---

`create-astroid --into <path>` scaffolds one app into a repository that already holds one, for example `--into workers/order --app` beside a marketing site. Before, a second app meant scaffolding into a temporary directory and moving files by hand: deleting the second workspace file and workflow, merging dependencies, and writing root scripts.

- It writes only the app's own files at the path, and refuses a path that already holds files or lies outside the repository.
- It adds the path to the root `pnpm-workspace.yaml`'s `packages`, unless a glob already covers it. It writes that file when the root has none.
- It adds `dev:<name>`, `build:<name>`, `doctor:<name>`, `ship:<name>:production`, and `ship:<name>:preview` root scripts, each a `pnpm --dir <path> …` call, and never replaces an existing script.
- It writes the `docs/` trio and `.gitignore` at the root only when the root has none. The app gets its own `.gitignore` only when the root's doesn't keep its `.dev.vars` out.
- It prints the app's Workers Builds project settings, since a second app is a second project.
- It leaves the first app's files, its scripts, and the CI workflow unchanged.

**What to do:** nothing unless you want it. Running without `--into` scaffolds a whole repository, as before.
