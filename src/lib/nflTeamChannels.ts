// The 32 NFL club YouTube channels — verified data for a route that is CLOSED.
//
// ⛔ READ THIS BEFORE TRYING THE CLUB FALLBACK AGAIN. It has now been explored
// three times. The idea is sound on paper: "NFL" is in EMBED_BLOCKED_CHANNELS
// (youtube.ts) because every league upload fires IFrame error 150, so the modal
// can only hand off to youtube.com — and unlike F1, the NFL appears to have a
// second source in the two clubs playing. The clubs DO carry the games:
// measured 2026-08-10 against the live worker over the full Week 15 2025 slate,
// 9 of 16 games resolved a correct-week club package with a clean title
// ("Highlights: Ravens vs. Bengals, Week 15 | Baltimore Ravens").
//
// ⛔ But club GAME FOOTAGE is embed-blocked too, exactly like the league's.
// Measured with scripts/check-embeddable.mjs, control included as that script
// demands:
//     Giants   "Highlights: Giants vs. Commanders | Week 15"   ERROR 150
//     Bears    "Bears' top plays vs. Browns | Week 15"         ERROR 150
//     Ravens   "Highlights: Ravens vs. Bengals, Week 15"       ERROR 150
//     Chargers "Chargers Week 15 Highlights Vs Chiefs"         ERROR 150
//     NFL      "…Game Highlights | NFL 2025 Season Week 1"     ERROR 150
//     DAZN Boxing control                                      PLAYS
// and, decisively, in the same sessions:
//     Bears    "Gervon Dexter Sr. … | Press Conference"        PLAYS
//     Bears    "Dennis Allen on early impressions…"            PLAYS
// So the block follows GAME FOOTAGE league-wide, not the channel. That is what
// makes an earlier read of "Bears and Chiefs uploads embed fine" wrong — those
// were press-conference/social uploads, not highlight packages.
//
// ⇒ A club clip cannot play in the masked player either, so routing slot 2 to
// the clubs buys nothing: it would swap one hand-off-to-YouTube button for
// another, at the cost of a live scrape on every finished NFL card. The wiring
// was written and then reverted on this evidence. There is no in-app NFL
// highlight playback to be had short of the league turning embedding back on.
//
// What is kept here is the expensive part — the verified names. Nothing below
// is guessed, and the traps are why:
//   • Six obvious slugs are EMPTY SQUATTED channels whose channel title is
//     literally the slug: @clevelandbrowns @denverbroncos @greenbaypackers
//     @indianapoliscolts @minnesotavikings @NewEnglandPatriots. The real ones
//     are @Browns @Broncos @packers @colts @Vikings @Patriots.
//   • @Cardinals is the MLB St. Louis Cardinals; @Lions is 埼玉西武ライオンズ, a
//     Japanese baseball club.
//   • The Raiders dropped the city from their channel title — it is bare
//     "Raiders", not "Las Vegas Raiders".
// Every name is the channel's own RSS <author><name>, resolved from the handle
// via <link rel="canonical">, and re-checkable by
// scripts/check-nfl-team-channels.mjs, which reads THIS table.
//
// ⚠️ If the route is ever reopened, the query must be keyed by WEEK, not date.
// Clubs title by week and never by date; the app's date-keyed query returned
// "No results" on ten of twelve club lookups, while the same games resolved
// week-keyed. The week gate already exists (/api/youtube?week=N, and
// Game.weekNumber, regular season only).
//
// Keyed by ESPN's team abbreviation. ⚠️ Washington is WSH on ESPN, not WAS.
export const NFL_TEAM_CHANNELS: Record<string, { channel: string; handle: string }> = {
  ARI: { channel: "Arizona Cardinals", handle: "AZCardinals" },
  ATL: { channel: "Atlanta Falcons", handle: "atlantafalcons" },
  BAL: { channel: "Baltimore Ravens", handle: "baltimoreravens" },
  BUF: { channel: "Buffalo Bills", handle: "buffalobills" },
  CAR: { channel: "Carolina Panthers", handle: "carolinapanthers" },
  CHI: { channel: "Chicago Bears", handle: "chicagobears" },
  CIN: { channel: "Cincinnati Bengals", handle: "bengals" },
  CLE: { channel: "Cleveland Browns", handle: "Browns" },
  DAL: { channel: "Dallas Cowboys", handle: "dallascowboys" },
  DEN: { channel: "Denver Broncos", handle: "Broncos" },
  DET: { channel: "Detroit Lions", handle: "detroitlionsnfl" },
  GB: { channel: "Green Bay Packers", handle: "packers" },
  HOU: { channel: "Houston Texans", handle: "houstontexans" },
  IND: { channel: "Indianapolis Colts", handle: "colts" },
  JAX: { channel: "Jacksonville Jaguars", handle: "jaguars" },
  KC: { channel: "Kansas City Chiefs", handle: "kansascitychiefs" },
  LAC: { channel: "Los Angeles Chargers", handle: "chargers" },
  LAR: { channel: "Los Angeles Rams", handle: "LARams" },
  // Bare "Raiders" is correct — the club dropped the city from its channel
  // title. Verified via @Raiders → RSS; "Las Vegas Raiders" is not the name.
  LV: { channel: "Raiders", handle: "Raiders" },
  MIA: { channel: "Miami Dolphins", handle: "miamidolphins" },
  MIN: { channel: "Minnesota Vikings", handle: "Vikings" },
  NE: { channel: "New England Patriots", handle: "Patriots" },
  NO: { channel: "New Orleans Saints", handle: "neworleanssaints" },
  NYG: { channel: "New York Giants", handle: "nygiants" },
  NYJ: { channel: "New York Jets", handle: "nyjets" },
  PHI: { channel: "Philadelphia Eagles", handle: "eagles" },
  PIT: { channel: "Pittsburgh Steelers", handle: "steelers" },
  SEA: { channel: "Seattle Seahawks", handle: "Seahawks" },
  SF: { channel: "San Francisco 49ers", handle: "49ers" },
  TB: { channel: "Tampa Bay Buccaneers", handle: "buccaneers" },
  TEN: { channel: "Tennessee Titans", handle: "titans" },
  WSH: { channel: "Washington Commanders", handle: "commanders" },
};

const NFL_TEAM_CHANNEL_SET = new Set(Object.values(NFL_TEAM_CHANNELS).map((t) => t.channel));

// The clubs to try, in order, for one game — kept for whoever reopens this.
// Both, because coverage is per-GAME, not per-club: over the Week 15 slate a
// single club had the clip about half the time, and the pair together covered
// 9 of 16. Home first, since the host club posted the fuller cut more often.
export function nflTeamChannelChain(
  awayAbbr: string | null | undefined,
  homeAbbr: string | null | undefined,
): string[] {
  const chain = [homeAbbr, awayAbbr]
    .map((a) => (a ? NFL_TEAM_CHANNELS[a.toUpperCase()]?.channel : undefined))
    .filter((c): c is string => !!c);
  return [...new Set(chain)];
}

// One more thing the reopening would need: a club channel's title bar would
// have to stay MASKED, unlike every other team-sport uploader. The league's own
// recaps are house-styled and carry nothing, but a club cuts its own player
// reels and names the stat line — both of these are real, from the same sweep:
//   "Kirk Cousins highlights from 3-TD game vs. Tampa Bay Buccaneers"
//   "Highlights: Drake Maye's Best Plays From 2-TD Game vs. Bills"
// That is a full spoiler on the one number the card hides, and SPOILER_RX has
// no hook for it (no score, no verb) — it would need the UFC/DAZN treatment:
// channelAlwaysMasksTitle. Unused while the route stays closed.
export function isNflTeamChannel(channel: string | null | undefined): boolean {
  return !!channel && NFL_TEAM_CHANNEL_SET.has(channel);
}
