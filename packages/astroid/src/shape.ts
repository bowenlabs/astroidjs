// Copyright (c) 2026 BowenLabs. Astroid is MIT licensed.
//
// The project's shape: a Louise-edited site, or an app with no pages to edit.
//
// Its own module, and dependency-free, because nearly every generator asks the
// question and `config.ts` imports some of them at runtime. A type-only import
// of the config keeps that from becoming a cycle.

import type { AstroidConfig } from "./config.js";

/**
 * Whether the project has a Louise editor: its routes, its sign-in, and the
 * content tables it edits. True unless the config sets `editor: false`.
 */
export function astroidHasEditor(config: AstroidConfig): boolean {
  return config.editor !== false;
}
