// Copyright (c) 2026 BowenLabs. Astroid is MIT licensed.
//
// The auth rate-limit module: a Durable Object for Better Auth's rate limiter
// to count in, opt-in via `modules: ["authRateLimit"]`.
//
// louise-toolkit turns Better Auth's limiter on for every `getLouiseAuth`
// instance off localhost. Without `rateLimitDo` it counts in KV, which
// undercounts under a burst, or in each isolate's memory, which gives a burst
// spread across isolates a budget in each. A Durable Object is the only atomic
// counter on Workers, so it's the one that holds for sign-in.
//
// What Astroid generates and what it doesn't:
//
//   - The DO SUBCLASS is scaffold-once (`src/auth-rate-limiter.ts`), because it
//     must import `cloudflare:workers`, a runtime-only specifier the toolkit
//     can't carry. `createRateLimiter` in `louise-toolkit/security` is the
//     logic it delegates to; this is the boilerplate around it.
//   - The wrangler `durable_objects` binding and `migrations` entry, and the
//     re-export from the generated worker entry, without which wrangler can't
//     resolve the binding's `class_name`.
//   - NOT the `rateLimitDo` option itself: the auth seams that call
//     `getLouiseAuth` are scaffold-once, so a fresh scaffold passes it and an
//     existing project adds the line. `astroid doctor` says so.

import type { AstroidConfig } from "../config.js";

/** The DO namespace binding name. Fixed, so the auth seams and doctor agree. */
export const ASTROID_AUTH_RATE_LIMIT_BINDING = "AUTH_RATE_LIMIT";

/** The exported class name wrangler resolves for the binding. Must match the
 *  `class_name` in wrangler.jsonc AND be re-exported from the worker entry. */
export const ASTROID_AUTH_RATE_LIMIT_CLASS = "AuthRateLimitDO";

/** Migration tag for the class. Named rather than `v2`, so it never collides
 *  with the realtime module's `v1` whichever module a project turned on first. */
export const ASTROID_AUTH_RATE_LIMIT_MIGRATION_TAG = "auth-rate-limit-v1";

/** Is the auth rate-limit module switched on for this project? */
export function usesAuthRateLimit(config: AstroidConfig): boolean {
  return (config.modules ?? []).includes("authRateLimit");
}

/**
 * The `rateLimitDo` line an auth seam passes to `getLouiseAuth`, indented for
 * an options object, or "" without the module.
 */
export function astroidAuthRateLimitOption(config: AstroidConfig, indent = "    "): string {
  if (!usesAuthRateLimit(config)) return "";
  return [
    `${indent}// Better Auth's rate limiter counts in a Durable Object, the one atomic`,
    `${indent}// counter on Workers (the authRateLimit module).`,
    `${indent}rateLimitDo: env.${ASTROID_AUTH_RATE_LIMIT_BINDING},`,
  ].join("\n");
}

/**
 * `src/auth-rate-limiter.ts`—the site-owned Durable Object subclass.
 *
 * Returns null when the project has no auth rate-limit module.
 */
export function generateAstroidAuthRateLimiter(config: AstroidConfig): string | null {
  if (!usesAuthRateLimit(config)) return null;
  return [
    "// The Durable Object Better Auth's rate limiter counts in (the authRateLimit",
    "// module). Scaffolded once and yours to edit, though there's little to tune:",
    "// `createRateLimiter` in louise-toolkit/security holds the counter, and this",
    "// class exists because only the site can import `cloudflare:workers`.",
    "//",
    "// One object per key (client address and path), so no single object becomes",
    "// a bottleneck. The generated src/worker.ts re-exports this class, or",
    "// wrangler can't resolve the `class_name` in the durable_objects binding.",
    "",
    'import { DurableObject } from "cloudflare:workers";',
    'import { createRateLimiter } from "louise-toolkit/security";',
    "",
    `export class ${ASTROID_AUTH_RATE_LIMIT_CLASS} extends DurableObject<CloudflareEnv> {`,
    "  #limiter = createRateLimiter(this.ctx);",
    "",
    "  fetch(request: Request): Promise<Response> {",
    "    return this.#limiter.fetch(request);",
    "  }",
    "",
    "  // Clears a counter once its window has passed, so an idle address stops",
    "  // occupying storage.",
    "  alarm(): Promise<void> {",
    "    return this.#limiter.alarm();",
    "  }",
    "}",
    "",
  ].join("\n");
}

/**
 * The `CloudflareEnv` member the module adds, as a block `create-astroid`
 * substitutes into `src/env.d.ts`. Empty without the module.
 */
export function generateAstroidAuthRateLimitEnv(config: AstroidConfig): string {
  if (!usesAuthRateLimit(config)) return "";
  return [
    "  /** Durable Object namespace Better Auth's rate limiter counts in (the",
    "   *  authRateLimit module), passed to `getLouiseAuth` as `rateLimitDo`. */",
    `  ${ASTROID_AUTH_RATE_LIMIT_BINDING}: DurableObjectNamespace;`,
  ].join("\n");
}
