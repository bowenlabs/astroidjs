// Copyright (c) 2026 BowenLabs. Astroid is MIT licensed.
//
// A KV snapshot of a Square account's subscription plans.
//
// A plan says which items a customer can subscribe to, and each of its
// variations says how often and at what price. A product page needs them on
// every render, and Square's catalog search is too slow to call per request, so
// a site reads them the way it reads its catalog: from a snapshot that the
// catalog refresh rewrites. The queue consumer's `alsoRefresh` runs the
// refresh beside the catalog's, so the hourly cron and a plan edit in Square
// both reach it.
//
// The snapshot is a contract between apps. One app runs the commerce pipeline
// and writes it; another, under `commerce.pipeline: false`, reads the same KV
// namespace. Both build the key with `subscriptionPlansSnapshotKey`, so a
// change to the stored shape moves the writer and every reader to a new key in
// one release.
//
// ADR 0024 records the contract: the key, its version, the TTL, and who writes.

import {
  listSubscriptionPlans,
  type SquareConfig,
  type SquareSubscriptionPlan,
} from "louise-toolkit/commerce/square";
import { reportDegraded } from "louise-toolkit/errors";
import { AstroidUsageError } from "../errors.js";

/** The versioned prefix of the snapshot's key. Bump the version when the
 *  stored shape changes, so no reader parses an older writer's value. */
const SNAPSHOT_NAME = "square:subscription-plans:v1";

/**
 * The `reportDegraded` name prefix for the snapshot's fallbacks:
 * `commerce.subscriptionPlans.read` (a failed or garbled read, served as a
 * miss), `.write` (a failed write, the plans returned anyway), and `.refresh`
 * (a Square failure in `get`, served as no plans).
 */
export const ASTROID_SUBSCRIPTION_PLANS_DEGRADED = "commerce.subscriptionPlans";

/** Two hourly cron runs, so one failed refresh doesn't empty the snapshot. */
const DEFAULT_TTL_SECONDS = 2 * 60 * 60;

/** The slice of a KV namespace the snapshot uses. */
export interface SubscriptionPlansSnapshotKv {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options: { expirationTtl: number }): Promise<void>;
}

/** Which Square account and location a snapshot holds the plans of. */
export interface SubscriptionPlansSnapshotScope {
  /**
   * The Square environment the plans come from, such as `"production"`.
   * `"sandbox"` by default. Pass the same value as the `SquareConfig` you
   * refresh with, so a switch from sandbox to production starts from an empty
   * snapshot rather than serving sandbox plan IDs.
   */
  environment?: string;
  /** The location the app sells at. Null or empty keys as `"none"`. */
  locationId?: string | null;
}

export interface SubscriptionPlansSnapshotOptions extends SubscriptionPlansSnapshotScope {
  kv: SubscriptionPlansSnapshotKv;
  /**
   * How long a snapshot lives, in seconds. Two hours by default, which is two
   * runs of the hourly cron. KV's floor is 60.
   */
  ttlSeconds?: number;
}

export interface SubscriptionPlansSnapshot {
  /** The KV key this snapshot reads and writes. */
  key: string;
  /** The snapshot, or null on a miss, a KV failure, or a value that isn't a
   *  JSON array. */
  read(): Promise<SquareSubscriptionPlan[] | null>;
  /**
   * Fetch the plans from Square and write them to the snapshot. The write is
   * best-effort: a failed one is reported with `reportDegraded`, and the plans
   * are still returned.
   * Throws when Square fails.
   */
  refresh(config: SquareConfig): Promise<SquareSubscriptionPlan[]>;
  /**
   * The snapshot, or a live refresh on a miss. With a null `config`, returns
   * `fallback` (`[]` by default), so a site without Square can show seed
   * plans. A failed refresh is reported with `reportDegraded` and returns
   * `[]`, so a product page
   * still renders, as an item a customer buys once.
   */
  get(
    config: SquareConfig | null,
    options?: { fallback?: SquareSubscriptionPlan[] },
  ): Promise<SquareSubscriptionPlan[]>;
}

/**
 * The KV key of the subscription plans snapshot for one Square environment
 * and location: `square:subscription-plans:v1:<environment>:<location>`.
 */
export function subscriptionPlansSnapshotKey(scope: SubscriptionPlansSnapshotScope = {}): string {
  return `${SNAPSHOT_NAME}:${scope.environment || "sandbox"}:${scope.locationId || "none"}`;
}

/**
 * A KV snapshot of the Square subscription plans, for the app that writes it
 * and for any app that reads it.
 *
 * ```ts
 * const plans = subscriptionPlansSnapshot({
 *   kv: env.KV,
 *   environment: env.SQUARE_ENVIRONMENT,
 *   locationId: env.SQUARE_LOCATION_ID,
 * });
 * const offers = await plans.get(config, { fallback: seedPlans });
 * ```
 */
export function subscriptionPlansSnapshot(
  options: SubscriptionPlansSnapshotOptions,
): SubscriptionPlansSnapshot {
  const { kv, ttlSeconds = DEFAULT_TTL_SECONDS } = options;
  if (!Number.isInteger(ttlSeconds) || ttlSeconds < 60) {
    throw new AstroidUsageError(
      `subscriptionPlansSnapshot needs a whole \`ttlSeconds\` of at least 60 (KV's floor), got ${ttlSeconds}.`,
    );
  }
  const key = subscriptionPlansSnapshotKey(options);

  async function read(): Promise<SquareSubscriptionPlan[] | null> {
    try {
      const raw = await kv.get(key);
      if (raw === null) return null;
      const plans: unknown = JSON.parse(raw);
      if (!Array.isArray(plans)) throw new TypeError("The snapshot isn't a JSON array.");
      return plans as SquareSubscriptionPlan[];
    } catch (error) {
      reportDegraded(`${ASTROID_SUBSCRIPTION_PLANS_DEGRADED}.read`, error, { key });
      return null;
    }
  }

  async function refresh(config: SquareConfig): Promise<SquareSubscriptionPlan[]> {
    const plans = await listSubscriptionPlans(config);
    // The executor turns a synchronous throw from `put` (a missing binding)
    // into a rejection, so the write can't lose plans already fetched.
    await new Promise<void>((resolve) => {
      resolve(kv.put(key, JSON.stringify(plans), { expirationTtl: ttlSeconds }));
    }).catch((error: unknown) => {
      reportDegraded(`${ASTROID_SUBSCRIPTION_PLANS_DEGRADED}.write`, error, { key });
    });
    return plans;
  }

  return {
    key,
    read,
    refresh,
    async get(config, getOptions = {}) {
      if (!config) return getOptions.fallback ?? [];
      const cached = await read();
      if (cached) return cached;
      try {
        return await refresh(config);
      } catch (error) {
        reportDegraded(`${ASTROID_SUBSCRIPTION_PLANS_DEGRADED}.refresh`, error, { key });
        return [];
      }
    },
  };
}
