// @ts-check
import cloudflare from "@astrojs/cloudflare";
import { cacheCloudflare } from "@astrojs/cloudflare/cache";
import solid from "@astrojs/solid-js";
import tailwindcss from "@tailwindcss/vite";
import { ASTROID_VITE_BUILD, astroidSecurity } from "astroidjs/astro";
import { defineConfig } from "astro/config";
import astroidConfig from "./astroid.config.ts";

// SSR (`output: server`) because an app answers per request: its JSON API under
// /api/v1, and pages that read live data. Solid islands for the interactive UI.
// Tailwind v4 + daisyUI drive the theme (src/styles/site.css). Cloudflare
// *bindings* are read via `import { env } from "cloudflare:workers"` (typed in
// src/env.d.ts), so there is no astro:env schema here.
export default defineConfig({
  site: "__SITE_URL__",
  output: "server",
  adapter: cloudflare(),
  integrations: [solid()],
  vite: {
    plugins: [tailwindcss()],
    build: { ...ASTROID_VITE_BUILD },
  },
  // Route caching (ADR 0004). This provider is what turns `Astro.cache.set(...)`
  // into a `Cloudflare-CDN-Cache-Control` header, which the generated worker's
  // `withEdgeCache` layer reads as its "store this" signal and then strips, so
  // Cloudflare's own cookie-blind edge cache never sees it. Nothing is cached
  // unless a route opts in, and a route that reads a signed-in customer never
  // should.
  cache: { provider: cacheCloudflare() },
  // Content-Security-Policy, composed by Astroid from your config: the origins
  // your modules need (a commerce provider's card SDK) plus the hash of Solid's
  // hydration bootstrap. Astro owns `script-src`, so avoid is:inline and
  // define:vars scripts, which can't be hashed and would be blocked. Need
  // another origin? Add it to `security.cspOrigins` in astroid.config.ts.
  security: astroidSecurity(astroidConfig),
});
