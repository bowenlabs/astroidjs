import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { astroidBusiness, astroidSeoLocale } from "../src/business.js";
import { type AstroidConfig, type BusinessConfig, defineAstroid } from "../src/config.js";
import { AstroidConfigError } from "../src/errors.js";
import * as entry from "../src/index.js";

const base: AstroidConfig = {
  key: "example",
  archetype: "marketing",
  theme: { name: "Example Organization", colors: { brand: "#5b4bff" } },
};

const facts: BusinessConfig = {
  timeZone: "Europe/Berlin",
  currency: "EUR",
  country: "DE",
  locale: "de-DE",
};

const withBusiness = (business: BusinessConfig, over: Partial<AstroidConfig> = {}) =>
  defineAstroid({ ...base, business, ...over });

describe("defineAstroid business", () => {
  it("accepts a config with no business facts, since none has a default", () => {
    expect(defineAstroid(base).business).toBeUndefined();
  });

  it("accepts valid facts, together or one at a time", () => {
    expect(() => withBusiness(facts)).not.toThrow();
    expect(() => withBusiness({ timeZone: "America/Denver" })).not.toThrow();
    expect(() => withBusiness({ locale: "de" })).not.toThrow();
    expect(() => withBusiness({ timeZone: "UTC" })).not.toThrow();
  });

  it("refuses a time zone Intl doesn't know", () => {
    for (const timeZone of ["Europe/Munich", "GMT+25", ""]) {
      expect(() => withBusiness({ timeZone })).toThrow(/business\.timeZone.*IANA/);
    }
  });

  it("refuses a currency that isn't an uppercase ISO 4217 code", () => {
    for (const currency of ["eur", "EURO", "E", "XYZ", ""]) {
      expect(() => withBusiness({ currency })).toThrow(/business\.currency.*ISO 4217/);
    }
  });

  it("refuses a country that isn't an uppercase ISO 3166-1 alpha-2 code", () => {
    for (const country of ["de", "DEU", "Germany", "XX", ""]) {
      expect(() => withBusiness({ country })).toThrow(/business\.country.*alpha-2/);
    }
  });

  it("refuses an Open Graph locale, pointing at seo.locale", () => {
    expect(() => withBusiness({ locale: "de_DE" })).toThrow(/BCP 47[\s\S]*seo\.locale/);
    expect(() => withBusiness({ locale: "" })).toThrow(/business\.locale/);
  });

  it("refuses a locale that isn't in canonical form, naming the canonical one", () => {
    expect(() => withBusiness({ locale: "de-de" })).toThrow(/"de-DE", not "de-de"/);
  });

  it("throws AstroidConfigError, the class a config error always has", () => {
    expect(() => withBusiness({ currency: "eur" })).toThrow(AstroidConfigError);
  });
});

describe("defineAstroid business with commerce", () => {
  const shop = (business?: BusinessConfig): AstroidConfig => ({
    ...base,
    archetype: "storefront",
    commerce: { provider: "square" },
    ...(business ? { business } : {}),
  });

  it("requires the currency a site charges in, rather than defaulting one", () => {
    expect(() => defineAstroid(shop())).toThrow(/`commerce` needs `business\.currency`/);
    expect(() => defineAstroid(shop({ timeZone: "Europe/Berlin" }))).toThrow(/business\.currency/);
    expect(() => defineAstroid(shop({ currency: "EUR" }))).not.toThrow();
  });

  it("requires it for every provider and role, pay-only included", () => {
    for (const commerce of [
      { provider: "stripe" },
      { storefront: "fourthwall" },
      { provider: "square", pipeline: false },
    ] as const) {
      expect(() => defineAstroid({ ...base, commerce })).toThrow(/business\.currency/);
    }
  });

  it("refuses a currency whose minor units the mirror can't convert", () => {
    // The mirror and the checkout convert by a factor of 100: a 0-digit
    // currency would charge 100 times the price, and a 3-digit one a tenth.
    expect(() => defineAstroid(shop({ currency: "JPY" }))).toThrow(/0 minor-unit digits/);
    expect(() => defineAstroid(shop({ currency: "KWD" }))).toThrow(/3 minor-unit digits/);
    // Without commerce nothing converts, so any currency is fine.
    expect(() => withBusiness({ currency: "JPY" })).not.toThrow();
  });
});

describe("astroidBusiness", () => {
  it("is exported from the package entry, with astroidSeoLocale", () => {
    expect(entry.astroidBusiness).toBe(astroidBusiness);
    expect(entry.astroidSeoLocale).toBe(astroidSeoLocale);
  });

  it("returns every fact, undefined where the config states none", () => {
    expect(astroidBusiness(withBusiness(facts))).toEqual(facts);
    expect(astroidBusiness(base)).toEqual({
      timeZone: undefined,
      currency: undefined,
      country: undefined,
      locale: undefined,
    });
  });

  it("returns one named fact as a string", () => {
    const config = withBusiness(facts);
    expect(astroidBusiness(config, "timeZone")).toBe("Europe/Berlin");
    expect(astroidBusiness(config, "currency")).toBe("EUR");
    expect(astroidBusiness(config, "country")).toBe("DE");
    expect(astroidBusiness(config, "locale")).toBe("de-DE");
  });

  it("throws naming the field when a named fact is missing", () => {
    expect(() => astroidBusiness(base, "timeZone")).toThrow(AstroidConfigError);
    expect(() => astroidBusiness(base, "timeZone")).toThrow(/`business\.timeZone`/);
    expect(() => astroidBusiness(withBusiness({ currency: "EUR" }), "country")).toThrow(
      /`business\.country`/,
    );
  });
});

describe("astroidSeoLocale", () => {
  it("derives the Open Graph locale from business.locale", () => {
    expect(astroidSeoLocale(withBusiness({ locale: "de-DE" }))).toBe("de_DE");
    expect(astroidSeoLocale(withBusiness({ locale: "zh-Hant-TW" }))).toBe("zh_TW");
  });

  it("prefers seo.locale when the config sets it", () => {
    const config = withBusiness({ locale: "de-DE" }, { seo: { locale: "de_AT" } });
    expect(astroidSeoLocale(config)).toBe("de_AT");
    expect(astroidSeoLocale({ seo: { locale: "fr_FR" } })).toBe("fr_FR");
  });

  it("gives none rather than guessing a territory", () => {
    expect(astroidSeoLocale(base)).toBeUndefined();
    expect(astroidSeoLocale(withBusiness({ locale: "de" }))).toBeUndefined();
    expect(astroidSeoLocale({ seo: { locale: "  " } })).toBeUndefined();
  });
});

describe("the scaffold's layouts", () => {
  const layouts = ["template/src/layouts/Site.astro", "template/_app/src/layouts/App.astro"].map(
    (path) => readFileSync(new URL(`../../create-astroid/${path}`, import.meta.url), "utf8"),
  );

  it("take the page language and og:locale from the config", () => {
    for (const layout of layouts) {
      expect(layout).toContain("astroidBusiness(astroidConfig).locale");
      expect(layout).toContain("<html lang={lang}");
      expect(layout).toContain("locale={astroidSeoLocale(astroidConfig)}");
      expect(layout).not.toContain("astroidConfig.seo?.locale");
    }
  });
});
