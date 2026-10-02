---
"astroidjs": minor
"create-astroid": minor
---

A new `authRateLimit` module gives Better Auth's rate limiter a Durable Object to count in: `modules: ["authRateLimit"]`, or `--auth-rate-limit` in `create-astroid`. louise-toolkit turns the limiter on for every `getLouiseAuth` instance off localhost, and without a Durable Object it counts in KV or in each isolate's memory, both of which undercount under a burst.

The module scaffolds `src/auth-rate-limiter.ts` (an `AuthRateLimitDO` class over `createRateLimiter` from `louise-toolkit/security`) and re-exports the class from the generated `src/worker.ts`. A new scaffold also gets the `AUTH_RATE_LIMIT` binding, its migration (tag `auth-rate-limit-v1`), the env type, and `rateLimitDo: env.AUTH_RATE_LIMIT` in its auth seams. An app with `editor: false` can use it only with its portal on.

**Upgrading:** nothing changes unless you turn the module on. In an existing project, `astroid generate` writes the class and the re-export; `wrangler.jsonc` and the auth seams are scaffold-once, so `astroid doctor` then fails until you add the binding, append the migration to the end of `migrations`, and pass `rateLimitDo` to each `getLouiseAuth` call. The modules guide lists each line.

When a project has both Durable Object modules, the generated `wrangler.jsonc` now writes their bindings and migrations as one list each, with the realtime module's first. A project that turned on `authRateLimit` before `realtime` must keep its own order instead, since wrangler applies only the migrations after the last tag it has applied.
