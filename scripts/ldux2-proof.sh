#!/usr/bin/env bash
# Regenerate the D-LDUX-2 before/after proof shots in docs/ldux2/.
#
# BEFORE comes from a worktree checked out at origin/main and is photographed with
# proof/proof-app-before.tsx; AFTER comes from the working tree and uses
# proof/proof-app.tsx. Both builds share proof/fixtures.ts and proof/data-shim.ts,
# so the only variable between the two columns is the panel code itself.
#
# Fixtures rather than live rows, on purpose: every legal.ld_* table is RLS-scoped
# to an authenticated tenant and returns nothing to an anonymous build BY DESIGN.
# See the auth note at the top of src/data/lawdog-provider.ts.
#
# Usage:  bash scripts/ldux2-proof.sh
# Needs:  node_modules installed, and a chrome/chromium on PATH.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="$ROOT/docs/ldux2"
WORK="${TMPDIR:-/tmp}/ldux2-before"
SCREENS=(matters matter evidence)
CHROME="${CHROME:-$(command -v google-chrome || command -v chromium || command -v chromium-browser)}"

shoot() { # shoot <port> <prefix>
  local port="$1" prefix="$2" s
  for s in "${SCREENS[@]}"; do
    "$CHROME" --headless --disable-gpu --no-sandbox --hide-scrollbars \
      --force-device-scale-factor=2 --window-size=1280,880 \
      --virtual-time-budget=6000 \
      --screenshot="$OUT/$prefix-$s.png" \
      "http://localhost:$port/proof/proof.html?screen=$s" 2>/dev/null
  done
}

mkdir -p "$OUT"

echo "── after (working tree) ─────────────────────────────"
cd "$ROOT"
VITE_PROFILE=lawdog npx vite build --config vite.proof.config.ts
python3 -m http.server 4180 --directory "$ROOT/dist-proof" >/dev/null 2>&1 &
AFTER_PID=$!
sleep 2
shoot 4180 after
kill "$AFTER_PID"

echo "── before (origin/main) ─────────────────────────────"
git worktree remove --force "$WORK" 2>/dev/null || true
git fetch origin main --quiet
git worktree add -f "$WORK" origin/main
ln -s "$ROOT/node_modules" "$WORK/node_modules"
cp -r "$ROOT/proof" "$WORK/"
cp "$ROOT/vite.proof.config.ts" "$WORK/"
# the before tree has no MatterHome to photograph — swap in the before harness
sed -i 's|proof-app.tsx|proof-app-before.tsx|' "$WORK/proof/proof.html"
(cd "$WORK" && VITE_PROFILE=lawdog npx vite build --config vite.proof.config.ts)
python3 -m http.server 4181 --directory "$WORK/dist-proof" >/dev/null 2>&1 &
BEFORE_PID=$!
sleep 2
shoot 4181 before
kill "$BEFORE_PID"

rm -f "$WORK/node_modules"
git worktree remove --force "$WORK"

echo "── wrote ───────────────────────────────────────────"
ls -1 "$OUT"
