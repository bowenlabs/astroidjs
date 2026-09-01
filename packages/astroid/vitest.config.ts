import { defineConfig } from "vitest/config";

// Astroid's own suite. Everything under test here is pure Node — the config
// validator, the string generators, and the secret-convention helpers — so
// there's no DOM project (unlike louise, whose Solid client needs happy-dom).
// The `.astro` section library ships as source and is exercised by the scaffold
// smoke test in CI, not here.
//
// There are deliberately NO `louise-toolkit/*` aliases. In the monorepo this file
// carried one per runtime subpath, pointing at `../louise/src`, because the
// package `exports` map only resolves to `dist/` and a fresh clone had nothing
// built. Both halves of that reason are gone: louise-toolkit is an ordinary
// installed dependency here, always present and always built.
//
// Losing the aliases is an upgrade, not a compromise. Aliasing to source meant
// the suite tested symbols that existed in `src/` whether or not they were ever
// re-exported publicly — the exact blindness `scripts/ci/checks/export-map.mjs`
// exists to cover on the louise side. These tests now import astroidjs's
// dependency the way a consumer does, so a subpath that stops resolving fails
// here first.
export default defineConfig({
  test: {
    name: "astroid",
    environment: "node",
    include: ["test/**/*.test.ts"],
  },
});
