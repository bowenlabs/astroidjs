---
"astroidjs": patch
---

`subscriptionPlansSnapshot` and `alsoRefresh` on `astroidQueueHandler` report their fallbacks through `reportDegraded` from `louise-toolkit/errors`, so incident capture counts them. In 0.26.0 they logged with a bare `console.error`, which only reached Workers Logs, and a plans refresh that failed every hour left no record.

| Fallback                                       | Name                                 | Served              |
| ---------------------------------------------- | ------------------------------------ | ------------------- |
| KV read fails, or the value isn't a JSON array | `commerce.subscriptionPlans.read`    | a miss              |
| KV write fails                                 | `commerce.subscriptionPlans.write`   | the fetched plans   |
| Square fails inside `get`                      | `commerce.subscriptionPlans.refresh` | `[]`                |
| An `alsoRefresh` entry fails                   | `queues.alsoRefresh.<name>`          | the next entry runs |

The log line changes. `[<name>] refresh failed: <message>` and `[astroid:commerce] subscription plans … failed` become `[louise] degraded <name>: <cause>`, and an `UpstreamError` cause still carries Square's operation, status, and detail. `ASTROID_SUBSCRIPTION_PLANS_DEGRADED` and `ASTROID_ALSO_REFRESH_DEGRADED` export the name prefixes.

If a log search or alert matches the old lines, match `degraded commerce.subscriptionPlans.` and `degraded queues.alsoRefresh.` instead, or listen with `onDegraded`. Nothing else changes. ADR 0024 records the snapshot's key and its one-writer, many-readers contract.
