#!/bin/sh
# Lints every doc and all prose in code against the Google developer
# documentation style guide and the Louise house style (louise-toolkit ADR 0013).
# That covers each tracked Markdown and MDX file, and the comments and JSDoc in
# every tracked TypeScript and JavaScript file. Dependencies, build output, and
# generated `.d.ts` files are skipped.
#
# The rules and the reasons for them live in the house package that .vale.ini
# names. Run `corepack pnpm --package=@vvago/vale@3.17.1 dlx vale sync` once
# first to fetch it. The bar is Vale's error level: any error fails the run.
#
# `.mjs` files go through Vale one at a time, as JavaScript on standard input.
# Vale 3.17.1 doesn't recognize the extension and reads a `.mjs` file as plain
# text, so it lints string literals and code as if they were prose: it flags
# `function out(s)` as an optional plural. A `[formats]` mapping of `mjs = js`
# doesn't help; it makes Vale skip `.mjs` files entirely.
set -eu

cd "$(dirname "$0")/.."

vale_pkg="@vvago/vale@3.17.1"
skip='(^|/)(node_modules|dist)/|\.d\.ts$'
status=0

git ls-files '*.md' '*.mdx' '*.ts' '*.tsx' '*.js' | grep -vE "$skip" |
  xargs corepack pnpm --package="$vale_pkg" dlx vale || status=1

report=$(mktemp)
trap 'rm -f "$report"' EXIT
for file in $(git ls-files '*.mjs' | grep -vE "$skip"); do
  if ! corepack pnpm --package="$vale_pkg" dlx vale --ext=.js --output=line <"$file" >"$report"; then
    status=1
  fi
  sed "s|^stdin\.js:|$file:|" "$report"
done

exit "$status"
