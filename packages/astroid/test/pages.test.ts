// Edit mode resumes the editor's work-in-progress. The generated routes save
// through the DRAFTS buffer and reach D1 only when it flushes, so a page read
// has to check the buffer first, under the same key, or a reload before the
// flush shows an older page than the one just saved.

import { draftBufferKey, type DraftBufferKV, writeDraftBuffer } from "louise-toolkit/editor";
import { describe, expect, it } from "vitest";
import type { AstroidConfig } from "../src/config.js";
import { astroidPagesCollection } from "../src/schema/collections.js";
import { generateAstroidSchema } from "../src/schema/generate.js";
import { astroidPageDraft, type AstroidPageDraftEnv } from "../src/pages/index.js";

const config: AstroidConfig = {
  key: "acme",
  archetype: "marketing",
  theme: { name: "Acme", colors: { brand: "#1f6e6d" } },
  deploy: { platform: "cloudflare", mediaBase: "https://media.example.com" },
};

/** A KV namespace over a Map, enough for the buffer's get and put. */
function memoryKv(): DraftBufferKV {
  const store = new Map<string, string>();
  return {
    get: async (key: string) => store.get(key) ?? null,
    put: async (key: string, value: string) => void store.set(key, value),
    delete: async (key: string) => void store.delete(key),
  } as DraftBufferKV;
}

/** A D1 binding that fails the test if the read reaches it. */
const unreachableDb = new Proxy({} as AstroidPageDraftEnv["DB"], {
  get() {
    throw new Error("read D1 although the buffer held the draft");
  },
});

describe("astroidPageDraft", () => {
  it("resumes the buffered draft under the key the generated routes write", async () => {
    const DRAFTS = memoryKv();
    const data = { title: "Saved a moment ago", sections: [{ _type: "pageHero" }] };
    const key = draftBufferKey(astroidPagesCollection(config).slug, 7);
    await writeDraftBuffer(DRAFTS, key, { data, updatedAt: 1, flushedAt: 0 });

    expect(await astroidPageDraft(config, { DB: unreachableDb, DRAFTS }, 7)).toEqual(data);
  });

  it("keys the versions table by the slug the generated schema uses", () => {
    const { slug } = astroidPagesCollection(config);
    expect(generateAstroidSchema(config)).toContain(
      `export const pagesVersions = collectionVersionsTable({ slug: "${slug}", fields: {} });`,
    );
  });
});
