---
"astroidjs": minor
"create-astroid": patch
---

Astroid moves to louise-toolkit 0.42 and @louise-toolkit/astro 0.8.0. Nothing in Astroid's own behavior changes; the toolkit release only adds exports.

- The `louise-toolkit` peer range is `^0.42.0`. `create-astroid`: new scaffolds get `louise-toolkit` `^0.42.0` and `@louise-toolkit/astro` `^0.8.0`.
- The adapter is a minor again, 0.8.0, so a `^0.7` range doesn't float into it and install a second toolkit.
- What 0.42 adds: `louise-toolkit/commerce/square` turns subscription plans into the offers an item gets (`subscriptionOffersFor`, `findSubscriptionOffer`, `templatePhases`, `cadenceLabel`), which pair with Astroid's `subscriptionPlansSnapshot`; and the new `louise-toolkit/client/sign-in` subpath has `SignInLinkForm` and `requestSignInLink`, the sign-in-by-link form.

**What to do:**

1. Upgrade `louise-toolkit` to 0.42, `@louise-toolkit/astro` to 0.8.0, and `astroidjs` in the same install. Before 1.0, a caret range stays within one minor version, so a site that bumps only one side installs two copies of the toolkit.
2. Run `corepack pnpm why louise-toolkit`. More than one version listed means the ranges disagree; align them as in step 1.
