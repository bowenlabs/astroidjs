---
"create-astroid": minor
---

scaffold: ARCHITECTURE, RUNBOOK and DECISIONS stubs under `docs/`

A new project gets three near-empty documents instead of an empty `docs/`. The
headings are not invented: three production Astroid sites each wrote the same
three files without coordinating, and their RUNBOOKs converged on the same
sections — local development, provisioning, deploy, migrations, secrets, common
breakages.

They ship as stubs, not prose. The value is the shape — a new site inherits the
questions it will have to answer rather than a blank page. `DECISIONS.md` carries
the list of choices Astroid deliberately leaves open (editors, rich-text storage,
sections, commerce, migrations, CSP, edge caching) to be deleted one at a time as
each becomes a real entry.

Nothing is required. Delete any of the three if a project does not want it.
