---
"astroidjs": minor
"create-astroid": patch
---

Astroid moves to louise-toolkit 0.36 and @louise-toolkit/astro 0.5. Nothing in the generated trio changes; this release lets a site take the toolkit's new features without installing a second copy of it.

- The `louise-toolkit` peer range is `^0.36.0`. `create-astroid`: new scaffolds get `louise-toolkit` `^0.36.0` and `@louise-toolkit/astro` `^0.5.0`.
- Among what 0.36 adds: `<Form>` posts without its script, `sitemap.xml` and `robots.txt` from the published pages, JSON-LD from settings and commerce, a health scan that crawls the site, and `SquareCatalogItem.images`, which lists every image on a Square item instead of only the primary.

**What to do:**

1. Upgrade `louise-toolkit` to 0.36 and `@louise-toolkit/astro` to 0.5 along with this release. Before 1.0, a caret range stays within one minor version, so a site that bumps only one side installs two copies of the toolkit.
2. Run `astroid generate`, then `astroid doctor`.
3. Read louise-toolkit 0.36's upgrade notes. The ones a site is likely to meet: form validation messages changed, a `number` field in `<Form>` renders as a text input with `inputmode="decimal"`, and the editor's Hepta Slab font token is gone.
