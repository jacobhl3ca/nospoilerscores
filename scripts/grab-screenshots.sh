#!/bin/bash
# Step through App Store screenshot captures.
# Run, then in the simulator: tap the state you want, switch back to terminal, press Enter.
# Quit anytime with Ctrl+C.

set -u
DIR="$(cd "$(dirname "$0")/.." && pwd)/screenshots"
mkdir -p "$DIR"

# Re-apply App Store-style status bar override (9:41, full bars, 100% charged).
xcrun simctl status_bar booted override \
  --time "9:41" --batteryState charged --batteryLevel 100 \
  --cellularBars 4 --wifiBars 3 >/dev/null 2>&1 || true

shots=("01-today" "02-ratings-on" "03-news" "04-tomorrow" "05-game-detail" "06-extra")
hints=(
  "default Today view, scores hidden"
  "tap the orange monkey icon (top-right) to reveal ratings"
  "tap the newspaper icon (top-right) for news view"
  "tap the 'Tomo' tab for tomorrow's games"
  "tap a game card to open detail"
  "anything else worth showing"
)

for i in "${!shots[@]}"; do
  echo ""
  echo "[$((i+1))/${#shots[@]}] Set up: ${hints[$i]}"
  read -r -p "    Press Enter to capture (or 's' + Enter to skip): " ans
  if [[ "$ans" == "s" ]]; then
    echo "    skipped"
    continue
  fi
  out="$DIR/${shots[$i]}.png"
  xcrun simctl io booted screenshot "$out" >/dev/null 2>&1
  echo "    saved: $out"
done

echo ""
echo "Done. Files:"
ls -1 "$DIR"
