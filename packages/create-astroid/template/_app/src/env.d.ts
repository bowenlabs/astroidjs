/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />
/// <reference types="@cloudflare/workers-types" />

// The Cloudflare bindings this app's Worker exposes (wrangler.jsonc), read via
// `import { env } from "cloudflare:workers"`. An app with no editor binds only
// what it uses. Add a binding here when you add one to wrangler.jsonc (a KV
// namespace for a cache, a Queue, a Durable Object).
type CloudflareEnv = {
  /** D1: this app's own tables, or the database of the app that owns the schema. */
  DB: D1Database;
  /** The app's public origin, declared in wrangler.jsonc `vars`. */
  SITE_URL: string;
  /** KV: the security rate limiter. */
  RL: KVNamespace;
  /** Static assets (bound by the @astrojs/cloudflare adapter). */
  ASSETS: Fetcher;__ASTROID_ENV_BINDINGS__
};

// `env` from `cloudflare:workers` is typed as the augmentable `Cloudflare.Env`.
declare namespace Cloudflare {
  interface Env extends CloudflareEnv {}
}

// Middleware sets these; bindings themselves come from `cloudflare:workers`.
declare namespace App {
  interface Locals {
    /** Always null: this app has no editor, so no request resolves to one. */
    editor: null;
    /** Always false, for the same reason. The shared middleware still sets it. */
    editMode: boolean;__ASTROID_PORTAL_LOCALS__
  }
}
