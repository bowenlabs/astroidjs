---
title: Sections
description: The section library and the components that render it.
sidebar:
  order: 2
---

```ts
import { astroidSectionCatalog, isRenderableSection } from "astroidjs/components/sections";
```

`astroidSectionCatalog` is schema only—the same object drives the on-canvas
editor and the write-time validator, so a field can't be editable-but-invalid.
`SectionKind` is **derived** from its keys, which is what makes a section name
with no component a compile error.

Helpers for writing a section component: `field`, `setting`, `list`, `itemField`,
`mediaAlt`, `mediaCaption`, `colorwayClass`, `alignClass`. Token maps
`COLORWAY_CLASS` / `ALIGN_CLASS` are the site-owned half of the contract—Louise
stores `_settings.colorway = "brand"` and never learns what it renders as.

## Components

Imported from `astroidjs/components/*.astro`:

`<Editable>`, `<Section>`, `<Sections>`, `<Seo>`, `<StructuredData>`,
`<MediaSlot>`, `<JustifiedGallery>`, `<PortalShell>`, `<StageBar>`,
`<RegisterSW>`, plus the 15 section components under `components/sections/`.

## `<MediaSlot>`

The responsive image. Wraps [`cfImageSrcset`](https://docs.louisetoolkit.com/reference/media/) so a site never
hand-rolls `srcset` math.

```astro
<MediaSlot
  src={item.url}
  alt="Harbor Blend, bagged"
  width={400}
  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
  ratio="4/3"
/>
```

| Prop                           |                                                                                                                                                                                                                                                                    |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **`sizes`**                    | How wide the image renders at each breakpoint. **The highest-leverage prop here.** It defaults to the 1× `width`, which is right for a fixed placement and wrong for a fluid one—and getting it wrong is how a "responsive" image ends up slower than a fixed one. |
| **`alt`** _(required)_         | `""` is a legitimate value for a decorative image, and the correct one. What must never happen is the attribute going missing, which makes assistive tech read the filename aloud.                                                                                 |
| **`loading`** / **`priority`** | `lazy` by default. **Set `eager` and `priority` above the fold**—lazy-loading the LCP image delays it by a full network round-trip after layout, which is a self-inflicted Core Web Vitals failure.                                                                |
| `width`                        | The largest width in CSS px at 1×. Drives the ladder; not a hard render width. Default 1200.                                                                                                                                                                       |
| `ratio`                        | `"16/9"`—reserves the box, which is what keeps a gallery from shifting as it loads, and derives each derivative's height so the crop matches what's shown.                                                                                                         |
| `focal` / `zoom`               | Render-time framing (`object-position` / scale) for when `gravity: auto` picks wrong. Deliberately **not** a second CDN derivative of the same source—same bytes, different framing.                                                                               |
| `shape` / `size`               | `"circle"` uses a square focal crop at 2×; `size` is the rendered diameter (default 96).                                                                                                                                                                           |
| `fit` / `gravity` / `quality`  | Passed through to the transform. Defaults `cover` / `auto` / 82.                                                                                                                                                                                                   |
| `caption`                      | Renders `<figure>`/`<figcaption>` instead of a bare `<img>`.                                                                                                                                                                                                       |

## `<JustifiedGallery>`

A flexbox justified-rows gallery. Its layout is **two-layer, and both layers
matter**:

1. **SSR floor**—each tile's `flex-grow`/`flex-basis` come from the recorded
   dimensions in the media registry, so rows are roughly right in the HTML before
   any JavaScript runs.
2. **Client refinement**—once true dimensions are known, the rows are
   re-justified precisely.

Without recorded dimensions the SSR layer falls back to a default aspect, so the
first paint is less accurate—another reason `mediaMeta` is worth threading.

| Prop           |                                                                                                                                   |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `items`        | `GalleryItem[]`—`src`, `alt`, and ideally `width`/`height` from the registry.                                                     |
| `targetHeight` | Row height to aim for, px. Default 260.                                                                                           |
| `gap`          | Tile gap, px. Default 8.                                                                                                          |
| `reveal`       | Fade/rise tiles in on scroll. Default `true`, and **inert under `prefers-reduced-motion`**—you don't need to disable it yourself. |

Tiles render through `<MediaSlot>` with `sizes` computed per tile, so the gallery
inherits the derivative behaviour above.
