import { describe, expect, it } from "vitest";
import {
  applyProvisionedId,
  provisionPlan,
  secretNamesFromList,
  stagingSecretSteps,
  TURNSTILE_TEST_SECRET,
} from "../src/project/provision.js";

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

  it("lists the secrets each environment binds, marking the ones it creates", () => {
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
        create: "random",
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

// The same site with the secrets a staging rollout binds: the two provision
// creates, one it leaves for a person, and a placeholder store it can't use.
const withSecrets = `{
  "name": "acme",
  "account_id": "0123abcd",
  "secrets_store_secrets": [
    { "binding": "SESSION_SECRET", "store_id": "s1", "secret_name": "acme-SESSION_SECRET" },
    { "binding": "TURNSTILE_SECRET", "store_id": "s1", "secret_name": "acme-TURNSTILE_SECRET" },
  ],
  "previews": {
    "secrets_store_secrets": [
      { "binding": "SESSION_SECRET", "store_id": "s1", "secret_name": "acme-staging-SESSION_SECRET" },
      { "binding": "TURNSTILE_SECRET", "store_id": "s1", "secret_name": "acme-staging-TURNSTILE_SECRET" },
      { "binding": "SQUARE_TOKEN", "store_id": "s1", "secret_name": "acme-staging-SQUARE_TOKEN" },
      { "binding": "TURNSTILE_SECRET", "store_id": "<store id>", "secret_name": "acme-other-TURNSTILE_SECRET" },
    ],
  },
}`;

describe("provisionPlan staging secrets", () => {
  const { secrets, accountId } = provisionPlan(withSecrets);
  const created = secrets.filter((s) => s.create);

  it("creates only the staging session and Turnstile secrets", () => {
    expect(created.map((s) => [s.secretName, s.create])).toEqual([
      ["acme-staging-SESSION_SECRET", "random"],
      ["acme-staging-TURNSTILE_SECRET", "turnstile-test"],
    ]);
  });

  it("never creates a production secret", () => {
    const production = secrets.filter((s) => s.environment === "production");
    expect(production).toHaveLength(2);
    expect(production.some((s) => s.create)).toBe(false);
  });

  it("leaves any other binding, and a placeholder store, for a person", () => {
    const left = secrets.filter((s) => s.environment === "staging" && !s.create);
    expect(left.map((s) => s.secretName)).toEqual([
      "acme-staging-SQUARE_TOKEN",
      "acme-other-TURNSTILE_SECRET",
    ]);
  });

  it("reports the account wrangler.jsonc names", () => {
    expect(accountId).toBe("0123abcd");
    expect(provisionPlan(`{ "account_id": "<your account>" }`).accountId).toBeUndefined();
  });

  it("uses Cloudflare's always-passes Turnstile test secret", () => {
    expect(TURNSTILE_TEST_SECRET).toBe("1x0000000000000000000000000000000AA");
  });
});

describe("stagingSecretSteps", () => {
  const { secrets } = provisionPlan(withSecrets);

  it("creates what the store lacks and skips what it has, so a re-run is safe", () => {
    const existing = new Map([
      ["s1", new Set(["acme-SESSION_SECRET", "acme-staging-SESSION_SECRET"])],
    ]);
    expect(
      stagingSecretSteps(secrets, existing).map((s) => [s.secret.secretName, s.status]),
    ).toEqual([
      ["acme-staging-SESSION_SECRET", "exists"],
      ["acme-staging-TURNSTILE_SECRET", "create"],
    ]);
  });

  it("creates nothing in a store it couldn't list", () => {
    expect(stagingSecretSteps(secrets, new Map()).map((s) => s.status)).toEqual([
      "unknown",
      "unknown",
    ]);
  });

  it("creates everything in an empty store", () => {
    const existing = new Map([["s1", new Set<string>()]]);
    expect(stagingSecretSteps(secrets, existing).every((s) => s.status === "create")).toBe(true);
  });
});

describe("secretNamesFromList", () => {
  // What `wrangler secrets-store secret list <store> --remote` prints, less the
  // emoji wrangler puts at the start of its banner and status lines.
  const output = [
    "",
    " wrangler 4.127.1",
    "───────────────────",
    "Listing secrets... (store-id: s1, page: 1, per-page: 100)",
    "┌─────────────────────────────┬──────────┬─────────┬─────────┬─────────┐",
    "│ Name                        │ ID       │ Comment │ Scopes  │ Status  │",
    "├─────────────────────────────┼──────────┼─────────┼─────────┼─────────┤",
    "│ acme-SESSION_SECRET         │ 9f2c     │         │ workers │ active  │",
    "├─────────────────────────────┼──────────┼─────────┼─────────┼─────────┤",
    "│ acme-staging-SESSION_SECRET │ 41aa     │         │ workers │ active  │",
    "└─────────────────────────────┴──────────┴─────────┴─────────┴─────────┘",
  ].join("\n");

  it("reads the name column and drops the header", () => {
    expect(secretNamesFromList(output)).toEqual([
      "acme-SESSION_SECRET",
      "acme-staging-SESSION_SECRET",
    ]);
  });

  it("reads a colored table the same as a plain one", () => {
    const esc = String.fromCharCode(27);
    const colored = output.replaceAll("│", `${esc}[90m│${esc}[39m`);
    expect(secretNamesFromList(colored)).toEqual(secretNamesFromList(output));
  });

  it("finds nothing in output with no table", () => {
    expect(secretNamesFromList("✘ [ERROR] List request returned no secrets.")).toEqual([]);
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
