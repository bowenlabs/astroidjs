import type { SquareConfig, SquareSubscriptionPlan } from "louise-toolkit/commerce/square";
import { type DegradedEvent, onDegraded } from "louise-toolkit/errors";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ASTROID_SUBSCRIPTION_PLANS_DEGRADED,
  type SubscriptionPlansSnapshotKv,
  subscriptionPlansSnapshot,
  subscriptionPlansSnapshotKey,
} from "../src/commerce/subscription-plans.js";
import { AstroidUsageError } from "../src/errors.js";

// Square is stubbed at the toolkit's function rather than at `fetch`, so the
// tests pin the snapshot's behavior, not Square's response shape. The rest of
// the subpath is the published module, so the import still has to resolve.
const listSubscriptionPlans = vi.hoisted(() => vi.fn<(config: SquareConfig) => Promise<unknown>>());
vi.mock(import("louise-toolkit/commerce/square"), async (importOriginal) => ({
  ...(await importOriginal()),
  listSubscriptionPlans: listSubscriptionPlans as never,
}));

const config: SquareConfig = { accessToken: "test-access", environment: "production" };

const plan: SquareSubscriptionPlan = {
  id: "plan-beans",
  name: "Coffee subscription",
  allItems: false,
  eligibleItemIds: ["item-1"],
  eligibleCategoryIds: [],
  version: 1,
  presentAtAllLocations: true,
  presentAtLocationIds: [],
  absentAtLocationIds: [],
  variations: [],
};

function memoryKv(): SubscriptionPlansSnapshotKv & {
  data: Map<string, string>;
  puts: { key: string; ttl: number }[];
} {
  const data = new Map<string, string>();
  const puts: { key: string; ttl: number }[] = [];
  return {
    data,
    puts,
    get: async (key) => data.get(key) ?? null,
    put: async (key, value, options) => {
      puts.push({ key, ttl: options.expirationTtl });
      data.set(key, value);
    },
  };
}

// Every fallback reports through `reportDegraded`, which logs one line and
// tells incident capture; the listener is how a test sees what it reported.
const degrades: Pick<DegradedEvent, "name" | "message" | "details">[] = [];
const stop = onDegraded(({ name, message, details }) => degrades.push({ name, message, details }));
afterAll(stop);

let error: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  listSubscriptionPlans.mockReset();
  listSubscriptionPlans.mockResolvedValue([plan]);
  degrades.length = 0;
  error = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  error.mockRestore();
});

describe("subscriptionPlansSnapshotKey", () => {
  it("builds the key a site already writes, so an upgrade keeps the warm snapshot", () => {
    expect(subscriptionPlansSnapshotKey({ environment: "production", locationId: "L1" })).toBe(
      "square:subscription-plans:v1:production:L1",
    );
  });

  it("keys a missing environment as sandbox and a missing location as none", () => {
    expect(subscriptionPlansSnapshotKey()).toBe("square:subscription-plans:v1:sandbox:none");
    expect(subscriptionPlansSnapshotKey({ environment: "", locationId: null })).toBe(
      "square:subscription-plans:v1:sandbox:none",
    );
    expect(subscriptionPlansSnapshotKey({ locationId: "" })).toBe(
      "square:subscription-plans:v1:sandbox:none",
    );
  });
});

describe("subscriptionPlansSnapshot", () => {
  it("lets one app write the snapshot and another read it from the same namespace", async () => {
    const kv = memoryKv();
    // The app that runs the pipeline refreshes from the queue.
    const writer = subscriptionPlansSnapshot({ kv, environment: "production", locationId: "L1" });
    expect(await writer.refresh(config)).toEqual([plan]);

    // A second app, configured on its own, reads without calling Square.
    const reader = subscriptionPlansSnapshot({ kv, environment: "production", locationId: "L1" });
    expect(reader.key).toBe(writer.key);
    expect(await reader.read()).toEqual([plan]);
    expect(await reader.get(config)).toEqual([plan]);
    expect(listSubscriptionPlans).toHaveBeenCalledOnce();

    // Another location's reader shares the binding but not the snapshot.
    const elsewhere = subscriptionPlansSnapshot({
      kv,
      environment: "production",
      locationId: "L2",
    });
    expect(await elsewhere.read()).toBeNull();
  });

  it("writes with the default two-hour TTL, or the one given", async () => {
    const kv = memoryKv();
    await subscriptionPlansSnapshot({ kv }).refresh(config);
    await subscriptionPlansSnapshot({ kv, locationId: "L1", ttlSeconds: 600 }).refresh(config);
    expect(kv.puts).toEqual([
      { key: "square:subscription-plans:v1:sandbox:none", ttl: 7200 },
      { key: "square:subscription-plans:v1:sandbox:L1", ttl: 600 },
    ]);
  });

  it("refreshes on a cold miss and keeps what it fetched", async () => {
    const kv = memoryKv();
    const plans = subscriptionPlansSnapshot({ kv });
    expect(await plans.read()).toBeNull();
    expect(await plans.get(config)).toEqual([plan]);
    expect(listSubscriptionPlans).toHaveBeenCalledWith(config);
    expect(JSON.parse(kv.data.get(plans.key) ?? "null")).toEqual([plan]);
    // A miss is the snapshot working, not a degrade.
    expect(degrades).toEqual([]);
  });

  it("returns an empty snapshot as it is, without calling Square", async () => {
    const kv = memoryKv();
    const plans = subscriptionPlansSnapshot({ kv });
    kv.data.set(plans.key, "[]");
    expect(await plans.get(config)).toEqual([]);
    expect(listSubscriptionPlans).not.toHaveBeenCalled();
  });

  it("refreshes when the KV read throws", async () => {
    const plans = subscriptionPlansSnapshot({
      kv: {
        get: () => Promise.reject(new Error("KV down")),
        put: async () => {},
      },
    });
    expect(await plans.read()).toBeNull();
    expect(await plans.get(config)).toEqual([plan]);
    expect(degrades[0]).toEqual({
      name: "commerce.subscriptionPlans.read",
      message: "Error: KV down",
      details: { key: plans.key },
    });
  });

  it("refreshes when the snapshot isn't a JSON array", async () => {
    for (const raw of ["{not json", '{"plans":[]}', "null"]) {
      const kv = memoryKv();
      const plans = subscriptionPlansSnapshot({ kv });
      kv.data.set(plans.key, raw);
      expect(await plans.read()).toBeNull();
      expect(await plans.get(config)).toEqual([plan]);
    }
    expect(listSubscriptionPlans).toHaveBeenCalledTimes(3);
    expect(new Set(degrades.map((d) => d.name))).toEqual(
      new Set([`${ASTROID_SUBSCRIPTION_PLANS_DEGRADED}.read`]),
    );
  });

  it("returns the plans when the KV write fails, rejecting or throwing", async () => {
    const rejecting = subscriptionPlansSnapshot({
      kv: { get: async () => null, put: () => Promise.reject(new Error("KV down")) },
    });
    expect(await rejecting.refresh(config)).toEqual([plan]);

    const throwing = subscriptionPlansSnapshot({
      kv: {
        get: async () => null,
        put: () => {
          throw new Error("binding missing");
        },
      },
    });
    expect(await throwing.get(config)).toEqual([plan]);
    expect(degrades.map(({ name, message }) => ({ name, message }))).toEqual([
      { name: "commerce.subscriptionPlans.write", message: "Error: KV down" },
      { name: "commerce.subscriptionPlans.write", message: "Error: binding missing" },
    ]);
  });

  it("returns the fallback, or [], without Square configured", async () => {
    const plans = subscriptionPlansSnapshot({ kv: memoryKv() });
    expect(await plans.get(null)).toEqual([]);
    expect(await plans.get(null, { fallback: [plan] })).toEqual([plan]);
    expect(listSubscriptionPlans).not.toHaveBeenCalled();
  });

  it("returns [] and reports when the refresh fails, so a product page still renders", async () => {
    listSubscriptionPlans.mockRejectedValue(new Error("Square down"));
    const plans = subscriptionPlansSnapshot({ kv: memoryKv() });
    expect(await plans.get(config)).toEqual([]);
    expect(degrades).toEqual([
      {
        name: "commerce.subscriptionPlans.refresh",
        message: "Error: Square down",
        details: { key: plans.key },
      },
    ]);
    // reportDegraded's own line is the only log: no second console line.
    expect(error).toHaveBeenCalledOnce();
    expect(error.mock.calls[0]?.[0]).toMatch(
      /^\[louise\] degraded commerce\.subscriptionPlans\.refresh: Error: Square down/,
    );
  });

  it("throws from refresh when Square fails, so a queue message retries", async () => {
    listSubscriptionPlans.mockRejectedValue(new Error("Square down"));
    const kv = memoryKv();
    await expect(subscriptionPlansSnapshot({ kv }).refresh(config)).rejects.toThrow("Square down");
    expect(kv.puts).toEqual([]);
    // The caller owns this failure, so nothing is reported here.
    expect(degrades).toEqual([]);
  });

  it("refuses a TTL under KV's floor or one that isn't whole", () => {
    for (const ttlSeconds of [59, 0, -1, 90.5, Number.NaN]) {
      expect(() => subscriptionPlansSnapshot({ kv: memoryKv(), ttlSeconds })).toThrow(
        AstroidUsageError,
      );
    }
    expect(() => subscriptionPlansSnapshot({ kv: memoryKv(), ttlSeconds: 60 })).not.toThrow();
  });
});
