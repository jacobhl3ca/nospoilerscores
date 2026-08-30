#!/bin/bash
# Archives the Apple TV app and uploads it to App Store Connect. No Xcode GUI.
#
#   ./ship.sh              # archive + upload at the current version/build
#   ./ship.sh 1.1 2        # set MARKETING_VERSION / CURRENT_PROJECT_VERSION first
#
# Cloud signing needs an ADMIN App Store Connect API key — an App Manager key
# uploads fine but cannot create the iOS/tvOS Distribution certificate, and the
# failure lands on the EXPORT step, not the archive.
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
  -allowProvisioningUpdates \
  -authenticationKeyPath "$KEY" \
  -authenticationKeyID "$ASC_KEY_ID" \
  -authenticationKeyIssuerID "$ASC_ISSUER_ID" \
  DEVELOPMENT_TEAM=V45QZXMDAW

echo "→ exporting + uploading"
xcodebuild -exportArchive \
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
