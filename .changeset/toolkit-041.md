---
"astroidjs": minor
"create-astroid": minor
---

Astroid moves to louise-toolkit 0.41 and @louise-toolkit/astro 0.7.0, and new projects need Better Auth 1.7.7 or later.

- The `louise-toolkit` peer range is `^0.41.0`. `create-astroid`: new scaffolds get `louise-toolkit` `^0.41.0`, `@louise-toolkit/astro` `^0.7.0`, and `better-auth` and `@better-auth/passkey` `^1.7.7`, the release that fixes [GHSA-965c-763c-88jm](https://github.com/better-auth/better-auth/security/advisories/GHSA-965c-763c-88jm). The toolkit's peer range is `^1.7.7` too.
- The adapter is a minor this time, 0.7.0, so a `^0.6` range doesn't float into it and install a second toolkit, as 0.6.5 did to `create-astroid` 0.13.0.
- **Better Auth's rate limiter is on** for every `getLouiseAuth` instance off `localhost`, keyed on `CF-Connecting-IP`. A burst of sign-in requests from one address gets a 429. Turn on the `authRateLimit` module so it counts in a Durable Object rather than KV or isolate memory.
- **`getLouiseAuth` turns off Better Auth 1.7.7's runtime schema check**, which ran on every request because the factory builds an instance per request. A site that already moved to Better Auth 1.7.7 under toolkit 0.40 stops paying for it.
- **Customers can sign in by magic link** with `customers.signIn: "magic-link"` on a portal's `getLouiseAuth`. Nothing changes unless a site sets it.
- Code that builds a `LouiseAuth`, `SquareOrder`, or `SquarePayment` by hand, such as a test stub, needs the new fields: `api.signOut`, `tenders` and `netAmountDueMoney`, and `createdAt`. The toolkit's 0.41.0 changelog lists each.

**What to do:**

1. Upgrade `louise-toolkit` to 0.41, `@louise-toolkit/astro` to 0.7.0, `better-auth` and `@better-auth/passkey` to 1.7.7 or later, and `astroidjs`, in the same install. Before 1.0, a caret range stays within one minor version, so a site that bumps only one side installs two copies of the toolkit.
2. Run `corepack pnpm why louise-toolkit`. More than one version listed means the ranges disagree; align them as in step 1.
3. Run `astroid generate`, then `astroid doctor`.
