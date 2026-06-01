// Share-card previews for highlight links.
//
// When a highlight link is shared into iMessage / Slack / Twitter, the unfurled
// preview should show the two teams + the date — not a generic site image or a
// spoiler-y YouTube thumbnail. The card PNG is rendered SERVER-SIDE in CI by
// scripts/prebake-share-cards.mjs (Node + node-canvas) and stored in R2 at
// `cards/<key>.png`; the Cloudflare worker swaps the page's OG meta to point at
// that image for any `?c=<key>` link (see public/_worker.js).
//
// Rendering deliberately does NOT happen in the browser: Firefox's
// resistFingerprinting randomizes canvas readback (toBlob/toDataURL), which
// corrupts the exported PNG. So the client's only job here is to build the
// share link; the card itself is produced off-device.
//
// The card key format is the contract between this file, the CI renderer, and
// the worker's validation regex + OG-title reconstruction — keep them in sync:
//   `${sport}-${awayAbbr}-${homeAbbr}-${YYYYMMDD}`   (all lowercased, ET date)

import type { Game } from "./types";

export interface ShareCardMeta {
  key: string;
  away: { name: string; abbr: string; logo: string };
  home: { name: string; abbr: string; logo: string };
  dateLabel: string; // "Fri · May 30, 2026"
  league: string; // "MLB"
}

const sanitize = (s: string) => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

/** Build the share-card metadata for a finished game. Derives a stable, ET-pinned key. */
export function buildShareCard(game: Game, leagueLabel?: string): ShareCardMeta | null {
  const away = game.awayTeam;
  const home = game.homeTeam;
  // TBD/placeholder teams (future playoff slots) can't make a meaningful card.
  if (!away?.abbreviation && !away?.shortDisplayName) return null;
  if (!home?.abbreviation && !home?.shortDisplayName) return null;

  const d = new Date(game.date);
  // ET calendar date → YYYYMMDD. en-CA renders as YYYY-MM-DD; strip dashes.
  const ymd = d
    .toLocaleDateString("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" })
    .replace(/-/g, "");
  const a = sanitize(away.abbreviation || away.shortDisplayName);
  const h = sanitize(home.abbreviation || home.shortDisplayName);
  if (!a || !h) return null;

  const key = `${game.sport}-${a}-${h}-${ymd}`;
  const dateLabel = d
    .toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "America/New_York" })
    .replace(", ", " · "); // "Fri, May 30, 2026" → "Fri · May 30, 2026"

  return {
    key,
    away: { name: away.shortDisplayName || away.displayName, abbr: away.abbreviation, logo: away.logo },
    home: { name: home.shortDisplayName || home.displayName, abbr: home.abbreviation, logo: home.logo },
    dateLabel,
    league: leagueLabel || game.sport.toUpperCase(),
  };
}

/** The hidescore.com share link for a highlight: opens the clip in-app, unfurls as the matchup card. */
export function shareCardUrl(meta: ShareCardMeta, youtubeId?: string | null): string {
  const v = youtubeId ? `v=${encodeURIComponent(youtubeId)}&` : "";
  return `https://hidescore.com/?${v}c=${encodeURIComponent(meta.key)}`;
}
