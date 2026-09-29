# ADR 0023—Checkout attempts: a payment key without prices, and settled outcomes in KV

- **Status:** Proposed (2026-09-29)
- **Deciders:** Baylee (solo maintainer)
- **Related:** `checkoutIdempotencyKey`, which this deprecates; `checkoutSession`
  in `louise-toolkit/commerce`, the client half; the generated
  `src/pages/api/checkout.ts`
- **Scope:** `packages/astroid/src/commerce`, the key and record helpers and the
  generated checkout route. The client half lives in louise-toolkit.

## Context

A site charged a customer twice for one order. Its checkout did everything the
framework asked: it re-priced server-side and sent an idempotency key from
`checkoutIdempotencyKey`, scoped to a per-attempt ID. The double charge came
through two paths anyway:

- **The ID didn't survive a reload.** The cart persisted in `localStorage`, and
  its checkout-session ID lived in page memory. A customer whose paid response
  was lost (a dropped connection, a force-quit app) reloaded, got the same cart
  under a new ID, and paid again. That half is the client's, and louise-toolkit
  fixes it with `checkoutSession`.
- **Prices were in the key.** `checkoutIdempotencyKey` hashes the verified
  prices and the subtotal. A retry after a lost response can meet a price that
  changed, or that the client repaired from a stale one. That retry gets a new
  key, and Square charges it as a new payment.

A retry with a stable key has a third problem. Square refuses a reused key whose
request changed, and every retry carries a new single-use card token. So a
customer who already paid sees an error, not their order.

## Decision

### 1. An attempt is the session plus the lines as chosen

An attempt is the client's checkout-session ID plus each line's variant,
quantity, and add-on IDs. It's order-insensitive, quantities add up per variant
and add-on set, and each identity is JSON-encoded so a separator inside an ID
can't make two carts match. `checkoutAttemptKey(attempt, operation, extra?)`
hashes it.

**The payment key never includes the verified prices, the subtotal, or a tip.**
Anything a retry can change without the customer meaning a new order has to stay
out, or that retry is charged again. A price repair and a tip reset by a reload
are both that kind of change. With them out, Square either returns the first
payment or refuses the reused key. It never charges one attempt twice.

`operation` keeps the provider calls apart, since Square scopes keys per
operation. `extra` adds what else makes an operation distinct: the order body
for an order key, so a retry with another pickup time gets a new order whose
payment the payment key then guards, or a location ID in a multi-location store.

### 2. Settled outcomes are kept in KV, and only definite ones

`checkoutAttempts` keeps each attempt's outcome, for two hours by default. Only
two outcomes count as definite:

- **Paid**, with the result. A retry gets it back with `replayed: true`, which
  is how a customer whose response was lost sees the order they paid for.
- **Declined**, for Square's `PAYMENT_METHOD_ERROR`: nothing was charged. A
  retry gets the decline back.

Everything else (a timeout, an outage, a refused reused key) leaves the attempt
open. The card may or may not have been charged, and the payment key makes a
retry safe either way.

The route looks the record up **before** re-pricing and before any gate that can
change between tries, such as opening hours. A customer who paid and retries
after a price change or after closing should see their order, not a refusal.
The write goes through `waitUntil`, because a client that disconnects first is
the case the record exists for.

The record's key adds a context, such as how the order is fulfilled, so a retry
that switched from pickup to shipping isn't shown the pickup order.

### 3. The generated route keeps records in `RL`

Every Astroid project binds `RL`, the rate limiter's KV namespace, which already
holds one other small key (the daily site-health summary). The records go there
under a `checkout:attempt:` prefix, so a new project needs no new binding to
provision and no preview twin to remember.

### 4. The client rotates the ID on a definite outcome

The client starts a new checkout-session ID after a paid response and after
`declined: true`, and keeps it after any other failure. A client that keeps its
ID after a decline gets the recorded decline back on every retry, even with
another card, until the record expires. The client's idle window has to be
shorter than the record's TTL, so a retry the client still calls this attempt
finds its record.

## Alternatives considered

- **Keep `checkoutIdempotencyKey` and fix only the client.** Rejected: a
  persisted ID closes the reload path, but a price that changes between the lost
  response and the retry still makes a new key.
- **A random key per request.** Rejected: a double-clicked Pay button charges
  twice.
- **One key for the order and the payment.** Rejected: the order has to change
  with its body (another pickup time is a new order), and the payment must not.
- **Records in D1.** Rejected for the default: every project has KV, the records
  are short-lived, and a miss is safe because the payment key still stops the
  second charge. A project that wants a durable order record writes one anyway.
- **A dedicated KV namespace.** Rejected: one more binding to provision and to
  twin in `previews`, for a handful of short-lived keys.
- **Record ambiguous failures too.** Rejected: they aren't settled, and a record
  would block the retry that the payment key makes safe.

## Consequences

- `checkoutIdempotencyKey` is deprecated. Two sites call it, and it goes in a
  later minor once both have upgraded.
- The key changes for a project that adopts this, so a retry that spans that
  deploy goes out under a new key. Deploy when no checkout is in flight.
- KV is eventually consistent. A read in another location soon after the write
  can miss, and the retry then gets Square's refusal and the retry-safe message
  instead of its order. The customer isn't charged twice.
- A payment that goes through while its record write fails keeps getting
  Square's refusal on retry. The route's message says to check for a receipt
  before changing the order.
- The generated route depends on `checkoutSession` from louise-toolkit for its
  client half, so the scaffold's toolkit range has to include the release that
  adds it.
