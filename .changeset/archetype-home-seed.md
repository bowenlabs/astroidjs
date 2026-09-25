---
"astroidjs": minor
"create-astroid": patch
---

**A new project's home page now seeds the sections its archetype lists.** Before, `seed/home.seed.sql` was a fixed template file that seeded the marketing sections (hero, feature grid, call to action) for every archetype. A portfolio's `astroid.config.ts` listed a hero, gallery, about intro, and contact section, but its first page showed a feature grid and a call to action instead.

create-astroid now writes the seed from the config's own `sections`, with sample content for each one. The seed also escapes the brand name, so a name with an apostrophe (`--name "Kai's Bakery"`) no longer produces SQL that fails to run.

astroidjs exports the two functions that build it: `astroidHomeSeedSections(config)` returns the seeded sections, and `generateAstroidHomeSeed(config)` returns the SQL.

**What to do:** nothing for an existing site. A seed runs once against a fresh database, and `astroid generate` never writes one.
