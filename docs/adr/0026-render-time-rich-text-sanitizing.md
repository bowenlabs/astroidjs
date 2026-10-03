# ADR 0026—Stored rich text is sanitized when it renders, too

- **Status:** Proposed (2026-10-03)
- **Deciders:** Baylee (solo maintainer)
- **Related:** ADR 0010 in louise-toolkit (the editable-node model), whose
  write path sanitizes rich text by the section catalog; louise-toolkit 0.43,
  whose sanitizer parses with parse5
- **Scope:** `packages/astroid/src/components/rich-html.ts`, the section
  components that render rich text, and the scaffold's page routes

## Context

The pages collection sanitizes rich text when it's written: `body` through the
collection's `beforeChange` hook and the raw `pagesRoute`'s `sanitize` seam, and
each section's rich-text fields through `sanitizeAstroidPageSections`. Every
render then trusted what was stored and passed it to `set:html` as it was.

That trust holds only for what's written after the sanitizer it ran. louise-toolkit
0.43 replaced a sanitizer that a rebuilt tag (`<scr<link/x>ipt>`), an
unescaped quote in an attribute, or a `<meta http-equiv="refresh">` could get
through. HTML stored before the upgrade keeps those shapes until the page is
saved again, and so does HTML that reached the table without the hook, such as
a seed file, a SQL console, or a script.

The first plan was an upgrade step: re-save every page once. A step every site
has to remember is one some site misses, and nothing reports the miss. The page
renders fine.

## Decision

### 1. Astroid sanitizes stored rich text when it renders it

`sanitizeAstroidRichHtml(html, { mediaBase })` runs louise-toolkit's
`sanitizeRichHtml` with the media base the write used. Every render of stored
rich text goes through it: the section components' rich-text fields
(`splitImage` and `aboutIntro` bodies, `faq` answers) and the page body in the
scaffold's `index.astro` and `[...slug].astro`. A test reads each `set:html` in
the components and the template and fails on one that skips it. JSON-LD isn't
rich text: `escapeJsonLd` escapes it for its `<script>`.

The write-time sanitize stays. It's what keeps hotlinked images and disallowed
markup out of storage, out of the editor, and out of anything else that reads
the table. Render-time sanitizing is a second layer.

### 2. The media base is passed in, not guessed

The write checks images against the running deployment's `MEDIA_URL`. A render
gets it as `mediaBase`: the page routes pass `env.MEDIA_URL`, and `<Sections>`
passes its own `mediaBase` prop down through `SectionRenderProps`. Without one,
the render keeps any safe image `src` rather than assuming `/media`, because a
wrong base would drop every image on a site that serves media from its own
host.

The helper ships as source with the components, so it can't read the base the
generated worker records with `setAstroidMediaBase`: that state lives in the
compiled entry, a module the components don't import.

### 3. Results are memoized per isolate

Sanitizing parses every field on every render. On a page with nine rich-text
fields and about 3,500 characters, that's about 180 µs of CPU per render in
Node on a laptop. So the helper keeps a least-recently-used memo of up to 256
results, keyed by the media base and the input, and capped at two million
characters in total, and it skips a field over a quarter of a million. A memo
hit costs about 3 µs for the same page.

The output is a pure function of the input and the base, so a memo shared by
every request in an isolate can't show one request's content to another.

### 4. Sites with their own templates call it too

The helper is exported as `astroidjs/components/rich-html`. The scaffold's page
routes are the site's own once scaffolded, so an existing site changes its
`set:html={page.body}` to call the helper, and a site's own section component
that renders rich text does the same.

## Consequences

- Stored HTML is covered by the sanitizer the site runs today, with no re-save.
  A future sanitizer fix reaches stored content on deploy.
- Content the write hook stored renders byte for byte: the sanitizer's output
  is its own fixed point, and a test holds that for representative editor
  output.
- A section's rich-text body that sanitizes to nothing no longer renders its
  wrapper, the same as an empty body.
- Coverage depends on every renderer calling the helper. The test guards
  Astroid's components and the template, and nothing guards a site's own
  components.

## Alternatives considered

- **Re-save every page on upgrade.** Covers only the sites that do it, and only
  until the next time HTML reaches the table around the hook.
- **Sanitize the whole `sections` array in `<Sections>` by the catalog.** Covers
  a site's own section components without their help, but only for fields the
  catalog types as rich text. ADR 0010 records a site whose components rendered
  nine fields as rich text that the catalog typed as plain, and block fields go
  unsanitized when a site's block catalog isn't passed. Sanitizing where
  `set:html` is written keys off what's rendered, not what's declared.
- **Sanitize in the site's `readPage`.** Template code, so existing sites don't
  get it, and it would cover only the body.
