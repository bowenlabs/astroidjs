---
"astroidjs": patch
---

The generated worker takes the commerce queue's dead-letter queue name from `wrangler.jsonc`, and `astroid doctor` reports a mismatch.

The worker told a dead-letter batch from an ordinary one by comparing `batch.queue` with `<key>-commerce-dlq`, a name restated from the project key. On a site whose queues predate its `key`, the names differed, so no dead letter was ever recorded, and a site that consumed its dead-letter queue ran each dead letter through the main handler again.

Now `astroid generate` reads the name from `wrangler.jsonc`: the `dead_letter_queue` of the consumer for the queue the `COMMERCE_QUEUE` producer sends to. When that consumer names no dead-letter queue, the worker sends every batch through `processBatch`. The `<key>-commerce` names stay the defaults that `create-astroid` writes into a new site's `wrangler.jsonc`, so a fresh scaffold is unchanged.

`astroid doctor` now reports:

- An error when `src/worker.ts` captures dead letters from a different queue than `wrangler.jsonc` routes them to.
- A warning when the dead-letter queue has no consumer, and when the commerce queue names no dead-letter queue.

After upgrading, run `astroid generate` (or `astroid build`, which runs it) and commit the regenerated `src/worker.ts`. Nothing changes for a site whose queues are named `<key>-commerce` and `<key>-commerce-dlq`. For a site whose names differ, `src/worker.ts` changes, and `astroid doctor` fails until you regenerate it. If `doctor` warns that the dead-letter queue has no consumer, add the consumer it prints to `queues.consumers` in `wrangler.jsonc`.

`generateAstroidProject` and `generateAstroidWorker` take a new optional second argument, and `astroidWranglerQueues` and `checkWranglerQueues` are new exports.
