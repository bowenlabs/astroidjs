// Copyright (c) 2026 BowenLabs. Astroid is MIT licensed.
//
// The auth rate-limit module's scaffold surface.

export {
  ASTROID_AUTH_RATE_LIMIT_BINDING,
  ASTROID_AUTH_RATE_LIMIT_CLASS,
  ASTROID_AUTH_RATE_LIMIT_MIGRATION_TAG,
  astroidAuthRateLimitOption,
  generateAstroidAuthRateLimitEnv,
  generateAstroidAuthRateLimiter,
  usesAuthRateLimit,
} from "./scaffold.js";
export { type AstroidAuthSeam, checkAuthRateLimit } from "./doctor.js";
