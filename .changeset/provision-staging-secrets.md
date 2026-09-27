---
"astroidjs": minor
"create-astroid": patch
---

`astroid provision` now creates the two staging secrets that need no person, so nobody sets them by hand. It reads them from the `secrets_store_secrets` of the `previews` block in `wrangler.jsonc`, by binding name, and uses each entry's `store_id` and `secret_name`:

- **`SESSION_SECRET`** gets a new random value, generated for that site. It's never production's value.
- **`TURNSTILE_SECRET`** gets Cloudflare's Turnstile test secret, `1x0000000000000000000000000000000AA`, which passes every token.

It lists each store first and skips a secret that already exists, so a re-run is safe and never replaces a value. It never prints a value, and it passes each one to wrangler directly rather than through a shell. It never touches a production secret. Every other secret is printed as a `wrangler secrets-store secret create` command, as before. `--dry-run` shows each staging secret as "will create" or "exists" and creates nothing, and a run that has something to create asks first unless you pass `--yes`.

Every command runs against the account that `account_id` in `wrangler.jsonc` names, which wrangler prefers to `CLOUDFLARE_ACCOUNT_ID`, and the plan now says so when the two disagree. If provision can't list a store, it creates nothing in it, prints those secrets with the others, and exits 1.

- `astroidjs` exports `stagingSecretSteps`, `secretNamesFromList`, `ASTROID_STAGING_SECRET_VALUES`, and `TURNSTILE_TEST_SECRET`, and a `ProvisionSecret` carries `create` when provision creates it.
- `create-astroid`: the scaffolded `docs/RUNBOOK.md` says which secrets provision creates.

**What to do:** nothing. The next `pnpm exec astroid provision` creates whichever of the two a site's `previews` block binds and its store lacks. A staging secret you already set by hand is left alone.
