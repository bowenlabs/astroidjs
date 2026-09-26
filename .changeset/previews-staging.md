---
"astroidjs": minor
---

Astroid now supports staging through Cloudflare's Worker Previews, where `main` and every pull request run as Previews of one Worker (louise-toolkit ADR 0017).

- **The media base is per environment.** The generated `worker.ts` reads `env.MEDIA_URL` on each request and falls back to `deploy.mediaBase`, instead of baking the base in. One build serves production and every Preview, so nothing that differs between them can be a constant. The media route serves either an origin base (a media host, where the whole path is the R2 key) or a path base such as `/media` on the site's own host, which is what a Preview uses, since it can't know its hostname in advance. The settings route gets the same per-request base.
- **`astroid doctor` checks the `previews` block** of `wrangler.jsonc`. It fails a binding that production has and the block leaves out (a Preview inherits nothing, so the Worker throws there), a binding that points at production's database, bucket, namespace, or secret, a var that isn't restated or whose `SITE_URL` or `MEDIA_URL` is still production's, and crons, routes, or queue consumers inside the block, which target production only. Leaving out a queue producer or a Workflow passes: Previews can't consume them, and the toolkit falls back. A site with no `previews` block gets a warning, not a failure.

**What to do:** run `astroid generate` after upgrading, and commit the regenerated `worker.ts`; `doctor` reports it as stale until you do. Nothing changes at runtime for a site whose `MEDIA_URL` matches its `deploy.mediaBase`, which is every site today.
