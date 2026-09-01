---
title: Queues and crons
description: Queue consumers and scheduled crons.
sidebar:
  order: 13
---

`handleWebhook`, `astroidQueueHandler`, `astroidUsesQueues`, `astroidQueueNames`,
`affectsCatalog`.

`astroidCrons(config)` returns every cron expression the project needs—`ASTROID_HEALTH_CRON` (daily, always) plus `astroidCron(config)` (the hourly
catalog re-sync, commerce only). Cloudflare fires **one** `scheduled` handler for
all triggers and identifies which by `controller.cron`, so `wrangler.jsonc`'s list
and the handler's dispatch must agree exactly—a string in one and not the other
is a job that silently never runs. Both derive from this function for that reason.

`handleWebhook` verifies the HMAC over the **raw body before anything parses it**—parse first and an unauthenticated caller reaches the JSON parser and everything
downstream. It then enqueues and returns, so the response doesn't wait on the work.
