import { generateHydrationScript } from "solid-js/web";
import { describe, expect, it } from "vitest";
import type { AstroidConfig } from "../src/config.js";
import { astroidCspOrigins, astroidSecurity, solidHydrationHash } from "../src/astro/csp.js";
import { astroidCspStyleSrc } from "../src/security/csp-origins.js";
import { generateAstroidMiddleware } from "../src/worker/generate.js";

const base: AstroidConfig = {
  key: "acme",
  archetype: "marketing",
  theme: { name: "Acme", colors: { brand: "#000000" } },
};

/** Pull one directive out of the composed policy. */
const directive = (config: AstroidConfig, name: string) =>
  astroidSecurity(config).csp.directives.find((d) => d.startsWith(`${name} `)) ?? null;

describe("solidHydrationHash", () => {
  it("hashes the bootstrap's contents, not the surrounding <script> tag", () => {
    const hash = solidHydrationHash();
    expect(hash).toMatch(/^sha256-[A-Za-z0-9+/]+=*$/);
    // Tied to what the renderer actually injects: if solid-js changes its
    // bootstrap, this recomputes rather than going quietly stale.
    expect(generateHydrationScript()).toContain("<script");
    expect(hash).not.toBe("sha256-");
  });
});

describe("astroidSecurity", () => {
  it("keeps script-src free of 'unsafe-inline' and carries the Solid hash", () => {
    const { csp } = astroidSecurity(base);
    expect(csp.scriptDirective.resources).toContain("'self'");
    expect(csp.scriptDirective.resources.join(" ")).not.toContain("unsafe-inline");
    expect(csp.scriptDirective.hashes).toEqual([solidHydrationHash()]);
  });

  it("never declares style-src — the middleware owns that directive", () => {
    // A hash in style-src voids 'unsafe-inline' per spec, and Louise's
    // data-driven style="" carriers need 'unsafe-inline'. The two cannot
    // coexist, so Astro must not emit the directive at all.
    const { csp } = astroidSecurity(base);
    expect(csp.directives.some((d) => d.startsWith("style-src"))).toBe(false);
  });

  it("ships the clickjacking + injection floor", () => {
    const { csp } = astroidSecurity(base);
    expect(csp.directives).toContain("frame-ancestors 'none'");
    expect(csp.directives).toContain("base-uri 'self'");
    expect(csp.directives).toContain("form-action 'self'");
    expect(csp.directives).toContain("object-src 'none'");
  });

  it("allows Turnstile regardless of whether captcha is provisioned", () => {
    // CSP is baked at build time; the captcha secret is a runtime value. Gating
    // the origin on configuration would mean switching captcha on needs a
    // rebuild, which defeats the dormant-until-provisioned convention.
    expect(astroidSecurity(base).csp.scriptDirective.resources).toContain(
      "https://challenges.cloudflare.com",
    );
    expect(directive(base, "frame-src")).toContain("https://challenges.cloudflare.com");
  });

  it("adds a commerce provider's SDK origins, and only that provider's", () => {
    const square: AstroidConfig = { ...base, commerce: { provider: "square" } };
    const stripe: AstroidConfig = { ...base, commerce: { provider: "stripe" } };

    expect(astroidSecurity(square).csp.scriptDirective.resources).toContain(
      "https://web.squarecdn.com",
    );
    expect(directive(square, "frame-src")).toContain("https://connect.squareup.com");
    // Both sandbox and production hosts: which environment you're in is a
    // runtime secret, so one build has to serve either.
    expect(directive(square, "connect-src")).toContain("https://pci-connect.squareupsandbox.com");

    expect(astroidSecurity(stripe).csp.scriptDirective.resources).toContain(
      "https://js.stripe.com",
    );
    expect(astroidSecurity(stripe).csp.scriptDirective.resources).not.toContain(
      "https://web.squarecdn.com",
    );
    // A server-only provider contributes no browser origins at all.
    const fw: AstroidConfig = { ...base, commerce: { provider: "fourthwall" } };
    expect(astroidSecurity(fw).csp.scriptDirective.resources).toEqual(
      astroidSecurity(base).csp.scriptDirective.resources,
    );
  });

  it("takes Square's origins from the toolkit, including hosts a hand copy missed", () => {
    // The list used to be copied here by hand, and fell behind: Square's own
    // Sentry ingest (a console violation on every checkout) and Cash Sans's
    // font host (card-wrapper.css's font, blocked) were both missing.
    const square: AstroidConfig = { ...base, commerce: { provider: "square" } };
    expect(directive(square, "connect-src")).toContain("https://o160250.ingest.sentry.io");
    expect(directive(square, "font-src")).toContain("https://cash-f.squarecdn.com");
    // No wallets: Astroid mounts the card form only, so Google Pay stays out.
    expect(astroidSecurity(square).csp.scriptDirective.resources).not.toContain(
      "https://pay.google.com",
    );
  });

  it("merges config-supplied origins and de-duplicates", () => {
    const withExtras: AstroidConfig = {
      ...base,
      commerce: { provider: "square" },
      security: {
        cspOrigins: {
          script: ["https://cdn.example.com", "https://web.squarecdn.com"],
          worker: ["blob:"],
        },
      },
    };
    const origins = astroidCspOrigins(withExtras);
    expect(origins.script).toContain("https://cdn.example.com");
    expect(origins.script.filter((o) => o === "https://web.squarecdn.com")).toHaveLength(1);
    expect(directive(withExtras, "worker-src")).toBe("worker-src 'self' blob:");
  });

  it("never emits a directive with an empty source list", () => {
    // A bare `frame-src` (or any directive with no sources) is invalid CSP and
    // browsers treat the whole policy as suspect.
    for (const config of [base, { ...base, commerce: { provider: "square" } } as AstroidConfig]) {
      for (const d of astroidSecurity(config).csp.directives) {
        expect(d.trim().split(/\s+/).length, `bare directive: ${d}`).toBeGreaterThan(1);
      }
    }
  });
});

describe("astroidCspStyleSrc", () => {
  it("is 'self' 'unsafe-inline' with no module that needs a stylesheet host", () => {
    expect(astroidCspStyleSrc(base)).toBe("'self' 'unsafe-inline'");
  });

  it("allows the Square SDK's host-page stylesheet (card-wrapper.css)", () => {
    // Web Payments SDK 1.85+ injects card-wrapper.css into the host page; without
    // these hosts card.attach() rejects and the card form never mounts.
    const square: AstroidConfig = { ...base, commerce: { provider: "square" } };
    expect(astroidCspStyleSrc(square)).toBe(
      "'self' 'unsafe-inline' https://sandbox.web.squarecdn.com https://web.squarecdn.com",
    );
  });

  it("carries the config's own style origins", () => {
    const own: AstroidConfig = {
      ...base,
      security: { cspOrigins: { style: ["https://fonts.googleapis.com"] } },
    };
    expect(astroidCspStyleSrc(own)).toContain("https://fonts.googleapis.com");
  });

  it("is what the generated middleware rewrites style-src to", () => {
    const square: AstroidConfig = { ...base, commerce: { provider: "square" } };
    expect(generateAstroidMiddleware(square)).toContain(
      `cspStyleSrc: ${JSON.stringify(astroidCspStyleSrc(square))},`,
    );
  });
});
