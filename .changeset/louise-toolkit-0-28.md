---
"astroidjs": minor
"create-astroid": minor
---

deps: `louise-toolkit` `^0.28.0`, `@louise-toolkit/astro` `^0.1.1`

Follows the toolkit's 0.28.0, which exports the `louise-toolkit/mcp` subpath that
0.27.0 announced. Nothing in astroid's own code changes.

**Why `minor` and not `patch`.** Pre-1.0 caret ranges are minor-locked, so a site
on `astroidjs ^0.9.x` with `louise-toolkit ^0.27.0` would pick up a 0.9.6 on its
next install — and with it a second, nominally distinct copy of `louise-toolkit`
under astroid, which is the "not assignable to type …louise-toolkit@0.27.0…"
failure ADR 0010's amendment records. A minor keeps the two bumps paired: a site
takes `astroidjs ^0.10.0` and `louise-toolkit ^0.28.0` together, or neither.
