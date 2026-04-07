// Official YouTube channel names per league
const OFFICIAL_CHANNELS: Record<string, string> = {
  nba: "NBA",
  mlb: "MLB",
  nhl: "NHL",
  nfl: "NFL",
  // ncaam: no reliable highlights channel — March Madness posts hype, not full game highlights
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

export function getOfficialChannelName(sport: string): string | null {
  return OFFICIAL_CHANNELS[sport] ?? null;
}

function buildQuery(awayTeam: string, homeTeam: string, dateStr: string, seriesNote?: string | null): string {
  const parts = [`${awayTeam} vs ${homeTeam} highlights ${dateStr}`];
  if (seriesNote) parts.push(seriesNote);
  return parts.join(" ");
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
