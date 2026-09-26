---
"astroidjs": patch
---

Eleven error messages now follow the Google developer documentation style, the same as the rest of the prose in the package: no spaced dash, and "for example" rather than `e.g.`. They're the config errors for `crons`, `tenancy`, `portal.gated`, `portal.cookiePrefix`, `portal.tablePrefix`, and a commerce provider put in a role it can't serve, plus the error a catalog sync throws when every item fails. That last one now reads "all 3 items" or "the only item" instead of `3 item(s)`.

Only the wording changed. Every message still names the same setting, value, and fix, and the error classes are the same.

**What to do:** nothing, unless something of yours matches an error's exact text. A test that matches a phrase such as "already belongs to", "must be a wildcard", "single subdomain label", or "can't serve" still passes. One that matches a whole message, including a dash, needs the new text.
