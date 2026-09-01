# Architecture

How __BRAND_NAME__ is put together: what happens to a request, where content
lives, and which pieces are the framework's rather than yours.

> Scaffolded by `create-astroid`. Describe what is TRUE of this site, not what
> Astroid does in general — that is documented at
> <https://docs.astroidjs.org>. The useful content here is the part that would
> surprise someone who knows the framework.

## Request flow

One Worker serves everything: pages, the editor API, and static assets.

```
request → middleware (session, edit mode, rate limits)
        → Astro route
        → Louise primitives (content, media, forms) over D1 / R2 / KV
```

<!-- Anything site-specific in the path: extra middleware, a host check, a
     redirect layer, routes that bypass the editor entirely. -->

## Content model

<!-- The collections this site defines and what each one is for. Note which
     fields are rich text, which are structured, and anything a section depends
     on being present. The schema is generated from astroid.config.ts — link to
     it rather than restating it, and record the REASONING here. -->

## Editing

<!-- Which parts of a page are editable and how they are marked. Sections vs
     inline fields vs settings. If a section is deliberately not editable, that
     is worth a line — the next person will assume it was an oversight. -->

## Auth

<!-- Editors, and customers if this site has them. Astroid ships DB-managed
     editors on one Better Auth instance. If you split it, added a portal, or
     changed the allowlist model, describe it here and record WHY in
     DECISIONS.md. -->

## Bindings

<!-- The bindings in wrangler.jsonc and what each is actually used for. A
     binding whose purpose is not written down is a binding nobody dares remove.

     D1, R2, KV (RL / DRAFTS), and whatever the enabled modules added. -->

## Rendering

<!-- Layouts, the section library, and where site-owned components live. Which
     styling approach, and any deliberate constraint (no client JS on these
     routes, CSP rules that shape what a section may do). -->
