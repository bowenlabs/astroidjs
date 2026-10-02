// Copyright (c) 2026 BowenLabs. Astroid is MIT licensed.

import { describe, expect, it } from "vitest";
import { checkAuthRateLimit } from "../src/auth-rate-limit/doctor.js";
import {
  astroidAuthRateLimitOption,
  generateAstroidAuthRateLimitEnv,
} from "../src/auth-rate-limit/scaffold.js";
import type { AstroidConfig } from "../src/config.js";
import { generateAstroidWrangler } from "../src/project/generate.js";
import { parseJsonc } from "../src/project/previews.js";
import { generateAstroidScaffoldFiles } from "../src/project/scaffold.js";
import { generateAstroidWorker } from "../src/worker/generate.js";

const base: AstroidConfig = {
  key: "acme",
  archetype: "marketing",
  theme: { name: "Example Organization", colors: { brand: "#1f6e6d" } },
};
const limited: AstroidConfig = { ...base, modules: ["authRateLimit"] };
const fileOf = (config: AstroidConfig, path: string) =>
  generateAstroidScaffoldFiles(config).find((f) => f.path === path)?.contents;

describe("authRateLimit module", () => {
  it("is entirely absent without the module", () => {
    expect(generateAstroidWorker(base)).not.toContain("AuthRateLimitDO");
    expect(generateAstroidWrangler(base)).not.toContain("AUTH_RATE_LIMIT");
    expect(fileOf(base, "src/auth-rate-limiter.ts")).toBeUndefined();
    expect(generateAstroidAuthRateLimitEnv(base)).toBe("");
    expect(astroidAuthRateLimitOption(base)).toBe("");
  });

  it("re-exports the class from the worker ENTRY", () => {
    // wrangler resolves a binding's `class_name` against the entry's exports.
    expect(generateAstroidWorker(limited)).toContain(
      'export { AuthRateLimitDO } from "./auth-rate-limiter.js";',
    );
  });

  it("declares the binding and a SQLite migration under its own tag", () => {
    const wrangler = generateAstroidWrangler(limited);
    expect(wrangler).toContain('{ "name": "AUTH_RATE_LIMIT", "class_name": "AuthRateLimitDO" }');
    expect(wrangler).toContain(
      '{ "tag": "auth-rate-limit-v1", "new_sqlite_classes": ["AuthRateLimitDO"] }',
    );
    expect(wrangler).not.toContain('"new_classes"');
  });

  it("puts both Durable Objects in one block beside realtime, realtime's migration first", () => {
    const wrangler = generateAstroidWrangler({ ...base, modules: ["realtime", "authRateLimit"] });
    const parsed = parseJsonc(wrangler) as {
      durable_objects: { bindings: { name: string }[] };
      migrations: { tag: string }[];
    };
    expect(parsed.durable_objects.bindings.map((b) => b.name)).toEqual([
      "EDIT_SESSION",
      "AUTH_RATE_LIMIT",
    ]);
    expect(parsed.migrations.map((m) => m.tag)).toEqual(["v1", "auth-rate-limit-v1"]);
  });

  it("scaffolds the class, delegating fetch and alarm to createRateLimiter", () => {
    const src = fileOf(limited, "src/auth-rate-limiter.ts") ?? "";
    expect(src).toContain('import { createRateLimiter } from "louise-toolkit/security";');
    expect(src).toContain("export class AuthRateLimitDO extends DurableObject<CloudflareEnv>");
    // Without `alarm`, a counter per client address stays in storage forever.
    for (const handler of ["fetch", "alarm"]) {
      expect(src, `the class doesn't delegate ${handler}`).toContain(`this.#limiter.${handler}(`);
    }
  });

  it("passes rateLimitDo in a fresh portal seam, and types the namespace", () => {
    const portal: AstroidConfig = { ...limited, portal: { enabled: true } };
    expect(fileOf(portal, "src/portal-auth.ts")).toContain("rateLimitDo: env.AUTH_RATE_LIMIT,");
    expect(fileOf({ ...base, portal: { enabled: true } }, "src/portal-auth.ts")).not.toContain(
      "rateLimitDo",
    );
    expect(generateAstroidAuthRateLimitEnv(limited)).toContain(
      "AUTH_RATE_LIMIT: DurableObjectNamespace;",
    );
  });
});

describe("checkAuthRateLimit (astroid doctor)", () => {
  const seam = (text: string | null) => [{ path: "src/auth.ts", text }];
  const wired = generateAstroidWrangler(limited);
  const calls = "getLouiseAuth(env, origin, { rateLimitDo: env.AUTH_RATE_LIMIT })";

  it("says nothing without the module", () => {
    expect(checkAuthRateLimit(base, "{}", seam("getLouiseAuth(env, origin, {})"))).toEqual({
      ok: [],
      errors: [],
      warnings: [],
    });
  });

  it("passes a project with the binding, the migration, and the option", () => {
    const findings = checkAuthRateLimit(limited, wired, seam(calls));
    expect(findings.errors).toEqual([]);
    expect(findings.warnings).toEqual([]);
    expect(findings.ok).toHaveLength(3);
  });

  it("fails a wrangler.jsonc with no binding and no migration", () => {
    // The state of every existing project the moment it turns the module on:
    // wrangler.jsonc is scaffold-once, so nothing wrote either.
    const findings = checkAuthRateLimit(limited, "{}", seam(calls));
    expect(findings.errors).toHaveLength(2);
    expect(findings.errors[0]).toContain("AUTH_RATE_LIMIT");
    expect(findings.errors[1]).toContain('"tag": "auth-rate-limit-v1"');
  });

  /** A wrangler.jsonc with the module wired, and the given `previews` bindings. */
  const withPreviews = (bindings: { name: string; class_name: string }[]) =>
    JSON.stringify({
      durable_objects: { bindings: [{ name: "AUTH_RATE_LIMIT", class_name: "AuthRateLimitDO" }] },
      migrations: [{ tag: "auth-rate-limit-v1", new_sqlite_classes: ["AuthRateLimitDO"] }],
      previews: { durable_objects: { bindings } },
    });

  it("fails a previews block that lists only the realtime binding", () => {
    // The previews check only asks whether `durable_objects` exists in
    // `previews`, so a realtime site that adds this binding at the top level
    // alone would pass it, and every Preview would lack AUTH_RATE_LIMIT.
    const realtimeOnly = withPreviews([{ name: "EDIT_SESSION", class_name: "EditSessionDO" }]);
    const findings = checkAuthRateLimit(limited, realtimeOnly, seam(calls));
    expect(findings.errors).toHaveLength(1);
    expect(findings.errors[0]).toContain("`previews` has no Durable Object `AUTH_RATE_LIMIT`");
  });

  it("passes a previews block that copies the binding", () => {
    const copied = withPreviews([{ name: "AUTH_RATE_LIMIT", class_name: "AuthRateLimitDO" }]);
    const findings = checkAuthRateLimit(limited, copied, seam(calls));
    expect(findings.errors).toEqual([]);
    expect(findings.ok).toContain("previews: Durable Object `AUTH_RATE_LIMIT` binding present");
  });

  it("fails a binding pointed at another class", () => {
    const wrangler = wired.replace('"class_name": "AuthRateLimitDO"', '"class_name": "Other"');
    expect(checkAuthRateLimit(limited, wrangler, []).errors[0]).toContain("`Other`");
  });

  it("warns about a seam that calls getLouiseAuth without rateLimitDo, and skips the rest", () => {
    const findings = checkAuthRateLimit(limited, wired, [
      { path: "src/auth.ts", text: "getLouiseAuth(env, origin, {})" },
      { path: "src/portal-auth.ts", text: null },
      { path: "src/other.ts", text: "export const x = 1;" },
    ]);
    expect(findings.warnings).toHaveLength(1);
    expect(findings.warnings[0]).toContain("src/auth.ts");
  });
});
