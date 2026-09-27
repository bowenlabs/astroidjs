import type { IncidentReport } from "louise-toolkit/incidents";
import { describe, expect, it, vi } from "vitest";
import type { AstroidConfig } from "../src/config.js";
import {
  ASTROID_INCIDENTS_MIGRATION,
  astroidIncidentEventsDataset,
  sentryEvent,
  sentryIncidents,
} from "../src/incidents/index.js";
import { generateAstroidWrangler } from "../src/project/generate.js";
import { generateAstroidScaffoldFiles } from "../src/project/scaffold.js";
import { generateAstroidSchema } from "../src/schema/generate.js";
import { ASTROID_SECRET_PLACEHOLDER } from "../src/secrets.js";
import { generateAstroidWorker } from "../src/worker/generate.js";

/** A report as louise-toolkit builds one, written out: `louise-toolkit/incidents`
 *  loads drizzle-orm at runtime, which astroid's tests don't install, and the
 *  sink only needs the shape. */
function makeReport(overrides: Partial<IncidentReport> = {}): IncidentReport {
  return {
    kind: "fetch",
    fingerprint: "0123456789abcdef",
    name: "TypeError",
    message: "Cannot read properties of undefined (reading <value>) for [email]",
    path: "/menu",
    host: "shop.example",
    release: "v-123",
    critical: true,
    at: 1_700_000_000_000,
    ...overrides,
  };
}

const base: AstroidConfig = {
  key: "acme-site",
  archetype: "marketing",
  theme: { name: "Example Organization", colors: { brand: "#1f6e6d" } },
};
const shop: AstroidConfig = { ...base, archetype: "storefront", commerce: { provider: "square" } };
const app: AstroidConfig = { ...base, editor: false };

describe("the generated worker's incident capture", () => {
  it("counts every failure into D1 and Analytics Engine, in both shapes", () => {
    for (const config of [base, app]) {
      const out = generateAstroidWorker(config);
      expect(out).toContain(
        'import { analyticsIncidents, d1Incidents } from "louise-toolkit/incidents";',
      );
      expect(out).toContain("onIncident: {");
      expect(out).toContain("d1Incidents((env: CloudflareEnv) => env.DB),");
      expect(out).toContain(
        "analyticsIncidents((env: CloudflareEnv) => incidentBindings(env).INCIDENT_EVENTS),",
      );
      expect(out).toContain("release: (env) => incidentBindings(env).CF_VERSION_METADATA?.id,");
      // Off unless configured.
      expect(out).not.toContain("sentryIncidents");
      expect(out).not.toContain("critical:");
    }
  });

  it("passes the critical list, and adds the Sentry sink when it's on", () => {
    for (const config of [base, app]) {
      const out = generateAstroidWorker({
        ...config,
        incidents: { critical: ["commerce.checkout", "/cart"], sentry: true },
      });
      expect(out).toContain('critical: ["commerce.checkout","/cart"],');
      expect(out).toContain("SENTRY_DSN?: SecretSource;");
      expect(out).toContain(
        'sentryIncidents((env: CloudflareEnv) => incidentBindings(env).SENTRY_DSN, { site: "acme-site" }),',
      );
      expect(out).toMatch(
        /import \{[^}]*\bsentryIncidents\b[^}]*\btype SecretSource\b[^}]*\} from "astroidjs";/,
      );
    }
  });

  it("routes the dead-letter queue to its consumer, and tells processBatch the queue's max_retries", () => {
    const out = generateAstroidWorker({ ...shop, queues: { maxRetries: 7 } });
    expect(out).toContain(
      'import { analyticsIncidents, d1Incidents, deadLetterConsumer } from "louise-toolkit/incidents";',
    );
    expect(out).toContain('const DEAD_LETTER_QUEUE = "acme-site-commerce-dlq";');
    expect(out).toContain(
      "const keepDeadLetters = deadLetterConsumer<CloudflareEnv, AstroidQueueMessage>(",
    );
    expect(out).toContain("batch.queue === DEAD_LETTER_QUEUE");
    expect(out).toContain("? keepDeadLetters(batch, env, ctx)");
    expect(out).toContain("maxRetries: 7,");
  });
});

describe("the incident tables", () => {
  it("are re-exported by both shapes' schema", () => {
    for (const config of [base, app]) {
      expect(generateAstroidSchema(config)).toContain(
        'export { deadLetters, incidents } from "louise-toolkit/incidents";',
      );
    }
  });

  it("belong to the app that migrates the database", () => {
    const borrowed: AstroidConfig = {
      ...app,
      deploy: { platform: "cloudflare", migrations: false },
    };
    expect(generateAstroidSchema(borrowed)).not.toContain("louise-toolkit/incidents");
    expect(generateAstroidScaffoldFiles(borrowed).map((f) => f.path)).not.toContain(
      "migrations/0006_incidents.sql",
    );
  });

  it("are created by a migration that tolerates a table the site already has", () => {
    const file = generateAstroidScaffoldFiles(base).find(
      (f) => f.path === "migrations/0006_incidents.sql",
    );
    expect(file).toMatchObject({ migration: true, contents: ASTROID_INCIDENTS_MIGRATION });
    expect(ASTROID_INCIDENTS_MIGRATION).toContain("CREATE TABLE IF NOT EXISTS `incidents`");
    expect(ASTROID_INCIDENTS_MIGRATION).toContain("CREATE TABLE IF NOT EXISTS `dead_letters`");
    expect(ASTROID_INCIDENTS_MIGRATION).not.toMatch(/CREATE (TABLE|INDEX) (?!IF NOT EXISTS)/);
  });
});

describe("a new project's wrangler.jsonc", () => {
  it("binds version metadata and the incident dataset, in both shapes", () => {
    for (const config of [base, app]) {
      const wrangler = generateAstroidWrangler(config);
      expect(wrangler).toContain('"version_metadata": { "binding": "CF_VERSION_METADATA" },');
      expect(wrangler).toContain(
        `{ "binding": "INCIDENT_EVENTS", "dataset": "${astroidIncidentEventsDataset(config)}" }`,
      );
    }
    expect(astroidIncidentEventsDataset(base)).toBe("acme_site_incidents");
  });

  it("consumes the dead-letter queue, with no retries of its own", () => {
    expect(generateAstroidWrangler(shop)).toContain(
      '{ "queue": "acme-site-commerce-dlq", "max_batch_size": 10, "max_retries": 0 },',
    );
  });
});

describe("sentryEvent", () => {
  const cause = new TypeError(
    "Cannot read properties of undefined (reading 'title') for alex@example.com",
  );
  cause.stack = [
    "TypeError: Cannot read properties of undefined (reading 'title') for alex@example.com",
    "    at renderMenu (worker.js:120:15)",
    "    at async handle (node_modules/astro/dist/core.js:40:3)",
    "    at worker.js:9:1",
  ].join("\n");
  const report = makeReport();

  it("carries the redacted report, the fingerprint, and the stack's frames", () => {
    const event = sentryEvent(report, cause, { site: "shop.example" });
    expect(event).toMatchObject({
      timestamp: 1_700_000_000,
      level: "fatal",
      release: "v-123",
      fingerprint: [report.fingerprint],
      tags: {
        louise_fingerprint: report.fingerprint,
        kind: "fetch",
        critical: "true",
        site: "shop.example",
      },
      request: { url: "https://shop.example/menu" },
      exception: { values: [{ type: "TypeError", value: report.message }] },
    });
    expect(event.event_id).toMatch(/^[0-9a-f]{32}$/);
    const frames = (event.exception as { values: { stacktrace: { frames: unknown[] } }[] })
      .values[0]!.stacktrace.frames;
    // Oldest call first, as Sentry reads them.
    expect(frames).toEqual([
      { filename: "worker.js", lineno: 9, colno: 1, in_app: true },
      {
        function: "async handle",
        filename: "node_modules/astro/dist/core.js",
        lineno: 40,
        colno: 3,
        in_app: false,
      },
      { function: "renderMenu", filename: "worker.js", lineno: 120, colno: 15, in_app: true },
    ]);
  });

  it("sends nothing the report redacted, and no query string", () => {
    const json = JSON.stringify(sentryEvent(report, cause));
    expect(json).not.toContain("alex@example.com");
    expect(json).not.toContain("session=abc");
  });

  it("leaves out a stack a cause doesn't have", () => {
    const degraded = makeReport({
      kind: "degraded",
      name: "content.read",
      message: "stale",
      critical: false,
      path: undefined,
      host: undefined,
    });
    const event = sentryEvent(degraded, "stale");
    expect((event.exception as { values: object[] }).values[0]).not.toHaveProperty("stacktrace");
    expect(event).not.toHaveProperty("request");
    expect(event.level).toBe("error");
  });
});

describe("sentryIncidents", () => {
  const report = makeReport();

  it("posts an envelope to the DSN's project", async () => {
    const fetch = vi.fn(async () => new Response(null, { status: 200 }));
    const sink = sentryIncidents((env: { DSN?: string }) => env.DSN, { fetch, site: "acme" });
    await sink(report, {
      env: { DSN: "https://abc123@o1.ingest.example/42" },
      cause: new Error("boom"),
    });

    expect(fetch).toHaveBeenCalledOnce();
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://o1.ingest.example/api/42/envelope/");
    expect((init.headers as Record<string, string>)["x-sentry-auth"]).toContain(
      "sentry_key=abc123",
    );
    const [header, item, event] = String(init.body)
      .split("\n")
      .map((line) => JSON.parse(line));
    expect(item).toEqual({ type: "event" });
    expect(event.event_id).toBe(header.event_id);
    expect(event.tags.site).toBe("acme");
  });

  it("stays dormant without a real DSN", async () => {
    const fetch = vi.fn();
    for (const dsn of [
      undefined,
      "",
      ASTROID_SECRET_PLACEHOLDER,
      "not a dsn",
      "https://nokey.example/42",
    ]) {
      await sentryIncidents((env: { DSN?: string }) => env.DSN, { fetch })(report, {
        env: { DSN: dsn },
      });
    }
    expect(fetch).not.toHaveBeenCalled();
  });

  it("throws when Sentry refuses, so capture logs it", async () => {
    const fetch = vi.fn(async () => new Response("rate limited", { status: 429 }));
    const sink = sentryIncidents((env: { DSN: string }) => env.DSN, { fetch });
    await expect(sink(report, { env: { DSN: "https://k@sentry.example/1" } })).rejects.toThrow(
      "Sentry answered 429",
    );
  });
});
