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

// The tour URL (`lichess.org/broadcast/<tourSlug>/<tourId>`) lands on the
// CURRENT round's board list, and a round with any finished boards shows their
// "1-0"/"½-½" result right there — the leak Jacob flagged (A7). Lichess's own
// `round.url` (`.../<tourSlug>/<roundSlug>/<roundId>`) opens straight on that
// round's boards instead, and when `round.ongoing` is true there is no
// earlier-round leak (a board already finished within that live round is
// unavoidable — Lichess has no results-hiding mode). Falls back to the tour
// URL (then the organizer's own site) whenever the round isn't ongoing or
// Lichess omitted its url, so a quiet day or an older payload degrades to the
// pre-A7 behaviour rather than a dead link.
export function buildChessEventUrl(tour: {
  url?: string | null;
  website?: string | null;
  round?: { url?: string | null; ongoing?: boolean } | null;
}): string | undefined {
  const round = tour.round;
  if (round?.ongoing && round.url) return round.url;
  return tour.url ?? tour.website ?? undefined;
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

// ── Which event belongs on a board day ──────────────────────────────────────

// ⚠️ ESPN's UNDATED scoreboard is NOT "current or next" for every series, and
// the difference is a spoiler leak. Measured 2026-08-10:
//   /racing/f1/scoreboard             → Heineken Dutch GP, Aug 21, state "pre"
//   /racing/nascar-premier/scoreboard → NASCAR at Iowa,    Aug  9, state "post"
//   /racing/irl/scoreboard            → Grand Prix of Portland, Aug 9, "post"
// So on the Today tab — which has no race of its own — F1 correctly showed the
// NEXT race while NASCAR and IndyCar showed SUNDAY'S FINISHED one, complete
// with its highlight button (Jacob 8/10: "nascar showing a highlight on today,
// rather than yesterday and before"). A finished race is the right tile on the
// day it ran and on every day after it *within a past view*; it is never the
// right tile on today or a future day, where the answer is the next race.
//
// This is the tile-level mirror of the walk-BACK in fetchLeagueEvent: a past
// board never surfaces a future event, and a present/future board never
// surfaces a stale finished one. Both directions, one rule.
//
// `boardYmd`/`todayYmd`/`eventYmd` are YYYYMMDD in the effective time zone
// (etSlateYmd), so the comparisons are plain string compares.
export function isStaleFinishedForBoard(
  boardYmd: string,
  todayYmd: string,
  eventYmd: string,
  state: "pre" | "in" | "post",
): boolean {
  if (state !== "post") return false;
  // A PAST tab is exactly where a finished event belongs — that is the whole
  // point of the walk-back, and of the highlight button.
  if (!boardYmd || !todayYmd || boardYmd < todayYmd) return false;
  // An unparseable event date is not evidence of staleness (fromYmd's lesson:
  // a NaN comparison silently answers "no" and would have hidden every tile).
  if (!eventYmd) return false;
  return eventYmd < boardYmd;
}

// ── Tile text that has to fit ───────────────────────────────────────────────
//
// The single-event tile (races, boxing, chess, poker) gives its title ONE line
// beside a 16/24px glyph and nothing else — there is no score, no record, no
// second team to trade width with. So a long title had no way out and just
// clipped: "Heineken Dutch Grand …" over "Circuit Park Zandvoort · Zan…"
// (Jacob 8/10). Truncation is the WORST outcome here, because on a race tile
// the truncated tail is the identity of the race.
//
// The fix is the ladder pattern this codebase already uses for fighter names
// and the golf leaderboard: offer progressively shorter RENDERINGS of the same
// fact, measure, and take the longest one that fits — then, only after the
// shortest rendering still doesn't fit, step the font down, and only then
// truncate. Nothing here ever renders text LARGER than the class it started at
// (see EventCard's fitted() cap): a tile title tracks the team-name size and
// stops there, so it cannot outgrow the MLB card beside it.
//
// Every variant below is a real shortening, never an abbreviation invented at
// runtime — the F1 sponsor set and the NASCAR/IndyCar prefixes are curated and
// guarded by scripts/check-race-titles.mjs against the live season.

// F1 title sponsors, exactly as ESPN prints them at the START of an event name.
// Read off the full 2026 calendar (all 25 rounds) on 2026-08-10.
//
// ⚠️ This is a LIST, not a regex, on purpose. "Strip the words before the GP
// name" looks derivable and is not: it turns "Mexico City GP" into "City GP",
// "MSC Cruises United States GP" into "States GP", and "MSC Cruises São Paulo
// GP" into "Paulo GP". Sponsors also rotate every season, so an unlisted one
// simply doesn't strip — the tile falls through to the font step and keeps the
// full, correct name. Failing to shorten is cosmetic; shortening wrongly names
// the wrong race.
export const F1_TITLE_SPONSORS: string[] = [
  "Qatar Airways",
  "Singapore Airlines",
  "Etihad Airways",
  "Moët & Chandon",
  "MSC Cruises",
  "Crypto.com",
  "Tag Heuer",
  "Gulf Air",
  "Heineken",
  "Lenovo",
  "Pirelli",
  "Aramco",
  "AWS",
  "STC",
];

// Drop a known title sponsor from the front of an F1 event name.
// "Heineken Dutch GP" → "Dutch GP"; "Monaco GP" → "Monaco GP" (no sponsor).
export function stripF1Sponsor(name: string): string {
  const n = String(name || "").trim();
  for (const s of F1_TITLE_SPONSORS) {
    if (n.toLowerCase().startsWith(s.toLowerCase() + " ")) {
      return n.slice(s.length).trim();
    }
  }
  return n;
}

// ESPN names every points-paying NASCAR race "NASCAR Cup Series at <track>" —
// four words of column header repeated inside the tile, which is what pushed
// the track (the only part that varies) off the end. Verified against all 40
// rounds of 2026: the prefix appears on 36 of them; the four that don't carry
// it ("Daytona 500", "Clash at Bowman Gray", "Duel #1/#2") are already short
// and pass through untouched.
export function stripNascarSeriesPrefix(name: string): string {
  return String(name || "")
    .replace(/^NASCAR\s+Cup\s+Series\s+(?:at\s+)?/i, "")
    .trim() || String(name || "").trim();
}

// "Grand Prix of St. Petersburg" → "St. Petersburg GP". IndyCar's names are all
// of this one shape (14 of 18 rounds in 2026); the rest — "Indianapolis 500" —
// don't match and pass through. Keeps the place FIRST, where a truncation can
// no longer eat it.
export function shortenIndycarTitle(name: string): string {
  const m = /^Grand\s+Prix\s+of\s+(.+)$/i.exec(String(name || "").trim());
  return m ? `${m[1].trim()} GP` : String(name || "").trim();
}

// The title ladder for one tile, longest first, de-duplicated. `shortTitle` is
// ESPN's own shortName where it has one (F1: "Heineken Dutch GP" for "Heineken
// Dutch Grand Prix") — always preferred over anything computed here.
export function eventTitleVariants(
  title: string,
  shortTitle?: string,
  series?: "f1" | "nascar" | "indycar",
): string[] {
  const full = String(title || "").trim();
  const out = [full];
  const push = (v: string) => { if (v && !out.includes(v)) out.push(v); };
  const short = String(shortTitle || "").trim();
  push(short);
  if (series === "f1") {
    push(stripF1Sponsor(short || full));
  } else if (series === "nascar") {
    push(stripNascarSeriesPrefix(full));
  } else if (series === "indycar") {
    push(shortenIndycarTitle(full));
  }
  return out.filter(Boolean);
}

// ESPN lower-cases the tail of multi-word race cities — "Monte carlo",
// "Mexico city", "Sao paulo", "Abu dhabi", "Kuala lumpur" (all five live on the
// 2026 F1 calendar). Title-case each word so the subtitle doesn't read like a
// typo. Deliberately dumb: it only ever touches the FIRST letter of each word.
// An all-caps state/region code ("TX", "IA", "PQ") already starts uppercase, so
// it comes out unchanged; short function words inside a name ARE capitalized too
// ("Circuit of the Americas" → "Circuit Of The Americas"), which reads fine for
// these terse venue/city subtitles (see the eventSubtitleVariants test).
//
// Unicode-aware on purpose. The old `/\b[a-z]/` keyed on JS's ASCII-only word
// boundary, so an accented letter counted as a NON-word char and manufactured a
// false boundary right after it: "são paulo" title-cased the letter following
// the "ã" and rendered "SãO Paulo" (likewise "MontréAl", "MáLaga"). ESPN's
// diacritic-stripped feed hides that today, but a place name that keeps its
// accents must not be mangled. `\p{Ll}` at a start-or-non-letter boundary
// uppercases only a real word-initial lowercase letter; every ASCII case above
// is byte-for-byte unchanged.
export function titleCasePlace(s: string): string {
  return String(s || "").replace(/(^|[^\p{L}])(\p{Ll})/gu, (_, sep, ch) => sep + ch.toUpperCase());
}

// The subtitle ladder: "<venue> · <city>, <region>" → "<venue> · <city>" →
// "<venue>". The venue is the last thing to go — it's the identity of the
// track, where the city is context you can usually infer from the race name.
export function eventSubtitleVariants(venue: string, city: string, region: string): string[] {
  const v = titleCasePlace(String(venue || "").trim());
  const c = titleCasePlace(String(city || "").trim());
  // Title-case the region too. It rides the same ESPN address object as the city
  // (F1 circuit.address.country, the generic branch's venue.address.state/country)
  // and gets the same lowercased tail — "United arab emirates", "Saudi arabia",
  // "North carolina" — so without this the subtitle read like a typo right after
  // a correctly-cased city. IndyCar's hand-cased map values ("TX", "Ontario") and
  // any already-correct region are byte-identical no-ops through titleCasePlace.
  const r = titleCasePlace(String(region || "").trim());
  const loc = [c, r].filter(Boolean).join(", ");
  const out: string[] = [];
  const push = (x: string) => { if (x && !out.includes(x)) out.push(x); };
  // No trailing `push(loc)`: a venue-less event already reaches the location
  // through the first two rungs (they degrade to "<city>, <region>" and
  // "<city>"), and appending it here would put a LONGER string after a shorter
  // one — the ladder is only sound while it runs longest-first.
  push([v, loc].filter(Boolean).join(" · "));
  push([v, c].filter(Boolean).join(" · "));
  push(v);
  // Last rung: the bare city. Only reachable on the tight 3-column mobile board
  // (~82px of line at the 9px floor), where "Circuit Park Zandvoort" still
  // overflows by 32px and the alternative is an ellipsis. A place name that
  // fits beats a track name that doesn't — and it's the feed's own city, not a
  // word chopped off the venue.
  push(c);
  return out;
}
