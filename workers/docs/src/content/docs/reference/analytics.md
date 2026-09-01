---
title: Analytics
description: Page and event analytics wiring.
sidebar:
  order: 9
---

`ASTROID_VITALS_BINDING`, `astroidVitalsDataset`, `ASTROID_VITALS_SECRET_NAMES`,
`generateAstroidVitalsBeacon`, `generateAstroidCwvQuery`.

Real-visitor Core Web Vitals. The dataset name is derived from the project key so
two Astroid sites on one account don't blend their p75s. The beacon ships as a
**static file** (`public/vitals.js`) rather than an inline script: Astro hashes
processed scripts into `script-src`, and an inline script carrying generated
content can't be hashed, so it would be blocked.

Note `vitalsRoute` comes from `louise-toolkit/analytics`, not `/editor`.
