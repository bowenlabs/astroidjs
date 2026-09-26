---
"astroidjs": patch
"create-astroid": patch
---

Astroid now runs on louise-toolkit 0.33. Before 1.0, a caret range stays within one minor version, so `^0.31.1` couldn't resolve to a newer minor. `@louise-toolkit/astro` pins `louise-toolkit` exactly, so a new scaffold installed two copies of the toolkit and failed `astro check` in `src/actions/index.ts`.

- `astroidjs`: the `louise-toolkit` peer range is `^0.33.0`.
- `create-astroid`: new scaffolds get `louise-toolkit` `^0.33.0` and `@louise-toolkit/astro` `^0.2.7`.

**What to do:** upgrade `louise-toolkit` to 0.33 and `@louise-toolkit/astro` to 0.2.7 along with this release. Neither toolkit release needs a code change for Astroid itself. Check their changelogs for your site's own code: 0.32.0 changes how `embedMany` and `indexContents` batch, and 0.33.0 adds `formatMoney`, `parseMoney`, and a D1 migration check, all opt-in.
