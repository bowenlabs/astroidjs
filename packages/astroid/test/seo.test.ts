import { describe, expect, it } from "vitest";
import type { AstroidConfig } from "../src/config.js";
import { resolvePageSeo } from "../src/seo/resolve.js";
import {
  astroidDisallowPaths,
  astroidNoindexPaths,
  astroidRobotsTxt,
  astroidSitemapXml,
} from "../src/seo/routes.js";
import { astroidStructuredData, escapeJsonLd } from "../src/seo/structured-data.js";

const settings = {
  siteName: "Acme Coffee",
  tagline: "Small-batch roasters",
  metaDescription: "Coffee roasted in small batches.",
  defaultOgImageUrl: "/media/og.png",
  disableIndexing: false,
};

const canonical = "https://acme.coffee/shop/beans";
const opts = { canonical };

const config: AstroidConfig = {
  key: "acme",
  archetype: "storefront",
  theme: { name: "Acme Coffee", colors: { brand: "#123456" } },
};

describe("resolvePageSeo", () => {
  it("templates a page title but leaves the site title bare", () => {
    expect(resolvePageSeo(settings, { title: "Beans" }, opts).title).toBe("Beans | Acme Coffee");
    // Templating the site-wide default would read "Acme Coffee | Acme Coffee".
    expect(resolvePageSeo(settings, {}, opts).title).toBe("Acme Coffee");
  });

  it("honours a custom template, and keeps the untemplated title for OG", () => {
    const seo = resolvePageSeo(
      settings,
      { title: "Beans" },
      { ...opts, titleTemplate: "%s — Shop" },
    );
    expect(seo.title).toBe("Beans — Shop");
    // og:site_name already carries the brand; templating og:title repeats it.
    expect(seo.bareTitle).toBe("Beans");
  });

  it("treats an empty or whitespace override as unset, not as a blank tag", () => {
    // Clearing a field in the editor must fall back, not publish <meta content="">.
    const seo = resolvePageSeo(settings, { title: "   ", description: "" }, opts);
    expect(seo.title).toBe("Acme Coffee");
    expect(seo.description).toBe("Coffee roasted in small batches.");
  });

  it("resolves the OG image to an absolute URL against the canonical", () => {
    expect(resolvePageSeo(settings, {}, opts).ogImage).toBe("https://acme.coffee/media/og.png");
    expect(resolvePageSeo(settings, { ogImage: "/media/beans.png" }, opts).ogImage).toBe(
      "https://acme.coffee/media/beans.png",
    );
    // An already-absolute URL (a CDN-hosted card) passes through.
    expect(resolvePageSeo(settings, { ogImage: "https://cdn.x/a.png" }, opts).ogImage).toBe(
      "https://cdn.x/a.png",
    );
  });

  it("degrades instead of throwing when the canonical isn't a usable base", () => {
    // A page that can't resolve its OG image should still render a head.
    const seo = resolvePageSeo(settings, {}, { canonical: "not-a-url" });
    expect(seo.ogImage).toBeUndefined();
    expect(seo.ogImageAlt).toBeUndefined();
    expect(seo.title).toBe("Acme Coffee");
  });

  it("lets the site-wide kill switch beat a page that asks to be indexed", () => {
    // Staging must stay out of the index even for pages with noindex unset.
    const staged = { ...settings, disableIndexing: true };
    expect(resolvePageSeo(staged, { noindex: false }, opts).noindex).toBe(true);
    expect(resolvePageSeo(settings, { noindex: true }, opts).noindex).toBe(true);
    expect(resolvePageSeo(settings, {}, opts).noindex).toBe(false);
  });

  it("survives entirely empty settings", () => {
    const seo = resolvePageSeo({}, {}, opts);
    expect(seo.title).toBe("");
    expect(seo.description).toBeUndefined();
    expect(seo.noindex).toBe(false);
  });
});

describe("astroidStructuredData", () => {
  it("picks the business @type from the archetype, overridable in config", () => {
    const graph = astroidStructuredData({ config, settings, siteUrl: "https://acme.coffee" });
    const [business] = graph["@graph"] as Record<string, unknown>[];
    expect(business["@type"]).toBe("Store");

    const specific = astroidStructuredData({
      config: { ...config, seo: { businessType: "CafeOrCoffeeShop" } },
      settings,
      siteUrl: "https://acme.coffee",
    });
    expect((specific["@graph"] as Record<string, unknown>[])[0]["@type"]).toBe("CafeOrCoffeeShop");

    const portfolio = astroidStructuredData({
      config: { ...config, archetype: "portfolio" },
      settings,
      siteUrl: "https://acme.coffee",
    });
    expect((portfolio["@graph"] as Record<string, unknown>[])[0]["@type"]).toBe("Person");
  });

  it("gives the business a stable @id the other nodes reference", () => {
    const graph = astroidStructuredData({ config, settings, siteUrl: "https://acme.coffee/" });
    const [business, website] = graph["@graph"] as Record<string, unknown>[];
    // Trailing slash normalized, so the @id is stable across callers.
    expect(business["@id"]).toBe("https://acme.coffee/#business");
    expect(website.publisher).toEqual({ "@id": "https://acme.coffee/#business" });
  });

  it("joins the page entity into the same graph", () => {
    const graph = astroidStructuredData({
      config,
      settings,
      siteUrl: "https://acme.coffee",
      entity: { "@type": "Product", name: "Beans" },
    });
    const nodes = graph["@graph"] as Record<string, unknown>[];
    expect(nodes).toHaveLength(3);
    expect(nodes[2]).toEqual({ "@type": "Product", name: "Beans" });
  });

  it("omits absent fields instead of emitting nulls", () => {
    const graph = astroidStructuredData({
      config,
      settings: { siteName: "Acme Coffee" },
      siteUrl: "https://acme.coffee",
    });
    const [business] = graph["@graph"] as Record<string, unknown>[];
    expect(business).not.toHaveProperty("email");
    expect(business).not.toHaveProperty("image");
    expect(business).not.toHaveProperty("sameAs");
  });

  it("takes sameAs from socialLinks in either stored shape, keeping only URLs", () => {
    const asMap = astroidStructuredData({
      config,
      settings: {
        ...settings,
        socialLinks: { instagram: "https://instagram.com/acme", x: "@acme" },
      },
      siteUrl: "https://acme.coffee",
    });
    // "@acme" is a handle, not a profile URL—schema.org sameAs wants URLs.
    expect((asMap["@graph"] as Record<string, unknown>[])[0].sameAs).toEqual([
      "https://instagram.com/acme",
    ]);

    const asArray = astroidStructuredData({
      config,
      settings: { ...settings, socialLinks: ["https://instagram.com/acme"] },
      siteUrl: "https://acme.coffee",
    });
    expect((asArray["@graph"] as Record<string, unknown>[])[0].sameAs).toEqual([
      "https://instagram.com/acme",
    ]);
  });

  it("falls back to the config brand when settings have no siteName", () => {
    const graph = astroidStructuredData({ config, settings: {}, siteUrl: "https://acme.coffee" });
    expect((graph["@graph"] as Record<string, unknown>[])[0].name).toBe("Acme Coffee");
  });
});

describe("escapeJsonLd", () => {
  it("makes it impossible for editor content to break out of the script element", () => {
    const payload = escapeJsonLd({ description: "</script><img src=x onerror=alert(1)>" });
    expect(payload).not.toContain("</script>");
    expect(payload).not.toContain("<");
    expect(payload).not.toContain(">");
    // Still valid JSON—the escapes are \uXXXX, not mangling.
    expect(JSON.parse(payload)).toEqual({
      description: "</script><img src=x onerror=alert(1)>",
    });
  });

  it("escapes ampersands too (HTML-entity smuggling)", () => {
    expect(escapeJsonLd({ a: "&lt;" })).not.toContain("&");
  });
});

const full: AstroidConfig = {
  ...config,
  portal: { enabled: true },
  commerce: { provider: "square" },
};

describe("astroidDisallowPaths", () => {
  it("lists only what no crawler should fetch: the API and the editor", () => {
    expect(astroidDisallowPaths(config)).toEqual(["/api", "/louise"]);
    // The portal's auth mount sits under /api, so it adds nothing...
    expect(astroidDisallowPaths(full)).toEqual(["/api", "/louise"]);
    // ...unless the config moves it.
    expect(
      astroidDisallowPaths({ ...config, portal: { enabled: true, basePath: "/portal-auth" } }),
    ).toEqual(["/api", "/louise", "/portal-auth"]);
  });

  it("leaves out pages that print noindex, so a crawler can see the tag", () => {
    for (const page of ["/login", "/account", "/register", "/checkout", "/cart", "/portal"]) {
      expect(astroidDisallowPaths(full)).not.toContain(page);
    }
  });
});

describe("astroidNoindexPaths", () => {
  it("covers the disallowed paths, the sign-in page, and module surfaces", () => {
    expect(astroidNoindexPaths(config)).toEqual(["/api", "/login", "/louise"]);
    expect(astroidNoindexPaths(config)).not.toContain("/account");

    expect(astroidNoindexPaths(full)).toEqual([
      "/account",
      "/api",
      "/cart",
      "/checkout",
      "/login",
      "/louise",
      "/portal",
      "/register",
      "/reset-password",
    ]);
  });

  it("drops an entry another entry covers", () => {
    // The portal's default guard covers /portal and /api/portal; /api already
    // covers the second.
    expect(astroidNoindexPaths(full)).not.toContain("/api/portal");
  });
});

describe("astroidRobotsTxt", () => {
  it("points the sitemap at the SERVING origin, not a configured domain", () => {
    // A preview deploy advertising the canonical host invites its content to be
    // indexed under the real domain.
    const txt = astroidRobotsTxt(config, { origin: "https://preview.acme.workers.dev" });
    expect(txt).toContain("Sitemap: https://preview.acme.workers.dev/sitemap.xml");
    expect(txt).toContain("Disallow: /api/");
  });

  it("blocks each path on a segment boundary, not as a bare prefix", () => {
    const txt = astroidRobotsTxt(config, { origin: "https://acme.coffee" });
    expect(txt).toBe(
      [
        "User-agent: *",
        "Allow: /",
        "Disallow: /api$",
        "Disallow: /api/",
        "Disallow: /louise$",
        "Disallow: /louise/",
        "",
        "Sitemap: https://acme.coffee/sitemap.xml",
        "",
      ].join("\n"),
    );
    // A bare `Disallow: /louise` would also block a page at /louise-story.
    expect(txt).not.toMatch(/^Disallow: \/louise\r?$/m);
  });

  it("doesn't disallow the noindex pages", () => {
    const txt = astroidRobotsTxt(full, { origin: "https://acme.coffee" });
    for (const page of ["/login", "/account", "/register", "/reset-password", "/cart"]) {
      expect(txt).not.toContain(`Disallow: ${page}`);
    }
  });

  it("passes a pattern of your own through, and drops line breaks", () => {
    const txt = astroidRobotsTxt(config, {
      origin: "https://acme.coffee",
      disallow: ["/*.json$", "/drafts/", "/x\nSitemap: https://attacker.example"],
    });
    expect(txt).toContain("Disallow: /*.json$\n");
    expect(txt).toContain("Disallow: /drafts$\nDisallow: /drafts/\n");
    expect(txt).not.toContain("\nSitemap: https://attacker.example");
  });

  it("blocks the whole crawl when indexing is disabled", () => {
    const txt = astroidRobotsTxt(config, { origin: "https://acme.coffee", disableIndexing: true });
    expect(txt).toBe("User-agent: *\nDisallow: /\n");
    // Don't advertise a sitemap for a site that shouldn't be crawled.
    expect(txt).not.toContain("Sitemap:");
  });
});

describe("astroidSitemapXml", () => {
  const origin = "https://acme.coffee";

  it("emits absolute, sorted, de-duplicated locs", () => {
    const xml = astroidSitemapXml(config, ["/shop", "/", "/shop", "contact"], { origin });
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    expect(locs).toEqual([
      "https://acme.coffee/",
      "https://acme.coffee/contact",
      "https://acme.coffee/shop",
    ]);
  });

  it("drops the paths the config keeps out of the index", () => {
    const xml = astroidSitemapXml(
      { ...config, portal: { enabled: true } },
      ["/", "/account/orders", "/api/health", "/louise"],
      { origin },
    );
    expect(xml).not.toContain("/account");
    expect(xml).not.toContain("/api/");
    expect(xml).not.toContain("/louise");
    expect(xml).toContain("https://acme.coffee/</loc>");
  });

  it("matches excluded paths on segment boundaries", () => {
    const xml = astroidSitemapXml(
      full,
      ["/account", "/account/orders", "/accounts", "/registration", "/cartography", "/api"],
      { origin },
    );
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    // A published page that only starts with a hidden path stays listed.
    expect(locs).toEqual([
      "https://acme.coffee/accounts",
      "https://acme.coffee/cartography",
      "https://acme.coffee/registration",
    ]);
  });

  it("leaves out the noindex pages that robots.txt still lets crawlers fetch", () => {
    const xml = astroidSitemapXml(full, ["/", "/login", "/checkout", "/portal/orders"], { origin });
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    expect(locs).toEqual(["https://acme.coffee/"]);
  });

  it("lists nothing while indexing is disabled", () => {
    const xml = astroidSitemapXml(config, ["/", "/shop"], { origin, disableIndexing: true });
    expect(xml).not.toContain("<url>");
    expect(xml).toContain("<urlset");
  });

  it("XML-escapes locs — an unescaped & makes the whole document invalid", () => {
    const xml = astroidSitemapXml(config, ["/shop?a=1&b=2"], { origin });
    expect(xml).toContain("&amp;b=2");
    expect(xml).not.toMatch(/&(?!amp;|lt;|gt;|quot;|apos;)/);
  });

  it("emits lastmod from a Date or an ISO string", () => {
    const xml = astroidSitemapXml(
      config,
      [
        { path: "/a", lastmod: new Date("2026-01-02T03:04:05Z") },
        { path: "/b", lastmod: "2026-02-03" },
        { path: "/c" },
      ],
      { origin },
    );
    expect(xml).toContain("<lastmod>2026-01-02T03:04:05.000Z</lastmod>");
    expect(xml).toContain("<lastmod>2026-02-03</lastmod>");
    expect(xml).toContain("<url><loc>https://acme.coffee/c</loc></url>");
  });

  it("produces a valid empty document when everything is excluded", () => {
    const xml = astroidSitemapXml(config, ["/api/x"], { origin });
    expect(xml).toContain("<urlset");
    expect(xml).toContain("</urlset>");
    expect(xml).not.toContain("<url>");
  });
});
