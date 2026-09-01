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
