import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
  // Tagging a commit doesn't make it tested. The release reads the commit's CI
  // check before it moves deploy/production, and refuses anything but a pass.
  it("reads CI with checks: read, after the tag check and before the push", () => {
    expect(workflow).toMatch(
      /\npermissions:\n {2}contents: write\n(?: {2}#.*\n)* {2}checks: read\n\n/,
    );
    expect(workflow).toContain("A release needs a green CI");
    const step = workflow.match(/- name: Check that CI passed\n[\s\S]*?\n\n/)?.[0] ?? "";
    expect(step).toContain("GH_TOKEN: ${{ github.token }}");
    expect(step).toContain(
      'gh api "repos/$GITHUB_REPOSITORY/commits/$SHA/check-runs?check_name=CI&filter=latest"',
    );
    const tagCheck = workflow.indexOf("- name: Check the tag");
    const ciCheck = workflow.indexOf("- name: Check that CI passed");
    expect(tagCheck).toBeGreaterThan(0);
    expect(ciCheck).toBeGreaterThan(tagCheck);
    expect(workflow.indexOf("git push --force")).toBeGreaterThan(ciCheck);
  });

  // Run the CI check's own shell against a fake gh that answers with canned
  // check runs, so the jq filters and the waiting run for real. A fake sleep
  // counts the polls instead of taking them.
  type CheckRun = Record<string, unknown>;
  const checkRun = (status: string, conclusion: string | null, extra: CheckRun = {}) => ({
    name: "CI",
    status,
    conclusion,
    started_at: "2026-09-28T12:00:00Z",
    html_url: "https://github.com/example-org/site/actions/runs/1/job/2",
    details_url: "https://github.com/example-org/site/actions/runs/1/job/2",
    app: { slug: "github-actions" },
    ...extra,
  });
  // A job of this release workflow's own run, which the tagged commit also has.
  const ownJob = checkRun("in_progress", null, {
    name: "release",
    details_url: "https://github.com/example-org/site/actions/runs/777/job/9",
  });

  const ciCheck = (ciResponses: CheckRun[][], otherRuns: CheckRun[] = []) => {
    const script = workflow.match(
      /- name: Check that CI passed\n[\s\S]*?run: \|\n([\s\S]*?)\n\n/,
    )?.[1];
    if (!script) throw new Error("no CI check in the workflow");
    const dir = mkdtempSync(join(tmpdir(), "release-ci-"));
    try {
      ciResponses.forEach((runs, i) =>
        writeFileSync(join(dir, `ci-${i}.json`), JSON.stringify({ check_runs: runs })),
      );
      writeFileSync(join(dir, "all.json"), JSON.stringify({ check_runs: [ownJob, ...otherRuns] }));
      writeFileSync(join(dir, "n"), "0\n");
      // The fakes are shell functions defined ahead of the script, and use only
      // builtins after a response's first read. The timeout test polls 90
      // times, and on macOS a process started per poll, whether a fake gh on
      // PATH or jq, takes it past vitest's 5 s timeout.
      // gh api <path> --jq <filter>: each CI read takes the next response, and
      // the last one repeats. A response is only ever read with one filter, so
      // jq runs it once and later reads replay what it printed.
      const fakes = [
        "gh() {",
        '  echo "$2" >> "$FAKE/calls"',
        '  if [[ "$2" == *check_name=CI* ]]; then',
        '    read -r n < "$FAKE/n"',
        '    file="$FAKE/ci-$n.json"',
        '    if [ -f "$FAKE/ci-$((n + 1)).json" ]; then echo "$((n + 1))" > "$FAKE/n"; fi',
        "  else",
        '    file="$FAKE/all.json"',
        "  fi",
        '  if [ ! -f "$file.out" ]; then',
        '    jq -r "$4" "$file" > "$file.out" || { rm "$file.out"; return 1; }',
        "  fi",
        '  while IFS= read -r line; do echo "$line"; done < "$file.out"',
        "}",
        'sleep() { echo "$1" >> "$FAKE/sleeps"; }',
      ].join("\n");
      const read = (name: string) => {
        try {
          return readFileSync(join(dir, name), "utf8").split("\n").filter(Boolean);
        } catch {
          return [];
        }
      };
      let ok = true;
      let output: string;
      try {
        output = execFileSync(
          "bash",
          [
            "--noprofile",
            "--norc",
            "-eo",
            "pipefail",
            "-c",
            `${fakes}\n${script.replace(/^ {10}/gm, "")}`,
          ],
          {
            env: {
              ...process.env,
              FAKE: dir,
              SHA: "abc123",
              GITHUB_REPOSITORY: "example-org/site",
              GITHUB_RUN_ID: "777",
            },
            encoding: "utf8",
          },
        );
      } catch (e) {
        ok = false;
        output = String((e as { stdout?: string }).stdout);
      }
      return { ok, output, calls: read("calls"), polls: read("sleeps").length };
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  };

  it("releases a commit whose CI passed, without waiting", () => {
    const { ok, output, calls, polls } = ciCheck([[checkRun("completed", "success")]]);
    expect(ok).toBe(true);
    expect(output).toContain("CI passed on abc123");
    expect(calls[0]).toBe(
      "repos/example-org/site/commits/abc123/check-runs?check_name=CI&filter=latest",
    );
    expect(polls).toBe(0);
  });

  it("refuses a commit whose CI ended in anything but success, naming it and linking the run", () => {
    for (const conclusion of ["failure", "cancelled", "timed_out", "neutral", "skipped"]) {
      const { ok, output } = ciCheck([[checkRun("completed", conclusion)]]);
      expect(ok).toBe(false);
      expect(output).toContain(`::error::CI on abc123 ended in ${conclusion}`);
      expect(output).toContain("https://github.com/example-org/site/actions/runs/1/job/2");
    }
  });

  it("waits for a queued or running CI, then follows its result", () => {
    const passed = ciCheck([
      [checkRun("queued", null)],
      [checkRun("in_progress", null)],
      [checkRun("completed", "success")],
    ]);
    expect(passed.ok).toBe(true);
    expect(passed.polls).toBe(2);
    const failed = ciCheck([[checkRun("in_progress", null)], [checkRun("completed", "failure")]]);
    expect(failed.ok).toBe(false);
    expect(failed.polls).toBe(1);
    expect(failed.output).toContain("ended in failure");
  });

  it("gives up after 30 minutes of polling every 20 seconds", () => {
    const { ok, output, polls } = ciCheck([[checkRun("in_progress", null)]]);
    expect(ok).toBe(false);
    expect(polls).toBe(90);
    expect(output).toContain("::error::CI on abc123 didn't finish within 30 minutes");
  });

  it("refuses a commit with no CI run at once, counting none of its own jobs", () => {
    const { ok, output, polls } = ciCheck([[]]);
    expect(ok).toBe(false);
    expect(polls).toBe(0);
    expect(output).toContain("::error::abc123 has no CI run, so it can't be released.");
    expect(output).toContain("CI runs on pushes to main and release/ branches");
  });

  // GitHub creates the aggregator's check run only once the jobs it needs
  // finish, so no CI run while they run is a CI still to come.
  it("waits for a CI that hasn't started while the commit's other jobs run", () => {
    const { ok, polls } = ciCheck(
      [[], [], [checkRun("completed", "success")]],
      [checkRun("in_progress", null, { name: "lint" })],
    );
    expect(ok).toBe(true);
    expect(polls).toBe(2);
  });

  it("counts only the github-actions app's CI, and the latest run of it", () => {
    const otherApp = checkRun("completed", "success", { app: { slug: "another-app" } });
    expect(ciCheck([[otherApp]]).output).toContain("has no CI run");
    const earlier = { started_at: "2026-09-28T11:00:00Z" };
    expect(
      ciCheck([[checkRun("completed", "success"), checkRun("completed", "failure", earlier)]]).ok,
    ).toBe(true);
    expect(
      ciCheck([[checkRun("completed", "failure"), checkRun("completed", "success", earlier)]]).ok,
    ).toBe(false);
  });
});
