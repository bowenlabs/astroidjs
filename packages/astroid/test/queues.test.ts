import { describe, expect, it, vi } from "vitest";
import type { AstroidConfig } from "../src/config.js";
import { defineAstroid } from "../src/config.js";
import { AstroidConfigError } from "../src/errors.js";
import { generateAstroidProject, generateAstroidWrangler } from "../src/project/generate.js";
import { astroidWranglerQueues, checkWranglerQueues } from "../src/project/queues.js";
import { astroidQueueHandler } from "../src/queues/consumer.js";
import {
  affectsCatalog,
  type AstroidQueueMessage,
  astroidCron,
  astroidCrons,
  astroidQueueNames,
  astroidUsesQueues,
} from "../src/queues/messages.js";
import { generateAstroidQueueSeam, generateAstroidWebhookRoute } from "../src/queues/scaffold.js";
import { astroidQueue, handleWebhook } from "../src/queues/webhook.js";
import { generateAstroidWorker } from "../src/worker/generate.js";

const base: AstroidConfig = {
  key: "acme",
  archetype: "marketing",
  theme: { name: "Acme", colors: { brand: "#1f6e6d" } },
};
const shop: AstroidConfig = {
  ...base,
  archetype: "storefront",
  commerce: { provider: "square" },
  business: { currency: "EUR" },
};

describe("astroidUsesQueues / astroidCron", () => {
  it("switches on with commerce, because a webhook processed inline is a webhook you drop", () => {
    expect(astroidUsesQueues(base)).toBe(false);
    expect(astroidUsesQueues(shop)).toBe(true);
  });

  it("can be forced either way", () => {
    expect(astroidUsesQueues({ ...base, queues: { enabled: true } })).toBe(true);
    expect(astroidUsesQueues({ ...shop, queues: { enabled: false } })).toBe(false);
  });

  it("defaults to an hourly cron, honours an override, and `false` disables it", () => {
    expect(astroidCron(shop)).toBe("0 * * * *");
    expect(astroidCron({ ...shop, queues: { cron: "*/15 * * * *" } })).toBe("*/15 * * * *");
    expect(astroidCron({ ...shop, queues: { cron: false } })).toBeNull();
    // No consumer → nothing to schedule.
    expect(astroidCron(base)).toBeNull();
  });

  it("names a new scaffold's queue and its DLQ off the project key", () => {
    expect(astroidQueueNames(shop)).toEqual({ queue: "acme-commerce", dlq: "acme-commerce-dlq" });
  });
});

describe("affectsCatalog", () => {
  it("matches a provider's catalog event prefixes", () => {
    expect(affectsCatalog("square", "catalog.version.updated")).toBe(true);
    expect(affectsCatalog("square", "inventory.count.updated")).toBe(true);
    expect(affectsCatalog("stripe", "price.updated")).toBe(true);
    expect(affectsCatalog("fourthwall", "product.created")).toBe(true);
  });

  it("ignores order/payment traffic — nothing local to update", () => {
    // These arrive in volume on a busy day; treating them as actionable turns
    // a good sales day into a refresh storm.
    expect(affectsCatalog("square", "payment.created")).toBe(false);
    expect(affectsCatalog("square", "order.updated")).toBe(false);
    expect(affectsCatalog("stripe", "charge.succeeded")).toBe(false);
  });

  it("is inert for an unknown provider rather than matching everything", () => {
    expect(affectsCatalog("mystery", "catalog.updated")).toBe(false);
  });
});

describe("astroidQueueHandler", () => {
  const msg = (over: Partial<AstroidQueueMessage> = {}): AstroidQueueMessage =>
    ({
      kind: "webhook",
      provider: "square",
      type: "catalog.version.updated",
      payload: {},
      ...over,
    }) as AstroidQueueMessage;

  it("refreshes on a periodic refresh and on catalog-affecting webhooks only", async () => {
    const refreshCatalog = vi.fn();
    const handle = astroidQueueHandler({ refreshCatalog });

    await handle({ kind: "catalog_refresh" });
    expect(refreshCatalog).toHaveBeenCalledTimes(1);

    await handle(msg());
    expect(refreshCatalog).toHaveBeenCalledTimes(2);

    await handle(msg({ type: "payment.created" } as Partial<AstroidQueueMessage>));
    expect(refreshCatalog).toHaveBeenCalledTimes(2);
  });

  it("propagates a refresh failure so the message retries", async () => {
    // A failed refresh means the site is serving stale data—retry is right.
    const handle = astroidQueueHandler({
      refreshCatalog: () => {
        throw new Error("upstream down");
      },
    });
    await expect(handle({ kind: "catalog_refresh" })).rejects.toThrow("upstream down");
  });

  it("runs onMessage for every message, after the catalog dispatch", async () => {
    const order: string[] = [];
    const handle = astroidQueueHandler({
      refreshCatalog: () => {
        order.push("refresh");
      },
      onMessage: () => {
        order.push("onMessage");
      },
    });
    await handle({ kind: "catalog_refresh" });
    expect(order).toEqual(["refresh", "onMessage"]);
  });

  it("acks harmlessly with no options at all", async () => {
    await expect(astroidQueueHandler()({ kind: "catalog_refresh" })).resolves.toBeUndefined();
  });

  // The two-provider case (#294). A site can run Fourthwall as its storefront
  // and Square as its POS; `refreshCatalog` then means "re-sync Fourthwall", but
  // Square emits `inventory.count.updated` on every single sale. Without the
  // triggering message the seam cannot tell the two apart, so a busy Saturday
  // becomes a sync storm against an unrelated provider's rate limit.
  it("tells the seam what triggered it, so a two-provider site can branch", async () => {
    const refreshed: (AstroidQueueMessage | undefined)[] = [];
    const handle = astroidQueueHandler({
      refreshCatalog: (message) => {
        refreshed.push(message);
      },
    });

    await handle({ kind: "catalog_refresh" });
    await handle(msg({ provider: "square", type: "inventory.count.updated" } as never));

    expect(refreshed).toEqual([
      { kind: "catalog_refresh" },
      { kind: "webhook", provider: "square", type: "inventory.count.updated", payload: {} },
    ]);
  });

  it("still accepts a zero-arg seam, since branching is opt-in", async () => {
    const refreshCatalog = vi.fn(() => {});
    const handle = astroidQueueHandler({ refreshCatalog });
    await handle(msg());
    expect(refreshCatalog).toHaveBeenCalledTimes(1);
  });

  it("scopes the refresh to the catalog's own provider when told which it is", async () => {
    const refreshCatalog = vi.fn();
    const handle = astroidQueueHandler({ refreshCatalog, catalogProvider: "fourthwall" });

    // Square's events are catalog-affecting FOR SQUARE, and entirely irrelevant
    // to a catalog that lives in Fourthwall. `inventory.count.updated` is the
    // dangerous one: Square emits it on every sale.
    await handle(msg({ provider: "square", type: "inventory.count.updated" } as never));
    await handle(msg({ provider: "square", type: "catalog.version.updated" } as never));
    expect(refreshCatalog).not.toHaveBeenCalled();

    await handle(msg({ provider: "fourthwall", type: "product.updated" } as never));
    expect(refreshCatalog).toHaveBeenCalledTimes(1);

    // The periodic re-sync is never provider-scoped—it IS the safety net.
    await handle({ kind: "catalog_refresh" });
    expect(refreshCatalog).toHaveBeenCalledTimes(2);
  });

  it("refreshes for every provider when unscoped, as it always has", async () => {
    const refreshCatalog = vi.fn();
    const handle = astroidQueueHandler({ refreshCatalog });
    await handle(msg({ provider: "square", type: "inventory.count.updated" } as never));
    await handle(msg({ provider: "fourthwall", type: "product.updated" } as never));
    expect(refreshCatalog).toHaveBeenCalledTimes(2);
  });
});

describe("handleWebhook", () => {
  const url = new URL("https://acme.coffee/api/webhooks/square");
  const req = (body: string) => new Request(url, { method: "POST", body });
  const queue = () => ({ send: vi.fn(async (_message: AstroidQueueMessage) => {}) });

  it("enqueues a verified event and answers 202", async () => {
    const q = queue();
    const res = await handleWebhook(req('{"type":"catalog.version.updated"}'), url, {
      provider: "square",
      secret: "real",
      queue: q,
      verify: () => true,
    });
    // 202, not 200: accepted for processing, which is the point of enqueuing.
    expect(res.status).toBe(202);
    expect(q.send).toHaveBeenCalledWith({
      kind: "webhook",
      provider: "square",
      type: "catalog.version.updated",
      payload: { type: "catalog.version.updated" },
    });
  });

  it("verifies the RAW body, before anything parses it", async () => {
    const raw = '{"type":"a"}';
    const verify = vi.fn(() => true);
    await handleWebhook(req(raw), url, {
      provider: "square",
      secret: "sk",
      queue: queue(),
      verify,
    });
    expect(verify).toHaveBeenCalledWith(
      expect.objectContaining({ raw, secret: "sk", url, headers: expect.any(Headers) }),
    );
  });

  it("rejects a bad signature terminally (401), without parsing or enqueuing", async () => {
    // A signature that fails now will fail on retry; asking the provider to keep
    // trying turns a misconfiguration into a self-inflicted flood.
    const q = queue();
    const res = await handleWebhook(req("not even json"), url, {
      provider: "square",
      secret: "real",
      queue: q,
      verify: () => false,
    });
    expect(res.status).toBe(401);
    expect(q.send).not.toHaveBeenCalled();
  });

  it("treats a throwing verifier as a failed signature, not a crash", async () => {
    const res = await handleWebhook(req("{}"), url, {
      provider: "square",
      secret: "real",
      queue: queue(),
      verify: () => {
        throw new Error("bad key length");
      },
    });
    expect(res.status).toBe(401);
  });

  it("answers 503 while the module is dormant, so events aren't lost", async () => {
    // 5xx keeps the provider retrying: deliveries during the gap land once the
    // secret is provisioned, instead of being acked into the void.
    const res = await handleWebhook(req("{}"), url, {
      provider: "square",
      secret: null,
      queue: queue(),
      verify: () => true,
    });
    expect(res.status).toBe(503);
  });

  it("answers 503 when the queue isn't provisioned", async () => {
    const res = await handleWebhook(req('{"type":"a"}'), url, {
      provider: "square",
      secret: "real",
      queue: null,
      verify: () => true,
    });
    expect(res.status).toBe(503);
  });

  it("runs the event inline when the queue is absent, as on a staging Preview", async () => {
    const inline = vi.fn(async (_message: AstroidQueueMessage) => {});
    const res = await handleWebhook(req('{"type":"catalog.version.updated"}'), url, {
      provider: "square",
      secret: "real",
      queue: undefined,
      inline,
      verify: () => true,
    });
    // 200, not 202: the work already happened.
    expect(res.status).toBe(200);
    expect(inline).toHaveBeenCalledWith({
      kind: "webhook",
      provider: "square",
      type: "catalog.version.updated",
      payload: { type: "catalog.version.updated" },
    });
  });

  it("prefers the queue when both are there, and asks for redelivery when inline fails", async () => {
    const q = queue();
    const inline = vi.fn(async () => {});
    await handleWebhook(req('{"type":"a"}'), url, {
      provider: "square",
      secret: "real",
      queue: q,
      inline,
      verify: () => true,
    });
    expect(q.send).toHaveBeenCalledOnce();
    expect(inline).not.toHaveBeenCalled();

    const res = await handleWebhook(req('{"type":"a"}'), url, {
      provider: "square",
      secret: "real",
      inline: async () => {
        throw new Error("D1 down");
      },
      verify: () => true,
    });
    expect(res.status).toBe(503);
  });

  it("asks for redelivery (503) when enqueuing fails", async () => {
    // The signature checked out, so the event is real and worth keeping.
    const res = await handleWebhook(req('{"type":"a"}'), url, {
      provider: "square",
      secret: "real",
      queue: {
        send: async () => {
          throw new Error("queue down");
        },
      },
      verify: () => true,
    });
    expect(res.status).toBe(503);
  });

  it("rejects an unparseable body terminally (400)", async () => {
    const res = await handleWebhook(req("<html>"), url, {
      provider: "square",
      secret: "real",
      queue: queue(),
      verify: () => true,
    });
    expect(res.status).toBe(400);
  });

  it("acks without enqueuing when `accept` filters the event out", async () => {
    const q = queue();
    const res = await handleWebhook(req('{"type":"payment.created"}'), url, {
      provider: "square",
      secret: "real",
      queue: q,
      verify: () => true,
      accept: (type) => type.startsWith("catalog."),
    });
    expect(res.status).toBe(202);
    expect(q.send).not.toHaveBeenCalled();
  });

  it("uses a custom event-type reader, and tolerates a missing type", async () => {
    const q = queue();
    await handleWebhook(req('{"event":{"name":"product.created"}}'), url, {
      provider: "fourthwall",
      secret: "real",
      queue: q,
      verify: () => true,
      eventType: (p) => (p as { event: { name: string } }).event.name,
    });
    expect(q.send.mock.calls[0][0]).toMatchObject({ type: "product.created" });

    const q2 = queue();
    await handleWebhook(req("{}"), url, {
      provider: "square",
      secret: "real",
      queue: q2,
      verify: () => true,
    });
    expect(q2.send.mock.calls[0][0]).toMatchObject({ type: "" });
  });
});

describe("generated worker", () => {
  it("carries no QUEUE machinery without queues", () => {
    const out = generateAstroidWorker(base);
    expect(out).not.toContain("queue:");
    expect(out).not.toContain("processBatch");
    expect(out).not.toContain("./queue.js");
    // `scheduled:` IS present—the daily health scan runs on every project,
    // queues or not. What must be absent is the catalog dispatch.
    expect(out).toContain("scheduled:");
    expect(out).not.toContain("catalog_refresh");
  });

  it("composes fetch + queue + scheduled when commerce is on", () => {
    const out = generateAstroidWorker(shop);
    expect(out).toContain('import { processBatch } from "louise-toolkit/queues";');
    expect(out).toContain('import { handleQueueMessage } from "./queue.js";');
    expect(out).toContain("queue: (batch, env, ctx) =>");
    expect(out).toContain(": processBatch(batch, (message) => handleQueueMessage(env, message), {");
    expect(out).toContain("scheduled:");
    // The cron ENQUEUES rather than running inline, so the refresh takes the
    // same retry + DLQ path as everything else.
    expect(out).toContain('env.COMMERCE_QUEUE.send({ kind: "catalog_refresh" })');
  });

  it("keeps the consumer but drops the CATALOG cron when it's disabled", () => {
    const out = generateAstroidWorker({ ...shop, queues: { cron: false } });
    expect(out).toContain("queue: (batch, env, ctx) =>");
    // The handler survives for the health scan; only the catalog re-sync goes.
    expect(out).toContain("scheduled:");
    expect(out).not.toContain("catalog_refresh");
  });
});

describe("generated wrangler", () => {
  it("omits the queues block without a consumer, but keeps the health cron", () => {
    const out = generateAstroidWrangler(base);
    expect(out).not.toContain('"queues"');
    // Every project schedules the daily health scan, so `triggers` always
    // exists—with exactly one entry when there's no catalog to re-sync.
    expect(out).toContain('"triggers": { "crons": ["17 4 * * *"] }');
  });

  it("emits the producer, consumer, DLQ, and cron", () => {
    const out = generateAstroidWrangler(shop);
    // Health first, then the catalog re-sync—the order `astroidCrons` emits.
    expect(out).toContain('"triggers": { "crons": ["17 4 * * *","0 * * * *"] }');
    expect(out).toContain('"queue": "acme-commerce", "binding": "COMMERCE_QUEUE"');
    expect(out).toContain('"dead_letter_queue": "acme-commerce-dlq"');
    expect(out).toContain('"max_retries": 5');
    // A wait between deliveries, so a failing provider isn't hit again the
    // same second (#61).
    expect(out).toContain('"retry_delay": 30');
  });

  it("honours tuned batch + retry settings", () => {
    const out = generateAstroidWrangler({
      ...shop,
      queues: { maxRetries: 2, maxBatchSize: 25, maxBatchTimeout: 5, retryDelay: 120 },
    });
    expect(out).toContain('"max_retries": 2');
    expect(out).toContain('"retry_delay": 120');
    expect(out).toContain('"max_batch_size": 25');
    expect(out).toContain('"max_batch_timeout": 5');
  });
});

describe("scaffold-once files", () => {
  it("emits a consumer seam that delegates to astroidQueueHandler", () => {
    const out = generateAstroidQueueSeam(shop);
    expect(out).toContain("astroidQueueHandler, type AstroidQueueMessage }");
    expect(out).toContain("export async function handleQueueMessage(");
    expect(out).toContain("refreshCatalog:");
    // One provider owns everything, so scoping would be noise.
    expect(out).not.toContain("catalogProvider:");
  });

  it("exports commerceQueue, which falls back to the handler on a Preview (#69)", () => {
    const out = generateAstroidQueueSeam(shop);
    expect(out).toContain(
      'import { astroidQueue, astroidQueueHandler, type AstroidQueueMessage } from "astroidjs";',
    );
    expect(out).toContain("export function commerceQueue(env: CloudflareEnv) {");
    expect(out).toContain(
      "return astroidQueue(env.COMMERCE_QUEUE, (message) => handleQueueMessage(env, message));",
    );
  });

  it("leaves retries to the queue, not the client (#61)", () => {
    // Client retries multiply with queue redeliveries: 4 calls per delivery
    // across 6 deliveries is 24 calls for one message.
    const square = generateAstroidQueueSeam(shop);
    expect(square).not.toContain("takes `retry: { attempts: 3 }`");
    expect(square).toContain("Leave SquareConfig's `retry` off here.");
    const fourthwall = generateAstroidQueueSeam({ ...shop, commerce: { provider: "fourthwall" } });
    expect(fourthwall).toContain("Leave the client's own retries off here.");
  });

  it("scopes the refresh when a project runs two commerce providers (#294)", () => {
    const out = generateAstroidQueueSeam({
      ...shop,
      commerce: { storefront: "fourthwall", pos: "square" },
    });
    // The catalog is the STOREFRONT's; the POS provider must not trigger its
    // re-sync, or every in-person sale re-pulls an unrelated provider.
    expect(out).toContain('catalogProvider: "fourthwall",');
  });

  it("emits a provider-specific webhook route", () => {
    const square = generateAstroidWebhookRoute(shop);
    expect(square).toContain(
      'import { verifySquareSignature } from "louise-toolkit/commerce/square";',
    );
    expect(square).toContain('const HEADER = "x-square-hmacsha256-signature";');
    // Square signs notificationUrl + body, so the URL must reach the verifier.
    expect(square).toContain("verifySquareSignature(url.href, raw,");
    expect(square).toContain("readModuleSecret(env.SQUARE_WEBHOOK_SECRET)");
    // A Preview has no queue, so the route sends through the seam's
    // `commerceQueue`, which falls back to the consumer's handler (#69).
    expect(square).toContain('import { commerceQueue } from "../../../queue";');
    expect(square).toContain("queue: commerceQueue(env),");
    expect(square).not.toContain("inline:");

    const stripe = generateAstroidWebhookRoute({ ...shop, commerce: { provider: "stripe" } });
    expect(stripe).toContain("verifyStripeSignature(raw,");
    expect(stripe).toContain("Math.floor(Date.now() / 1000)");
    expect(stripe).toContain('const HEADER = "stripe-signature";');

    const fw = generateAstroidWebhookRoute({ ...shop, commerce: { provider: "fourthwall" } });
    expect(fw).toContain("verifyFourthwallSignature(raw, headers.get(HEADER), secret)");
  });

  it("emits no webhook route without a commerce provider", () => {
    expect(generateAstroidWebhookRoute(base)).toBeNull();
  });
});

describe("AstroidConfig.crons (#306)", () => {
  const withCrons: AstroidConfig = {
    ...shop,
    crons: [
      { expression: "*/15 * * * *", message: { kind: "inventory_pull" } },
      { expression: "30 3 * * *", message: { kind: "nightly_reconcile" } },
    ],
  };

  it("emits every cron into triggers.crons, derived ones first", () => {
    const out = generateAstroidWrangler(withCrons);
    expect(out).toContain(
      '"triggers": { "crons": ["17 4 * * *","0 * * * *","*/15 * * * *","30 3 * * *"] }',
    );
  });

  it("dispatches every declared cron — the invariant the whole feature is for", () => {
    // A trigger with no matching branch is a job Cloudflare fires and nothing
    // handles, with no error anywhere.
    const worker = generateAstroidWorker(withCrons);
    for (const cron of astroidCrons(withCrons)) {
      expect(worker, `cron ${cron} is declared but never dispatched`).toContain(
        `controller.cron === ${JSON.stringify(cron)}`,
      );
    }
  });

  it("enqueues the message rather than running it inline", () => {
    const worker = generateAstroidWorker(withCrons);
    expect(worker).toContain('env.COMMERCE_QUEUE.send({"kind":"inventory_pull"})');
    expect(worker).toContain('env.COMMERCE_QUEUE.send({"kind":"nightly_reconcile"})');
  });

  it("refuses a cron that collides with a derived one", () => {
    // The dispatch matches in order, so a duplicate never reaches its own
    // branch: Cloudflare fires it, the health scan handles it, and the config
    // reads as though both are live.
    expect(() =>
      defineAstroid({ ...shop, crons: [{ expression: "17 4 * * *", message: {} }] }),
    ).toThrow(/already belongs to the daily health scan/);

    expect(() =>
      defineAstroid({ ...shop, crons: [{ expression: "0 * * * *", message: {} }] }),
    ).toThrow(/already belongs to the catalog re-sync/);
  });

  it("refuses two crons that collide with each other", () => {
    expect(() =>
      defineAstroid({
        ...shop,
        crons: [
          { expression: "*/15 * * * *", message: { a: 1 } },
          { expression: "*/15 * * * *", message: { b: 2 } },
        ],
      }),
    ).toThrow(/already belongs to another entry/);
  });

  it("refuses crons with no queue to send to", () => {
    expect(() =>
      defineAstroid({ ...base, crons: [{ expression: "*/15 * * * *", message: {} }] }),
    ).toThrow(/needs the queue consumer/);
  });

  it("is inert when unset — no extra triggers, no extra branches", () => {
    expect(astroidCrons(shop)).toEqual(["17 4 * * *", "0 * * * *"]);
    expect(() => defineAstroid(shop)).not.toThrow();
  });
});

describe("astroidQueue (#69)", () => {
  const message: AstroidQueueMessage = { kind: "catalog_refresh" };

  it("returns the binding itself when it's bound, and never runs the handler", async () => {
    const binding = { send: vi.fn(async () => ({})) };
    const handler = vi.fn(async () => {});
    const producer = astroidQueue(binding, handler);
    expect(producer).toBe(binding);
    await producer.send(message);
    expect(handler).not.toHaveBeenCalled();
  });

  it("runs the handler in the request when the binding is absent", async () => {
    for (const unbound of [undefined, null]) {
      const handler = vi.fn(async () => {});
      await astroidQueue(unbound, handler).send(message);
      expect(handler).toHaveBeenCalledWith(message);
    }
  });

  it("throws what the handler throws, so a webhook asks for redelivery", async () => {
    const producer = astroidQueue(undefined, async () => {
      throw new Error("D1 down");
    });
    await expect(producer.send(message)).rejects.toThrow("D1 down");
    const res = await handleWebhook(
      new Request("https://acme.com/api/webhooks/square", { method: "POST", body: '{"type":"a"}' }),
      new URL("https://acme.com/api/webhooks/square"),
      { provider: "square", secret: "real", queue: producer, verify: () => true },
    );
    expect(res.status).toBe(503);
  });
});

/**
 * A wrangler.jsonc whose queues predate the project key: the config says
 * `acme`, but the queues were created as `acme-legacy-*`, so nothing derived
 * from the key matches them.
 */
function legacyWrangler({
  dlq = "acme-legacy-commerce-dlq",
  consumeDlq = true,
}: { dlq?: string | null; consumeDlq?: boolean } = {}): string {
  const deadLetter = dlq ? `, "dead_letter_queue": "${dlq}"` : "";
  const dlqConsumer =
    dlq && consumeDlq
      ? `,\n      { "queue": "${dlq}", "max_batch_size": 10, "max_retries": 0 }`
      : "";
  return `{
  // Created before the site had its key.
  "name": "acme",
  "queues": {
    "producers": [{ "queue": "acme-legacy-commerce", "binding": "COMMERCE_QUEUE" }],
    "consumers": [
      { "queue": "acme-legacy-commerce", "max_retries": 5${deadLetter} }${dlqConsumer},
    ],
  },
}`;
}

const workerOf = (config: AstroidConfig, wrangler?: string | null) =>
  generateAstroidProject(config, { wrangler }).find((f) => f.path === "src/worker.ts")!.contents;

describe("astroidWranglerQueues", () => {
  it("reads a new scaffold's names back out of its wrangler.jsonc", () => {
    expect(astroidWranglerQueues(generateAstroidWrangler(shop))).toEqual({
      queue: "acme-commerce",
      deadLetterQueue: "acme-commerce-dlq",
      consumers: ["acme-commerce", "acme-commerce-dlq"],
    });
  });

  it("follows the COMMERCE_QUEUE producer, whatever the queue is called", () => {
    expect(astroidWranglerQueues(legacyWrangler())).toEqual({
      queue: "acme-legacy-commerce",
      deadLetterQueue: "acme-legacy-commerce-dlq",
      consumers: ["acme-legacy-commerce", "acme-legacy-commerce-dlq"],
    });
  });

  it("reports no dead-letter queue when the consumer names none, or there's no producer", () => {
    expect(astroidWranglerQueues(legacyWrangler({ dlq: null })).deadLetterQueue).toBeNull();
    expect(astroidWranglerQueues('{ "name": "acme" }')).toEqual({
      queue: null,
      deadLetterQueue: null,
      consumers: [],
    });
  });

  it("refuses a wrangler.jsonc that doesn't parse, rather than guessing a name", () => {
    expect(() => astroidWranglerQueues("{ not json")).toThrow(AstroidConfigError);
  });
});

describe("the generated worker's dead-letter queue", () => {
  it("is the name wrangler.jsonc gives it, even when the key differs", () => {
    const out = workerOf(shop, legacyWrangler());
    expect(out).toContain('const DEAD_LETTER_QUEUE = "acme-legacy-commerce-dlq";');
    expect(out).not.toContain("acme-commerce-dlq");
    expect(out).toContain("batch.queue === DEAD_LETTER_QUEUE");
  });

  it("is left out when wrangler.jsonc names none, so every batch goes to processBatch", () => {
    const out = workerOf(shop, legacyWrangler({ dlq: null }));
    expect(out).not.toContain("DEAD_LETTER_QUEUE");
    expect(out).not.toContain("deadLetterConsumer");
    expect(out).toContain(
      'import { analyticsIncidents, d1Incidents } from "louise-toolkit/incidents";',
    );
    expect(out).toContain("queue: (batch, env) =>");
    expect(out).toContain("processBatch(batch, (message) => handleQueueMessage(env, message), {");
  });

  it("follows wrangler.jsonc in an app with no editor too", () => {
    const app: AstroidConfig = { ...shop, editor: false };
    expect(workerOf(app, legacyWrangler())).toContain(
      'const DEAD_LETTER_QUEUE = "acme-legacy-commerce-dlq";',
    );
  });

  it("is the scaffold's name before wrangler.jsonc exists, the same worker a fresh site gets", () => {
    const fresh = generateAstroidWrangler(shop);
    expect(workerOf(shop)).toBe(workerOf(shop, fresh));
    expect(workerOf(shop, null)).toBe(generateAstroidWorker(shop));
    expect(workerOf(shop)).toContain('const DEAD_LETTER_QUEUE = "acme-commerce-dlq";');
  });

  it("never reads wrangler.jsonc for a project with no queue", () => {
    expect(() => generateAstroidProject(base, { wrangler: "{ not json" })).not.toThrow();
  });
});

describe("checkWranglerQueues", () => {
  it("passes a worker generated from the same wrangler.jsonc", () => {
    const wrangler = legacyWrangler();
    const findings = checkWranglerQueues(shop, wrangler, workerOf(shop, wrangler));
    expect(findings.errors).toEqual([]);
    expect(findings.warnings).toEqual([]);
    expect(findings.ok).toEqual([
      "wrangler: dead-letter queue `acme-legacy-commerce-dlq` has a consumer",
      "src/worker.ts captures dead letters from `acme-legacy-commerce-dlq`",
    ]);
  });

  it("flags a worker whose constant came from the key instead of wrangler.jsonc", () => {
    const stale = generateAstroidWorker(shop);
    const findings = checkWranglerQueues(shop, legacyWrangler(), stale);
    expect(findings.errors).toHaveLength(1);
    expect(findings.errors[0]).toContain("captures dead letters from `acme-commerce-dlq`");
    expect(findings.errors[0]).toContain("`acme-legacy-commerce-dlq`");
    expect(findings.errors[0]).toContain("astroid generate");
  });

  it("flags a worker that captures no dead letters while wrangler.jsonc routes them", () => {
    const none = workerOf(shop, legacyWrangler({ dlq: null }));
    expect(checkWranglerQueues(shop, legacyWrangler(), none).errors[0]).toContain(
      "doesn't capture dead letters",
    );
    expect(
      checkWranglerQueues(shop, legacyWrangler({ dlq: null }), workerOf(shop, legacyWrangler()))
        .errors[0],
    ).toContain("names no dead-letter queue");
  });

  it("warns about a dead-letter queue with no consumer", () => {
    const wrangler = legacyWrangler({ consumeDlq: false });
    const findings = checkWranglerQueues(shop, wrangler, workerOf(shop, wrangler));
    expect(findings.errors).toEqual([]);
    expect(findings.warnings).toHaveLength(1);
    expect(findings.warnings[0]).toContain("but nothing consumes it");
    expect(findings.warnings[0]).toContain('{ "queue": "acme-legacy-commerce-dlq"');
  });

  it("warns when the commerce queue names no dead-letter queue", () => {
    const wrangler = legacyWrangler({ dlq: null });
    const findings = checkWranglerQueues(shop, wrangler, workerOf(shop, wrangler));
    expect(findings.errors).toEqual([]);
    expect(findings.warnings[0]).toContain("names no `dead_letter_queue`");
  });

  it("stays quiet when there's no queue, nothing to read, or no worker yet", () => {
    const empty = { ok: [], errors: [], warnings: [] };
    expect(checkWranglerQueues(base, legacyWrangler(), null)).toEqual(empty);
    expect(checkWranglerQueues(shop, "{ not json", null)).toEqual(empty);
    expect(checkWranglerQueues(shop, '{ "name": "acme" }', null)).toEqual(empty);
    expect(checkWranglerQueues(shop, legacyWrangler(), null).errors).toEqual([]);
  });
});
