---
"astroidjs": patch
"create-astroid": patch
---

**Both packages now depend on `louise-toolkit` `^0.31.0`**, and create-astroid on `@louise-toolkit/astro` `^0.2.2`.

Before 1.0, a caret range stays within the same minor version, so `^0.30.1` could never resolve to 0.31. A site that upgraded the toolkit for 0.31's `client/studio-shell` got two copies of it, the site's 0.31.0 and astroidjs's 0.30.1, and a type error wherever the two met (`astroid.config.ts`, the generated `worker.ts`). Upgrade astroidjs alongside the toolkit.
