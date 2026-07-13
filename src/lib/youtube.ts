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

export async function fetchFirstVideoId(query: string, channel?: string, exclude?: (string | null | undefined)[], preferExtended?: boolean, strict?: boolean): Promise<string | null> {
  try {
    let url = `${getApiBase()}/api/youtube?q=${encodeURIComponent(query)}`;
    if (channel) url += `&channel=${encodeURIComponent(channel)}`;
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

const TELEMUNDO_WORLD_CUP_TEAM_ALIASES: Record<string, string> = {
  Argentina: "Argentina",
  Australia: "Australia",
  Belgium: "Bélgica",
  Brazil: "Brasil",
  Colombia: "Colombia",
  Egypt: "Egipto",
  England: "Inglaterra",
  France: "Francia",
  Germany: "Alemania",
  Morocco: "Marruecos",
  Netherlands: "Países Bajos",
  Norway: "Noruega",
  Paraguay: "Paraguay",
  Spain: "España",
  Switzerland: "Suiza",
  USA: "Estados Unidos",
};

function telemundoWorldCupTeam(name: string): string {
  return TELEMUNDO_WORLD_CUP_TEAM_ALIASES[name] ?? aliasTeam(name);
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

export function getYouTubeEmbedUrl(videoId: string): string {
  return `https://www.youtube.com/embed/${videoId}?autoplay=1&mute=1&rel=0&modestbranding=1`;
}
