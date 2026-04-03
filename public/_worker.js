export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/youtube") {
      const query = url.searchParams.get("q");
      if (!query) {
        return new Response(JSON.stringify({ error: "Missing q param" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }

      try {
        const ytUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
        const res = await fetch(ytUrl, {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept-Language": "en-US,en;q=0.9",
          },
        });
        const html = await res.text();

        // Extract the year from the search query (e.g. "highlights Mar 10, 2026" → "2026")
        const yearMatch = query.match(/\b(20\d{2})\b/);
        const queryYear = yearMatch ? yearMatch[1] : null;

        // Extract team names from query: "Away vs Home highlights ..."
        const teamsMatch = query.match(/^(.+?)\s+vs\s+(.+?)\s+highlights/i);
        const queryTeams = teamsMatch
          ? [teamsMatch[1].toLowerCase(), teamsMatch[2].toLowerCase()]
          : [];

        // Extract videoRenderer blocks which contain both videoId and title
        const rendererPattern = /"videoRenderer":\{"videoId":"([a-zA-Z0-9_-]{11})".*?"title":\{"runs":\[\{"text":"(.*?)"\}/g;
        let match;
        let bestMatchId = null;
        let yearMatchedId = null;
        let teamsMatchedId = null;
        let firstHighlightId = null;

        while ((match = rendererPattern.exec(html)) !== null) {
          const videoId = match[1];
          const title = match[2];
          const titleLower = title.toLowerCase();

          // Check if title contains "highlight"
          const isHighlight = titleLower.includes("highlight");
          if (!isHighlight) continue;

          // Check if both team names appear in the title
          const hasTeams =
            queryTeams.length === 2 &&
            queryTeams.every((team) => titleLower.includes(team));

          // Check if the year matches
          const hasYear = queryYear && title.includes(queryYear);

          // Best: highlight + both teams + year
          if (hasTeams && hasYear) {
            bestMatchId = videoId;
            break;
          }
          // Good: highlight + both teams (no year check)
          if (hasTeams && !teamsMatchedId) {
            teamsMatchedId = videoId;
          }
          // OK: highlight + year (teams might be abbreviated differently)
          if (hasYear && !yearMatchedId) {
            yearMatchedId = videoId;
          }
          // Fallback: any highlight
          if (!firstHighlightId) {
            firstHighlightId = videoId;
          }
        }

        // Priority: teams+year > teams > year > any highlight > raw first result
        let videoId =
          bestMatchId || teamsMatchedId || yearMatchedId || firstHighlightId;
        if (!videoId) {
          const fallback = html.match(/"videoId":"([a-zA-Z0-9_-]{11})"/);
          videoId = fallback ? fallback[1] : null;
        }

        if (!videoId) {
          return new Response(JSON.stringify({ error: "No results" }), {
            status: 404,
            headers: { "Content-Type": "application/json" },
          });
        }

        return new Response(JSON.stringify({ videoId }), {
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "public, max-age=300",
          },
        });
      } catch {
        return new Response(JSON.stringify({ error: "Search failed" }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    // Fall through to static assets
    return env.ASSETS.fetch(request);
  },
};
