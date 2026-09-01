---
title: Errors
description: Astroid error types.
sidebar:
  order: 15
---

`AstroidConfigError`—a config violates an invariant, at load/build time.

`AstroidUsageError`—a runtime helper was called with arguments that would
produce a silently wrong result (a checkout key with no identity, a catalog sync
where nothing landed). Distinct from the config error because it fires on a live
request, so a handler can catch it and return a 5xx.
