// Copyright (c) 2026 BowenLabs. Astroid is MIT licensed.
//
// Server-authoritative checkout.
//
// A cart arrives from the browser, so every number in it is a claim, not a fact.
// The rule this encodes—taken from a client site's working checkout—is that
// the client's price is a **staleness check**, never an input to the charge:
// look the price up server-side, and if it disagrees with what the customer was
// shown, refuse rather than silently charging a different amount. Refusing is
// the customer-friendly branch too; being charged more than the page said is
// worse than being asked to review the cart.
//
// The failure this prevents is not exotic. Accept `unitPrice` from the request
// body and anyone can buy anything for a penny.
//
// The comparison itself is the toolkit's `cartIssues`, which reports EVERY
// stale line rather than the first: a refusal that names one problem at a time
// is how a customer ends up fixing a line, retrying, and being refused over the
// next. What this adds is the opinion—policing the untrusted body, and the
// sentence a customer sees.

import { type CartIssue, cartIssues } from "louise-toolkit/commerce";
import { AstroidUsageError } from "../errors.js";

/** One line as the CLIENT sent it. Every field is untrusted. */
export interface ClientLine {
  /** Provider id of the variant/item being bought. */
  variantId: string;
  quantity: number;
  /**
   * The unit price, in minor units, that the customer was SHOWN. Compared
   * against the server's price; never used to compute the charge.
   */
  unitPriceCents: number;
}

/** A line after the server has re-priced it. */
export interface VerifiedLine {
  variantId: string;
  quantity: number;
  /** The server's price. This is what gets charged. */
  unitPriceCents: number;
  subtotalCents: number;
}

/**
 * Why a cart was refused.
 *
 * `"unavailable"` and `"out-of-stock"` are deliberately distinct even though
 * both come back as "the lookup didn't price it". They are different facts about
 * the world and want different words in front of a customer: a delisted item is
 * gone and should leave the cart, while a sold-out one is coming back and is
 * worth a notify-me. Collapsing them tells someone to remove an item the shop
 * will restock on Tuesday.
 *
 * A lookup can only produce `"out-of-stock"` by saying so—see
 * {@link ScopedPriceLookup}—because a bare `Map` has no way to distinguish
 * them and guessing would put the wrong sentence on the screen.
 */
export type CheckoutRefusal =
  | "empty"
  | "unavailable"
  | "out-of-stock"
  | "price-changed"
  | "invalid";

/**
 * One way the cart disagrees with the live catalog—the toolkit's
 * `CartIssue`, less the add-on case (checkout lines carry no add-ons yet).
 * Hand the list to `repairCart` from `louise-toolkit/commerce` to fix the cart
 * in one step.
 */
export type CheckoutIssue = Exclude<CartIssue, { kind: "modifier-unavailable" }>;

export type CheckoutVerification =
  | { ok: true; lines: VerifiedLine[]; subtotalCents: number }
  | {
      ok: false;
      /** The first problem, in cart order. */
      reason: CheckoutRefusal;
      message: string;
      /**
       * Every problem, in cart order, with what the catalog says now—empty
       * for `"empty"` and `"invalid"`, which are about the request, not the
       * catalog.
       */
      issues: CheckoutIssue[];
    };

/** Look up current prices, in minor units, keyed by variant id. Anything the
 *  map omits is treated as no longer purchasable. */
export type PriceLookup = (variantIds: string[]) => Promise<Map<string, number>>;

/** Where the sale is happening. Optional, and providers without a location
 *  dimension ignore it—a single-merchant Square account or Fourthwall store
 *  passes nothing and behaves exactly as before. */
export interface CheckoutScope {
  /** Provider location id (Square) or equivalent merchant key. */
  locationId?: string;
}

/**
 * A richer lookup result, for providers that can tell "delisted" from
 * "sold out".
 *
 * A lookup may return either a plain `Map<string, number>` (prices only, an
 * omission means unavailable) or this. Both are accepted, so the plain form
 * stays valid and nothing existing has to change.
 */
export interface ScopedPrices {
  /** variantId → unit price in minor units, at the requested scope. */
  prices: Map<string, number>;
  /** Variant ids that exist and are priced but cannot be sold right now. */
  outOfStock?: Iterable<string>;
}

/**
 * A price lookup that knows WHERE the sale is happening.
 *
 * This is the multi-merchant checkout guard. One shared catalog sold through
 * several merchants carries a different price per location—each shop's
 * commission is absorbed in its own override—so re-pricing a cart against
 * base prices lets a customer pay the cheapest merchant's price at the dearest
 * merchant's storefront. That is not a rounding error; it is the same class of
 * bug as trusting the client's `unitPriceCents`, just one level further back.
 *
 * `scope` is optional so a {@link PriceLookup} is still assignable here—an
 * existing single-location lookup simply ignores the extra argument, which is
 * exactly what a function of lower arity does in JavaScript.
 *
 * Return the map alone, or a {@link ScopedPrices} when the provider can
 * distinguish sold-out from delisted:
 *
 * ```ts
 * const lookup: ScopedPriceLookup = async (ids, scope) => {
 *   const money = await retrieveVariationPricesAt(sq, ids, scope?.locationId ?? DEFAULT);
 *   return new Map([...money].map(([id, m]) => [id, m.amount]));
 * };
 * ```
 */
export type ScopedPriceLookup = (
  variantIds: string[],
  scope?: CheckoutScope,
) => Promise<Map<string, number> | ScopedPrices>;

export interface VerifyCheckoutOptions {
  /** Passed through to the lookup. Omit for a single-location store. */
  scope?: CheckoutScope;
}

const MAX_QUANTITY = 999;

/** What a customer reads, by issue kind: one line affected, or several. */
const ISSUE_MESSAGES: Record<CheckoutIssue["kind"], [one: string, many: string]> = {
  "out-of-stock": ["An item in your cart just sold out.", "Some items in your cart just sold out."],
  unavailable: [
    "An item in your cart is no longer available.",
    "Some items in your cart are no longer available.",
  ],
  "price-changed": [
    "Prices changed — please review your cart.",
    "Prices changed — please review your cart.",
  ],
};

/** One sentence for the whole refusal. Mixed kinds get a sentence that covers them all. */
function issueMessage(issues: CheckoutIssue[]): string {
  const kinds = new Set(issues.map((i) => i.kind));
  const [kind] = kinds;
  if (kinds.size > 1 || !kind) return "Your cart changed since you filled it — please review it.";
  const [one, many] = ISSUE_MESSAGES[kind];
  return issues.length > 1 ? many : one;
}

/** Accept either lookup shape without making every caller branch. */
function normalizeLookup(result: Map<string, number> | ScopedPrices): {
  prices: Map<string, number>;
  outOfStock: Set<string>;
} {
  if (result instanceof Map) return { prices: result, outOfStock: new Set() };
  return { prices: result.prices, outOfStock: new Set(result.outOfStock ?? []) };
}

/**
 * Re-price a cart against the provider and decide whether it may proceed.
 *
 * ```ts
 * const check = await verifyCheckout(body.lines, (ids) => serverPrices(env, ids));
 * if (!check.ok) return json({ error: check.message }, 409);
 * await charge(check.subtotalCents);   // the SERVER's number
 * ```
 *
 * With a per-merchant catalog, pass the location the order is being placed at
 * and use a lookup that resolves overrides:
 *
 * ```ts
 * const check = await verifyCheckout(body.lines, pricesAt, { scope: { locationId } });
 * ```
 */
export async function verifyCheckout(
  lines: unknown,
  // Typed as the scoped form alone rather than a union: a `PriceLookup` is
  // already structurally assignable here (fewer parameters, narrower return),
  // and a union of call signatures would reject the two-argument call below.
  lookup: ScopedPriceLookup,
  options: VerifyCheckoutOptions = {},
): Promise<CheckoutVerification> {
  if (!Array.isArray(lines) || lines.length === 0) {
    return { ok: false, reason: "empty", message: "Your cart is empty.", issues: [] };
  }

  const parsed: ClientLine[] = [];
  for (const raw of lines) {
    const l = raw as Partial<ClientLine>;
    // A non-integer or negative quantity is the other half of the price
    // exploit: a quantity of -1 turns a charge into a refund on some providers.
    if (
      typeof l?.variantId !== "string" ||
      !l.variantId ||
      typeof l.quantity !== "number" ||
      !Number.isInteger(l.quantity) ||
      l.quantity < 1 ||
      l.quantity > MAX_QUANTITY ||
      typeof l.unitPriceCents !== "number" ||
      !Number.isFinite(l.unitPriceCents)
    ) {
      return { ok: false, reason: "invalid", message: "That cart isn't valid.", issues: [] };
    }
    parsed.push({ variantId: l.variantId, quantity: l.quantity, unitPriceCents: l.unitPriceCents });
  }

  const { prices, outOfStock } = normalizeLookup(
    await lookup([...new Set(parsed.map((l) => l.variantId))], options.scope),
  );

  // No `liveModifierIds`, so the add-on check is skipped and every issue is a
  // variant one—which is what makes the narrowing to CheckoutIssue true.
  const issues = cartIssues(parsed, { prices, outOfStock }) as CheckoutIssue[];
  const [first] = issues;
  if (first) return { ok: false, reason: first.kind, message: issueMessage(issues), issues };

  // Every line is now known to be priced, and at the price the customer saw.
  const verified: VerifiedLine[] = parsed.map((line) => ({
    variantId: line.variantId,
    quantity: line.quantity,
    unitPriceCents: line.unitPriceCents,
    subtotalCents: line.unitPriceCents * line.quantity,
  }));
  const subtotalCents = verified.reduce((sum, l) => sum + l.subtotalCents, 0);
  return { ok: true, lines: verified, subtotalCents };
}

/**
 * A deterministic idempotency key for one buyer's checkout attempt.
 *
 * Providers dedupe on this, so the same key must mean the same charge—which
 * cuts both ways, and the second direction is the one that costs money. It is
 * derived from the verified cart *and* `identity`, not from a random value or a
 * timestamp: a customer double-clicking Pay sends the same key twice and is
 * charged once, while a customer who changes their cart pays under a different
 * key and is charged correctly.
 *
 * **`identity` is required, and it is what makes the key safe.** Without it the
 * key was a pure function of the cart contents, so two DIFFERENT customers
 * buying the same thing for the same price produced byte-identical keys. Stripe
 * and Square scope idempotency keys per account and retain them for about 24 hours, so the
 * provider replayed the first customer's PaymentIntent instead of creating the
 * second's: the second buyer was never charged, no second order existed, and the
 * site reported success. On a single-SKU storefront that is ordinary traffic,
 * not an edge case.
 *
 * Pass something stable across a retry of THIS attempt and distinct between
 * buyers—a cart id, a checkout-session id, or a portal user id. Do not pass a
 * value that varies per request (a fresh uuid defeats the dedupe and a
 * double-click charges twice), and do not pass a constant.
 *
 * `scope` remains the OPERATION—`"order"` vs `"refund"`—so the two can never
 * collide for one buyer. It is not an identity and never was.
 *
 * @deprecated Use {@link checkoutAttemptKey}. This key hashes the verified
 * prices and subtotal, so a retry after a lost response that meets a changed
 * price goes out under a new key and is charged a second time. The attempt key
 * leaves prices out.
 */
export async function checkoutIdempotencyKey(
  verified: { lines: VerifiedLine[]; subtotalCents: number },
  scope: string,
  identity: string,
): Promise<string> {
  // Empty is rejected rather than defaulted: a falsy identity would silently
  // restore the collision this parameter exists to close, and a charge that
  // goes missing is not something the caller finds out about.
  if (typeof identity !== "string" || identity.trim().length === 0) {
    throw new AstroidUsageError(
      "checkoutIdempotencyKey requires a non-empty `identity` (a cart id, checkout-session id, " +
        "or user id). Without it the key is a function of the cart alone, so two customers " +
        "buying the same items collide and the second is never charged.",
    );
  }
  const canonical = JSON.stringify({
    scope,
    identity,
    total: verified.subtotalCents,
    lines: verified.lines.map((l) => `${l.variantId}:${l.quantity}:${l.unitPriceCents}`).sort(),
  });
  return hex40(canonical);
}

// ── Checkout attempts ─────────────────────────────────────────────────────────
// An attempt is one checkout-session id with one set of lines as the customer
// chose them: variant, quantity, and add-ons. Never the verified prices or a
// tip, so a retry after a price repair, or after a reload that reset the tip,
// is still the same attempt.
//
// The payment's idempotency key is the attempt alone. However a retry differs
// from the first try (a new card token, another tip, a repaired price), the
// provider returns the first payment or refuses the reused key. It never
// charges one attempt twice. An order key can add the order body through
// `extra`, so a retry with another pickup time gets a new order, whose payment
// the reused payment key then guards.
//
// The outcome of each attempt can also be kept in KV (`checkoutAttempts`), so a
// retry of a paid attempt gets that result back instead of a refusal. KV is a
// convenience, not the record of truth: a missing record falls through to the
// provider, which refuses the payment key.

/** One checkout attempt: whose it is, and the lines as the customer chose them. */
export interface CheckoutAttempt {
  /**
   * The client's checkout-session id: stable across a retry and a reload of
   * this attempt, and distinct between buyers. `checkoutSession` in
   * `louise-toolkit/commerce` keeps one beside a stored cart.
   */
  identity: string;
  /** The lines as the client sent them. Only the variant, the quantity, and
   *  the add-on ids are read, so prices never reach the key. */
  lines: readonly CheckoutAttemptLine[];
}

export interface CheckoutAttemptLine {
  variantId: string;
  quantity: number;
  /** Selected add-on ids, in any order. */
  modifierIds?: readonly string[];
}

/** SHA-256 of a string as 40 hex characters: within Square's 45-character cap
 *  on an idempotency key, and Stripe's 255. */
async function hex40(canonical: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical));
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 40);
}

/** The lines as the customer chose them, order-insensitive. Tolerant of an
 *  untrusted body: the route can derive a key before `verifyCheckout` polices
 *  the lines, and a malformed line only makes a key nothing else matches. */
function attemptLines(lines: readonly CheckoutAttemptLine[]): string[] {
  return (Array.isArray(lines) ? lines : [])
    .map((l: Partial<CheckoutAttemptLine> | null) => {
      const modifiers = Array.isArray(l?.modifierIds) ? [...l.modifierIds].map(String).sort() : [];
      return `${String(l?.variantId)}:${String(l?.quantity)}:${modifiers.join(",")}`;
    })
    .sort();
}

/**
 * An idempotency key for one operation of one checkout attempt.
 *
 * `operation` names the provider call (`"payment"`, `"order"`), since Square
 * scopes keys per operation and two calls must never share one. `extra` is
 * anything else that makes the operation distinct, such as the order body for
 * an order key or a location id for a multi-location store. Leave the tip and
 * the verified prices out of it: a retry that differs only there has to reuse
 * the payment's key, or it's charged again.
 *
 * `identity` is required, and empty is refused, for the reason
 * `checkoutIdempotencyKey` gives: a key from the cart alone collides between
 * two buyers of the same thing.
 */
export async function checkoutAttemptKey(
  attempt: CheckoutAttempt,
  operation: string,
  extra?: unknown,
): Promise<string> {
  const identity = typeof attempt.identity === "string" ? attempt.identity.trim() : "";
  if (!identity) {
    throw new AstroidUsageError(
      "checkoutAttemptKey requires a non-empty `identity` (a checkout-session id). Without it " +
        "the key is a function of the cart alone, so two customers buying the same items " +
        "collide and the second is never charged.",
    );
  }
  return hex40(JSON.stringify({ operation, identity, lines: attemptLines(attempt.lines), extra }));
}

/** What a settled attempt came to. Only definite outcomes are kept: an
 *  ambiguous failure, such as a timeout, leaves the attempt open. */
export type CheckoutOutcome<Result> =
  | { status: "paid"; result: Result }
  /** The provider declined the card, and nothing was charged. */
  | { status: "declined" };

/** The slice of a KV namespace the attempt records use. */
export interface CheckoutAttemptKv {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
}

export interface CheckoutAttemptsOptions {
  kv: CheckoutAttemptKv;
  /**
   * How long a record lives, in seconds. Two hours by default. Keep it longer
   * than the client keeps an idle checkout-session id, so a retry the client
   * still calls this attempt finds the record. KV's floor is 60.
   */
  ttlSeconds?: number;
  /** Prefixed to every record's KV key. `"checkout:attempt:"` by default. */
  prefix?: string;
}

export interface CheckoutAttempts<Result> {
  /**
   * The record key for an attempt. `context` is what else makes the outcome
   * this attempt's: how it's fulfilled (pickup or shipping, the time, the
   * rate), or the location. A retry that switched from pickup to shipping
   * mustn't be shown the pickup order as its success.
   */
  key(attempt: CheckoutAttempt, context?: unknown): Promise<string>;
  /** The outcome kept under `key`, or null. A KV failure reads as null. */
  read(key: string): Promise<CheckoutOutcome<Result> | null>;
  /**
   * Keep `outcome` under `key`. Never rejects: a failed write is logged. Pass
   * `waitUntil` so a client that disconnects first, the very case the record
   * exists for, doesn't cancel the write.
   */
  write(
    key: string,
    outcome: CheckoutOutcome<Result>,
    waitUntil?: (promise: Promise<unknown>) => void,
  ): Promise<void>;
}

/**
 * Records of settled checkout attempts in KV.
 *
 * Look an attempt up before re-pricing and before any gate that can change
 * between tries (opening hours, a shipping region), so a customer who paid and
 * retries after closing time or a price change sees their order rather than a
 * refusal. Write the outcome as soon as it's definite.
 */
export function checkoutAttempts<Result>(
  options: CheckoutAttemptsOptions,
): CheckoutAttempts<Result> {
  const { kv, ttlSeconds = 2 * 60 * 60, prefix = "checkout:attempt:" } = options;
  if (!Number.isInteger(ttlSeconds) || ttlSeconds < 60) {
    throw new AstroidUsageError(
      `checkoutAttempts needs a whole \`ttlSeconds\` of at least 60 (KV's floor), got ${ttlSeconds}.`,
    );
  }
  return {
    async key(attempt, context) {
      return prefix + (await checkoutAttemptKey(attempt, "record", context));
    },
    async read(key) {
      try {
        const raw = await kv.get(key);
        const record = raw ? (JSON.parse(raw) as Partial<CheckoutOutcome<Result>>) : null;
        if (record?.status === "paid" && "result" in record) {
          return { status: "paid", result: record.result as Result };
        }
        if (record?.status === "declined") return { status: "declined" };
      } catch (error) {
        // A miss is safe: the provider still refuses the payment key.
        console.error("[astroid:commerce] checkout attempt read failed", error);
      }
      return null;
    },
    write(key, outcome, waitUntil) {
      const written = kv
        .put(key, JSON.stringify(outcome), { expirationTtl: ttlSeconds })
        .catch((error: unknown) => {
          console.error("[astroid:commerce] checkout attempt write failed", error);
        });
      waitUntil?.(written);
      return written;
    },
  };
}
