---
"astroidjs": minor
"create-astroid": minor
---

A site can credit the agency that built it in the footer, with a `credit` block in `defineAstroid` and the new `<Credit>` component. Sites used to hand-roll this, so the markup, link attributes, and styling drifted from one to the next.

- `credit: { name, href, logo?, rel?, label? }` is optional and has no default, so a site without it renders exactly as before. `defineAstroid` requires an absolute `http` or `https` `href`, and a `logo` that is a root-relative path or an `https` URL.
- `astroidjs/components/Credit.astro` renders "Site by" and the name, small and at 70% of the theme's text color. The mark is a mask filled with the text color, so one single-color SVG works on every theme, and it's hidden from screen readers so the name is read once. It renders nothing without `credit`.
- `create-astroid --credit-name <name> --credit-href <url>` writes the block, and the scaffold's layout renders the credit in a footer when it's set.

**What to do:** nothing, unless you want a credit. To add one to an existing site, set `credit` in `astroid.config.ts` and put `<Credit config={astroidConfig} />` in your footer.
