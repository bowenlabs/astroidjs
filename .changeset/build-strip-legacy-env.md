---
"astroidjs": patch
---

`astroid build` now removes `legacy_env` from the Worker config that `@astrojs/cloudflare` writes. Some adapter versions write `legacy_env: true` from the Wrangler they bundle, and current Wrangler rejects the field, so a Workers Builds deploy running a newer Wrangler failed on the build's own output. `true` was always the default, so removing it changes nothing else.

After a successful `astro build`, it finds the built config the way Wrangler does, through the `configPath` in `.wrangler/deploy/config.json`, falling back to `dist/server/wrangler.json`. It deletes only `legacy_env`, only when present, keeps every other key and the file's indentation, and logs one line when it removes the field. When the file is missing or unreadable, it warns and the build still succeeds. A failed `astro build` keeps its exit code, and its output is left alone.

- `astroidjs` exports `builtWranglerConfigPath`, `stripLegacyEnv`, `ASTROID_BUILT_WRANGLER_CONFIG`, and `WRANGLER_DEPLOY_REDIRECT`.

**What to do:** if your repository deletes `legacy_env` after the build itself, for example with a script run after `build`, you can remove that step. Sites that build with `astroid build` need no other change.
