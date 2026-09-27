// Copyright (c) 2026 BowenLabs. Astroid is MIT licensed.
//
// The Sentry sink (louise-toolkit ADR 0022, amended): Sentry is the operator's
// issue system for a Monitored or Supported site. It's never the record, and
// never in louise-toolkit's zero-dependency core (ADR 0016 § 7).

import type { IncidentReport, IncidentSink } from "louise-toolkit/incidents";
import { readModuleSecret, type SecretSource } from "../secrets.js";

export interface SentryIncidentsOptions {
  /** A tag naming the site, so one Sentry organization can tell sites apart. */
  site?: string;
  /** Sentry's `environment`. Default `"production"`. */
  environment?: string;
  /** Injected for tests. */
  fetch?: typeof fetch;
}

/** A DSN's parts: `https://<key>@<host>/<project>`. */
interface Dsn {
  key: string;
  origin: string;
  project: string;
}

function parseDsn(dsn: string): Dsn | null {
  try {
    const url = new URL(dsn);
    const project = url.pathname.replace(/^\/+|\/+$/g, "");
    if (!url.username || !/^\d+$/.test(project)) return null;
    return { key: url.username, origin: `${url.protocol}//${url.host}`, project };
  } catch {
    return null;
  }
}

/** A Sentry stack frame, from one line of a V8 stack. */
interface Frame {
  function?: string;
  filename: string;
  lineno?: number;
  colno?: number;
  in_app: boolean;
}

const V8_FRAME = /^\s*at (?:(.+?) \()?(.+?)(?::(\d+))?(?::(\d+))?\)?$/;

/** The cause's stack as Sentry frames, oldest call first, or none. Function
 *  names and file positions only: no message, no values. */
function frames(cause: unknown): Frame[] {
  let stack: unknown;
  try {
    stack = (cause as { stack?: unknown } | null)?.stack;
  } catch {
    return [];
  }
  if (typeof stack !== "string") return [];
  const out: Frame[] = [];
  for (const line of stack.split("\n")) {
    if (!line.trimStart().startsWith("at ")) continue;
    const match = V8_FRAME.exec(line);
    if (!match) continue;
    const [, fn, filename, lineno, colno] = match;
    out.push({
      ...(fn ? { function: fn } : {}),
      filename: filename!,
      ...(lineno ? { lineno: Number(lineno) } : {}),
      ...(colno ? { colno: Number(colno) } : {}),
      in_app: !filename!.includes("node_modules"),
    });
  }
  return out.slice(0, 50).reverse();
}

/** The Sentry event for a report: its redacted message, its fingerprint, and the
 *  cause's stack frames. Never the raw message, the query string, or a body. */
export function sentryEvent(
  report: IncidentReport,
  cause: unknown,
  options: Pick<SentryIncidentsOptions, "site" | "environment"> = {},
): Record<string, unknown> {
  const stack = frames(cause);
  return {
    event_id: crypto.randomUUID().replace(/-/g, ""),
    timestamp: report.at / 1000,
    platform: "javascript",
    level: report.critical ? "fatal" : "error",
    logger: "louise",
    environment: options.environment ?? "production",
    ...(report.release ? { release: report.release } : {}),
    // One D1 row, one Sentry issue: Watchtower joins them on this.
    fingerprint: [report.fingerprint],
    tags: {
      louise_fingerprint: report.fingerprint,
      kind: report.kind,
      critical: String(report.critical),
      ...(options.site ? { site: options.site } : {}),
      ...(report.code ? { code: report.code } : {}),
    },
    ...(report.kind === "fetch" && report.host && report.path
      ? { request: { url: `https://${report.host}${report.path}` } }
      : {}),
    ...(report.path ? { transaction: report.path } : {}),
    exception: {
      values: [
        {
          type: report.name,
          value: report.message,
          ...(stack.length > 0 ? { stacktrace: { frames: stack } } : {}),
        },
      ],
    },
  };
}

/**
 * A sink that sends each report to Sentry, through its envelope endpoint, with
 * no SDK: `sendDefaultPii` has nothing to turn off, because nothing but the
 * redacted report and the stack's frames is sent. Dormant while the DSN is
 * unset or a placeholder, like every Astroid module.
 */
export function sentryIncidents<Env>(
  dsn: (env: Env) => SecretSource | undefined,
  options: SentryIncidentsOptions = {},
): IncidentSink<Env> {
  return async (report, { env, cause }) => {
    const source = dsn(env);
    if (source === undefined) return;
    const value = await readModuleSecret(source);
    const parsed = value ? parseDsn(value) : null;
    if (!parsed) return;
    const event = sentryEvent(report, cause, options);
    const body = [
      JSON.stringify({ event_id: event.event_id, sent_at: new Date().toISOString() }),
      JSON.stringify({ type: "event" }),
      JSON.stringify(event),
    ].join("\n");
    const response = await (options.fetch ?? fetch)(
      `${parsed.origin}/api/${parsed.project}/envelope/`,
      {
        method: "POST",
        headers: {
          "content-type": "application/x-sentry-envelope",
          "x-sentry-auth": `Sentry sentry_version=7, sentry_key=${parsed.key}, sentry_client=astroidjs`,
        },
        body,
      },
    );
    if (!response.ok) throw new Error(`Sentry answered ${response.status}`);
  };
}
