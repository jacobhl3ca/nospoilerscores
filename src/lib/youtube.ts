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

// Consistent secondary source per sport — used when the tournament/league
// channel is slow or sparse. PGA TOUR uploads "Round X highlights" reliably
// for Masters / PGA Champ / US Open. The Open is R&A-controlled, so we fall
// back to Sky Sports Golf for that one.
const SECONDARY_CHANNELS: Record<string, string> = {
  golf_masters: "PGA TOUR",
  "golf_pga champ": "PGA TOUR",
  "golf_us open": "PGA TOUR",
  "golf_the open": "Sky Sports Golf",
};

const SECONDARY_LABELS: Record<string, string> = {
  "PGA TOUR": "PGA",
  "Sky Sports Golf": "Sky",
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

// Returns a consistent secondary channel name (e.g. "PGA TOUR" for Masters).
// Falls back to null when no curated secondary exists — caller should then
// drop back to a generic search.
export function getSecondaryChannelName(sport: string, label?: string): string | null {
  if (label) {
    const labelKey = `${sport}_${label.toLowerCase()}`;
    if (SECONDARY_CHANNELS[labelKey]) return SECONDARY_CHANNELS[labelKey];
  }
  return null;
}

export function getSecondaryChannelLabel(channel: string): string {
  return SECONDARY_LABELS[channel] ?? channel;
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
