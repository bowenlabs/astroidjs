---
title: Generators
description: What `astroid generate` writes, and what it never touches.
sidebar:
  order: 14
---

The functions behind the `astroid` CLI and `create-astroid`. You rarely call these
directly.

`generateAstroidProject` returns the regenerated trio (`src/schema.ts`,
`src/worker.ts`, `src/middleware.ts`). `generateAstroidScaffoldFiles` returns every
**scaffold-once** file the config implies—written when absent, never
overwritten. Sharing that one list between the CLI and the scaffolder is what lets
`astroid generate` complete a config change that adds a module.

Also: `generateAstroidWrangler`, `generateAstroidSchema`, `generateAstroidWorker`,
`generateAstroidMiddleware`, `astroidEditorRoutePlan`, `generateServiceWorker`,
`generateWebManifest`, `generateMapTileRoute`, `generateAstroidPortalAuth`.
