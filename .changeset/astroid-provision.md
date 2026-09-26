---
"astroidjs": minor
"create-astroid": minor
---

`astroid provision` creates the Cloudflare resources a site's `wrangler.jsonc` still names by placeholder, top level and `previews` alike, and writes each new ID back in place of its placeholder. It reads the name from the placeholder (`<run: wrangler d1 create acme-staging>`), so two bindings that share one placeholder share one namespace, and it creates every R2 bucket the file names, where an existing bucket is fine. It prints the Secrets Store secrets the config binds, for a person to set, and never deploys. `--dry-run` shows the plan; `--yes` skips the prompt.

New scaffolds name their KV placeholders for the project (`acme-rl`, `acme-drafts`) instead of `RL` and `DRAFTS`, so two sites in one Cloudflare account don't collide, and `astroid deploy` creates a namespace under the name its placeholder gives.

**What to do:** nothing for an existing site. To set up staging, upgrade, then run `pnpm exec astroid provision` in the site's directory with a wrangler login for its account.
