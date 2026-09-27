---
"astroidjs": patch
---

The generated `scheduled` handler now reports a failed site-health scan instead of discarding it. It used to run the scan with `.catch(() => {})`, so a scan that threw left no log line, and the Health panel kept showing the last good result with nothing to say it was stale. The handler now passes the error to louise-toolkit's `reportDegraded("health.scan", error)`, which logs one `[louise] degraded health.scan: …` line and reaches any `onDegraded` listener the site registers. A failed scan still doesn't retry the cron.

The comment on the generated `aiRoute` now names the toolkit's four rewrite modes (tighten, rephrase, simplify, and fix) instead of "rewrite/expand/shorten."

**What to do:** run `astroid generate` to rewrite `src/worker.ts`. To find failed scans in Workers Logs, search for `[louise] degraded health.scan`.
