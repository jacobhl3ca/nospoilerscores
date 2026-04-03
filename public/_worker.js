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

        // Extract series game number from query (e.g. "Game 2")
        const gameNumMatch = query.match(/Game (\d+)/i);
        const queryGameNum = gameNumMatch ? gameNumMatch[1] : null;

        // Team name aliases — ESPN shortDisplayName → common YouTube title variants
        const TEAM_ALIASES = {
          "trail blazers": ["blazers", "trail blazers", "portland"],
          "timberwolves": ["timberwolves", "wolves", "minnesota"],
          "76ers": ["76ers", "sixers", "philadelphia"],
          "uconn": ["uconn", "connecticut", "huskies"],
          "blue jays": ["blue jays", "jays", "toronto"],
          "white sox": ["white sox", "chi sox", "chicago white"],
          "red sox": ["red sox", "boston"],
          "d-backs": ["d-backs", "diamondbacks", "dbacks", "arizona"],
          "st. john's": ["st. john's", "st johns", "saint john's", "saint johns", "st john's"],
        };

        // Extract team names from query: "Away vs Home highlights ..."
        const teamsMatch = query.match(/^(.+?)\s+vs\s+(.+?)\s+highlights/i);
        const queryTeams = teamsMatch
          ? [teamsMatch[1].toLowerCase(), teamsMatch[2].toLowerCase()]
          : [];

        // Build alias lists for each team
        function getTeamVariants(teamName) {
          const lower = teamName.toLowerCase();
          return TEAM_ALIASES[lower] || [lower];
        }

        function titleHasTeam(titleLower, teamName) {
          const variants = getTeamVariants(teamName);
          return variants.some((v) => titleLower.includes(v));
        }

        // Extract videoRenderer blocks which contain both videoId and title
        const rendererPattern = /"videoRenderer":\{"videoId":"([a-zA-Z0-9_-]{11})".*?"title":\{"runs":\[\{"text":"(.*?)"\}/g;
        let match;
        let bestMatchId = null;
        let yearMatchedId = null;
        let teamsMatchedId = null;
        let teamsGameMatchedId = null;
        let firstHighlightId = null;

        while ((match = rendererPattern.exec(html)) !== null) {
          const videoId = match[1];
          const title = match[2];
          const titleLower = title.toLowerCase();

          // Check if title contains "highlight"
          const isHighlight = titleLower.includes("highlight");
          if (!isHighlight) continue;

          // Check if both team names appear in the title (using aliases)
          const hasTeams =
            queryTeams.length === 2 &&
            queryTeams.every((team) => titleHasTeam(titleLower, team));

          // Check if the year matches
          const hasYear = queryYear && title.includes(queryYear);

          // Check if series game number matches (e.g. "Game 2" in title)
          const hasGameNum = queryGameNum && titleLower.includes(`game ${queryGameNum}`);

          // Best: highlight + both teams + year + game number (playoff series)
          if (hasTeams && hasYear && queryGameNum && hasGameNum) {
            bestMatchId = videoId;
            break;
          }
          // Great: highlight + both teams + year (no series or series matched)
          if (hasTeams && hasYear && !queryGameNum && !bestMatchId) {
            bestMatchId = videoId;
          }
          // Good: highlight + both teams + game number (no year)
          if (hasTeams && hasGameNum && !teamsGameMatchedId) {
            teamsGameMatchedId = videoId;
          }
          // OK: highlight + both teams (no year/game check)
          if (hasTeams && !teamsMatchedId) {
            teamsMatchedId = videoId;
          }
          // Weak: highlight + year (teams might be abbreviated differently)
          if (hasYear && !yearMatchedId) {
            yearMatchedId = videoId;
          }
          // Fallback: any highlight
          if (!firstHighlightId) {
            firstHighlightId = videoId;
          }
        }

        // Priority: teams+year+game > teams+year > teams+game > teams > year > any highlight > raw first result
        let videoId =
          bestMatchId || teamsGameMatchedId || teamsMatchedId || yearMatchedId || firstHighlightId;
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
