#!/bin/bash
# Proves the tvOS Swift rating port scores live games identically to the
# website's TypeScript. Fetches real ESPN scoreboards, scores them both ways,
# and diffs. Any mismatch is printed and the script exits non-zero.
#
#   ./parity.sh [days-back] [league,league]
set -euo pipefail
cd "$(dirname "$0")"
REPO="$(cd ../../.. && pwd)"
DAYS="${1:-3}"
LEAGUES="${2:-}"

rm -rf fixtures ts-ratings.json swift-ratings.json
echo "→ fetching scoreboards + scoring with src/lib/espn.ts"
node ts-ratings.mjs "$DAYS" "$LEAGUES"

echo "→ compiling the tvOS port for macOS"
xcrun swiftc -O -o /tmp/hs-parity-harness \
  "$REPO"/tvos/HideScoreTV/Model/{Catalog,Rating,Game,ESPN}.swift main.swift

echo "→ scoring the same payloads with the Swift port"
/tmp/hs-parity-harness fixtures "$REPO/public/tv/catalog.json" > swift-ratings.json

node compare.mjs
