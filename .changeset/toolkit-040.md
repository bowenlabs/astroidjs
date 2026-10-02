---
"astroidjs": minor
"create-astroid": patch
---

Astroid moves to louise-toolkit 0.40 and @louise-toolkit/astro 0.6.5. Nothing in the generated trio changes. The release fixes new projects: `create-astroid` 0.13.0 scaffolds a project that installs two copies of the toolkit and fails `astro check`.

- The `louise-toolkit` peer range is `^0.40.0`. `create-astroid`: new scaffolds get `louise-toolkit` `^0.40.0` and `@louise-toolkit/astro` `^0.6.5`.
- Why now: @louise-toolkit/astro pins louise-toolkit to one exact version, and its patch 0.6.5 moved that pin from 0.39.0 to 0.40.0. A project that declares `@louise-toolkit/astro` `^0.6.4` and `louise-toolkit` `^0.39.0` resolves 0.6.5 on a fresh install, so 0.6.5 brings its own louise-toolkit 0.40.0 beside the project's 0.39. The two copies' types don't match, and `astro check` stops at `config: pagesCollection` in `src/content.config.ts` with "Types have separate declarations of a private property 'checks'". An existing project whose lockfile still holds 0.6.4 keeps working until it updates or reinstalls without that lockfile.
- 0.40 adds to the toolkit without breaking anything. `louise-toolkit/commerce/square` covers the Square subscription lifecycle: list plans, then retrieve, update, cancel, pause, and resume a subscription. The transactional-mail shell fits a phone, so every email Astroid sends through it does too: the card is fluid up to 600px rather than a fixed 600px table. The shell can also draw a logo masthead (`masthead: "logo"` with `logo`). `astroidMailTheme()` doesn't take those two as overrides yet, but it returns a plain `MailTheme`, so spread it and set them.

**What to do:**

1. Upgrade `louise-toolkit` to 0.40 and `@louise-toolkit/astro` to 0.6.5 along with this release, in the same install. Before 1.0, a caret range stays within one minor version, so a site that bumps only one side installs two copies of the toolkit.
2. If `astro check` reports "separate declarations of a private property", run `corepack pnpm why louise-toolkit`. More than one version listed means the two ranges disagree. Align them as in step 1.
3. Run `astroid generate`, then `astroid doctor`.
