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
  // A malformed/empty game.date makes an Invalid Date, whose toLocaleDateString
  // returns "Invalid Date" — after sanitize that bakes a garbage key like
  // `mlb-bos-nyy-invaliddate` pointing at a card that was never prebaked, so the
  // OG unfurl silently breaks. Bail like the sibling guards above (and mirror the
  // isNaN guard weather.ts puts on the same new Date() pattern); the sole caller
  // already handles a null card.
  if (isNaN(d.getTime())) return null;
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
    // `name` falls through to `abbreviation` last, mirroring the `abbr`/`a`/`h`
    // chains and the guard above (which only requires `abbreviation ||
    // shortDisplayName`). Without it, a team carrying an abbreviation but empty
    // shortDisplayName AND displayName — all string fields default to "" in
    // parseTeam, so it passes the guard — would render a blank side on the card.
    away: { name: away.shortDisplayName || away.displayName || away.abbreviation, abbr: away.abbreviation || away.shortDisplayName, logo: away.logo },
    home: { name: home.shortDisplayName || home.displayName || home.abbreviation, abbr: home.abbreviation || home.shortDisplayName, logo: home.logo },
    dateLabel,
    league: leagueLabel || game.sport.toUpperCase(),
  };
}

/** The hidescore.com share link for a highlight: opens the clip in-app, unfurls as the matchup card. */
export function shareCardUrl(meta: ShareCardMeta, youtubeId?: string | null): string {
  const v = youtubeId ? `v=${encodeURIComponent(youtubeId)}&` : "";
  return `https://hidescore.com/?${v}c=${encodeURIComponent(meta.key)}`;
}

/** Everything a cold-loaded hidescore link needs to reopen one highlight modal. */
export interface HighlightShareParams {
  videoId?: string | null; // YouTube id — the short, stable ?v= form
  playbackUrl?: string | null; // direct HLS/MP4 stream (redd.it / streamff / MLB)
  embedUrl?: string | null; // Brightcove-style iframe (NHL recaps)
  imageUrl?: string | null; // image-post lightbox (i.redd.it)
  posterUrl?: string | null; // video poster/thumbnail — drives the link-preview image for VIDEO shares (image posts already preview via imageUrl→hi)
  sourceUrl?: string | null; // original source — the "Open on …" fallback
  sourceLabel?: string | null; // friendly source name ("r/worldcup")
  headline?: string | null; // post title, for the preview/text card
  cardKey?: string | null; // ?c= matchup-card key for the iMessage unfurl
  path?: string; // "/" (default) or "/watch" — see buildHighlightShareUrl
}

/**
 * Build the hidescore.com link that reopens THIS highlight in-app — so Copy link
 * shares a HideScore link (like YouTube's own copy-link gives a youtube.com
 * link), not the raw Reddit/source URL. YouTube clips need only ?v=<id> (the
 * modal re-embeds by id). Non-YouTube clips carry their media in h*-prefixed
 * params so a cold load can rebuild the modal (see the consumer in HomeContent);
 * the source URL/label/headline keep the "Open on …" button + title correct even
 * without the live feed. Returns null when there's nothing playable to encode,
 * so the caller can fall back to the plain source URL.
 */
export function buildHighlightShareUrl(p: HighlightShareParams): string | null {
  const sp = new URLSearchParams();
  // Primary media — one of these drives the modal's render mode. Prefer the
  // stable YouTube id; otherwise encode the direct stream/embed/image.
  if (p.videoId) sp.set("v", p.videoId);
  else if (p.playbackUrl) sp.set("hs", p.playbackUrl);
  else if (p.embedUrl) sp.set("he", p.embedUrl);
  else if (p.imageUrl) sp.set("hi", p.imageUrl);
  else return null; // nothing playable to deep-link → caller keeps the source URL
  if (p.sourceUrl) sp.set("hu", p.sourceUrl);
  if (p.sourceLabel) sp.set("hl", p.sourceLabel);
  if (p.headline) sp.set("ht", p.headline);
  // Poster for the social unfurl of a VIDEO share — the worker uses ?hp as the
  // OG image so the link previews the clip's still (redd.it / NHL / MLB videos).
  // Image posts already carry their picture in ?hi, so skip ?hp there.
  if (p.posterUrl && !p.imageUrl) sp.set("hp", p.posterUrl);
  if (p.cardKey) sp.set("c", p.cardKey);
  // A YouTube clip opened from /watch shares back to /watch, whose preview is
  // the generic HideScore card. On "/" the worker previews ?v= with the video
  // thumbnail, and a pasted link's thumbnail is often the result. Everything
  // else keeps "/": the ?c= matchup card and the h* media previews are built
  // by the worker there, and /watch cannot reopen an h* clip.
  const path = p.path === "/watch" && p.videoId && !p.cardKey ? "/watch" : "/";
  return `https://hidescore.com${path}?${sp.toString()}`;
}

/** "/watch" while the page is /watch, else "/" — the `path` for buildHighlightShareUrl. */
export function highlightSharePath(): string {
  if (typeof window === "undefined") return "/";
  return /^\/watch\/?$/.test(window.location.pathname) ? "/watch" : "/";
}
