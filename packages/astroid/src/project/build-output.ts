// Copyright (c) 2026 BowenLabs. Astroid is MIT licensed.
//
// The post-build fix `astroid build` applies to the Worker config that
// `@astrojs/cloudflare` writes.
//
// The adapter writes the built config from the Wrangler version it bundles, and
// some of those versions include `legacy_env: true`. Current Wrangler rejects
// the field, so a Workers Builds deploy running a newer Wrangler fails on the
// build's own output. `true` was always the default, so deleting the field
// changes nothing else.
//
// Pure: text in, text out, so it's tested directly and the CLI only does I/O.

/** Where `@astrojs/cloudflare` writes the built config when there's no redirect. */
export const ASTROID_BUILT_WRANGLER_CONFIG = "dist/server/wrangler.json";

/** The redirect file Wrangler reads to find the built config. */
export const WRANGLER_DEPLOY_REDIRECT = ".wrangler/deploy/config.json";

/**
 * The built config's path, relative to the project root, found the way
 * Wrangler finds it: the `configPath` in `.wrangler/deploy/config.json`, which
 * is relative to that file's own folder, else {@link ASTROID_BUILT_WRANGLER_CONFIG}.
 * Pass the redirect's text, or `null` when there isn't one.
 */
export function builtWranglerConfigPath(redirect: string | null): string {
  if (redirect === null) return ASTROID_BUILT_WRANGLER_CONFIG;
  let configPath: unknown;
  try {
    configPath = (JSON.parse(redirect) as { configPath?: unknown }).configPath;
  } catch {
    return ASTROID_BUILT_WRANGLER_CONFIG;
  }
  if (typeof configPath !== "string" || !configPath) return ASTROID_BUILT_WRANGLER_CONFIG;
  if (configPath.startsWith("/")) return configPath;
  // Resolved against `.wrangler/deploy/`, the redirect's folder.
  const parts = [".wrangler", "deploy"];
  for (const segment of configPath.split("/")) {
    if (segment === "..") parts.pop();
    else if (segment !== "." && segment !== "") parts.push(segment);
  }
  return parts.join("/");
}

/**
 * Remove `legacy_env` from a built Wrangler config. Returns the new text, or
 * `null` when the field isn't there, so the caller leaves the file untouched.
 * Keeps the file's indentation and every other key in its order. Throws when
 * the text isn't a JSON object.
 */
export function stripLegacyEnv(text: string): string | null {
  const config: unknown = JSON.parse(text);
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    throw new TypeError("The built Wrangler config isn't a JSON object.");
  }
  if (!Object.hasOwn(config, "legacy_env")) return null;
  const { legacy_env: _removed, ...rest } = config as Record<string, unknown>;
  const indent = /^\{\r?\n([ \t]+)"/.exec(text)?.[1] ?? "";
  const trailing = /\r?\n$/.exec(text)?.[0] ?? "";
  return JSON.stringify(rest, null, indent) + trailing;
}
