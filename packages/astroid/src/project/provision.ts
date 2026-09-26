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

/** A Secrets Store secret the config binds, which only a person can set. */
export interface ProvisionSecret {
  binding: string;
  storeId: string;
  secretName: string;
  /** `production` for a top-level binding, `staging` for one in `previews`. */
  environment: "production" | "staging";
}

export interface ProvisionPlan {
  steps: ProvisionStep[];
  secrets: ProvisionSecret[];
  /** Whether `account_id` is set, so wrangler doesn't have to pick one. */
  hasAccount: boolean;
}

const PLACEHOLDER = /<run:\s*wrangler\s+(d1\s+create|kv\s+namespace\s+create)\s+([^\s>]+)\s*>/g;

type Json = Record<string, unknown>;
const isObject = (v: unknown): v is Json =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const list = (v: unknown): Json[] => (Array.isArray(v) ? v.filter(isObject) : []);

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
      secrets.push({
        binding: String(s.binding ?? ""),
        storeId: String(s.store_id ?? ""),
        secretName: String(s.secret_name ?? ""),
        environment,
      });
    }
  }

  const account = top.account_id;
  return {
    steps,
    secrets,
    hasAccount: typeof account === "string" && account.length > 0 && !account.startsWith("<"),
  };
}

/** Put a created resource's ID in place of its placeholder, everywhere. */
export function applyProvisionedId(text: string, placeholder: string, id: string): string {
  return text.split(placeholder).join(id);
}
