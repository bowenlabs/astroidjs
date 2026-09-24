---
"astroidjs": patch
"create-astroid": minor
---

**The scaffolded sign-in page no longer strands a second "email me a link".** A Turnstile token is single-use, and `login.astro` never asked for a fresh one. After the first send, every later send (a typo'd address, "didn't get it, send again") posted the spent token. Better Auth's captcha plugin refused it, and the page said "a sign-in link is on its way" anyway, because it never read the response.

The page now renders the widget with `renderTurnstile` (`louise-toolkit/forms/turnstile`) and resets it after every send. A failed request (a captcha refusal, a rate limit or an outage) says "please try again" instead of claiming success. A non-editor address still gets the same response as an editor's, so the page reveals nothing about who is an editor. If Turnstile's script can't load, the page says so before the owner types anything.

Existing projects: `login.astro` is scaffolded once and yours to edit, so this reaches new projects only. To take the fix, copy the new page's `<script>` and the `#captcha` element from a fresh scaffold.

Turnstile's CSP origins now come from `turnstileCsp()` too, like Square's. Same three hosts, so nothing changes in the policy.

Both packages now require `louise-toolkit` `^0.30.1`, the release that adds the `forms/turnstile` subpath. create-astroid also requires `@louise-toolkit/astro` `^0.2.1`, the adapter release built against it.
