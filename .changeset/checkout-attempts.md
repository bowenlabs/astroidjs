---
"astroidjs": minor
"create-astroid": patch
---

`checkoutAttemptKey` and `checkoutAttempts`: a payment idempotency key that leaves prices out, and KV records of settled checkout attempts. `checkoutIdempotencyKey` is deprecated.

`checkoutIdempotencyKey` hashes the verified prices and subtotal. A customer whose paid checkout lost its response, and who retried after a price changed, went out under a new key and was charged a second time. `checkoutAttemptKey(attempt, operation, extra?)` derives the key from the checkout-session id and the lines as the customer chose them (variant, quantity, add-on ids), never the prices or a tip. So a retry that differs only there reuses the key, and Square returns the first payment or refuses it. `identity` is still required, and empty is still refused.

`checkoutAttempts({ kv, ttlSeconds?, prefix? })` keeps each attempt's definite outcome (paid with its result, or declined) in KV, for two hours by default. Look it up before re-pricing, so a customer who paid and retries after a price change sees their payment rather than a refusal. Write through `waitUntil`, so a client disconnect doesn't cancel the write. A KV failure reads as a miss and is logged, never thrown.

The generated `src/pages/api/checkout.ts` uses both, with records in the `RL` namespace. It takes `checkoutSessionId` in place of `cartId`, replays a settled attempt before re-pricing, and returns `declined: true` with a 402 for a definite decline. Keep the id with `checkoutSession` from `louise-toolkit/commerce`. An existing project's route is scaffold-once and doesn't change. To adopt this, replace `checkoutIdempotencyKey(check, "order", cartId)` with `checkoutAttemptKey({ identity, lines: body.lines }, "payment")`. The key changes, so a retry that spans the deploy goes out under a new key. Deploy when no checkout is in flight.
