---
title: Config
description: The `defineAstroid` config object, field by field.
sidebar:
  order: 1
---

## `defineAstroid(config)`

```ts
function defineAstroid(config: AstroidConfig): AstroidConfig;
```

An identity function in the shape of Astro's `defineConfig`: returns the config
verbatim with full inference, and validates the invariants that would otherwise
fail deep inside generation. Throws [`AstroidConfigError`](#errors) on:

- an empty `key` (it names every generated binding)
- a missing `theme.name` or `theme.colors.brand`
- a commerce provider assigned to a role its client can't serve
- `portal.gated`, which is **not implemented** and refused rather than silently
  wiring no guard
- `editor: false` alongside an option that configures the editor, such as
  `sections`, `media`, `settings`, or the `realtime` module
- a `credit` with no `name`, an `href` that isn't an absolute `http` or `https` URL, or
  a `logo` that isn't a root-relative path or an `https` URL
- a `business` fact that `Intl` doesn't accept: a time zone that isn't IANA, a
  currency that isn't an uppercase ISO 4217 code, a country that isn't an
  uppercase ISO 3166-1 alpha-2 code, or a locale that isn't a BCP 47 tag in
  canonical form
- `commerce` without `business.currency`, or with a currency whose minor units
  aren't 2 digits

Key types: `AstroidConfig`, `Archetype` (`marketing | storefront | wholesale |
portfolio`), `ModuleKind` (`map | pwa | wholesaleInquiry`), `SectionKind`,
`Theme`, `Portal`, `CommerceConfig`, `BusinessConfig`, `CreditConfig`, `SeoConfig`, `SecurityConfig`, `PwaConfig`.

`ASTROID_ARCHETYPE_SECTIONS` maps each archetype to its default home sections.

## `business`

```ts
interface BusinessConfig {
  timeZone?: string; // IANA, for example, "Europe/Berlin"
  currency?: string; // ISO 4217, for example, "EUR"
  country?: string; // ISO 3166-1 alpha-2, for example, "DE"
  locale?: string; // BCP 47, for example, "de-DE"
}
```

The facts louise-toolkit takes as parameters: `louise-toolkit/dates` needs the
time zone, `formatMoney` the currency and locale, and the Square wallet sheet
the country and currency. None has a default. `commerce` requires `currency`,
and the others stay unset until the site states them.

## `astroidBusiness(config, fact?)`

```ts
function astroidBusiness(config: AstroidConfig): AstroidBusiness;
function astroidBusiness(config: AstroidConfig, fact: AstroidBusinessFact): string;
```

With no `fact`, returns all four, each `undefined` where the config states
none. With a `fact`, such as `"currency"`, returns it as a `string`, or throws
an `AstroidConfigError` that names `business.<fact>` when it's missing.
Generated code uses the second form.

## `astroidSeoLocale(config)`

Returns `seo.locale` when it's set, and otherwise `business.locale` in Open
Graph form: `de-DE` becomes `de_DE`. Returns `undefined` for a locale with no
region, such as `de`, rather than choosing a territory. The scaffold's layouts
pass it to `<Seo>`.

## Other exports

`astroidHasEditor(config)` reports whether the project has a Louise editor,
which is true unless the config sets `editor: false`. `ASTROID_API_PREFIX` is
`/api/v1`, the prefix an editor-free app's rate rule covers.
