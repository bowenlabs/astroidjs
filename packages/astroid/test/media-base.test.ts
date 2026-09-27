// A staging Preview serves media from its own `/media`, while production's
// config names a media host. The page sanitizers are built once from the config,
// so they read the running deployment's base when they run; otherwise every
// image uploaded on a Preview is dropped as a hotlink.

import { afterEach, describe, expect, it } from "vitest";
import type { AstroidConfig } from "../src/config.js";
import { astroidPagesWriteHooks } from "../src/schema/collections.js";
import { astroidMediaBase, setAstroidMediaBase } from "../src/schema/media-base.js";

const config: AstroidConfig = {
  key: "acme",
  archetype: "marketing",
  theme: { name: "Acme", colors: { brand: "#1f6e6d" } },
  deploy: { platform: "cloudflare", mediaBase: "https://media.example.com" },
};

afterEach(() => setAstroidMediaBase(undefined));

describe("astroidMediaBase", () => {
  it("is the config's base until the worker records one", () => {
    expect(astroidMediaBase(config)).toBe("https://media.example.com");
    setAstroidMediaBase("/media/");
    expect(astroidMediaBase(config)).toBe("/media");
    setAstroidMediaBase("");
    expect(astroidMediaBase(config)).toBe("https://media.example.com");
  });
});

describe("page sanitizers on a Preview", () => {
  // Built before the base is recorded, as the generated worker builds them.
  const hooks = astroidPagesWriteHooks(config);
  const previewImage = '<p><img src="/media/web/a.jpg" alt="A"></p>';

  it("keep an image from the Preview's own media once the worker records its base", () => {
    setAstroidMediaBase("/media");
    expect(hooks.sanitize(previewImage)).toContain('src="/media/web/a.jpg"');
  });

  it("still drop an image from anywhere else", () => {
    setAstroidMediaBase("/media");
    expect(hooks.sanitize('<img src="https://elsewhere.example.com/a.jpg">')).not.toContain("<img");
  });

  it("check production against its own host", () => {
    expect(hooks.sanitize(previewImage)).not.toContain("<img");
    expect(hooks.sanitize('<img src="https://media.example.com/web/a.jpg">')).toContain("<img");
  });
});
