---
"astroidjs": minor
---

A site can serve `contact`, `login`, or `work` as a page with `pages.allowSlugs`. They're reserved because a new scaffold, or a portfolio, has a file route there, but a site without that file serves the path from its own catch-all route, and the Pages route refused every write that included the slug. An owner couldn't change the page's title or SEO in the Pages panel.

- `pages: { allowSlugs: ["contact"] }` in `defineAstroid` drops the slug from `astroidReservedSlugs`, so `astroidPagesWriteHooks` and the Pages route accept it.
- `defineAstroid` accepts only the slugs reserved for a scaffolded file route, exported as `ASTROID_SCAFFOLD_ROUTE_SLUGS`. Allowing `api` or `sitemap.xml` throws, because the platform serves those paths before any page, so a page there would be unreachable.

**What to do:** if your site has a page at `/contact`, `/login`, or `/work` and no file route of that name, add the slug to `pages.allowSlugs`. The generated worker reads the config at runtime, so nothing needs regenerating.
