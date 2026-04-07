export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/youtube") {
      const query = url.searchParams.get("q");
      const preferChannel = url.searchParams.get("channel"); // e.g. "NBA", "MLB"
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

        // Extract videoRenderer blocks which contain videoId, title, and channel name
        // Channel name appears in ownerText or longBylineText after the videoId/title
        const rendererPattern = /"videoRenderer":\{"videoId":"([a-zA-Z0-9_-]{11})".*?"title":\{"runs":\[\{"text":"(.*?)"\}/g;
        // Separate pattern to extract channel names near each videoId
        const channelPattern = /"videoId":"([a-zA-Z0-9_-]{11})".*?"ownerText":\{"runs":\[\{"text":"(.*?)"/g;
        const channelMap = {};
        let cm;
        while ((cm = channelPattern.exec(html)) !== null) {
          channelMap[cm[1]] = cm[2];
        }

        let match;
        let bestMatchId = null;
        let yearMatchedId = null;
        let teamsMatchedId = null;
        let teamsGameMatchedId = null;
        let firstHighlightId = null;
        // Channel-specific tracking
        let channelBestId = null;
        let channelTeamsYearId = null;
        let channelTeamsId = null;
        let channelAnyId = null;
        const preferChannelLower = preferChannel ? preferChannel.toLowerCase() : null;

        while ((match = rendererPattern.exec(html)) !== null) {
          const videoId = match[1];
          const title = match[2];
          const titleLower = title.toLowerCase();
          const videoChannel = (channelMap[videoId] || "").toLowerCase();
          const isFromChannel = preferChannelLower && videoChannel === preferChannelLower;

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

          // Track channel-specific matches
          if (isFromChannel) {
            if (hasTeams && hasYear && (!queryGameNum || hasGameNum) && !channelBestId) {
              channelBestId = videoId;
            }
            if (hasTeams && hasYear && !channelTeamsYearId) channelTeamsYearId = videoId;
            if (hasTeams && !channelTeamsId) channelTeamsId = videoId;
            if (!channelAnyId) channelAnyId = videoId;
          }

          // Best: highlight + both teams + year + game number (playoff series)
          if (hasTeams && hasYear && queryGameNum && hasGameNum) {
            bestMatchId = videoId;
            if (!preferChannel) break;
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

        let videoId;
        if (preferChannel) {
          // When channel is requested, prefer channel matches, fall back to any match
          videoId = channelBestId || channelTeamsYearId || channelTeamsId || channelAnyId || null;
        } else {
          // General search: best match from any source
          videoId = bestMatchId || teamsGameMatchedId || teamsMatchedId || yearMatchedId || firstHighlightId;
        }
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
