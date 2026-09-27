import { describe, expect, it } from "vitest";
import type { AstroidConfig } from "../src/config.js";
import { ASTROID_GENERATED_FILES, generateAstroidProject } from "../src/project/generate.js";
import * as astroid from "../src/index.js";

const base: AstroidConfig = {
  key: "acme",
  archetype: "marketing",
  theme: { name: "Acme", colors: { brand: "#1f6e6d" } },
};

describe("ASTROID_GENERATED_FILES (#70)", () => {
  it("is exactly what `astroid generate` writes, so a coverage exclude can't miss one", () => {
    const shop: AstroidConfig = {
      ...base,
      archetype: "storefront",
      commerce: { provider: "square" },
    };
    for (const config of [base, shop]) {
      expect(generateAstroidProject(config).map((file) => file.path)).toEqual([
        ...ASTROID_GENERATED_FILES,
      ]);
    }
  });

  it("is exported from the package root, where a site's vitest.config.ts imports it", () => {
    expect(astroid.ASTROID_GENERATED_FILES).toBe(ASTROID_GENERATED_FILES);
  });
});
