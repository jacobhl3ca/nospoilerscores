// YouTube search embed — plays first result directly in an iframe.
// No third-party API needed. YouTube's listType=search embed still works.
export function getYouTubeSearchEmbedUrl(query: string): string {
  return `https://www.youtube-nocookie.com/embed?listType=search&list=${encodeURIComponent(query)}&autoplay=1&rel=0&modestbranding=1`;
}

// Fallback: opens YouTube search results page in new tab
export function getYouTubeSearchUrl(query: string): string {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
}

export function buildHighlightQuery(
  awayTeam: string,
  homeTeam: string,
  dateStr: string
): string {
  return `${awayTeam} vs ${homeTeam} highlights ${dateStr}`;
}

// --- COMMENTED OUT: Piped API approach (all instances down as of 2026-04-01) ---
// const PIPED_INSTANCES = [
//   "https://pipedapi.kavin.rocks",
//   "https://pipedapi.adminforge.de",
//   "https://pipedapi.in.projectsegfau.lt",
// ];
//
// export async function searchFirstVideoId(query: string): Promise<string | null> {
//   for (const instance of PIPED_INSTANCES) {
//     try {
//       const res = await fetch(
//         `${instance}/search?q=${encodeURIComponent(query)}&filter=videos`,
//         { signal: AbortSignal.timeout(4000) }
//       );
//       if (!res.ok) continue;
//       const data = await res.json();
//       const items = data.items ?? [];
//       if (items.length > 0) {
//         const videoPath = items[0].url;
//         const videoId = videoPath?.split("v=")[1]?.split("&")[0];
//         if (videoId) return videoId;
//       }
//     } catch {
//       continue;
//     }
//   }
//   return null;
// }
//
// export function getYouTubeEmbedUrl(videoId: string): string {
//   return `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0&modestbranding=1`;
// }
