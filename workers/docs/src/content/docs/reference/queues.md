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
