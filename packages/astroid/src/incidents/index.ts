// Copyright (c) 2026 BowenLabs. Astroid is MIT licensed.
//
// Incident capture, Astroid's side (louise-toolkit ADR 0022, amended).
//
// louise-toolkit counts every failure into the site's own D1 and, optionally,
// Analytics Engine. What's opinion, and so lives here: that every Astroid site
// captures incidents by default, the binding and dataset names, the migration
// an existing site needs, and the Sentry sink. Sentry is the operator's issue
// system for a Monitored or Supported site; it's never the record, and it's
// never in louise-toolkit's zero-dependency core (ADR 0016 § 7).

export * from "./names.js";
export * from "./sentry.js";
