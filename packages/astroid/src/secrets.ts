// Copyright (c) 2026 BowenLabs. Astroid is MIT licensed.
//
// The dormant-until-provisioned convention.
//
// Astroid's optional modules are opt-in at the CONFIG level but not at the
// account level: switching `commerce` on in `defineAstroid` must not require a
// Square account before `pnpm dev` will boot. So every module here follows one
// rule — a module whose secrets are unprovisioned is DORMANT: it renders, it
// serves, it says out loud that it is simulated, and it never calls upstream
// with a dummy credential.
//
// The mechanism is `readSecret` from `louise-toolkit/security` (a secret that is
// absent / unreadable / empty / a placeholder reads as `null`). What lives here
// is the *convention* over it, which is Astroid's opinion, not the toolkit's:
//
//   1. ONE sentinel — `ASTROID_SECRET_PLACEHOLDER` — seeded by `create-astroid`
//      into every secret a scaffold declares, so a fresh clone has a complete,
//      valid binding set and zero real credentials.
//   2. `resolveModuleSecrets` collapses a module's whole secret set into one
//      `configured` gate plus the list of what's still missing, so a module's
//      `isConfigured()` and its "why not" message come from the same read.
//
// This mirrors what all three consuming sites converged on independently.

import { readSecret, type SecretSource } from "louise-toolkit/security";

export type { SecretSource };

/**
 * The placeholder every Astroid scaffold seeds its unprovisioned secrets with.
 * Reading it back means "not configured yet", never a credential — the value is
 * deliberately loud so it is obvious in a Secrets Store listing or a log line.
 *
 * It matches the sentinel `louise-toolkit`'s Turnstile gate already recognizes,
 * so the captcha pair follows the same convention as every Astroid module.
 */
export const ASTROID_SECRET_PLACEHOLDER = "DUMMY_REPLACE_ME";

/**
 * Read one secret under the Astroid convention: `null` unless it holds a real,
 * non-placeholder value. Thin by design — the reason to call this rather than
 * `readSecret` directly is that it binds Astroid's sentinel for you.
 */
export function readModuleSecret(source: SecretSource): Promise<string | null> {
  return readSecret(source, { placeholder: ASTROID_SECRET_PLACEHOLDER });
}

/** The resolved secret set for one module, plus the gate derived from it. */
export interface ModuleSecrets<K extends string> {
  /**
   * True when EVERY secret the module declared resolved to a real value. The
   * module's `isConfigured()` should be exactly this — partial provisioning is
   * treated as dormant, since a half-configured integration fails at the worst
   * possible moment (mid-checkout) rather than at boot.
   */
  configured: boolean;
  /** Each declared secret's resolved value, or `null` where unprovisioned. */
  values: Record<K, string | null>;
  /** The still-unprovisioned names, in declaration order — the "why not" list. */
  missing: K[];
}

/**
 * Resolve a module's secrets in one pass.
 *
 * ```ts
 * const secrets = await resolveModuleSecrets({
 *   SQUARE_ACCESS_TOKEN: env.SQUARE_ACCESS_TOKEN,
 *   SQUARE_WEBHOOK_SECRET: env.SQUARE_WEBHOOK_SECRET,
 * });
 * if (!secrets.configured) return simulatedCheckout();  // dormant path
 * ```
 *
 * Reads run concurrently: a Secrets Store `.get()` is a real await, and a module
 * with four secrets should not pay for four sequential round-trips on the
 * request path.
 */
export async function resolveModuleSecrets<K extends string>(
  sources: Record<K, SecretSource>,
): Promise<ModuleSecrets<K>> {
  const names = Object.keys(sources) as K[];
  const resolved = await Promise.all(names.map((name) => readModuleSecret(sources[name])));

  const values = {} as Record<K, string | null>;
  const missing: K[] = [];
  names.forEach((name, i) => {
    const value = resolved[i] ?? null;
    values[name] = value;
    if (value === null) missing.push(name);
  });

  return { configured: missing.length === 0, values, missing };
}

/**
 * A one-line, human-readable status for a module — what `astroid doctor`, a dev
 * server banner, or a health endpoint should print. Naming the missing secrets
 * is the whole point: "commerce is off" sends someone reading source, "commerce
 * is dormant — set SQUARE_ACCESS_TOKEN" does not.
 */
export function describeModuleStatus<K extends string>(
  module: string,
  status: ModuleSecrets<K>,
): string {
  if (status.configured) return `${module}: configured`;
  return `${module}: dormant (simulated) — unprovisioned secret(s): ${status.missing.join(", ")}`;
}
