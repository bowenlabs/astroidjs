---
title: Configuration
description: One typed config that generates the worker, middleware, schema and theme.
sidebar:
  order: 2
---

## One config

The whole shape of the project is one typed file. `astroid generate` turns it
into `src/schema.ts`, `src/worker.ts`, and `src/middleware.ts`.

```ts
import { defineAstroid } from "astroidjs";

export default defineAstroid({
  key: "example",
  archetype: "storefront",
  theme: { name: "Example Organization", colors: { brand: "#5b4bff" } },
  sections: ["hero", "banner", "productGrid", "locationHours", "contact"],
  commerce: { provider: "square" },
  deploy: { platform: "cloudflare" },
});
```

**One brand per project.** Every site Astroid targets serves a single brand from a
single deploy, so the config describes one brand, not an array. What multiplexes
is _editors_ (Louise's org plugin) and _audiences_ (a gated portal beside the
public site).

### Archetypes

`marketing` (the lean brochure floor), `storefront` (DTC shop), `wholesale`
(B2B/private-label), `portfolio` (gallery + client portal). An archetype is a
preset of defaults—which sections are on, which tables exist—that the site
then tunes, not a fork.

### Sections

The editable home page is an ordered list of section types. Astroid ships 15:
`hero`, `featureGrid`, `cta`, `gallery`, `media`, `splitImage`, `steps`, `banner`,
`faq`, `pricingTiers`, `testimonial`, `aboutIntro`, `productGrid`,
`locationHours`, `contact`.

The vocabulary is **derived from the catalog**, so a section name that has no
component is a compile error rather than a page that silently fails to render.

### An app with no editor

Every project is a Louise-edited site unless it says otherwise. An app with no
pages to edit, such as an order-ahead app whose menu comes from Square, sets
`editor: false`:

```ts
export default defineAstroid({
  key: "order",
  archetype: "storefront",
  editor: false,
  theme: { name: "Example Organization", colors: { brand: "#5b4bff" } },
  commerce: { provider: "square", pipeline: false },
  modules: ["pwa"],
  portal: { enabled: true },
  deploy: { platform: "cloudflare", migrations: false },
});
```

Choose it when nothing in the project is edited in place, and its few settings
belong to a site that has an editor. That site stays the only place they're
edited: the app reads them from the site's database, and never writes them.

What the shape drops:

- **The editor.** The generated worker and middleware carry no editor routes,
  no `./auth.js` seam, and no edit mode. The worker keeps the gate, with a
  resolver that never finds an editor, so it refuses everything under
  `/api/louise` except the public status route.
- **The content tables.** `src/schema.ts` emits no `pages` or versions, and no
  framework tables. To read one another app owns, such as `siteSettings`,
  import it from `louise-toolkit/db` where you query it, so drizzle-kit never
  writes a migration for a table this app doesn't own.
- **The editor's bindings.** `wrangler.jsonc` binds no draft buffer, media
  bucket, Images, Workers AI, or vitals dataset, and no mail unless a portal
  sends password resets. `astroid doctor` doesn't ask for them.
- **The editor's crons.** There's no daily health scan, so an app with nothing
  scheduled has no `triggers` and no `scheduled` handler.

What stays: the rate limiter, the CSP, the security headers, the public status
route, and the `portal`, `pwa`, `commerce`, `map`, and `tenancy` modules.
`defineAstroid` refuses every option that configures the editor alongside
`editor: false` (`sections`, `sectionCatalog`, `blockCatalog`, `media`,
`pages`, `settings`, `inquiries: true`, `deploy.mediaBase`, and the `realtime`
and `wholesaleInquiry` modules), rather than accept a setting nothing reads.

The app is API-first. Its web client is the first client of a versioned JSON
API under `/api/v1`, which a native client can later call as well. The
middleware rate-limits every POST under that prefix per client IP, and the
editor's sign-in rules are gone. A route there answers JSON, reads its input
from the body or the URL, and needs no browser-only header.

To take payments without the webhook receiver, queue, and catalog cron, which
the site with the editor runs against the same account, add `pipeline: false`
to `commerce` (see [Commerce](../reference/commerce/)). To share that site's
database, bind it by id and set `deploy.migrations: false`, so only the site
migrates it.

`create-astroid --app` scaffolds the shape: the same template without the
editor's files, plus an app layout, a home screen, and the root of the
`/api/v1` API.

### Business facts

A site's time zone, currency, country, and locale are facts about the business,
and louise-toolkit takes each as a parameter rather than guessing it. State them
once in `business`:

```ts
business: {
  timeZone: "Europe/Berlin", // IANA
  currency: "EUR", // ISO 4217
  country: "DE", // ISO 3166-1 alpha-2
  locale: "de-DE", // BCP 47
},
```

None has a default, since a default would be a guess about someone else's
business, and a wrong one fails quietly: opening hours an hour off, or a charge
in the wrong currency. `commerce` requires `currency`, because every charge and
catalog price uses it. `defineAstroid` validates each fact with `Intl`, and
refuses, for example, a lowercase `"eur"` or an Open Graph `"de_DE"`.

Read them through `astroidBusiness`, and pass them to the toolkit. Name a fact
to get it as a `string`, or an error naming the field when the config doesn't
state it:

```ts
import { astroidBusiness } from "astroidjs";
import { formatMoney } from "louise-toolkit/commerce";
import astroidConfig from "../astroid.config";

const price = formatMoney(
  { amount: 1250, currency: astroidBusiness(astroidConfig, "currency") },
  { locale: astroidBusiness(astroidConfig, "locale") },
);
```

`locale` also sets the scaffold's `<html lang>`, and it's the default for
`seo.locale`, in Open Graph form: `de-DE` gives `og:locale` `de_DE`. Set
`seo.locale` only when the two differ.

`create-astroid` takes them as `--time-zone`, `--currency`, `--country`, and
`--locale`, and prompts for each in a terminal. `--commerce` needs
`--currency`.

### Agency credit

An agency that builds the site can credit itself in the footer. It's a site
fact, so there's no default: without `credit`, nothing renders.

```ts
credit: {
  name: "Example Organization",
  href: "https://example.com",
  logo: "/credit-mark.svg", // optional
  rel: "noopener", // optional; add nofollow if you want it
},
```

The scaffold's layout renders `<Credit config={astroidConfig} />` in a footer
when `credit` is set. A site with its own footer imports it from
`astroidjs/components/Credit.astro` and puts it there. It renders "Site by"
and the name, small and at 70% of the theme's text color, and `label` changes
the words before the name.

The mark is drawn as a mask filled with the text color, so one single-color SVG
matches light, dark, and every theme; its own colors are ignored. It's hidden
from screen readers, which read the name once. `defineAstroid` requires `href`
to be an absolute `http` or `https` URL, and `logo` to be a root-relative path
or an `https` URL.
