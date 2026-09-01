---
title: Getting started
description: What Astroid is, when to reach for it, and scaffolding your first site.
sidebar:
  order: 1
---

:::note[Astroid now develops in its own repository]
Astroid moved to [bowenlabs/astroidjs](https://github.com/bowenlabs/astroidjs)
and is no longer built or released from the Louise Toolkit repository. It still
depends on Louise, and that dependency still runs one way, so what follows stays
accurate—but for issues, source, and the changelog, go there.
:::

Louise is the unopinionated toolkit: primitives you assemble yourself. **Astroid**
is the opinionated preset on top—a section library, a theme system, and a single
typed config that generates the Louise wiring a site would otherwise write by hand.

```
Astro        →  renderer / router / build
  Louise     →  unopinionated primitives + framework glue   (louise-toolkit)
    Astroid  →  opinions: theme, sections, config, scaffold  (astroidjs)
```

Dependencies flow one way—`astroidjs` → `louise-toolkit`, never the reverse.

:::caution[Pre-1.0, and moving fast]
Both packages are published (`astroidjs`, `create-astroid`) but pre-1.0. Breaking
changes ship as a **minor** bump, so pin an exact version if you depend on one.
:::

## Which one do I want?

|                                                  | Louise            | Astroid                |
| ------------------------------------------------ | ----------------- | ---------------------- |
| You already have an Astro app                    | ✅ add it         | ❌ scaffolds a new one |
| You want to choose your own schema, routes, auth | ✅                | ❌ it chooses for you  |
| You want a running editable site today           | assembly required | one command            |
| You need a page-builder + section library        | build it          | ships 15 sections      |

If you're adding editing to an app you already have, use [Louise directly](https://docs.louisetoolkit.com/guide/quickstart/).
If you're starting a brand-new site on Cloudflare, start here.

## Scaffold

```sh
pnpm create astroid my-site
```

Every option is prompted for; in a non-TTY each prompt takes its default, so the
command is CI-safe. The target directory must be empty.

```
pnpm create astroid [directory] [options]

  --name <name>         Brand / site name
  --key <slug>          Project key (slug); names the generated bindings
  --archetype <type>    marketing | storefront | wholesale | portfolio
  --color <hex>         Brand color
  --host <domain>       Primary domain, for example, example.com
  --commerce <provider> square | stripe | fourthwall
  --map                 Self-hosted PMTiles/MapLibre location map
  --pwa                 Installable PWA (scoped service worker + manifest)
  --portal              Customer/member portal (a second, isolated auth instance)
  --realtime            Live multi-editor editing (a per-page Durable Object)
```

You get a working floor, not a blank page: an inline-editable home page,
magic-link editor sign-in, the editor drawer wired up, migrations, and a
`wrangler.jsonc` with every binding stubbed.
