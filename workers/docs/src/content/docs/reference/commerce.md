---
title: Commerce
description: Checkout verification, catalog mirroring, and storefront roles.
sidebar:
  order: 3
---

```ts
import { verifyCheckout, checkoutIdempotencyKey } from "astroidjs";
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

## `checkoutIdempotencyKey(verified, scope, identity)`

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

## Roles

`astroidCommerceRoles`, `astroidCommerceProviders`, `assertCommerceRoles`,
`hasStorefront`, `resolveCommerceStatus`. Providers fill **roles**, not "the"
provider slot—a provider in a role it can't serve fails at config load.
