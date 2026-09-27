#!/usr/bin/env node
// Copyright (c) 2026 BowenLabs. Astroid is MIT licensed.
//
// `create-astroid`—scaffold a new Astroid site in one command:
//
//   pnpm create astroid@latest my-site
//   pnpm create astroid@latest my-site --key example --name "Example Organization" --color "#5b4bff" --host example.com
//
// It writes the floor: the `defineAstroid` config, the generated
// schema/worker/middleware trio + wrangler.jsonc (via astroidjs), the Better Auth
// migration (via louise-toolkit/auth), and the baseline Astro app from ./template.
// Binding ids are placeholders—provision them, then `astroid deploy` (or
// wrangler) fills them in. The generators are the SAME ones `astroid generate`
// uses, so a fresh project is already in sync.

import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";
import {
  ASTROID_ARCHETYPE_SECTIONS,
  ASTROID_MAP_DEPENDENCIES,
  defineAstroid,
  generateAstroidEnvBindings,
  generateAstroidHomeSeed,
  generateAstroidPortalLocals,
  generateAstroidProject,
  generateAstroidCheckoutEnv,
  generateAstroidRealtimeEnv,
  generateAstroidScaffoldFiles,
  generateAstroidSecretsEnv,
  generateAstroidWrangler,
} from "astroidjs";
import { toolkitRanges } from "./toolkit-ranges.mjs";

const TEMPLATE_DIR = join(dirname(fileURLToPath(import.meta.url)), "template");

// Files (and dirs) whose leading `_` is stripped on copy (npm strips real
// dotfiles from a published package, so they ship as `_gitignore` /
// `_env.example` / `_github/…`). Applied per entry in `copyTemplate`, so a
// directory renames too—`_github` becomes `.github` and its contents follow.
const DOTFILE_RENAMES = {
  _gitignore: ".gitignore",
  "_env.example": ".env.example",
  _github: ".github",
};

// The editor-free app shape (`--app`, `editor: false`). It starts from the same
// template, leaves out the editor's files, and lays `template/_app/` over the
// rest, so the two shapes share every file that doesn't depend on an editor.
const APP_OVERLAY = "_app";
const APP_SKIP = new Set([
  "migrations/0000_content.sql",
  "scripts/seed-editors.mjs",
  "src/auth.ts",
  "src/components/Hero.astro",
  "src/components/LouiseEdit.astro",
  "src/layouts/Site.astro",
  "src/lib/pages.ts",
  "src/pages/[...slug].astro",
  "src/pages/api/auth/[...all].ts",
  "src/pages/contact.astro",
  "src/pages/login.astro",
]);

// Archetype → default editable home sections. Imported from astroidjs rather
// than duplicated here: as a literal in this file it could name a section that
// doesn't exist and nothing would say so (it did—`marquee`, `featured`,
// `story`, and `visit` had no component for months). Over there it's typed
// against the section catalog, so a stale name fails the build. See #277.
const ARCHETYPE_SECTIONS = ASTROID_ARCHETYPE_SECTIONS;
const ARCHETYPES = Object.keys(ARCHETYPE_SECTIONS);

// Commerce backends astroidjs knows how to wire (webhook verifier + catalog
// event filter). Opt-in via `--commerce`; it also switches on the queue
// consumer, the webhook receiver, and the cron safety net.
const COMMERCE_PROVIDERS = ["square", "stripe", "fourthwall"];

// Square's location model (`commerce.square.locations`). `multi` is the
// multi-merchant shape: the location comes from the request, not the
// environment, and the checkout route is scaffolded around resolving it.
const SQUARE_LOCATIONS = ["single", "multi"];

// --- args ------------------------------------------------------------------
function parseArgs(argv) {
  const flags = {};
  const positionals = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("--")) flags[key] = true;
      else flags[key] = argv[++i];
    } else positionals.push(a);
  }
  return { flags, positionals };
}

const slugify = (s) =>
  s
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);

async function prompt(question, fallback) {
  if (!process.stdin.isTTY) return fallback;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = (await rl.question(`${question}${fallback ? ` (${fallback})` : ""}: `)).trim();
    return answer || fallback;
  } finally {
    rl.close();
  }
}

// --- scaffold --------------------------------------------------------------
// `skip` holds template-relative POSIX paths to leave out. Directories are made
// only when a file lands in them, so skipping a directory's every file leaves
// no empty directory behind.
function copyTemplate(srcDir, destDir, tokens, { skip = new Set(), rel = "" } = {}) {
  for (const entry of readdirSync(srcDir)) {
    // The app overlay is copied on its own, over the rest, and only for `--app`.
    if (rel === "" && entry === APP_OVERLAY) continue;
    const src = join(srcDir, entry);
    const path = rel ? `${rel}/${entry}` : entry;
    const renamed = DOTFILE_RENAMES[entry] ?? entry;
    const dest = join(destDir, renamed);
    if (statSync(src).isDirectory()) {
      copyTemplate(src, dest, tokens, { skip, rel: path });
    } else if (!skip.has(path)) {
      mkdirSync(destDir, { recursive: true });
      const raw = readFileSync(src, "utf8");
      writeFileSync(dest, applyTokens(raw, tokens));
    }
  }
}

function applyTokens(text, tokens) {
  return text.replace(/__([A-Z0-9_]+)__/g, (m, key) => (key in tokens ? tokens[key] : m));
}

function astroidConfigSource(config) {
  const parts = [
    'import { defineAstroid } from "astroidjs";',
    "",
    "// The whole shape of this site—one typed config. `astroid generate` (run by",
    "// `astroid dev`/`build`) turns it into src/schema.ts, src/worker.ts, and",
    "// src/middleware.ts; `astroid doctor` keeps them honest.",
    "export default defineAstroid({",
    `  key: ${JSON.stringify(config.key)},`,
    `  archetype: ${JSON.stringify(config.archetype)},`,
    // Must be emitted: every generator reads the shape from THIS file, so a
    // config without it would regenerate an editor this app has no seam for.
    ...(config.editor === false ? ["  editor: false,"] : []),
    ...(config.hosts?.length ? [`  hosts: ${JSON.stringify(config.hosts)},`] : []),
    "  theme: {",
    `    name: ${JSON.stringify(config.theme.name)},`,
    `    colors: { brand: ${JSON.stringify(config.theme.colors.brand)} },`,
    "  },",
    ...(config.sections ? [`  sections: ${JSON.stringify(config.sections)},`] : []),
    // `square` must be emitted too: `astroid doctor` derives the required
    // secrets from THIS file, so a multi-location project whose config lost the
    // option would be told it is missing a SQUARE_LOCATION_ID it must not have.
    ...(config.commerce
      ? [
          `  commerce: { provider: ${JSON.stringify(config.commerce.provider)}${
            config.commerce.square?.locations
              ? `, square: { locations: ${JSON.stringify(config.commerce.square.locations)} }`
              : ""
          } },`,
        ]
      : []),
    // Must be emitted, for the same reason the portal is: `astroid generate`
    // rebuilds the middleware and CSP from THIS file, so a config that dropped
    // `modules` would regenerate a project missing whatever they contribute.
    ...(config.modules?.length ? [`  modules: ${JSON.stringify(config.modules)},`] : []),
    // Must be emitted: `astroid generate` rebuilds the middleware from THIS
    // file, so a config that omitted the portal would regenerate a middleware
    // with no guard while src/portal-auth.ts sat there unused. And the FULL shape
    // (tablePrefix, signUp)—not a bare `{ enabled: true }`—so a regenerate
    // reproduces the SAME unprefixed `user`/`session` seam the 0002_portal_auth
    // migration created, rather than defaulting the prefix back to `portal_`.
    ...(config.portal?.enabled
      ? [
          "  portal: {",
          "    enabled: true,",
          ...(config.portal.tablePrefix !== undefined
            ? [`    tablePrefix: ${JSON.stringify(config.portal.tablePrefix)},`]
            : []),
          ...(config.portal.signUp !== undefined
            ? [`    signUp: ${JSON.stringify(config.portal.signUp)},`]
            : []),
          "  },",
        ]
      : []),
    // Must be emitted: the scaffold's layout reads `credit` from THIS file at
    // render time, so a config without it renders no footer.
    ...(config.credit
      ? [
          `  credit: { name: ${JSON.stringify(config.credit.name)}, href: ${JSON.stringify(
            config.credit.href,
          )} },`,
        ]
      : []),
    '  deploy: { platform: "cloudflare" },',
    "});",
    "",
  ];
  return parts.join("\n");
}

function write(destDir, relPath, contents) {
  const abs = join(destDir, relPath);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, contents);
}

const USAGE = `Scaffold a new Astroid site — an editable Astro app on Cloudflare Workers.

Usage:
  pnpm create astroid [directory] [options]

Options:
  --dir <path>          Target directory (also accepted as the first positional)
  --name <name>         Brand / site name
  --key <slug>          Project key (slug); defaults to a slug of --name
  --archetype <type>    ${ARCHETYPES.join(" | ")}   (default: marketing)
  --color <hex>         Brand color (default: #5b4bff)
  --host <domain>       Primary domain, e.g. example.com
  --commerce <provider> ${COMMERCE_PROVIDERS.join(" | ")}
                        Also adds the queue consumer, webhook receiver, and cron
  --square-locations <n> ${SQUARE_LOCATIONS.join(" | ")}   (default: single; needs --commerce square)
                        multi: one Square Location per merchant, resolved from
                        the request host — no SQUARE_LOCATION_ID
  --map                 Add the self-hosted PMTiles/MapLibre location map
  --pwa                 Add an installable PWA: a scoped service worker that
                        never caches /api/* or the editor, plus a manifest
  --realtime            Add live multi-editor editing: a per-page Durable Object
                        with presence, field sync, and a rich-text soft-lock
  --portal              Add a customer/member portal: a second, isolated auth
                        instance plus role-gated routes
  --app                 Scaffold an app with no pages to edit (editor: false):
                        no editor, sign-in, or content tables, and a versioned
                        JSON API under /api/v1. Its settings stay in the editor
                        of a site that has one
  --credit-name <name>  Credit who built the site in the footer ("Site by <name>")
  --credit-href <url>   Where the credit links; needs --credit-name, and the
                        other way round
  -h, --help            Show this help
  -v, --version         Show the create-astroid version

Anything not passed as a flag is prompted for; in a non-TTY every prompt takes
its default, so the command is CI-safe. The target directory must be empty.
With --app there is no archetype prompt; --archetype still sets the business
type in structured data.
`;

async function main() {
  const argv = process.argv.slice(2);
  const { flags, positionals } = parseArgs(argv);

  // Handle these before any prompting—otherwise `--help` reads as a truthy
  // flag and drops the user into the interactive scaffold instead. The short
  // forms are read off argv directly: parseArgs only treats `--` as a flag, so
  // a bare `-h` would otherwise be taken as the target directory.
  if (flags.help || argv.includes("-h")) {
    process.stdout.write(USAGE);
    return;
  }
  if (flags.version || argv.includes("-v")) {
    const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));
    process.stdout.write(`${pkg.version}\n`);
    return;
  }

  const dirArg = positionals[0] ?? flags.dir;
  const rawName = flags.name || (dirArg ? basename(resolve(dirArg)) : undefined);
  const name = await prompt("Brand / site name", rawName || "My Astroid Site");
  const key = slugify(
    flags.key || (await prompt("Project key (slug)", slugify(name) || "my-site")),
  );
  const dir = resolve(dirArg || (await prompt("Directory", key)) || key);
  // An app with no pages to edit (`editor: false`). Its archetype chooses no
  // sections, so it isn't prompted for; it only sets the structured-data type.
  const app = flags.app === true || flags.app === "true";
  const archetypeRaw = (
    flags.archetype ||
    (app ? "marketing" : await prompt(`Archetype (${ARCHETYPES.join("/")})`, "marketing"))
  ).toLowerCase();
  const archetype = ARCHETYPES.includes(archetypeRaw) ? archetypeRaw : "marketing";
  const color = flags.color || (await prompt("Brand color (hex)", "#5b4bff"));
  const host = flags.host && flags.host !== true ? flags.host : undefined;
  // The customer PORTAL is opt-in via --portal, but a storefront IMPLIES one—a
  // shop has customers who sign in, reorder, and track orders—so enable it there
  // by default. (Commerce below stays opt-in: infra a marketing site shouldn't carry.)
  // An app gets one only when asked: its customers may sign in on the site.
  const portal =
    flags.portal === true || flags.portal === "true" || (archetype === "storefront" && !app);
  // The map module is opt-in and pulls real weight (maplibre-gl is ~1 MB), so
  // it is never on by default.
  const map = flags.map === true || flags.map === "true";
  // Opt-in: a service worker is a caching layer over a CMS-edited site, so it
  // is never on unless asked for.
  const pwa = flags.pwa === true || flags.pwa === "true";
  // Opt-in: realtime provisions a Durable Object, which is real infrastructure a
  // single-editor site has no use for.
  const realtime = flags.realtime === true || flags.realtime === "true";
  const modules = [
    ...(map ? ["map"] : []),
    ...(pwa ? ["pwa"] : []),
    ...(realtime ? ["realtime"] : []),
  ];
  // Commerce is opt-in and unprompted: it pulls in a queue consumer, a webhook
  // receiver, and a cron, none of which a plain marketing site should carry.
  const commerceRaw = typeof flags.commerce === "string" ? flags.commerce.toLowerCase() : undefined;
  const commerce = COMMERCE_PROVIDERS.includes(commerceRaw) ? commerceRaw : undefined;
  if (commerceRaw && !commerce) {
    process.stderr.write(
      `create-astroid: unknown --commerce provider "${commerceRaw}" (expected ${COMMERCE_PROVIDERS.join(" | ")})\n`,
    );
    process.exit(1);
  }
  // Refused, not ignored, without Square: the checkout route is scaffolded ONCE,
  // so a multi-merchant store that silently got the single-location route would
  // ring every sale against one ambient SQUARE_LOCATION_ID—and look fine doing it.
  const squareLocationsRaw = flags["square-locations"];
  const squareLocations =
    typeof squareLocationsRaw === "string" ? squareLocationsRaw.toLowerCase() : undefined;
  if (squareLocationsRaw !== undefined && !SQUARE_LOCATIONS.includes(squareLocations)) {
    process.stderr.write(
      `create-astroid: --square-locations expects ${SQUARE_LOCATIONS.join(" | ")}\n`,
    );
    process.exit(1);
  }
  if (squareLocations && commerce !== "square") {
    process.stderr.write("create-astroid: --square-locations needs --commerce square\n");
    process.exit(1);
  }

  // A pair or nothing: a credit with no link, or a link with nothing to show,
  // is a half-typed flag rather than a choice.
  const creditName = typeof flags["credit-name"] === "string" ? flags["credit-name"] : undefined;
  const creditHref = typeof flags["credit-href"] === "string" ? flags["credit-href"] : undefined;
  if (
    (flags["credit-name"] !== undefined || flags["credit-href"] !== undefined) &&
    !(creditName && creditHref)
  ) {
    process.stderr.write("create-astroid: --credit-name and --credit-href go together\n");
    process.exit(1);
  }

  // Refused here with the flag's name, rather than by `defineAstroid` with a
  // stack trace: live editing needs an editor to edit with.
  if (app && realtime) {
    process.stderr.write("create-astroid: --realtime needs an editor, so it can't go with --app\n");
    process.exit(1);
  }

  if (existsSync(dir) && readdirSync(dir).length > 0) {
    process.stderr.write(`create-astroid: target directory is not empty: ${dir}\n`);
    process.exit(1);
  }

  // Validate + normalize through the real config surface (throws on a bad shape).
  const config = defineAstroid({
    key,
    archetype,
    ...(host ? { hosts: [host] } : {}),
    theme: { name, colors: { brand: color } },
    ...(app ? { editor: false } : { sections: ARCHETYPE_SECTIONS[archetype] }),
    ...(commerce
      ? {
          commerce: {
            provider: commerce,
            ...(squareLocations ? { square: { locations: squareLocations } } : {}),
          },
        }
      : {}),
    // Unprefixed `user`/`session` (customers—email + password), so the studio's
    // `louise_`-prefixed tables and the portal's never collide (mirrors the
    // reference storefront). `signUp: true` because a shop lets customers register.
    ...(portal ? { portal: { enabled: true, tablePrefix: "", signUp: true } } : {}),
    // ONE array, built from every enabled flag. Two separate `...(x ? {modules}
    // : {})` spreads would let the later one overwrite the earlier, silently
    // dropping a module whenever both were passed.
    ...(modules.length > 0 ? { modules } : {}),
    ...(creditName && creditHref ? { credit: { name: creditName, href: creditHref } } : {}),
    deploy: { platform: "cloudflare" },
  });

  const siteUrl = host ? `https://${host}` : `https://${key}.workers.dev`;
  const envBindings = generateAstroidEnvBindings(config);
  const portalLocals = generateAstroidPortalLocals(config);
  // The realtime DO namespace, or nothing—same rule as the queue bindings: a
  // declaration is a promise, so never type a binding wrangler.jsonc won't create.
  const realtimeEnv = generateAstroidRealtimeEnv(config);
  // The Square Web Payments public vars, or nothing.
  const checkoutEnv = generateAstroidCheckoutEnv(config);
  // An app's portal is the only thing in it that signs anyone in or sends mail,
  // so the session secret, the mail binding, and the sender come with it. The
  // editor shape's env.d.ts and .env.example declare these for every project.
  const appPortalEnv =
    app && portal
      ? [
          "  /** Cloudflare Email Sending: the portal's password-reset mail. */",
          '  EMAIL: import("louise-toolkit/email").EmailSender;',
          "  /** Signs the portal's Better Auth sessions (`wrangler secret put SESSION_SECRET`). */",
          "  SESSION_SECRET: string;",
          "  /** `from` address for the portal's mail. */",
          "  MAIL_FROM: string;",
        ].join("\n")
      : "";
  const envMembers = [appPortalEnv, envBindings, realtimeEnv, checkoutEnv].filter(Boolean);
  const tokens = {
    KEY: key,
    BRAND_NAME: name,
    BRAND_COLOR: color,
    ARCHETYPE: archetype,
    SITE_URL: siteUrl,
    // Extra CloudflareEnv members the queue pipeline needs, or nothing. A
    // declaration is a promise—a marketing site must not claim a binding its
    // wrangler.jsonc never creates.
    ASTROID_ENV_BINDINGS: envMembers.length > 0 ? `\n${envMembers.join("\n")}` : "",
    // The portal session on App.Locals, or nothing—a project that types a
    // local it never sets invites a null-check nobody needs.
    ASTROID_PORTAL_LOCALS: portalLocals ? `\n${portalLocals}` : "",
    // Placeholder-seeded secrets for whichever modules this project enabled, so
    // a fresh clone has a COMPLETE binding set that all reads as unconfigured—every
    // module takes its dormant path deliberately rather than tripping over
    // an undefined binding. Empty for a project with no credentialed module.
    ASTROID_MODULE_SECRETS: generateAstroidSecretsEnv(config),
    // The app shape's .env.example: the portal's secrets, or nothing.
    ASTROID_APP_SECRETS:
      app && portal
        ? [
            "",
            "# --- portal ---------------------------------------------------------------",
            "#",
            "# Signs the portal's Better Auth sessions. Generate: `openssl rand -base64 32`.",
            "# Empty is fine under `pnpm dev`, which serves on localhost.",
            "SESSION_SECRET=",
            "",
            "# `from` address for the portal's password-reset mail.",
            `MAIL_FROM=no-reply@${key}.example`,
          ].join("\n")
        : "",
  };

  // 1. The static floor (Astro app, auth seam, config files) with tokens filled.
  //    An app leaves out the editor's files and lays its own over the rest.
  copyTemplate(TEMPLATE_DIR, dir, tokens, app ? { skip: APP_SKIP } : {});
  if (app) copyTemplate(join(TEMPLATE_DIR, APP_OVERLAY), dir, tokens);

  // 1b. Toolkit versions + module dependencies, merged into the copied package.json.
  //
  //     Merged by PARSING the file rather than substituting a token into it:
  //     a `__TOKEN__` inside a JSON object makes template/package.json invalid
  //     JSON, and everything that scans a repo for manifests—Snyk, Dependabot,
  //     editors, workspace tooling—parses it and fails. (It did.)
  //
  //     The `astroidjs` / `louise-toolkit` ranges are DERIVED (see
  //     `toolkitRanges`), never taken from template/package.json—a hand-written
  //     range there silently rots into a scaffold that can't build. The literals
  //     it still carries are placeholders that keep the file valid JSON.
  //
  //     Only the enabled modules contribute the rest: nobody installs a megabyte
  //     of mapping library for a site with no map.
  const extraDeps = { ...toolkitRanges(), ...(map ? ASTROID_MAP_DEPENDENCIES : {}) };
  {
    const pkgPath = join(dir, "package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
    pkg.dependencies = Object.fromEntries(
      Object.entries({ ...pkg.dependencies, ...extraDeps }).sort(([a], [b]) => a.localeCompare(b)),
    );
    // An app has no editors to seed, and no script to seed them with.
    if (app) delete pkg.scripts["seed:editors"];
    writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
  }

  // 2. The typed config the generators + the app read.
  write(dir, "astroid.config.ts", astroidConfigSource(config));

  // 3. The generated trio + the scaffold-once wrangler.jsonc (astroidjs).
  for (const file of generateAstroidProject(config)) write(dir, file.path, file.contents);
  write(dir, "wrangler.jsonc", generateAstroidWrangler(config));

  // 3a. The home page seed, built from the config's own `sections`. It used to be
  //     a fixed template file that seeded the marketing sections for every
  //     archetype, and token substitution can't escape a brand name for SQL.
  //     An app has no pages, so it seeds none.
  if (!app) write(dir, "seed/home.seed.sql", generateAstroidHomeSeed(config));

  // 3b. Every scaffold-once module file this config implies—the queue seam and
  //     webhook receivers, the portfolio gallery page, the PWA service worker +
  //     manifest + headers, the map tile route + embed, the portal's second auth
  //     instance and its mounted catch-all.
  //
  //     ONE list, imported from astroidjs, because `astroid generate` writes the
  //     same files when a config gains a module after scaffold. Hand-listing them
  //     here was the only way to produce them, so editing the config—the entire
  //     premise of the framework—regenerated a trio importing `./queue.js` and
  //     `./portal-auth.js` that nothing had written, and `astroid doctor` called
  //     it healthy. Sharing the list is what keeps the two paths honest.
  for (const file of generateAstroidScaffoldFiles(config)) {
    if (file.apply === "append-once") {
      // `public/_headers` accumulates a stanza per module rather than being owned
      // by one, so append instead of overwriting a sibling module's block.
      const abs = join(dir, file.path);
      mkdirSync(dirname(abs), { recursive: true });
      const current = existsSync(abs) ? readFileSync(abs, "utf8") : "";
      if (file.marker && current.includes(file.marker)) continue;
      writeFileSync(abs, current + file.contents);
      continue;
    }
    write(dir, file.path, file.contents);
  }

  // 4. The Better Auth migration (louise-toolkit)—auth tables are fenced out of
  //    drizzle-kit, so they're generated rather than diffed from schema.ts. Loaded
  //    dynamically: it pulls in `better-auth` (an optional peer), which may not be
  //    resolvable at scaffold time. If not, leave a stub + a one-liner to generate
  //    it after install (the project has `louise` on its path then).
  let authMigrationOk = false;
  // An app has no editor instance, so its portal's tables are its first.
  const portalMigration = app
    ? "migrations/0001_portal_auth.sql"
    : "migrations/0002_portal_auth.sql";
  try {
    const { generateAuthSchemaSql } = await import("louise-toolkit/auth");
    // The EDITOR instance's tables—`louise_`-prefixed (the editor convention),
    // leaving the unprefixed `user`/`session` names free for a second/portal
    // instance. Must match the `tablePrefix` in src/auth.ts and the `louise_user`
    // table the generated `editorsRoute` reads.
    if (!app) {
      write(dir, "migrations/0001_auth.sql", generateAuthSchemaSql({ tablePrefix: "louise_" }));
    }
    // The portal's own auth tables—a SECOND Better Auth instance sharing one D1
    // but never a row, so a portal account can't sign into the studio and an
    // editor doesn't appear in the portal. `customers: true` (email + password)
    // and the config's tablePrefix, so this schema matches the scaffolded
    // portal-auth.ts exactly. Without this migration the portal builds fine and
    // fails on the first sign-in with a missing table.
    if (config.portal?.enabled) {
      write(
        dir,
        portalMigration,
        generateAuthSchemaSql({ customers: true, tablePrefix: config.portal.tablePrefix ?? "" }),
      );
    }
    authMigrationOk = true;
  } catch {
    if (!app) {
      write(
        dir,
        "migrations/0001_auth.sql",
        "-- Better Auth tables (editor, louise_ prefix) — generate after install:\n--   pnpm exec louise gen-auth-schema --table-prefix louise_ --out migrations/0001_auth.sql\n",
      );
    }
    // Same stub for the portal's prefixed set. Without it a portal scaffold
    // looks complete, builds, and fails on the first sign-in with a missing
    // table—the one failure mode a stub exists to prevent.
    if (config.portal?.enabled) {
      write(
        dir,
        portalMigration,
        "-- Portal Better Auth tables (customers, unprefixed) — generate after install:\n" +
          `--   pnpm exec louise gen-auth-schema --out ${portalMigration}\n`,
      );
    }
  }

  // An app with no tables of its own still gets the directory, because
  // `astroid ship` applies migrations from it on every deploy until the config
  // says another app owns the database (`deploy.migrations: false`).
  if (app && !existsSync(join(dir, "migrations"))) write(dir, "migrations/.gitkeep", "");

  const rel = dir === process.cwd() ? "." : basename(dir);
  if (app) {
    process.stdout.write(
      [
        "",
        `✓ Scaffolded ${name} → ${rel} (an app with no editor)`,
        "",
        "Next steps:",
        `  cd ${rel}`,
        "  pnpm install",
        ...(authMigrationOk || !config.portal?.enabled
          ? []
          : [
              "  # generate the portal's Better Auth migration:",
              `  pnpm exec louise gen-auth-schema --out ${portalMigration}`,
            ]),
        "  # create the Cloudflare resources wrangler.jsonc names, filling in their ids.",
        "  # To share another app's database instead, bind it by id and set",
        "  # `deploy: { migrations: false }` in astroid.config.ts.",
        "  pnpm exec astroid provision",
        "  # develop / ship:",
        "  pnpm dev            # astroid dev (regenerates, then astro dev)",
        "  pnpm run doctor     # validate config + bindings (`run` is required)",
        "  pnpm exec astroid ship production",
        "",
      ].join("\n"),
    );
    return;
  }
  process.stdout.write(
    [
      "",
      `✓ Scaffolded ${name} → ${rel}`,
      "",
      "Next steps:",
      `  cd ${rel}`,
      "  pnpm install",
      // The auth-migration fallback belongs HERE, in sequence, not in a note
      // printed after the list. It has to run before `d1 migrations apply`, and
      // a correction that appears below an ordered list is a correction most
      // people execute the list without reading: the stub left no `user` table,
      // so `seed:editors` failed with `no such table: user` and the very first
      // instruction anyone follows was the one that broke.
      ...(authMigrationOk
        ? []
        : [
            "  # generate the Better Auth migration (it could not be written at scaffold",
            "  # time — `louise` is on your path once the install above finishes):",
            "  pnpm exec louise gen-auth-schema --table-prefix louise_ --out migrations/0001_auth.sql",
            ...(config.portal?.enabled
              ? [
                  "  pnpm exec louise gen-auth-schema --table-prefix portal_ \\",
                  "    --out migrations/0002_portal_auth.sql",
                ]
              : []),
          ]),
      "  # create the Cloudflare resources wrangler.jsonc names, filling in their ids:",
      "  pnpm exec astroid provision",
      "  # apply migrations, seed the home page + your first editor:",
      "  wrangler d1 migrations apply DB --remote",
      "  wrangler d1 execute DB --remote --file seed/home.seed.sql",
      "  OWNER_EMAIL=you@example.com pnpm seed:editors",
      "  # develop / ship:",
      "  pnpm dev            # astroid dev (regenerates, then astro dev)",
      "  pnpm run doctor     # validate config + bindings (`run` is required)",
      "  wrangler deploy",
      "",
    ].join("\n"),
  );
  if (!authMigrationOk) {
    process.stdout.write(
      "Note: the Better Auth migration is a stub — the `gen-auth-schema` step above\n" +
        "fills it in. Skipping it leaves no `user` table, and `seed:editors` will fail.\n\n",
    );
  }
}

main().catch((err) => {
  process.stderr.write(`${err instanceof Error ? err.stack : String(err)}\n`);
  process.exit(1);
});
