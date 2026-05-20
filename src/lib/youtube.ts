// Official YouTube channel names per league
const OFFICIAL_CHANNELS: Record<string, string> = {
  nba: "NBA",
  wnba: "WNBA",
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

export function getYouTubeSearchUrl(
  awayTeam: string,
  homeTeam: string,
  dateStr: string,
  seriesNote?: string | null
): string {
  const query = buildQuery(awayTeam, homeTeam, dateStr, seriesNote);
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
}

export function getHighlightSearchQuery(
  awayTeam: string,
  homeTeam: string,
  dateStr: string,
  seriesNote?: string | null
): string {
  return buildQuery(awayTeam, homeTeam, dateStr, seriesNote);
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

function buildQuery(awayTeam: string, homeTeam: string, dateStr: string, seriesNote?: string | null): string {
  const parts = [`${awayTeam} vs ${homeTeam} highlights ${dateStr}`];
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

export async function fetchFirstVideoId(query: string, channel?: string, exclude?: (string | null | undefined)[]): Promise<string | null> {
  try {
    let url = `${getApiBase()}/api/youtube?q=${encodeURIComponent(query)}`;
    if (channel) url += `&channel=${encodeURIComponent(channel)}`;
    const excludeIds = (exclude ?? []).filter((id): id is string => !!id);
    if (excludeIds.length) url += `&exclude=${encodeURIComponent(excludeIds.join(","))}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    return data.videoId ?? null;
  } catch {
    return null;
  }
}

export function getYouTubeEmbedUrl(videoId: string): string {
  return `https://www.youtube.com/embed/${videoId}?autoplay=1&mute=1&rel=0&modestbranding=1`;
}
