---
"astroidjs": minor
---

`astroidjs` exports `ASTROID_GENERATED_FILES`, the paths of the regenerated trio (`src/schema.ts`, `src/worker.ts`, and `src/middleware.ts`), so a site can keep Astroid's generated code out of its test coverage. Those files are Astroid's code, tested here. Counting them in a site's coverage measured Astroid's release notes: a release that added lines to `src/worker.ts` dropped one site under its coverage floor with no change of its own. `generateAstroidProject` writes exactly this list, and a test holds the two together, so a generated file added in a later release joins the list too.

**What to do:** if your site measures coverage, spread the list into `coverage.exclude` in `vitest.config.ts`:

```ts
import { ASTROID_GENERATED_FILES } from "astroidjs";
import { coverageConfigDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: { exclude: [...coverageConfigDefaults.exclude, ...ASTROID_GENERATED_FILES] },
  },
});
```

This usually raises your measured coverage, so a ratchet can move its floor up. A site that already excludes the trio by hand can switch to the list. The CLI guide's "Keep the generated files out of coverage" section has the details.
