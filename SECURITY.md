# Security policy

## Supported versions

Astroid is **pre-1.0**. Only the latest published version of each package
receives fixes; there are no backports to earlier minors.

| package          | supported         |
| ---------------- | ----------------- |
| `astroidjs`      | latest minor only |
| `create-astroid` | latest minor only |

Pre-1.0 means a breaking change ships as a **minor**, so a security fix may
arrive alongside one. Read the changelog before upgrading.

`louise-toolkit` and `@louise-toolkit/astro` are released from
[bowenlabs/louise-toolkit](https://github.com/bowenlabs/louise-toolkit) and have
their own policy. Astroid depends on both, so an advisory there usually reaches a
site through here.

## Reporting a vulnerability

Please report privately rather than opening a public issue:
**[Report a vulnerability](https://github.com/bowenlabs/astroidjs/security/advisories/new)**.

Include what makes it reproducible — affected version, a minimal case, and what
an attacker gets. You'll get an acknowledgement within a few days. This is a
small project with a single maintainer, so please allow reasonable time before
disclosing publicly.

## What's in scope

The two published packages, and the code `create-astroid` writes into a new
project. That second one deserves saying plainly: **a scaffold defect ships to
every site generated afterwards**, which makes the template a larger surface than
its size suggests. The sharp edges:

- **Generated worker and middleware.** `astroid generate` writes the route table,
  the session handling and the rate rules. A gap there is a gap in every site.
- **The scaffolded auth seam.** `src/auth.ts` and the editor gate — DB-managed
  editors, magic links, and the first-editor seeding script.
- **Checkout and money paths.** `verifyCheckout`, idempotency keys, and anything
  that decides a price server-side.
- **Section rendering.** Sections take editor-supplied content; the sanitizer
  boundary is where that becomes markup.
- **Tenancy.** Host-based routing that decides which site's data a request sees.

Out of scope: the documentation site, findings that need a compromised Cloudflare
account or an already-authenticated editor acting within their permissions, and
dependency advisories with no reachable call path.

## How dependency advisories are handled

Fixes go in `pnpm-workspace.yaml` under `overrides`, **scoped to the affected
major** (`js-yaml@4`, not `js-yaml`). A bare package-name key overrides every
dependent regardless of the range it asked for, which has broken a sibling repo
once: an unscoped pin handed a 4.x to a package requiring `^3.6.1`, taking out
its entire release tooling until someone tried to ship. Each entry carries the
advisory id and the reasoning.
