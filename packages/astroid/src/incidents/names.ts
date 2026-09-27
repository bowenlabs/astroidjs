// Copyright (c) 2026 BowenLabs. Astroid is MIT licensed.
//
// Incident capture's names and migration (louise-toolkit ADR 0022). No
// runtime imports, so the CLI's generators can read them without loading any
// louise-toolkit subpath.

import type { AstroidConfig } from "../config.js";

/** The Analytics Engine binding incident counts go to. */
export const ASTROID_INCIDENT_EVENTS_BINDING = "INCIDENT_EVENTS";

/** The version metadata binding a report's `release` comes from. */
export const ASTROID_VERSION_METADATA_BINDING = "CF_VERSION_METADATA";

/** The secret the Sentry sink reads its DSN from. */
export const ASTROID_SENTRY_DSN_SECRET = "SENTRY_DSN";

/** The incident counts dataset: `<key>_incidents`, apart from the Core Web Vitals one. */
export function astroidIncidentEventsDataset(config: AstroidConfig): string {
  return `${config.key.replace(/[^a-z0-9_]/gi, "_")}_incidents`;
}

/**
 * `migrations/0006_incidents.sql`: the `incidents` and `dead_letters` tables
 * (louise-toolkit/incidents). The same DDL drizzle-kit writes for them, with
 * `IF NOT EXISTS`, since a site that already added a table by hand must not
 * fail on it.
 */
export const ASTROID_INCIDENTS_MIGRATION = [
  "-- Incidents (louise-toolkit ADR 0022): one row per fingerprint, counted by the",
  "-- worker's d1Incidents sink and read by the Health panel and Watchtower. Dead",
  "-- letters: each message a queue gave up on, kept for a runbook to replay.",
  "-- Scaffolded by astroidjs.",
  "CREATE TABLE IF NOT EXISTS `incidents` (",
  "\t`fingerprint` text PRIMARY KEY NOT NULL,",
  "\t`kind` text NOT NULL,",
  "\t`name` text NOT NULL,",
  "\t`code` text,",
  "\t`message` text NOT NULL,",
  "\t`path` text,",
  "\t`host` text,",
  "\t`release` text,",
  "\t`critical` integer DEFAULT false NOT NULL,",
  "\t`count` integer DEFAULT 1 NOT NULL,",
  "\t`first_seen` integer NOT NULL,",
  "\t`last_seen` integer NOT NULL,",
  "\t`resolved_at` integer,",
  "\t`reopened_at` integer",
  ");",
  "CREATE INDEX IF NOT EXISTS `incidents_last_seen` ON `incidents` (`last_seen`);",
  "CREATE TABLE IF NOT EXISTS `dead_letters` (",
  "\t`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,",
  "\t`queue` text NOT NULL,",
  "\t`message_id` text NOT NULL,",
  "\t`body` text NOT NULL,",
  "\t`attempts` integer NOT NULL,",
  "\t`received_at` integer NOT NULL",
  ");",
  "CREATE INDEX IF NOT EXISTS `dead_letters_queue` ON `dead_letters` (`queue`);",
  "",
].join("\n");
