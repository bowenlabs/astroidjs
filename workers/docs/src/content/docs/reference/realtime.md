---
title: Realtime
description: Presence and live editing.
sidebar:
  order: 7
---

`usesRealtime`, `generateAstroidEditSession`, `generateAstroidRealtimeEnv`,
`ASTROID_REALTIME_BINDING`, `ASTROID_EDIT_SESSION_CLASS`,
`ASTROID_REALTIME_MIGRATION_TAG`.

The per-page live editing session (ADR 0002), opt-in via `modules: ["realtime"]`.
Astroid generates the wrangler `durable_objects` binding + migration block, mounts
`realtimeRoute`, and scaffolds the DO subclass—which is scaffold-once because it
imports `cloudflare:workers` and because its `persist` is the seam you tune.

Note `realtimeRoute` comes from `louise-toolkit/realtime`, not `/editor`: it is
the one factory in the route plan that isn't an editor route.
