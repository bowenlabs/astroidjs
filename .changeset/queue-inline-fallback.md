---
"astroidjs": minor
---

Every queue producer can now run on a staging Preview, and the queue owns retries.

**`astroidQueue(queue, handler)`** returns the queue binding when it's bound, and otherwise a stand-in producer that runs `handler` on each message in the request. A Preview leaves the queue unbound, because a queue consumer can't target one, so any route that sent straight to `COMMERCE_QUEUE` (a checkout's follow-up work, a second webhook receiver) threw there. It's typed structurally like `QueueProducer`, so a real `Queue<T>` satisfies it. Running inline lasts only as long as the request, with no retry and no dead-letter queue, so it's a Preview fallback, not a production path.

- The scaffolded `src/queue.ts` exports `commerceQueue(env)`, built on `astroidQueue` with the consumer's own `handleQueueMessage`.
- The scaffolded webhook receiver passes `queue: commerceQueue(env)` instead of `queue` plus `inline`. On a Preview, a processed event now answers 202 rather than 200, and a failure still answers 503. `handleWebhook`'s `inline` option still works for sites that use it.

**Retries (#61).** The consumer seam used to advise Square sites to pass `retry: { attempts: 3 }` to the client, while the queue redelivered up to 5 times with no delay: up to 24 Square calls for one message, with no wait between deliveries. The seam now says to leave client retries off and let the queue retry. The generated `wrangler.jsonc` consumer sets `"retry_delay": 30`, which a new `queues.retryDelay` option changes, and `ASTROID_QUEUE_RETRY_DELAY` exports the default. A consumer that sets its own delay per message, as louise-toolkit's `processBatch` will once its backoff ships, overrides it.

**What to do:** `src/queue.ts`, the webhook receivers, and `wrangler.jsonc` are scaffolded once, so existing sites don't get these changes automatically.

1. Add `commerceQueue` to `src/queue.ts`:

   ```ts
   import { astroidQueue } from "astroidjs";

   export function commerceQueue(env: CloudflareEnv) {
     return astroidQueue(env.COMMERCE_QUEUE, (message) => handleQueueMessage(env, message));
   }
   ```

2. Send every message through `commerceQueue(env)` rather than `env.COMMERCE_QUEUE`, and in each webhook receiver replace `queue: env.COMMERCE_QUEUE, inline: …` with `queue: commerceQueue(env)`.
3. Add `"retry_delay": 30` to the consumer in `wrangler.jsonc`.
4. If a queue handler turns on `retry: { attempts: … }` in `SquareConfig`, remove it.
