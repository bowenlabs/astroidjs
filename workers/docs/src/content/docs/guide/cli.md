---
title: The CLI
description: "`astroid generate`, `doctor`, `dev`, `build` and `deploy`—and what each one is allowed to overwrite."
sidebar:
  order: 3
---

## The CLI

```sh
pnpm dev        # astroid dev     — regenerate, then astro dev
pnpm build      # astroid build   — regenerate, then astro build
pnpm run doctor # astroid doctor  — validate config, bindings, generated files
pnpm generate   # astroid generate — rewrite the generated trio
wrangler deploy # or: astroid deploy (plan-first provisioning)
```

Call `doctor` through `pnpm run`. pnpm has a built-in `doctor` command, and a
built-in takes precedence over a script of the same name, so a bare `pnpm doctor`
runs pnpm's own self-check and exits 0 without ever running Astroid's. The same
applies to any script named after a pnpm command, such as `audit`, `outdated`, or
`why`.

### Generated vs. scaffold-once

This distinction is the one worth internalising:

- **Generated**—`src/schema.ts`, `src/worker.ts`, `src/middleware.ts`. A pure
  function of your config, rewritten on every `generate`, and they carry a
  do-not-hand-edit banner. `doctor` fails if one has drifted.
- **Scaffold-once**—`wrangler.jsonc`, `src/auth.ts`, `src/queue.ts`,
  `src/portal-auth.ts`, the service worker, the map embed. Written when absent and
  never overwritten, because each exists to be edited. `wrangler.jsonc` is in this
  set specifically so a provisioned binding id is never clobbered.

Switching a module on later is a config edit plus `astroid generate`—it writes
whatever scaffold-once files the new module needs and leaves your existing ones
alone.
