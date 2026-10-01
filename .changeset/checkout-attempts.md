---
"astroidjs": minor
"create-astroid": patch
---

`checkoutAttemptKey` and `checkoutAttempts`: a payment idempotency key that leaves prices out, and KV records of settled checkout attempts. `checkoutIdempotencyKey` is deprecated. ADR 0023 records the design.

`checkoutIdempotencyKey` hashes the verified prices and subtotal. A customer whose paid checkout lost its response, and who retried after a price changed, went out under a new key and was charged a second time. `checkoutAttemptKey(attempt, operation, extra?)` derives the key from the checkout-session ID and the lines as the customer chose them (variant, quantity, add-on IDs), never the prices or a tip. So a retry that differs only there reuses the key, and Square returns the first payment or refuses it. `identity` is still required, and empty is still refused.

`checkoutAttempts({ kv, ttlSeconds?, prefix? })` keeps each attempt's definite outcome (paid with its result, or declined) in KV, for two hours by default. A KV failure reads as a miss and is logged, never thrown.

The generated `src/pages/api/checkout.ts` uses both, with records in the `RL` namespace. It takes `checkoutSessionId` in place of `cartId`, replays a settled attempt before re-pricing, returns `declined: true` with a 402 for a definite decline, and returns a 502 with a retry-safe message for any other payment failure instead of throwing.

An existing project's route is scaffold-once and doesn't change. To adopt this in one:

1. **Client:** keep one checkout-session ID beside the cart, across reloads, with `checkoutSession` from `louise-toolkit/commerce` (0.38 or later). Send it as `checkoutSessionId`. Start a new one after a paid response and after `declined: true`. After any other failure, retry with the same ID. An ID minted per page load still charges twice.
2. **Route, the body:** read `checkoutSessionId`, refuse it unless it's a UUID, and build `const attempt = { identity: checkoutSessionId, lines: body.lines }`.
3. **Route, the replay:** before `verifyCheckout` and before any gate that can change between tries, read `const recordKey = await attempts.key(attempt)` from `checkoutAttempts({ kv: env.RL })`. Return a `paid` record's result with `replayed: true`, and a `declined` record as `declined: true`.
4. **Route, the key:** replace `checkoutIdempotencyKey(check, "order", cartId)` with `checkoutAttemptKey(attempt, "payment")`. Add `{ locationId }` as the third argument in a multi-location store.
5. **Route, the writes:** import `waitUntil` from `cloudflare:workers`. After the payment, `await attempts.write(recordKey, { status: "paid", result }, waitUntil)`. On a `SquareApiError` whose `category` is `PAYMENT_METHOD_ERROR`, write `{ status: "declined" }` the same way and return `declined: true`.

The key changes, so a retry that spans the deploy goes out under a new key. Deploy when no checkout is in flight.
