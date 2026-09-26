---
"astroidjs": patch
"create-astroid": patch
---

Astroid now runs on louise-toolkit 0.32. Before 1.0, a caret range stays within one minor version, so `^0.31.1` couldn't resolve to 0.32.0. `@louise-toolkit/astro` 0.2.6 pins louise-toolkit 0.32.0 exactly, so a new scaffold installed two copies of the toolkit and failed `astro check` in `src/actions/index.ts`.

- `astroidjs`: the `louise-toolkit` peer range is `^0.32.0`.
- `create-astroid`: new scaffolds get `louise-toolkit` `^0.32.0` and `@louise-toolkit/astro` `^0.2.6`.

**What to do:** upgrade `louise-toolkit` to 0.32 and `@louise-toolkit/astro` to 0.2.6 along with this release. louise-toolkit 0.32.0 changes how `embedMany` and `indexContents` batch, and nothing in Astroid calls either one. If your site does, see louise-toolkit's 0.32.0 changelog.
