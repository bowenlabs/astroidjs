// Copyright (c) 2026 BowenLabs. Astroid is MIT licensed.
//
// The toolkit ranges create-astroid writes into a new project. They must be a
// caret on the version create-astroid RESOLVED, which is what
// `scripts/ci/checks/scaffold-versions.mjs` asserts in the smoke test. Reading
// create-astroid's own declared range instead wrote `^0.31.0` while the install
// had resolved 0.31.1, and the smoke test failed on every PR the moment that
// patch shipped.

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { toolkitRanges } from "../../create-astroid/toolkit-ranges.mjs";

const CREATE_ASTROID = new URL("../../create-astroid/", import.meta.url);
const declared = (
  JSON.parse(readFileSync(new URL("package.json", CREATE_ASTROID), "utf8")) as {
    dependencies: Record<string, string>;
  }
).dependencies;

describe("toolkitRanges", () => {
  it("carets the resolved version, not create-astroid's declared range", () => {
    // The day a toolkit patch ships: create-astroid still declares the old
    // floor, and an install resolves the patch one above it.
    const floor = declared["louise-toolkit"]?.match(/^\^(\d+)\.(\d+)\.(\d+)$/);
    expect(floor, "create-astroid declares louise-toolkit as ^x.y.z").toBeTruthy();
    const [, major, minor, patch] = floor as RegExpMatchArray;
    const next = `${major}.${minor}.${Number(patch) + 1}`;
    const resolved: Record<string, string> = {
      astroidjs: "0.13.0",
      "louise-toolkit": next,
      "@louise-toolkit/astro": "0.2.3",
    };
    expect(toolkitRanges((name) => resolved[name])).toEqual({
      astroidjs: "^0.13.0",
      "louise-toolkit": `^${next}`,
      "@louise-toolkit/astro": "^0.2.3",
    });
  });

  it("fails loudly, naming the package, when a version can't be determined", () => {
    expect(() =>
      toolkitRanges((name) => (name === "@louise-toolkit/astro" ? undefined : "1.0.0")),
    ).toThrow(/@louise-toolkit\/astro version/);
  });

  it("resolves all three packages from create-astroid's own directory by default", () => {
    // The same question scaffold-versions.mjs asks, asked the same way.
    const req = createRequire(new URL("index.mjs", CREATE_ASTROID));
    const ranges = toolkitRanges();
    for (const name of ["astroidjs", "louise-toolkit", "@louise-toolkit/astro"]) {
      const { version } = JSON.parse(readFileSync(req.resolve(`${name}/package.json`), "utf8")) as {
        version: string;
      };
      expect(ranges[name]).toBe(`^${version}`);
    }
  });
});
