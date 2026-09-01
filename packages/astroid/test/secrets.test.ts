import { describe, expect, it } from "vitest";
import {
  ASTROID_SECRET_PLACEHOLDER,
  describeModuleStatus,
  readModuleSecret,
  resolveModuleSecrets,
} from "../src/secrets.js";

/** A Secrets Store binding stub. */
const binding = (value: string) => ({ get: async () => value });
const unprovisioned = {
  get: async () => {
    throw new Error("secret store not bound");
  },
};

describe("readModuleSecret", () => {
  it("binds Astroid's sentinel so a seeded scaffold reads as unconfigured", async () => {
    expect(await readModuleSecret(binding(ASTROID_SECRET_PLACEHOLDER))).toBeNull();
    expect(await readModuleSecret(ASTROID_SECRET_PLACEHOLDER)).toBeNull();
    expect(await readModuleSecret(binding("sq0atp-real"))).toBe("sq0atp-real");
  });

  it("reads an absent or unprovisioned binding as unconfigured", async () => {
    expect(await readModuleSecret(undefined)).toBeNull();
    expect(await readModuleSecret(unprovisioned)).toBeNull();
  });
});

describe("resolveModuleSecrets", () => {
  it("is configured only when every declared secret is real", async () => {
    const status = await resolveModuleSecrets({
      SQUARE_ACCESS_TOKEN: binding("sq0atp-real"),
      SQUARE_WEBHOOK_SECRET: binding("whsec-real"),
    });
    expect(status.configured).toBe(true);
    expect(status.missing).toEqual([]);
    expect(status.values.SQUARE_ACCESS_TOKEN).toBe("sq0atp-real");
  });

  it("treats partial provisioning as dormant, and names what is missing", async () => {
    const status = await resolveModuleSecrets({
      SQUARE_ACCESS_TOKEN: binding("sq0atp-real"),
      SQUARE_WEBHOOK_SECRET: binding(ASTROID_SECRET_PLACEHOLDER),
      SQUARE_LOCATION_ID: undefined,
    });
    // Half-configured must not read as on: it would fail mid-checkout rather
    // than at boot, which is the failure mode this convention exists to avoid.
    expect(status.configured).toBe(false);
    expect(status.missing).toEqual(["SQUARE_WEBHOOK_SECRET", "SQUARE_LOCATION_ID"]);
    // The real value is still resolved — callers may use it on a partial path.
    expect(status.values.SQUARE_ACCESS_TOKEN).toBe("sq0atp-real");
    expect(status.values.SQUARE_WEBHOOK_SECRET).toBeNull();
  });

  it("reports a freshly scaffolded module (all secrets seeded) as fully dormant", async () => {
    const status = await resolveModuleSecrets({
      STRIPE_SECRET_KEY: ASTROID_SECRET_PLACEHOLDER,
      STRIPE_WEBHOOK_SECRET: ASTROID_SECRET_PLACEHOLDER,
    });
    expect(status.configured).toBe(false);
    expect(status.missing).toEqual(["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"]);
  });

  it("handles a module that declares no secrets at all", async () => {
    const status = await resolveModuleSecrets({});
    expect(status.configured).toBe(true);
    expect(status.missing).toEqual([]);
  });
});

describe("describeModuleStatus", () => {
  it("names the unprovisioned secrets rather than just saying 'off'", async () => {
    const dormant = await resolveModuleSecrets({
      STRIPE_SECRET_KEY: ASTROID_SECRET_PLACEHOLDER,
    });
    expect(describeModuleStatus("commerce", dormant)).toBe(
      "commerce: dormant (simulated) — unprovisioned secret(s): STRIPE_SECRET_KEY",
    );
    const live = await resolveModuleSecrets({ STRIPE_SECRET_KEY: "sk_live_x" });
    expect(describeModuleStatus("commerce", live)).toBe("commerce: configured");
  });
});
