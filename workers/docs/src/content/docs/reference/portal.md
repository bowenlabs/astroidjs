---
title: Portal
description: The authenticated customer portal.
sidebar:
  order: 5
---

`astroidPortal`, `astroidPortalGuardConfig`, `portalGuard`, `guardResponse`,
`requireCustomer`, `resolvePortalSession`, `isSameOrigin`, `portalSignOut`,
`definePortalNav`.

A second Better Auth instance for customers. The mount, cookie prefix, and
`portal_*` table prefix are **fixed, not configurable**—the studio keeps Better
Auth's defaults because the editor client hardcodes them, so the portal is the one
that moves. Two instances sharing a cookie prefix fails intermittently in
production and looks like a session bug.

The guard is fail-closed: a session resolver that throws degrades to _signed out_,
never to signed-in.

## Signing out

Ending a session is a write. The portal's session cookie is `SameSite=Lax`,
which a browser sends with a top-level GET from any site, so a `/logout` that
signs out on a GET lets any other website sign your users out with a link.
`portalSignOut` signs out only on a same-origin POST:

```astro
---
import { portalSignOut } from "astroidjs";
import { redirectWithCookies } from "louise-toolkit/auth";
import { signOutPortal } from "../portal-auth.js";

const result = await portalSignOut(Astro.request, {
  user: Astro.locals.portalUser,
  signOut: signOutPortal,
});
if (result.state === "signed-out") return redirectWithCookies(result.cookies, "/");
Astro.response.status = result.status;
---
<form method="post" action="/logout"><button>Sign out</button></form>
```

| Request                                 | `state`                      | `status` |
| --------------------------------------- | ---------------------------- | -------- |
| A same-origin POST                      | `signed-out`, with `cookies` | 200      |
| A same-origin POST whose sign-out fails | `failed`                     | 503      |
| A GET, with no session                  | `signed-out`                 | 200      |
| A GET while signed in                   | `confirm`                    | 200      |
| Any other POST while signed in          | `confirm`                    | 403      |

- **Same-origin** is louise-toolkit's `isSameOrigin`, the strict one: a POST
  with neither `Origin` nor `Referer` doesn't pass. The portal's own
  `isSameOrigin`, which `requireCustomer` uses, lets that request through.
- **A same-origin POST always signs out,** even with no session resolved. A
  session lookup that failed reads as signed out, and Better Auth's sign-out
  expires the cookies whether or not it finds a session.
- `cookies` holds every `Set-Cookie` the sign-out expired, one header each.
  Pass it to `redirectWithCookies`, or append each `cookies.getSetCookie()`
  entry to the page's response.
- A failed sign-out leaves the session alone and calls `reportDegraded` with
  `portal.sign-out`.
- `signOut` receives the request, so the auth instance can be built for its
  origin. The scaffolded `src/portal-auth.ts` exports `signOutPortal`, which
  calls `auth.api.signOut` (louise-toolkit 0.41).

A project with a portal gets `src/pages/logout.astro` scaffolded once, in its
own layout, for you to restyle. Make every Sign out control a
`<form method="post" action="/logout">`. A link only ever reaches the
`confirm` state. The page imports `signOutPortal(request: Request): Promise<Response>`
from `src/portal-auth.ts`, so a project with its own `portal-auth.ts` adds
that export before it runs `astroid generate`.
