// Copyright (c) 2026 BowenLabs. Astroid is MIT licensed.
//
// The `previews` block check `astroid doctor` runs (louise-toolkit ADR 0017).
//
// A site's staging is Cloudflare's Worker Previews: `main` and every pull
// request run as Previews of the one Worker, with the settings in the
// `previews` block of `wrangler.jsonc`. Previews inherit NOTHING from the top
// level, which is the point and also the trap:
//
//   - A binding the code reads that the block leaves out is `undefined` on a
//     Preview, and the Worker throws (Cloudflare's error 1101).
//   - A binding the block copies verbatim points a Preview at production's
//     database or bucket, so a branch writes production data. That's the
//     failure staging exists to prevent, and nothing else would catch it.
//   - Crons, routes, and queue consumers don't target Previews, so putting
//     them in the block does nothing and reads as if it did.
//
// Pure: text in, findings out, so it's tested directly and the CLI only prints.

/** One finding, in the order `doctor` prints them. */
export interface PreviewsFindings {
  ok: string[];
  errors: string[];
  warnings: string[];
}

type Json = Record<string, unknown>;

/**
 * Parse JSONC: strip `//` and block comments outside strings, then trailing
 * commas. `wrangler.jsonc` is written by hand and commented heavily, which is
 * why `doctor` reads the rest of it by regex; this check needs the structure.
 */
export function parseJsonc(text: string): unknown {
  let out = "";
  let inString = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const next = text[i + 1];
    if (inString) {
      out += c;
      if (c === "\\") out += text[++i] ?? "";
      else if (c === '"') inString = false;
    } else if (c === '"') {
      inString = true;
      out += c;
    } else if (c === "/" && next === "/") {
      while (i < text.length && text[i] !== "\n") i++;
      out += "\n";
    } else if (c === "/" && next === "*") {
      i += 2;
      while (i < text.length && !(text[i] === "*" && text[i + 1] === "/")) i++;
      i++;
    } else {
      out += c;
    }
  }
  return JSON.parse(out.replace(/,(\s*[}\]])/g, "$1"));
}

const isObject = (v: unknown): v is Json =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const list = (v: unknown): Json[] => (Array.isArray(v) ? v.filter(isObject) : []);

/**
 * A storage binding kind: where it lives, which field names the binding, and
 * which fields name the resource behind it. Two bindings whose resource fields
 * match share data.
 */
interface StorageKind {
  what: string;
  get: (config: Json) => Json[];
  name: (b: Json) => unknown;
  resource: (b: Json) => string;
  /** Leaving it out of `previews` is fine, and here's why. */
  optional?: string;
}

const STORAGE: StorageKind[] = [
  {
    what: "D1 database",
    get: (c) => list(c.d1_databases),
    name: (b) => b.binding,
    resource: (b) => String(b.database_id ?? b.database_name ?? ""),
  },
  {
    what: "KV namespace",
    get: (c) => list(c.kv_namespaces),
    name: (b) => b.binding,
    resource: (b) => String(b.id ?? ""),
  },
  {
    what: "R2 bucket",
    get: (c) => list(c.r2_buckets),
    name: (b) => b.binding,
    resource: (b) => String(b.bucket_name ?? ""),
  },
  {
    what: "Secrets Store secret",
    get: (c) => list(c.secrets_store_secrets),
    name: (b) => b.binding,
    resource: (b) => `${String(b.store_id ?? "")}/${String(b.secret_name ?? "")}`,
  },
  {
    what: "Analytics Engine dataset",
    get: (c) => list(c.analytics_engine_datasets),
    name: (b) => b.binding,
    resource: (b) => String(b.dataset ?? ""),
  },
  {
    what: "Vectorize index",
    get: (c) => list(c.vectorize),
    name: (b) => b.binding,
    resource: (b) => String(b.index_name ?? ""),
  },
  {
    what: "queue producer",
    get: (c) => list(isObject(c.queues) ? c.queues.producers : undefined),
    name: (b) => b.binding,
    resource: (b) => String(b.queue ?? ""),
    optional:
      "queue consumers can't target a Preview, so a Preview leaves the queue unbound and the side effects run inline",
  },
  {
    what: "Workflow",
    get: (c) => list(c.workflows),
    name: (b) => b.binding,
    resource: (b) => String(b.name ?? ""),
    optional:
      "a Preview calls the production Workflow's code and bindings, so it leaves the binding out and falls back",
  },
];

/** API bindings with no resource behind them: a Preview needs the key, and no
 *  staging resource. */
const API_BINDINGS = ["ai", "images", "browser", "send_email", "version_metadata"];

/**
 * Check the `previews` block of a `wrangler.jsonc` against its production
 * settings. Returns what passed and what didn't; an error means a Preview
 * would crash or touch production.
 */
export function checkWranglerPreviews(text: string): PreviewsFindings {
  const findings: PreviewsFindings = { ok: [], errors: [], warnings: [] };
  let config: Json;
  try {
    const parsed = parseJsonc(text);
    if (!isObject(parsed)) throw new Error("not an object");
    config = parsed;
  } catch (err) {
    findings.errors.push(`wrangler.jsonc doesn't parse (${(err as Error).message}).`);
    return findings;
  }

  const previews = config.previews;
  if (!isObject(previews)) {
    findings.warnings.push(
      "wrangler.jsonc has no `previews` block, so this site has no staging. Branch builds " +
        "either fail or run with production's data (louise-toolkit ADR 0017).",
    );
    return findings;
  }

  for (const key of ["triggers", "routes"] as const) {
    if (key in previews) {
      findings.errors.push(
        `\`previews.${key}\` does nothing: ${key === "triggers" ? "Cron Triggers" : "routes"} ` +
          "target production only. Remove it; Preview hosts come from a route with " +
          "`previews_enabled` at the top level.",
      );
    }
  }
  if (isObject(previews.queues) && "consumers" in previews.queues) {
    findings.errors.push(
      "`previews.queues.consumers` does nothing: queue consumers can't target a Preview. Remove it.",
    );
  }

  for (const kind of STORAGE) {
    const staging = new Map(kind.get(previews).map((b) => [kind.name(b), b]));
    for (const prod of kind.get(config)) {
      const name = String(kind.name(prod));
      const preview = staging.get(kind.name(prod));
      if (!preview) {
        if (kind.optional)
          findings.ok.push(`previews: ${kind.what} \`${name}\` left out (${kind.optional})`);
        else
          findings.errors.push(
            `\`previews\` has no ${kind.what} \`${name}\`. A Preview inherits nothing, so code ` +
              `that reads \`env.${name}\` throws there. Bind it to a staging ${kind.what}.`,
          );
      } else if (kind.resource(preview) === kind.resource(prod)) {
        findings.errors.push(
          `\`previews\` binds ${kind.what} \`${name}\` to production's (${kind.resource(prod)}), ` +
            "so every branch would read and write production data. Bind it to a staging one.",
        );
      } else {
        findings.ok.push(`previews: ${kind.what} \`${name}\` bound to a staging resource`);
      }
    }
  }

  for (const key of API_BINDINGS) {
    if (!(key in config)) continue;
    if (key in previews) findings.ok.push(`previews: \`${key}\` binding present`);
    else
      findings.errors.push(
        `\`previews\` has no \`${key}\` binding. A Preview inherits nothing, so code that uses ` +
          "it throws there. Copy the binding into `previews`; it needs no staging resource.",
      );
  }

  const prodVars = isObject(config.vars) ? config.vars : {};
  const stagingVars = isObject(previews.vars) ? previews.vars : {};
  const missingVars = Object.keys(prodVars).filter((key) => !(key in stagingVars));
  if (missingVars.length) {
    findings.errors.push(
      `\`previews.vars\` is missing ${missingVars.map((v) => `\`${v}\``).join(", ")}. Vars aren't ` +
        "inherited, so each is undefined on a Preview. Give each a staging value.",
    );
  } else if (Object.keys(prodVars).length) {
    findings.ok.push(`previews: all ${Object.keys(prodVars).length} vars have a staging value`);
  }
  for (const key of ["SITE_URL", "MEDIA_URL"]) {
    if (key in prodVars && stagingVars[key] === prodVars[key]) {
      findings.errors.push(
        `\`previews.vars.${key}\` is production's (${String(prodVars[key])}), so a Preview ` +
          "links to or serves from production. Point it at staging.",
      );
    }
  }

  const previewHost = list(config.routes).find((r) => r.previews_enabled === true);
  if (previewHost)
    findings.ok.push(`previews: served on \`<name>.${String(previewHost.pattern)}\``);
  else
    findings.warnings.push(
      "No route has `previews_enabled`, so Previews are reachable only on workers.dev. Add a " +
        'preview-only custom domain: `{ "pattern": "staging.example.com", "custom_domain": true, ' +
        '"previews_enabled": true, "enabled": false }`.',
    );

  return findings;
}
