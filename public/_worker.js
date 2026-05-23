export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/youtube") {
      // CORS: Capacitor native shells (capacitor://localhost on iOS,
      // https://localhost on Android) fetch this cross-origin. Without
      // Access-Control-Allow-Origin the WebView blocks the response, the
      // highlight video-ID lookup silently fails, and every highlight
      // button falls back to opening a YouTube search in the browser
      // instead of playing in the in-app modal. Mirrors the /news/* block.
      if (request.method === "OPTIONS") {
        return new Response(null, {
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, OPTIONS",
            "Access-Control-Max-Age": "86400",
          },
        });
      }
      const query = url.searchParams.get("q");
      const preferChannel = url.searchParams.get("channel"); // e.g. "NBA", "MLB"
      const excludeParam = url.searchParams.get("exclude"); // comma-separated videoIds to skip (used by VideoModal fallback retries)
      const excludeSet = new Set(
        (excludeParam || "").split(",").map((s) => s.trim()).filter(Boolean)
      );
      if (!query) {
        return new Response(JSON.stringify({ error: "Missing q param" }), {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
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

        // Extract month + day from the en-US-format date GameCard sends
        // ("…highlights May 22, 2026"). When present, the per-video
        // hasYear check below is upgraded to a strict M/D/YY match,
        // which rejects MLB titles whose (M/D/YY) token names a
        // different day (e.g. a 5/21 upload winning the 5/19 query).
        // NBA/WNBA/NHL recap titles use the long form "May 22, 2026"
        // with no M/D/YY token and so fall back to the loose year
        // check — no regression.
        const QUERY_MONTHS = { jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12 };
        const dateInQueryMatch = query.match(/\b([A-Za-z]{3,9})\s+(\d{1,2}),\s+(\d{4})\b/);
        const queryMonth = dateInQueryMatch ? QUERY_MONTHS[dateInQueryMatch[1].slice(0,3).toLowerCase()] : null;
        const queryDay = dateInQueryMatch ? parseInt(dateInQueryMatch[2], 10) : null;

        // Extract series game number from query (e.g. "Game 2")
        const gameNumMatch = query.match(/Game (\d+)/i);
        const queryGameNum = gameNumMatch ? gameNumMatch[1] : null;

        // Golf round number from query (e.g. "Round 1 highlights")
        const golfRoundMatch = query.match(/Round\s+(\d+)\s+highlights/i);
        const queryGolfRound = golfRoundMatch ? golfRoundMatch[1] : null;
        const ROUND_ORDINALS = { "1": "first", "2": "second", "3": "third", "4": "final" };
        const queryRoundOrdinal = queryGolfRound ? ROUND_ORDINALS[queryGolfRound] : null;

        // Golf tournament label from query — the client sends queries
        // as `${label} ${year} Round ${n} highlights` (see
        // getGolfHighlightQuery in lib/youtube.ts). Extracting the
        // label lets us require it in titles, which is the fix for
        // PGA TOUR's channel returning a non-Masters event when the
        // channel's most recent "Round X highlights" upload is from a
        // different tournament.
        let queryGolfTournament = null;
        if (queryGolfRound) {
          const labelMatch = query.match(/^(.+?)\s+20\d{2}\s+round/i);
          if (labelMatch) {
            queryGolfTournament = labelMatch[1].toLowerCase().trim();
          }
        }
        // Short aliases so "Masters" matches "2026 Masters",
        // "the masters tournament", etc. without needing exact
        // substring equality. Multi-word labels fall through as-is.
        const golfTournamentAliases = (() => {
          if (!queryGolfTournament) return [];
          const base = [queryGolfTournament];
          if (queryGolfTournament === "masters") base.push("the masters");
          if (queryGolfTournament === "us open") base.push("u.s. open");
          if (queryGolfTournament === "the open") base.push("open championship");
          return base;
        })();

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
        // When the query specifies a concrete game (both team names
        // parsed), refuse to fall through to firstHighlightId or the
        // raw-regex catch-all — those tiers don't enforce hasTeams and
        // would otherwise serve a trending unrelated game when no
        // upload exists for the requested matchup (e.g. Cardinals/Reds
        // query landing on a HoH walk-off recap of Nationals/Braves).
        const queryHasSpecificTeams = queryTeams.length === 2;

        // Reverse-index TEAM_ALIASES so a lookup by ANY variant finds
        // the full alias list. ESPN's shortDisplayName is "Diamondbacks"
        // while MLB's YouTube title uses "D-backs"; without this
        // reverse-lookup, getTeamVariants("diamondbacks") fell back to
        // ["diamondbacks"], hasTeams was always false, and the only
        // tier that fired was yearMatchedId (team-agnostic, recently
        // gated behind queryHasSpecificTeams). Build once per request.
        const TEAM_VARIANT_INDEX = {};
        for (const variants of Object.values(TEAM_ALIASES)) {
          for (const v of variants) {
            TEAM_VARIANT_INDEX[v.toLowerCase()] = variants;
          }
        }
        function getTeamVariants(teamName) {
          const lower = teamName.toLowerCase();
          return TEAM_VARIANT_INDEX[lower] || TEAM_ALIASES[lower] || [lower];
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
          if (excludeSet.has(idMatch[1])) return null;
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
        // Extended-highlight fallbacks — leagues (esp. NBA/MLB) post
        // both a standard recap and a longer "EXTENDED HIGHLIGHTS"
        // version. Standard is preferred everywhere; extended only
        // wins when no standard video matches at any tier.
        let bestMatchExtendedId = null;
        let teamsGameExtendedId = null;
        let teamsExtendedId = null;
        let yearMatchedExtendedId = null;
        let firstHighlightExtendedId = null;
        // Golf-specific tracking
        let golfRoundYearId = null;
        let golfRoundId = null;
        let golfRecapYearId = null; // "recap" + round + year
        let golfRecapId = null;     // "recap" + round
        // Channel-specific tracking
        let channelBestId = null;
        let channelBestExtendedId = null;
        let channelTeamsYearId = null;
        let channelTeamsYearExtendedId = null;
        let channelTeamsId = null;
        let channelTeamsExtendedId = null;
        let channelGolfRecapYearId = null; // "recap" + round + year (from channel)
        let channelGolfRecapId = null;     // "recap" + round (from channel)
        let channelGolfRoundYearId = null;
        let channelGolfRoundId = null;
        let channelAnyId = null;
        let channelAnyExtendedId = null;
        // Golf player-reel tracking — videos that match round/year but
        // look like player-specific cuts (e.g. "Rory McIlroy Round 3
        // Highlights") get demoted so the full-day recap wins slot 0.
        // We still remember the best player-reel matches and fall back
        // to them if no non-reel video is available.
        let channelPlayerReelId = null;
        let playerReelId = null;
        const preferChannelLower = preferChannel ? preferChannel.toLowerCase() : null;

        // If the requested channel is itself tournament-specific
        // (e.g. "The Masters" for a Masters query), videos from that
        // channel are implicitly about this tournament — so we waive
        // the hasGolfTournament title check for that channel's hits.
        // Without this waiver, The Masters channel's Round 3 uploads
        // were being excluded because they don't repeat "Masters" in
        // the title (it's already the channel name), leaving us with
        // only 3 filled highlight slots instead of 4.
        const channelImpliesGolfTournament =
          !!preferChannelLower &&
          golfTournamentAliases.some((alias) =>
            preferChannelLower.includes(alias)
          );

        for (const video of videos) {
          const { videoId, title, channel } = video;
          const titleLower = title.toLowerCase();
          const isFromChannel = preferChannelLower && channel.toLowerCase() === preferChannelLower;

          // Check if title contains a highlight-indicator keyword. We
          // accept "recap" in addition to "highlight" because full-day
          // broadcast recaps on ESPN/PGA TOUR sometimes title as
          // "Round 3 Recap" without "highlights". And for tournament-
          // specific channels (The Masters, USGA, etc.) we also
          // accept a plain "Round N" title — those channels routinely
          // post round content without either keyword because the
          // channel context already implies it.
          const roundOnlyTitleOk =
            isFromChannel &&
            channelImpliesGolfTournament &&
            queryGolfRound &&
            (titleLower.includes(`round ${queryGolfRound}`) ||
              titleLower.includes(`day ${queryGolfRound}`) ||
              (queryRoundOrdinal &&
                titleLower.includes(`${queryRoundOrdinal} round`)));
          const isHighlight =
            titleLower.includes("highlight") ||
            titleLower.includes("recap") ||
            roundOnlyTitleOk;
          if (!isHighlight) continue;

          // "EXTENDED HIGHLIGHTS" variants (common on NBA/MLB official
          // channels) — still valid highlights, but demoted so the
          // standard recap wins the primary slot when both exist.
          const isExtended = /\bextended\b/i.test(titleLower);

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

          // Date match — strict when both the title carries an
          // explicit date (short form "(5/22/26)" or long form "May
          // 22, 2026") and the query has a parseable date. When the
          // title's date DISAGREES with the query, disqualify the
          // video from every tier — otherwise channelTeamsId /
          // teamsMatchedId (hasTeams only) would serve last week's
          // game as today's highlight. Better to 404 than spoil.
          // Titles with NO explicit date fall back to the loose
          // year-substring check (preserves YouTube descriptions
          // that only mention the year).
          let titleHasExplicitDate = false;
          let titleDateMatches = false;
          if (queryMonth && queryDay && queryYear) {
            const queryYY = queryYear.slice(-2);
            const shortTok = title.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/);
            const longTok = title.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(\d{1,2}),\s+(\d{4})\b/i);
            if (shortTok) {
              titleHasExplicitDate = true;
              const tM = parseInt(shortTok[1], 10);
              const tD = parseInt(shortTok[2], 10);
              const tY = shortTok[3];
              titleDateMatches =
                tM === queryMonth && tD === queryDay && (tY === queryYear || tY === queryYY);
            } else if (longTok) {
              titleHasExplicitDate = true;
              const tM = QUERY_MONTHS[longTok[1].slice(0,3).toLowerCase()];
              const tD = parseInt(longTok[2], 10);
              const tY = longTok[3];
              titleDateMatches = tM === queryMonth && tD === queryDay && tY === queryYear;
            }
          }
          if (titleHasExplicitDate && !titleDateMatches) continue;
          const hasYear = titleHasExplicitDate
            ? titleDateMatches
            : !!(queryYear && title.includes(queryYear));

          // Check if series game number matches (e.g. "Game 2" in title)
          const hasGameNum = queryGameNum && titleLower.includes(`game ${queryGameNum}`);

          // Check if golf round matches in title — accept "Round 1", "First Round", "Day 1"
          const hasGolfRound = queryGolfRound && (
            titleLower.includes(`round ${queryGolfRound}`) ||
            (queryRoundOrdinal && titleLower.includes(`${queryRoundOrdinal} round`)) ||
            titleLower.includes(`day ${queryGolfRound}`)
          );

          // Does the title actually mention THIS tournament? Filter
          // applied across all golf-match tiers so the PGA TOUR
          // channel's latest "Round 3 highlights" video for a
          // different tournament stops winning the Masters slot.
          const hasGolfTournament =
            golfTournamentAliases.length > 0 &&
            golfTournamentAliases.some((alias) => titleLower.includes(alias));

          // Track channel-specific matches
          if (isFromChannel) {
            if (hasTeams && hasYear && (!queryGameNum || hasGameNum)) {
              if (!isExtended && !channelBestId) channelBestId = videoId;
              if (isExtended && !channelBestExtendedId) channelBestExtendedId = videoId;
            }
            if (hasTeams && hasYear) {
              if (!isExtended && !channelTeamsYearId) channelTeamsYearId = videoId;
              if (isExtended && !channelTeamsYearExtendedId) channelTeamsYearExtendedId = videoId;
            }
            if (hasTeams) {
              if (!isExtended && !channelTeamsId) channelTeamsId = videoId;
              if (isExtended && !channelTeamsExtendedId) channelTeamsExtendedId = videoId;
            }
            // Golf round/recap tiers — gated on tournament match OR
            // the channel itself implying the tournament (The Masters
            // channel for a Masters query). Without the waiver, a
            // tournament-specific channel's own uploads get excluded
            // just because they don't repeat the tournament name in
            // the title.
            const channelTournamentOk =
              hasGolfTournament || channelImpliesGolfTournament;
            if (hasGolfRound && channelTournamentOk && !isLikelyPlayerReel) {
              if (hasRecap && hasYear && !channelGolfRecapYearId) channelGolfRecapYearId = videoId;
              if (hasRecap && !channelGolfRecapId) channelGolfRecapId = videoId;
              if (hasYear && !channelGolfRoundYearId) channelGolfRoundYearId = videoId;
              if (!channelGolfRoundId) channelGolfRoundId = videoId;
            }
            if (hasGolfRound && channelTournamentOk && isLikelyPlayerReel && !channelPlayerReelId) {
              channelPlayerReelId = videoId;
            }
            if (!isExtended && !channelAnyId) channelAnyId = videoId;
            if (isExtended && !channelAnyExtendedId) channelAnyExtendedId = videoId;
          }

          // Golf-specific (no preferred channel) — match round number + year in title
          if (queryGolfRound) {
            if (hasGolfRound && hasGolfTournament && !isLikelyPlayerReel) {
              if (hasRecap && hasYear && !golfRecapYearId) golfRecapYearId = videoId;
              if (hasRecap && !golfRecapId) golfRecapId = videoId;
              if (hasYear && !golfRoundYearId) golfRoundYearId = videoId;
              if (!golfRoundId) golfRoundId = videoId;
            }
            if (hasGolfRound && hasGolfTournament && isLikelyPlayerReel && !playerReelId) {
              playerReelId = videoId;
            }
          }

          // Best: highlight + both teams + year + game number (playoff series)
          if (hasTeams && hasYear && queryGameNum && hasGameNum) {
            if (!isExtended) {
              if (!bestMatchId) bestMatchId = videoId;
              if (!preferChannel) break;
            } else if (!bestMatchExtendedId) {
              bestMatchExtendedId = videoId;
            }
          }
          // Great: highlight + both teams + year (no series or series matched)
          if (hasTeams && hasYear && !queryGameNum) {
            if (!isExtended && !bestMatchId) bestMatchId = videoId;
            if (isExtended && !bestMatchExtendedId) bestMatchExtendedId = videoId;
          }
          // Good: highlight + both teams + game number (no year)
          if (hasTeams && hasGameNum) {
            if (!isExtended && !teamsGameMatchedId) teamsGameMatchedId = videoId;
            if (isExtended && !teamsGameExtendedId) teamsGameExtendedId = videoId;
          }
          // OK: highlight + both teams (no year/game check)
          if (hasTeams) {
            if (!isExtended && !teamsMatchedId) teamsMatchedId = videoId;
            if (isExtended && !teamsExtendedId) teamsExtendedId = videoId;
          }
          // Weak: highlight + year (teams might be abbreviated
          // differently). Only valid when the query doesn't itself
          // specify two teams — for game queries this tier would let a
          // trending unrelated highlight win just because the date
          // matches (e.g. a HoH Nationals/Braves walk-off recap for a
          // Cardinals/Reds query). queryHasSpecificTeams gates it off.
          if (hasYear && !queryHasSpecificTeams) {
            if (!isExtended && !yearMatchedId) yearMatchedId = videoId;
            if (isExtended && !yearMatchedExtendedId) yearMatchedExtendedId = videoId;
          }
          // Fallback: any highlight
          if (!isExtended && !firstHighlightId) firstHighlightId = videoId;
          if (isExtended && !firstHighlightExtendedId) firstHighlightExtendedId = videoId;
        }

        const isGolfQuery = !!queryGolfRound;

        let videoId;
        if (preferChannel) {
          // Channel-filtered priority (highest → lowest). Length is
          // the dominant preference: every standard-highlight tier
          // (channel OR non-channel) is exhausted before any
          // extended tier, so a random-channel standard recap beats
          // the official channel's extended upload. For a golf
          // query, channelAnyId is only safe when the channel itself
          // is tournament-specific (The Masters → implicitly Masters
          // content); otherwise we'd let a generic PGA TOUR upload
          // for a different tour stop slip through as the last
          // resort, which is what we're explicitly preventing.
          const golfChannelAnyOk =
            isGolfQuery && channelImpliesGolfTournament;
          videoId =
            // Standard: channel first
            channelBestId ||
            channelGolfRecapYearId ||
            channelGolfRecapId ||
            channelTeamsYearId ||
            channelGolfRoundYearId ||
            channelGolfRoundId ||
            channelTeamsId ||
            // Standard: non-channel (length beats channel preference)
            bestMatchId ||
            teamsGameMatchedId ||
            golfRecapYearId ||
            golfRecapId ||
            golfRoundYearId ||
            golfRoundId ||
            teamsMatchedId ||
            yearMatchedId ||
            // Extended: channel first
            channelBestExtendedId ||
            channelTeamsYearExtendedId ||
            channelTeamsExtendedId ||
            // Extended: non-channel
            bestMatchExtendedId ||
            teamsGameExtendedId ||
            teamsExtendedId ||
            yearMatchedExtendedId ||
            // Weakest: player reels, any-from-channel, any highlight
            channelPlayerReelId ||
            playerReelId ||
            (isGolfQuery ? (golfChannelAnyOk ? channelAnyId : null) : (queryHasSpecificTeams ? null : channelAnyId)) ||
            (isGolfQuery || queryHasSpecificTeams ? null : firstHighlightId) ||
            (isGolfQuery ? (golfChannelAnyOk ? channelAnyExtendedId : null) : (queryHasSpecificTeams ? null : channelAnyExtendedId)) ||
            (isGolfQuery || queryHasSpecificTeams ? null : firstHighlightExtendedId) ||
            null;
        } else {
          // General (non-channel) search: standard everywhere first,
          // then extended, then weakest fallbacks. firstHighlightId
          // is the fallback for non-golf only.
          videoId =
            // Standard
            bestMatchId ||
            teamsGameMatchedId ||
            golfRecapYearId ||
            golfRecapId ||
            golfRoundYearId ||
            golfRoundId ||
            teamsMatchedId ||
            yearMatchedId ||
            // Extended
            bestMatchExtendedId ||
            teamsGameExtendedId ||
            teamsExtendedId ||
            yearMatchedExtendedId ||
            // Weakest
            playerReelId ||
            (isGolfQuery || queryHasSpecificTeams ? null : firstHighlightId) ||
            (isGolfQuery || queryHasSpecificTeams ? null : firstHighlightExtendedId);
        }
        if (!videoId && !isGolfQuery && !queryHasSpecificTeams) {
          // Raw-regex fallback — only for non-golf. For golf we'd
          // rather return 404 than guess wrong and let a random
          // PGA TOUR highlight win the Masters slot.
          const allMatches = [...html.matchAll(/"videoId":"([a-zA-Z0-9_-]{11})"/g)];
          const firstAllowed = allMatches.find((m) => !excludeSet.has(m[1]));
          videoId = firstAllowed ? firstAllowed[1] : null;
        }

        if (!videoId) {
          return new Response(JSON.stringify({ error: "No results" }), {
            status: 404,
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*",
            },
          });
        }

        return new Response(JSON.stringify({ videoId }), {
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "public, max-age=300",
            "Access-Control-Allow-Origin": "*",
          },
        });
      } catch {
        return new Response(JSON.stringify({ error: "Search failed" }), {
          status: 500,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        });
      }
    }

    // NHL condensed-game + recap video links. The NHL API (api-web.nhle.com)
    // sends no CORS headers, so a browser/Capacitor WebView can't hit it
    // directly — proxy it here. Returns each finished game's "Recap" (~3-4min)
    // and "Condensed Game" (~10min) NHL.com video URLs, keyed by common team
    // names so espn.ts can match them onto ESPN-sourced games.
    if (url.pathname === "/api/nhl-videos") {
      if (request.method === "OPTIONS") {
        return new Response(null, {
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, OPTIONS",
            "Access-Control-Max-Age": "86400",
          },
        });
      }
      const corsJson = (body, status = 200, maxAge = 600) =>
        new Response(JSON.stringify(body), {
          status,
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": `public, max-age=${maxAge}`,
            "Access-Control-Allow-Origin": "*",
          },
        });
      // date param is YYYYMMDD (the app's selectedDate); NHL wants YYYY-MM-DD.
      const raw = url.searchParams.get("date") || "";
      const iso = /^\d{8}$/.test(raw)
        ? `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`
        : raw;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
        return corsJson({ error: "Bad date" }, 400, 0);
      }
      try {
        const res = await fetch(`https://api-web.nhle.com/v1/score/${iso}`, {
          headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" },
        });
        if (!res.ok) return corsJson({ games: [] }, 200, 60);
        const data = await res.json();
        const nameOf = (t) => {
          const n = t && t.name;
          return (n && (n.default || n)) || "";
        };
        const toUrl = (path) => (path ? `https://www.nhl.com${path}` : null);
        const games = (data.games || [])
          .map((g) => ({
            away: nameOf(g.awayTeam),
            home: nameOf(g.homeTeam),
            recap: toUrl(g.threeMinRecap),
            condensed: toUrl(g.condensedGame),
          }))
          .filter((g) => g.away && g.home && (g.recap || g.condensed));
        return corsJson({ games });
      } catch {
        return corsJson({ games: [] }, 200, 60);
      }
    }

    // R2-backed data feeds (news prebake + 3 root JSONs). Decouples cron data
    // refresh from the deploy pipeline. If the bucket binding is missing or
    // the object isn't there yet, fall through to the static asset on main —
    // safe-by-default during the initial cutover window.
    const R2_ROOT_PATHS = new Set([
      "/espn-airings.json",
      "/prime-asins.json",
      "/big-inning-schedule.json",
    ]);
    if (env.DATA && (url.pathname.startsWith("/news/") || url.pathname.startsWith("/alerts/") || R2_ROOT_PATHS.has(url.pathname))) {
      // CORS: Capacitor iOS WebView runs at `capacitor://localhost`, so fetches
      // to hidescore.com are cross-origin and blocked without ACAO. Same applies
      // to Android (`https://localhost`) and any future native shell.
      if (request.method === "OPTIONS") {
        return new Response(null, {
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, OPTIONS",
            "Access-Control-Max-Age": "86400",
          },
        });
      }
      const obj = await env.DATA.get(url.pathname.replace(/^\//, ""));
      if (obj) {
        return new Response(obj.body, {
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "public, max-age=60",
            "Access-Control-Allow-Origin": "*",
          },
        });
      }
    }

    // Fall through to static assets
    return env.ASSETS.fetch(request);
  },
};
