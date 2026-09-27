---
"astroidjs": minor
"create-astroid": patch
---

The editor's AI assists can now route through AI Gateway, which is off until a site sets it. The generated worker passes `gateway: astroidAiGateway` to `aiRoute` and `seoFixRoute`. `astroidAiGateway(env)` reads the `AI_GATEWAY_ID` var and returns `{ id }`, or `undefined` when the var is unset, empty, or the placeholder, which keeps the direct Workers AI call. Before, no successful AI call was logged anywhere, with no latency, no error rate, and no cache. A gateway gives all three with no toolkit change.

- `astroidjs` exports `astroidAiGateway` and `ASTROID_AI_GATEWAY_VAR`. `astroidAiGateway` takes `env` as `unknown`, like the toolkit's `aiRunner`, so a site whose `CloudflareEnv` doesn't declare the variable still compiles.
- `create-astroid`: new scaffolds declare `"AI_GATEWAY_ID": ""` in `wrangler.jsonc` `vars` and `AI_GATEWAY_ID?: string` in `src/env.d.ts`.
- Alt text on upload stays direct, because `mediaRoute` has no gateway option.

**What to do:** run `astroid generate`. Nothing changes until you set the variable. To turn it on, create a gateway in the Cloudflare dashboard, say on the site's privacy page that the gateway's log holds the text editors send to the assists, then add `"AI_GATEWAY_ID": "<gateway id>"` to `vars` in `wrangler.jsonc`. If `wrangler.jsonc` has a `previews` block, add `"AI_GATEWAY_ID": ""` to `previews.vars` too, since `astroid doctor` requires every var there and an empty value keeps staging text out of the log.
