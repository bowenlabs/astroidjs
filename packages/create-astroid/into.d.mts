// Copyright (c) 2026 BowenLabs. Astroid is MIT licensed.
//
// Types for into.mjs, so astroidjs's test suite (which type-checks without
// `allowJs`) can import it. Not published; nothing outside this repo imports
// create-astroid.

export declare const INTO_REPOSITORY_FILES: string[];
export declare function intoPathProblem(path: string): string | null;
export declare function workspacePackages(yaml: string): string[] | null;
export declare function workspaceCovers(patterns: string[], path: string): boolean;
export declare function addWorkspacePackage(yaml: string, path: string): string | null;
export declare function intoScriptName(path: string): string;
export declare function intoRootScripts(name: string, path: string): Record<string, string>;
export declare function mergeRootScripts(
  existing: Record<string, string>,
  scripts: Record<string, string>,
): { scripts: Record<string, string>; added: string[]; skipped: string[] };
export declare function workersBuildsSettings(path: string): [string, string][];
