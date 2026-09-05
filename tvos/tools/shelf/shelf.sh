#!/bin/bash
# Compiles the Top Shelf's builder + renderer for macOS and runs them against
# live ESPN, writing one PNG per tile. See main.swift.
set -euo pipefail
cd "$(dirname "$0")"
M="../../HideScoreTV/Model"
S="../../HideScoreTopShelf"
xcrun swiftc -O -o "${TMPDIR:-/tmp}/hs-tv-shelf" \
  "$M"/{Catalog,Rating,Game,ESPN,ServiceDay,SharedPreferences}.swift \
  "$S"/{ShelfBuilder,ShelfRenderer}.swift main.swift
exec "${TMPDIR:-/tmp}/hs-tv-shelf" "$@"
