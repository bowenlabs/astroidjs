// @ts-check
import starlight from "@astrojs/starlight";
import { defineConfig, passthroughImageService } from "astro/config";

// The Astroid documentation, as a standalone STATIC Astro app. `astro build`
// emits a plain static site to dist/ — no adapter, default `output: "static"` —
// so it can be served by any static host or folded into a Worker's assets.
//
// Deliberately separate from the Louise docs rather than a section inside them.
// The two projects release independently now, and a shared docs site would mean a
// docs deploy every time either one shipped. Cross-references between the two go
// out as absolute links; see `LOUISE_DOCS` below.
export default defineConfig({
  site: "https://docs.astroidjs.com",
  // The only raster-free asset here is an SVG logo, so use the passthrough image
  // service and skip the heavy `sharp` native dependency entirely.
  image: { service: passthroughImageService() },
  // No splash page: the docs home is where a reader actually starts.
  redirects: { "/": "/guide/getting-started/" },
  integrations: [
    starlight({
      title: "Astroid",
      description:
        "The opinionated meta-framework over Louise Toolkit and Astro — one typed config generates the worker, middleware, schema and theme for an editable site on Cloudflare Workers.",
      social: [
        {
          icon: "github",
          label: "GitHub",
          href: "https://github.com/bowenlabs/astroidjs",
        },
      ],
      editLink: {
        baseUrl: "https://github.com/bowenlabs/astroidjs/edit/main/workers/docs/",
      },
      sidebar: [
        { label: "Guide", items: [{ autogenerate: { directory: "guide" } }] },
        { label: "Reference", items: [{ autogenerate: { directory: "reference" } }] },
      ],
      customCss: ["./src/styles/docs.css"],
    }),
  ],
});
