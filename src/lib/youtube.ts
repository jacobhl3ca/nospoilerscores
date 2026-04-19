// Official YouTube channel names per league
const OFFICIAL_CHANNELS: Record<string, string> = {
  nba: "NBA",
  mlb: "MLB",
  nhl: "NHL",
  nfl: "NFL",
  ncaam: "March Madness",
  fifa: "FIFA",
  epl: "Premier League",
  mls: "MLS",
  // Golf majors — each tournament has its own channel
  golf_masters: "The Masters",
  golf_pga: "PGA Championship",
  golf_usopen: "USGA",
  golf_theopen: "The Open",
  // Tennis Grand Slams
  tennis_frenchopen: "Roland-Garros",
  tennis_wimbledon: "Wimbledon",
  tennis_usopen: "US Open Tennis Championships",
};

// Curated channel chain for golf highlight buttons — used directly
// (not as a fallback) because the tournament-run channels ("The
// Masters", "USGA", etc.) are unreliable for recaps: they mix in Par
// 3 Contest, player-specific clips, and practice rounds during
// tournament week, which was burying the actual day-end recap.
//
// Order matters — slot 0 (the "main recap" button) pulls from the
// first channel, slot 1 from the second, etc. ESPN first because it
// reliably posts a full-day recap titled "Round X Highlights" during
// majors they broadcast; PGA TOUR second because it's the best source
// for player-specific reels ("Rory McIlroy Round 3 highlights").
// Golf Channel third for analysis/extended recaps. Sky Sports Golf
// only used for The Open since R&A licenses there.
const SECONDARY_CHANNELS: Record<string, string[]> = {
  golf_masters: ["ESPN", "PGA TOUR", "Golf Channel"],
  golf_pgachamp: ["ESPN", "PGA TOUR", "Golf Channel"],
  golf_usopen: ["ESPN", "PGA TOUR", "Golf Channel"],
  golf_theopen: ["ESPN", "Sky Sports Golf", "Golf Channel"],
};

// Nicknames official league YouTube channels sometimes use instead of the
// team name ESPN returns. Key is ESPN's shortDisplayName; value is a list
// of alternate spellings to try on the same query. Order matters — first
// entry is the primary, subsequent ones are retry variants when the first
// query fails date validation. Add entries as real mismatches surface
// (verified by the oembed title check rejecting a valid game).
const TEAM_NICKNAME_ALIASES: Record<string, string[]> = {
  // MLB — the A's title format flipped from "Athletics" (4/17/26) to
  // "A's" (4/18/26) so we need both.
  Athletics: ["A's"],
  Diamondbacks: ["D-backs"],
};

export function getTeamQueryVariants(teamName: string): string[] {
  const alts = TEAM_NICKNAME_ALIASES[teamName] ?? [];
  return [teamName, ...alts];
}

export function getYouTubeSearchUrl(
  awayTeam: string,
  homeTeam: string,
  dateStr: string,
  seriesNote?: string | null,
  dateISO?: string
): string {
  const query = buildQuery(awayTeam, homeTeam, dateStr, seriesNote, dateISO ? shortDateToken(dateISO) : null);
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
}

export function getHighlightSearchQuery(
  awayTeam: string,
  homeTeam: string,
  dateStr: string,
  seriesNote?: string | null,
  dateISO?: string
): string {
  return buildQuery(awayTeam, homeTeam, dateStr, seriesNote, dateISO ? shortDateToken(dateISO) : null);
}

export function getOfficialChannelName(sport: string, label?: string): string | null {
  // Tournament-specific channels for golf/tennis
  if (label) {
    const labelKey = `${sport}_${label.toLowerCase().replace(/\s+/g, "")}`;
    if (OFFICIAL_CHANNELS[labelKey]) return OFFICIAL_CHANNELS[labelKey];
  }
  return OFFICIAL_CHANNELS[sport] ?? null;
}

// Returns the full curated fallback chain of YouTube channels to try for the
// 2nd highlight button, in priority order. Empty array means no curated
// options — caller should drop straight to a generic search.
export function getSecondaryChannels(sport: string, label?: string): string[] {
  if (label) {
    const labelKey = `${sport}_${label.toLowerCase().replace(/\s+/g, "")}`;
    if (SECONDARY_CHANNELS[labelKey]) return SECONDARY_CHANNELS[labelKey];
  }
  return [];
}

function buildQuery(awayTeam: string, homeTeam: string, dateStr: string, seriesNote?: string | null, shortDate?: string | null): string {
  const parts = [`${awayTeam} vs ${homeTeam} highlights ${dateStr}`];
  if (shortDate) parts.push(shortDate);
  if (seriesNote) parts.push(seriesNote);
  return parts.join(" ");
}

function shortDateToken(dateISO: string): string {
  const d = new Date(dateISO);
  return `${d.getMonth() + 1}/${d.getDate()}/${String(d.getFullYear()).slice(2)}`;
}

// Tokens that, if any are present in a YouTube video title, prove the video
// belongs to the same calendar date as the game. Used to reject wrong-date
// results from channel-scoped searches (e.g. MLB posting the prior day's game
// higher than today's because the nickname match outranked the date).
export function getHighlightDateTokens(dateISO: string): string[] {
  const d = new Date(dateISO);
  const m = d.getMonth() + 1;
  const day = d.getDate();
  const yyyy = d.getFullYear();
  const yy = String(yyyy).slice(2);
  const abbr = d.toLocaleString("en-US", { month: "short" });
  const full = d.toLocaleString("en-US", { month: "long" });
  return [
    `${m}/${day}/${yy}`,
    `${m}/${day}/${yyyy}`,
    `${m}-${day}-${yy}`,
    `${m}-${day}-${yyyy}`,
    `${abbr} ${day}, ${yyyy}`,
    `${full} ${day}, ${yyyy}`,
  ];
}

async function verifyTitleContainsDate(videoId: string, tokens: string[]): Promise<boolean> {
  try {
    const r = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`);
    if (!r.ok) return false;
    const data = await r.json();
    const title = String(data.title ?? "").toLowerCase();
    return tokens.some((t) => title.includes(t.toLowerCase()));
  } catch {
    return false;
  }
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

export async function fetchFirstVideoId(query: string, channel?: string, dateTokens?: string[]): Promise<string | null> {
  try {
    let url = `${getApiBase()}/api/youtube?q=${encodeURIComponent(query)}`;
    if (channel) url += `&channel=${encodeURIComponent(channel)}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const id = data.videoId ?? null;
    if (!id) return null;
    if (dateTokens && dateTokens.length) {
      const ok = await verifyTitleContainsDate(id, dateTokens);
      if (!ok) return null;
    }
    return id;
  } catch {
    return null;
  }
}

// Try a list of candidate queries in order and return the first validated
// videoId. Used when league YT channels use inconsistent nicknames for the
// same team (e.g. MLB's channel flipped "Athletics" → "A's" between 4/17 and
// 4/18), so we need to try each spelling until one returns a date-matching
// upload.
export async function fetchFirstValidatedVideoId(
  queries: string[],
  channel: string | undefined,
  dateTokens: string[]
): Promise<string | null> {
  for (const q of queries) {
    const id = await fetchFirstVideoId(q, channel, dateTokens);
    if (id) return id;
  }
  return null;
}

export function getYouTubeEmbedUrl(videoId: string): string {
  return `https://www.youtube.com/embed/${videoId}?autoplay=1&mute=1&rel=0&modestbranding=1`;
}
