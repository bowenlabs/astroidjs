#!/usr/bin/env bash
# Serve a built scaffold and check what only a running Worker shows.
#
#   scripts/ci/scaffold-serve.sh <project-dir>
#
# Run it after scaffold-smoke.sh, on the project that script scaffolded and built
# (`<workdir>/room/smoke`). It boots `wrangler dev` on the build, signs in as an
# editor with a real magic link, and checks:
#
#   - An invalid section is refused with 422 on every write path (the Pages
#     route, a versions draft save, and a save that merges into an open KV draft
#     buffer), and none of them stores it. Reaching those throws needs a real D1,
#     so no unit test covers them, and before louise-toolkit 0.31.1 the buffered
#     path answered 200 and failed later, at publish. See docs/LESSONS.md.
#   - The built CSS carries the section library's utility classes. Tailwind v4
#     doesn't scan node_modules, so without the template's `@source` line every
#     section renders unstyled, and nothing but the built CSS shows it.
set -euo pipefail

PROJECT="${1:?usage: scaffold-serve.sh <project-dir>}"
cd "$PROJECT"
PORT="${SERVE_PORT:-8791}"
BASE="http://localhost:$PORT"
LOG="$(mktemp)"
JAR="$(mktemp)"
EMAIL="owner@example.com"
CONFIG="dist/server/wrangler.json"

fail() {
  echo "FAIL: $*" >&2
  echo "--- wrangler dev log (tail) ---" >&2
  tail -40 "$LOG" >&2 || true
  exit 1
}

[ -f "$CONFIG" ] || fail "$CONFIG is missing; run scaffold-smoke.sh first"

# `ai` is a remote-only binding: `wrangler dev` opens a remote session for it,
# which needs a Cloudflare account CI doesn't have. The checks here never call
# a model, and the AI routes degrade to 503 without the binding by design.
node -e '
  const fs = require("node:fs");
  const f = process.argv[1];
  const c = JSON.parse(fs.readFileSync(f, "utf8"));
  delete c.ai;
  fs.writeFileSync(f, JSON.stringify(c));
' "$CONFIG"

# `.dev.vars` must sit beside the config in use (docs/LESSONS.md), and a real
# SESSION_SECRET is required: the localhost fallback doesn't apply off
# localhost, and a declared route host makes the Worker see that host.
SECRET="$(node -e 'console.log(require("node:crypto").randomBytes(32).toString("hex"))')"
sed -e "s/^SESSION_SECRET=.*/SESSION_SECRET=$SECRET/" -e "s/^OWNER_EMAIL=.*/OWNER_EMAIL=$EMAIL/" \
  .env.example >dist/server/.dev.vars

wrangler() { corepack pnpm exec wrangler "$@"; }

echo "==> local D1: migrations, the home page, one editor"
# Seed with the server stopped: a `d1 execute --local` beside a running
# `wrangler dev` can see a different database (docs/LESSONS.md).
wrangler d1 migrations apply DB --local -c "$CONFIG" >/dev/null
wrangler d1 execute DB --local -c "$CONFIG" --file seed/home.seed.sql >/dev/null
wrangler d1 execute DB --local -c "$CONFIG" --command \
  "INSERT OR IGNORE INTO louise_user (id, name, email, emailVerified, createdAt, updatedAt, role) VALUES ('smoke-editor', 'owner', '$EMAIL', 1, '2026-01-01', '2026-01-01', 'admin');" \
  >/dev/null

echo "==> wrangler dev on :$PORT"
wrangler dev -c "$CONFIG" --port "$PORT" --inspector-port "$((PORT + 1))" >"$LOG" 2>&1 &
DEV_PID=$!
# Free both ports by process, not by name: `workerd` outlives wrangler, and a
# stale one holding the port makes the next run fail to bind.
cleanup() {
  kill "$DEV_PID" 2>/dev/null || true
  lsof -ti "tcp:$PORT" -ti "tcp:$((PORT + 1))" 2>/dev/null | xargs kill -9 2>/dev/null || true
}
trap cleanup EXIT
for _ in $(seq 1 90); do
  curl -s -m 5 -o /dev/null "$BASE/" && break
  sleep 1
done
curl -s -m 5 -o /dev/null "$BASE/" || fail "wrangler dev never answered on $BASE"

# Every mutation is origin-checked (CSRF), so each request names this origin.
api() { curl -s -m 30 -b "$JAR" -c "$JAR" -H "Origin: $BASE" -H "content-type: application/json" "$@"; }
status_of() { api -o /dev/null -w '%{http_code}' "$@"; }
expect() {
  local want="$1" got="$2" what="$3"
  [ "$got" = "$want" ] || fail "$what: expected $want, got $got"
  echo "    ok: $what ($got)"
}

echo "==> sign in with a magic link"
# In local dev the scaffold's auth seam logs the link instead of emailing it.
# printf, not an inline "{…,…}": inside $(…), bash brace-expands that into two
# requests, each with half the body.
SIGN_IN="$(printf '{"email":"%s","callbackURL":"/"}' "$EMAIL")"
expect 200 "$(status_of -X POST "$BASE/api/auth/sign-in/magic-link" -d "$SIGN_IN")" \
  "magic link requested"
LINK=""
for _ in $(seq 1 20); do
  LINK="$(grep -oE "$BASE/api/auth/magic-link/verify[^ ]*" "$LOG" | tail -1 || true)"
  [ -n "$LINK" ] && break
  sleep 1
done
[ -n "$LINK" ] || fail "no magic link in the dev log"
curl -s -m 30 -o /dev/null -b "$JAR" -c "$JAR" "$LINK"
SESSION="$(api "$BASE/api/auth/get-session")"
grep -q "\"email\":\"$EMAIL\"" <<<"$SESSION" || fail "signed-in session not found: $SESSION"
echo "    ok: signed in as $EMAIL"

sections_of_home() {
  api "$BASE/api/louise/pages/1" | node -e '
    let s = "";
    process.stdin.on("data", (d) => (s += d)).on("end", () => {
      const page = JSON.parse(s).page;
      console.log(JSON.stringify(page.sections));
    });
  '
}
BAD='{"sections":[{"_type":"no-such-section"}]}'
BEFORE="$(sections_of_home)"

echo "==> an invalid section is a 422 on every write path"
expect 422 "$(status_of -X PATCH "$BASE/api/louise/pages/1" -d "$BAD")" "Pages route PATCH"
expect 422 "$(status_of -X POST "$BASE/api/louise/pages/1/versions" -d "$BAD")" \
  "versions draft save"
# The first valid save writes a draft version (201); the next is coalesced into
# the KV draft buffer (200, `buffered: true`). The invalid save then merges into
# that open buffer, which is the path that used to answer 200 and fail later.
expect 201 "$(status_of -X POST "$BASE/api/louise/pages/1/versions" -d '{"title":"Draft title"}')" \
  "valid draft save (writes a version)"
BUFFERED="$(api -X POST "$BASE/api/louise/pages/1/versions" -d '{"title":"Buffered title"}')"
grep -q '"buffered":true' <<<"$BUFFERED" || fail "the second draft save wasn't buffered: $BUFFERED"
echo "    ok: valid draft save coalesced into the KV buffer"
expect 422 "$(status_of -X POST "$BASE/api/louise/pages/1/versions" -d "$BAD")" \
  "draft save merged into the open buffer"
[ "$(sections_of_home)" = "$BEFORE" ] || fail "an invalid section reached the live row"
echo "    ok: the live row's sections are unchanged"
# The 422s mean validation, not a broken route: a valid write still lands.
expect 200 "$(status_of -X PATCH "$BASE/api/louise/pages/1" -d '{"seoTitle":"Served"}')" \
  "valid Pages route PATCH"

echo "==> the built CSS carries the section library's utilities"
# Classes the section components use and the template doesn't, so only the
# `@source` line in src/styles/site.css can put them in the CSS.
CSS="$(cat dist/client/_astro/*.css)"
for class in divide-base-300 lg:grid-cols-4 marker:content-none size-10 gap-x-6; do
  grep -rqF -- "$class" node_modules/astroidjs/src/components/sections ||
    fail "\`$class\` is no longer in the section library; pick another class for this check"
  escaped="${class//:/\\:}"
  grep -qF -- ".$escaped" <<<"$CSS" || fail "the built CSS has no .$escaped (is @source missing?)"
  echo "    ok: .$escaped"
done

echo "==> OK: served scaffold refuses invalid sections and ships the section CSS"
