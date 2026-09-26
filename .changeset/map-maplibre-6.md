---
"astroidjs": minor
"create-astroid": minor
---

The map module moves to MapLibre 6, which fixes a critical XSS advisory in MapLibre's `DOM.sanitize()` (every release through 6.4.0 is affected, and 5.x has no fix).

- `create-astroid --map` now adds `maplibre-gl` `^6.11.2`, up from `^5.9.0`.
- The generated `<MapEmbed>` imports MapLibre's worker with `?worker&url` and passes it to `setWorkerUrl()`. MapLibre 6 looks for its worker next to its own module, which a bundle moves, so without this no tiles load.
- `<MapEmbed>` catches `GPUInitializationError`, which MapLibre 6 throws when WebGL2 is missing, and leaves the placeholder in place.
- The map module no longer adds `worker-src blob:` to the CSP. MapLibre 6 constructs a same-origin worker directly, so `worker-src 'self'` covers it.

**What to do:** `MapEmbed.astro` is scaffolded once and belongs to your site, so this release doesn't change yours. Before you run `astroid generate` with this version, do one of these:

- Move to MapLibre 6: bump `maplibre-gl` to `^6.11.2` and make the same three changes to your `MapEmbed.astro`. Compare against a fresh `create-astroid --map` scaffold, and drop any `.default ?? maplibre` fallback, because MapLibre 6 is ESM-only.
- Stay on MapLibre 5 for now: add `worker: ["blob:"]` to `security.cspOrigins` in `astroid.config.ts`. Without it, the regenerated CSP blocks MapLibre 5's blob: workers and the map renders an empty canvas.
