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

  // A ruleset can't exempt the GitHub Actions app, so GITHUB_TOKEN can't move a
  // guarded deploy/production. The release app's token does, and only it.
  it("pushes with the release app's token and releases with GITHUB_TOKEN", () => {
    const at = (s: string) => {
      const i = workflow.indexOf(s);
      if (i < 0) throw new Error(`not in the workflow: ${s}`);
      return i;
    };
    expect(workflow).toContain("uses: actions/create-github-app-token@v2");
    expect(workflow).toContain("app-id: ${{ vars.RELEASE_APP_ID }}");
    expect(workflow).toContain("private-key: ${{ secrets.RELEASE_APP_PRIVATE_KEY }}");
    expect(workflow).toContain("token: ${{ steps.app-token.outputs.token }}");
    expect(workflow).toContain("GH_TOKEN: ${{ github.token }}");
    // Check the setup, then mint, then check out with the token, then push.
    expect(at("Check the release app")).toBeLessThan(at("create-github-app-token"));
    expect(at("create-github-app-token")).toBeLessThan(at("actions/checkout"));
    expect(at("actions/checkout")).toBeLessThan(at("git push --force"));
    expect(workflow).not.toMatch(/ssh-key|DEPLOY_KEY/);
  });

  // Run the setup check's own shell, so a missing value fails the job with a
  // message that names what to set.
  const setupCheck = (env: { APP_ID: string; APP_KEY: string }) => {
    const script = workflow.match(
      /- name: Check the release app\n[\s\S]*?run: \|\n([\s\S]*?)\n\n/,
    )?.[1];
    if (!script) throw new Error("no setup check in the workflow");
    try {
      execFileSync("bash", ["-c", script.replace(/^ {10}/gm, "")], {
        env: { ...process.env, ...env },
        encoding: "utf8",
      });
      return { ok: true, output: "" };
    } catch (e) {
      return { ok: false, output: String((e as { stdout?: string }).stdout) };
    }
  };

  it("fails early, naming both values, when either is missing", () => {
    expect(setupCheck({ APP_ID: "123456", APP_KEY: "key" }).ok).toBe(true);
    for (const env of [
      { APP_ID: "", APP_KEY: "key" },
      { APP_ID: "123456", APP_KEY: "" },
    ]) {
      const { ok, output } = setupCheck(env);
      expect(ok).toBe(false);
      expect(output).toContain("RELEASE_APP_ID");
      expect(output).toContain("RELEASE_APP_PRIVATE_KEY");
      expect(output).toContain("https://docs.astroidjs.org/guide/releases/");
    }
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
