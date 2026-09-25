---
"astroidjs": minor
---

**`louise-toolkit` is now a peer dependency of `astroidjs`, not a dependency.** astroidjs uses your site's own copy of the toolkit instead of bringing its own.

Before 1.0, a caret range stays within the same minor version (`^0.30.1` means `<0.31.0`). As a regular dependency, that meant a site upgrading the toolkit to a new minor before astroidjs widened its range got two copies: its own and astroidjs's older one. `astro check` then failed wherever the two met (`astroid.config.ts`, the generated `worker.ts`), and the site couldn't upgrade until astroidjs released.

As a peer, there's only ever one copy, the site's. A toolkit version outside astroidjs's declared range is a pnpm peer warning (`Issues with peer dependencies found`), not a second install, so a site can take a new toolkit minor straight away.

**What to do:** nothing, if your site already lists `louise-toolkit` in its own `dependencies`. Every project create-astroid scaffolds does. If it doesn't, add it: `pnpm add louise-toolkit`. pnpm and npm 7+ install a missing required peer automatically, but listing it makes the version your choice.
