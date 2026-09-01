# Runbook

Operating __BRAND_NAME__: local dev, migrations, secrets, deploy, and what to do
when something breaks.

> Scaffolded by `create-astroid`. The headings are the ones three production
> Astroid sites arrived at independently — fill them in as you go. A heading with
> nothing under it is a question you have not had to answer yet, which is useful
> information on its own.

## Local development

```sh
pnpm install
pnpm dev        # astroid dev — regenerates, then astro dev on workerd
```

The site renders from seed content with no configuration. To exercise the editor
locally, apply migrations and seed yourself as an editor:

```sh
pnpm exec wrangler d1 migrations apply DB --local
OWNER_EMAIL=you@example.com pnpm seed:editors
```

Then open `/louise` and request the magic link — in local dev it is **printed to
the dev console**, since there is no email binding. Follow it to `/?louise` for
edit mode.

## Provisioning (first deploy)

Create the resources, then paste the ids into `wrangler.jsonc`:

```sh
wrangler d1 create __KEY__
wrangler r2 bucket create __KEY__-media
wrangler kv namespace create RL
wrangler kv namespace create DRAFTS
```

<!-- Record anything that was NOT obvious: custom domains, DNS, account ids when
     more than one Cloudflare account is in play. -->

## Deploy

```sh
pnpm doctor     # validate config, bindings, and the generated files
wrangler deploy
```

<!-- Who deploys, from where, and what gates it? If deploys are automatic on push
     to main, say so here — that is the first thing a new person asks. -->

## D1 migrations

```sh
wrangler d1 migrations apply DB --remote
```

<!-- Migrations are hand-authored SQL under migrations/. Note the ordering rules
     you adopt, and anything that must be applied before a deploy rather than
     after. -->

## Seeding content

```sh
wrangler d1 execute DB --remote --file seed/home.seed.sql
```

<!-- What is seeded, what is authored in the editor, and which is authoritative
     when they disagree. -->

## Secrets

```sh
wrangler secret put SESSION_SECRET
```

<!-- Where each secret lives (wrangler secret, Secrets Store, a var in
     wrangler.jsonc) and who can rotate it. Never the values themselves. -->

## Editing the live site

<!-- Who the editors are and how they are added. Astroid ships DB-managed editors
     by default — `pnpm seed:editors` writes the first one — rather than an env
     allowlist. If you changed that, this is where it is written down. -->

## Common breakages

<!-- The section that pays for the whole document. Add an entry every time
     something surprises you, with the symptom FIRST — that is what someone
     searches for at the time.

     Format that works:
       **Symptom.** What you actually saw.
       Cause, and the fix. -->
