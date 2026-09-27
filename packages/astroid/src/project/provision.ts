// Copyright (c) 2026 BowenLabs. Astroid is MIT licensed.
//
// The plan `astroid provision` runs: which Cloudflare resources a site's
// `wrangler.jsonc` still names by placeholder, and which secrets it binds.
//
// A placeholder names the command that creates its resource, such as
// `<run: wrangler d1 create acme-staging>`, so the plan reads it rather than
// guessing a name. The same placeholder can stand for two bindings that share
// one namespace, and replacing the text everywhere it appears fills both.
// Buckets carry a name instead of an ID, so every bucket the file names is
// created, and one that already exists is fine.
//
// Two staging secrets need no person, so the plan marks them for provision to
// create: the session secret, which can be any random value as long as it isn't
// production's, and the Turnstile secret, which is Cloudflare's test secret that
// always passes. Every other secret, and every production one, still needs a
// person, so the CLI prints those instead.
//
// Pure: text in, plan out, so it's tested directly and the CLI only runs it.

import { parseJsonc } from "./previews.js";

/** One resource to create. `placeholder` is the text its ID replaces. */
export interface ProvisionStep {
  kind: "d1" | "kv" | "r2";
  name: string;
  /** The `wrangler` arguments that create it. */
  args: string[];
  placeholder?: string;
}

/**
 * The value provision gives a staging secret it creates: `random` is a fresh
 * random value for each site, and `turnstile-test` is
 * {@link TURNSTILE_TEST_SECRET}.
 */
export type StagingSecretValue = "random" | "turnstile-test";

/**
 * The staging secrets provision creates, by the binding name in the `previews`
 * block. Nothing else is created: a secret with any other binding, and every
 * production secret, is left for a person.
 */
export const ASTROID_STAGING_SECRET_VALUES: Readonly<Record<string, StagingSecretValue>> = {
  SESSION_SECRET: "random",
  // deepcode ignore HardcodedNonCryptoSecret: A value kind, not a credential.
  TURNSTILE_SECRET: "turnstile-test",
};

/**
 * Cloudflare's Turnstile test secret key, which passes every token. Staging
 * uses it so a Preview's forms and sign-in work without a real widget.
 */
// deepcode ignore HardcodedNonCryptoSecret: Cloudflare's public Turnstile test secret, not a credential.
export const TURNSTILE_TEST_SECRET = "1x0000000000000000000000000000000AA";

/** A Secrets Store secret the config binds. */
export interface ProvisionSecret {
  binding: string;
  storeId: string;
  secretName: string;
  /** `production` for a top-level binding, `staging` for one in `previews`. */
  environment: "production" | "staging";
  /**
   * Set when provision creates the secret itself, and says what value it gets.
   * Absent means only a person can set it.
   */
  create?: StagingSecretValue;
}

export interface ProvisionPlan {
  steps: ProvisionStep[];
  secrets: ProvisionSecret[];
  /** Whether `account_id` is set, so wrangler doesn't have to pick one. */
  hasAccount: boolean;
  /**
   * The `account_id` from `wrangler.jsonc`, when it's set. Wrangler prefers it
   * to `CLOUDFLARE_ACCOUNT_ID`, so every command provision runs uses it.
   */
  accountId?: string;
}

const PLACEHOLDER = /<run:\s*wrangler\s+(d1\s+create|kv\s+namespace\s+create)\s+([^\s>]+)\s*>/g;

type Json = Record<string, unknown>;
const isObject = (v: unknown): v is Json =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const list = (v: unknown): Json[] => (Array.isArray(v) ? v.filter(isObject) : []);
/** Whether a config value is filled in, rather than empty or a `<...>` placeholder. */
const isReal = (v: string): boolean => v.length > 0 && !v.startsWith("<");

/** Build the plan from a `wrangler.jsonc`, top level and `previews` alike. */
export function provisionPlan(text: string): ProvisionPlan {
  const steps: ProvisionStep[] = [];
  const seen = new Set<string>();

  for (const match of text.matchAll(PLACEHOLDER)) {
    const placeholder = match[0];
    if (seen.has(placeholder)) continue;
    seen.add(placeholder);
    const name = match[2];
    steps.push(
      match[1].startsWith("d1")
        ? { kind: "d1", name, args: ["d1", "create", name], placeholder }
        : { kind: "kv", name, args: ["kv", "namespace", "create", name], placeholder },
    );
  }

  const config = parseJsonc(text);
  const top = isObject(config) ? config : {};
  const previews = isObject(top.previews) ? top.previews : {};

  const buckets = new Set(
    [...list(top.r2_buckets), ...list(previews.r2_buckets)]
      .map((b) => b.bucket_name)
      .filter((name): name is string => typeof name === "string" && !name.startsWith("<")),
  );
  for (const name of buckets) {
    steps.push({ kind: "r2", name, args: ["r2", "bucket", "create", name] });
  }

  const secrets: ProvisionSecret[] = [];
  for (const [environment, section] of [
    ["production", top],
    ["staging", previews],
  ] as const) {
    for (const s of list(section.secrets_store_secrets)) {
      const secret: ProvisionSecret = {
        binding: String(s.binding ?? ""),
        storeId: String(s.store_id ?? ""),
        secretName: String(s.secret_name ?? ""),
        environment,
      };
      const create = Object.hasOwn(ASTROID_STAGING_SECRET_VALUES, secret.binding)
        ? ASTROID_STAGING_SECRET_VALUES[secret.binding]
        : undefined;
      // Only staging, and only against a real store and name: a placeholder
      // can't be created against, so it's left for a person.
      if (
        environment === "staging" &&
        create &&
        isReal(secret.storeId) &&
        isReal(secret.secretName)
      ) {
        secret.create = create;
      }
      secrets.push(secret);
    }
  }

  const account = top.account_id;
  const hasAccount = typeof account === "string" && isReal(account);
  return { steps, secrets, hasAccount, ...(hasAccount ? { accountId: account } : {}) };
}

/** Put a created resource's ID in place of its placeholder, everywhere. */
export function applyProvisionedId(text: string, placeholder: string, id: string): string {
  return text.split(placeholder).join(id);
}

/** What provision does with a staging secret it creates itself. */
export interface StagingSecretStep {
  secret: ProvisionSecret & { create: StagingSecretValue };
  /**
   * `create` when the store doesn't have it, and `exists` when it does, so a
   * re-run leaves it alone. `unknown` when the store couldn't be listed, so
   * provision can't tell and creates nothing.
   */
  status: "create" | "exists" | "unknown";
}

/**
 * Decide, for each staging secret provision creates, whether it still needs
 * creating. `existing` maps a store ID to the secret names already in it; a
 * store missing from the map couldn't be listed.
 */
export function stagingSecretSteps(
  secrets: readonly ProvisionSecret[],
  existing: ReadonlyMap<string, ReadonlySet<string>>,
): StagingSecretStep[] {
  const steps: StagingSecretStep[] = [];
  for (const secret of secrets) {
    if (!secret.create) continue;
    const names = existing.get(secret.storeId);
    steps.push({
      secret: { ...secret, create: secret.create },
      status: !names ? "unknown" : names.has(secret.secretName) ? "exists" : "create",
    });
  }
  return steps;
}

// Wrangler colors the table on a terminal: an escape, then `[`, digits, and `m`.
const ANSI_COLOR = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "g");

/**
 * The secret names in the output of `wrangler secrets-store secret list`.
 * Wrangler prints a table rather than JSON, with the name in the first column,
 * so this reads the first cell of each row and drops the header.
 */
export function secretNamesFromList(output: string): string[] {
  const names: string[] = [];
  for (const line of output.replace(ANSI_COLOR, "").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("│")) continue;
    const name = trimmed.split("│")[1]?.trim();
    if (name && name !== "Name") names.push(name);
  }
  return names;
}
