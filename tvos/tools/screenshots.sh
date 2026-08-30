#!/bin/bash
# Captures the Apple TV App Store screenshots.
#
# Every shot is taken in DEMO MODE, which replaces every team, league and
# broadcaster with a placeholder. HideScore was rejected twice under 4.1(a)
# because real marks appeared in its screenshots, and Apple counts screenshots
# as metadata — so no real one is ever allowed to reach the listing.
#
# Each screen is a separate LAUNCH with a different argument rather than a script
# driving the remote, so the set is reproducible byte-for-byte.
set -euo pipefail
cd "$(dirname "$0")"
ROOT="$(cd .. && pwd)"
OUT="$ROOT/screenshots"
BUNDLE="com.jacobhl.hidescore"
DEVICE_NAME="HideScore TV shots"
DEVICE_TYPE="com.apple.CoreSimulator.SimDeviceType.Apple-TV-4K-3rd-generation-4K"

RUNTIME=$(xcrun simctl list runtimes --json | /usr/bin/python3 -c "
import json,sys
rs=[r for r in json.load(sys.stdin)['runtimes'] if r['isAvailable'] and 'tvOS' in r['name']]
print(sorted(rs, key=lambda r: r['version'])[-1]['identifier'] if rs else '')")
[ -n "$RUNTIME" ] || { echo "no tvOS simulator runtime — run: xcodebuild -downloadPlatform tvOS"; exit 1; }

UDID=$(xcrun simctl list devices --json | /usr/bin/python3 -c "
import json,sys
d=json.load(sys.stdin)['devices']
print(next((x['udid'] for v in d.values() for x in v if x['name']=='$DEVICE_NAME'), ''))")
if [ -z "$UDID" ]; then
  UDID=$(xcrun simctl create "$DEVICE_NAME" "$DEVICE_TYPE" "$RUNTIME")
  echo "created simulator $UDID"
fi
xcrun simctl boot "$UDID" 2>/dev/null || true
xcrun simctl bootstatus "$UDID" -b

echo "→ building for the simulator"
mkdir -p "$ROOT/build"
DD="$ROOT/build/shots-dd"
xcodebuild -project "$ROOT/HideScoreTV.xcodeproj" -scheme HideScoreTV -configuration Debug \
  -destination "id=$UDID" -derivedDataPath "$DD" \
  CODE_SIGNING_ALLOWED=NO build > "$ROOT/build/shots-build.log" 2>&1 \
  || { tail -30 "$ROOT/build/shots-build.log"; exit 1; }

APP=$(find "$DD/Build/Products" -maxdepth 2 -name "HideScoreTV.app" | head -1)
xcrun simctl install "$UDID" "$APP"

mkdir -p "$OUT"; rm -f "$OUT"/*.png

shot () {           # shot <filename> <settle-seconds> <extra launch args…>
  local name="$1"; shift
  local settle="$1"; shift
  xcrun simctl terminate "$UDID" "$BUNDLE" 2>/dev/null || true
  xcrun simctl launch "$UDID" "$BUNDLE" -HSDemoMode YES "$@" > /dev/null
  sleep "$settle"
  xcrun simctl io "$UDID" screenshot "$OUT/$name" > /dev/null
  echo "   $name  $(sips -g pixelWidth -g pixelHeight "$OUT/$name" | awk '/pixel/{printf "%s ", $2}')"
}

echo "→ capturing"
shot 01-tonight.png       25
shot 02-worth-watching.png 18 -HSDemoTab worth
shot 03-hidden.png         18 -HSDemoTab worth -HSDemoDetail YES
shot 04-revealed.png       18 -HSDemoTab worth -HSDemoDetail YES -HSDemoReveal YES
shot 05-leagues.png        14 -HSDemoTab leagues

echo "→ $OUT"
