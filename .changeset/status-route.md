---
"astroidjs": minor
"create-astroid": patch
---

Every generated worker now mounts louise-toolkit's `statusRoute` at `/api/louise/status`, so an outside probe can tell whether a site is up. It's a public route under ADR 0012, so an anonymous request passes the API gate. It answers 200 when every check passes and 503 when any fails, throws, or times out, with `Cache-Control: no-store`, and reports each check as a boolean, never as error text. Repeated probes reuse one result per isolate for 10 seconds.

Astroid supplies two checks:

- **`d1`**: the `DB` binding answers `SELECT 1`.
- **`content`**: the home page's `pages` row exists, so the site serves real content rather than the seed-me prompt. It fails on an unseeded database, or one whose migrations never ran.

A site adds its own checks with `status: { checks: true }` in `defineAstroid`. That scaffolds `src/status-checks.ts` once, and the worker spreads its `statusChecks` after Astroid's two. The scaffolded file shows an `ageCheck` on the last health scan as an example.

- `create-astroid`'s scaffolded `docs/RUNBOOK.md` gains an "Is it up?" section with the probe URL.
- The `louise-toolkit` peer range is unchanged: `statusRoute` and `d1Check` ship in 0.34.0.

**What to do:** run `astroid generate`. A site that hasn't seeded its home page answers 503 until it does, since that site serves the seed-me prompt rather than content. To watch a site from outside, point your uptime monitor at `https://<your-host>/api/louise/status`.
