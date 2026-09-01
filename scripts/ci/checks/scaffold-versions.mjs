// The scaffold must declare the toolkit versions it was BUILT against.
//
// Nothing else in the smoke test can check this. A hand-written range in
// `template/package.json` rots undetected: it once pinned `^0.1.0` while the
// template imported `astroidjs/astro`, an export the newest matching version did
// not have, so every scaffolded project died before Astro loaded its config while
// CI stayed green.
//
// create-astroid DERIVES these from its own resolved dependencies
// (`toolkitRanges()`); this asserts the derivation actually happened and produced
// the right answer, so re-hardcoding a literal fails here rather than on npm.
//
// Resolution deliberately mirrors `toolkitRanges()` — `createRequire` from the
// installed create-astroid's own directory — rather than reading
// `./node_modules/<name>`. Under pnpm's isolated layout a transitive dependency
// is not hoisted to the installing project's top level, so the naive path exists
// only by luck of hoisting and the check would compare against the wrong copy, or
// crash. Asking the same question the same way is also what makes this a real
// test of the derivation rather than of the installer.
//
// Usage: node scaffold-versions.mjs <scaffold-dir> <create-astroid-dir>

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const [scaffold, creator] = process.argv.slice(2);
if (!scaffold || !creator) {
  console.error("usage: scaffold-versions.mjs <scaffold-dir> <create-astroid-dir>");
  process.exit(1);
}

const pkg = JSON.parse(fs.readFileSync(path.join(scaffold, "package.json"), "utf8"));
// realpath, not resolve: pnpm links `node_modules/create-astroid` into `.pnpm`,
// and a require rooted at the SYMLINK cannot see the sibling packages that only
// exist beside its real location. Same reason `toolkitRanges()` works — it uses
// `import.meta.url`, which is already the real path.
const req = createRequire(path.join(fs.realpathSync(creator), "index.mjs"));

let bad = 0;
for (const name of ["astroidjs", "louise-toolkit", "@louise-toolkit/astro"]) {
  const resolved = JSON.parse(fs.readFileSync(req.resolve(`${name}/package.json`), "utf8")).version;
  const declared = pkg.dependencies?.[name];
  const expected = `^${resolved}`;
  if (declared !== expected) {
    console.error(
      `  ✗ scaffold declares ${name} "${declared}", but create-astroid resolved ` +
        `${resolved} (expected "${expected}")`,
    );
    bad++;
  } else {
    console.log(`  ✓ ${name} ${declared}`);
  }
}

if (bad > 0) {
  console.error(
    `\n${bad} stale range(s). Either template/package.json re-hardcoded a literal, ` +
      "or toolkitRanges() stopped deriving correctly.",
  );
  process.exit(1);
}
console.log("Scaffold version derivation OK.");
