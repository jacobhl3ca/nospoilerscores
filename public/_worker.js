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

        // Golf round number from query (e.g. "Round 1 highlights")
        const golfRoundMatch = query.match(/Round\s+(\d+)\s+highlights/i);
        const queryGolfRound = golfRoundMatch ? golfRoundMatch[1] : null;
        const ROUND_ORDINALS = { "1": "first", "2": "second", "3": "third", "4": "final" };
        const queryRoundOrdinal = queryGolfRound ? ROUND_ORDINALS[queryGolfRound] : null;

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

        // Split HTML into videoRenderer blocks and parse each one individually
        const blocks = html.split('"videoRenderer":{').slice(1);
        const videos = blocks.map((block) => {
          const idMatch = block.match(/^"videoId":"([a-zA-Z0-9_-]{11})"/);
          const titleMatch = block.match(/"title":\{"runs":\[\{"text":"(.*?)"\}/);
          const channelMatch = block.match(/"ownerText":\{"runs":\[\{"text":"(.*?)"/);
          if (!idMatch) return null;
          return {
            videoId: idMatch[1],
            title: titleMatch ? titleMatch[1] : "",
            channel: channelMatch ? channelMatch[1] : "",
          };
        }).filter(Boolean);

        let bestMatchId = null;
        let yearMatchedId = null;
        let teamsMatchedId = null;
        let teamsGameMatchedId = null;
        let firstHighlightId = null;
        // Golf-specific tracking
        let golfRoundYearId = null;
        let golfRoundId = null;
        let golfRecapYearId = null; // "recap" + round + year
        let golfRecapId = null;     // "recap" + round
        // Channel-specific tracking
        let channelBestId = null;
        let channelTeamsYearId = null;
        let channelTeamsId = null;
        let channelGolfRecapYearId = null; // "recap" + round + year (from channel)
        let channelGolfRecapId = null;     // "recap" + round (from channel)
        let channelGolfRoundYearId = null;
        let channelGolfRoundId = null;
        let channelAnyId = null;
        // Golf player-reel tracking — videos that match round/year but
        // look like player-specific cuts (e.g. "Rory McIlroy Round 3
        // Highlights") get demoted so the full-day recap wins slot 0.
        // We still remember the best player-reel matches and fall back
        // to them if no non-reel video is available.
        let channelPlayerReelId = null;
        let playerReelId = null;
        const preferChannelLower = preferChannel ? preferChannel.toLowerCase() : null;

        for (const video of videos) {
          const { videoId, title, channel } = video;
          const titleLower = title.toLowerCase();
          const isFromChannel = preferChannelLower && channel.toLowerCase() === preferChannelLower;

          // Check if title contains a highlight-indicator keyword. We
          // accept "recap" in addition to "highlight" because full-day
          // broadcast recaps on ESPN/PGA TOUR sometimes title as
          // "Round 3 Recap" without "highlights".
          const isHighlight =
            titleLower.includes("highlight") || titleLower.includes("recap");
          if (!isHighlight) continue;

          // Recap-keyword detection — titles with "recap", "all
          // highlights", or "full round" are strongly biased toward
          // full-day broadcast recaps (vs player reels which rarely
          // use these words).
          const hasRecap =
            titleLower.includes("recap") ||
            titleLower.includes("all highlights") ||
            titleLower.includes("full round");

          // Player-reel heuristic — titles that lead with two
          // capitalized words (typical "First Last" pattern) and
          // don't start with a tournament/round/year token are
          // almost certainly player-specific cuts. Used to demote
          // those entries below the full recap in slot 0.
          const isLikelyPlayerReel =
            /^[A-Z][a-zA-Z'\-]+\s+[A-Z][a-zA-Z'\-]+/.test(title) &&
            !/^(round|final|day|the|first|second|third|fourth|20\d{2}|pga|lpga|masters|us open|the open)\b/i.test(title);

          // Check if both team names appear in the title (using aliases)
          const hasTeams =
            queryTeams.length === 2 &&
            queryTeams.every((team) => titleHasTeam(titleLower, team));

          // Check if the year matches
          const hasYear = queryYear && title.includes(queryYear);

          // Check if series game number matches (e.g. "Game 2" in title)
          const hasGameNum = queryGameNum && titleLower.includes(`game ${queryGameNum}`);

          // Check if golf round matches in title — accept "Round 1", "First Round", "Day 1"
          const hasGolfRound = queryGolfRound && (
            titleLower.includes(`round ${queryGolfRound}`) ||
            (queryRoundOrdinal && titleLower.includes(`${queryRoundOrdinal} round`)) ||
            titleLower.includes(`day ${queryGolfRound}`)
          );

          // Track channel-specific matches
          if (isFromChannel) {
            if (hasTeams && hasYear && (!queryGameNum || hasGameNum) && !channelBestId) {
              channelBestId = videoId;
            }
            if (hasTeams && hasYear && !channelTeamsYearId) channelTeamsYearId = videoId;
            if (hasTeams && !channelTeamsId) channelTeamsId = videoId;
            // Golf: recap-keyword tier takes priority over plain round/year
            // tiers, but only for non-player-reel titles. Player reels fall
            // into the separate channelPlayerReelId bucket below so they
            // don't crowd out the full recap.
            if (hasGolfRound && !isLikelyPlayerReel) {
              if (hasRecap && hasYear && !channelGolfRecapYearId) channelGolfRecapYearId = videoId;
              if (hasRecap && !channelGolfRecapId) channelGolfRecapId = videoId;
              if (hasYear && !channelGolfRoundYearId) channelGolfRoundYearId = videoId;
              if (!channelGolfRoundId) channelGolfRoundId = videoId;
            }
            if (hasGolfRound && isLikelyPlayerReel && !channelPlayerReelId) {
              channelPlayerReelId = videoId;
            }
            if (!channelAnyId) channelAnyId = videoId;
          }

          // Golf-specific (no preferred channel) — match round number + year in title
          if (queryGolfRound) {
            if (hasGolfRound && !isLikelyPlayerReel) {
              if (hasRecap && hasYear && !golfRecapYearId) golfRecapYearId = videoId;
              if (hasRecap && !golfRecapId) golfRecapId = videoId;
              if (hasYear && !golfRoundYearId) golfRoundYearId = videoId;
              if (!golfRoundId) golfRoundId = videoId;
            }
            if (hasGolfRound && isLikelyPlayerReel && !playerReelId) {
              playerReelId = videoId;
            }
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
          // Channel-filtered priority (highest → lowest):
          //   1. team-sport exact match (unchanged)
          //   2. golf recap + round + year  ← new, beats round-only
          //   3. golf recap + round
          //   4. golf round + year
          //   5. golf round (plain)
          //   6. any team match
          //   7. player-reel (round + year match but named player)
          //   8. any highlight-titled video from the channel
          // Player reels are demoted past every other round-matched
          // bucket so the full-day recap wins slot 0 whenever one
          // exists on the channel.
          videoId =
            channelBestId ||
            channelGolfRecapYearId ||
            channelGolfRecapId ||
            channelTeamsYearId ||
            channelGolfRoundYearId ||
            channelGolfRoundId ||
            channelTeamsId ||
            channelPlayerReelId ||
            channelAnyId ||
            null;
        } else {
          // General search: recap tiers first, then round tiers, then
          // team-sport tiers, then player reels as final fallback.
          videoId =
            bestMatchId ||
            teamsGameMatchedId ||
            golfRecapYearId ||
            golfRecapId ||
            golfRoundYearId ||
            golfRoundId ||
            teamsMatchedId ||
            yearMatchedId ||
            playerReelId ||
            firstHighlightId;
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
