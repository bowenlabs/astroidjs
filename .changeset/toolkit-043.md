---
"astroidjs": minor
"create-astroid": patch
---

Astroid moves to louise-toolkit 0.43 and @louise-toolkit/astro 0.9.0, which are security hardening releases.

- The `louise-toolkit` peer range is `^0.43.0`. `create-astroid`: new scaffolds get `louise-toolkit` `^0.43.0` and `@louise-toolkit/astro` `^0.9.0`.
- The adapter is a minor again, 0.9.0, so a `^0.8` range doesn't float into it and install a second toolkit.
- What 0.43 changes for an Astroid site:
  - **Rate rules match every spelling of a path.** Astroid's default rules (such as the ones for `/api/checkout` and the sign-in endpoints) and a site's own `security.rateRules` now also count a slashed or doubled-slash spelling, such as `POST /api/checkout/`, against the rule for the canonical path. Two upgrade edges follow. A request that had no limit can now get a 429. And because a site's `security.rateRules` come before the defaults and the first match wins, an earlier rule for the canonical path can now claim a spelling that a later rule was written for.
  - **The rich-text sanitizer parses with parse5 and escapes everything it writes.** The pages collection's write hook sanitizes on every save, so editor content saves as before, and hand-written or pasted HTML can change on its next save: character references decode, comments drop, and malformed markup is repaired the way a browser repairs it. The toolkit's 0.43.0 changelog lists every difference.
  - **A customer (portal) auth instance no longer serves `<basePath>/admin/*`.** Astroid's portal never calls those endpoints, so nothing changes for a generated portal. A site that used them sets `customers: { adminEndpoints: true }`.
  - **`resolveCaptcha`** lets a control fail closed when its Turnstile secret can't be read. The studio's sign-in still fails open.

**What to do:**

1. Upgrade `louise-toolkit` to 0.43, `@louise-toolkit/astro` to 0.9.0, and `astroidjs` in the same install. Before 1.0, a caret range stays within one minor version, so a site that bumps only one side installs two copies of the toolkit.
2. Check that `pnpm-lock.yaml` holds one `louise-toolkit` version.
3. If `security.rateRules` has a rule for each spelling of one endpoint, keep only the rule for the canonical path, with no trailing slash.
4. Re-save every page once. Astroid renders stored rich text as it is, so HTML stored before this upgrade isn't covered by the new sanitizer until it's written again. That's `pages.body` and the rich-text fields inside each page's `sections`. The pages collection's write hook sanitizes on every save, with the site's media base, so re-saving each page in the studio is the simplest route. A script that calls `sanitizeRichHtml` directly has to walk `sections` itself and pass the site's media base, or it skips the media check.
