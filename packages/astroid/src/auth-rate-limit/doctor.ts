// Copyright (c) 2026 BowenLabs. Astroid is MIT licensed.
//
// `astroid doctor`'s check on the auth rate-limit module. wrangler.jsonc is
// scaffold-once, so turning the module on in an existing project changes the
// generated worker (it re-exports the class) and nothing else: the binding, the
// migration, and the `rateLimitDo` line in each auth seam are the project's to
// add, and each one missing fails differently.

import type { AstroidConfig } from "../config.js";
import { parseJsonc, type PreviewsFindings } from "../project/previews.js";
import {
  ASTROID_AUTH_RATE_LIMIT_BINDING,
  ASTROID_AUTH_RATE_LIMIT_CLASS,
  ASTROID_AUTH_RATE_LIMIT_MIGRATION_TAG,
  usesAuthRateLimit,
} from "./scaffold.js";

interface WranglerDurableObjects {
  durable_objects?: { bindings?: { name?: string; class_name?: string }[] };
  migrations?: { tag?: string; new_classes?: string[]; new_sqlite_classes?: string[] }[];
}

/** An auth seam that calls `getLouiseAuth`, with its text, or null when absent. */
export interface AstroidAuthSeam {
  path: string;
  text: string | null;
}

/**
 * Check a `wrangler.jsonc` and the project's auth seams against the auth
 * rate-limit module. Returns nothing when the module is off.
 *
 * - No binding: an error. The generated worker exports the class either way,
 *   and the seams read `env.AUTH_RATE_LIMIT`, which is then undefined.
 * - A binding with no migration naming the class: an error, since wrangler
 *   refuses to deploy it.
 * - A seam that doesn't pass `rateLimitDo`: a warning. That instance still
 *   limits, but counts in KV or in memory, which undercount under a burst.
 */
export function checkAuthRateLimit(
  config: AstroidConfig,
  wrangler: string,
  seams: readonly AstroidAuthSeam[],
): PreviewsFindings {
  const findings: PreviewsFindings = { ok: [], errors: [], warnings: [] };
  if (!usesAuthRateLimit(config)) return findings;
  let parsed: WranglerDurableObjects;
  try {
    parsed = parseJsonc(wrangler) as WranglerDurableObjects;
  } catch {
    // The previews check already reports a wrangler.jsonc that doesn't parse.
    return findings;
  }

  const binding = (parsed.durable_objects?.bindings ?? []).find(
    (b) => b.name === ASTROID_AUTH_RATE_LIMIT_BINDING,
  );
  if (!binding) {
    findings.errors.push(
      `wrangler.jsonc has no Durable Object \`${ASTROID_AUTH_RATE_LIMIT_BINDING}\` binding, but the ` +
        "authRateLimit module counts in it. Add " +
        `{ "name": "${ASTROID_AUTH_RATE_LIMIT_BINDING}", "class_name": "${ASTROID_AUTH_RATE_LIMIT_CLASS}" } ` +
        "to `durable_objects.bindings`.",
    );
  } else if (binding.class_name !== ASTROID_AUTH_RATE_LIMIT_CLASS) {
    findings.errors.push(
      `wrangler.jsonc binds \`${ASTROID_AUTH_RATE_LIMIT_BINDING}\` to \`${binding.class_name}\`, ` +
        `but the generated src/worker.ts exports \`${ASTROID_AUTH_RATE_LIMIT_CLASS}\`.`,
    );
  } else {
    findings.ok.push(
      `wrangler: Durable Object \`${ASTROID_AUTH_RATE_LIMIT_BINDING}\` binding present`,
    );
  }

  const migrated = (parsed.migrations ?? []).some((m) =>
    [...(m.new_sqlite_classes ?? []), ...(m.new_classes ?? [])].includes(
      ASTROID_AUTH_RATE_LIMIT_CLASS,
    ),
  );
  if (migrated) {
    findings.ok.push(`wrangler: a migration creates \`${ASTROID_AUTH_RATE_LIMIT_CLASS}\``);
  } else {
    findings.errors.push(
      `wrangler.jsonc has no migration that creates \`${ASTROID_AUTH_RATE_LIMIT_CLASS}\`, and ` +
        "wrangler won't deploy a Durable Object class without one. Append " +
        `{ "tag": "${ASTROID_AUTH_RATE_LIMIT_MIGRATION_TAG}", "new_sqlite_classes": ["${ASTROID_AUTH_RATE_LIMIT_CLASS}"] } ` +
        "to the end of `migrations`.",
    );
  }

  for (const seam of seams) {
    if (seam.text === null || !/\bgetLouiseAuth\s*\(/.test(seam.text)) continue;
    if (/\brateLimitDo\s*:/.test(seam.text)) {
      findings.ok.push(`${seam.path} passes \`rateLimitDo\``);
    } else {
      findings.warnings.push(
        `${seam.path} calls \`getLouiseAuth\` without \`rateLimitDo\`, so that instance's rate ` +
          "limit counts in KV or in memory, which undercount under a burst. Add " +
          `\`rateLimitDo: env.${ASTROID_AUTH_RATE_LIMIT_BINDING}\` to its options.`,
      );
    }
  }
  return findings;
}
