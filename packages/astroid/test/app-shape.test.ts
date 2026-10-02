import { describe, expect, it } from "vitest";
import { type AstroidConfig, defineAstroid } from "../src/config.js";
import { generateAstroidProject, generateAstroidWrangler } from "../src/project/generate.js";
import { generateAstroidScaffoldFiles } from "../src/project/scaffold.js";
import { ASTROID_HEALTH_CRON, astroidCrons } from "../src/queues/messages.js";
import { astroidRateRules } from "../src/security/rate-rules.js";
import { astroidDisallowPaths } from "../src/seo/routes.js";
import { astroidHasEditor } from "../src/shape.js";
import { astroidModuleStatus, astroidSecretNames } from "../src/status.js";

/** An order-ahead app: its menu comes from Square, and another site edits its settings. */
const app: AstroidConfig = {
  key: "order",
  archetype: "storefront",
  editor: false,
  theme: { name: "Example Organization", colors: { brand: "#5b4bff" } },
  business: { currency: "EUR" },
  deploy: { platform: "cloudflare" },
};

const trio = (config: AstroidConfig) =>
  Object.fromEntries(generateAstroidProject(config).map((f) => [f.path, f.contents]));

describe("the editor-free app shape", () => {
  it("is off by default, so every existing project keeps its editor", () => {
    expect(astroidHasEditor({ ...app, editor: undefined })).toBe(true);
    expect(astroidHasEditor(app)).toBe(false);
  });

  it("generates the trio it always has", () => {
    // A snapshot, because the point is the whole file: nothing editor-shaped
    // should appear in it, including in places no assertion thought to check.
    expect(trio(app)).toMatchSnapshot();
  });

  it("carries no editor routes, no auth seam, and no content tables", () => {
    const files = trio(app);
    const worker = files["src/worker.ts"];
    const middleware = files["src/middleware.ts"];
    const schema = files["src/schema.ts"];

    for (const source of [worker, middleware]) {
      expect(source).not.toContain("./auth.js");
      expect(source).not.toMatch(/import \{[^}]*\bresolveEditor\b/);
    }
    for (const route of ["pagesRoute", "versionsRoute", "mediaRoute", "settingsRoute"]) {
      expect(worker).not.toContain(route);
    }
    expect(worker).not.toMatch(/DRAFTS|MEDIA|scheduled:/);
    expect(worker).toContain("statusRoute(");
    expect(middleware).toContain("resolveEditor: () => null");
    expect(middleware).not.toContain("redirectFor");

    // No content table of its own: only incident capture's two, the site's
    // re-export, and nothing imported.
    expect(schema).not.toMatch(
      /^import |sqliteTable|pagesVersions|^export \{ (?!deadLetters, incidents)/m,
    );
    expect(schema).toContain('export { deadLetters, incidents } from "louise-toolkit/incidents";');
    expect(schema).toContain('export * from "./schema.site.js";');
  });

  it("keeps the portal and the pwa module working", () => {
    const withModules: AstroidConfig = {
      ...app,
      modules: ["pwa"],
      portal: { enabled: true, tablePrefix: "", signUp: true },
    };
    const middleware = trio(withModules)["src/middleware.ts"];
    expect(middleware).toContain("resolvePortalSession(context.request, resolvePortalUser)");
    expect(middleware).toContain("portalGuard(");

    const paths = generateAstroidScaffoldFiles(withModules).map((f) => f.path);
    expect(paths).toContain("src/portal-auth.ts");
    expect(paths).toContain("public/sw.js");
    expect(paths).toContain("public/manifest.webmanifest");
  });

  it("takes Square's CSP origins and checkout rule without the pipeline", () => {
    const square: AstroidConfig = { ...app, commerce: { provider: "square", pipeline: false } };
    const files = trio(square);
    // The catalog table's JSON columns need their type, which only the
    // editor schema used to import for its own reasons.
    expect(files["src/schema.ts"]).toContain("export const products = sqliteTable(");
    expect(files["src/schema.ts"]).toContain(
      'import type { JsonValue } from "louise-toolkit/content";',
    );
    expect(files["src/worker.ts"]).not.toMatch(/COMMERCE_QUEUE|queue:|scheduled:/);
    expect(astroidRateRules(square).map((r) => r.name)).toContain("checkout");
    const paths = generateAstroidScaffoldFiles(square).map((f) => f.path);
    expect(paths).toContain("src/pages/api/checkout.ts");
    expect(paths.some((p) => p.startsWith("src/pages/api/webhooks/"))).toBe(false);
  });

  it("schedules nothing unless the config does", () => {
    expect(astroidCrons(app)).toEqual([]);
    expect(generateAstroidWrangler(app)).not.toContain('"triggers"');

    const piped: AstroidConfig = { ...app, commerce: { provider: "square" } };
    expect(astroidCrons(piped)).not.toContain(ASTROID_HEALTH_CRON);
    expect(trio(piped)["src/worker.ts"]).toContain("scheduled:");
  });

  it("binds only what the app uses", () => {
    const wrangler = generateAstroidWrangler(app);
    expect(wrangler).toContain('"binding": "DB"');
    expect(wrangler).toContain('"binding": "RL"');
    for (const unused of ["DRAFTS", "MEDIA", "IMAGES", "VITALS", '"AI"', "send_email"]) {
      expect(wrangler).not.toContain(unused);
    }
    for (const unused of ["MEDIA_URL", "OWNER_EMAIL", "AI_GATEWAY_ID", "ASTROID_EDGE_CACHE"]) {
      expect(wrangler).not.toContain(`"${unused}"`);
    }
    // A portal's password resets are mail, so a portal brings the binding back.
    const withPortal = generateAstroidWrangler({ ...app, portal: { enabled: true } });
    expect(withPortal).toContain('"send_email"');
  });

  it("leaves out migrations_dir when another app migrates the database", () => {
    // Otherwise `astroid doctor` reports the contradiction on a fresh scaffold.
    const shared = { ...app, deploy: { platform: "cloudflare" as const, migrations: false } };
    expect(generateAstroidWrangler(shared)).not.toContain("migrations_dir");
    expect(generateAstroidWrangler(app)).toContain('"migrations_dir": "migrations"');
  });

  it("scaffolds none of the editor's files", () => {
    const paths = generateAstroidScaffoldFiles(app).map((f) => f.path);
    // Incident capture's migration is every shape's, not the editor's.
    expect(paths).toEqual(["migrations/0006_incidents.sql", "src/schema.site.ts"]);
  });

  it("covers the versioned API, and drops the editor's sign-in rules", () => {
    const rules = astroidRateRules(app);
    const names = rules.map((r) => r.name);
    expect(names).not.toContain("magic-link");
    expect(names).not.toContain("auth");
    const api = rules.find((r) => r.name === "api");
    expect(api?.match("/api/v1/quote")).toBe(true);
    expect(api?.match("/api/v10/quote")).toBe(false);
    // An editor site's rules are unchanged.
    const site = astroidRateRules({ ...app, editor: undefined }).map((r) => r.name);
    expect(site).toEqual(["magic-link", "auth"]);
  });

  it("asks for the secrets and mail only a portal needs", async () => {
    expect(astroidSecretNames(app)).toEqual({});
    expect(astroidSecretNames({ ...app, portal: { enabled: true } })).toEqual({
      core: ["SESSION_SECRET"],
      email: ["MAIL_FROM"],
    });
    const report = await astroidModuleStatus(app, {});
    expect(report.map((r) => r.module)).not.toContain("email");
  });

  it("keeps /louise out of robots.txt, since there's no editor to hide", () => {
    expect(astroidDisallowPaths(app)).not.toContain("/louise");
  });
});

describe("defineAstroid with editor: false", () => {
  const refuses = (over: Partial<AstroidConfig>, pattern: RegExp) =>
    expect(() => defineAstroid({ ...app, ...over })).toThrow(pattern);

  it("accepts the shape and the modules it keeps", () => {
    expect(() =>
      defineAstroid({
        ...app,
        modules: ["pwa", "map"],
        portal: { enabled: true },
        commerce: { provider: "square", pipeline: false },
        status: { checks: true },
      }),
    ).not.toThrow();
  });

  it("refuses every option that configures the editor", () => {
    refuses({ sections: ["hero"] }, /`sections`/);
    refuses({ sectionCatalog: {} }, /`sectionCatalog`/);
    refuses({ blockCatalog: {} }, /`blockCatalog`/);
    refuses({ media: { maxUploadBytes: 1024 } }, /`media`/);
    refuses({ pages: { hooks: true } }, /`pages`/);
    refuses({ settings: { customKeys: ["hours"] } }, /`settings`/);
    refuses({ inquiries: true }, /`inquiries: true`/);
    refuses({ modules: ["realtime"] }, /`realtime`/);
    refuses({ modules: ["wholesaleInquiry"] }, /`wholesaleInquiry`/);
    // Its limiter guards sign-in, and without a portal an app signs nobody in.
    refuses({ modules: ["authRateLimit"] }, /`authRateLimit`/);
    refuses({ deploy: { platform: "cloudflare", mediaBase: "/m" } }, /`deploy\.mediaBase`/);
  });

  it("keeps the auth rate limiter for an app whose portal signs people in", () => {
    const limited: AstroidConfig = {
      ...app,
      modules: ["authRateLimit"],
      portal: { enabled: true },
    };
    expect(() => defineAstroid(limited)).not.toThrow();
    expect(trio(limited)["src/worker.ts"]).toContain(
      'export { AuthRateLimitDO } from "./auth-rate-limiter.js";',
    );
  });

  it("accepts `inquiries: false`, which says what the shape already does", () => {
    expect(() => defineAstroid({ ...app, inquiries: false })).not.toThrow();
  });
});
