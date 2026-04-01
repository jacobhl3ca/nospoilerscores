export function getYouTubeSearchUrl(
  awayTeam: string,
  homeTeam: string,
  dateStr: string
): string {
  const query = `${awayTeam} vs ${homeTeam} highlights ${dateStr}`;
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
}

// --- COMMENTED OUT: YouTube search embed approach (deprecated, shows "Video is unavailable") ---
// export function getYouTubeSearchEmbedUrl(query: string): string {
//   return `https://www.youtube-nocookie.com/embed?listType=search&list=${encodeURIComponent(query)}&autoplay=1&rel=0&modestbranding=1`;
// }

// --- COMMENTED OUT: Piped API approach (all instances dead as of 2026-04-01) ---
// const PIPED_INSTANCES = [ ... ];
// export async function searchFirstVideoId(query: string): Promise<string | null> { ... }
// export function getYouTubeEmbedUrl(videoId: string): string { ... }
