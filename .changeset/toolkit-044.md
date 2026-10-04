---
"astroidjs": minor
"create-astroid": patch
---

Astroid moves to louise-toolkit 0.44 and @louise-toolkit/astro 0.10.0, which are security releases: a failed database query's bound values no longer reach any log, `onDegraded` event, incident row, incident sink, or re-thrown error.

- The `louise-toolkit` peer range is `^0.44.0`. `create-astroid`: new scaffolds get `louise-toolkit` `^0.44.0` and `@louise-toolkit/astro` `^0.10.0`.
- Before 0.44, a failed Drizzle query's message carried its SQL and its bound values, such as a customer's name, address, or notes. That message reached Workers Logs, the `incidents` table, and, with `incidents: { sentry: true }`, Sentry. Now every report reduces a failed query to its statement's kind and table, plus the first line of the database's own error, for example `Failed query: insert into inquiries. Cause: D1_ERROR: UNIQUE constraint failed: inquiries.email`.
- Astroid's Sentry sink needs no change. The toolkit now passes it a reduced copy of the error as `context.cause`, so the stack frames it sends can't carry a value.
- What 0.44 changes for an Astroid site:
  - **An unwrapped query error's incident is named `DrizzleQueryError`, not `Error`,** and gets a new fingerprint. The same query failing with different values is now one incident. The open row for a failing query stops counting, and a new row opens beside it; with Sentry, each opens a new issue. An incident for an error that wraps a query error, such as a `LouiseContentError`, keeps its name, code, and fingerprint.
  - **What the worker re-throws can be a copy.** When an error's `cause` chain holds a failed query, the generated worker and the Astro middleware re-throw a copy with the same class, `name`, `code`, and own fields, so `instanceof` checks still match, but an identity check (`err === thrown`) doesn't.
  - **Your own logging isn't covered.** An error your code logs or returns itself keeps the values. Wrap it with `loggableError` from `louise-toolkit/errors`: `console.error("…", loggableError(err))`.

**What to do:**

1. Upgrade `astroidjs`, `louise-toolkit` to 0.44, and `@louise-toolkit/astro` to 0.10.0 in the same install. Before 1.0, a caret range stays within one minor version, so a site that bumps only one side installs two copies of the toolkit, and a site on `^0.43` doesn't get this fix.
2. Check that `pnpm-lock.yaml` holds one `louise-toolkit` version: `grep '^  louise-toolkit@' pnpm-lock.yaml` prints one line.
3. If `incidents.critical`, a Sentry alert rule, or a saved search names `Error` to catch a query failure, change it to `DrizzleQueryError`.
4. Old incident rows and Sentry issues can still hold values. Resolve the old query-error rows in the `incidents` table, and resolve the matching Sentry issues. Delete a row or an issue if the values in it must be gone.
