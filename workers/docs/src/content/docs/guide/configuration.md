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
