---
"astroidjs": minor
"create-astroid": minor
---

Every generated site now runs with the editor API gate on (louise-toolkit 0.30.0, ADR 0012), and new projects fetch their own zone through Cloudflare's front door.

**What changed.**
- **The generated `worker.ts` passes `gate: { resolveEditor }` to `composeWorker`.** Under `/api/louise`, a request must come from a signed-in editor unless it's headed for a route that marks itself public (the contact form and the vitals beacon already do). Every editor route still checks for itself; the gate is what catches one that forgets. Route responses also get the security headers the middleware adds to pages, since these routes answer before Astro runs.
- **The generated `middleware.ts` passes `apiGate: true`,** so `/api/louise` routes that reach Astro get the same check.
- **New projects' `wrangler.jsonc` sets `global_fetch_strictly_public`.** It's scaffold-once, so existing projects keep theirs.
- **Toolkit ranges move to `louise-toolkit ^0.30.0` and `@louise-toolkit/astro ^0.2.0`.** Read the toolkit's 0.30.0 changelog as well. In particular, provider errors (`UpstreamError`) now have safe-to-show messages, so log them with `upstreamLogLine(err)`. Webhook URLs must also be public https.

**What you have to do.** Run `astroid build` after upgrading, which regenerates `worker.ts` and `middleware.ts`. If you've added your own route under `/api/louise` that must answer without an editor session (a webhook receiver, say), mark it with `publicRoute(…)` in the worker, or list its path in the middleware's `apiGate: { isPublic }`. Otherwise it returns 401. To get the compatibility flag on an existing site, add `"global_fetch_strictly_public"` to `compatibility_flags` yourself, and then watch the next daily health scan. The site crawls its own domain, and the flag routes that crawl through your zone's firewall and bot rules. If a rule challenges it, the scan reports broken links that aren't really broken.
