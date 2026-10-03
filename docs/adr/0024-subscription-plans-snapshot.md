# ADR 0024—Subscription plans snapshot: one KV key, one writer, many readers

- **Status:** Proposed (2026-10-03)
- **Deciders:** Baylee (solo maintainer)
- **Related:** #111, the catalog snapshot, which should follow or extend this
  record; ADR 0023, the precedent for a KV contract in `commerce`;
  `listSubscriptionPlans` in `louise-toolkit/commerce/square`; ADR 0022 in
  louise-toolkit (incident capture), which the fallbacks report to
- **Scope:** `packages/astroid/src/commerce/subscription-plans.ts` and
  `alsoRefresh` on `astroidQueueHandler`

## Context

A site that sells Square subscriptions shows a subscribe option on a product
page. The plans that option comes from live in Square's catalog, and a catalog
search is too slow to run on every render, so a site keeps them in KV beside its
catalog snapshot and rewrites them when the catalog refreshes.

That snapshot is read by more than the app that writes it. A coffee shop can run
its site and its order app as two Workers over one KV namespace: the site runs
the commerce pipeline (webhooks, the queue, the hourly cron) and the order app
runs under `commerce.pipeline: false`, with no queue and no cron. The order app
reads what the site writes. A key the two apps happen to agree on breaks
silently the day either one changes it, so the key, the shape behind it, and
who writes it are a contract.

A site already writes this snapshot from its own code, under
`square:subscription-plans:v1:<environment>:<location>`.

## Decision

### 1. One key, built by one function

`subscriptionPlansSnapshotKey({ environment, locationId })` builds
`square:subscription-plans:v1:<environment>:<location>`. An empty environment
keys as `sandbox` and an empty location as `none`. The writer and every reader
call it, through `subscriptionPlansSnapshot`, and nothing else builds the key.

The environment is in the key so a switch from sandbox to production starts
from an empty snapshot instead of serving sandbox plan IDs to a production
checkout. The location is in the key because a plan's presence is per location.

### 2. The version moves with the shape

The value is the JSON array that `listSubscriptionPlans` returns. A change to
what's stored, whether the toolkit's plan type or anything Astroid adds, moves
the key to `v2`. Old values are never migrated: they expire, and the first read
of the new key is a miss that refreshes. Because one function builds the key, a
release moves the writer and every reader to the new version together.

### 3. The key matches what sites already write

The first version is byte-for-byte the key a site wrote before Astroid owned
it, including the `sandbox` and `none` defaults. A site that upgrades keeps its
warm snapshot, and an order app on the new release reads what a site on the old
one wrote, so the two Workers can deploy in either order.

### 4. Two hours by default, never under KV's floor

`ttlSeconds` is 7,200 by default: two runs of the hourly cron, so one failed
refresh doesn't empty the snapshot. It must be a whole number of at least 60,
KV's floor, or `subscriptionPlansSnapshot` throws `AstroidUsageError` when it's
built rather than KV refusing the first write.

### 5. One writer, many readers

The app that runs the commerce pipeline writes the snapshot, through
`alsoRefresh` on `astroidQueueHandler`. It runs wherever `refreshCatalog` runs,
so the cron and a plan edit in Square both reach it, and a failure is reported
and never thrown, so it can't send a good catalog refresh into retry.

An app under `commerce.pipeline: false` builds the same snapshot over the same
binding and calls `read` or `get`. On a cold miss `get` refreshes and writes,
so a reader isn't stuck on an empty list until the next cron. That write is the
same value under the same key, so a reader that writes doesn't compete with the
writer.

### 6. Every fallback is reported

A KV read failure is a miss, a failed write still returns the plans, and a
Square failure in `get` returns `[]` so the page renders without the subscribe
option. Each reports through `reportDegraded` under
`commerce.subscriptionPlans.read`, `.write`, or `.refresh`, and a failed
`alsoRefresh` entry under `queues.alsoRefresh.<name>`, so incident capture sees
a fallback that fires every hour even though no request fails.

## Alternatives considered

- **Leave the key to each site.** Rejected: two Workers agreeing on a string by
  convention is the contract this record exists to make explicit.
- **Store the plans in D1, beside the catalog mirror.** Rejected for now: the
  plans are a small read-mostly list, every project has KV, and a miss refreshes
  from Square in one call.
- **A new key format for the first Astroid version.** Rejected: every site that
  upgrades would start cold, and a site and an order app on different releases
  would read different keys.
- **Run the plans refresh inside `refreshCatalog`.** Rejected: a plans failure
  would retry a good catalog refresh, or every site would wrap it in its own
  `catch` that only logs.

## Consequences

- #111's catalog snapshot should follow this record (a versioned key from one
  builder, environment and location as parameters, a configurable TTL, one
  writer and readers under `pipeline: false`) or extend it to cover both.
- A change to the stored shape is a key bump, so it ships in a minor that every
  app reading the snapshot has to take.
- The key carries no project key, so two projects that share a KV namespace and
  sell from the same Square account and location share a snapshot. That's the
  intent for a site and its order app. Two unrelated projects shouldn't share a
  namespace.
