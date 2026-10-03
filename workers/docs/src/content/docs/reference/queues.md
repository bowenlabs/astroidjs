---
title: Queues and crons
description: Queue consumers and scheduled crons.
sidebar:
  order: 13
---

`handleWebhook`, `astroidQueueHandler`, `astroidUsesQueues`, `astroidQueueNames`,
`astroidWranglerQueues`, `checkWranglerQueues`, `affectsCatalog`.

`astroidWranglerQueues(wrangler)` reads the commerce queue's names from a
`wrangler.jsonc`: the queue the `COMMERCE_QUEUE` producer sends to, that
queue's `dead_letter_queue`, and every queue the Worker consumes. It's where
the generated worker's dead-letter queue name comes from, so a site's names
never have to match its `key`. `astroidQueueNames(config)` is only the
`<key>-commerce` pair that a new scaffold writes into `wrangler.jsonc`.
`checkWranglerQueues` is the `astroid doctor` check that compares the two files.

`astroidCrons(config)` returns every cron expression the project needs—`ASTROID_HEALTH_CRON` (daily, always) plus `astroidCron(config)` (the hourly
catalog re-sync, commerce only, and not under `commerce.pipeline: false`). Cloudflare fires **one** `scheduled` handler for
all triggers and identifies which by `controller.cron`, so `wrangler.jsonc`'s list
and the handler's dispatch must agree exactly—a string in one and not the other
is a job that silently never runs. Both derive from this function for that reason.

`handleWebhook` verifies the HMAC over the **raw body before anything parses it**—parse first and an unauthenticated caller reaches the JSON parser and everything
downstream. It then enqueues and returns, so the response doesn't wait on the work.

### Refreshes that ride the catalog refresh

`astroidQueueHandler` takes `alsoRefresh`, a record of named refreshes that run
wherever `refreshCatalog` runs: on the periodic refresh, and on a
catalog-affecting webhook from `catalogProvider`, or from any provider when
`catalogProvider` is unset. They run after
`refreshCatalog` returns, in order, and before `onMessage`.

```ts
astroidQueueHandler({
  refreshCatalog: () => refreshCatalogCache(env),
  alsoRefresh: {
    subscriptions: async () => {
      const config = await squareConfig(env);
      if (config) await plans(env).refresh(config);
    },
    feed: () => refreshSocialFeed(env),
  },
});
```

Each failure is reported with `reportDegraded` from `louise-toolkit/errors` as
`queues.alsoRefresh.<name>` (`ASTROID_ALSO_REFRESH_DEGRADED` is the prefix) and
never thrown, so an outage in a side snapshot can't send a good catalog refresh
into retry. `reportDegraded` logs one line,
`[louise] degraded queues.alsoRefresh.<name>: <cause>`, and incident capture
counts it, so a refresh that fails every hour still leaves a record.
When `refreshCatalog` throws, the side refreshes don't run and the message
retries. The scaffold's consumer doesn't set it, because not every store sells
subscriptions. See
[Subscription plans snapshot](/reference/commerce/#subscription-plans-snapshot)
for the snapshot it usually refreshes.
