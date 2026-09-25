---
"create-astroid": patch
---

New projects declare `louise-toolkit` `^0.31.1` and `@louise-toolkit/astro` `^0.2.3`, up from `^0.31.0` and `^0.2.2`. 0.31.1 runs the collection's hooks on a draft save that the `DRAFTS` buffer absorbs, so an invalid write answers 422 instead of 200, and adds sanitize and read hooks to `settingsRoute`. The adapter's 0.2.3 depends on exactly 0.31.1, so a project gets one copy of the toolkit.

An existing project's ranges already accept both versions: refresh its lockfile to pick them up. Buffer keys move to `draft:v2:`, so an edit that was only in the buffer at deploy time isn't resumed; the page resumes from its latest D1 draft.
