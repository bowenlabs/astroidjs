---
"create-astroid": patch
---

**A new project's toolkit ranges now start from the versions create-astroid was built against.** create-astroid wrote `louise-toolkit` and `@louise-toolkit/astro` into the scaffold's `package.json` as its own declared range, such as `^0.31.0`, even when it had installed and run against a newer patch such as 0.31.1. It now writes a caret on the installed version, `^0.31.1`, the same way it already wrote `astroidjs`.

The ranges accept the same minor as before, so a scaffold installs the same versions it did. Only the floor moves up to the patch create-astroid used.

**What to do:** nothing. An existing project keeps the ranges it was scaffolded with.
