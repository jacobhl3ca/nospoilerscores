import type { Sport } from "./types.ts";

// The Settings league picker's search box (Jacob 10/17: make leagues work like
// Favorite teams, search first). Each league matches on its catalog label, its
// Settings name, its key and the words below, so "prem", "college football" or
// "6 nations" all find the right chip. A league's words are kept as separate
// phrases and a query must fit inside ONE of them: "champions cup" finds the
// rugby Champions Cup, not the UCL ("champions league" + "european cup"), and
// "rugby league" finds the NRL, not Major League Rugby. The group label is NOT
// in the haystack: "Racing, combat & more" would make "racing" match rugby.
export type LeagueSearchKey = Sport | "topnews";

export const LEAGUE_KEYWORDS: Record<LeagueSearchKey, string[]> = {
  nfl: ["football", "american football", "pro football", "national football league", "gridiron", "sunday"],
  ufl: ["spring football", "xfl", "usfl"],
  nba: ["basketball", "pro basketball", "hoops"],
  wnba: ["womens basketball"],
  mlb: ["baseball", "major league baseball"],
  nhl: ["hockey", "ice hockey"],
  ncaah: ["college hockey", "frozen four"],
  cfl: ["canadian football", "canada", "grey cup"],
  ncaawh: ["college hockey", "womens hockey"],
  ncaavb: ["college volleyball", "volleyball"],
  ncaaf: ["college football", "cfb", "fbs", "bowl games", "cfp", "playoff", "saturday"],
  ncaam: ["college basketball", "march madness", "ncaa tournament", "cbb"],
  ncaaw: ["womens college basketball", "march madness"],
  llws: ["little league world series", "youth baseball", "williamsport"],
  ncaabase: ["college baseball", "college world series", "cws"],
  ncaasoft: ["college softball", "softball"],
  // Soccer: every club and national-team competition also answers to
  // "soccer", "football" and "futbol". College soccer only to "soccer", so
  // "college football" stays the NCAAF alone.
  epl: ["soccer", "football", "futbol", "english premier league", "epl", "england", "english", "prem", "bpl"],
  mls: ["soccer", "football", "futbol", "major league soccer", "usa", "american soccer"],
  ucl: ["soccer", "football", "futbol", "champions league", "uefa", "europe", "european cup"],
  uel: ["soccer", "football", "futbol", "europa league", "uefa"],
  laliga: ["soccer", "football", "futbol", "spain", "spanish", "liga", "primera division"],
  seriea: ["soccer", "football", "futbol", "italy", "italian", "calcio"],
  bundesliga: ["soccer", "football", "futbol", "germany", "german"],
  ligue1: ["soccer", "football", "futbol", "france", "french"],
  ligamx: ["soccer", "football", "futbol", "mexico", "mexican"],
  nwsl: ["soccer", "football", "futbol", "womens soccer"],
  efl: ["soccer", "football", "futbol", "efl", "english championship", "second tier", "england"],
  libertadores: ["soccer", "football", "futbol", "copa libertadores", "south america", "conmebol"],
  euro: ["soccer", "football", "futbol", "euros", "european championship", "national teams"],
  afcon: ["soccer", "football", "futbol", "africa cup of nations", "africa", "caf"],
  saudi: ["soccer", "football", "futbol", "saudi pro league", "saudi arabia", "roshn"],
  uecl: ["soccer", "football", "futbol", "conference league", "europa conference"],
  facup: ["soccer", "football", "futbol", "fa cup", "english cup"],
  copadelrey: ["soccer", "football", "futbol", "spain", "spanish cup", "kings cup"],
  dfbpokal: ["soccer", "football", "futbol", "dfb pokal", "german cup"],
  nations: ["soccer", "football", "futbol", "nations league", "uefa nations league", "national teams"],
  fifa: ["soccer", "football", "futbol", "world cup", "fifa world cup", "2026", "national teams", "international soccer"],
  ncaawsoc: ["soccer", "college soccer"],
  ncaamsoc: ["soccer", "college soccer"],
  golf: ["pga", "pga tour", "masters", "us open", "the open", "british open", "ryder cup", "liv"],
  tennis: ["atp", "wta", "grand slam", "wimbledon", "us open", "french open", "roland garros", "australian open", "itf"],
  f1: ["formula 1", "formula one", "grand prix", "racing", "motorsport"],
  nascar: ["stock car", "racing", "cup series", "daytona"],
  indycar: ["indy 500", "indianapolis", "open wheel", "racing"],
  ufc: ["mma", "mixed martial arts", "fighting", "octagon", "combat"],
  boxing: ["fight", "fights", "fighting", "combat", "heavyweight"],
  cricket: ["ipl", "indian premier league", "cricket", "t20", "india"],
  cricketintl: ["international cricket", "test cricket", "odi", "t20", "ashes"],
  chess: ["fide", "grandmaster"],
  poker: ["wsop", "world series of poker", "holdem", "cards"],
  climbing: ["bouldering", "ifsc", "sport climbing"],
  esports: ["gaming", "league of legends", "lol", "lec", "lck", "counter strike", "cs2", "dota", "valorant", "video games"],
  // Rugby union: every competition also answers to "rugby" and "rugby union".
  sixnations: ["rugby", "rugby union", "6 nations", "england", "ireland", "wales", "scotland", "france", "italy"],
  rugbywc: ["rugby", "rugby union", "rwc", "world cup"],
  rugbychamp: ["rugby", "rugby union", "investec", "heineken cup", "european rugby", "epcr"],
  superrugby: ["rugby", "rugby union", "pacific", "new zealand", "australia"],
  rugbytest: ["rugby", "rugby union", "internationals", "test match", "all blacks", "springboks", "wallabies", "lions"],
  nationschamp: ["rugby", "rugby union", "nations championship", "world rugby"],
  premrugby: ["rugby", "rugby union", "prem rugby", "english rugby", "gallagher"],
  urc: ["rugby", "rugby union", "united rugby championship", "celtic", "ireland", "wales", "scotland", "south africa"],
  top14: ["rugby", "rugby union", "french rugby", "france"],
  challengecup: ["rugby", "rugby union", "epcr", "european rugby"],
  mlr: ["rugby", "rugby union", "major league rugby", "american rugby", "us rugby"],
  nrl: ["rugby league", "national rugby league", "australia", "state of origin"],
  afl: ["aussie rules", "australian rules", "australian football", "footy"],
  best: ["best of yesterday", "yesterday", "best games"],
  top: ["espn", "front page", "top events", "headlines"],
  topnews: ["news", "headlines"],
};

// Lowercase, accents off, apostrophes dropped ("women's" → "womens"), any
// other punctuation a space.
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/['’‘`]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// One league's search phrases: its names (catalog label, Settings name), its
// key and its keywords, each normalized.
export function leagueHaystack(key: LeagueSearchKey, names: readonly string[]): string[] {
  const phrases = [...names, key, ...(LEAGUE_KEYWORDS[key] ?? [])].map(normalize).filter(Boolean);
  return [...new Set(phrases)];
}

// True when the query fits inside one phrase: its words are prefixes of a run
// of that phrase's words, in order ("col foot" → "college football"), or the
// whole query (3+ letters) is a substring of it ("remier" → "premier league").
// An empty query matches everything.
export function leagueMatches(haystack: readonly string[], query: string): boolean {
  const q = normalize(query);
  if (!q) return true;
  const qTokens = q.split(" ");
  return haystack.some((phrase) => {
    if (q.length >= 3 && phrase.includes(q)) return true;
    const pTokens = phrase.split(" ");
    for (let i = 0; i + qTokens.length <= pTokens.length; i++) {
      if (qTokens.every((t, j) => pTokens[i + j].startsWith(t))) return true;
    }
    return false;
  });
}
