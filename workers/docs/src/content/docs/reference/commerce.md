---
title: Commerce
description: Checkout verification, catalog mirroring, and storefront roles.
sidebar:
  order: 3
---

```ts
import {
  verifyCheckout,
  checkoutAttemptKey,
  checkoutAttempts,
  subscriptionPlansSnapshot,
} from "astroidjs";
```

## `verifyCheckout(lines, lookup, options?)`

```ts
function verifyCheckout(
  lines: unknown,
  lookup: ScopedPriceLookup,
  options?: { scope?: { locationId?: string } },
): Promise<CheckoutVerification>;
```

Re-prices a cart server-side. The client's price is a **staleness check, never an
input to the charge**—on mismatch it refuses rather than charging a different
amount. Rejects non-integer, negative, and absurd quantities.

Refusal reasons: `"empty"`, `"invalid"`, `"price-changed"`, `"unavailable"`,
`"out-of-stock"`.

### Every stale line at once

A refusal carries `issues`: every line that disagrees with the catalog, in cart
order, each with what the catalog says now. `reason` is the first of them. A
refusal that named only the first problem would leave the customer to fix one
line, retry, and get refused over the next.

```ts
import { repairCart } from "louise-toolkit/commerce";

if (!check.ok) {
  // e.g. [{ kind: "price-changed", variantId: "V1", unitPriceCents: 1800, wasCents: 1500 },
  //       { kind: "unavailable", variantId: "V2" }]
  const { lines, changes } = repairCart(cart, check.issues);
}
```

`repairCart` reprices changed lines and removes sold-out and delisted ones in one
step, and returns each change so the page can tell the customer what moved.
`issues` is empty for `"empty"` and `"invalid"`, which are about the request, not
the catalog. The scaffolded checkout route returns `issues` in its 409 body.

### Per-location pricing

One catalog sold through several merchants carries a different price per
location—each shop's commission absorbed in its own Square
`location_overrides` entry. Re-pricing against **base** prices there lets a
customer pay the cheapest merchant's price at the dearest merchant's storefront:
the same exploit as trusting the client's `unitPriceCents`, one level further
back.

```ts
import { retrieveVariationPricesAt } from "louise-toolkit/commerce/square";

const pricesAt: ScopedPriceLookup = async (ids, scope) => {
  const money = await retrieveVariationPricesAt(sq, ids, scope!.locationId!);
  return new Map([...money].map(([id, m]) => [id, m.amount]));
};

const check = await verifyCheckout(body.lines, pricesAt, { scope: { locationId } });
```

Resolve `locationId` from the **host or an authenticated session, never the
request body**—a body-supplied location is the exploit above, wearing a
different hat.

`retrieveVariationPricesAt` omits any variation the merchant doesn't carry, so an
unstocked id fails closed as `"unavailable"` rather than selling at the base
price.

### Sold out vs delisted

A lookup may return a `Map` (prices only) or `{ prices, outOfStock }`. The second
form is how `"out-of-stock"` is reached—a bare map can't express it, and
guessing would put the wrong sentence in front of a customer. Delisted is gone
and should leave the cart; sold out is coming back and is worth a notify-me.

Stock is checked **before** price, because a sold-out variation is usually still
priced.

```ts
const lookup: ScopedPriceLookup = async (ids, scope) => ({
  prices: await pricesFor(ids, scope),
  outOfStock: await soldOutAmong(ids, scope),
});
```

A plain `PriceLookup` stays assignable to `ScopedPriceLookup`—a single-location
store changes nothing.

## `checkoutAttemptKey(attempt, operation, extra?)`

```ts
function checkoutAttemptKey(
  attempt: { identity: string; lines: readonly CheckoutAttemptLine[] },
  operation: string,
  extra?: unknown,
): Promise<string>;
```

An idempotency key for one operation of one checkout attempt. An attempt is the
client's checkout-session ID plus the lines as the customer chose them: variant,
quantity, and add-on IDs. **Prices and the tip never enter the key.** A retry
after a lost response can meet a repaired price or a reset tip, and it has to
reuse the key, so Square returns the first payment or refuses the key rather
than charging again.

- `identity` is required and empty is refused, as it is for
  `checkoutIdempotencyKey`: a key from the cart alone collides between two buyers
  of the same thing. Keep it with `checkoutSession` from
  `louise-toolkit/commerce`, which persists the ID beside a stored cart and
  changes it when the cart changes.
- `operation` names the provider call (`"payment"`, `"order"`), since Square
  scopes keys per operation.
- `extra` is anything else that makes the operation distinct: the order body for
  an order key, so a retry with another pickup time gets a new order, or a
  location ID.

The key is 40 hexadecimal characters, inside Square's 45-character cap. It
tolerates an untrusted body, so a route can derive it before `verifyCheckout`
checks the lines.

## `checkoutAttempts(options)`

```ts
function checkoutAttempts<Result>(options: {
  kv: CheckoutAttemptKv;
  ttlSeconds?: number; // 7200
  prefix?: string; // "checkout:attempt:"
}): {
  key(attempt: CheckoutAttempt, context?: unknown): Promise<string>;
  read(key: string): Promise<CheckoutOutcome<Result> | null>;
  write(key: string, outcome: CheckoutOutcome<Result>, waitUntil?): Promise<void>;
};
```

Records of settled attempts, so a retry of a paid attempt gets its result back
instead of a refusal. That's how a customer whose response was lost sees the
order they paid for.

```ts
const attempts = checkoutAttempts<PaidCheckout>({ kv: env.RL });
const recordKey = await attempts.key(attempt, { fulfillment });
const settled = await attempts.read(recordKey);
if (settled?.status === "paid") return json({ ...settled.result, replayed: true });
// ...re-price, charge...
await attempts.write(recordKey, { status: "paid", result }, waitUntil);
```

- Look the record up **before** re-pricing and before any gate that can change
  between tries, such as opening hours. A customer who paid and retries after a
  price change, or after closing, should see their order.
- Record only definite outcomes: `paid`, or `declined` for a decline where
  nothing was charged. Leave an ambiguous failure, such as a timeout, unrecorded,
  so a retry reuses the key.
- Tell the client which is which. After a paid response or `declined: true`,
  the client must start a new checkout-session ID (`rotate()` on
  `checkoutSession`). Otherwise every retry, even with another card, gets the
  recorded decline back until the record expires. After any other failure, it
  retries with the same ID.
- Pass `context` for what else makes the outcome this attempt's, such as pickup
  or shipping. A retry that switched to shipping must not be shown the pickup
  order.
- Keep `ttlSeconds` longer than the client's `idleMs`, so a retry the client
  still calls this attempt finds the record.

See [ADR 0023](https://github.com/bowenlabs/astroidjs/blob/main/docs/adr/0023-checkout-attempts.md) for why the key and the records work this way.

KV is a convenience, not the record of truth. It's eventually consistent, a
failed read is a miss, and a failed write is logged. Either way the payment key
still stops the second charge.

## `checkoutIdempotencyKey(verified, scope, identity)`

**Deprecated:** use `checkoutAttemptKey`. This key hashes the verified prices and
subtotal, so a retry after a lost response that meets a changed price goes out
under a new key and is charged twice.

```ts
function checkoutIdempotencyKey(
  verified: { lines: VerifiedLine[]; subtotalCents: number },
  scope: string,
  identity: string,
): Promise<string>;
```

A deterministic key so a double-clicked Pay button charges once.

**`identity` is required and empty is refused.** Pass a cart id, checkout-session
id, or user id—something stable across a retry of this attempt and distinct
between buyers. Without it the key is a function of the cart alone, so two
customers buying the same items collide, and since providers scope idempotency
keys per account for ~24 h the second buyer is never charged. `scope` is the
_operation_ (`"order"` vs `"refund"`), not an identity.

## Card checkout

`usesCardCheckout`, `generateAstroidCheckoutRoute`, `generateAstroidSquareCard`,
`astroidCheckoutVars`, `generateAstroidCheckoutEnv`.

Square storefronts only—Fourthwall redirects to its own hosted checkout (no
token to charge) and Stripe fills `invoicing`, not `storefront`. Generates the
payment route and the card component; the **cart is not generated**, because
where it lives is a project decision.

`SQUARE_APP_ID` and `SQUARE_ENVIRONMENT` are emitted as wrangler **vars**, not
secrets: the app id ships to the browser by design, and folding either into the
credential roster would also fold it into the dormancy gate—which asks whether
we can safely _call_ Square, a different question from whether a card field can
render.

Under `square: { locations: "multi" }` the generated route is different, because
there is no ambient `SQUARE_LOCATION_ID` to charge against—Astroid drops it
from the credential roster precisely so nothing defaults to it. The route instead
scaffolds a `resolveLocationId(request)` you fill in, refuses the checkout when
it returns `null`, re-prices at that location live from Square, and charges the
same one. `SquareCard.astro` takes `locationId` as a prop rather than reading the
environment.

The route charges in `business.currency`, which it reads from
`astroid.config.ts` at request time through `astroidBusiness(astroidConfig,
"currency")`, so it never carries a currency literal. `commerce` requires
`business.currency`, and only a currency with 2 minor-unit digits, because the
mirror and the route convert prices by a factor of 100.

That route also runs the **dormancy gate before verification** rather than after
it: per-location re-pricing is itself a Square call, so checking provisioning
afterwards would call Square with a placeholder credential—the one thing the
route promises never to do. The cost is that an unprovisioned multi-merchant
store can't do the staleness check at all, and it reports that (`priced: false`)
instead of echoing the client's total back.

## Catalog mirror

`astroidCatalogSync`, `astroidCatalogUpsert`, `astroidCatalogMirror`,
`readCatalog`, `readCatalogItem`, `astroidCatalogLoaderConfig`,
`generateCatalogTable`, `generateCatalogMigrationSql`.

The provider is the source of truth; D1 holds the owner's edits. **The sync never
writes an owned column**—one that does silently reverts the owner's work.
`slug` is owned for exactly that reason: it's the public URL.

`astroidCatalogSync` returns `{ created, updated, failed, errors }` and **throws
when every item failed**—a total failure that returned zeros was
indistinguishable from an empty catalog, so the queue acked and the site served a
frozen catalog silently. Partial failures don't throw.

Adapters `squareToCatalogItem` / `fourthwallToCatalogItem` normalize to one shape,
which is what lets a single loader serve both.

`squareToCatalogItem(item, { locationId })` resolves both halves at one merchant:
variations they don't carry are dropped, and the rest price through
`location_overrides` instead of the base price. The headline `price` is scoped
too—it means "from", so computing it over the whole catalog advertises a price
this merchant will never honour, and since the dropped variation is usually the
cheap one the error runs in the direction a customer notices at the till.

Filter with `squareItemSoldAt(item, locationId)` before syncing. An item sold
nowhere at that location has no variants and a price of 0, which mirrors as a $0
card:

```ts
const rows = items
  .filter((i) => squareItemSoldAt(i, locationId))
  .map((i) => squareToCatalogItem(i, { locationId }));
```

Omitting `locationId` is unchanged behaviour, and correct for a single-location
account.

Both adapters take a `currency` option for a price the provider sent without
one. Pass the site's, and a variant with no currency of its own takes it;
without it, that variant's `currency` is `null` rather than a guess.
`catalogNormalizer(provider, { currency })` passes it through, and returns a
one-argument function that's safe to hand to `Array.map`:

```ts
const { currency } = astroidBusiness(astroidConfig);
const rows = items.map((i) => squareToCatalogItem(i, { locationId, currency }));
```

## Taking payments without the pipeline

`commerce` normally brings a pipeline with it: a webhook receiver per provider,
the queue consumer that processes their events, and the hourly catalog re-sync.
A project that only takes payments, while another project runs that pipeline
against the same account, sets `pipeline: false`:

```ts
commerce: { provider: "square", pipeline: false },
```

It keeps what a checkout needs: the provider's CSP origins, the checkout rate
rule, and the checkout route and card component. It drops the webhook
receivers, the queue, and the catalog cron, and the webhook signing secret with
them, so checkout goes live on the API credentials alone. A provider sends each
event to the one endpoint you register, so the project that runs the pipeline
is the one that registers it.

`astroidCommercePipeline(config)` answers whether a project runs it. The
catalog table still follows `catalog.mode`, so a project that reads a mirror
another project fills keeps its schema. `defineAstroid` refuses a `queues.cron`
alongside `pipeline: false`, because that cron schedules the re-sync the option
turns off. A queue the project runs for its own `crons` is still allowed.

## Subscription plans snapshot

```ts
function subscriptionPlansSnapshot(options: {
  kv: SubscriptionPlansSnapshotKv;
  environment?: string; // "sandbox"
  locationId?: string | null; // "none"
  ttlSeconds?: number; // 7200
}): {
  key: string;
  read(): Promise<SquareSubscriptionPlan[] | null>;
  refresh(config: SquareConfig): Promise<SquareSubscriptionPlan[]>;
  get(
    config: SquareConfig | null,
    options?: { fallback?: SquareSubscriptionPlan[] },
  ): Promise<SquareSubscriptionPlan[]>;
};

function subscriptionPlansSnapshotKey(scope: {
  environment?: string;
  locationId?: string | null;
}): string;
```

A KV snapshot of the Square subscription plans that `listSubscriptionPlans` in
`louise-toolkit/commerce/square` returns: which items a customer can subscribe
to, and each plan variation's cadence and price. A product page reads the
snapshot instead of searching Square's catalog on every request.

- **Key:** `square:subscription-plans:v1:<environment>:<location>`, built by
  `subscriptionPlansSnapshotKey`. An empty environment keys as `sandbox` and an
  empty location as `none`. Every app that writes or reads the snapshot builds
  the key with this function, so a change to the stored shape moves all of them
  to a new key in the same release. Pass the environment your `SquareConfig`
  uses, so a switch from sandbox to production starts from an empty snapshot.
- **Expiry:** two hours by default, which is two runs of the hourly cron, so one
  failed refresh doesn't empty it. KV's floor is 60 seconds, and a `ttlSeconds`
  under it, or one that isn't a whole number, throws `AstroidUsageError`.
- **`read()`** returns the snapshot, or null on a miss, a KV failure, or a value
  that isn't a JSON array. It never calls Square.
- **`refresh(config)`** fetches the plans and writes them. The write is
  best-effort: a failed write is logged and the plans are still returned. A
  Square failure throws.
- **`get(config, options?)`** returns `read()`, or `refresh(config)` on a miss.
  With a null `config` it returns `fallback`, or `[]`, so a site without Square
  can show seed plans. A failed refresh is logged and returns `[]`, so a product
  page still renders without the subscribe option.

### One app writes, another reads

A coffee shop runs its site and its order app as two Workers that share one KV
namespace. The site runs the commerce pipeline, so its queue consumer refreshes
the snapshot beside the catalog, through `alsoRefresh` on
[`astroidQueueHandler`](/reference/queues/):

```ts
// The site's Worker. Its config has `commerce: { provider: "square" }`.
const plans = (env: Env) =>
  subscriptionPlansSnapshot({
    kv: env.KV,
    environment: env.SQUARE_ENVIRONMENT,
    locationId: env.SQUARE_LOCATION_ID,
  });

await astroidQueueHandler({
  refreshCatalog: () => refreshCatalogCache(env),
  alsoRefresh: {
    subscriptions: async () => {
      const config = await squareConfig(env);
      if (config) await plans(env).refresh(config);
    },
  },
})(message);
```

The hourly cron and a plan edit in Square both reach the refresh, since a plan
is a catalog object and its webhook is catalog-affecting. A failed plans refresh
is logged and never sends the catalog refresh into retry.

The order app sets `commerce: { provider: "square", pipeline: false }`, so it
runs no queue and no cron. It builds the same snapshot over the same binding and
only reads:

```ts
// The order app's Worker.
const config = await squareConfig(env);
const subscriptionPlans = await plans(env).get(config, { fallback: seedPlans });
```

On a cold miss, before the site's first refresh, `get` fetches the plans itself
and writes them, so the order app never shows an empty list for longer than
one Square call.

## Roles

`astroidCommerceRoles`, `astroidCommerceProviders`, `assertCommerceRoles`,
`hasStorefront`, `resolveCommerceStatus`. Providers fill **roles**, not "the"
provider slot—a provider in a role it can't serve fails at config load.
