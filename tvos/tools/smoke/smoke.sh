#!/bin/bash
# Compiles the tvOS app's model layer for macOS and runs it against live ESPN.
set -euo pipefail
cd "$(dirname "$0")"
M="../../HideScoreTV/Model"
xcrun swiftc -O -o /tmp/hs-tv-smoke \
  "$M"/{Catalog,Rating,Game,ESPN,ServiceDay}.swift main.swift
exec /tmp/hs-tv-smoke "$@"
