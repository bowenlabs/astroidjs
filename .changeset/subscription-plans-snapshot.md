---
"astroidjs": minor
---

Adds `subscriptionPlansSnapshot`, a KV snapshot of a Square account's subscription plans, and `alsoRefresh` on `astroidQueueHandler`, which runs it beside the catalog refresh.

`subscriptionPlansSnapshot({ kv, environment, locationId, ttlSeconds })` returns `read()`, `refresh(config)`, and `get(config, { fallback })` over one KV key, `square:subscription-plans:v1:<environment>:<location>`, which `subscriptionPlansSnapshotKey` builds. The app that runs the commerce pipeline refreshes the snapshot from its queue, and an app under `commerce.pipeline: false` reads the same key from the same namespace. `get` falls back to a live refresh on a miss, returns `fallback` (or `[]`) without Square, and returns `[]` when Square fails, so a product page still renders. The TTL defaults to two hours; under 60 seconds, or a fraction, throws `AstroidUsageError`.

`alsoRefresh` takes named refreshes that run wherever `refreshCatalog` runs, after it returns. A failure is logged as `[<name>] refresh failed: <message>` and never thrown, so it can't send a good catalog refresh into retry.

Nothing changes for an existing site, and the scaffold doesn't set either. If your site keeps its own plans snapshot with a key in the format above, switch to `subscriptionPlansSnapshot` with the same environment and location: the key is identical, so the warm snapshot carries over. Move any refresh you chained inside `refreshCatalog` with its own `.catch` into `alsoRefresh`.
