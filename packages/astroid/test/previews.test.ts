import { describe, expect, it } from "vitest";
import { checkWranglerPreviews, parseJsonc } from "../src/project/previews.js";

// A production config the size of a real site's, with a `previews` block
// that's right, so each test breaks exactly one thing.
const good = {
  name: "acme",
  routes: [
    { pattern: "staging.acme.com", custom_domain: true, previews_enabled: true, enabled: false },
  ],
  triggers: { crons: ["17 4 * * *"] },
  d1_databases: [{ binding: "DB", database_name: "acme", database_id: "prod-db" }],
  kv_namespaces: [{ binding: "RL", id: "prod-kv" }],
  r2_buckets: [{ binding: "MEDIA", bucket_name: "acme-media" }],
  queues: {
    producers: [{ binding: "QUEUE", queue: "acme-jobs" }],
    consumers: [{ queue: "acme-jobs" }],
  },
  secrets_store_secrets: [
    { binding: "SESSION_SECRET", store_id: "s", secret_name: "acme-SESSION_SECRET" },
  ],
  send_email: [{ name: "EMAIL" }],
  ai: { binding: "AI" },
  vars: {
    SITE_URL: "https://acme.com",
    MEDIA_URL: "https://media.acme.com",
    OWNER_EMAIL: "alex@example.com",
  },
  previews: {
    d1_databases: [{ binding: "DB", database_name: "acme-staging", database_id: "staging-db" }],
    kv_namespaces: [{ binding: "RL", id: "staging-kv" }],
    r2_buckets: [{ binding: "MEDIA", bucket_name: "acme-media-staging" }],
    secrets_store_secrets: [
      { binding: "SESSION_SECRET", store_id: "s", secret_name: "acme-staging-SESSION_SECRET" },
    ],
    send_email: [{ name: "EMAIL" }],
    ai: { binding: "AI" },
    vars: {
      SITE_URL: "https://main.staging.acme.com",
      MEDIA_URL: "/media",
      OWNER_EMAIL: "alex@example.com",
    },
  },
};

type Config = typeof good & Record<string, unknown>;
const check = (config: unknown) => checkWranglerPreviews(JSON.stringify(config));
const withPreviews = (patch: Record<string, unknown>): Config => ({
  ...good,
  previews: { ...good.previews, ...patch },
});

describe("checkWranglerPreviews", () => {
  it("passes a block that binds staging resources for everything production uses", () => {
    const { errors, warnings, ok } = check(good);
    expect(errors).toEqual([]);
    expect(warnings).toEqual([]);
    expect(ok.join("\n")).toContain("served on `<name>.staging.acme.com`");
  });

  it("fails a binding copied from production, which would write production data", () => {
    const { errors } = check(
      withPreviews({
        d1_databases: [{ binding: "DB", database_name: "acme", database_id: "prod-db" }],
      }),
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("production's (prod-db)");
  });

  it("fails a binding production has and the block leaves out, which throws on a Preview", () => {
    const { r2_buckets: _r2, ...rest } = good.previews;
    const { errors } = check({ ...good, previews: rest });
    expect(errors).toEqual([expect.stringContaining("no R2 bucket `MEDIA`")]);
  });

  it("fails a missing API binding, but asks no staging resource for it", () => {
    const { ai: _ai, ...rest } = good.previews;
    expect(check({ ...good, previews: rest }).errors).toEqual([
      expect.stringContaining("no `ai` binding"),
    ]);
  });

  it("lets the queue and Workflows stay unbound, since Previews can't consume them", () => {
    const { errors, ok } = check(good);
    expect(errors).toEqual([]);
    expect(ok.join("\n")).toContain("queue producer `QUEUE` left out");
  });

  it("fails vars the block doesn't restate, since none are inherited", () => {
    const { errors } = check(
      withPreviews({ vars: { SITE_URL: "https://main.staging.acme.com", MEDIA_URL: "/media" } }),
    );
    expect(errors).toEqual([expect.stringContaining("`OWNER_EMAIL`")]);
  });

  it("fails a staging SITE_URL or MEDIA_URL that's still production's", () => {
    const { errors } = check(withPreviews({ vars: { ...good.vars } }));
    expect(errors.map((e) => e.slice(0, 30))).toEqual([
      "`previews.vars.SITE_URL` is pr",
      "`previews.vars.MEDIA_URL` is p",
    ]);
  });

  it("fails crons, routes, and queue consumers in the block, which target production only", () => {
    const { errors } = check(
      withPreviews({
        triggers: { crons: ["* * * * *"] },
        routes: [{ pattern: "x.acme.com" }],
        queues: { consumers: [{ queue: "acme-jobs-staging" }] },
      }),
    );
    expect(errors).toHaveLength(3);
  });

  it("warns, rather than fails, a site with no staging yet", () => {
    const { previews: _p, ...rest } = good;
    const { errors, warnings } = check(rest);
    expect(errors).toEqual([]);
    expect(warnings[0]).toContain("no `previews` block");
  });

  it("warns when no route serves Previews on a custom domain", () => {
    expect(check({ ...good, routes: [] }).warnings[0]).toContain("previews_enabled");
  });
});

describe("parseJsonc", () => {
  it("reads comments and trailing commas, and leaves slashes inside strings alone", () => {
    const text = `{
      // a comment
      "url": "https://acme.com//x", /* block */
      "list": [1, 2,],
    }`;
    expect(parseJsonc(text)).toEqual({ url: "https://acme.com//x", list: [1, 2] });
  });
});
