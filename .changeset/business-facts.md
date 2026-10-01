---
"astroidjs": minor
"create-astroid": minor
---

A site's time zone, currency, country, and locale now have a place in `astroid.config.ts`: `business: { timeZone, currency, country, locale }`. louise-toolkit takes each as a parameter (`louise-toolkit/dates` needs a time zone, `formatMoney` a currency and a locale, the Square wallet sheet a country and a currency), and with nowhere to state them, each site restated them as literals and the checkout scaffold charged in one hard-coded currency.

- **`defineAstroid` validates them with `Intl`:** an IANA time zone, an uppercase ISO 4217 currency, an uppercase ISO 3166-1 alpha-2 country, and a BCP 47 locale in canonical form (`de-DE`, not `de-de` or the Open Graph `de_DE`). None has a default, because a default would be a guess about the business.
- **`astroidBusiness(config)`** returns the four facts, each `undefined` where the config states none. `astroidBusiness(config, "currency")` returns one as a `string`, or throws an `AstroidConfigError` naming `business.currency` when it's missing.
- **`astroidSeoLocale(config)`** returns `seo.locale`, or `business.locale` in Open Graph form when `seo.locale` is unset, so a site states its locale once. A locale with no region gives no `og:locale`.
- **The catalog adapters take a `currency` option.** `squareToCatalogItem`, `fourthwallToCatalogItem`, and `catalogNormalizer(provider, { currency })` use it for a price the provider sent without a currency. Without the option, that variant's `currency` is now `null` instead of `"USD"`. A default remains upstream: louise-toolkit's Square and Fourthwall readers still label a price without a currency `"USD"` before it reaches these adapters, so for items read through louise-toolkit the option applies only once louise-toolkit drops that default. `catalogNormalizer` now returns a one-argument function, so it's safe to pass to `Array.map`.
- **The generated checkout route charges in `business.currency`**, read from the config at request time, instead of a `"USD"` literal.
- **The scaffold's layouts** set `<html lang>` from `business.locale` (English until it's set) and pass `astroidSeoLocale(astroidConfig)` to `<Seo>`.
- **`create-astroid` takes `--time-zone`, `--currency`, `--country`, and `--locale`**, and prompts for each in a terminal. A blank answer, and every answer in a non-TTY, leaves the fact out, so a scaffold without them is unchanged. `--commerce` needs `--currency`.

**Breaking: `commerce` requires `business.currency`.** A config with `commerce` and no currency now fails `defineAstroid`, and so does a currency with other than 2 minor-unit digits (such as `JPY`), because the catalog mirror and the checkout convert prices by a factor of 100. To upgrade a commerce site, add `business: { currency: "<your ISO 4217 code>" }` to `astroid.config.ts`. The config loads at build time and in the Worker, so a missing currency fails the build rather than a live checkout.

The checkout route and the layouts are scaffold-once, so an existing project applies those parts by hand: in `src/pages/api/checkout.ts`, import `astroidBusiness` from `astroidjs` and replace the currency literal with `astroidBusiness(astroidConfig, "currency")`; in `src/layouts/Site.astro`, or `src/layouts/App.astro` in an app scaffolded with `--app`, pass `astroidSeoLocale(astroidConfig)` to `<Seo locale>` and set `<html lang>` from `astroidBusiness(astroidConfig).locale`. If you call the catalog adapters and depended on the `"USD"` fallback, pass `{ currency }` from `astroidBusiness(astroidConfig)`.
