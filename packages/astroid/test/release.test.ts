import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { ASTROID_DEPLOY_BRANCH, generateAstroidReleaseWorkflow } from "../src/project/release.js";

// The workflow decides which commits reach production, so these check what it
// does, not only that it exists.
describe("generateAstroidReleaseWorkflow", () => {
  const workflow = generateAstroidReleaseWorkflow();

  it("runs on a v* tag and nothing else", () => {
    expect(workflow).toContain('tags: ["v*"]');
    expect(workflow).not.toMatch(/branches:/);
  });

  it("moves the deploy branch to the tagged commit and creates the release", () => {
    expect(ASTROID_DEPLOY_BRANCH).toBe("deploy/production");
    expect(workflow).toContain(
      `git push --force origin "$SHA:refs/heads/${ASTROID_DEPLOY_BRANCH}"`,
    );
    expect(workflow).toContain(
      'gh release create "$GITHUB_REF_NAME" --verify-tag --generate-notes',
    );
  });

  it("holds no Cloudflare credential", () => {
    expect(workflow).not.toMatch(/CLOUDFLARE|wrangler/i);
  });

  // Run the tag check's own shell against real tag names, so a broken escape in
  // the generated regex fails here rather than on a release.
  const check = (tag: string) => {
    const pattern = workflow.match(/\[\[ "\$tag" =~ (.+) \]\]/)?.[1];
    if (!pattern) throw new Error("no tag pattern in the workflow");
    try {
      execFileSync("bash", ["-c", `tag="$1"; [[ "$tag" =~ ${pattern} ]]`, "_", tag]);
      return true;
    } catch {
      return false;
    }
  };

  it("accepts v<major>.<minor>.<patch> and refuses anything looser", () => {
    expect(check("v1.4.0")).toBe(true);
    expect(check("v10.0.12")).toBe(true);
    for (const tag of ["1.4.0", "v1.4", "v1.4.0-rc.1", "v1x4x0", "release-1.4.0"]) {
      expect(check(tag)).toBe(false);
    }
  });
});
