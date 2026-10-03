---
"astroidjs": minor
---

**`portalSignOut`, a portal sign-out that only a same-origin POST can trigger.** The portal's session cookie is `SameSite=Lax`, which a browser sends with a top-level GET from any site, so a `/logout` page that signs out on a GET lets any other website sign your users out with a link. Both sites built on the portal shipped one.

`portalSignOut(request, { user, signOut })` in `astroidjs` (and `astroidjs/portal`) decides a logout request and signs out only on a same-origin POST. It returns `{ state, status, cookies }`:

- `signed-out` (200) with no session, or after a same-origin POST, with every expiring cookie in `cookies`, one header each, ready for `redirectWithCookies`;
- `confirm` (200) on a GET, or (403) on a POST from another origin, so the page asks with a form;
- `failed` (503) when the sign-out answers non-OK or throws. The session stays, and it reports `portal.sign-out` through `reportDegraded`.

The scaffold gains two files for a project with a portal:

- `src/portal-auth.ts` exports `signOutPortal(request)`, which calls louise-toolkit 0.41's `auth.api.signOut`.
- `src/pages/logout.astro`, a POST-only sign-out page in the project's layout, for you to restyle.

**What to do:** nothing breaks. A project that already has its own `src/portal-auth.ts` and `/logout` keeps them, because scaffold-once files are never overwritten. To adopt the helper, add `signOutPortal` to your `portal-auth.ts`, call `portalSignOut` from your logout page, and make every Log out control a `<form method="post" action="/logout">`, not a link. If your sign-out page lives somewhere other than `/logout`, `astroid generate` now scaffolds a `src/pages/logout.astro` too: delete it, or point it at your page.
