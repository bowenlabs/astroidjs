---
"astroidjs": minor
---

**`portalSignOut`, a portal sign-out that only a same-origin POST can trigger.** The portal's session cookie is `SameSite=Lax`, which a browser sends with a top-level GET from any site, so a `/logout` page that signs out on a GET lets any other website sign your users out with a link. Both sites built on the portal shipped one.

`portalSignOut(request, { user, signOut })` in `astroidjs` (and `astroidjs/portal`) decides a sign-out request and signs out only on a same-origin POST, by louise-toolkit's strict `isSameOrigin` (a POST with neither `Origin` nor `Referer` doesn't pass). A same-origin POST signs out even when no session resolved, so a failed session lookup can't leave a live cookie behind. It returns `{ state, status, cookies }`:

- `signed-out` (200) after a same-origin POST, with every expiring cookie in `cookies`, one header each, ready for `redirectWithCookies`, or on a GET with no session;
- `confirm` (200) on a GET while signed in, or (403) on any other POST, so the page asks with a form;
- `failed` (503) when the sign-out answers non-OK or throws. The session stays, and it reports `portal.sign-out` through `reportDegraded`.

The scaffold gains two files for a project with a portal:

- `src/portal-auth.ts` exports `signOutPortal(request)`, which calls louise-toolkit 0.41's `auth.api.signOut`.
- `src/pages/logout.astro`, a POST-only sign-out page in the project's layout, for you to restyle.

**What to do:** a project with no portal sees no change. A project with a portal gets `src/pages/logout.astro` on its next `astroid generate`, unless it already has one, because scaffold-once files are written only when missing. Check two things before you run it:

- **The page imports `signOutPortal` from `src/portal-auth.ts`.** A new project's `portal-auth.ts` has it. An existing one isn't rewritten, so add `export async function signOutPortal(request: Request): Promise<Response>` that builds your auth instance for the request's origin and returns `auth.api.signOut({ headers: request.headers, asResponse: true })`. Without it, `astro check` and the build fail on the import.
- **The page answers `/logout`.** If another file already serves that route, such as a `src/pages/logout.ts` endpoint, or your sign-out page lives elsewhere, keep the scaffolded file and have it redirect to your page, or move your logic into it. Deleting it doesn't stick: the next `astroid generate` writes it back.

To adopt the helper in a page of your own, call `portalSignOut` from it and make every Sign out control a `<form method="post" action="/logout">`, not a link.
