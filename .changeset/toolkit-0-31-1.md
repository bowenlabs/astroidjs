---
"astroidjs": patch
"create-astroid": patch
---

On louise-toolkit 0.31.1 and @louise-toolkit/astro 0.2.3.

astroidjs now requires louise-toolkit `^0.31.1` as a peer. `settings.hooks` hands `settingsRoute` a `sanitize` map that 0.31.0 ignores without an error, so on the older toolkit a site would believe its settings were cleaned when they weren't.

0.31.1 also runs a collection's access check and `beforeChange` hooks on a buffered draft save, so a bad buffered write answers 422 instead of 200. Its buffer keys move to `draft:v2:`, so an edit that was only in the buffer when a site deploys (the last 10 seconds or so of an editing session) isn't resumed; the page resumes from its latest D1 draft.

New scaffolds from create-astroid get the new toolkit ranges. To upgrade an existing site, bump `louise-toolkit`, `@louise-toolkit/astro`, and `astroidjs` together, then run `astroid generate`.
