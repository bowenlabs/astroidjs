---
title: PWA
description: Manifest and service-worker generation.
sidebar:
  order: 6
---

`modules: ["pwa"]` plus an optional `pwa` block. Two options matter for an app
that isn't the whole site:

**`offlineFallback`**—the page to serve when a navigation fails offline. Without
it the fallback is the scope root, that is, the _dynamic app shell_, which is exactly
the wrong thing to precache on an auth-gated app: that response carries
`Cache-Control: no-store`, so either nothing is cached and the fallback is empty,
or a signed-in shell is stored and later served to whoever opens the app next.

Point it at a prerendered page with no session-specific markup. It's precached
with the shell—a fallback fetched on demand isn't there when it's needed.

**`emitDir`**—the subdirectory under `public/` to write `sw.js` and the manifest
into. For a PWA on its own subdomain that rewrites to a path prefix
(`studio.example.com/` → `/studio/`, see [Tenancy](#tenancy--serving-examplecom)),
the browser fetches `/sw.js` at _its_ origin root, which rewrites to
`/studio/sw.js`. Emitted at the public root, that's a 404 with nothing to explain
it.

```ts
modules: ["pwa"],
pwa: { scope: "/studio", emitDir: "studio", offlineFallback: "/offline" },
```

`_headers` stays at the public root—Cloudflare only reads it there—but its
stanza moves with the files, so the `no-cache` rule that stops a bad service
worker sticking around still applies.

With `scope` equal to the serving path, **no `Service-Worker-Allowed` header is
needed**: a worker may always control its own directory and below.
