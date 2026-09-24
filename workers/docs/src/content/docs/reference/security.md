---
title: Security
description: Content Security Policy and rate rules.
sidebar:
  order: 11
---

`astroidSecurity` (the Astro integration config), `astroidCspOrigins`,
`astroidRateRules`, `solidHydrationHash`.

The CSP has no `'unsafe-inline'` or `'unsafe-eval'` in `script-src`. Origins for
enabled modules are merged automatically.

## The editor API gate

Every generated site runs louise-toolkit's deny-by-default gate (ADR 0012). The
generated `worker.ts` passes `gate: { resolveEditor }` to `composeWorker`, and
the generated `middleware.ts` passes `apiGate: true` to
`createLouiseMiddleware`. Under `/api/louise`, a request must come from a
signed-in editor unless it's headed for a public route: the contact form and
the vitals beacon mark themselves. Each editor route still checks for itself;
the gate catches one that forgets.

If you add a route under `/api/louise` that must answer without an editor
session, such as a webhook receiver, mark it with `publicRoute(…)` in the
worker, or list its path in the middleware's `apiGate: { isPublic }`.
Otherwise it returns 401.

New projects also set the `global_fetch_strictly_public` compatibility flag,
so a fetch to the site's own zone goes through Cloudflare's WAF like any other
request. `wrangler.jsonc` is scaffold-once, so an existing project adds the flag
by hand. The daily health scan crawls the site itself: if it starts reporting
broken links that aren't broken, a zone rule is challenging the crawler.
