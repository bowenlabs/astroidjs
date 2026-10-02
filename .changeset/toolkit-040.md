---
"astroidjs": minor
"create-astroid": patch
---

Astroid moves to louise-toolkit 0.40 and @louise-toolkit/astro 0.6.5. Nothing in the generated trio changes; this release lets a site take the toolkit's new calls without installing a second copy of it.

- The `louise-toolkit` peer range is `^0.40.0`. `create-astroid`: new scaffolds get `louise-toolkit` `^0.40.0` and `@louise-toolkit/astro` `^0.6.5`.
- What 0.40 adds: the Square subscription lifecycle in `louise-toolkit/commerce/square` (`listSubscriptionPlans`, `retrieveSubscription`, `updateSubscription`, `cancelSubscription`, `pauseSubscription`, `resumeSubscription`, order-template `phases` on `createSubscription`, and `state: "DRAFT"` on `createOrder`), and a transactional-mail shell that fits a phone, with a `"logo"` masthead, new theme tokens, and `mailRows`.

**What to do:**

1. Upgrade `louise-toolkit` to 0.40 and `@louise-toolkit/astro` to 0.6.5 along with this release. Before 1.0, a caret range stays within one minor version, so a site that bumps only one side installs two copies of the toolkit.
2. Run `astroid generate`, then `astroid doctor`.
3. Read louise-toolkit 0.40's upgrade notes. The one a site is likely to notice: the mail card is now `width:100%;max-width:600px` instead of a fixed 600px table, so emails fit a phone. Every other default reproduces the previous output, and the subscription calls are additive.
