import { describe, expect, it } from "vitest";
import { commerceSecretNames, resolveCommerceStatus } from "../src/commerce/secrets.js";
import { type AstroidConfig, defineAstroid } from "../src/config.js";
import { generateAstroidSecretsEnv, generateAstroidWrangler } from "../src/project/generate.js";
import { generateAstroidScaffoldFiles } from "../src/project/scaffold.js";
import {
  ASTROID_HEALTH_CRON,
  astroidCommercePipeline,
  astroidCron,
  astroidCrons,
  astroidUsesQueues,
} from "../src/queues/messages.js";
import { generateAstroidWebhookRoutes } from "../src/queues/scaffold.js";
import { astroidCspOrigins } from "../src/security/csp-origins.js";
import { astroidRateRules } from "../src/security/rate-rules.js";
import { generateAstroidWorker } from "../src/worker/generate.js";

const base: AstroidConfig = {
  key: "acme",
  archetype: "storefront",
  theme: { name: "Acme", colors: { brand: "#1f6e6d" } },
};
const piped: AstroidConfig = { ...base, commerce: { provider: "square" } };
/** Takes payments; another project receives the webhooks and re-syncs. */
const payOnly: AstroidConfig = { ...base, commerce: { provider: "square", pipeline: false } };

describe("commerce.pipeline: false", () => {
  it("runs no queue, no catalog cron, and no webhook receiver", () => {
    expect(astroidCommercePipeline(piped)).toBe(true);
    expect(astroidCommercePipeline(payOnly)).toBe(false);
    expect(astroidUsesQueues(payOnly)).toBe(false);
    expect(astroidCron(payOnly)).toBeNull();
    expect(astroidCrons(payOnly)).toEqual([ASTROID_HEALTH_CRON]);
    expect(generateAstroidWebhookRoutes(payOnly)).toEqual([]);

    const paths = generateAstroidScaffoldFiles(payOnly).map((f) => f.path);
    expect(paths).not.toContain("src/queue.ts");
    expect(paths.some((p) => p.startsWith("src/pages/api/webhooks/"))).toBe(false);
  });

  it("keeps what a checkout needs: the route, the card, the CSP origins, the rate rule", () => {
    const paths = generateAstroidScaffoldFiles(payOnly).map((f) => f.path);
    expect(paths).toContain("src/pages/api/checkout.ts");
    expect(paths).toContain("src/components/SquareCard.astro");
    expect(astroidCspOrigins(payOnly)).toEqual(astroidCspOrigins(piped));
    expect(astroidRateRules(payOnly).map((r) => r.name)).toContain("checkout");
  });

  it("keeps the catalog cron off even when the queue runs for the project's own crons", () => {
    const withQueue: AstroidConfig = {
      ...payOnly,
      queues: { enabled: true },
      crons: [{ expression: "5 3 * * *", message: { kind: "catalog_refresh" } }],
    };
    expect(astroidUsesQueues(withQueue)).toBe(true);
    expect(astroidCron(withQueue)).toBeNull();
    expect(astroidCrons(withQueue)).toEqual([ASTROID_HEALTH_CRON, "5 3 * * *"]);
    // A queue for crons is still not a receiver for webhooks.
    expect(generateAstroidWebhookRoutes(withQueue)).toEqual([]);
  });

  it("generates no queue producer, consumer, or catalog cron into the worker and wrangler", () => {
    const worker = generateAstroidWorker(payOnly);
    expect(worker).not.toContain("COMMERCE_QUEUE");
    expect(worker).not.toContain("processBatch");
    const wrangler = generateAstroidWrangler(payOnly);
    expect(wrangler).not.toContain('"queues"');
    expect(wrangler).toContain(`"crons": ${JSON.stringify([ASTROID_HEALTH_CRON])}`);
  });

  it("drops the webhook signing secret, which nothing would verify", async () => {
    const commerce = payOnly.commerce;
    expect(commerceSecretNames(commerce)).toEqual(["SQUARE_ACCESS_TOKEN", "SQUARE_LOCATION_ID"]);
    expect(generateAstroidSecretsEnv(payOnly)).not.toContain("SQUARE_WEBHOOK_SECRET");
    expect(generateAstroidWrangler(payOnly)).not.toContain("SQUARE_WEBHOOK_SECRET");

    // Checkout goes live on credentials alone. Waiting on the webhook secret
    // would hold it dormant for a value no code in this project reads.
    const status = await resolveCommerceStatus(commerce, {
      SQUARE_ACCESS_TOKEN: "sq0atp-real",
      SQUARE_LOCATION_ID: "L123",
    });
    expect(status.configured).toBe(true);
    expect(status.missing).toEqual([]);
  });

  it("refuses a `queues.cron`, which would schedule the re-sync it turned off", () => {
    expect(() => defineAstroid({ ...payOnly, queues: { cron: "*/15 * * * *" } })).toThrow(
      /queues\.cron/,
    );
    // `false` says the same thing the pipeline switch does, so it's harmless.
    expect(() => defineAstroid({ ...payOnly, queues: { cron: false } })).not.toThrow();
  });
});
