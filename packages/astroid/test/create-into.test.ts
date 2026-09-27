import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  addWorkspacePackage,
  INTO_REPOSITORY_FILES,
  intoPathProblem,
  intoRootScripts,
  intoScriptName,
  mergeRootScripts,
  workersBuildsSettings,
  workspaceCovers,
  workspacePackages,
} from "../../create-astroid/into.mjs";

const template = (path: string) =>
  readFileSync(new URL(`../../create-astroid/template/${path}`, import.meta.url), "utf8");

describe("create-astroid --into: the workspace", () => {
  it("reads block and flow lists, and a file with none", () => {
    expect(
      workspacePackages('packages:\n  - "workers/*"\n  # a comment\n  - apps/site\nfoo: 1\n'),
    ).toEqual(["workers/*", "apps/site"]);
    expect(workspacePackages("packages: ['workers/*', apps/site]\n")).toEqual([
      "workers/*",
      "apps/site",
    ]);
    expect(workspacePackages(template("pnpm-workspace.yaml"))).toBeNull();
  });

  it("knows when a glob already covers the path, honouring negations", () => {
    expect(workspaceCovers(["workers/*"], "workers/order")).toBe(true);
    expect(workspaceCovers(["workers/**"], "workers/apps/order")).toBe(true);
    expect(workspaceCovers(["workers/*"], "workers/apps/order")).toBe(false);
    expect(workspaceCovers(["./workers/*/"], "workers/order")).toBe(true);
    expect(workspaceCovers(["workers/*", "!workers/order"], "workers/order")).toBe(false);
    expect(workspaceCovers(["apps/*"], "workers/order")).toBe(false);
  });

  it("leaves a covering workspace byte-for-byte alone", () => {
    const yaml = "packages:\n  - workers/*\n";
    expect(addWorkspacePackage(yaml, "workers/order")).toBe(yaml);
  });

  it("appends to a block list at its own indentation, before what follows", () => {
    const yaml = "packages:\n    - workers/site\n\n# approvals\nallowBuilds:\n  workerd: true\n";
    expect(addWorkspacePackage(yaml, "workers/order")).toBe(
      "packages:\n    - workers/site\n    - workers/order\n\n# approvals\nallowBuilds:\n  workerd: true\n",
    );
  });

  it("appends to a one-line flow list", () => {
    expect(addWorkspacePackage('packages: ["workers/site"]\n', "workers/order")).toBe(
      'packages: ["workers/site", "workers/order"]\n',
    );
  });

  it("adds a list to a single-app root's file, keeping each comment with its key", () => {
    // The shape a repository scaffolded at its root has: settings, no list.
    const yaml = template("pnpm-workspace.yaml");
    const next = addWorkspacePackage(yaml, "workers/order")!;
    expect(workspacePackages(next)).toEqual(["workers/order"]);
    // The allowBuilds comment still sits directly above allowBuilds.
    expect(next).toMatch(
      /denying it skips the build rather than prompting on every install\.\nallowBuilds:/,
    );
    // And `overrides` stays the last key, which the smoke test appends to.
    expect(next.trimEnd().split("\n").at(-1)).toMatch(/^\s+ws:/);
  });

  it("refuses a list shape it can't edit safely", () => {
    expect(addWorkspacePackage("packages: [a,\n  b]\n", "workers/order")).toBeNull();
    expect(addWorkspacePackage("packages: *anchor\n", "workers/order")).toBeNull();
  });
});

describe("create-astroid --into: scripts and settings", () => {
  it("names the scripts after the app's directory, running from the root", () => {
    expect(intoScriptName("workers/order")).toBe("order");
    expect(intoRootScripts("order", "workers/order")).toEqual({
      "dev:order": "pnpm --dir workers/order run dev",
      "build:order": "pnpm --dir workers/order run build",
      "doctor:order": "pnpm --dir workers/order run doctor",
      "ship:order:production": "pnpm --dir workers/order exec astroid ship production",
      "ship:order:preview": "pnpm --dir workers/order exec astroid ship preview",
    });
  });

  it("never replaces a script the root already has", () => {
    const merged = mergeRootScripts(
      { build: "astroid build", "doctor:order": "echo mine" },
      intoRootScripts("order", "workers/order"),
    );
    expect(merged.scripts.build).toBe("astroid build");
    expect(merged.scripts["doctor:order"]).toBe("echo mine");
    expect(merged.skipped).toEqual(["doctor:order"]);
    expect(merged.added).toContain("build:order");
  });

  it("points the app's Workers Builds project at its own directory", () => {
    expect(Object.fromEntries(workersBuildsSettings("workers/order"))).toMatchObject({
      "Root directory": "workers/order",
      "Deploy command": "pnpm exec astroid ship production",
      "Production branch": "deploy/production",
    });
  });

  it("refuses a path outside the repository, or one a script would need to quote", () => {
    expect(intoPathProblem("workers/order")).toBeNull();
    expect(intoPathProblem("")).toMatch(/needs a path/);
    expect(intoPathProblem(".")).toMatch(/needs a path/);
    expect(intoPathProblem("../elsewhere")).toMatch(/outside/);
    expect(intoPathProblem("workers/my order")).toMatch(/may use only/);
  });

  it("keeps every repository file it skips in the template", () => {
    // A renamed template file would silently start landing inside the app.
    for (const path of INTO_REPOSITORY_FILES) expect(() => template(path)).not.toThrow();
  });
});
