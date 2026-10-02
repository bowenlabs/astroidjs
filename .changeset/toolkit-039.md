---
"astroidjs": minor
"create-astroid": patch
---

Astroid moves to louise-toolkit 0.39 and @louise-toolkit/astro 0.6.4. Nothing in the generated trio changes; this release lets a site take the toolkit's fixes without installing a second copy of it.

- The `louise-toolkit` peer range is `^0.39.0`. `create-astroid`: new scaffolds get `louise-toolkit` `^0.39.0` and `@louise-toolkit/astro` `^0.6.4`.
- 0.39 carries the unpublished 0.38 as well. Among what the two add: the rich-text format bubble floats over the selection again and a field edited on the page keeps its element's type (louise-toolkit#761); `checkoutSession` and `cartFingerprint` in `louise-toolkit/commerce`, so a retried payment keeps its idempotency key; `parseWeekday` in `louise-toolkit/dates`; and a Square catalog price keeps the currency Square sends instead of a `"USD"` label, `null` when it sends none.

**What to do:**

1. Upgrade `louise-toolkit` to 0.39 and `@louise-toolkit/astro` to 0.6.4 along with this release. Before 1.0, a caret range stays within one minor version, so a site that bumps only one side installs two copies of the toolkit.
2. Run `astroid generate`, then `astroid doctor`.
3. Read louise-toolkit 0.38's and 0.39's upgrade notes. The ones a site is likely to meet: `SquareVariation.currency` is now `string | null`, so a site that passes it on as a `string` gets a type error at each place and fills a missing currency from its settings (`price.currency ?? siteCurrency`), which Astroid's catalog adapters already do through their `currency` option; a site rule on `.louise-prose-surface` for a field edited on the page, or a child rule from `.louise-format-bubble` to the toolbar, stops matching, and the 0.39 changelog names the remedies.
