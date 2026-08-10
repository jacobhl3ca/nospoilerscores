// Pure helpers for the event-tile columns (chess, boxing, IndyCar).
//
// They live here rather than in espn.ts for the same reason raceDetails.ts
// does: this file imports NOTHING, so `node --test --experimental-strip-types`
// can load it directly (espn.ts's extensionless `./types` import is not
// resolvable under plain node ESM). Everything below is a decision that used to
// be an unverifiable inline expression — see tests/event-tiles.test.ts.

// ── Chess ───────────────────────────────────────────────────────────────────

// How long past `endsAt` a Lichess broadcast may still claim to be running.
// Deliberately generous: a classical round can itself last 7h, and an organizer
// sometimes tacks a tiebreak day onto a tournament without moving endsAt, so a
// tighter grace would stamp Final on a game in progress.
const CHESS_STALE_LIVE_MS = 8 * 60 * 60 * 1000;

// The mirror image of fetchChessEvent's `hasStarted` guard: Lichess flips a tour
// to "in" when its window OPENS (hours before play), and does NOT reliably flip
// it back to "post" when the tournament ends. A broadcast whose window closed
// days ago keeps reporting "in", so the tile sat on "Live" for a tournament
// nobody was playing — and since the round-replay button only renders on a
// finished tile (showChessBtn in EventCard), the replay was unreachable for
// exactly the events that had one. `endsAt` is the close of the broadcast
// window, so well past it means over. A missing endsAt is left alone: an
// unknown end is not evidence of an end.
export function chessEventState(
  state: "pre" | "in" | "post",
  endsAt: number | null,
  now: number = Date.now(),
): "pre" | "in" | "post" {
  if (state !== "in" || endsAt == null) return state;
  return endsAt < now - CHESS_STALE_LIVE_MS ? "post" : state;
}

// ── Boxing ──────────────────────────────────────────────────────────────────

// boxing-data.com names the BROADCASTER; the PROMOTER is who posts the fight
// highlights. Every author_name below was read off the channel's own RSS
// (`/feeds/videos.xml?channel_id=…`, resolved from the @handle's
// <link rel="canonical">) on 2026-08-10 — never scraped from the channel page,
// for the reason CHESS_ORGANIZER_CHANNELS in espn.ts spells out. That check
// earned its keep here: @premierboxing is NOT the PBC channel (it resolves to
// "PremierBoxing", a reupload account); the real one is @premierboxingchampions
// → "Premier Boxing Champions".
//
// Order matters — first match wins, and a Sky-broadcast card is almost always
// also a DAZN or Matchroom card, so Sky sits last. A card whose broadcasters
// aren't in this table stays dark rather than guessing, and a wrong guess still
// fails closed: the worker's strict gate verifies the uploader, so a miss hides
// the button instead of playing someone else's fight.
export const BOXING_BROADCAST_CHANNELS: { rx: RegExp; channel: string; label: string }[] = [
  { rx: /\bDAZN\b/i, channel: "DAZN Boxing", label: "DAZN" },
  { rx: /\bMatchroom\b/i, channel: "Matchroom Boxing", label: "Matchroom" },
  { rx: /\b(?:Top\s*Rank|ESPN)/i, channel: "Top Rank Boxing", label: "Top Rank" },
  { rx: /\b(?:PBC|Premier\s*Boxing|Prime\s*Video|Amazon)\b/i, channel: "Premier Boxing Champions", label: "PBC" },
  { rx: /\bSky\s*Sports\b/i, channel: "Sky Sports Boxing", label: "Sky Sports" },
];

export function boxingChannelFor(
  broadcasts: string[] | undefined,
): { channel: string; label: string } | null {
  const all = (broadcasts ?? []).join(" ");
  if (!all.trim()) return null;
  const hit = BOXING_BROADCAST_CHANNELS.find((b) => b.rx.test(all));
  return hit ? { channel: hit.channel, label: hit.label } : null;
}

// The two surnames out of a boxing-data.com card title ("Shields vs. Scott",
// "Roach vs Zepeda: The Rematch") for the worker's title gate. That gate is an
// OR across tokens, so this is a backstop, not the primary filter — the strict
// channel gate plus a query carrying both names is what picks the fight; these
// tokens exist to reject the case where the promoter's channel has no clip for
// this card and YouTube offers up their most recent unrelated one instead.
export function buildBoxingTokens(title: string): string[] {
  return String(title || "")
    .split(/[:|]/)[0]
    .split(/\s+vs\.?\s+/i)
    .map((s) => s.replace(/\([^)]*\)/g, "").trim())
    .filter(Boolean)
    .slice(0, 2);
}

// "<A> vs <B> full fight" — the wording is measured, not chosen. Against the
// live resolver 2026-08-10, appending "highlights" AFTER "full fight" broke
// every channel tried (DAZN, Matchroom and Top Rank all went from a hit to
// "No results"), the same query-reordering effect the UFC note in EventCard
// documents. "full fight" alone resolved on DAZN, Matchroom, Top Rank and PBC.
// Surnames are enough on those four; Sky is the one that needs full names and
// misses on surnames, which fails closed (the button hides).
export function boxingHighlightQuery(title: string): string {
  const names = buildBoxingTokens(title);
  return `${names.length === 2 ? names.join(" vs ") : title} full fight`;
}

// ── IndyCar ─────────────────────────────────────────────────────────────────

// ⚠️ ESPN ships NO venue for IndyCar. Not "sometimes" — checked live against the
// whole 2026 calendar on 2026-08-10: 15 of the 18 events carry neither
// `competition.venue` nor `event.venue` (only Arlington, Markham and Washington
// do), so the tile rendered with no subtitle at all and you couldn't tell the
// Indy road course from the 500. Nothing here is derivable either: ESPN's names
// are generic where the series' are not — "Grand Prix of Illinois" is the
// Bommarito 500 at World Wide Technology Raceway, "Grand Prix of Alabama" is
// Barber, "Grand Prix of Ontario" is a street circuit in Markham.
//
// Hand-built from indycar.com's own 2026 schedule page (track name and city
// exactly as the series prints them). Keyed by ESPN's event name, lower-cased.
// This map WINS over ESPN's venue on the three it does supply — ESPN's copy is
// worse there ("washington " with a trailing space, lower-cased city). A race
// missing from the map falls back to ESPN's venue and then to no subtitle, so a
// new season's calendar degrades to the old behaviour, never to a wrong track.
// Guarded by scripts/check-indycar-tracks.mjs, which parses THIS table rather
// than keeping a second copy — run it when the season rolls.
export const INDYCAR_TRACKS: Record<string, { track: string; location: string }> = {
  "grand prix of st. petersburg":             { track: "Streets of St. Petersburg",       location: "St. Petersburg, Florida" },
  "grand prix of phoenix":                    { track: "Phoenix Raceway",                 location: "Avondale, Arizona" },
  "grand prix of arlington":                  { track: "Streets of Arlington",            location: "Arlington, Texas" },
  "grand prix of alabama":                    { track: "Barber Motorsports Park",         location: "Birmingham, Alabama" },
  "grand prix of long beach":                 { track: "Streets of Long Beach",           location: "Long Beach, California" },
  "grand prix of indianapolis (road course)": { track: "IMS Road Course",                 location: "Indianapolis, Indiana" },
  "indianapolis 500":                         { track: "Indianapolis Motor Speedway",     location: "Indianapolis, Indiana" },
  "grand prix of detroit":                    { track: "Streets of Detroit",              location: "Detroit, Michigan" },
  "grand prix of illinois":                   { track: "World Wide Technology Raceway",   location: "Madison, Illinois" },
  "grand prix of road america":               { track: "Road America",                    location: "Elkhart Lake, Wisconsin" },
  "grand prix of mid-ohio":                   { track: "Mid-Ohio Sports Car Course",      location: "Lexington, Ohio" },
  "grand prix of nashville":                  { track: "Nashville Superspeedway",         location: "Lebanon, Tennessee" },
  "grand prix of portland":                   { track: "Portland International Raceway",  location: "Portland, Oregon" },
  "grand prix of ontario":                    { track: "Streets of Markham",              location: "Markham, Ontario" },
  "grand prix of washington, d.c.":           { track: "Streets of Washington",           location: "Washington, D.C." },
  "grand prix of milwaukee race 1":           { track: "Milwaukee Mile",                  location: "West Allis, Wisconsin" },
  "grand prix of milwaukee race 2":           { track: "Milwaukee Mile",                  location: "West Allis, Wisconsin" },
  "grand prix of monterey":                   { track: "WeatherTech Raceway Laguna Seca", location: "Monterey, California" },
};

export function indycarTrackSubtitle(name: string): string | undefined {
  const t = INDYCAR_TRACKS[String(name || "").trim().toLowerCase()];
  return t ? `${t.track} · ${t.location}` : undefined;
}
