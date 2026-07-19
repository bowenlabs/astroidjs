# __BRAND_NAME__

An editable, multi-editor site on Cloudflare Workers — scaffolded with
[Astroid](https://github.com/bowenlabs/louise-toolkit) (Astro + Louise Toolkit).

The whole shape of this site lives in one typed config, [`astroid.config.ts`](./astroid.config.ts).
`src/schema.ts`, `src/worker.ts`, and `src/middleware.ts` are **generated** from it
(they carry a "do not hand-edit" banner) — run `pnpm generate` after any config
change, or just use `pnpm dev`/`pnpm build`, which regenerate first.

## Develop

```sh
pnpm install
cp .env.example .dev.vars   # local secrets for `astro dev`; fill SESSION_SECRET + OWNER_EMAIL
pnpm dev                    # astroid dev: regenerate, then astro dev
```

## Provision (first deploy)

Astroid wrote `wrangler.jsonc` with placeholder binding ids. Create the bindings
and fill them in:

```sh
wrangler d1 create __KEY__
wrangler r2 bucket create __KEY__-media
wrangler kv namespace create RL
wrangler kv namespace create DRAFTS
```

Set the secret(s):

```sh
wrangler secret put SESSION_SECRET     # openssl rand -base64 32
```

Apply the migrations (content + Better Auth), then seed your first editor:

```sh
wrangler d1 migrations apply DB --remote
OWNER_EMAIL=you@example.com pnpm seed:editors
```

## Editors & auth

Editors sign in with a magic link (passkeys supported) at `/api/auth`. The
allowlist is **DB-managed**: an admin `user` row *is* an editor. Seed the first
one above; add or remove the rest from the Users panel (backed by the generated
`editorsRoute`). There are no passwords and no editor list in env to keep in sync.

## Deploy

```sh
pnpm doctor         # validate config, bindings, and generated-file freshness
wrangler deploy
```

## Layout

| Path | What |
| --- | --- |
| `astroid.config.ts` | The one typed config — brand, archetype, sections. |
| `src/schema.ts` · `src/worker.ts` · `src/middleware.ts` | **Generated** — don't hand-edit. |
| `wrangler.jsonc` | Yours to edit — real binding ids, routes, secrets. |
| `src/auth.ts` | The editor auth seam (Better Auth, DB-managed editors). |
| `src/pages/` · `src/components/` · `src/layouts/` | Your Astro app. |
| `migrations/` | `0000_content.sql` (content + FTS) · `0001_auth.sql` (Better Auth). |
| `scripts/seed-editors.mjs` | Bootstrap the first editor. |
