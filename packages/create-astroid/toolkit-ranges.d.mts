// Copyright (c) 2026 BowenLabs. Astroid is MIT licensed.
//
// Types for toolkit-ranges.mjs, so astroidjs's test suite (which type-checks
// without `allowJs`) can import it. Not published; nothing outside this repo
// imports create-astroid.

export declare function toolkitRanges(
  resolveVersion?: (name: string) => string | undefined,
): Record<string, string>;
