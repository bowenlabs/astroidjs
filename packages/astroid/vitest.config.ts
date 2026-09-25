import { defineConfig } from "vitest/config";

// Astroid's own suite. Everything under test here is pure Node—the config
// validator, the string generators, and the secret-convention helpers—so
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
// re-exported publicly—the exact blindness `scripts/ci/checks/export-map.mjs`
// exists to cover on the louise side. These tests now import astroidjs's
// dependency the way a consumer does, so a subpath that stops resolving fails
// here first.
export default defineConfig({
  test: {
    name: "astroid",
    environment: "node",
    include: ["test/**/*.test.ts"],
    // An 80% coverage floor is a house rule across Bowen Labs repos. The kit
    // repos (this one and louise-toolkit) hold a fixed 80%; the sites ratchet
    // up toward it. Only lines and statements are gated. Branches and functions
    // are reported so a drop is visible, but they don't fail the run.
    //
    // `.astro` files are excluded because vitest can't instrument them; the
    // scaffold smoke test in CI exercises the section library instead. The
    // same goes for the Solid `.tsx` components: this suite has no Solid JSX
    // transform and no DOM project, so vitest can't parse them and would only
    // print a stack trace before skipping them anyway.
    coverage: {
      provider: "v8",
      reporter: ["text-summary", "json-summary"],
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/**/*.d.ts", "src/**/*.astro", "src/components/*.tsx"],
      thresholds: { lines: 80, statements: 80 },
    },
  },
});
