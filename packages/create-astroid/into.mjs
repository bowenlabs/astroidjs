// Copyright (c) 2026 BowenLabs. Astroid is MIT licensed.
//
// `create-astroid --into <path>`: one app scaffolded into a repository that
// already holds one. The pure half of it, a module of its own so the test suite
// can import it without running the scaffolder: which workspace globs cover a
// path, how to add one, the root scripts, and the Workers Builds settings.
//
// Every edit here is text, not a parse and re-serialize. These are files a
// person owns, with their comments and their formatting, and an edit that
// rewrote the whole file to add one line would bury that line in a diff nobody
// reads.

/**
 * Template-relative paths that belong to the repository rather than an app.
 * `--into` never writes them into the app; each is written at the root only
 * when the root has none.
 */
export const INTO_REPOSITORY_FILES = [
  "pnpm-workspace.yaml",
  "_gitignore",
  "_github/workflows/ci.yml",
  "docs/ARCHITECTURE.md",
  "docs/DECISIONS.md",
  "docs/RUNBOOK.md",
];

/**
 * Why a path can't be scaffolded into, or null when it can. The path goes into
 * root scripts and a workspace glob unquoted, so it's held to characters that
 * need no quoting in either.
 */
export function intoPathProblem(path) {
  if (!path || path === ".")
    return "--into needs a path inside the repository, such as workers/order";
  if (path.startsWith("..") || path.startsWith("/")) {
    return `--into path "${path}" is outside the repository`;
  }
  if (!/^[A-Za-z0-9._-]+(\/[A-Za-z0-9._-]+)*$/.test(path)) {
    return `--into path "${path}" may use only letters, digits, ".", "_", "-", and "/"`;
  }
  return null;
}

/** A workspace glob as a regular expression over a POSIX path. */
function globToRegExp(glob) {
  const clean = glob.replace(/^\.\//, "").replace(/\/+$/, "");
  let source = "";
  for (let i = 0; i < clean.length; i++) {
    const c = clean[i];
    if (c === "*" && clean[i + 1] === "*") {
      source += ".*";
      i++;
    } else if (c === "*") source += "[^/]*";
    else if (c === "?") source += "[^/]";
    else source += c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${source}$`);
}

/**
 * The `packages` list of a pnpm-workspace.yaml, or null when it has none. Reads
 * the two shapes pnpm's own docs use, a block list and a flow list.
 */
export function workspacePackages(yaml) {
  const lines = yaml.split("\n");
  const at = lines.findIndex((line) => /^packages\s*:/.test(line));
  if (at === -1) return null;
  const unquote = (s) => s.trim().replace(/^["']|["']$/g, "");
  const rest = lines[at]
    .replace(/^packages\s*:/, "")
    .replace(/\s+#.*$/, "")
    .trim();
  if (rest.startsWith("[")) {
    return rest
      .replace(/^\[|\]$/g, "")
      .split(",")
      .map(unquote)
      .filter(Boolean);
  }
  const items = [];
  for (const line of lines.slice(at + 1)) {
    if (/^\s*(#.*)?$/.test(line)) continue;
    const item = line.match(/^\s+-\s*(.+?)\s*(#.*)?$/);
    if (!item) break;
    items.push(unquote(item[1]));
  }
  return items;
}

/** Whether a workspace's `packages` globs already include `path`. */
export function workspaceCovers(patterns, path) {
  const matches = (glob) => globToRegExp(glob).test(path);
  const included = patterns.filter((p) => !p.startsWith("!")).some(matches);
  const excluded = patterns.filter((p) => p.startsWith("!")).some((p) => matches(p.slice(1)));
  return included && !excluded;
}

/**
 * The workspace file with `path` added to its `packages`, the same text when
 * a glob already covers it, or null when the list is in a shape this can't
 * edit safely (the caller then asks for it by hand).
 */
export function addWorkspacePackage(yaml, path) {
  const patterns = workspacePackages(yaml);
  if (patterns && workspaceCovers(patterns, path)) return yaml;
  const lines = yaml.split("\n");

  if (patterns === null) {
    // No list yet. Insert one before the first top-level key, and before the
    // comment that introduces that key, so the comment stays with it.
    let at = lines.findIndex((line) => /^[A-Za-z]/.test(line));
    if (at === -1) at = lines.length;
    while (at > 0 && lines[at - 1].startsWith("#")) at--;
    const block = [
      "# The workspace. pnpm always includes the root project; each app",
      "# `create-astroid --into` scaffolds is listed here.",
      "packages:",
      `  - ${path}`,
      "",
    ];
    return [...lines.slice(0, at), ...block, ...lines.slice(at)].join("\n");
  }

  const at = lines.findIndex((line) => /^packages\s*:/.test(line));
  const rest = lines[at].replace(/^packages\s*:/, "").trim();
  if (rest.startsWith("[")) {
    // A flow list with no comment after it is one line to rewrite; anything
    // fancier is left to a person.
    if (!/^\[[^\]]*\]$/.test(rest)) return null;
    const inner = rest.slice(1, -1).trim();
    lines[at] = `packages: [${inner ? `${inner}, ` : ""}${JSON.stringify(path)}]`;
    return lines.join("\n");
  }
  if (rest && !rest.startsWith("#")) return null;

  // A block list: append after its last item, at its indentation.
  let last = at;
  let indent = "  ";
  for (let i = at + 1; i < lines.length; i++) {
    if (/^\s*(#.*)?$/.test(lines[i])) continue;
    const item = lines[i].match(/^(\s+)-/);
    if (!item) break;
    last = i;
    indent = item[1];
  }
  lines.splice(last + 1, 0, `${indent}- ${path}`);
  return lines.join("\n");
}

/** The name an app's root scripts are namespaced by: its directory's name. */
export function intoScriptName(path) {
  return path
    .split("/")
    .pop()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-");
}

/** The root scripts that run one app's commands from the repository root. */
export function intoRootScripts(name, path) {
  const inApp = `pnpm --dir ${path}`;
  return {
    [`dev:${name}`]: `${inApp} run dev`,
    [`build:${name}`]: `${inApp} run build`,
    [`doctor:${name}`]: `${inApp} run doctor`,
    [`ship:${name}:production`]: `${inApp} exec astroid ship production`,
    [`ship:${name}:preview`]: `${inApp} exec astroid ship preview`,
  };
}

/**
 * The root package.json's scripts with the app's added, never replacing one
 * that exists: `skipped` names each that was already taken, so the caller can
 * say so rather than overwrite someone's script.
 */
export function mergeRootScripts(existing, scripts) {
  const merged = { ...existing };
  const added = [];
  const skipped = [];
  for (const [name, command] of Object.entries(scripts)) {
    if (name in merged) skipped.push(name);
    else {
      merged[name] = command;
      added.push(name);
    }
  }
  return { scripts: merged, added, skipped };
}

/**
 * The settings of the new app's Workers Builds project. A second app is a
 * second project, building from its own directory and deploying through
 * `astroid ship`, so the deploy steps stay in the repository.
 */
export function workersBuildsSettings(path) {
  return [
    ["Root directory", path],
    ["Build command", "pnpm run build"],
    ["Deploy command", "pnpm exec astroid ship production"],
    ["Non-production branch deploy command", "pnpm exec astroid ship preview"],
    ["Production branch", "deploy/production"],
  ];
}
