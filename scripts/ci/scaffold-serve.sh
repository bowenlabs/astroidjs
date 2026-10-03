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
#   - The Settings panel's Hide from search engines switch reaches robots.txt,
#     the sitemap, and the home page's `noindex`, through a real D1.
#   - The built CSS carries the section library's utility classes. Tailwind v4
#     doesn't scan node_modules, so without the template's `@source` line every
#     section renders unstyled, and nothing but the built CSS shows it.
#   - Rich text stored around the write hook renders sanitized, in the page body
#     and in section fields (ADR 0026). Only a real render through the scaffold's
#     page route and the section components shows that every one of them calls
#     the sanitizer.
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
# A published page whose rich text was written straight to D1, around the write
# hook, in shapes the sanitizer before louise-toolkit 0.43 let through. Built
# with node so the HTML's quotes survive both JSON and SQL.
STORED_SQL="$(mktemp)"
node -e '
  const q = (s) => "'"'"'" + s.replaceAll("'"'"'", "'"'"''"'"'") + "'"'"'";
  const body =
    "<p>Body kept.</p><p>a<scr<link/x>ipt>alert(1)</scr<link/x>ipt>b</p>" +
    "<meta http-equiv=\"refresh\" content=\"0;url=https://example.com/\">" +
    "<p><a href=\"https://example.com/\" title=\"a\"onmouseover=\"alert(2)\">link</a></p>";
  const sections = [
    {
      _type: "splitImage",
      heading: "Stored",
      body: "<p>Split kept.</p><p><img src=\"/media/a.jpg\" alt='"'"'x\"><script>alert(3)</script>'"'"'></p>",
    },
    {
      _type: "faq",
      heading: "Questions",
      items: [{ question: "Why?", answer: "<p>Answer kept.</p><img src=x onerror=alert(4)>" }],
    },
  ];
  console.log(
    "INSERT OR IGNORE INTO pages (slug, title, body, sections, status, sort_order, created_at, updated_at) VALUES (" +
      ["stored-html", "Stored HTML", body, JSON.stringify(sections), "published"].map(q).join(", ") +
      ", 1, 0, 0);",
  );
' >"$STORED_SQL"
wrangler d1 execute DB --local -c "$CONFIG" --file "$STORED_SQL" >/dev/null

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

echo "==> Hide from search engines reaches robots.txt, the sitemap, and every page"
# One reader (astroidIndexingDisabled) behind all three, read through Drizzle
# against the real migration: a column it can't read turns robots.txt into a
# 503, which this catches.
page() { curl -s -m 30 "$BASE$1"; }
ROBOTS="$(page /robots.txt)"
grep -qx 'Disallow: /api/' <<<"$ROBOTS" || fail "robots.txt doesn't block /api/: $ROBOTS"
# Sign-in prints noindex itself, so a crawler has to be able to fetch it.
if grep -q 'Disallow: /login' <<<"$ROBOTS"; then fail "robots.txt disallows the noindex sign-in page"; fi
if page / | grep -q 'name="robots"'; then fail "the home page is noindex with the switch off"; fi
echo "    ok: crawlable with the switch off, before the settings row exists"
# The row is created on first run; the Settings panel can't write without it.
SEEDED="$(status_of -X POST "$BASE/api/louise/seed")"
[ "$SEEDED" = 200 ] || [ "$SEEDED" = 201 ] || fail "settings seed: expected 200 or 201, got $SEEDED"
expect 200 "$(status_of -X PATCH "$BASE/api/louise/settings" -d '{"disableIndexing":true}')" \
  "Settings PATCH turns the switch on"
[ "$(page /robots.txt)" = $'User-agent: *\nDisallow: /' ] ||
  fail "robots.txt doesn't disallow everything with the switch on: $(page /robots.txt)"
echo "    ok: robots.txt disallows everything"
page / | grep -q '<meta name="robots" content="noindex, nofollow"' ||
  fail "the home page isn't noindex with the switch on"
echo "    ok: the home page prints noindex"
if page /sitemap.xml | grep -q '<url>'; then fail "the sitemap lists pages with the switch on"; fi
echo "    ok: the sitemap is empty"
expect 200 "$(status_of -X PATCH "$BASE/api/louise/settings" -d '{"disableIndexing":false}')" \
  "Settings PATCH turns the switch off"

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

echo "==> rich text stored around the write hook renders sanitized"
STORED="$(page /stored-html)"
for kept in "Body kept." "Split kept." "Answer kept."; do
  grep -qF -- "$kept" <<<"$STORED" || fail "/stored-html doesn't render \`$kept\`"
done
echo "    ok: the body, a section body, and an FAQ answer all render"
# `alert(3)` stays, escaped, inside the `alt` it was written in, so look for the
# tag that would run it rather than the call.
for shape in 'alert(1)' 'alert(2)' 'alert(4)' '<script>alert' 'http-equiv="refresh"' 'onmouseover' 'onerror'; do
  if grep -qF -- "$shape" <<<"$STORED"; then fail "/stored-html renders \`$shape\` unsanitized"; fi
  echo "    ok: no $shape"
done

echo "==> OK: served scaffold refuses invalid sections, follows Hide from search engines, ships the section CSS, and sanitizes stored rich text"
