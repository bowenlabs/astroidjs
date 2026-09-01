---
title: Portal
description: The authenticated customer portal.
sidebar:
  order: 5
---

`astroidPortal`, `astroidPortalGuardConfig`, `portalGuard`, `guardResponse`,
`requireCustomer`, `resolvePortalSession`, `isSameOrigin`, `definePortalNav`.

A second Better Auth instance for customers. The mount, cookie prefix, and
`portal_*` table prefix are **fixed, not configurable**—the studio keeps Better
Auth's defaults because the editor client hardcodes them, so the portal is the one
that moves. Two instances sharing a cookie prefix fails intermittently in
production and looks like a session bug.

The guard is fail-closed: a session resolver that throws degrades to _signed out_,
never to signed-in.
