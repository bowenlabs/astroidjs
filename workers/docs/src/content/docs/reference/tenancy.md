---
title: Tenancy
description: Serving many hostnames from one deployment.
sidebar:
  order: 4
---

```ts
tenancy: {
  hostPattern: "*.example.com",
  reserved: ["www", "studio", "api"],
  rewritePrefix: "/t",          // default
},
hosts: ["example.com"],          // required — see below
```

Serves **scoped views of this brand's data**, narrowed by host: a per-merchant
storefront, a per-client gallery. Same theme, same catalog, same editors. It is
the portal's _audiences_ axis one step further out, not multi-brand—a second
brand is still a second project.

`acme.example.com/prints` renders `/t/acme/prints`, so the pages live under
`src/pages/t/[tenant]/`. **The visitor's URL never changes**—it's an internal
rewrite, not a redirect, so links built from `Astro.url` stay public and correct.

**The apex must be in `hosts`.** A wildcard route does not match its own apex, so
without it `example.com` returns 404 the moment tenancy is switched on—a symptom that
reads as unrelated to the feature that caused it. `defineAstroid` refuses the
combination rather than letting you find out on deploy.

The wildcard is emitted as a **zone route** (`{ pattern, zone_name }`), never
`custom_domain: true`—Cloudflare refuses a wildcard custom domain, which is
precisely why `hosts` can't express this. `zone` defaults to the pattern minus
`*.`; set it explicitly for a deeper pattern, since `*.shop.example.com` is served
by the `example.com` zone.

## What Astroid does and doesn't decide

Astroid provides only what a site can't provide for itself: the wildcard Worker
route, and the wiring inside the single middleware file Astro permits. `reserved`
labels skip the lookup entirely and render the ordinary site.

**Everything that decides anything is yours**, in the scaffold-once
`src/tenancy.ts`:

```ts
export async function resolveTenant(label: string): Promise<Tenant | null> {
  // your lookup, your caching
  return { slug: label };
}
```

This runs on every request to a tenant host, so an uncached database lookup here
is a query per request.

**An unknown subdomain is a decision, not a default.** Returning `null` falls
through to the ordinary site—meaning a stranger who points a CNAME at you gets
your homepage. If that's wrong for the project, return `null` and refuse it in the
middleware's `guard` with a 404.

`tenantLabel(host, tenancy)` is exported and pure, so a site can unit-test its own
reserved list without standing up a request. It returns `null` for the apex, an
off-pattern host (a preview domain, `localhost`), a reserved label, and a dotted
label—Cloudflare's wildcard matches one level, and a dotted slug would put a
`/` in the rewrite path.
