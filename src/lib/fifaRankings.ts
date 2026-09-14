// FIFA Men's World Ranking snapshot, used to show each World Cup team's strength
// "coming into the tournament" in the groups overlay. SPOILER-SAFE: a world
// ranking is a fixed pre-tournament fact (Spain #2 globally), not a result or a
// live group position. Snapshotted 2026-06-16 from the qualified-teams table of
// the "2026 FIFA World Cup" Wikipedia article — one consistent ranking date
// (Argentina #1, Spain #2). Keyed by normalized team display name so it matches
// ESPN's names regardless of flag-code quirks (kors/rdc/Curaçao).
const RANKS: Record<string, number> = {
  "argentina": 1,
  "spain": 2,
  "france": 3,
  "england": 4,
  "portugal": 5,
  "brazil": 6,
  "morocco": 7,
  "netherlands": 8,
  "belgium": 9,
  "germany": 10,
  "croatia": 11,
  "colombia": 13,
  "mexico": 14,
  "senegal": 15,
  "uruguay": 16,
  "united states": 17,
  "japan": 18,
  "switzerland": 19,
  "iran": 20,
  "turkiye": 22,
  // Alias the everyday English "Turkey" to the official-name primary key — the
  // Korea Republic / IR Iran fix below, run the other direction. Here the
  // primary key "turkiye" already matches ESPN's fifa.world *standings* form
  // (FIFA's official "Türkiye" normalizes to "turkiye"), so the groups overlay
  // resolves. But the *scoreboard* displayName GameCard reads
  // (fifaRank(team.displayName)) can still carry the pre-2022-rebrand English
  // "Turkey", which normalizes to "turkey", misses, and hides the #22 rank chip
  // on the card. Alias to the same rank so the badge resolves whichever string
  // ESPN sends; the "turkiye" primary key stays put, so the standings-fed
  // overlay can't regress.
  "turkey": 22, // vs. "turkiye" (FIFA's official name)
  "ecuador": 23,
  "austria": 24,
  "south korea": 25,
  "australia": 27,
  "algeria": 28,
  "egypt": 29,
  "canada": 30,
  "norway": 31,
  "ivory coast": 33,
  "panama": 34,
  "sweden": 38,
  "czechia": 40,
  "paraguay": 41,
  "scotland": 42,
  "tunisia": 45,
  "congo dr": 46,
  "uzbekistan": 50,
  "qatar": 56,
  "iraq": 57,
  "south africa": 60,
  "saudi arabia": 61,
  "jordan": 63,
  // ESPN's fifa.world/standings displayName is the spelled-out "Bosnia and
  // Herzegovina" (see WorldCupBracket.tsx), which normalizes to
  // "bosnia and herzegovina" — not the Wikipedia short form "Bosnia-Herzegovina"
  // this table was seeded from. Key both spellings so the #64 rank resolves
  // whichever string ESPN sends; without the "and" form the groups overlay
  // showed "—" and sank the team to the bottom of its group.
  "bosnia and herzegovina": 64,
  "bosnia-herzegovina": 64,
  "cape verde": 67,
  // Same fix as the Korea/Iran block below: the groups overlay reads ESPN's
  // fifa.world *standings* endpoint (WorldCupGroupsModal), which labels teams
  // with FIFA's official names — and FIFA/CAF officially render this nation as
  // "Cabo Verde", not the everyday "Cape Verde" this table was seeded with.
  // Without the alias the standings string normalizes to "cabo verde", misses
  // the "cape verde" key, and the team shows "—" and sinks to the bottom of its
  // group. Alias to the same rank; the "cape verde" primary key stays put, so
  // the scoreboard-fed lookup (GameCard) can't regress.
  "cabo verde": 67, // vs. "cape verde" (FIFA's official name)
  "ghana": 73,
  "curacao": 82,
  "haiti": 83,
  "new zealand": 85,
  // Same fix as the Bosnia block above, for two more nations the snapshot keyed
  // under a form ESPN's fifa.world/standings is unlikely to send: ESPN commonly
  // renders these as "DR Congo" and "Ivory Coast"/"Côte d'Ivoire", which
  // normalize away from the "congo dr" / "ivory coast" primary keys. Alias each
  // to the same rank so the badge resolves whichever string ESPN sends; the
  // primary keys stay put, so no currently-working lookup can regress.
  "dr congo": 46, // vs. "congo dr"
  "cote d'ivoire": 33, // vs. "ivory coast" (FIFA's official French name)
  // Same fix again for the two nations FIFA lists under an official name that
  // differs from the everyday one this table was seeded with. The groups
  // overlay reads ESPN's fifa.world *standings* endpoint (WorldCupGroupsModal),
  // which labels teams with FIFA's official names — "Korea Republic" for South
  // Korea and "IR Iran" for Iran — not the "South Korea"/"Iran" forms the
  // scoreboard sends. Without these aliases those two showed "—" and sank to the
  // bottom of their group in the overlay. Alias to the same rank; the "south
  // korea"/"iran" primary keys stay put, so no scoreboard lookup can regress.
  "korea republic": 25, // vs. "south korea" (FIFA's official name)
  "ir iran": 20, // vs. "iran" (FIFA's official name)
};

// Normalize a team display name (lowercase, strip diacritics, fold typographic
// apostrophes) for lookup.
export function fifaRank(displayName: string): number | null {
  const key = displayName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    // Fold curly apostrophes (\u2019 U+2019, \u2018 U+2018) to the straight ASCII ' the
    // keys use \u2014 NFD leaves them untouched, so the sole apostrophe key
    // ("cote d'ivoire", added when ESPN began sending the French "C\u00f4te
    // d'Ivoire" form) missed whenever ESPN's string carried the typographic \u2019
    // that properly-rendered French names use, hiding the #33 rank chip. Same
    // "normalize away an insignificant character variant" intent as the
    // diacritic strip above; a straight-apostrophe or apostrophe-free name is
    // unaffected.
    .replace(/[\u2018\u2019]/g, "'")
    .toLowerCase()
    .trim();
  return RANKS[key] ?? null;
}
