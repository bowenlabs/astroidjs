import { describe, expect, it } from "vitest";
import { type AstroidConfig, defineAstroid } from "../src/config.js";
import { AstroidConfigError } from "../src/errors.js";

// `security.imageProxies` names the paths where a site mounts an image resize
// proxy, so `astroidRateRules` can give each a GET rule. A path the rule could
// never match would leave the proxy unlimited without a word, so
// `defineAstroid` refuses one.
const base: AstroidConfig = {
  key: "acme",
  archetype: "marketing",
  theme: { name: "Acme", colors: { brand: "#000000" } },
};

const withProxies = (imageProxies: string[]) =>
  defineAstroid({ ...base, security: { imageProxies } });

describe("security.imageProxies", () => {
  it("accepts absolute paths", () => {
    expect(() => withProxies(["/api/img/square", "/api/img"])).not.toThrow();
  });

  it("refuses a path a rule could never match", () => {
    for (const path of ["api/img", "/", "/api/img/", ""]) {
      expect(() => withProxies([path]), path).toThrow(AstroidConfigError);
    }
  });

  it("refuses a path listed twice", () => {
    expect(() => withProxies(["/api/img", "/api/img"])).toThrow(/twice/);
  });

  it("is allowed on an app with no editor", () => {
    expect(() =>
      defineAstroid({ ...base, editor: false, security: { imageProxies: ["/api/img/square"] } }),
    ).not.toThrow();
  });
});
