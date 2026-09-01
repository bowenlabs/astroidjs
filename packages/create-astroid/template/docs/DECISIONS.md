# Decisions

Choices __BRAND_NAME__ made that the framework deliberately leaves open, and why.

> Scaffolded by `create-astroid`. This is the document that ages best, because a
> decision's *reasoning* is the part nobody can reconstruct later. Record the
> choice when you make it, while the alternatives are still fresh.
>
> Not an ADR log — no status field, no numbering ceremony. One heading per
> decision, newest at the top, and a line about what you did instead.

## Template

```md
## <the decision, as a statement>

<What was chosen, in one or two sentences.>

**Why.** The reason that actually drove it — the constraint, the incident, the
thing that would have gone wrong otherwise.

**Instead of.** The alternative that was genuinely considered, and what it would
have cost. If there wasn't one, say so; "no real alternative" is a finding.
```

## Questions this site will have to answer

Delete each one as it becomes a real entry above. Every Astroid site meets these,
and the framework takes no position on any of them:

- **Editors** — DB-managed rows, or an environment allowlist? One auth instance
  or two, if customers sign in as well?
- **Rich text storage** — HTML or document JSON? This is very hard to change
  later; the sites that picked HTML did it for portability and said so.
- **Sections** — the shipped library as-is, fixed slots, or bespoke sections
  injected into the catalog?
- **Commerce** — none, or which provider? If there is a catalog: live reads, or a
  D1 mirror? Where money is calculated, and what makes that server-authoritative.
- **Migrations** — hand-authored SQL is the default. If you adopt a generator,
  write down what happens to the existing hand-authored files.
- **Content security policy** — generated, or hand-maintained in
  `astro.config.mjs`? A section that needs an inline style forces this question.
- **Edge caching** — off by default. Turning it on has a revalidation story that
  belongs here, not in a commit message.
- **Service worker / PWA** — a manifest is cheap; a service worker is a cache
  invalidation problem you now own.
