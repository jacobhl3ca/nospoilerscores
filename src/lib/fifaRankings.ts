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
  "bosnia-herzegovina": 64,
  "cape verde": 67,
  "ghana": 73,
  "curacao": 82,
  "haiti": 83,
  "new zealand": 85,
};

// Normalize a team display name (lowercase, strip diacritics) for lookup.
export function fifaRank(displayName: string): number | null {
  const key = displayName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
  return RANKS[key] ?? null;
}
