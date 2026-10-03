import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { sanitizeRichHtml } from "louise-toolkit/security";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { sanitizeAstroidRichHtml } from "../src/components/rich-html.js";

// The real sanitizer, wrapped so a test can count the parses the memo saves.
vi.mock("louise-toolkit/security", async (importOriginal) => {
  const actual = await importOriginal<typeof import("louise-toolkit/security")>();
  return { ...actual, sanitizeRichHtml: vi.fn(actual.sanitizeRichHtml) };
});

const parses = vi.mocked(sanitizeRichHtml);

beforeEach(() => {
  parses.mockClear();
});

describe("sanitizeAstroidRichHtml: stored HTML the sanitizer no longer allows", () => {
  // Each shape is HTML that a sanitizer before louise-toolkit 0.43 could store,
  // or that a write around the pages collection's hook could. It has to come out
  // of the render clean, with no re-save.
  it("drops a tag rebuilt from the pieces around a removed one", () => {
    const out = sanitizeAstroidRichHtml("<p>a<scr<link/x>ipt>alert(1)</scr<link/x>ipt>b</p>");
    expect(out).not.toMatch(/<script/i);
    expect(out).not.toMatch(/<link/i);
    expect(out).toBe("<p>aipt&gt;b</p>");
  });

  it("escapes a quote inside an attribute value, so it can't close the attribute", () => {
    const out = sanitizeAstroidRichHtml(
      `<p><img src="/media/a.jpg" alt='x"><script>alert(1)</script>'></p>`,
      { mediaBase: "/media" },
    );
    expect(out).not.toMatch(/<script/i);
    expect(out).toBe(
      '<p><img src="/media/a.jpg" alt="x&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;"></p>',
    );
  });

  it("drops an event handler glued to the previous attribute's closing quote", () => {
    const out = sanitizeAstroidRichHtml(
      '<p><a href="https://example.com" title="a"onmouseover="alert(1)">x</a></p>',
    );
    expect(out).toBe('<p><a href="https://example.com">x</a></p>');
  });

  it("drops a meta refresh", () => {
    const out = sanitizeAstroidRichHtml(
      '<meta http-equiv="refresh" content="0;url=https://example.com/"><p>Hello</p>',
    );
    expect(out).toBe("<p>Hello</p>");
  });

  it("drops an image the site's media library doesn't serve, as the write hook does", () => {
    const html = '<p><img src="https://example.com/x.png" alt="x"></p>';
    expect(sanitizeAstroidRichHtml(html, { mediaBase: "/media" })).toBe("<p></p>");
    // Without a base, any safe `src` stays, so a missing prop never drops an
    // image the site serves.
    expect(sanitizeAstroidRichHtml(html)).toBe(html);
  });

  it("checks against the base the way the write hook does, trailing slash and all", () => {
    const html = '<p><img src="https://media.example.com/a.jpg" alt="A"></p>';
    expect(sanitizeAstroidRichHtml(html, { mediaBase: "https://media.example.com/" })).toBe(
      sanitizeRichHtml(html, { mediaBase: "https://media.example.com" }),
    );
    expect(sanitizeAstroidRichHtml(html, { mediaBase: "https://media.example.com/" })).toBe(html);
  });

  it("renders a value that isn't a string as nothing", () => {
    expect(sanitizeAstroidRichHtml(undefined)).toBe("");
    expect(sanitizeAstroidRichHtml(null)).toBe("");
    expect(sanitizeAstroidRichHtml(42)).toBe("");
    expect(sanitizeAstroidRichHtml({ html: "<p>x</p>" })).toBe("");
    expect(sanitizeAstroidRichHtml("")).toBe("");
    expect(parses).not.toHaveBeenCalled();
  });
});

describe("sanitizeAstroidRichHtml: content the editor saved", () => {
  // What the write hook stores. Rendering it again must not change a byte, or
  // every page would shift on upgrade.
  const saved = [
    "<div><p>Hello <strong>world</strong> &amp; <em>friends</em></p></div>",
    '<div><h2>Hours</h2><ul><li>Mon to Fri</li><li>Sat</li></ul><p><a href="https://example.com/menu">See the menu</a></p></div>',
    '<div><p>Roasted in house.</p><img src="/media/beans.jpg" alt="Beans, roasted"><blockquote><p>Great coffee.</p></blockquote></div>',
    '<p>café &lt;tag&gt; "quoted" non&nbsp;break</p>',
    "<div><ol><li><p>One</p></li><li><p>Two <s>three</s> <code>x</code></p></li></ol></div>",
  ];

  it.each(saved)("renders %s byte for byte", (html) => {
    // It's the sanitizer's own output, so this is the content a save stores.
    expect(sanitizeRichHtml(html, { mediaBase: "/media" })).toBe(html);
    expect(sanitizeAstroidRichHtml(html, { mediaBase: "/media" })).toBe(html);
  });
});

describe("sanitizeAstroidRichHtml: the memo", () => {
  it("parses a field once, however often it renders", () => {
    const html = "<p>Memo hit, once.</p>";
    const first = sanitizeAstroidRichHtml(html, { mediaBase: "/media" });
    const second = sanitizeAstroidRichHtml(html, { mediaBase: "/media" });
    expect(second).toBe(first);
    expect(parses).toHaveBeenCalledTimes(1);
  });

  it("keys on the media base, since the base changes the output", () => {
    const html = '<p><img src="https://example.com/memo.png" alt="x"></p>';
    expect(sanitizeAstroidRichHtml(html, { mediaBase: "/media" })).toBe("<p></p>");
    expect(sanitizeAstroidRichHtml(html)).toBe(html);
    expect(sanitizeAstroidRichHtml(html, { mediaBase: "https://example.com" })).toBe(html);
    expect(parses).toHaveBeenCalledTimes(3);
  });

  it("forgets the least recently used field once it holds 256", () => {
    const keep = "<p>Recently used.</p>";
    const evicted = "<p>Least recently used.</p>";
    sanitizeAstroidRichHtml(evicted);
    sanitizeAstroidRichHtml(keep);
    for (let i = 0; i < 255; i++) {
      // A hit moves `keep` to the end, so it outlives everything here.
      sanitizeAstroidRichHtml(keep);
      sanitizeAstroidRichHtml(`<p>Filler ${i}.</p>`);
    }
    parses.mockClear();
    sanitizeAstroidRichHtml(keep);
    expect(parses).not.toHaveBeenCalled();
    sanitizeAstroidRichHtml(evicted);
    expect(parses).toHaveBeenCalledTimes(1);
  });

  it("doesn't memoize a field too long to share the memo", () => {
    const html = `<p>${"x".repeat(300_000)}</p>`;
    sanitizeAstroidRichHtml(html);
    sanitizeAstroidRichHtml(html);
    expect(parses).toHaveBeenCalledTimes(2);
  });
});

describe("every stored rich-text render goes through sanitizeAstroidRichHtml", () => {
  // A `.astro` file can't be imported from a vitest run, so read the source.
  // A new `set:html` on stored content without the helper is the hole this
  // closes, and it renders fine, so nothing else would notice it.
  const root = join(import.meta.dirname, "..", "..");
  const dirs = [
    join(root, "astroid", "src", "components"),
    join(root, "create-astroid", "template", "src"),
  ];

  function astroFiles(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true, recursive: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(".astro"))
      .map((entry) => join(entry.parentPath, entry.name));
  }

  // JSON-LD isn't rich text: it's escaped for a `<script>` by `escapeJsonLd`.
  const notRichText = new Set(["astroid/src/components/StructuredData.astro"]);

  const renders = dirs
    .flatMap(astroFiles)
    .flatMap((file) =>
      [...readFileSync(file, "utf8").matchAll(/set:html=\{([^\n]*)\}/g)].map((match) => ({
        file: relative(root, file),
        expression: match[1] ?? "",
      })),
    )
    .filter(({ file }) => !notRichText.has(file));

  it("finds the renders it checks", () => {
    expect(renders.map(({ file }) => file).sort()).toEqual([
      "astroid/src/components/sections/AboutIntro.astro",
      "astroid/src/components/sections/Faq.astro",
      "astroid/src/components/sections/SplitImage.astro",
      "create-astroid/template/src/pages/[...slug].astro",
      "create-astroid/template/src/pages/index.astro",
    ]);
  });

  it.each(renders)("$file sanitizes what it renders", ({ file, expression }) => {
    const source = readFileSync(join(root, file), "utf8");
    // Either the expression calls the helper, or it names a value the
    // frontmatter assigned from it (`const body = sanitizeAstroidRichHtml(…)`).
    const direct = expression.startsWith("sanitizeAstroidRichHtml(");
    const viaConst = new RegExp(`const ${expression} = sanitizeAstroidRichHtml\\(`).test(source);
    expect(direct || viaConst).toBe(true);
    // And it checks against the site's media base, as the write did.
    expect(source).toMatch(/sanitizeAstroidRichHtml\([^\n]*\{ mediaBase(: env\.MEDIA_URL)? \}\)/);
  });

  it("threads the media base from <Sections> down to every section", () => {
    const components = join(root, "astroid", "src", "components");
    expect(readFileSync(join(components, "Sections.astro"), "utf8")).toContain(
      "mediaBase={mediaBase}",
    );
    const section = readFileSync(join(components, "Section.astro"), "utf8");
    expect(section).toContain(
      "const shared = { item, base, edit: editing, mediaMeta, mediaBase };",
    );
    expect(section).toContain("mediaBase={mediaBase}");
  });
});
