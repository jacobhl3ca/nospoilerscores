import type { Game } from "./types";

// Unordered team pair for a game — the identity of a "matchup". A playoff
// series is N games that all share one key. Falls back to the abbreviation
// because a few feeds (the aggregated soccer/racing paths) leave team.id blank
// and an empty-string key would collapse unrelated fixtures into one series.
export function matchupKey(g: Game): string {
  return [
    g.homeTeam.id || g.homeTeam.abbreviation,
    g.awayTeam.id || g.awayTeam.abbreviation,
  ].sort().join("|");
}

// ⚠️ A compact upcoming row prints only "@ HOME" — it DROPS the visiting team.
// That is safe ONLY when the reader can already see both teams on a full card
// above it. Two things put a matchup there: the lead card `firstFull` promotes
// (games[0]), and, for the call site that renders the lookahead underneath
// today's slate, today's own games (`alsoShown`).
//
// Anything else must stay a full card. An NBA opening-night triple-header
// compacted into "@ NY" / "@ SA" left the 76ers and Thunder off the board
// entirely, and every NBA/NHL off-day lookahead did the same to its whole
// slate. Playoff behaviour is unchanged: series games all share one key, and
// the conference round (two series in one column) still compacts because both
// matchups are named on today's cards.
export function compactableMatchups(
  games: Game[],
  firstFull: boolean,
  alsoShown: Game[] = [],
): Set<string> {
  const named = new Set(alsoShown.map(matchupKey));
  if (firstFull && games.length) named.add(matchupKey(games[0]));
  return named;
}
