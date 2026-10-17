// Default TV chip for leagues whose ESPN feed lists no broadcaster. ESPN sends
// `broadcasts: []` for every rugby game (read 2026-10-17), so a Champions Cup
// card had no chip at all. The rights differ by country, so the card picks the
// viewer's (lib/viewerCountry.ts) at render time, on the client: the prebake
// runs on a server that does not know who is reading. Pure and import-free:
// `node --test` loads it directly.

export type RightsHolder = { label: string; url: string };

const FLORUGBY: RightsHolder = { label: "FloRugby", url: "https://www.florugby.com/" };
// UK + Ireland: Premier Sports carries every game, TNT Sports a share of them
// (and ITV the finals). One label, the one with all the games.
const PREMIER: RightsHolder = { label: "Premier Sports", url: "https://www.premiersports.com/" };
const BEIN_FR: RightsHolder = { label: "beIN SPORTS", url: "https://www.beinsports.com/fr-fr/" };
const DAZN: RightsHolder = { label: "DAZN", url: "https://www.dazn.com/" };
const SUPERSPORT: RightsHolder = { label: "SuperSport", url: "https://supersport.com/rugby" };
// EPCR's own stream, for every country with no broadcaster deal.
const EPCR_TV: RightsHolder = { label: "EPCR TV", url: "https://epcrugby.tv/" };

// EPCR rights 2026/27 (both cups; DAZN deal runs 2026/27–2027/28). Sources in
// the PR: EPCR + DAZN release, FloSports/EPCR extension, Rugby World guide.
const EPCR_BY_COUNTRY: Record<string, RightsHolder> = {
  US: FLORUGBY, CA: FLORUGBY,
  GB: PREMIER, IE: PREMIER,
  FR: BEIN_FR, MC: BEIN_FR,
  ZA: SUPERSPORT,
  // DAZN: Italy, Poland, Nordics, Baltics, Benelux, DACH, MENA, Japan, Brazil, Romania.
  IT: DAZN, SM: DAZN, VA: DAZN, PL: DAZN, RO: DAZN, JP: DAZN, BR: DAZN,
  DK: DAZN, SE: DAZN, NO: DAZN, FI: DAZN, IS: DAZN,
  EE: DAZN, LV: DAZN, LT: DAZN,
  BE: DAZN, NL: DAZN, LU: DAZN,
  DE: DAZN, AT: DAZN, CH: DAZN, LI: DAZN,
  AE: DAZN, QA: DAZN, SA: DAZN, KW: DAZN, BH: DAZN, OM: DAZN, JO: DAZN, LB: DAZN,
  IQ: DAZN, EG: DAZN, MA: DAZN, DZ: DAZN, TN: DAZN,
};

// EPCR's own where-to-watch page lists every country's broadcaster. Used when
// the country is not known (no zone match, or a code the table above and the
// Settings list do not have).
const WHERE_TO_WATCH: Record<string, string> = {
  rugbychamp: "https://www.epcrugby.com/champions-cup/where-to-watch-the-investec-champions-cup",
  challengecup: "https://www.epcrugby.com/challenge-cup/where-to-watch-the-epcr-challenge-cup",
};

// `knownCountries` = the countries the zone table and the Settings picker can
// return; a known country with no deal gets EPCR TV, an unknown one gets the
// where-to-watch page. Null = this league has no default chip.
export function rightsHolder(sport: string, country: string, knownCountries: readonly string[] = []): RightsHolder | null {
  const page = WHERE_TO_WATCH[sport];
  if (!page) return null;
  if (EPCR_BY_COUNTRY[country]) return EPCR_BY_COUNTRY[country];
  if (country && knownCountries.includes(country)) return EPCR_TV;
  return { label: "Where to watch", url: page };
}
