// Copyright (c) 2026 BowenLabs. Astroid is MIT licensed.
//
// Which ready-made Louise tables (louise-toolkit/db) an Astroid project needs.
// Astroid re-exports these rather than redefining them, so the core content
// tables never drift from Louise. `media`, `pageRedirects`, and `siteSettings`
// are universal; `inquiries` is pulled in only when a brand actually captures
// inquiries (a contact section, or a wholesale-inquiry module).

import type { AstroidConfig } from "../config.js";

/** A ready-made table Astroid re-exports from `louise-toolkit/db`. */
export type AstroidFrameworkTable = "inquiries" | "media" | "pageRedirects" | "siteSettings";

/** True when the site captures inquiries—a contact section or a
 *  wholesale-inquiry module. Shared by table selection (here) and route selection
 *  (the worker route plan). */
export function capturesInquiries(config: AstroidConfig): boolean {
  // Explicit override wins—a site whose inquiry surface is a bespoke section
  // (a custom `contactForm`, say) can't be detected from the built-in
  // vocabulary, so it says so directly.
  if (typeof config.inquiries === "boolean") return config.inquiries;
  // The object form turns inquiries on and configures them.
  if (typeof config.inquiries === "object" && config.inquiries !== null) return true;
  const wantsWholesale = (mods?: readonly string[]) => (mods ?? []).includes("wholesaleInquiry");
  return (
    (config.sections ?? []).includes("contact") ||
    wantsWholesale(config.modules) ||
    wantsWholesale(config.portal?.features)
  );
}

/**
 * True when the generated worker mounts the public contact form route, `POST
 * /api/louise/forms/inquiries`: the site captures inquiries, and the config
 * doesn't set `inquiries: { publicForm: false }`. A site with its own contact
 * endpoint turns it off, so the generated route, which has no captcha and no
 * field limits of its own, isn't left reachable beside it.
 */
export function servesInquiryForm(config: AstroidConfig): boolean {
  if (!capturesInquiries(config)) return false;
  const inquiries = config.inquiries;
  return typeof inquiries !== "object" || inquiries === null || inquiries.publicForm !== false;
}

/**
 * The framework tables this project needs, sorted alphabetically (so the emitted
 * import/export lists are stable). `media`, `pageRedirects`, and `siteSettings`
 * always; `inquiries` when a brand captures them. `pageRedirects` keeps a
 * renamed page's old URL working, which every site with a Pages panel needs.
 */
export function astroidFrameworkTables(config: AstroidConfig): AstroidFrameworkTable[] {
  const tables: AstroidFrameworkTable[] = ["media", "pageRedirects", "siteSettings"];
  if (capturesInquiries(config)) tables.push("inquiries");
  return tables.sort();
}
