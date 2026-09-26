#!/bin/bash
# Uploads the recap archive's month files (public/news/recaps/<YYYY-MM>.json)
# that the last bake changed, to R2 at news/recaps/<name>. The bake lists them
# in public/news/recaps/.pending-upload (see bakeLeagueRecaps in
# scripts/prebake-news.mjs); a name leaves the list only once its upload
# lands, so a failure is retried on the next run and an unchanged month is
# never uploaded again. Called by the mini's prebake job and the manual GHA
# workflow after their public/news/*.json loops.
#
# WRANGLER = the wrangler binary (default: `wrangler` on PATH). Exits non-zero
# when any upload failed.
set -u
cd "$(dirname "$0")/.." || exit 1
DIR="public/news/recaps"
LIST="$DIR/.pending-upload"
WRANGLER="${WRANGLER:-wrangler}"
[ -s "$LIST" ] || exit 0

left=""
failures=0
while IFS= read -r name; do
  case "$name" in
    [0-9][0-9][0-9][0-9]-[0-9][0-9].json) ;;
    *) continue ;;
  esac
  [ -f "$DIR/$name" ] || continue
  ok=0
  for attempt in 1 2 3; do
    if "$WRANGLER" r2 object put "hidescore-data/news/recaps/$name" --file "$DIR/$name" --remote --content-type application/json; then
      ok=1
      break
    fi
    [ "$attempt" -lt 3 ] && sleep $((attempt * 10))
  done
  if [ "$ok" = 1 ]; then
    echo "recap archive: uploaded $name"
  else
    echo "ERROR: recap archive upload failed 3x for $name; kept for the next run"
    left="$left$name"$'\n'
    failures=$((failures + 1))
  fi
done < "$LIST"

printf '%s' "$left" > "$LIST"
[ "$failures" -eq 0 ]
