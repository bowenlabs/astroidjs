import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { type AstroidConfig, type CreditConfig, defineAstroid } from "../src/config.js";

const base: AstroidConfig = {
  key: "example",
  archetype: "marketing",
  theme: { name: "Example Organization", colors: { brand: "#5b4bff" } },
};

const withCredit = (credit: Partial<CreditConfig>) =>
  defineAstroid({
    ...base,
    credit: { name: "Example Organization", href: "https://example.com", ...credit },
  });

describe("defineAstroid credit", () => {
  it("accepts a config with no credit, since a credit is a site fact", () => {
    expect(defineAstroid(base).credit).toBeUndefined();
  });

  it("accepts a name and an absolute link, with or without a mark and rel", () => {
    expect(() => withCredit({})).not.toThrow();
    expect(() => withCredit({ logo: "/credit-mark.svg", rel: "noopener nofollow" })).not.toThrow();
    expect(() => withCredit({ logo: "https://example.com/mark.svg" })).not.toThrow();
    expect(() => withCredit({ href: "http://example.com/" })).not.toThrow();
  });

  it("refuses an empty name", () => {
    expect(() => withCredit({ name: "  " })).toThrow(/credit\.name/);
  });

  it("refuses a link that isn't an absolute http(s) URL", () => {
    // A relative link would point at a page on the client's own site, and a
    // `javascript:` one is never a credit.
    for (const href of ["example.com", "/about", "javascript:alert(1)", "mailto:a@example.com"]) {
      expect(() => withCredit({ href })).toThrow(/credit\.href/);
    }
  });

  it("refuses a mark that isn't root-relative or https", () => {
    // The mark lands in a CSS `url()`: a relative path resolves against each
    // page, and a protocol-relative or `data:` one isn't a file the site ships.
    for (const logo of ["credit-mark.svg", "//cdn.example.com/m.svg", "data:image/svg+xml,x"]) {
      expect(() => withCredit({ logo })).toThrow(/credit\.logo/);
    }
  });
});

describe("the scaffold's footer", () => {
  const layout = readFileSync(
    new URL("../../create-astroid/template/src/layouts/Site.astro", import.meta.url),
    "utf8",
  );

  it("renders <Credit> only when the config sets a credit", () => {
    // Without the guard, a scaffold with no credit would render an empty
    // <footer>. A site without `credit` should render as it did before.
    expect(layout).toMatch(
      /astroidConfig\.credit && \(\s*<footer[\s\S]*<Credit config=\{astroidConfig\} \/>/,
    );
  });
});
