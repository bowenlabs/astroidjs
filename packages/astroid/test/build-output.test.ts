import { describe, expect, it } from "vitest";
import {
  ASTROID_BUILT_WRANGLER_CONFIG,
  builtWranglerConfigPath,
  stripLegacyEnv,
} from "../src/project/build-output.js";

// The shape `@astrojs/cloudflare` writes, trimmed: two-space indent, and
// `legacy_env` in the middle of the keys rather than at an end.
const built = `{
  "name": "example",
  "main": "entry.mjs",
  "legacy_env": true,
  "compatibility_date": "2026-06-20",
  "d1_databases": [
    {
      "binding": "DB",
      "database_id": "abc"
    }
  ]
}
`;

describe("stripLegacyEnv", () => {
  it("removes legacy_env and changes nothing else", () => {
    const next = stripLegacyEnv(built);
    expect(next).not.toBeNull();
    const { legacy_env: _removed, ...expected } = JSON.parse(built);
    expect(JSON.parse(next!)).toEqual(expected);
    // Byte-for-byte what the adapter wrote, minus the one line.
    expect(next).toBe(built.replace('  "legacy_env": true,\n', ""));
  });

  it("keeps the key order", () => {
    expect(Object.keys(JSON.parse(stripLegacyEnv(built)!))).toEqual([
      "name",
      "main",
      "compatibility_date",
      "d1_databases",
    ]);
  });

  it("returns null when the field isn't there, so the file is left alone", () => {
    expect(stripLegacyEnv('{"name":"example"}')).toBeNull();
  });

  it("keeps a compact file compact", () => {
    expect(stripLegacyEnv('{"name":"example","legacy_env":true}')).toBe('{"name":"example"}');
  });

  it("removes legacy_env: false too, since current Wrangler rejects the field itself", () => {
    expect(stripLegacyEnv('{"legacy_env":false,"name":"example"}')).toBe('{"name":"example"}');
  });

  it("throws on text that isn't a JSON object, for the CLI to warn about", () => {
    expect(() => stripLegacyEnv("not json")).toThrow();
    expect(() => stripLegacyEnv("[]")).toThrow(TypeError);
  });
});

describe("builtWranglerConfigPath", () => {
  it("falls back to dist/server/wrangler.json with no redirect", () => {
    expect(builtWranglerConfigPath(null)).toBe(ASTROID_BUILT_WRANGLER_CONFIG);
  });

  it("resolves the redirect's configPath against .wrangler/deploy/", () => {
    // What the adapter writes today.
    const redirect = JSON.stringify({
      configPath: "../../dist/server/wrangler.json",
      auxiliaryWorkers: [],
    });
    expect(builtWranglerConfigPath(redirect)).toBe("dist/server/wrangler.json");
    expect(builtWranglerConfigPath('{"configPath":"../../out/worker/wrangler.json"}')).toBe(
      "out/worker/wrangler.json",
    );
  });

  it("keeps an absolute configPath", () => {
    expect(builtWranglerConfigPath('{"configPath":"/srv/site/dist/wrangler.json"}')).toBe(
      "/srv/site/dist/wrangler.json",
    );
  });

  it("falls back when the redirect is unreadable or names no path", () => {
    expect(builtWranglerConfigPath("{")).toBe(ASTROID_BUILT_WRANGLER_CONFIG);
    expect(builtWranglerConfigPath("{}")).toBe(ASTROID_BUILT_WRANGLER_CONFIG);
  });
});
