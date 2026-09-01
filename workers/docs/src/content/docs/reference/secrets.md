---
title: Secrets
description: The secret-resolution convention.
sidebar:
  order: 12
---

`readModuleSecret`, `resolveModuleSecrets`, `ASTROID_SECRET_PLACEHOLDER`,
`astroidSecretNames`, `astroidModuleStatus`, `describeAstroidStatus`.

The dormant-until-provisioned convention: a module whose secrets are
unprovisioned renders, serves, says it's simulated, and never calls upstream.
Partial provisioning counts as dormant—a half-configured integration fails
mid-checkout rather than at boot.
