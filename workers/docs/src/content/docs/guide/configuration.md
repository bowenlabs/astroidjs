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
  key: "coracle",
  archetype: "storefront",
  theme: { name: "Coracle Coffee", colors: { brand: "#1f6f78" } },
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
