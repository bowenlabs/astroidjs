// Copyright (c) 2026 BowenLabs. Astroid is MIT licensed.
//
// The site's business facts: its time zone, currency, country, and locale.
//
// louise-toolkit takes each of these as a parameter and never guesses one
// (`louise-toolkit/dates` needs a time zone, `formatMoney` a currency and a
// locale, the Square wallet sheet a country and a currency). Without a place in
// the config to state them, every site restated them as literals, file by file,
// and Astroid's own commerce scaffold assumed one currency. They live here once.
//
// None has a default. A default time zone or currency is a guess about someone
// else's business, and a wrong one fails quietly: an opening-hours badge that's
// an hour off, or a charge in the wrong currency. So a fact is required where
// Astroid reads it (`commerce` needs `currency`), and otherwise absent until
// the site states it.
//
// Validation uses `Intl`, and only its accept-or-throw answer, never its
// canonical spelling of a zone. `defineAstroid` also runs inside the Worker, so
// a check that depended on one ICU build's aliases could pass at build time and
// throw at runtime.

import type { AstroidConfig, BusinessConfig } from "./config.js";
import { astroidCommerceProviders } from "./commerce/roles.js";
import { AstroidConfigError } from "./errors.js";

/** One business fact's name, as `business.<fact>` in the config. */
export type AstroidBusinessFact = keyof BusinessConfig;

/**
 * The site's business facts, as stated in `business`. Each is `undefined`
 * until the site states it, because none has a default.
 */
export type AstroidBusiness = Readonly<BusinessConfig>;

/**
 * Read the site's business facts, to pass to the louise-toolkit functions that
 * take them as parameters.
 *
 * ```ts
 * import { astroidBusiness } from "astroidjs";
 * import { formatMoney } from "louise-toolkit/commerce";
 * import astroidConfig from "../astroid.config";
 *
 * const { currency, locale } = astroidBusiness(astroidConfig);
 * ```
 *
 * Pass a fact's name to get that one as a `string`, or an
 * `AstroidConfigError` naming the field when the config doesn't state it.
 * Generated code uses this form, so a missing fact fails with the field to
 * add rather than as `undefined` deep inside a provider call:
 *
 * ```ts
 * const currency = astroidBusiness(astroidConfig, "currency");
 * ```
 */
export function astroidBusiness(config: Pick<AstroidConfig, "business">): AstroidBusiness;
export function astroidBusiness(
  config: Pick<AstroidConfig, "business">,
  fact: AstroidBusinessFact,
): string;
export function astroidBusiness(
  config: Pick<AstroidConfig, "business">,
  fact?: AstroidBusinessFact,
): AstroidBusiness | string {
  const business: AstroidBusiness = {
    timeZone: config.business?.timeZone,
    currency: config.business?.currency,
    country: config.business?.country,
    locale: config.business?.locale,
  };
  if (fact === undefined) return business;
  const value = business[fact];
  if (!value) {
    throw new AstroidConfigError(
      `This site needs \`business.${fact}\` in astroid.config.ts, for example ` +
        `${FACT_EXAMPLES[fact]}. It's a fact about the business, so Astroid doesn't guess it.`,
    );
  }
  return value;
}

/**
 * The Open Graph locale: `seo.locale` when the config sets it, otherwise
 * `business.locale` in Open Graph form (`de-DE` becomes `de_DE`).
 *
 * `undefined` when neither gives one, including a `business.locale` with no
 * region, such as `de`: Open Graph wants a language and a territory, and
 * choosing a territory for a language is a guess.
 */
export function astroidSeoLocale(
  config: Pick<AstroidConfig, "seo" | "business">,
): string | undefined {
  const explicit = config.seo?.locale?.trim();
  if (explicit) return explicit;
  const locale = config.business?.locale;
  if (!locale) return undefined;
  try {
    const { language, region } = new Intl.Locale(locale);
    return region ? `${language}_${region}` : undefined;
  } catch {
    // `defineAstroid` refuses an invalid locale; a config that skipped it
    // gets no `og:locale` rather than a malformed one.
    return undefined;
  }
}

/** An example value for each fact, used in error messages. */
const FACT_EXAMPLES: Record<AstroidBusinessFact, string> = {
  timeZone: '`"Europe/Berlin"`',
  currency: '`"EUR"`',
  country: '`"DE"`',
  locale: '`"de-DE"`',
};

/**
 * The minor-unit digits the catalog mirror and the checkout scaffold assume.
 * Both convert between major and minor units by a factor of 100, so a currency
 * with 0 or 3 digits would charge 100 times too much, or a tenth of the price.
 */
const COMMERCE_CURRENCY_DIGITS = 2;

/** Whether `Intl` accepts `timeZone` as an IANA time zone. */
function isTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat(undefined, { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** Whether `code` is an ISO 4217 currency this runtime knows. */
function isCurrency(code: string): boolean {
  if (!/^[A-Z]{3}$/.test(code)) return false;
  // Absent on an older runtime; the format check above still stands.
  if (typeof Intl.supportedValuesOf !== "function") return true;
  return Intl.supportedValuesOf("currency").includes(code);
}

/** Whether `code` is an ISO 3166-1 alpha-2 region this runtime knows. */
function isCountry(code: string): boolean {
  if (!/^[A-Z]{2}$/.test(code)) return false;
  if (typeof Intl.DisplayNames !== "function") return true;
  // With `fallback: "code"`, a region `Intl` doesn't know comes back unchanged.
  return new Intl.DisplayNames(undefined, { type: "region", fallback: "code" }).of(code) !== code;
}

/** The canonical BCP 47 form of `locale`, or null when it isn't a locale. */
function canonicalLocale(locale: string): string | null {
  try {
    return Intl.getCanonicalLocales(locale)[0] ?? null;
  } catch {
    return null;
  }
}

/**
 * Validate `business`, and require the facts the rest of the config reads.
 *
 * Each check names the field and an example, because the value came from a
 * person typing it: a lowercase `"eur"`, an Open Graph `"de_DE"`, or a zone
 * that doesn't exist, such as `"Europe/Munich"`. Each fails here rather than
 * inside a provider call.
 */
export function assertBusiness(config: AstroidConfig): void {
  const business = config.business ?? {};

  const { timeZone, currency, country, locale } = business;
  if (timeZone !== undefined && !isTimeZone(timeZone)) {
    throw new AstroidConfigError(
      `\`business.timeZone\` must be an IANA time zone, such as "Europe/Berlin", but it's "${timeZone}".`,
    );
  }
  if (currency !== undefined && !isCurrency(currency)) {
    throw new AstroidConfigError(
      `\`business.currency\` must be an uppercase ISO 4217 code, such as "EUR", but it's "${currency}".`,
    );
  }
  if (country !== undefined && !isCountry(country)) {
    throw new AstroidConfigError(
      `\`business.country\` must be an uppercase ISO 3166-1 alpha-2 code, such as "DE", ` +
        `but it's "${country}".`,
    );
  }
  if (locale !== undefined) {
    const canonical = canonicalLocale(locale);
    if (canonical === null) {
      throw new AstroidConfigError(
        `\`business.locale\` must be a BCP 47 language tag, such as "de-DE", but it's "${locale}". ` +
          "An Open Graph locale such as `de_DE` goes in `seo.locale`, and Astroid derives it " +
          "from `business.locale` when that's unset.",
      );
    }
    if (canonical !== locale) {
      throw new AstroidConfigError(
        `\`business.locale\` must be written in canonical form: "${canonical}", not "${locale}".`,
      );
    }
  }

  if (astroidCommerceProviders(config.commerce).length === 0) return;

  // Every commerce path reads the currency: the checkout's charge, and the
  // catalog adapters for a price the provider sent without one.
  if (!currency) {
    throw new AstroidConfigError(
      "`commerce` needs `business.currency`, the ISO 4217 code the site charges in, such as " +
        "\"EUR\". It's a fact about the business, so Astroid doesn't default it.",
    );
  }
  const digits = new Intl.NumberFormat(undefined, { style: "currency", currency }).resolvedOptions()
    .maximumFractionDigits;
  if (digits !== COMMERCE_CURRENCY_DIGITS) {
    throw new AstroidConfigError(
      `\`business.currency\` "${currency}" has ${digits} minor-unit digits, and Astroid's catalog ` +
        "mirror and checkout convert prices by a factor of 100, so they'd charge the wrong " +
        "amount. Commerce supports only currencies with 2 minor-unit digits for now.",
    );
  }
}
