// Copyright (c) 2026 BowenLabs. Astroid is MIT licensed.
//
// generateAstroidWorker / generateAstroidMiddleware—emit the Cloudflare Worker
// entrypoint and the Astro middleware a Louise site would otherwise hand-write.
// The worker's editor routes are composed in the fixed order from the route plan
// (routes.ts), so the "versionsRoute/searchRoute before pagesRoute" collision is
// impossible by construction. Pure string generation, like generateAstroidSchema.
//
// One seam is marked with TODO(astroid) and filled by the auth slice: the
// `resolveEditor` session resolver. The section-catalog validate + sanitize on
// the pages routes is wired here—versionsRoute runs it through the collection's
// beforeChange hook, and pagesRoute (which takes no collection config) through
// the `astroidPagesWriteHooks` spread, so both write paths enforce one contract.

import type { AstroidConfig } from "../config.js";
import { ASTROID_VITALS_BINDING, generateAstroidCwvQuery } from "../analytics/index.js";
import {
  ASTROID_INCIDENT_EVENTS_BINDING,
  ASTROID_SENTRY_DSN_BINDING,
  ASTROID_VERSION_METADATA_BINDING,
} from "../incidents/names.js";
import { astroidEditorTable } from "../auth/index.js";
import { astroidPortal } from "../portal/config.js";
import {
  ASTROID_HEALTH_CRON,
  astroidCron,
  astroidQueueNames,
  astroidUsesQueues,
} from "../queues/messages.js";
import { ASTROID_AUTH_RATE_LIMIT_CLASS, usesAuthRateLimit } from "../auth-rate-limit/scaffold.js";
import {
  ASTROID_EDIT_SESSION_CLASS,
  ASTROID_REALTIME_BINDING,
  usesRealtime,
} from "../realtime/scaffold.js";
import { capturesInquiries, servesInquiryForm } from "../schema/framework.js";
import { astroidCspStyleSrc } from "../security/csp-origins.js";
import { astroidHasEditor } from "../shape.js";
import { ASTROID_REWRITE_EXCLUDE, ASTROID_TENANT_PREFIX } from "../tenancy/index.js";
import { type AstroidEditorRouteName, astroidEditorRoutePlan } from "./routes.js";

// Astroid's default editable site_settings surface—the columns the Settings
// panel may write, and which of them hold a media-library image URL.
//
// EXPORTED because the generated worker is not the only consumer: the scaffolded
// Astro Actions surface needs the identical allowlist, and a second literal in an
// editable file is a list that drifts from the one the routes enforce. Both read
// this.
export const ASTROID_SETTINGS_COLUMNS = [
  "siteName",
  "tagline",
  "logoUrl",
  "faviconUrl",
  "brandColor",
  "secondaryColor",
  "tertiaryColor",
  "contactEmail",
  "contactPhone",
  "contactAddress",
  "socialLinks",
  "navLinks",
  "metaDescription",
  "defaultOgImageUrl",
  "disableIndexing",
];
export const ASTROID_SETTINGS_IMAGE_KEYS = ["logoUrl", "faviconUrl", "defaultOgImageUrl"];

/** What {@link generateAstroidWorker} needs besides the config. */
export interface GenerateAstroidWorkerOptions {
  /**
   * The commerce queue's dead-letter queue, as `wrangler.jsonc` names it
   * (`astroidWranglerQueues`). `null` when it names none, which leaves out the
   * dead-letter consumer. Left out, it's the name a new scaffold gives it
   * (`astroidQueueNames`), which is right only for a site Astroid scaffolded.
   */
  deadLetterQueue?: string | null;
}

/**
 * Generate the Worker entrypoint (`worker.ts`) from an Astroid config: the editor
 * routes in collision-free order, an R2 media-asset route, and the `composeWorker`
 * default export over Astro's SSR handler. Inquiry routes + the contact form are
 * emitted only when a brand captures inquiries, and the contact form only when
 * the config doesn't set `inquiries: { publicForm: false }`.
 */
export function generateAstroidWorker(
  config: AstroidConfig,
  options: GenerateAstroidWorkerOptions = {},
): string {
  const dlq = deadLetterQueueFor(config, options);
  if (!astroidHasEditor(config)) return generateAppWorker(config, dlq);
  const inquiries = capturesInquiries(config);
  // The public contact form, and the imports only it uses. Off for a site whose
  // own endpoint writes the inquiries table.
  const publicForm = servesInquiryForm(config);
  const queues = astroidUsesQueues(config);
  const cron = astroidCron(config);
  const mediaBase = config.deploy?.mediaBase ?? "/media";
  const seedName = config.theme.name;
  const plan = astroidEditorRoutePlan(config);

  // `realtimeRoute` lives in `louise-toolkit/realtime`, not `/editor`—it is the
  // one factory in the plan that isn't an editor route. Importing it with the
  // rest type-checks fine HERE (the plan is just strings) and fails only in the
  // scaffold, which is exactly how it got caught.
  // Same trap as realtimeRoute: these live outside `louise-toolkit/editor`.
  const realtimeRouteFactories = new Set(["realtimeRoute", "vitalsRoute"]);
  // The routes that take an AI runner, and so need `aiRunner` imported.
  const AI_ROUTES = new Set<AstroidEditorRouteName>(["ai", "seoFix", "media"]);
  const editorImports = [
    "DEFAULT_PAGE_FIELDS",
    "type PagesWrite",
    "MEDIA_ALT_MISSING_SQL",
    "d1Check",
    ...new Set(plan.map((route) => route.factory).filter((f) => !realtimeRouteFactories.has(f))),
  ].sort();
  const tables = [
    "media",
    "pageRedirects",
    "pages",
    "pagesVersions",
    "siteSettings",
    ...(inquiries ? ["inquiries"] : []),
  ].sort();

  const routeCall = (name: AstroidEditorRouteName): string => {
    switch (name) {
      case "overview":
        // `inbox` only when this project captures inquiries—an absent slice
        // hides its card, which is right for an archetype with no contact form.
        return inquiries
          ? "overviewRoute({ resolveEditor, content: overviewContent, inbox: overviewInbox, health: overviewHealth })"
          : "overviewRoute({ resolveEditor, content: overviewContent, health: overviewHealth })";
      case "vitals":
        return `vitalsRoute({ dataset: (env) => env.${ASTROID_VITALS_BINDING} })`;
      case "health":
        return "healthRoute({ resolveEditor, read: readSiteHealth })";
      case "status":
        return "statusRoute({ checks: STATUS_CHECKS, reuseMs: STATUS_REUSE_MS })";
      case "realtime":
        return `realtimeRoute({ resolveEditor, namespace: (env) => env.${ASTROID_REALTIME_BINDING} })`;
      case "versions":
        // `redirects` records `/old → /new` when a publish changes the slug.
        return "versionsRoute({ table: pages, versionsTable: pagesVersions, config: pagesCollection, resolveEditor, bufferKv: (env) => env.DRAFTS, redirects: pageRedirects })";
      case "search":
        return "searchRoute({ table: pages, config: pagesCollection, resolveEditor })";
      case "pages":
        // `...pagesWriteHooks` is load-bearing: pagesRoute writes straight to the
        // table and runs NO collection hook, so without these the direct
        // POST/PATCH path would persist an unknown section `_type`, a setting
        // outside its options, or unsanitized section rich text. See
        // `astroidPagesWriteHooks`.
        //
        // `versionsTable` makes a DELETE remove the page's version snapshots,
        // which have no foreign key to the page and would otherwise orphan.
        // `afterWrite` syncs the written page's search index entry, which plain
        // CRUD writes leave stale.
        //
        // `drafts` carries a Pages panel update into the page's pending draft,
        // with the same config and buffer versionsRoute uses. Without it, a
        // rename made while a draft was pending came undone at the next
        // publish, which copies the whole draft snapshot onto the live row.
        //
        // `redirects` records `/old → /new` in the same batch as a slug change,
        // and the middleware's `redirectFor` serves it.
        return 'pagesRoute({ table: pages, versionsTable: pagesVersions, drafts: { config: pagesCollection, bufferKv: (env) => env.DRAFTS }, redirects: pageRedirects, resolveEditor, fields: [...DEFAULT_PAGE_FIELDS, "sections"], ...pagesWriteHooks, afterWrite: reindexPagesSearch })';
      case "save":
        // No `bufferKv` here, deliberately: `saveRoute` has no such option. It
        // writes live field saves (title, SEO) straight through, and the draft
        // buffer belongs to the versioned body—that is, to versionsRoute.
        return 'saveRoute({ resolveEditor, collections: { pages: { table: pages, fields: ["title", "seoTitle", "seoDescription"] } } })';
      case "settings": {
        // Site-specific keys (config.settings.customKeys) are merged into
        // site_settings.custom; omitted entirely when a project has none, so a
        // stock site's route call is unchanged.
        const customArg = (config.settings?.customKeys ?? []).length
          ? ", customKeys: SETTINGS_CUSTOM_KEYS"
          : "";
        // The site's sanitize + read hooks (config.settings.hooks), spread last
        // so they add to the call rather than replace any part of it.
        const hooksArg = config.settings?.hooks ? ", ...settingsHooks" : "";
        // Built per request, because the media base is per environment: a
        // Preview's `MEDIA_URL` differs from production's (see `mediaBaseOf`).
        return `(request, env, ctx) => settingsRoute({ table: siteSettings, resolveEditor, columns: SETTINGS_COLUMNS, imageKeys: SETTINGS_IMAGE_KEYS, mediaBase: mediaBaseOf(env)${customArg}${hooksArg} })(request, env, ctx)`;
      }
      // `aiRunner` rather than `(env) => env.AI`: it reads the binding AND the
      // LOUISE_AI kill switch, so all three assists share one definition of
      // "is generation on?" instead of each re-deriving it. Embeddings keep
      // binding-presence as their switch—see the helper's comment.
      // `gateway` routes both through AI Gateway when the site sets
      // `AI_GATEWAY_ID`, and calls Workers AI directly when it doesn't.
      case "ai":
        return "aiRoute({ resolveEditor, ai: aiRunner, gateway: astroidAiGateway })";
      case "seoFix":
        return "seoFixRoute({ table: pages, resolveEditor, ai: aiRunner, gateway: astroidAiGateway })";
      case "media": {
        // `altText` fills a new upload's alt from the image itself. Best-effort
        // by contract—a model error or a missing binding never fails the
        // upload—so it costs nothing on a project that doesn't want it.
        //
        // `maxBytes` is emitted only when the site raised it: omitted, the
        // route keeps louise-toolkit's DEFAULT_MAX_BYTES, so the generated
        // line stays identical for every project that doesn't care.
        const maxBytes = config.media?.maxUploadBytes;
        const maxArg = maxBytes ? `, maxBytes: ${maxBytes}` : "";
        return `mediaRoute({ table: media, resolveEditor, referenceSources: MEDIA_REFERENCE_SOURCES, altText: aiRunner${maxArg} })`;
      }
      case "editors":
        // The editor instance's user table is `louise_`-prefixed (the editor
        // convention—the unprefixed `user` table is left for a second/portal
        // instance). This route takes the table NAME, matching the
        // `tablePrefix` the scaffolded `src/auth.ts` passes to `getLouiseAuth`.
        return `editorsRoute({ table: ${JSON.stringify(astroidEditorTable("user"))}, resolveEditor })`;
      case "form":
        // `onSubmit` fires AFTER the insert and off the response path, so the
        // notify + confirm pair is store-and-forward by construction: the
        // submission is already durable and mail can fail without the visitor
        // ever knowing. Unprovisioned mail logs instead of sending.
        // The `await` + block body is load-bearing: `onSubmit` returns
        // `void | Promise<void>`, and sendInquiryMail resolves to delivery
        // results nobody here reads.
        return "formRoute({ form: contactForm, rateLimitKv: (env) => env.RL, onSubmit: async (values, env) => { await sendInquiryMail(astroidConfig, env, values); } })";
      case "inquiries":
        return "inquiriesRoute({ table: inquiries, resolveEditor })";
      case "seed":
        return `seedRoute({ table: siteSettings, resolveEditor, defaults: { siteName: ${JSON.stringify(seedName)} } })`;
    }
  };

  const lines: string[] = [];
  const p = (s = "") => lines.push(s);

  p("// Generated by astroidjs—do not hand-edit.");
  p("// Source: your defineAstroid config. The editor route ORDER is fixed by");
  p("// Astroid to avoid matcher collisions—see each route's note below.");
  p('import { env } from "cloudflare:workers";');
  p('import { handle } from "@astrojs/cloudflare/handler";');
  p('import type { EditorSession } from "louise-toolkit/auth";');
  p('import { reindexDoc } from "louise-toolkit/content";');
  p(
    publicForm
      ? 'import { db, inquiriesForm } from "louise-toolkit/db";'
      : 'import { db } from "louise-toolkit/db";',
  );
  p("import {");
  for (const name of editorImports) p(`  ${name},`);
  p('} from "louise-toolkit/editor";');
  if (usesRealtime(config)) p('import { realtimeRoute } from "louise-toolkit/realtime";');
  p(
    'import { cwvSqlQuery, parseCwvRows, summarizeCwv, vitalsRoute } from "louise-toolkit/analytics";',
  );
  if (publicForm) p('import { defineForm } from "louise-toolkit/forms";');
  p(incidentsImport(dlq !== null));
  if (queues) p('import { processBatch } from "louise-toolkit/queues";');
  // Only when a route actually takes a runner—a project with no AI assists
  // should not import one, and knip would flag it if it did.
  if (plan.some((route) => AI_ROUTES.has(route.name))) {
    p('import { aiRunner } from "louise-toolkit/ai";');
  }
  p('import { checkLinks } from "louise-toolkit/browser";');
  p('import { reportDegraded } from "louise-toolkit/errors";');
  p(
    'import { readHealthSummary, summarizeHealth, writeHealthSummary } from "louise-toolkit/health";',
  );
  p(
    'import { composeWorker, isEditRequest, type WorkerRoute, withEdgeCache } from "louise-toolkit/worker";',
  );
  p(`import { ${tables.join(", ")} } from "./schema.js";`);
  const astroidImports = [
    ...(plan.some((route) => route.name === "ai" || route.name === "seoFix")
      ? ["astroidAiGateway"]
      : []),
    "astroidPagesCollection",
    "astroidPagesWriteHooks",
    "readModuleSecret",
    "setAstroidMediaBase",
    ...(publicForm ? ["sendInquiryMail"] : []),
    ...(queues ? ["type AstroidQueueMessage"] : []),
    ...(config.incidents?.sentry ? ["sentryIncidents", "type SecretSource"] : []),
  ].sort();
  p(`import { ${astroidImports.join(", ")} } from "astroidjs";`);
  // The config lives at the PROJECT ROOT (create-astroid writes it there); this
  // file is src/worker.ts, so the specifier is `../`, not `./`.
  p('import astroidConfig from "../astroid.config.js";');
  p("// TODO(astroid): your AUTH seam. resolveEditor resolves the editor session");
  p("// from a request; a truthy result authorizes editor writes. A generated auth");
  p("// module is a later slice.");
  p('import { resolveEditor } from "./auth.js";');
  if (config.pages?.hooks) {
    p("// Your PAGES seam: a transform and extra reserved slugs for the pages");
    p("// route. Scaffolded once and yours to edit.");
    p('import { pagesHooks } from "./pages-hooks.js";');
  }
  if (config.status?.checks) {
    p("// Your STATUS seam: the site's own checks for the public status route,");
    p("// such as a catalog snapshot's age. Scaffolded once and yours to edit.");
    p('import { statusChecks } from "./status-checks.js";');
  }
  if (config.settings?.hooks) {
    p("// Your SETTINGS seam: per-key sanitizers and a GET transform for the");
    p("// Settings panel. Scaffolded once and yours to edit.");
    p('import { settingsHooks } from "./settings-hooks.js";');
  }
  if (queues) {
    p("// Your QUEUE seam: what each message actually does. Scaffolded once and");
    p("// yours to edit—`astroidQueueHandler` there covers the catalog dispatch.");
    p('import { handleQueueMessage } from "./queue.js";');
  }
  p();
  p(`const DEFAULT_MEDIA_BASE = ${JSON.stringify(mediaBase)};`);
  p("// The public media base for this request's environment. `vars.MEDIA_URL`");
  p('// wins, so a Preview sets its own (a path such as "/media", served from the');
  p("// Preview's own host, since a Preview can't know its hostname in advance).");
  p("// Read per request, not baked in: one build serves production and every");
  p("// Preview, so nothing that differs between them can be a constant.");
  p("const mediaBaseOf = (env: CloudflareEnv): string =>");
  p('  (env.MEDIA_URL || DEFAULT_MEDIA_BASE).replace(/\\/+$/, "");');
  p("// The checks built once from the config (the page sanitizers, the settings");
  p("// action) read the base when they run. Recorded at startup, since an isolate");
  p("// runs one deployment and `MEDIA_URL` is fixed per deployment.");
  p("setAstroidMediaBase(env.MEDIA_URL);");
  p("const pagesCollection = astroidPagesCollection(astroidConfig);");
  p("// Sanitize + section-catalog validation for the raw pagesRoute, which runs");
  p("// no collection hook—the same contract versionsRoute gets from the config.");
  p(
    config.pages?.hooks
      ? "const pagesWriteHooks = astroidPagesWriteHooks(astroidConfig, pagesHooks);"
      : "const pagesWriteHooks = astroidPagesWriteHooks(astroidConfig);",
  );
  p();
  p("// pagesRoute writes with plain Drizzle, so the full-text index doesn't see a");
  p("// title or slug change until something syncs it. This syncs only the page the");
  p("// write touched, rather than rebuilding the whole index on every save. After a");
  p("// delete the row is gone, and reindexDoc removes its entry. Best-effort:");
  p("// pagesRoute swallows a throw here, so a stale index never fails the write.");
  p(
    "async function reindexPagesSearch(_editor: EditorSession, { id }: PagesWrite): Promise<void> {",
  );
  p("  await reindexDoc(db(env.DB), pages, pagesCollection, id);");
  p("}");
  p();
  p("// Editable site_settings columns the Settings panel may write, and which of");
  p("// them resolve to a media-library asset.");
  const settingsImageKeys = [...ASTROID_SETTINGS_IMAGE_KEYS, ...(config.settings?.imageKeys ?? [])];
  const settingsCustomKeys = config.settings?.customKeys ?? [];
  // A custom-heavy site can override (or empty) the editable base columns.
  const settingsColumns = config.settings?.columns ?? ASTROID_SETTINGS_COLUMNS;
  // Annotated because a custom-heavy site's `columns: []` would otherwise infer
  // `any[]` (implicit-any under strict).
  p(`const SETTINGS_COLUMNS: string[] = ${JSON.stringify(settingsColumns)};`);
  p(`const SETTINGS_IMAGE_KEYS = ${JSON.stringify(settingsImageKeys)};`);
  if (settingsCustomKeys.length) {
    p("// Site-specific keys stored in the site_settings.custom JSON column.");
    p(`const SETTINGS_CUSTOM_KEYS = ${JSON.stringify(settingsCustomKeys)};`);
  }
  p();
  p("// Delete-safety for the media library: where a media key can be REFERENCED,");
  p("// so deleting an asset that's live on a page warns instead of silently");
  p("// breaking it. Without these the scan has nothing to look at and every");
  p("// delete reports 'no references'. Column names are SQL, not Drizzle keys—");
  p("// the scan is raw SQL over the table.");
  p("const MEDIA_REFERENCE_SOURCES = [");
  p(
    '  { collection: "pages", table: "pages", columns: ["body", "sections", "og_image"], labelColumn: "title" },',
  );
  p(
    // `custom` too: a site's own image settings (settings.imageKeys) live in
    // that JSON column, and an unscanned column reports 'no references'.
    '  { collection: "settings", table: "site_settings", columns: ["logo_url", "favicon_url", "default_og_image_url", "custom"], labelColumn: "site_name" },',
  );
  p("];");
  p();
  p();
  p("// --- site health ----------------------------------------------------------");
  p("// Stored in the RL namespace under its own key rather than a new binding:");
  p("// it's one small singleton blob, and a binding you must provision before the");
  p("// dashboard works is a binding people don't provision.");
  p("const readSiteHealth = (env: CloudflareEnv) => readHealthSummary(env.RL);");
  p();
  p("// The same read, adapted for the overview slice. `readHealthSummary` yields");
  p("// `null` for 'no scan yet' while a slice resolver signals absence with");
  p("// `undefined`—the two types are otherwise identical, and this one-line");
  p("// coercion is the whole difference.");
  p("const overviewHealth = async (env: CloudflareEnv) =>");
  p("  (await readSiteHealth(env)) ?? undefined;");
  p();
  for (const line of generateAstroidCwvQuery(config)) p(line);
  p();
  p("// The daily scan. Crawls the site's own pages for broken links and counts the");
  p("// two accessibility/SEO gaps that are cheap to compute, then persists one");
  p("// snapshot for the dashboard to read. Every part degrades on its own—a");
  p("// failed crawl or a failed COUNT yields zero rather than aborting the scan,");
  p("// because a partial health report is worth strictly more than none.");
  p("async function runHealthScan(env: CloudflareEnv) {");
  p("  const origin = env.SITE_URL ?? mediaBaseOf(env);");
  p("  const [brokenLinks, missingAlt, seoGaps] = await Promise.all([");
  p('    checkLinks({ base: origin, paths: ["/"] }).catch(() => []),');
  p("    // Only an unwritten alt (NULL) is missing. An empty one is an image the");
  p("    // owner marked decorative, which HTML says to skip.");
  p("    countRows(env, `SELECT COUNT(*) AS n FROM media WHERE ${MEDIA_ALT_MISSING_SQL}`),");
  p("    countRows(");
  p("      env,");
  p("      \"SELECT COUNT(*) AS n FROM pages WHERE status = 'published'\" +");
  p(
    "      \" AND (seo_title IS NULL OR seo_title = '' OR seo_description IS NULL OR seo_description = '')\",",
  );
  p("    ),");
  p("  ]);");
  p("  const summary = summarizeHealth({ brokenLinks, missingAlt, seoGaps });");
  p("  // Field data, when the SQL API credentials are real. Absent leaves the");
  p("  // Health badge at 'not measured yet' rather than failing the scan.");
  p("  const cwv = await queryCwv(env);");
  p("  if (cwv) summary.cwv = cwv;");
  p("  await writeHealthSummary(env.RL, summary);");
  p("  return summary;");
  p("}");
  p();
  p("// --- public status ---------------------------------------------------------");
  p("// What statusRoute answers an outside probe with: 200 when every check");
  p("// passes, 503 when any fails, throws, or takes over two seconds. Anyone can");
  p("// make these run, so each is one cheap read, and a burst of probes reuses one");
  p("// result per isolate for STATUS_REUSE_MS.");
  p("const STATUS_REUSE_MS = 10_000;");
  p("const STATUS_CHECKS = {");
  p("  // D1 answers `SELECT 1`.");
  p("  d1: d1Check((env: CloudflareEnv) => env.DB),");
  p("  // The public home page reads real content, not the seed-me fallback the");
  p("  // page renders when its row is missing (an unseeded or wiped database,");
  p("  // or a migration that never ran, which throws and fails the check too).");
  p("  content: async (env: CloudflareEnv) =>");
  p(`    (await env.DB.prepare("SELECT 1 FROM pages WHERE slug = 'home'").first()) !== null,`);
  if (config.status?.checks) {
    p("  // The site's own, from src/status-checks.ts. Spread last, so a site");
    p("  // check with the same name replaces Astroid's on purpose.");
    p("  ...statusChecks,");
  }
  p("};");
  p();
  p("/** One COUNT, degrading to 0—a missing table must not abort the scan. */");
  p("async function countRows(env: CloudflareEnv, sql: string): Promise<number> {");
  p("  try {");
  p("    const row = await env.DB.prepare(sql).first<{ n: number }>();");
  p("    return Number(row?.n ?? 0);");
  p("  } catch {");
  p("    return 0;");
  p("  }");
  p("}");
  p();
  if (inquiries) {
    p();
    p("// Unhandled inquiries. The COUNT is the whole table on purpose: the");
    p("// Inquiries tab reviews and CLEARS submissions (GET lists, DELETE removes),");
    p("// so a row that still exists is a message still waiting on you. There is no");
    p("// read/unread column because deletion IS the acknowledgement—which also");
    p("// means this number goes down as you work through them, rather than being a");
    p("// total that only ever climbs.");
    p("const overviewInbox = async (env: CloudflareEnv) => {");
    p('  const n = await countRows(env, "SELECT COUNT(*) AS n FROM inquiries");');
    p("  return { unread: n };");
    p("};");
  }
  p("// The Home dashboard's content counts. Raw SQL because these are COUNTs over");
  p("// THIS project's tables—the toolkit deliberately makes no assumption about");
  p("// column names. A throw here degrades to a hidden card, never a 500.");
  p("const overviewContent = async (env: CloudflareEnv) => {");
  p("  const row = await env.DB.prepare(");
  p('    "SELECT" +');
  p("    \" (SELECT COUNT(*) FROM pages WHERE status = 'draft') AS drafts,\" +");
  p(
    "    \" (SELECT COUNT(DISTINCT parent_id) FROM pages_versions WHERE status = 'draft') AS unpublished,\" +",
  );
  p('    " (SELECT MAX(updated_at) FROM pages) AS last_edited",');
  p("  ).first<{ drafts: number; unpublished: number; last_edited: number | null }>();");
  p("  if (!row) return undefined;");
  p("  return {");
  p("    drafts: Number(row.drafts ?? 0),");
  p("    unpublished: Number(row.unpublished ?? 0),");
  p("    // Stored as a unix timestamp; the card wants ISO.");
  p("    ...(row.last_edited");
  p("      ? { lastEditedAt: new Date(Number(row.last_edited) * 1000).toISOString() }");
  p("      : {}),");
  p("  };");
  p("};");
  if (publicForm) {
    p();
    p("// Public contact form: the built-in inquiries fields + silent spam");
    p("// heuristics (a honeypot + a minimum time-since-render).");
    p(
      'const contactForm = defineForm({ name: "inquiries", fields: inquiriesForm.fields, spam: { honeypot: "website", minSeconds: 2, rateLimit: { max: 5, windowSec: 60 } } });',
    );
  }
  p();
  p("// `sections` writes are validated + sanitized against the section catalog");
  p("// before they persist, on BOTH write paths: versionsRoute runs the pages");
  p("// collection's beforeChange hook (via `config`), and pagesRoute—which takes");
  p("// no collection config—gets the same contract from the `pagesWriteHooks`");
  p("// spread. An unknown `_type`, a field of the wrong shape, or a setting outside");
  p("// its declared options is a 422, not a hole in the page.");
  p("const editorRoutes: WorkerRoute<CloudflareEnv>[] = [");
  for (const route of plan) {
    p(`  // ${route.note}`);
    p(`  ${routeCall(route.name)},`);
  }
  p("];");
  p();
  p("// Stream uploaded media back from R2 at the media base (self-hosted, no public");
  p("// bucket). The base takes two shapes, and each is matched its own way:");
  p("//");
  p('// - An ORIGIN ("https://media.example.com") is a media host, where the whole');
  p("//   pathname is the R2 key. Compared by origin, never by path prefix: a");
  p('//   `url.pathname` ("/web/foo.jpg") can never start with an origin, and a guard');
  p("//   that compared the two once never ran, so every upload 404'd.");
  p('// - A PATH ("/media") is a prefix on the site\'s own host, which is how a');
  p("//   Preview serves media, since it can't know its hostname in advance.");
  p("const mediaAssetRoute: WorkerRoute<CloudflareEnv> = async (request, env) => {");
  p("  const url = new URL(request.url);");
  p("  const base = mediaBaseOf(env);");
  p('  const path = base.startsWith("/")');
  p("    ? url.pathname.startsWith(`${base}/`)");
  p("      ? url.pathname.slice(base.length + 1)");
  p('      : ""');
  p("    : url.origin === base");
  p("      ? url.pathname.slice(1)");
  p('      : "";');
  p("  const key = decodeURIComponent(path);");
  p("  if (!key) return undefined;");
  p("  const obj = await env.MEDIA.get(key);");
  p('  if (!obj) return new Response("Not found", { status: 404 });');
  p("  const headers = new Headers();");
  p("  obj.writeHttpMetadata(headers);");
  p('  headers.set("etag", obj.httpEtag);');
  p('  headers.set("cache-control", "public, max-age=31536000, immutable");');
  p('  headers.set("x-content-type-options", "nosniff");');
  p("  return new Response(obj.body, { headers });");
  p("};");
  p();
  emitIncidentPreamble(p, config, dlq);
  // The queue message type parameter is what gives the `queue` consumer below a
  // typed `MessageBatch` instead of `MessageBatch<unknown>`.
  p(
    queues
      ? "export default composeWorker<CloudflareEnv, AstroidQueueMessage>({"
      : "export default composeWorker<CloudflareEnv>({",
  );
  p("  routes: [...editorRoutes, mediaAssetRoute],");
  p("  // Deny-by-default editor API (ADR 0012). Under /api/louise a request must");
  p("  // resolve to an editor unless it's headed for a public route—the contact");
  p("  // form and the vitals beacon mark themselves. Every route above still checks");
  p("  // for itself; this is what catches one that forgets. It also gives route");
  p("  // responses the security headers the middleware never sees, since these");
  p("  // routes answer before Astro runs.");
  p("  gate: { resolveEditor },");
  p("  // The SSR fallback, wrapped in the cookie-aware Worker cache (ADR 0004).");
  p("  //");
  p("  // Wrapped UNCONDITIONALLY, and that is safe: `withEdgeCache` only stores a");
  p("  // response that carries a cacheable Cloudflare-CDN-Cache-Control directive,");
  p("  // and a page emits one only via `Astro.cache.set(...)`—which the scaffold");
  p('  // gates on ASTROID_EDGE_CACHE being "true" AND the request not being in edit');
  p("  // mode. With the var off (the default) every render is `no-store`, so this");
  p("  // layer stores nothing and is a transparent pass-through.");
  p("  //");
  p("  // It must be THIS cache and not Cloudflare's automatic edge cache: that one");
  p("  // is keyed by URL, runs BEFORE the Worker, and is therefore cookie-blind—");
  p("  // it will happily serve an editor a cached public page. That exact bug got");
  p("  // this feature reverted twice (#163, #165). `withEdgeCache` strips the CDN");
  p("  // directive from every response so the automatic cache never engages.");
  p("  //");
  p("  // Read the activation runbook in docs/adr/0004-edge-caching.md before");
  p("  // flipping the var on: `caches.default` is NOT cleared by Cloudflare Dev");
  p("  // Mode or Purge Everything, so a mistake in prod is hard to walk back.");
  p("  fetch: withEdgeCache((request, env, ctx) => handle(request, env, ctx), {");
  p("    // An editor never reads from, and never writes to, the shared entry.");
  p("    bypass: isEditRequest,");
  p("  }),");
  emitIncidentOption(p, config);
  if (queues) emitQueueOption(p, config, dlq);
  // ONE scheduled handler for every cron, dispatching on `controller.cron`.
  // Cloudflare gives no other way to tell them apart, and the strings here have
  // to match `astroidCrons` exactly—which is why both read the same constants
  // rather than repeating a literal.
  p("  // Cron. Cloudflare fires this for EVERY trigger in wrangler.jsonc and");
  p("  // identifies which by `controller.cron`, so dispatch on it.");
  p("  scheduled: (controller, env, ctx) => {");
  p(`    if (controller.cron === ${JSON.stringify(ASTROID_HEALTH_CRON)}) {`);
  p("      // Daily site-health scan. `waitUntil` because the crawl outlives the");
  p("      // handler's return, and a scan that throws must not retry the cron.");
  p("      // Reported rather than swallowed: the Health panel keeps showing the");
  p("      // last good scan, so this log line is the only sign that one failed.");
  p(
    '      ctx.waitUntil(runHealthScan(env).catch((error) => reportDegraded("health.scan", error)));',
  );
  p("      return;");
  p("    }");
  if (cron) {
    p(`    if (controller.cron === ${JSON.stringify(cron)}) {`);
    p("      // Catalog safety net. Webhooks get missed—a provider outage, a");
    p("      // deploy mid-delivery, a DLQ'd message—and without this the site");
    p("      // serves stale data until a human notices. Enqueued rather than run");
    p("      // inline so it takes the same retry + DLQ path as everything else.");
    p('      ctx.waitUntil(env.COMMERCE_QUEUE.send({ kind: "catalog_refresh" }));');
    p("      return;");
    p("    }");
  }
  // Project-declared crons (`config.crons`). Emitted from the same list that
  // feeds `triggers.crons`, so a trigger can't exist with no branch to match it.
  for (const custom of config.crons ?? []) {
    p(`    if (controller.cron === ${JSON.stringify(custom.expression)}) {`);
    p("      // Enqueued, not run inline: same retry + DLQ path as everything");
    p("      // else, and a slow job can't hold the scheduled handler open.");
    p(`      ctx.waitUntil(env.COMMERCE_QUEUE.send(${JSON.stringify(custom.message)}));`);
    p("      return;");
    p("    }");
  }
  p("  },");
  p("});");
  p();
  if (usesRealtime(config)) {
    // Re-exported from the ENTRY because wrangler resolves a Durable Object
    // binding's `class_name` against the worker's exports—the class living in
    // src/edit-session.ts is not enough on its own, and the failure is a deploy
    // error about an unresolvable class rather than anything pointing here.
    p("// The realtime edit-session Durable Object. Re-exported so wrangler can");
    p("// resolve the `class_name` in the durable_objects binding.");
    p(`export { ${ASTROID_EDIT_SESSION_CLASS} } from "./edit-session.js";`);
    p();
  }
  emitAuthRateLimitExport(config, p);

  return lines.join("\n");
}

/**
 * The auth rate limiter's Durable Object, re-exported from the entry for the
 * same reason as the realtime one: wrangler resolves a binding's `class_name`
 * against the worker's exports. Shared by both worker shapes, since an app's
 * portal signs people in too.
 */
function emitAuthRateLimitExport(config: AstroidConfig, p: (line?: string) => void): void {
  if (!usesAuthRateLimit(config)) return;
  p("// The Durable Object Better Auth's rate limiter counts in (authRateLimit");
  p("// module). Re-exported so wrangler can resolve the `class_name` in the");
  p("// durable_objects binding.");
  p(`export { ${ASTROID_AUTH_RATE_LIMIT_CLASS} } from "./auth-rate-limiter.js";`);
  p();
}

/**
 * The worker of an app with no editor (`editor: false`): the public status
 * route, the SSR fallback, and whatever the config's modules add (a queue
 * consumer, the crons), with no editor route and no auth seam.
 *
 * The gate stays, with a resolver that never finds an editor. Nothing under
 * `/api/louise` belongs to one here, so it refuses everything there except the
 * public status probe, and it gives route responses the security headers the
 * middleware never sees.
 */
function generateAppWorker(config: AstroidConfig, dlq: string | null): string {
  const queues = astroidUsesQueues(config);
  const cron = astroidCron(config);
  const customCrons = config.crons ?? [];
  const scheduled = cron !== null || customCrons.length > 0;

  const lines: string[] = [];
  const p = (s = "") => lines.push(s);

  p("// Generated by astroidjs—do not hand-edit.");
  p("// Source: your defineAstroid config. This app has no editor (`editor: false`),");
  p("// so it serves no editor routes and resolves no editor session.");
  p('import { handle } from "@astrojs/cloudflare/handler";');
  p('import { d1Check, statusRoute } from "louise-toolkit/editor";');
  p(incidentsImport(dlq !== null));
  if (queues) p('import { processBatch } from "louise-toolkit/queues";');
  p('import { composeWorker, type WorkerRoute, withEdgeCache } from "louise-toolkit/worker";');
  const astroidImports = [
    ...(queues ? ["type AstroidQueueMessage"] : []),
    ...(config.incidents?.sentry ? ["sentryIncidents", "type SecretSource"] : []),
  ].sort();
  if (astroidImports.length > 0) {
    const typeOnly = astroidImports.every((name) => name.startsWith("type "));
    p(
      typeOnly
        ? `import type { ${astroidImports.map((name) => name.slice(5)).join(", ")} } from "astroidjs";`
        : `import { ${astroidImports.join(", ")} } from "astroidjs";`,
    );
  }
  if (config.status?.checks) {
    p("// Your STATUS seam: the app's own checks for the public status route.");
    p("// Scaffolded once and yours to edit.");
    p('import { statusChecks } from "./status-checks.js";');
  }
  if (queues) {
    p("// Your QUEUE seam: what each message actually does. Scaffolded once and");
    p("// yours to edit.");
    p('import { handleQueueMessage } from "./queue.js";');
  }
  p();
  p("// --- public status ---------------------------------------------------------");
  p("// What statusRoute answers an outside probe with: 200 when every check");
  p("// passes, 503 when any fails, throws, or takes over two seconds. Anyone can");
  p("// make these run, so each is one cheap read, and a burst of probes reuses one");
  p("// result per isolate for STATUS_REUSE_MS.");
  p("const STATUS_REUSE_MS = 10_000;");
  p("const STATUS_CHECKS = {");
  p("  // D1 answers `SELECT 1`.");
  p("  d1: d1Check((env: CloudflareEnv) => env.DB),");
  if (config.status?.checks) {
    p("  // The app's own, from src/status-checks.ts. Spread last, so a check with");
    p("  // the same name replaces Astroid's on purpose.");
    p("  ...statusChecks,");
  }
  p("};");
  p();
  p("const routes: WorkerRoute<CloudflareEnv>[] = [");
  p("  // Public status for an outside probe (GET/HEAD /api/louise/status). A");
  p("  // publicRoute, so the gate below lets an anonymous probe through.");
  p("  statusRoute({ checks: STATUS_CHECKS, reuseMs: STATUS_REUSE_MS }),");
  p("];");
  p();
  emitIncidentPreamble(p, config, dlq);
  p(
    queues
      ? "export default composeWorker<CloudflareEnv, AstroidQueueMessage>({"
      : "export default composeWorker<CloudflareEnv>({",
  );
  p("  routes,");
  p("  // No editor, so no request under /api/louise resolves to one. The gate");
  p("  // refuses everything there except the public status probe, and gives route");
  p("  // responses the security headers the middleware never sees.");
  p("  gate: { resolveEditor: () => null },");
  p("  // The SSR fallback, in the Worker cache (ADR 0004). It stores only a");
  p("  // response that opts in with `Astro.cache.set(...)`, and it strips the CDN");
  p("  // directive from every other one, so Cloudflare's cookie-blind edge cache");
  p("  // never stores a signed-in customer's page.");
  p("  fetch: withEdgeCache((request, env, ctx) => handle(request, env, ctx)),");
  emitIncidentOption(p, config);
  if (queues) emitQueueOption(p, config, dlq);
  if (scheduled) {
    p("  // Cron. Cloudflare fires this for EVERY trigger in wrangler.jsonc and");
    p("  // identifies which by `controller.cron`, so dispatch on it.");
    p("  scheduled: (controller, env, ctx) => {");
    if (cron) {
      p(`    if (controller.cron === ${JSON.stringify(cron)}) {`);
      p("      // Catalog safety net: a missed webhook leaves the catalog stale only");
      p("      // until the next tick. Enqueued, so it takes the retry + DLQ path.");
      p('      ctx.waitUntil(env.COMMERCE_QUEUE.send({ kind: "catalog_refresh" }));');
      p("      return;");
      p("    }");
    }
    for (const custom of customCrons) {
      p(`    if (controller.cron === ${JSON.stringify(custom.expression)}) {`);
      p("      // Enqueued, not run inline: same retry + DLQ path as everything");
      p("      // else, and a slow job can't hold the scheduled handler open.");
      p(`      ctx.waitUntil(env.COMMERCE_QUEUE.send(${JSON.stringify(custom.message)}));`);
      p("      return;");
      p("    }");
    }
    p("  },");
  }
  p("});");
  p();
  emitAuthRateLimitExport(config, p);
  return lines.join("\n");
}

/**
 * Generate the Astro middleware (`middleware.ts`) from an Astroid config: the
 * shared Louise flow (rate-limit the unauthenticated POST surface → resolve editor
 * session + sticky `?louise` edit mode → content-freshness + security headers) via
 * `createLouiseMiddleware`.
 *
 * The rate rules are NOT emitted as literals here—the file calls
 * `astroidRateRules(astroidConfig)`, so the set stays real data in the package
 * (testable, and a `match` predicate survives, which a serialized literal could
 * not). Enabling a portal or commerce in the config adds that surface's rules
 * with no regeneration of this file at all.
 *
 * CSP: `astro.config.mjs` enables `security.csp` (via `astroidSecurity`), so
 * Astro emits a hash-based `content-security-policy` response header on every SSR
 * page and owns `script-src`. The `cspStyleSrc` below tells
 * `createLouiseMiddleware` to rewrite that header's `style-src` to
 * `'self' 'unsafe-inline'`—a hash-based `style-src` would, per spec, void the
 * `'unsafe-inline'` that Louise's data-driven `style=""` carriers and the
 * editor's runtime-injected `<style>` require. Script hashes are left verbatim,
 * and the inlined `data:` brand font is auto-allowed.
 */
export function generateAstroidMiddleware(config: AstroidConfig): string {
  // Louise's brand font is bundled + base64-inlined (no Google Fonts host to
  // allow); createLouiseMiddleware auto-allows `data:` fonts in the CSP, so the
  // inlined @font-face needs no manual `font-src` entry. Module + config `style`
  // origins (the Square SDK's stylesheet) are baked in here; `astroid build`
  // regenerates this file, so a config change lands on the next deploy.
  const cspStyleSrc = astroidCspStyleSrc(config);
  // An app with no editor has no auth seam and no pages to redirect between.
  const editor = astroidHasEditor(config);
  const portal = astroidPortal(config);
  const tenancy = config.tenancy;
  const rewritePrefix = tenancy?.rewritePrefix ?? ASTROID_TENANT_PREFIX;
  const rewriteExclude = tenancy?.rewriteExclude ?? ASTROID_REWRITE_EXCLUDE;
  return [
    "// Generated by astroidjs—do not hand-edit.",
    "// The shared Louise middleware: rate-limit the unauthenticated POST surfaces,",
    ...(editor
      ? ["// then resolve the editor session + sticky ?louise edit mode, then apply"]
      : ["// then (this app has no editor, so there's no session to resolve) apply"]),
    "// content-freshness + transport-security headers, and rewrite the style-src of",
    "// the CSP header Astro's security.csp emits so Louise's data-driven inline",
    "// styles + inlined data: brand font are allowed.",
    'import { env } from "cloudflare:workers";',
    'import { createLouiseMiddleware } from "@louise-toolkit/astro";',
    ...(editor
      ? ['import { db, pageRedirects, resolvePageRedirect } from "louise-toolkit/db";']
      : []),
    // One `astroidjs` import, composed from what this config actually uses—two
    // import statements for the same module is legal and reads as an
    // oversight in a file nobody is supposed to hand-edit.
    `import { ${[
      ...(tenancy && Object.keys(tenancy.apps ?? {}).length ? ["appPrefix"] : []),
      ...(portal ? ["astroidPortalGuardConfig"] : []),
      "astroidRateRules",
      ...(portal ? ["guardResponse", "portalGuard", "resolvePortalSession"] : []),
      ...(tenancy ? ["isRewriteExcluded", "tenantLabel"] : []),
    ].join(", ")} } from "astroidjs";`,
    'import astroidConfig from "../astroid.config.js";',
    ...(tenancy
      ? [
          "// TODO(astroid): your TENANT seam—what a subdomain maps to (src/tenancy.ts).",
          'import { resolveTenant } from "./tenancy.js";',
        ]
      : []),
    ...(editor
      ? [
          "// TODO(astroid): your AUTH seam—same resolveEditor as the generated worker.ts.",
          'import { resolveEditor } from "./auth.js";',
        ]
      : []),
    // The portal's resolver lives in its OWN module, not the editor's auth
    // seam—they're separate Better Auth instances and must not share a file.
    ...(portal ? ['import { resolvePortalUser } from "./portal-auth.js";'] : []),
    "",
    "// Rate-limit the public, unauthenticated POST surface, keyed by client IP",
    "// (fixed-window KV counter that fails open). Derived from your config: the",
    ...(editor
      ? ["// editor magic-link always, plus the portal credential surfaces and checkout"]
      : ["// versioned API under /api/v1, plus the portal credential surfaces and checkout"]),
    "// when those are enabled. Add your own via `security.rateRules` in the config—",
    "// they're matched first, so they can also override a default's budget.",
    "// `env.RL` is read per request (a getter)—a KV binding is only valid in",
    "// request scope.",
    "const RATE_RULES = astroidRateRules(astroidConfig);",
    ...(tenancy
      ? [
          "",
          "// Read from the config rather than restated here, so the reserved list and",
          "// the wildcard pattern can't drift from the Worker route generated for them.",
          "const TENANCY = astroidConfig.tenancy!;",
        ]
      : []),
    ...(portal
      ? [
          "const PORTAL_GUARD = astroidPortalGuardConfig(astroidConfig)!;",
          "",
          "// The PORTAL session—a second, cookie- and table-isolated Better Auth",
          "// instance beside the editor's. `resolvePortalSession` shares the in-flight",
          "// lookup per request, so the guard here and the handler that runs next",
          "// don't each pay a session round-trip.",
        ]
      : []),
    "",
    "export const onRequest = createLouiseMiddleware({",
    ...(editor
      ? ["  resolveEditor: (request) => resolveEditor(request),"]
      : [
          "  // No editor (`editor: false`), so no request resolves to one and edit",
          "  // mode never turns on.",
          "  resolveEditor: () => null,",
        ]),
    "  rateLimit: { rules: RATE_RULES, kv: () => env.RL },",
    "  // The same deny-by-default gate for /api/louise routes that reach Astro—",
    "  // anything the worker's routes didn't answer. A second check behind the",
    editor
      ? "  // worker's gate, and free: the editor is resolved here on every request."
      : "  // worker's gate: with no editor, it refuses all but the public routes.",
    "  apiGate: true,",
    ...(editor
      ? [
          "  // A renamed page's old URL answers a 301 to the new one. It runs only after",
          "  // the page answered 404, so a page later created on the old path wins.",
          "  redirectFor: (path) => resolvePageRedirect(db(env.DB), pageRedirects, path),",
        ]
      : []),
    // `extend` runs once and may need to populate BOTH—a tenanted site with a
    // portal resolves a tenant and a customer on the same request.
    ...(portal || tenancy
      ? [
          "  extend: async (context) => {",
          ...(portal
            ? [
                "    const user = await resolvePortalSession(context.request, resolvePortalUser);",
                "    context.locals.portalUser = user;",
              ]
            : []),
          ...(tenancy
            ? [
                "    // The label, or null for the apex / a reserved label / an off-pattern",
                "    // host. `resolveTenant` is yours (src/tenancy.ts): it decides what a",
                "    // label maps to and whether that lookup is cached.",
                "    const label = tenantLabel(context.url.hostname, TENANCY);",
                "    context.locals.tenant = label ? await resolveTenant(label) : null;",
              ]
            : []),
          "  },",
        ]
      : []),
    ...(portal || tenancy?.unknown === "404"
      ? [
          "  guard: (context) => {",
          ...(tenancy?.unknown === "404"
            ? [
                "    // A syntactically-valid tenant host whose label resolved to nothing is",
                '    // NOT a page (config `tenancy.unknown: "404"`). Falling through would',
                "    // render the marketing homepage on a stranger's subdomain. Reserved",
                "    // labels, app labels, and the apex never reach here—tenantLabel",
                "    // returns null for all of them, so they are not tenant candidates.",
                "    if (tenantLabel(context.url.hostname, TENANCY) && !context.locals.tenant) {",
                '      return new Response("Not found", { status: 404 });',
                "    }",
              ]
            : []),
          ...(portal
            ? [
                "    // Route guard: the declarative prefix→roles table from your config.",
                "    // An /api/* route always answers in JSON—redirecting fetch() to an",
                "    // HTML login page returns 200 and markup, which reads as success.",
                "    const decision = portalGuard(",
                "      context.url.pathname,",
                "      context.locals.portalUser,",
                "      PORTAL_GUARD,",
                "    );",
                "    if (!decision) return undefined;",
                '    if (decision.kind === "redirect") return context.redirect(decision.location);',
                "    return guardResponse(decision) ?? undefined;",
              ]
            : ["    return undefined;"]),
          "  },",
        ]
      : []),
    ...(tenancy
      ? [
          "  // Host dispatch: map the resolved tenant onto an internal path prefix.",
          "  // Runs after `guard`, so route policy stays written against the PUBLIC",
          "  // path. The visitor's URL is unchanged—an internal rewrite, not a",
          "  // redirect—so links built from Astro.url stay correct.",
          "  //",
          "  // An unknown subdomain is YOUR decision: `resolveTenant` returning null",
          "  // falls through to the ordinary site below—or answers 404 first, when the",
          '  // config sets `tenancy.unknown: "404"` (see the guard above).',
          "  rewrite: (context) => {",
          "    // Host-agnostic paths render from their own address. An API route is",
          "    // addressed absolutely by whatever calls it and reads the host from",
          "    // `locals.tenant`, so rewriting it moves it where no route matches—",
          "    // and on an app host with a catch-all page, the PAGE answers, so",
          "    // fetch() gets HTML instead of JSON and every data load quietly fails.",
          `    if (isRewriteExcluded(context.url.pathname, ${JSON.stringify(rewriteExclude)})) {`,
          "      return undefined;",
          "    }",
          ...(Object.keys(tenancy.apps ?? {}).length
            ? [
                "    // First-party app hosts (config `tenancy.apps`): a static label→prefix",
                "    // map, checked before the tenant—an app exists whether or not any",
                "    // tenant does, and needs no lookup.",
                "    const app = appPrefix(context.url.hostname, TENANCY);",
                "    // `search` is preserved: the rewrite chooses which page renders, not",
                "    // what was asked of it. Dropping it silently loses filters, pagination,",
                "    // campaign tags—and every typed search param a routed island reads.",
                "    if (app) return `${app}${context.url.pathname}${context.url.search}`;",
              ]
            : []),
          "    const tenant = context.locals.tenant;",
          `    return tenant ? \`${rewritePrefix}/\${tenant.slug}\${context.url.pathname}\${context.url.search}\` : undefined;`,
          "  },",
        ]
      : []),
    "  // Rewrite Astro's hash-based style-src (owned by astroidSecurity in",
    '  // astro.config.mjs) to permit Louise\'s data-driven style="" + editor styles.',
    `  cspStyleSrc: ${JSON.stringify(cspStyleSrc)},`,
    "});",
    "",
  ].join("\n");
}

/**
 * The dead-letter queue the worker consumes, or `null` for none: always `null`
 * without a queue, and otherwise the name `wrangler.jsonc` gives it.
 */
function deadLetterQueueFor(
  config: AstroidConfig,
  options: GenerateAstroidWorkerOptions,
): string | null {
  if (!astroidUsesQueues(config)) return null;
  return options.deadLetterQueue === undefined
    ? astroidQueueNames(config).dlq
    : options.deadLetterQueue;
}

/** The `louise-toolkit/incidents` import both worker shapes emit. */
function incidentsImport(deadLetters: boolean): string {
  const names = [
    "analyticsIncidents",
    "d1Incidents",
    ...(deadLetters ? ["deadLetterConsumer"] : []),
  ];
  return `import { ${names.join(", ")} } from "louise-toolkit/incidents";`;
}

/**
 * The declarations incident capture needs ahead of `composeWorker`, shared by
 * both shapes (louise-toolkit ADR 0022). Its bindings are read through a local
 * type rather than `CloudflareEnv`, because `src/env.d.ts` is scaffold-once: a
 * site made before them still type-checks, and each sink skips what isn't bound.
 */
function emitIncidentPreamble(
  p: (s?: string) => void,
  config: AstroidConfig,
  dlq: string | null,
): void {
  p("// --- incidents --------------------------------------------------------------");
  p("// Every failure this worker sees becomes an incident: counted into the site's");
  p("// own D1 (the `incidents` table), and into Analytics Engine for counts over");
  p("// time (louise-toolkit ADR 0022). These bindings are optional. A site whose");
  p("// wrangler.jsonc predates them still type-checks, and a sink skips what isn't");
  p("// bound.");
  p("type IncidentBindings = {");
  p(`  ${ASTROID_INCIDENT_EVENTS_BINDING}?: AnalyticsEngineDataset;`);
  p(`  ${ASTROID_VERSION_METADATA_BINDING}?: WorkerVersionMetadata;`);
  if (config.incidents?.sentry) p(`  ${ASTROID_SENTRY_DSN_BINDING}?: SecretSource;`);
  p("};");
  p("const incidentBindings = (env: CloudflareEnv) => env as CloudflareEnv & IncidentBindings;");
  if (dlq !== null) {
    p("// The dead-letter queue's consumer: it keeps each message the queue gave up on");
    p("// in the `dead_letters` table, counts it as an incident, and acks it, so a");
    // No comment on where the name comes from: a line added here would change
    // every existing site's worker, and the name is the same one as before for
    // a site whose queues follow its key.
    p("// failed webhook event is never lost unseen.");
    p(`const DEAD_LETTER_QUEUE = ${JSON.stringify(dlq)};`);
    p("const keepDeadLetters = deadLetterConsumer<CloudflareEnv, AstroidQueueMessage>(");
    p("  (env) => env.DB,");
    p(");");
  }
  p();
}

/** The `onIncident` option both shapes pass `composeWorker`. */
function emitIncidentOption(p: (s?: string) => void, config: AstroidConfig): void {
  const critical = config.incidents?.critical ?? [];
  p("  // Incident capture (louise-toolkit ADR 0022). A throw is reported, then");
  p("  // re-thrown, so responses don't change; the sinks run after the response.");
  p("  onIncident: {");
  p("    sinks: [");
  p("      // The record: one row per failure, with a count, in the site's own D1.");
  p("      d1Incidents((env: CloudflareEnv) => env.DB),");
  p(
    `      analyticsIncidents((env: CloudflareEnv) => incidentBindings(env).${ASTROID_INCIDENT_EVENTS_BINDING}),`,
  );
  if (config.incidents?.sentry) {
    p("      // A copy for the operator's issue system, with the stack. Dormant until");
    p(`      // the ${ASTROID_SENTRY_DSN_BINDING} secret holds a real DSN.`);
    p(
      `      sentryIncidents((env: CloudflareEnv) => incidentBindings(env).${ASTROID_SENTRY_DSN_BINDING}, { site: ${JSON.stringify(config.key)} }),`,
    );
  }
  p("    ],");
  if (critical.length > 0) {
    p("    // What alerts, from `incidents.critical` in your config.");
    p(`    critical: ${JSON.stringify(critical)},`);
  }
  p(`    release: (env) => incidentBindings(env).${ASTROID_VERSION_METADATA_BINDING}?.id,`);
  p("  },");
}

/** The queue consumer both shapes emit: the dead-letter queue's batches to its
 *  consumer, and the rest through `processBatch`, which reports a message's
 *  last failed delivery as an incident. With no dead-letter queue, every
 *  batch goes through `processBatch`. */
function emitQueueOption(p: (s?: string) => void, config: AstroidConfig, dlq: string | null): void {
  const maxRetries = config.queues?.maxRetries ?? 5;
  if (dlq === null) {
    p("  // Queue consumer. `processBatch` acks or retries each message");
    p("  // INDEPENDENTLY, so one poisoned message can't block the rest of the");
    p("  // batch, and reports its last failure, at `maxRetries`, as an incident.");
    p("  // wrangler.jsonc names no dead-letter queue, so Cloudflare then drops it.");
    p("  queue: (batch, env) =>");
    p("    processBatch(batch, (message) => handleQueueMessage(env, message), {");
    p(`      maxRetries: ${maxRetries},`);
    p("    }),");
    return;
  }
  p("  // Queue consumer. `processBatch` acks or retries each message");
  p("  // INDEPENDENTLY, so one poisoned message can't block the rest of the");
  p("  // batch; Cloudflare routes it to the DLQ once it exceeds max_retries,");
  p("  // which `maxRetries` matches, so its last failure counts as an incident.");
  p("  queue: (batch, env, ctx) =>");
  p("    batch.queue === DEAD_LETTER_QUEUE");
  p("      ? keepDeadLetters(batch, env, ctx)");
  p("      : processBatch(batch, (message) => handleQueueMessage(env, message), {");
  p(`          maxRetries: ${maxRetries},`);
  p("        }),");
}
