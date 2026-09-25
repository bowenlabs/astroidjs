// Copyright (c) 2026 BowenLabs. Astroid is MIT licensed.
//
// The toolkit version ranges create-astroid writes into a new project. A module
// of its own so the test suite can import it without running the scaffolder.

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

/**
 * The `astroidjs` + `louise-toolkit` ranges to write into the scaffold: a caret
 * on the version of each package that create-astroid actually RESOLVED, which is
 * the version the scaffold was built against.
 *
 * DERIVED rather than hard-coded in template/package.json. A literal there is a
 * second place to remember on every release, and when it rots the failure is
 * silent and total: the template imported `astroidjs/astro` while pinning
 * `^0.1.0`, a range whose newest match had no such export, so every scaffolded
 * project died before Astro loaded its config. CI could not see it—the
 * clean-room smoke test pins `astroidjs` to a tarball via pnpm `overrides`,
 * which is exactly what erases the declared range.
 *
 * Always the resolved version, never create-astroid's own DECLARED range. In the
 * monorepo the two were the same thing: `pnpm pack` turned `workspace:*` into an
 * exact version. Once the toolkit moved to another repo, create-astroid declared
 * it as a caret range (`^0.31.0`), and reading that wrote the range's FLOOR
 * rather than the version the generators and the auth migration had just run
 * against. `scripts/ci/checks/scaffold-versions.mjs` holds the scaffold to the
 * resolved version, so the moment a toolkit patch shipped (0.31.1) the two
 * disagreed and the smoke test failed on every PR with no code change.
 *
 * A published `version` is always exact, so the caret goes straight on; there is
 * no range to strip. The floor moves with each patch, which is the point: a new
 * project starts from the newest patch it was built against. Caret on a 0.x is
 * minor-locked (`^0.2.0` := `>=0.2.0 <0.3.0`), which is the behavior we want
 * while the toolkit is pre-1.0 and marks breaking changes as minors: patches
 * flow, a breaking minor does not.
 *
 * @param {(name: string) => string | undefined} [resolveVersion] Reads a
 *   package's installed version. Tests pass their own; the default asks Node.
 * @returns {Record<string, string>} Package name to caret range.
 */
export function toolkitRanges(resolveVersion = installedVersion) {
  /** @type {Record<string, string>} */
  const ranges = {};
  for (const name of ["astroidjs", "louise-toolkit", "@louise-toolkit/astro"]) {
    const version = resolveVersion(name);
    if (!version) {
      throw new Error(
        `create-astroid could not determine the ${name} version to scaffold with. ` +
          "This is a packaging fault — please file an issue rather than editing the scaffold by hand.",
      );
    }
    ranges[name] = `^${version}`;
  }
  return ranges;
}

/**
 * The version of the copy of `name` that create-astroid itself resolves. Rooted
 * at `import.meta.url`, which is already the real path, so it sees the sibling
 * packages pnpm places beside create-astroid rather than guessing at hoisting.
 *
 * @param {string} name
 * @returns {string | undefined}
 */
function installedVersion(name) {
  const req = createRequire(import.meta.url);
  // All three packages export `./package.json`, so this reads the real copy.
  return JSON.parse(readFileSync(req.resolve(`${name}/package.json`), "utf8")).version;
}
