---
"astroidjs": minor
---

`astroidMailTheme` takes every field of louise-toolkit's `MailTheme`, so a site can put its mail on the `"logo"` masthead without dropping the derived theme. Until now, `MailThemeOverrides` accepted only `palette`, `band`, `fonts`, `brand`, `radius`, `bandHeight`, and `buttonShape`, and a site that wanted `masthead`, `logo`, `mastheadBg`, `shadow`, `headlineSize`, `headlineWeight`, `contentPadding`, or `buttonAlign` had to build its whole `MailTheme` by hand.

- **Every shell field passes through.** `palette`, `fonts`, and `brand` still merge key by key; every other `MailTheme` field is used as given. The type follows `MailTheme`, so a field a later toolkit adds works here without an astroidjs release.
- **A logo resolves against the site's origin at send time.** `astroidMailTheme` takes a third argument, `{ siteUrl }`. A `logo.src` that's a path, such as `/brand/logo-mail.png`, resolves against it; an absolute URL is used as given. With no `siteUrl`, or a malformed one, the logo is dropped and the masthead draws the wordmark rather than a broken image. `sendInquiryMail` passes `env.SITE_URL`, and `AstroidMailEnv` gains an optional `SITE_URL`.

**Upgrading:** nothing changes unless you pass the new fields. A site that built its own `MailTheme` for the logo masthead can replace it with `astroidMailTheme(astroidConfig, { masthead: "logo", logo: { src: "/brand/logo-mail.png", width: 240, height: 65 }, … }, { siteUrl: env.SITE_URL })`, called at send time rather than import time, since `SITE_URL` differs per environment.
