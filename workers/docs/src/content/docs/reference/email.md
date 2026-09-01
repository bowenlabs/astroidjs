---
title: Email
description: Transactional email and its templates.
sidebar:
  order: 8
---

`sendTransactional`, `resolveMailer`, `resolveMailerStatus`, `createMailer`,
`astroidMailTheme`, and the templates `magicLinkEmail`, `passwordResetEmail`,
`inquiryNotificationEmail`, `inquiryConfirmationEmail`, `sendInquiryMail`.

Always build options with **`resolveMailer(env)`** rather than by hand—it's the
only thing that applies the placeholder-sentinel check, so a hand-built options
object can call the Email API with an envelope sender of literally
`DUMMY_REPLACE_ME`.

When a send is skipped the message is logged, but the **body is withheld unless
the environment reads as development**—it carries single-use sign-in and reset
links, and `logOnly` engages in production whenever `MAIL_FROM` is unset. Pass
`devLog: true` to force it (for example, under bare `wrangler dev`).
