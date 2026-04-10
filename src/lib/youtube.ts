// Official YouTube channel names per league
const OFFICIAL_CHANNELS: Record<string, string> = {
  nba: "NBA",
  mlb: "MLB",
  nhl: "NHL",
  nfl: "NFL",
  ncaam: "March Madness",
  fifa: "FIFA",
  epl: "Premier League",
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

// Curated fallback chain for the 2nd golf highlight button — tried in order
// until one returns a playable video. Picked for consistent "Round X
// highlights" uploads:
//   - PGA TOUR (3.4M subs): round recaps for PGA-sanctioned majors
//   - Golf Channel (700k): NBC-owned, mixes recaps + analysis
//   - ESPN (19M): editorial daily recaps, sometimes generic
//   - Sky Sports Golf (800k): best consistent source for The Open (R&A-run)
// Forcing channel filters avoids the random/low-quality top organic search.
const SECONDARY_CHANNELS: Record<string, string[]> = {
  golf_masters: ["PGA TOUR", "Golf Channel", "ESPN"],
  "golf_pga champ": ["PGA TOUR", "Golf Channel", "ESPN"],
  "golf_us open": ["PGA TOUR", "Golf Channel", "ESPN"],
  "golf_the open": ["Sky Sports Golf", "Golf Channel", "ESPN"],
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
    const labelKey = `${sport}_${label.toLowerCase()}`;
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

export async function fetchFirstVideoId(query: string, channel?: string): Promise<string | null> {
  try {
    let url = `/api/youtube?q=${encodeURIComponent(query)}`;
    if (channel) url += `&channel=${encodeURIComponent(channel)}`;
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
