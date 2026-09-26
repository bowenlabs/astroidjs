import { describe, expect, it } from "vitest";
import { applyProvisionedId, provisionPlan } from "../src/project/provision.js";

// A site the way the staging change leaves it: production provisioned, staging
// still placeholders, two staging bindings sharing one namespace.
const wrangler = `{
  "name": "acme",
  "account_id": "0123abcd",
  // Production's, already provisioned.
  "d1_databases": [{ "binding": "DB", "database_name": "acme", "database_id": "prod-db" }],
  "kv_namespaces": [{ "binding": "RL", "id": "prod-kv" }],
  "r2_buckets": [{ "binding": "MEDIA", "bucket_name": "acme-media" }],
  "secrets_store_secrets": [
    { "binding": "SESSION_SECRET", "store_id": "s1", "secret_name": "acme-SESSION_SECRET" },
  ],
  "previews": {
    "d1_databases": [
      { "binding": "DB", "database_name": "acme-staging", "database_id": "<run: wrangler d1 create acme-staging>" },
    ],
    "kv_namespaces": [
      { "binding": "RL", "id": "<run: wrangler kv namespace create acme-staging-rl>" },
      { "binding": "DRAFTS", "id": "<run: wrangler kv namespace create acme-staging-rl>" },
    ],
    "r2_buckets": [{ "binding": "MEDIA", "bucket_name": "acme-media-staging" }],
    "secrets_store_secrets": [
      { "binding": "SESSION_SECRET", "store_id": "s1", "secret_name": "acme-staging-SESSION_SECRET" },
    ],
  },
}`;

describe("provisionPlan", () => {
  it("creates each placeholder's resource once, and every bucket", () => {
    const { steps, hasAccount } = provisionPlan(wrangler);
    expect(steps.map((s) => s.args.join(" "))).toEqual([
      "d1 create acme-staging",
      "kv namespace create acme-staging-rl",
      "r2 bucket create acme-media",
      "r2 bucket create acme-media-staging",
    ]);
    expect(hasAccount).toBe(true);
  });

  it("lists the secrets each environment binds, for a person to set", () => {
    expect(provisionPlan(wrangler).secrets).toEqual([
      {
        binding: "SESSION_SECRET",
        storeId: "s1",
        secretName: "acme-SESSION_SECRET",
        environment: "production",
      },
      {
        binding: "SESSION_SECRET",
        storeId: "s1",
        secretName: "acme-staging-SESSION_SECRET",
        environment: "staging",
      },
    ]);
  });

  it("has nothing to create once every placeholder is filled", () => {
    let text = wrangler;
    for (const s of provisionPlan(wrangler).steps) {
      if (s.placeholder) text = applyProvisionedId(text, s.placeholder, `id-${s.name}`);
    }
    expect(provisionPlan(text).steps.every((s) => s.kind === "r2")).toBe(true);
  });
});

describe("applyProvisionedId", () => {
  it("fills every binding that shares the placeholder", () => {
    const text = applyProvisionedId(
      wrangler,
      "<run: wrangler kv namespace create acme-staging-rl>",
      "kv-9",
    );
    expect(text.match(/"kv-9"/g)).toHaveLength(2);
    expect(text).not.toContain("acme-staging-rl>");
  });
});
