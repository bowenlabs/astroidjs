---
"astroidjs": minor
"create-astroid": patch
---

Astroid sanitizes stored rich text when it renders it, as well as when it's saved, so HTML stored before a sanitizer fix, or written around the pages collection's write hook, is covered without re-saving the page (ADR 0026).

- **New export:** `sanitizeAstroidRichHtml(html, { mediaBase })` from `astroidjs/components/rich-html`. It runs louise-toolkit's `sanitizeRichHtml` with the site's media base and memoizes the result per isolate, so a repeat render costs a lookup rather than a parse. Content the editor saved renders byte for byte.
- **Section components:** `splitImage`, `aboutIntro`, and `faq` render their rich text through it. `<Sections>` passes its `mediaBase` prop down to each section, and `SectionRenderProps` has a new optional `mediaBase`. A rich-text body that sanitizes to nothing no longer renders its wrapper, the same as an empty body.
- **`create-astroid`:** the scaffold's `src/pages/index.astro` and `src/pages/[...slug].astro` render `page.body` through it.

**What to do:** your page routes are your own once scaffolded, so make the same change there. In `src/pages/index.astro` and `src/pages/[...slug].astro`, replace `set:html={page.body}` with `set:html={sanitizeAstroidRichHtml(page.body, { mediaBase: env.MEDIA_URL })}`, imported from `astroidjs/components/rich-html`. Do the same for every `set:html` of stored rich text in your own components, such as a custom section's body, passing the `mediaBase` prop `<Sections>` gives each section. Pass `mediaBase={env.MEDIA_URL}` to `<Sections>` if you don't already.
