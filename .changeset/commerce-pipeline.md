---
"astroidjs": minor
---

A project can take payments without running the commerce pipeline, with `commerce: { provider: "square", pipeline: false }`. Before, `commerce` switched on the webhook receiver, the queue consumer, and the hourly catalog re-sync together, so a second app that only charges cards had to carry all three, or drop Astroid's CSP origins and checkout rate rule to avoid them.

- `pipeline: false` keeps the provider's CSP origins, the checkout rate rule, and the scaffolded checkout route and card component.
- It drops the webhook receivers, the queue and its consumer, and the catalog cron. `astroidCommercePipeline(config)` reports which a project runs.
- The webhook signing secret leaves the secret roster, `.env.example`, and the dormancy gate, so checkout goes live on the API credentials alone.
- `defineAstroid` refuses `queues.cron` alongside it, because that cron schedules the re-sync the option turns off.

**What to do:** nothing unless you want it. The default is unchanged: `commerce` still runs the pipeline. To turn it off in an existing project, set `pipeline: false`. Then delete the scaffolded `src/queue.ts` and `src/pages/api/webhooks/*`, and remove the `queues` block from `wrangler.jsonc`, since `astroid generate` never deletes a file you own.
