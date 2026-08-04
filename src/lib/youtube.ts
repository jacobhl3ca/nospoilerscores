// Official YouTube channel names per league
const OFFICIAL_CHANNELS: Record<string, string> = {
  nba: "NBA",
  wnba: "WNBA",
  mlb: "MLB",
  nhl: "NHL",
  nfl: "NFL",
  ncaam: "March Madness",
  // NCAAW: same NCAA tournament uploader as NCAAM ("March Madness" channel
  // posts both men's and women's brackets). Regular-season games fall through
  // to the no-channel secondary search — same limitation NCAAM has.
  ncaaw: "March Madness",
  // NCAAF: ESPN College Football posts per-game recaps with title format
  // "Team A vs. Team B | Full Game Highlights | ESPN College Football".
  ncaaf: "ESPN College Football",
  // World Cup: FOX is the US English-language rightsholder and "FOX Sports"
  // posts a clean per-match "TeamA vs TeamB Highlights | 2026 FIFA World Cup™"
  // for every game. FIFA's own channel only posts alt-cast / limited clips, so
  // use the broadcaster — same pattern as EPL→NBC Sports, UCL→CBS Sports Golazo,
  // MLS→Major League Soccer. The worker further restricts WC results to an
  // official-channel allowlist (FOX Sports / FOX Soccer / FIFA) so the unscoped
  // "search" button can't serve fan re-uploads either.
  fifa: "FOX Sports",
  // EPL: Premier League's own YouTube channel posts only short clips
  // (broadcast rights restrict full game recaps). NBC Sports (US broadcaster)
  // uploads the actual game-by-game highlights with title format
  // "TeamA v. TeamB | PREMIER LEAGUE HIGHLIGHTS | M/D/YYYY | NBC Sports".
  epl: "NBC Sports",
  // MLS: the official channel is "Major League Soccer", not "MLS" —
  // the abbreviation never matched, so the labeled button always 404'd.
  mls: "Major League Soccer",
  // UCL / UEL: UEFA's own channel posts compilations not per-game recaps;
  // CBS Sports Golazo (US rights holder) posts per-match Extended Highlights
  // with title format "TeamA vs. TeamB: Extended Highlights | UCL [Round] |
  // CBS Sports Golazo". They only post the extended version (no standard
  // companion) — the worker's extended-vs-standard demote still picks them
  // because nothing else competes at the same tier.
  ucl: "CBS Sports Golazo",
  uel: "CBS Sports Golazo",
  // Serie A: Paramount+ / CBS holds the US rights, same as UCL/UEL, and the
  // same Golazo channel posts the per-match Extended Highlights.
  seriea: "CBS Sports Golazo",
  // Bundesliga: the league's own channel is the per-match highlight source.
  // Exact author_name verified 2026-08-03 via the channel RSS feed (it is
  // "Bundesliga", not "Bundesliga Official" or similar).
  bundesliga: "Bundesliga",
  // ── Leagues added 2026-08-03. Every string below is the exact YouTube
  // author_name, verified END-TO-END against the LIVE worker with strict=1 on
  // real completed fixtures (a strict hit proves both the string and that the
  // channel actually carries that match). Without these entries each league
  // fell through to the unscoped search, which measurably served junk: Liga MX
  // → club/aggregator uploads, NWSL → single-club channels, EFL → "Wrexham
  // AFC", Saudi PL → "Santos El Creador", Libertadores → nothing at all.
  //
  // Liga MX: TUDN is the Univision rightsholder. The MX feed posts the
  // per-match "RESUMEN Y GOLES I A vs B | Liga MX - Jornada N" recap and is
  // what the search consistently ranks; the sibling "TUDN USA" posts an
  // English "HIGHLIGHTS -" cut but ranks inconsistently, so it is NOT used —
  // a second channel here would only widen the strict gate, not deepen it.
  ligamx: "TUDN México",
  // NWSL: the league channel's author_name is the FULL name, not the
  // abbreviation — "NWSL" never matched. Club channels (Seattle Reign FC,
  // San Diego Wave FC) also post per-match highlights and were winning the
  // unscoped search, which is exactly the inconsistency the gate exists to
  // stop. CBS Sports Golazo's NWSL playlist is NOT a fallback: verified 0/3
  // on strict, its uploads aren't titled per-match the way UCL/UEL's are.
  nwsl: "National Women's Soccer League",
  // EFL Championship: the league's own channel, author_name is the bare
  // "EFL" (not "Sky Bet EFL", not "Sky Sports Football" — both verified 0/1).
  efl: "EFL",
  // Copa Libertadores: CONMEBOL's own channel carries the per-match cut.
  libertadores: "CONMEBOL Libertadores",
  // Saudi Pro League: the official channel's author_name is bilingual and
  // leads with the ARABIC name — the English-only "Saudi Pro League" and
  // "Roshn Saudi League" both verified 0/2. Keep this string byte-exact.
  saudi: "الدوري السعودي للمحترفين - Saudi Pro League",
  // AFCON: CAF's own channel ("CAFOnline" verified 0/1). Gated to 2027 in
  // ALL_LEAGUES, so this sits inert until the tournament year.
  afcon: "CAF TV",
  // ⛔ euro + cricket deliberately have NO entry — see the block comment below.
  // laliga + ligue1 deliberately have NO official channel — same call as UFC.
  // LALIGA's channel ("LALIGA EA SPORTS") posts Spanish-language full matches
  // rather than clean per-match English highlights, and Ligue 1's author name
  // is sponsor-suffixed with a curly apostrophe ("Ligue 1 McDonald's") that
  // re-brands every cycle. A wrong string silently kills the official slot, so
  // both fall through to the unscoped search instead.
  // Golf majors — each tournament has its own channel. Keys must match the
  // label-derived lookup key `golf_${label.toLowerCase().replace(/\s+/g,"")}`
  // (see getOfficialChannelName), so the PGA Championship — whose league label
  // is "PGA Champ" — keys to golf_pgachamp, NOT golf_pga (which never matched,
  // dropping its official channel from the highlight chain). Mirrors the
  // golf_pgachamp key in SECONDARY_CHANNELS below.
  // Channel names below are the exact YouTube ownerText/author_name (the
  // worker matches on channel identity, not title text — verified 2026-07-11
  // via youtube.com/oembed + RSS). A wrong string silently 404s the official
  // slot and lets a reupload win, so these must match precisely.
  golf_masters: "The Masters",
  golf_pgachamp: "PGA Championships",       // plural — channel is "PGA Championships"
  golf_usopen: "United States Golf Association (USGA)", // NOT "USGA" (that never matched)
  golf_theopen: "The R&A",                  // The Open is run by The R&A; "The Open" never matched
  // Tennis Grand Slams — the tournament's own channel is the ONLY reliable
  // per-match source (ATP Tour / WTA / Tennis TV do NOT carry Slam highlights,
  // since Slams aren't tour-owned). Verified author_name strings.
  tennis_frenchopen: "Roland-Garros",
  tennis_wimbledon: "Wimbledon",
  tennis_usopen: "US Open Tennis Championships",
  tennis_ausopen: "Australian Open",        // NOT "Australian Open TV" (silently broke every AO match)
  tennis_australianopen: "Australian Open",
  // F1 + UFC official channels
  f1: "FORMULA 1",
  ufc: "UFC",
};

// Leagues where NO trustworthy uploader exists on YouTube, so the unscoped
// "any title that matches" fallback must NOT run — a null here hides the
// highlight button entirely rather than serving a re-upload.
//
// ⚠️ This is the opposite of laliga/ligue1, which have no OFFICIAL_CHANNELS
// entry but are still fine on the unscoped search (Spanish/French rightsholder
// cuts rank #1 there). Membership in this set is a stronger claim: the unscoped
// result was CHECKED and found to be junk.
//
// cricket (IPL): verified 2026-08-03 against three real 2026 fixtures. The
// unscoped search returned "Cricket fan 🏏786", "BCCI Cricket Match Highlights"
// (an unaffiliated channel that merely names itself after the board) and
// "Cricastra" — 3 for 3 fan re-uploads, zero official results. There is no
// official YouTube per-match highlight at all: IPL match highlights are
// exclusive to JioHotstar and geo-locked to India, and the official @IPL
// channel posts only promos and short clips. "IPL", "Indian Premier League"
// and "Star Sports" all verified 0/3 on strict. So the IPL card shows its
// scorecard + rating and NO highlight button. Re-check if the rights move.
//
// euro: verified 0/1 — UEFA's own channel does not post per-match EURO
// highlights (the unscoped winner was a TSN re-upload). Gated to 2028 in
// ALL_LEAGUES anyway, so re-verify at the next tournament rather than now.
const NO_HIGHLIGHT_FALLBACK = new Set(["cricket", "euro"]);

// True when a league has no acceptable highlight source at all — neither an
// official channel nor a trustworthy unscoped search. Callers must render no
// highlight button (not a search-page link) for these.
export function hasNoTrustedHighlightSource(sport: string): boolean {
  return NO_HIGHLIGHT_FALLBACK.has(sport);
}

// Curated channel chain for golf highlight buttons — used directly
// (not as a fallback) because the tournament-run channels ("The
// Masters", "USGA", etc.) are unreliable for recaps: they mix in Par
// 3 Contest, player-specific clips, and practice rounds during
// tournament week, which was burying the actual day-end recap.
//
// Order matters — slot 0 (the "main recap" button) pulls from the first
// channel, slot 1 from the second, etc. Golf Channel is the reliable per-round
// recap fallback across all four majors ("... Round N | Golf Channel"). ESPN
// only kept where it actually holds broadcast rights + posts round recaps —
// the Masters and PGA Championship (Thu/Fri windows). ESPN has NO rights to the
// US Open (golf) or The Open (those are NBC/Golf Channel/Peacock in the US), so
// it's dropped there — it was dead-weight fallback. "PGA TOUR" removed from
// every chain: that channel explicitly excludes major highlights, so it never
// hit. Sky Sports Golf kept for The Open (UK R&A licensee). (Verified 2026-07-11.)
const SECONDARY_CHANNELS: Record<string, string[]> = {
  golf_masters: ["Golf Channel", "ESPN"],
  golf_pgachamp: ["Golf Channel", "ESPN"],
  golf_usopen: ["Golf Channel"],
  golf_theopen: ["Golf Channel", "Sky Sports Golf"],
  f1: ["FORMULA 1", "ESPN", "Sky Sports F1"],
  ufc: ["UFC", "ESPN"],
};

export function getYouTubeSearchUrl(
  awayTeam: string,
  homeTeam: string,
  dateStr: string,
  seriesNote?: string | null,
  competition?: string | null
): string {
  const query = buildQuery(awayTeam, homeTeam, dateStr, seriesNote, competition);
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
}

export function getHighlightSearchQuery(
  awayTeam: string,
  homeTeam: string,
  dateStr: string,
  seriesNote?: string | null,
  competition?: string | null
): string {
  return buildQuery(awayTeam, homeTeam, dateStr, seriesNote, competition);
}

export function getOfficialChannelName(sport: string, label?: string): string | null {
  // Tournament-specific channels for golf/tennis
  if (label) {
    const labelKey = `${sport}_${label.toLowerCase().replace(/\s+/g, "")}`;
    if (OFFICIAL_CHANNELS[labelKey]) return OFFICIAL_CHANNELS[labelKey];
  }
  return OFFICIAL_CHANNELS[sport] ?? null;
}

// Competition/tournament token to require in highlight titles for sports where
// the same two teams meet across many competitions. Soccer national teams play
// friendlies, qualifiers AND continental cups against each other, and there are
// decades of old World Cup classics between the same nations — so without this
// the matcher can serve a friendly (or a 2006 classic) as today's World Cup
// game. The client embeds this token in the query (buildQuery) and the
// /api/youtube worker requires it in the video title — the soccer analogue of
// the golf tournament gate. World Cup (fifa) ONLY; every other league maps to
// null and is completely unaffected.
const COMPETITION_NAMES: Record<string, string> = {
  fifa: "World Cup",
};

export function getCompetitionName(sport: string): string | null {
  return COMPETITION_NAMES[sport] ?? null;
}

// Returns the full curated fallback chain of YouTube channels to try for the
// 2nd highlight button, in priority order. Empty array means no curated
// options — caller should drop straight to a generic search.
export function getSecondaryChannels(sport: string, label?: string): string[] {
  if (label) {
    const labelKey = `${sport}_${label.toLowerCase().replace(/\s+/g, "")}`;
    if (SECONDARY_CHANNELS[labelKey]) return SECONDARY_CHANNELS[labelKey];
  }
  // Fall back to the bare-sport key — mirrors getOfficialChannelName. Without
  // this the label-less entries (f1, ufc) were unreachable: a labelKey lookup
  // like `f1_<label>` never matches the bare `f1` key, so their curated chains
  // fell through to []. Golf callers pass a label that hits the labelKey above,
  // so their behavior is unchanged.
  return SECONDARY_CHANNELS[sport] ?? [];
}

// ESPN's `shortDisplayName` occasionally diverges from how official league
// channels title their highlight uploads (e.g. ESPN: "Red Bull NY", MLS
// channel videos: "New York Red Bulls"). Without a rewrite the
// channel-scoped /api/youtube lookup returns no results and the highlight
// button falls back to a YouTube search page.
const TEAM_NAME_ALIASES: Record<string, string> = {
  "Red Bull NY": "New York Red Bulls",
};

function aliasTeam(name: string): string {
  return TEAM_NAME_ALIASES[name] ?? name;
}

function buildQuery(awayTeam: string, homeTeam: string, dateStr: string, seriesNote?: string | null, competition?: string | null): string {
  const head = `${aliasTeam(awayTeam)} vs ${aliasTeam(homeTeam)} highlights`;
  const parts = [competition ? `${head} ${competition} ${dateStr}` : `${head} ${dateStr}`];
  if (seriesNote) parts.push(seriesNote);
  return parts.join(" ");
}

// Same query without the date suffix — used as a last-resort retry when the
// dated form returns nothing. Some official channels title their recaps
// without a date or use a format the matcher doesn't see ("Game Recap |
// AwayTeam @ HomeTeam") so dropping the date lets the lookup land.
function buildUndatedQuery(awayTeam: string, homeTeam: string, seriesNote?: string | null, competition?: string | null): string {
  const head = `${aliasTeam(awayTeam)} vs ${aliasTeam(homeTeam)} highlights`;
  const parts = [competition ? `${head} ${competition}` : head];
  if (seriesNote) parts.push(seriesNote);
  return parts.join(" ");
}

// Build a YouTube search query for a specific completed round of a golf major.
// Example: getGolfHighlightQuery("Masters", 1, 2026) → "Masters 2026 Round 1 highlights"
export function getGolfHighlightQuery(label: string, round: number, year: number): string {
  return `${label} ${year} Round ${round} highlights`;
}

export function getGolfHighlightUrl(label: string, round: number, year: number): string {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(getGolfHighlightQuery(label, round, year))}`;
}

export function getApiBase(): string {
  if (typeof window === "undefined") return "";
  const proto = window.location.protocol;
  if (proto === "capacitor:" || proto === "file:") return "https://hidescore.com";
  return "";
}

export async function fetchFirstVideoId(query: string, channel?: string, exclude?: (string | null | undefined)[], preferExtended?: boolean, strict?: boolean, raceTokens?: string[]): Promise<string | null> {
  try {
    let url = `${getApiBase()}/api/youtube?q=${encodeURIComponent(query)}`;
    if (channel) url += `&channel=${encodeURIComponent(channel)}`;
    // Motorsport race gate — the channel gate can't tell two races apart when
    // one channel uploads every round. See buildRaceTokens in lib/espn.ts.
    if (raceTokens?.length) url += `&race=${encodeURIComponent(raceTokens.join("|"))}`;
    const excludeIds = (exclude ?? []).filter((id): id is string => !!id);
    if (excludeIds.length) url += `&exclude=${encodeURIComponent(excludeIds.join(","))}`;
    if (preferExtended) url += `&prefer=extended`;
    // strict=1 tells the worker to oembed-verify the result's uploader equals
    // `channel` (drops title-only reupload matches). Only meaningful with a
    // channel; harmless otherwise.
    if (strict && channel) url += `&strict=1`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    return data.videoId ?? null;
  } catch {
    return null;
  }
}

// English (ESPN `shortDisplayName`) → Spanish nation name, so the Telemundo
// Deportes "resumen Copa Mundial" query is built with the name that channel's
// recap titles actually use. Any nation absent here falls back to aliasTeam()
// (i.e. the English name), which under-matches on a Spanish-language channel —
// so the map is kept complete across the qualified field. Spellings follow
// Telemundo's own usage (e.g. "Catar", "Arabia Saudita"). Keyed alphabetically.
const TELEMUNDO_WORLD_CUP_TEAM_ALIASES: Record<string, string> = {
  Algeria: "Argelia",
  Argentina: "Argentina",
  Australia: "Australia",
  Austria: "Austria",
  Belgium: "Bélgica",
  "Bosnia-Herzegovina": "Bosnia y Herzegovina",
  Brazil: "Brasil",
  Canada: "Canadá",
  "Cape Verde": "Cabo Verde",
  Colombia: "Colombia",
  "Congo DR": "RD Congo",
  Croatia: "Croacia",
  Curacao: "Curazao",
  Czechia: "Chequia",
  Ecuador: "Ecuador",
  Egypt: "Egipto",
  England: "Inglaterra",
  France: "Francia",
  Germany: "Alemania",
  Ghana: "Ghana",
  Haiti: "Haití",
  Iran: "Irán",
  Iraq: "Irak",
  "Ivory Coast": "Costa de Marfil",
  Japan: "Japón",
  Jordan: "Jordania",
  Mexico: "México",
  Morocco: "Marruecos",
  Netherlands: "Países Bajos",
  "New Zealand": "Nueva Zelanda",
  Norway: "Noruega",
  Panama: "Panamá",
  Paraguay: "Paraguay",
  Portugal: "Portugal",
  Qatar: "Catar",
  "Saudi Arabia": "Arabia Saudita",
  Scotland: "Escocia",
  Senegal: "Senegal",
  "South Africa": "Sudáfrica",
  "South Korea": "Corea del Sur",
  Spain: "España",
  Sweden: "Suecia",
  Switzerland: "Suiza",
  Tunisia: "Túnez",
  Turkiye: "Turquía",
  Uruguay: "Uruguay",
  USA: "Estados Unidos",
  Uzbekistan: "Uzbekistán",
};

// Fold diacritics + typographic apostrophes and lowercase for lookup — the SAME
// normalization fifaRank() uses (fifaRankings.ts), which this Telemundo map's raw
// exact-match lookup previously skipped. ESPN's shortDisplayName can arrive
// accented ("Türkiye", "Curaçao"), and an exact index against the plain-ASCII
// keys ("Turkiye", "Curacao") then missed and fell through to the English name on
// a Spanish-language channel, silently dropping the Telemundo highlight button for
// those nations. Normalizing both sides resolves the variant; a plain-ASCII name
// normalizes to its own lowercased key, so every currently-working lookup is
// unchanged (distinct nations can't collide under case/diacritic folding).
function normalizeTeamName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip combining diacritical marks
    .replace(/[‘’]/g, "'") // fold curly apostrophes to ASCII
    .toLowerCase()
    .trim();
}

const TELEMUNDO_ALIASES_NORMALIZED: Record<string, string> = Object.fromEntries(
  Object.entries(TELEMUNDO_WORLD_CUP_TEAM_ALIASES).map(([k, v]) => [normalizeTeamName(k), v]),
);

function telemundoWorldCupTeam(name: string): string {
  return TELEMUNDO_ALIASES_NORMALIZED[normalizeTeamName(name)] ?? aliasTeam(name);
}

function buildTelemundoWorldCupQuery(awayTeam: string, homeTeam: string, dateStr: string, seriesNote?: string | null): string {
  const head = `${telemundoWorldCupTeam(awayTeam)} vs ${telemundoWorldCupTeam(homeTeam)} resumen Copa Mundial`;
  const parts = [`${head} ${dateStr}`];
  if (seriesNote) parts.push(seriesNote);
  return parts.join(" ");
}

export async function resolveTelemundoWorldCupVideo(
  awayTeam: string,
  homeTeam: string,
  dateStr: string,
  seriesNote: string | null | undefined,
  exclude?: (string | null | undefined)[],
  preferExtended?: boolean,
): Promise<string | null> {
  return fetchFirstVideoId(
    buildTelemundoWorldCupQuery(awayTeam, homeTeam, dateStr, seriesNote),
    "Telemundo Deportes",
    exclude,
    preferExtended,
  );
}

// Walks the lookup chain so a highlight button never has to fall back to
// opening a YouTube search page externally. Tries in order:
//   1. channel-filtered query (the strict "official" lookup)
//   2. unfiltered query (any video matching the dated title)
//   3. unfiltered query without the date suffix (catches channels whose
//      recap titles omit the date entirely)
// Returns the first hit (deduped against `exclude`), or null if nothing
// matched anywhere — callers should hide the button in that case rather
// than dropping users into a YouTube search.
export async function resolveHighlightVideo(
  awayTeam: string,
  homeTeam: string,
  dateStr: string,
  seriesNote: string | null | undefined,
  channel?: string,
  exclude?: (string | null | undefined)[],
  competition?: string | null,
  preferExtended?: boolean,
  strictChannel?: boolean
): Promise<string | null> {
  const datedQuery = buildQuery(awayTeam, homeTeam, dateStr, seriesNote, competition);
  const undated = buildUndatedQuery(awayTeam, homeTeam, seriesNote, competition);
  if (strictChannel && channel) {
    // Hard channel gate (strict=1): the official channel is authoritative — if
    // it hasn't posted this match, 404 rather than let a reupload win. This is
    // what stops junk like "Sadak Chaps" from taking a tennis/golf slot.
    return fetchFirstVideoId(datedQuery, channel, exclude, preferExtended, true);
  }
  // Fire every fallback tier CONCURRENTLY instead of awaiting them in series.
  // Each /api/youtube call is a live YouTube scrape (~1-2s); walking
  // channel → dated → undated sequentially meant a button that fell through to
  // the undated tier (common for World Cup, whose FIFA-channel recap often lags)
  // took 2-3× as long to appear (Jacob 7/7). Running them at once resolves in a
  // single scrape-time, and we still return by the SAME priority — channel hit,
  // then dated unscoped, then undated — so results are identical, just faster.
  const [chanHit, datedUnscoped, undatedHit] = await Promise.all([
    channel ? fetchFirstVideoId(datedQuery, channel, exclude, preferExtended) : Promise.resolve(null),
    fetchFirstVideoId(datedQuery, undefined, exclude, preferExtended),
    fetchFirstVideoId(undated, undefined, exclude, preferExtended),
  ]);
  return chanHit || datedUnscoped || undatedHit;
}
