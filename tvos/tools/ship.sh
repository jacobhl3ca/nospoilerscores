#!/bin/bash
# Archives the Apple TV app and uploads it to App Store Connect. No Xcode GUI.
#
#   ./ship.sh              # archive + upload at the current version/build
#   ./ship.sh 1.1 2        # set MARKETING_VERSION / CURRENT_PROJECT_VERSION first
#
# Cloud signing needs an ADMIN App Store Connect API key — an App Manager key
# uploads fine but cannot create the iOS/tvOS Distribution certificate, and the
# failure lands on the EXPORT step, not the archive.
#
# Three things here look wrong and are not:
#
#  1. The ARCHIVE is built unsigned. Automatic signing provisions an archive for
#     DEVELOPMENT, and a development profile cannot be issued to a team with no
#     registered devices — which is us, since nothing here is ever side-loaded.
#     Forcing CODE_SIGN_IDENTITY=Apple Distribution instead trips "conflicting
#     provisioning settings". The export step applies the real App Store
#     signature, which is the only one that ships.
#
#  2. The archived bundles are then AD-HOC signed, by hand, with their
#     entitlements files. The export re-signs with whatever entitlements it finds
#     on the archived bundles — and an unsigned archive has none, so the App
#     Groups entitlement the Top Shelf extension lives on was dropped SILENTLY
#     (the export succeeds, the shelf can never read the shared container).
#     An ad-hoc signature is enough to carry them: the export reads the
#     entitlements off it, validates them against the store profile, and
#     applies the real signature. Established 2026-09-05: the unsigned export
#     read back (`codesign -d --entitlements`) with no app group in either
#     bundle; the ad-hoc-signed one was validated against the profile — which
#     is how the missing portal App Group surfaced. (Ad-hoc signing at ARCHIVE
#     time is refused — "requires a provisioning profile" — even with
#     AD_HOC_CODE_SIGNING_ALLOWED=YES.)
#
#  3. The EXPORT runs with a system-only PATH. exportArchive shells out to rsync,
#     and Homebrew's rsync 3.4.x fails it with a bare "Copy failed" (the real
#     error, "syntax or usage error (code 1)", is buried in the xcdistributionlogs
#     bundle). Apple's /usr/bin/rsync is openrsync and works.
#
# One-time portal prerequisite (1.1+): the App Group `group.com.jacobhl.hidescore`
# must exist and be enabled on BOTH App IDs (com.jacobhl.hidescore and
# com.jacobhl.hidescore.topshelf) in developer.apple.com → Identifiers. The App
# Store Connect API has no App Group resource, and xcodebuild's
# -allowProvisioningUpdates cannot create one with an API key (it fails with
# "Authentication failed", then "doesn't include the App Groups capability").
# Until that is done the export below fails — loudly, which is the right way.
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$PWD"
PROJ="$ROOT/HideScoreTV.xcodeproj"
source ~/.appstoreconnect/credentials
KEY="$HOME/.appstoreconnect/private_keys/AuthKey_${ASC_KEY_ID}.p8"

if [ $# -ge 1 ]; then
  /usr/bin/sed -i '' "s/MARKETING_VERSION = [^;]*;/MARKETING_VERSION = $1;/g" "$PROJ/project.pbxproj"
  echo "marketing version → $1"
fi
if [ $# -ge 2 ]; then
  /usr/bin/sed -i '' "s/CURRENT_PROJECT_VERSION = [^;]*;/CURRENT_PROJECT_VERSION = $2;/g" "$PROJ/project.pbxproj"
  echo "build → $2"
fi

# The bundled catalog must match what's about to be live on hidescore.com, or a
# first launch with no network shows a different set of leagues than the site.
( cd "$ROOT/.." && node scripts/build-tv-catalog.mjs --check )

ARCHIVE="$ROOT/build/HideScoreTV.xcarchive"
rm -rf "$ARCHIVE" "$ROOT/build/export"

echo "→ archiving"
xcodebuild archive \
  -project "$PROJ" -scheme HideScoreTV -configuration Release \
  -destination 'generic/platform=tvOS' -archivePath "$ARCHIVE" \
  -derivedDataPath "$ROOT/build/dd" \
  DEVELOPMENT_TEAM=V45QZXMDAW \
  CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO CODE_SIGN_IDENTITY=""

echo "→ ad-hoc signing the archived bundles so the export keeps their entitlements"
APP="$ARCHIVE/Products/Applications/HideScoreTV.app"
codesign -s - -f --entitlements "$ROOT/HideScoreTopShelf/HideScoreTopShelf.entitlements" "$APP/PlugIns/HideScoreTopShelf.appex"
codesign -s - -f --entitlements "$ROOT/HideScoreTV/HideScoreTV.entitlements" "$APP"
codesign -d --entitlements :- "$APP" 2>/dev/null | grep -q application-groups \
  || { echo "app-group entitlement missing from the archive — refusing to export"; exit 1; }

echo "→ exporting + uploading"
PATH=/usr/bin:/bin:/usr/sbin:/sbin xcodebuild -exportArchive \
  -archivePath "$ARCHIVE" -exportPath "$ROOT/build/export" \
  -exportOptionsPlist "$ROOT/ExportOptions.plist" \
  -allowProvisioningUpdates \
  -authenticationKeyPath "$KEY" \
  -authenticationKeyID "$ASC_KEY_ID" \
  -authenticationKeyIssuerID "$ASC_ISSUER_ID"

# A CLI archive never reaches Xcode's Organizer, which only scans this folder.
# Copy it there so there is always a GUI fallback for the same build.
DEST="$HOME/Library/Developer/Xcode/Archives/$(date +%Y-%m-%d)"
mkdir -p "$DEST" && cp -R "$ARCHIVE" "$DEST/" 2>/dev/null || true

echo "→ uploaded. Next: tools/submit.py attach <build>, then submit.py submit"
