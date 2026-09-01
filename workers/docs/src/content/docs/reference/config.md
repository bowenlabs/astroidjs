---
title: Config
description: The `defineAstroid` config object, field by field.
sidebar:
  order: 1
---

## `defineAstroid(config)`

```ts
function defineAstroid(config: AstroidConfig): AstroidConfig;
```

An identity function in the shape of Astro's `defineConfig`: returns the config
verbatim with full inference, and validates the invariants that would otherwise
fail deep inside generation. Throws [`AstroidConfigError`](#errors) on:

- an empty `key` (it names every generated binding)
- a missing `theme.name` or `theme.colors.brand`
- a commerce provider assigned to a role its client can't serve
- `portal.gated`, which is **not implemented** and refused rather than silently
  wiring no guard

Key types: `AstroidConfig`, `Archetype` (`marketing | storefront | wholesale |
portfolio`), `ModuleKind` (`map | pwa | wholesaleInquiry`), `SectionKind`,
`Theme`, `Portal`, `CommerceConfig`, `SeoConfig`, `SecurityConfig`, `PwaConfig`.

`ASTROID_ARCHETYPE_SECTIONS` maps each archetype to its default home sections.
