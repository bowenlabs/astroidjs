---
"astroidjs": minor
"create-astroid": minor
---

Every generated worker captures incidents (louise-toolkit ADR 0022), and needs louise-toolkit 0.37.0 and @louise-toolkit/astro 0.6.0:

- **The generated worker** passes `composeWorker` an `onIncident` that counts each failure into the site's D1 `incidents` table and the `INCIDENT_EVENTS` Analytics Engine dataset, with the release from `CF_VERSION_METADATA`. Both bindings are optional; a site whose `wrangler.jsonc` predates them still type-checks.
- **The schema** re-exports `incidents` and `dead_letters`, and `astroid generate` scaffolds `migrations/0006_incidents.sql` for them. An app whose database another app migrates (`deploy.migrations: false`) gets neither.
- **The queue consumer** routes the commerce dead-letter queue's batches to louise-toolkit's `deadLetterConsumer`, which keeps each message and counts it (#43), and passes `processBatch` the queue's `maxRetries`, so a message's last failed delivery counts as an incident.
- **`incidents` in `defineAstroid`:** `critical` lists what alerts, and `sentry: true` adds the new `sentryIncidents` sink, which sends each incident to Sentry with its stack and no SDK, dormant until `SENTRY_DSN` holds a real DSN.
- **A new project's `wrangler.jsonc`** binds `INCIDENT_EVENTS` and `CF_VERSION_METADATA`, and consumes the dead-letter queue. `wrangler.jsonc` is scaffold-once, so an existing site adds these by hand; the modules guide has each line.

Run `astroid generate` after upgrading, then apply the new migration.
