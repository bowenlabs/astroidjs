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
pnpm doctor     # astroid doctor  — validate config, bindings, generated files
pnpm generate   # astroid generate — rewrite the generated trio
wrangler deploy # or: astroid deploy (plan-first provisioning)
```

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
