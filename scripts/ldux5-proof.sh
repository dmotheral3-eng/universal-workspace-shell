#!/usr/bin/env bash
# Regenerate the D-LDUX-5 before/after proof shots in docs/ldux5/.
#
# Same method as scripts/ldux2-proof.sh, which this is a sibling of: BEFORE comes
# from a worktree checked out at origin/main, AFTER from the working tree, and both
# columns share proof/fixtures.ts and proof/data-shim.ts. The only variable
# between the two columns is the panel code.
#
# Unlike the LDUX-2 run, both columns use proof/proof-app.tsx: every panel it
# imports (matters, matter home, chronology, reader) exists on main, so no
# stand-in harness is needed.
#
# Fixtures rather than live rows, on purpose: every legal.ld_* table is RLS-scoped
# to an authenticated tenant and returns nothing to an anonymous build BY DESIGN.
# See the auth note at the top of src/data/lawdog-provider.ts.
#
# Usage:  bash scripts/ldux5-proof.sh
# Needs:  node_modules installed, and a chrome/chromium on PATH.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="$ROOT/docs/ldux5"
WORK="${TMPDIR:-/tmp}/ldux5-before"
SCREENS=(matters matter chronology timeline reader)
CHROME="${CHROME:-$(command -v google-chrome || command -v chromium || command -v chromium-browser)}"

# The chronology panel takes its view from the URL, so the density view is
# photographable without a click.
query() {
  case "$1" in
    timeline) echo "screen=timeline&chron=timeline" ;;
    *) echo "screen=$1" ;;
  esac
}

shoot() { # shoot <port> <prefix>
  local port="$1" prefix="$2" s
  for s in "${SCREENS[@]}"; do
    "$CHROME" --headless --disable-gpu --no-sandbox --hide-scrollbars \
      --force-device-scale-factor=2 --window-size=1280,880 \
      --virtual-time-budget=8000 \
      --screenshot="$OUT/$prefix-$s.png" \
      "http://localhost:$port/proof/proof.html?$(query "$s")" 2>/dev/null
  done
}

mkdir -p "$OUT"

echo "── after (working tree) ─────────────────────────────"
cd "$ROOT"
VITE_PROFILE=lawdog npx vite build --config vite.proof.config.ts
python3 -m http.server 4190 --directory "$ROOT/dist-proof" >/dev/null 2>&1 &
AFTER_PID=$!
sleep 2
shoot 4190 after
kill "$AFTER_PID"

echo "── before (origin/main) ─────────────────────────────"
git worktree remove --force "$WORK" 2>/dev/null || true
git fetch origin main --quiet
git worktree add -f "$WORK" origin/main
ln -s "$ROOT/node_modules" "$WORK/node_modules"
cp -r "$ROOT/proof" "$WORK/"
cp "$ROOT/vite.proof.config.ts" "$WORK/"
(cd "$WORK" && VITE_PROFILE=lawdog npx vite build --config vite.proof.config.ts)
python3 -m http.server 4191 --directory "$WORK/dist-proof" >/dev/null 2>&1 &
BEFORE_PID=$!
sleep 2
shoot 4191 before
kill "$BEFORE_PID"

rm -f "$WORK/node_modules"
git worktree remove --force "$WORK"

echo "── wrote ───────────────────────────────────────────"
ls -1 "$OUT"
