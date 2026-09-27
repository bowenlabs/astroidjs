---
"astroidjs": patch
---

`astroid generate` writes a scaffolded migration where Wrangler applies it. The catalog, page redirects, and alt text migrations always went to `migrations/`, so a site whose `DB` binding sets another `migrations_dir` got files that never ran, and the generated routes then queried a `page_redirects` table that didn't exist.

- A scaffolded migration goes into the `DB` binding's `migrations_dir`, or `migrations` when the binding sets none.
- It keeps its default number when that number is free and past the site's newest migration. Otherwise it takes the next number, so it never shares a number with the site's own migration and never sorts before one that already ran.
- A migration the site already has under any number, matched by the name after the number, isn't written again. `astroid doctor` checks for it the same way.
- `resolveAstroidScaffoldPaths` and `astroidMigrationsDir` are exported, and `ScaffoldFile` has a new `migration` flag.

**What to do:** on a site with its own `migrations_dir`, delete the `migrations/0004_page_redirects.sql` and `migrations/0005_media_alt_undecided.sql` that 0.18.0 wrote, and run `astroid generate` again. The two migrations land in your directory, and `astroid ship` applies them. A site that uses the default `migrations` directory has nothing to do.
