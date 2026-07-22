// ---------------------------------------------------------------------------
// Shared-highlight preview cards (see src/lib/shareCard.ts).
//
// A shared link `hidescore.com/?v=<id>&c=<key>` opens the clip in-app (?v=) and,
// for link-preview crawlers (iMessage/Slack/Twitter/…), unfurls as a matchup
// card (teams + date). The card PNG is rendered SERVER-SIDE by the prebake cron
// (scripts/prebake-share-cards.mjs, Node + node-canvas) and stored in R2 at
// `cards/<key>.png`. Browser rendering was abandoned: Firefox resistFinger-
// printing randomizes canvas readback and corrupts the export. So the worker
// only serves the stored card and injects the per-game OG meta.
const CARD_KEY_RE = /^[a-z]+-[a-z0-9]+-[a-z0-9]+-\d{8}$/;
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

// Reconstruct a human title/description from the card key for the OG meta. The
// image carries the rich layout; this is the text fallback shown beside it.
function cardMetaFromKey(key) {
  const fallback = {
    title: "HideScore — No Spoiler Sports Scores",
    desc: "Spoiler-free sports highlights. Watch the recap without seeing the score.",
    image: "https://hidescore.com/og-image.png",
  };
  const m = key.match(/^([a-z]+)-([a-z0-9]+)-([a-z0-9]+)-(\d{4})(\d{2})(\d{2})$/);
  if (!m) return fallback;
  const [, sport, away, home, y, mo, d] = m;
  const month = MONTHS[parseInt(mo, 10) - 1];
  const dateStr = month ? `${month} ${parseInt(d, 10)}, ${y}` : `${y}-${mo}-${d}`;
  return {
    title: `${away.toUpperCase()} @ ${home.toUpperCase()} · ${dateStr} — HideScore`,
    desc: `Spoiler-free ${sport.toUpperCase()} highlight. Tap to watch the recap without seeing the score.`,
    image: "https://hidescore.com/og-image.png",
  };
}

// HTMLRewriter element handler — overwrite one attribute on a <meta> tag.
class AttrSetter {
  constructor(attr, value) { this.attr = attr; this.value = value; }
  element(el) { el.setAttribute(this.attr, this.value); }
}

// Bump when the card design changes — appended to og:image as ?r=N so crawlers
// and the CDN fetch a fresh URL instead of a stale cached image.
const CARD_REV = 4;

// Wrap an arbitrary news image (Reddit photo, preview thumb, league poster, or
// YouTube still) for use as the social-card image. Routed through weserv — the
// SAME proxy the app already uses for every redd.it thumbnail (see proxyImage in
// src/lib/news.ts): it normalizes Reddit's webp-as-jpeg + hotlink blocks, crops
// to the 1.91:1 OG frame with a smart focal point, and — via &default= — serves
// the branded site card if the source ever 404s, so a dead link can never beat
// the default blob.
function newsOgImage(raw) {
  const src = raw.replace(/^https?:\/\//, "");
  const fallback = encodeURIComponent("https://hidescore.com/og-image.png");
  return `https://images.weserv.nl/?url=${encodeURIComponent(src)}&w=1200&h=630&fit=cover&a=attention&output=jpg&q=82&default=${fallback}`;
}

export default {
  async fetch(request, env) {
   try {
    const url = new URL(request.url);

    // --- Sign in with Apple (web) + cross-device preference sync. See the
    // SIWA_* helpers at the bottom of this file. These routes are inert until
    // the APPLE_* / SESSION_SECRET env vars are set (handlers 503 otherwise),
    // so deploying this is safe before the secrets are in place.
    if (url.pathname === "/auth/apple/login")    return siwaLogin(request, env, url);
    if (url.pathname === "/auth/apple/callback") return siwaCallback(request, env, url);
    if (url.pathname === "/auth/apple/native" && request.method === "POST") return siwaNative(request, env);
    if (url.pathname === "/auth/google/login")    return googleLogin(request, env, url);
    if (url.pathname === "/auth/google/callback") return googleCallback(request, env, url);
    if (url.pathname === "/auth/logout")         return siwaLogout();
    if (url.pathname === "/api/me")              return siwaMe(request, env);
    if (url.pathname === "/api/prefs") {
      if (request.method === "PUT") return prefsPut(request, env);
      return prefsGet(request, env);
    }
    if (url.pathname === "/api/account" && request.method === "DELETE") return accountDelete(request, env);

    // --- Serve a stored share card (rendered server-side by the prebake cron).
    if (url.pathname.startsWith("/cards/") && url.pathname.endsWith(".png")) {
      if (env.DATA) {
        const obj = await env.DATA.get(url.pathname.replace(/^\//, ""));
        if (obj) {
          return new Response(obj.body, {
            headers: {
              "Content-Type": "image/png",
              // Moderate TTL (1 day), not immutable: the prebake may re-render a
              // card (corrected logos, design tweak). Hard busts ride the ?r=
              // rev appended to og:image (CARD_REV) so a stuck edge/crawler cache
              // entry can't pin a bad image for a year.
              "Cache-Control": "public, max-age=86400",
              "Access-Control-Allow-Origin": "*",
            },
          });
        }
      }
      return new Response("not found", { status: 404 });
    }

    // --- Per-game social preview: rewrite the static index.html's OG/Twitter
    // meta when a link carries ?c=<key>. UA-agnostic (Apple's link previewer
    // doesn't send a bot UA) — harmless to humans, who still boot the app and
    // open the highlight via ?v=. Only points og:image at the card if the PNG
    // actually exists in R2; otherwise the default site image stands.
    const cardKey = url.searchParams.get("c");
    if (cardKey && CARD_KEY_RE.test(cardKey) && (url.pathname === "/" || url.pathname === "/index.html")) {
      const meta = cardMetaFromKey(cardKey);
      let hasCard = false;
      if (env.DATA) {
        try { hasCard = !!(await env.DATA.head(`cards/${cardKey}.png`)); } catch { /* head best-effort */ }
      }
      if (hasCard) meta.image = `https://hidescore.com/cards/${cardKey}.png?r=${CARD_REV}`;
      const assetRes = await env.ASSETS.fetch(new Request(new URL("/", url), { method: "GET" }));
      return new HTMLRewriter()
        .on('meta[property="og:image"]', new AttrSetter("content", meta.image))
        .on('meta[name="twitter:image"]', new AttrSetter("content", meta.image))
        .on('meta[property="og:title"]', new AttrSetter("content", meta.title))
        .on('meta[name="twitter:title"]', new AttrSetter("content", meta.title))
        .on('meta[property="og:description"]', new AttrSetter("content", meta.desc))
        .on('meta[name="twitter:description"]', new AttrSetter("content", meta.desc))
        .on('meta[property="og:url"]', new AttrSetter("content", url.toString()))
        .transform(assetRes);
    }

    // --- News / highlight social preview: when a shared link carries a news
    // item's media (image post, video poster, or YouTube id) but NO matchup
    // card, unfurl with the actual photo / video still instead of the generic
    // site blob. This is the fix for "links to a news pic/video show my generic
    // blob." Producer: buildHighlightShareUrl in src/lib/shareCard.ts.
    //   hi = image-post URL · hp = video poster · v = YouTube id
    //   ht = headline (OG title) · hl = source label (e.g. "r/soccer")
    // Game recaps (?c=) are handled above and KEEP their spoiler-free teams+date
    // card on purpose; news items have no card and land here.
    const newsImg = url.searchParams.get("hi");
    const newsPoster = url.searchParams.get("hp");
    const newsVid = url.searchParams.get("v");
    const newsHead = url.searchParams.get("ht");
    const newsLabel = url.searchParams.get("hl");
    if (
      (url.pathname === "/" || url.pathname === "/index.html") &&
      (newsImg || newsPoster || newsHead || newsVid)
    ) {
      // Prefer the explicit image/poster; fall back to YouTube's own thumbnail
      // for video shares that carry only a ?v= id (ESPN / NBA / MLB top videos).
      let rawImg = newsImg || newsPoster;
      if (!rawImg && newsVid && /^[A-Za-z0-9_-]{6,15}$/.test(newsVid)) {
        rawImg = `https://i.ytimg.com/vi/${newsVid}/hqdefault.jpg`;
      }
      const image = rawImg ? newsOgImage(rawImg) : "https://hidescore.com/og-image.png";
      const title = newsHead
        ? (newsHead.length > 110 ? `${newsHead.slice(0, 109)}…` : newsHead)
        : "HideScore — No Spoiler Sports";
      const desc = newsLabel
        ? `${newsLabel} · Watch on HideScore — catch up without seeing the score.`
        : "Watch the highlight on HideScore — catch up without seeing the score.";
      const assetRes = await env.ASSETS.fetch(new Request(new URL("/", url), { method: "GET" }));
      return new HTMLRewriter()
        .on('meta[property="og:image"]', new AttrSetter("content", image))
        .on('meta[name="twitter:image"]', new AttrSetter("content", image))
        .on('meta[property="og:title"]', new AttrSetter("content", title))
        .on('meta[name="twitter:title"]', new AttrSetter("content", title))
        .on('meta[property="og:description"]', new AttrSetter("content", desc))
        .on('meta[name="twitter:description"]', new AttrSetter("content", desc))
        .on('meta[property="og:url"]', new AttrSetter("content", url.toString()))
        .transform(assetRes);
    }

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
      // prefer=extended flips the standard-vs-extended tiebreak so the LONGER
      // "Extended Highlights" cut wins when one exists. Used by the World Cup 2nd
      // highlight button to serve a reliably-distinct video from the standard cut
      // the 1st button plays — "normal + extended" (Jacob 7/7). Falls back to the
      // standard ordering when no extended video matched, so it's never worse.
      const preferExtended = url.searchParams.get("prefer") === "extended";
      // strict=1 → hard-gate to the requested channel: the returned video's
      // actual uploader (author_name, verified via oembed) MUST equal `channel`,
      // else return null. Used for sports where the matcher would otherwise fall
      // through to "any title with both names + highlights" and serve a fan
      // reupload (e.g. tennis Slams / golf majors, whose official channel skips
      // some matches — a real "Zverev vs Fery … Wimbledon" was served from junk
      // channel "Sadak Chaps"). Title text lies; channel identity doesn't. Inert
      // unless the caller sets it, so leagues whose official channel reliably
      // ranks #1 (MLB/NBA/…) are unaffected and pay no extra oembed round-trip.
      const strictChannelParam = url.searchParams.get("strict") === "1";
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

        // Soccer World Cup gate — national teams meet across many competitions
        // (friendlies, qualifiers, Gold Cup) and there are decades of old World
        // Cup classics between the same two nations, so "Away vs Home highlights"
        // alone can match the wrong game. The fifa client embeds "World Cup" in
        // the query (buildQuery competition arg, lib/youtube.ts); when present we
        // require the same token in the video title below — the soccer analogue
        // of hasGolfTournament. Every other league's query lacks the token, so
        // this is inert for them.
        // Match BOTH the English ("world cup", from the FOX/FIFA query) and the
        // Spanish ("copa mundial", from the Telemundo query) forms. The Spanish
        // side was previously unmatched, which quietly disabled every WC gate for
        // Telemundo queries — including the "resumen" highlight-keyword accept
        // (below) and the channel-scoped rescue (further down). That rescue is
        // what surfaces the recap when reupload spam / short clips bury the
        // official upload below page 1; without it a buried Telemundo recap 404s
        // even though it exists (the exact FOX failure mode Fix 5 solved for the
        // English side). "copa mundial" appears in no other league's query, so
        // this is inert for every non-WC sport.
        const isWorldCupQuery = /\b(world cup|copa mundial)\b/i.test(query);
        // Official WC highlight channels (lowercased ownerText). FOX is the US
        // English rightsholder and posts a full per-match recap; FIFA posts a
        // short neutral highlight cut; Telemundo posts Spanish recaps. Reuploaders ("CJ DRIPSET",
        // "Hậu Cao", "Watch Sports Era", …) copy ESPN's short team names so they
        // OUT-MATCH the official video (which titles "United States", not "USA"),
        // and they were winning the unscoped search button. For WC we accept ONLY
        // these channels — combined with the team aliases below, the official clip
        // wins and fan re-uploads are dropped. fifa queries only; inert elsewhere.
        const WC_OFFICIAL_CHANNELS = ["fox sports", "fox soccer", "fifa", "telemundo deportes"];

        // Team name aliases — ESPN shortDisplayName → common YouTube title variants.
        // Reverse-indexed below so a lookup by ANY listed variant returns the
        // full alias list (lets queries from ESPN's compact names match titles
        // that use the full club name, e.g. "Nottm Forest" ↔ "Nottingham Forest").
        const TEAM_ALIASES = {
          "trail blazers": ["blazers", "trail blazers", "portland"],
          "timberwolves": ["timberwolves", "wolves", "minnesota"],
          "76ers": ["76ers", "sixers", "philadelphia"],
          "uconn": ["uconn", "connecticut", "huskies"],
          "blue jays": ["blue jays", "jays", "toronto"],
          "white sox": ["white sox", "chi sox", "chicago white"],
          "red sox": ["red sox", "boston"],
          "d-backs": ["d-backs", "diamondbacks", "dbacks", "arizona"],
          // MLB has been inconsistent: some recaps title the team as
          // "Athletics", others as "A's" (with apostrophe). ESPN uses
          // "Athletics" as shortDisplayName, so we map both.
          "athletics": ["athletics", "a's", "oakland"],
          "st. john's": ["st. john's", "st johns", "saint john's", "saint johns", "st john's"],
          // EPL — ESPN compact form ↔ club name(s) used in YouTube titles
          "nottm forest": ["nottm forest", "nottingham forest", "nottingham"],
          "man united": ["man united", "manchester united", "man utd"],
          "man city": ["man city", "manchester city"],
          "c palace": ["c palace", "crystal palace", "palace"],
          "spurs": ["spurs", "tottenham", "tottenham hotspur"],
          "west ham": ["west ham", "west ham united"],
          "newcastle": ["newcastle", "newcastle united"],
          "leeds": ["leeds", "leeds united"],
          "wolves": ["wolves", "wolverhampton"],
          "brighton": ["brighton", "brighton & hove", "brighton hove"],
          "aston villa": ["aston villa", "villa"],
          // MLS — abbreviations ↔ full names
          "nycfc": ["nycfc", "new york city fc", "new york city"],
          "red bull ny": ["red bull ny", "new york red bulls", "red bulls"],
          "la galaxy": ["la galaxy", "los angeles galaxy", "galaxy"],
          "lafc": ["lafc", "los angeles fc", "los angeles football club"],
          "d.c. united": ["d.c. united", "dc united"],
          "kansas city": ["kansas city", "sporting kansas city", "sporting kc"],
          "st. louis": ["st. louis", "st louis", "saint louis", "st. louis city"],
          "new england": ["new england", "new england revolution", "revolution"],
          "cf montréal": ["cf montréal", "cf montreal", "montreal"],
          "salt lake": ["salt lake", "real salt lake", "rsl"],
          "san jose": ["san jose", "san jose earthquakes", "earthquakes"],
          // UCL / UEL — ESPN shortDisplayName ↔ CBS Sports Golazo title forms
          "psg": ["psg", "paris saint-germain", "paris sg", "paris"],
          "inter milan": ["inter milan", "inter", "internazionale"],
          "bayern": ["bayern", "bayern munich", "fc bayern", "fc bayern münchen", "fc bayern muenchen"],
          "atlético": ["atlético", "atletico", "atletico madrid", "atlético madrid", "atletico de madrid", "atleti"],
          "leverkusen": ["leverkusen", "bayer leverkusen", "bayer"],
          "dortmund": ["dortmund", "borussia dortmund", "bvb"],
          "frankfurt": ["frankfurt", "eintracht frankfurt", "eintracht"],
          "napoli": ["napoli", "ssc napoli"],
          "juventus": ["juventus", "juve"],
          "ajax": ["ajax", "ajax amsterdam"],
          "psv": ["psv", "psv eindhoven"],
          "monaco": ["monaco", "as monaco"],
          "club brugge": ["club brugge", "brugge"],
          "københavn": ["københavn", "kobenhavn", "copenhagen", "fc copenhagen"],
          "real madrid": ["real madrid", "madrid"],
          "barcelona": ["barcelona", "barça", "barca", "fc barcelona"],
          // World Cup national teams — ESPN shortDisplayName ↔ the full country
          // name official broadcasters (FOX) put in titles. Only the divergent /
          // variant-spelling teams need an entry; the rest (Brazil, France, …)
          // substring-match directly. Without these, FOX's "United States vs
          // Paraguay" failed hasTeams while a re-upload's "USA vs Paraguay" won.
          // Keys are the lowercased ESPN short names the client sends.
          "usa": ["usa", "united states", "usmnt"],
          "bosnia-herz": ["bosnia-herz", "bosnia-herzegovina", "bosnia and herzegovina", "bosnia & herzegovina", "bosnia", "herzegovina"],
          "south korea": ["south korea", "korea republic", "korea"],
          "ivory coast": ["ivory coast", "côte d'ivoire", "cote d'ivoire", "cote d ivoire"],
          "türkiye": ["türkiye", "turkiye", "turkey"],
          "congo dr": ["congo dr", "dr congo", "dr. congo", "democratic republic of congo"],
          "curaçao": ["curaçao", "curacao"],
          "czechia": ["czechia", "czech republic"],
          "iran": ["iran", "ir iran"],
          "cape verde": ["cape verde", "cabo verde"],
          "saudi arabia": ["saudi arabia", "saudi", "ksa"],
          "egypt": ["egypt", "egipto"],
          "france": ["france", "francia"],
          "germany": ["germany", "alemania"],
          "morocco": ["morocco", "marruecos"],
          "netherlands": ["netherlands", "holland", "paises bajos", "países bajos"],
          "senegal": ["senegal", "senegal"],
          "belgium": ["belgium", "belgica", "bélgica"],
          "switzerland": ["switzerland", "swiss", "suiza"],
          "australia": ["australia", "australia"],
          "paraguay": ["paraguay", "paraguay"],
          "colombia": ["colombia", "colombia"],
          "argentina": ["argentina", "argentina"],
          "spain": ["spain", "españa", "espana"],
        };

        // Extract team names from query: "Away vs Home highlights ..."
        const teamsMatch = query.match(/^(.+?)\s+vs\s+(.+?)\s+(?:highlights|resumen)\b/i);
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
            (isWorldCupQuery && titleLower.includes("resumen")) ||
            roundOnlyTitleOk;
          if (!isHighlight) continue;

          // World Cup gate (see isWorldCupQuery above) — drop any video whose
          // title doesn't say "World Cup" so a friendly / qualifier / continental
          // cup / old WC classic between the same two nations can't win. When
          // FIFA's real recap isn't up yet the button 404s and hides, which is
          // the app's preferred "better to 404 than serve the wrong game" path.
          if (isWorldCupQuery && !/\b(world cup|copa mundial|fifa)\b/.test(titleLower)) continue;
          // …and the upload must be from an official channel (see
          // WC_OFFICIAL_CHANNELS) — fan re-uploads copy ESPN's short team names
          // and would otherwise out-match the official clip on the unscoped
          // "search" button. Official-or-nothing for WC.
          if (isWorldCupQuery && !WC_OFFICIAL_CHANNELS.includes(channel.toLowerCase())) continue;

          // Longer-version variants — still valid highlights, but
          // demoted so the standard recap wins the primary slot when
          // both exist. Two title markers:
          //   • "EXTENDED HIGHLIGHTS" (NBA, CBS Golazo soccer)
          //   • "Full Game Highlights" — MLB's official channel now
          //     posts BOTH a long "Yankees vs. Red Sox: Official Full
          //     Game Highlights (June 26) | 2026 MLB Season" AND the
          //     standard short "Yankees vs. Red Sox Game Highlights
          //     (6/26/26) | MLB Highlights". The long one lists first
          //     on YouTube, so without this it won slot 0. Demoting
          //     "full game" is safe for NCAAF (whose ONLY/standard
          //     title is "... | Full Game Highlights | ESPN College
          //     Football") — with no standard competitor it still
          //     wins via the extended fallback tier.
          const isExtended =
            /\bextended\b/i.test(titleLower) ||
            /\bextendido\b/i.test(titleLower) ||
            /\bfull[\s-]?game\b/i.test(titleLower);

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
            // Accept M/D/YY, M-D-YY, and M.D.YY date forms. Soccer uploaders
            // (esp. team-channel reuploads) use dot-separators ("7.24.16")
            // which slipped past the slash-only regex and let a 2016 NYCFC
            // upload win a 2026 NYCFC query.
            const shortTok = title.match(/\b(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})\b/);
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
            } else {
              // Bare M/D tokens (no year) — official NHL channel uses
              // "Team @ Team M/D | NHL Highlights" for regular-season
              // games. Without this check, a 2/27 upload won a 5/23 query
              // because shortTok/longTok both failed and hasYear stayed
              // loose. Negative lookahead prevents matching the M/D part
              // of an already-handled M/D/Y; range check (M≤12, D≤31)
              // keeps stray digit pairs from being misread as dates.
              const bareTok = title.match(/\b(\d{1,2})\/(\d{1,2})\b(?!\s*[\/.\-]\s*\d)/);
              if (bareTok) {
                const tM = parseInt(bareTok[1], 10);
                const tD = parseInt(bareTok[2], 10);
                if (tM >= 1 && tM <= 12 && tD >= 1 && tD <= 31) {
                  titleHasExplicitDate = true;
                  titleDateMatches = tM === queryMonth && tD === queryDay;
                }
              }
            }
          }
          if (titleHasExplicitDate && !titleDateMatches) continue;
          // Wrong-year hard-skip — when the title has no full M/D/YY date but
          // DOES contain a 4-digit year that disagrees with the query year,
          // drop the video. Otherwise an old upload (e.g. an MLS title like
          // "Audi 2024 MLS Cup Playoffs | Full Match Highlights" with no
          // game date) could win the channelTeamsId tier for a current-year
          // query, since channelTeamsId doesn't require hasYear. Allow
          // titles that contain queryYear alongside other years (season
          // spans like "2025/26").
          if (!titleHasExplicitDate && queryYear) {
            const titleYears = title.match(/\b(20\d{2})\b/g) || [];
            if (titleYears.length > 0 && !titleYears.includes(queryYear)) continue;
          }
          const hasYear = titleHasExplicitDate
            ? titleDateMatches
            : !!(queryYear && title.includes(queryYear));

          // Spoiler hard-skip — defended at the worker since hidescore's
          // entire purpose is hiding outcomes. Two patterns:
          //   • soccer-style score in title ("Chelsea 2-1 Spurs"). Lookbehind/
          //     lookahead exclude (M-D-Y) date hyphens and "2025-26" season
          //     spans from false-positive matching.
          //   • outcome keywords ("walk-off", "comeback", "stuns", "leads",
          //     "winner", "wins", "loses", "hat-trick", "no-hitter", "grand
          //     slam"). Tuned to skip "champion"/"champions" because
          //     "Premier League" / "Champions League" appear in legit titles.
          //   • Soccer-specific additions (2026-05-27): "red card" (key
          //     match event), "(grab|gets|gains) all three points" / "all
          //     three points" — soccer-cliché for a 3-point win that
          //     bypassed every prior keyword.
          //   • Everyday result verbs (mirrors lib/spoilers.ts): "edge(s)"/
          //     "rout(s)"/"upset"/"clinch"/"sweep"/"ousts"/"eliminates"/
          //     "advances" — each names a winner or a knockout ("Warriors
          //     edge Lakers") yet slipped past the beat/defeat/win set. The
          //     leading \b keeps "edge" out of "hedge"/"wedge"; "rout" is
          //     spelled out so it can't swallow "route"/"routine". The
          //     beat/defeat/win verbs are widened to their inflections too
          //     (beat\w*/defeat\w*/won/lost) so a past-tense recap title
          //     ("Warriors beat Lakers", "Spurs won", "Lakers lost") is
          //     caught, not just the present tense — matching lib/spoilers.ts
          //     so the client's title-reveal check and this filter agree.
          //     "shut[- ]?outs?" adds the shutout framing ("Bruins shut out
          //     Canadiens", "Hellebuyck shutout") — a winner-and-nil reveal that
          //     read past the earlier set; "[- ]?" covers shutout/shut out/
          //     shut-out and "s?" the plural. "outlast\w*"/"prevail\w*" add the
          //     endure-to-win framing ("Warriors outlast Nuggets", "USMNT
          //     prevail") — each names the winner and neither word means anything
          //     but winning, so the false-positive risk is negligible.
          //     "toppl\w*"/"trounc\w*"/"demolish\w*" add the overthrow/blowout
          //     framing ("topple Celtics", "trounce United", "demolish Barca") —
          //     each names the winner or a routed favorite and means nothing but a
          //     defeat; the toppl/trounc stems drop the trailing "e" so the -ing
          //     forms still match. "thrash\w*" adds the same blowout framing so
          //     common in soccer/World Cup headlines ("Spain thrash Georgia",
          //     "City thrash United") — a decisive-win reveal that means nothing
          //     but a lopsided defeat. "cruise(?:s|d)?" adds the easy-win framing
          //     ("Real Madrid cruise past Getafe", "City cruise to victory") — a
          //     decisive-win reveal the existing verbs miss ("edge" is the narrow
          //     win, nothing covered the comfortable one), meaning nothing but
          //     winning comfortably in a highlight title. "canter(?:s|ed|ing)?"
          //     is the one clean member of that comfortable-win family still
          //     missing ("City canter to the title", "Arsenal cantered to
          //     victory") — inflections spelled out (not "canter\w*") so the
          //     closing \b lands between the "r" and "b" of "Canterbury" and the
          //     place name can't match. Byte-identical to spoilers.ts. The "[verb][- ]?past"
          //     clause — (?:eas(?:e|es|ed)|power(?:s|ed)?|breez(?:e|es|ed)|
          //     coast(?:s|ed)?|stroll(?:s|ed)?|waltz(?:es|ed)?|roll(?:s|ed)?)[- ]?past — adds the
          //     SAME comfortable-win framing in cruise's other everyday verbs, the
          //     "X past Y" idiom recap titles lean on ("Spain ease past Georgia",
          //     "City power past United", "Madrid breeze past Getafe", "Real Madrid
          //     coast past Alaves", "Celtics roll past Nets"). "roll past" is the
          //     American-sports ("Chiefs roll past Broncos") member, the lone one
          //     still missing. It's anchored to the mandatory trailing "past"
          //     like the "brush …aside"/"hold …off"/"see …off" idioms, and that
          //     anchor is what keeps the otherwise-common bare verbs safe: "power
          //     ranking", "star power", "at ease", "West Coast", "coast to coast",
          //     "on a roll", "roll call" and "years past" never fire. Its one benign
          //     collision — "ease past the keeper" (a dribble) — reveals a goal not a
          //     result and errs over-hide-safe. Byte-identical to spoilers.ts.
          //     "(?:sneak(?:s|ed)?|snuck|slip(?:s|ped)?|squeez(?:e|es|ed))[- ]?past"
          //     is the NARROW-win twin of that group — same "verb + past" idiom for a
          //     side that only just got through ("Real Madrid sneak past Getafe",
          //     "Chelsea slip past Fulham", "Spain squeeze past Georgia", "United
          //     snuck past City") — each names the beaten side yet slipped past the
          //     ease/power/breeze/coast/stroll/waltz set and carries no digits. Same
          //     mandatory trailing "past" anchor keeps the bare verbs safe ("slippery
          //     pitch", "sneak peek", "squeeze play" never fire); covers sneak/sneaks/
          //     sneaked/snuck, slip/slips/slipped, squeeze/squeezes/squeezed. The one
          //     benign "slip/sneak past the defender" (a dribble) errs over-hide-safe.
          //     Byte-identical to spoilers.ts. "outclass\w*" adds the
          //     superiority framing ("Brazil outclass Chile", "Spain outclassed
          //     Georgia") — a decisive-win reveal the blowout verbs miss, meaning
          //     nothing but winning comfortably in ordinary English. "outplay\w*"
          //     adds the on-the-day superiority framing ("Brazil outplay Croatia",
          //     "Germany outplayed Spain") — same outXXX family as the four above,
          //     nothing but the winning side begins with "outplay", so the
          //     false-positive risk is the same negligible level. "outscor\w*"
          //     adds the most literal winner-reveal of the family — whoever
          //     outscores the other side won ("Warriors outscore Lakers", "Spain
          //     outscored Italy") — and no non-result word begins with "outscor".
          //     "surviv\w*" adds the endure-to-advance framing ("Argentina survive on
          //     penalties", "Real Madrid survive a scare") — a result reveal its siblings
          //     outlast/prevail miss, meaning nothing but the named side getting through in
          //     a per-match highlight title; no in-scope club/nation begins with "surviv"
          //     and even survival/survivor are result-adjacent in sports.
          //     Kept byte-identical to spoilers.ts.
          //     "holds?[- ]?off"/"held[- ]?off" catch the protect-the-lead win
          //     framing ("Warriors hold off Lakers", "Bills held off Chiefs") —
          //     the mandatory trailing "off" keeps it clear of household/threshold,
          //     and the phrase means nothing but the leading side surviving to win.
          //     "hold(?:s|ing)?[- ]?on"/"held[- ]?on" are the same protect-the-lead
          //     win in its other phrasing ("Arsenal hold on", "Brazil held on",
          //     "10 men holding on") — the "off" variants missed it. The trailing \b
          //     keeps "hold on" clear of "hold onto"/"holding onto" (the ball-control
          //     sense), and these recap titles read over-hide-safe either way.
          //     "sees?[- ]?off"/"saw[- ]?off" are the direct sibling — "see off" is
          //     the British-recap verb for beating back a challenger to win, and it
          //     slipped the whole set ("Arsenal see off Spurs", "Madrid saw off Barca").
          //     Like hold/held off, ONLY the two-word phrase matches: the mandatory
          //     trailing "off" keeps "see"/"saw"/"sees" from firing alone (must-see,
          //     saw the ball), and the trailing \b keeps "sees off" clear of "oversees
          //     office". The literal-saw/"sees off a defender" senses never occur in the
          //     highlight titles this filter sees and err over-hide-safe. Byte-identical
          //     to spoilers.ts.
          //     "victory|victories|victorious" join the winning/winner/wins/won/win
          //     set — "victory" is one of the commonest outcome words in recap
          //     titles ("World Cup victory", "seal victory", "victorious"), yet none
          //     of its forms fired. Spelled out (not "victor\w*") so it can't swallow
          //     "Victoria"; the one benign collision (A-League's Melbourne Victory)
          //     is outside this app's MLS+UEFA+WC soccer scope. Byte-identical to
          //     spoilers.ts.
          //     "equali[sz]\w*" catches the goal-reveal framing ("late equaliser",
          //     "Spain equalize") — a partial-result leak like a clean sheet, with no
          //     digits for SCORE_RX to catch. "[sz]" covers both spellings and keeps it
          //     clear of "equality"; \w* covers every inflection. Byte-identical to
          //     spoilers.ts.
          //     "own[- ]?goals?" joins the goal-event reveal family (hat[- ]?tricks?/
          //     equali[sz]\w*): an "own goal" names a specific goal that was scored, so a
          //     title carrying it reveals a partial result ("Late own goal breaks Brazil
          //     hearts"), yet has no digits for SCORE_RX. The trailing "goal" keeps \b clear
          //     of crown/brown/known/thrown, and the closing \b clear of "own goalkeeper".
          //     Byte-identical to spoilers.ts.
          //     "braces?" joins the goal-event reveal family (hat[- ]?tricks?/equali[sz]\w*/
          //     own[- ]?goals?): a "brace" is one player scoring two goals, so a title reveals a
          //     partial result ("Kane brace sinks Poland"), yet has no digits for SCORE_RX.
          //     Whole-word \bbraces?\b is clear of embrace/bracelet/bracket; the "brace for"
          //     idiom is rare in match titles and errs toward over-hiding. Byte-identical to
          //     spoilers.ts.
          //     "shoot[- ]?outs?" catches the penalty-shootout reveal (mirrors shut[- ]?outs?/
          //     blow[- ]?outs?): a shootout only happens once a match is level after regulation/ET,
          //     so the word alone reveals the game went the distance and was settled from the spot
          //     ("edge France in a shootout", "shoot-out drama"), yet has no digits for SCORE_RX.
          //     The \b needs a boundary before "shoot" so it's clear of "troubleshoot"; over-hiding
          //     is the safe side. Byte-identical to spoilers.ts.
          //     "deadlock\w*" joins the level/draw-reveal family (goalless/scoreless/clean[- ]?sheets?):
          //     in a soccer highlight title it reveals result state either way — "goalless deadlock"/
          //     "remain deadlocked" reveals the match is level, "breaks the deadlock"/"deadlock broken"
          //     reveals a goal was scored and one side went ahead — the same partial-result leak as a
          //     clean sheet, with no digits for SCORE_RX. "Break the deadlock" is one of the commonest
          //     phrasings in WC recap titles. No non-result word begins with "deadlock" and the
          //     negotiation/transfer "deadlock" sense never appears in the highlight titles this filter
          //     sees (titles only, never news). Byte-identical to spoilers.ts.
          //     "stalemate\w*" is deadlock's direct synonym and joins the same level/draw-reveal family:
          //     in a soccer highlight title it reveals the match was (or ended) level — "goalless
          //     stalemate", "settle for a stalemate", "tense stalemate at the Bernabeu" — the same
          //     partial-result leak as deadlock, yet a bare "stalemate" (no digits, no "goalless")
          //     slipped past SCORE_RX and every existing keyword. It's a staple of soccer/WC recap
          //     titles. Near-zero false-positive risk: "stalemate" has no meaning outside a drawn/level
          //     state, no in-scope club or nation is named it, and the chess/negotiation sense never
          //     appears in the per-match highlight titles this filter sees. \w* covers the plural
          //     "stalemates". Byte-identical to spoilers.ts.
          //     "\d{1,2}[- ]?nil" / "nil[- ]?(?:\d{1,2}|nil|all)" catch the spelled-out "nil" scoreline
          //     that soccer/WC highlight titles use constantly — "Spain 4 nil", "beat them 3-nil",
          //     "nil-nil at the break", "nil all draw". The digit-based SCORE_RX only fires on a
          //     digit-hyphen-digit run ("4-0"), so a scoreline spelling zero as "nil" (spaced, or
          //     reversed) slipped straight through and revealed the result. Every alternative anchors
          //     "nil" to an adjacent digit / "nil" / "all", so false-positive risk is negligible: bare
          //     "nil" never matches, "Nile" fails the required trailing digit, "nilpotent" fails the
          //     closing \b. Byte-identical to spoilers.ts.
          //     "destroy\w*" is the same-family blowout verb — and the single most common one in the
          //     all-caps fan-channel highlight titles this filter actually sees ("Real Madrid DESTROY
          //     Barcelona", "Spain destroyed Georgia 5-0", "City destroying United") — yet it slipped
          //     past the demolish/dismantle/thrash/thump/trounce/topple set despite outnumbering all
          //     of them on YouTube. In a per-match highlight title "destroy" means nothing but a
          //     lopsided defeat; no in-scope club or nation begins with "destroy", so \w* covers
          //     destroy/destroys/destroyed/destroying/destroyer. Its one benign collision — a
          //     skill-comp "Messi destroys 3 defenders" — errs over-hide-safe like "saw off a
          //     defender" above. Byte-identical to spoilers.ts.
          //     "sinks?"/"sank" catch the "late goal sinks X" defeat-reveal common across every sport
          //     ("Rodri sinks Arsenal", "Late Kane goal sinks Poland", "Buzzer-beater sinks Lakers",
          //     "Walk-off sank the Yankees") — a winner/loser reveal the existing verbs miss. Spelled
          //     out (sink/sinks/sank, not "sink\w*") so it can't swallow the baseball pitch "sinker" or
          //     "sinking feeling"; whole-word forms are boundary-safe, no in-scope club/nation is named
          //     "Sink", and the "kitchen sink" idiom is rare in match titles and errs over-hide-safe.
          //     Byte-identical to spoilers.ts.
          //     "send(?:s|ing)?[- ]?off"/"sent[- ]?off" catch the red-card reveal in its far more common
          //     verb form — the noun "red card" is already blocked, but titles almost always phrase a
          //     dismissal as "sent off"/"sending off" ("Ramos SENT OFF vs Barcelona", "Referee sends off
          //     the keeper") — the same match-event leak as "red card", with no digits for SCORE_RX. The
          //     inflection sits on "send", so "(?:s|ing)?" covers send/sends/sending and the "sent[- ]?off"
          //     branch the past tense; the required trailing "off" keeps bare "send"/"sent" from firing and
          //     the leading \b keeps it clear of "present"/"absent"/"consent"/"resent". The one benign
          //     collision — a farewell "send-off" — never appears in match titles and errs over-hide-safe.
          //     Sibling of "sees?[- ]?off"/"saw[- ]?off" (a different verb sharing only "off"). Byte-
          //     identical to spoilers.ts.
          //     "drub\w*" is the same-family blowout word soccer/cricket recaps lean on for a lopsided
          //     beating ("Spain drub Georgia 5-0", "United drubbed 4-0", "a 6-1 drubbing") — a decisive-
          //     defeat reveal that slipped past the pummel/steamroll/thrash/thump/trounce set despite being
          //     just as common in WC recap titles. Safer than destroy/demolish: "drub" never describes a
          //     single skill moment, only a team result, so it can't over-hide a highlight reel. No English
          //     word or in-scope club/nation begins with "drub", so \w* covers drub/drubs/drubbed/drubbing at
          //     negligible false-positive risk. Byte-identical to spoilers.ts.
          //     "smash\w*" finally adds the blowout verb the "drub" note above already names as a member of
          //     the destroy/demolish/smash family — described but never actually listed, an oversight, since
          //     "smash" is one of the commonest blowout verbs in the all-caps fan-channel highlight titles
          //     this filter sees ("Real Madrid SMASH Barcelona 5-0", "Spain smashed Georgia") and, like
          //     DESTROY, carries no digits for SCORE_RX to catch, so those reveals were leaking. It shares the
          //     single-skill collision the drub note flags ("smashes it home") — but that errs to the same
          //     over-hide-is-safe side the family already accepts for destroy/demolish, and no in-scope club
          //     or nation begins with "smash", so \w* covers smash/smashes/smashed/smashing at negligible
          //     false-positive risk. Byte-identical to spoilers.ts.
          //     "wallop\w*" is the same-family blowout verb British/soccer recaps lean on for a heavy beating
          //     ("Spain wallop Georgia 5-0", "United walloped 4-0", "a 6-0 walloping") — a decisive-defeat
          //     reveal missed by the drub/smash/thrash/thump/pummel/steamroll set despite being just as common
          //     in WC recap titles. Like "drub" it only ever describes a team result, never a single skill
          //     moment, so it can't over-hide a highlight reel. No English word or in-scope club/nation begins
          //     with "wallop" (it can't reach "Walloon"/"Wallonia" — no "p"), so \w* covers wallop/wallops/
          //     walloped/walloping at negligible false-positive risk. Byte-identical to spoilers.ts.
          //     "knock(?:s|ed|ing)[- ]?out" completes the knockout-elimination family (bow…out/crash…out/
          //     oust/eliminat): "knocked out" is the commonest WC/cup phrasing for going out ("Germany knocked
          //     out of the World Cup", "Argentina knocks out Brazil"), with no digits for SCORE_RX. The
          //     inflection is REQUIRED (not "?") precisely so bare "knockout"/"knock-out" — the neutral schedule
          //     term ("knockout stage") — stays visible; only the verb forms (knocked/knocks/knocking out)
          //     match. Byte-identical to spoilers.ts.
          //     "hammer(?:ed|ing)" is the same-family blowout verb ("Man United hammered 5-0", "City's
          //     hammering of Arsenal"), with no digits for SCORE_RX when the score is omitted. The inflection
          //     is REQUIRED (not "\w*") precisely so bare "hammer"/"hammers" — West Ham United's in-scope
          //     nickname ("the Hammers") — stays visible; only the verb-of-defeat forms match. Byte-identical
          //     to spoilers.ts.
          //     "batter(?:ed|ing)" is the same-family blowout verb for a heavy defeat beside
          //     "hammered"/"walloped" ("Spain battered Georgia", "United battered again", "a 5-0
          //     battering"), with no digits for SCORE_RX when the score is omitted. The inflection is
          //     REQUIRED (not "\w*") precisely so bare "batter"/"batters" — the baseball hitter ("the
          //     batter struck out") — stays visible; only the verb-of-defeat forms (and the noun "a
          //     battering") match. The one collision, the target-man cliché "battering ram", is rare
          //     and errs to the over-hide-is-safe side. Byte-identical to spoilers.ts.
          //     "spank\w*" is the same-family blowout verb beside "wallop"/"drub"/"thrash" ("Spain
          //     spank Georgia 5-0", "United spanked 4-0", "a 4-0 spanking"), with no digits for
          //     SCORE_RX when the score is omitted. Like wallop/drub it only ever describes a
          //     team-vs-team beating in a sports title (never a single skill moment), so it can't
          //     over-hide a highlight reel. No English word other than these inflections begins with
          //     "spank" (it diverges from "spark"/"span"/"spandex" before the "k") and no in-scope
          //     club/nation is named it, so \w* covers spank/spanks/spanked/spanking at negligible
          //     false-positive risk. Byte-identical to spoilers.ts.
          //     "clobber\w*" is the same-family blowout verb NBA/NFL and soccer recaps lean on for a
          //     one-sided beating beside "wallop"/"maul"/"spank" ("Warriors clobber Suns", "United
          //     clobbered 5-0", "a 4-0 clobbering") — a decisive-defeat reveal that slipped past the
          //     wallop/maul/spank/drub/smash set, with no digits for SCORE_RX when the score is omitted.
          //     Like "wallop"/"maul" it only ever describes a team-vs-team beating (never a single skill
          //     moment), no English word other than these inflections begins with "clobber", and no
          //     in-scope club/nation is named it, so \w* covers clobber/clobbers/clobbered/clobbering at
          //     negligible false-positive risk. Byte-identical to spoilers.ts.
          //     "dump(?:s|ed|ing)?[- ]?out" completes the knockout-elimination family (bow…out/
          //     crash…out/knock…out): "dumped out" is one of the commonest British WC/cup phrasings
          //     for going out ("Germany dumped out of the World Cup", "Italy dumped out on penalties"),
          //     with no digits for SCORE_RX. Structured like the bow/crash siblings — the inflection
          //     sits on the verb, so "(?:s|ed|ing)?" covers dump/dumps/dumped/dumping while the
          //     required trailing "out" keeps bare "dump" (the empty-a-container sense, absent from
          //     match highlight titles) from firing. No in-scope club/nation is named "Dump", so any
          //     benign collision errs to the over-hide-is-safe side. Byte-identical to spoilers.ts.
          //     "hat[- ]?tricks?" widens the earlier "hat[- ]trick" (mandatory separator, singular
          //     only) to also catch the closed spelling "hattrick" and the plural — both common in
          //     soccer/WC highlight titles ("Mbappé hattrick", "two hat tricks") that leaked past the
          //     old form. The optional "[- ]?" covers "hat trick"/"hat-trick"/"hattrick" and "s?" the
          //     plural, like the sibling "shut[- ]?outs?"/"own[- ]?goals?". A pure widening anchored to
          //     "hat"+"trick", so no new false-positive surface. Byte-identical to spoilers.ts.
          //     "dispatch\w*" is the dismiss-an-opponent result verb tennis and soccer recaps lean on for a
          //     comprehensive win ("Alcaraz dispatches Zverev in straight sets", "City dispatch Brentford
          //     3-0", "Spain dispatched Georgia") — a winner-naming reveal missed by the beat/defeat/edge/
          //     oust/eliminate dismissal set despite being just as common in the article-style news titles
          //     this filter also covers, with no digits for SCORE_RX when the score is omitted. In a
          //     sports-title context "dispatch" only ever means to beat/see off an opponent — its non-result
          //     senses (a news dispatch, a dispatch rider) never appear in a match-recap title — and no
          //     in-scope club/nation begins with "dispatch", so \w* covers dispatch/dispatches/dispatched/
          //     dispatching at negligible false-positive risk. Byte-identical to spoilers.ts.
          //     "shellac\w*" is the same-family blowout verb American NBA/NFL recaps lean on for a one-sided
          //     beating right beside "clobber"/"wallop"/"maul" ("Broncos shellacked 45-10", "Chiefs shellac
          //     the Raiders", "Lakers took a shellacking") — a decisive-defeat reveal missed by the clobber/
          //     wallop/maul/spank/drub/smash set, with no digits for SCORE_RX when the score is omitted. In a
          //     sports title "shellac" only ever means a team-vs-team beating (never a single skill moment,
          //     so it can't over-hide a reel); its varnish sense never appears in a match-recap title and no
          //     in-scope club/nation begins with "shellac", so \w* covers shellac/shellacs/shellacked/
          //     shellacking at negligible false-positive risk. Byte-identical to spoilers.ts.
          // Each side of the scoreline is \d{1,3} so it catches the three-digit
          // basketball form ("Celtics 112-108 Knicks") as well as the low
          // soccer/hockey/NFL form ("2-1", "31-28"); NBA/WNBA scores are almost
          // always 3 digits a side, so the old \d{1,2} cap leaked a bare box-score
          // headline with no result verb. Capped at 3 (not 4+) so 4-digit years
          // still fail; the lookbehind/lookahead keep M-D-Y dates and "2025-26"
          // season spans out. Byte-identical to spoilers.ts.
          const SCORE_RX = /(?<![-\/])\b\d{1,3}\s*[-–]\s*\d{1,3}\b(?![-\/])/;
          //     "book(?:s|ed)? (?:their|its|a) (?:place|spot|berth|ticket|passage)" is the canonical
          //     knockout qualification idiom WC / cup-tie coverage reaches for the instant a side goes
          //     through ("England book their place in the final", "Brazil booked their passage") — a pure
          //     advancement reveal carrying no digits (SCORE_RX misses it) that headlines phrase this way
          //     far more than they say "advance". The trailing place/spot/berth/ticket/passage requirement
          //     keeps the football sense of a bare "booked" (a yellow card) out. Byte-identical to
          //     spoilers.ts.
          //     "punch(?:es|ed)? (?:their|its|a) ticket" is the American sibling of the "book their ticket"
          //     idiom above — the phrase US playoff/tournament coverage reaches for the instant a side
          //     clinches ("Chiefs punch their ticket to the Super Bowl", "Duke punched its ticket to the
          //     Final Four") — a pure advancement reveal carrying no digits (SCORE_RX misses it). The
          //     required "(their|its|a) ticket" object keeps a bare boxing/UFC "punch" out. Byte-identical
          //     to spoilers.ts.
          //     "reach(?:es|ed|ing)? (?:the )?(?:finals?|semi…|quarter…|last 16/8/4)" is the OTHER canonical
          //     knockout-advancement idiom, right beside "book their place" / "advanc\w*" ("Spain reach the
          //     final", "Brazil reached the semis", "France reach the quarters", "Croatia reach the last 8")
          //     — a pure advancement reveal carrying no digits (SCORE_RX misses it) that headlines phrase
          //     with "reach" far more than "advance". The required trailing round noun keeps "within reach"/
          //     "reach for the top corner"/"reach save"/bare "reach the ball" out, and "(?!\s+third)" excludes
          //     the tactical "reach the final third" (its only benign collision, itself over-hide-safe).
          //     Byte-identical to spoilers.ts.
          //     "through to (?:the )?(?:finals?|semi…|quarter…|last 16/8/4)" is the THIRD canonical
          //     knockout-advancement idiom, right beside "reach …"/"book their place"/"advanc\w*" — the
          //     British match-report phrasing ("England through to the final", "Spain through to the
          //     quarterfinals", "USA through to the last 16") that names the winning side yet carries no
          //     digits (SCORE_RX misses it) and uses neither "reach" nor "book" nor "advance". The
          //     round-noun list mirrors the "reach" alternative verbatim, so the required trailing round
          //     keeps "battled through to the whistle"/"broke through the line" out, and the same
          //     "(?!\s+third)" guard excludes "through to the final third". Byte-identical to spoilers.ts.
          //     "into (?:the )?(?:finals?|semi…|quarter…|last 16/8/4)" is the knockout-advancement idiom the
          //     "reach"/"through to"/"progress"/"book their place" siblings all miss: the bare, VERBLESS "X
          //     into the Y" headline all-caps fan-channel/broadcaster titles lean on the instant a side goes
          //     through ("Spain into the final", "ARGENTINA INTO THE SEMIS", "England into the quarters", "USA
          //     into the last 16"). Each sibling requires a head verb, so a title that just says "…into the
          //     final" slipped past every one, yet it names the winning side just as plainly and carries no
          //     digits (SCORE_RX misses it). The round-noun list mirrors the alternatives verbatim, so the
          //     required trailing round keeps the verbless "into the box"/"into the season"/"into the wild"
          //     out, and the same "(?!\s+third)" guard excludes the tactical "into the final third". Timely as
          //     the tournament hits its win-or-go-home rounds. Byte-identical to spoilers.ts.
          //     "crowned (?:world )?champions?" and "(?:lift|hoist)(?:s|ed|ing)? (?:the )?(?:world[- ]?cup|
          //     trophy)" are the two canonical FINAL-result coronation reveals the advancement idioms above
          //     don't cover ("Argentina crowned world champions", "Messi lifts the trophy", "Spain hoist the
          //     World Cup") — each names the champion yet carries no digits (SCORE_RX misses it) and states
          //     none of "win\w*"/"triumph\w*"/"clinch\w*". Object-anchored so they stay off the bare
          //     "champion(s)" this filter leaves alone: "crowned" must precede "champions" (never "Champions
          //     League"), and the trophy-raise needs a following "World Cup"/"trophy" (so "World Cup 2026
          //     highlights"/"trophy tour"/"lift spirits" stay unblurred). Timely as the tournament reaches
          //     the final. Byte-identical to spoilers.ts.
          //     "world[- ]?champions?" catches the BARE copula coronation reveal its sibling "crowned (?:world )?
          //     champions?" above misses — the verbless "X (are) world champions" headline all-caps fan-channel
          //     and celebration recap titles lean on the instant a final ends ("ARGENTINA ARE WORLD CHAMPIONS",
          //     "Spain World Champions 2026", "France become world champions"). The crowned/lift/hoist idioms each
          //     require a head word, so a title that just states "world champions" with no verb slipped past every
          //     one, yet names the tournament winner just as plainly and carries no digits (SCORE_RX misses it). It
          //     stays OFF the bare "champion(s)" this filter leaves alone (see the head note) precisely because it
          //     is anchored to the mandatory leading "world": "Champions League"/"Premier League champions"/
          //     "reigning champions" contain no "world" before "champions", so none can ever fire — only the
          //     world-title sense does. The "[- ]?" covers "world champions"/"world-champions"/"worldchampions" and
          //     the "s?" the singular. Its one benign collision — a spoiler-free "who will be world champions?"
          //     preview — errs to the over-hide-is-safe side, and is especially worth catching as the World Cup
          //     reaches its final. Byte-identical to spoilers.ts.
          //     "share(?:s|d)? the spoils"/"honou?rs even" catch the two canonical DRAW-result idioms English
          //     soccer/World Cup recap titles reach for when a match ends level — "Spain and Georgia share the
          //     spoils", "the two sides shared the spoils", "honours even in a tense affair" — the same
          //     level/draw reveal as the "goalless"/"scoreless"/"stalemate\w*"/"deadlock\w*" family, yet a
          //     bare idiom (no digits, no "goalless") slipped past both SCORE_RX and every existing keyword.
          //     Near-zero false-positive risk: both are fixed multi-word idioms that only ever describe a
          //     drawn result — "share(?:s|d)? the spoils" is anchored to the literal "the spoils" object (a
          //     lone "share"/"shares"/"shared" never fires) and "honou?rs even" needs the trailing "even"
          //     (the "honou?r" covers British "honours"/American "honors"), so neither collides with an
          //     in-scope club/nation name or an ordinary title word. Byte-identical to spoilers.ts.
          //     "held to an? (?:[\w-]+ )?draw" catches the "held to a draw" idiom — the most common way an
          //     English soccer/World Cup recap title frames a favourite dropping points ("Argentina held to
          //     a draw", "Brazil held to a late draw"). Same level/draw reveal as goalless/scoreless/
          //     stalemate, but the BARE form carries no digits (SCORE_RX misses it) and slipped past every
          //     keyword: "held" alone only appears as "held[- ]?off"/"holds?[- ]?off" (a WIN), and "draw"
          //     is not a keyword. The optional single "[\w-]+" word lets one adjective sit before "draw"
          //     while the pattern stays anchored to "draw" as the object, so "held off Barcelona", "the
          //     draw for the quarters", and "held to account" stay out. Byte-identical to spoilers.ts.
          //     "all[- ]?square" joins the level/draw-reveal family (goalless/scoreless/stalemate\w*/
          //     deadlock\w*/"held to a ... draw"/"share the spoils"/"honours even"): "all square" is the
          //     stock British soccer/golf idiom for a level score, so a title carrying it reveals the match
          //     is (or ended) level ("Spain and Georgia all square at the break", "the sides finish all
          //     square"), yet a bare idiom carries no digits (SCORE_RX misses it) and slipped past every
          //     keyword. Near-zero false-positive risk: "all square" only ever means a level result in a
          //     sports title (golf match-play "all square" is itself a tied-result reveal, still over-hide-
          //     safe), and the leading \b keeps it clear of any word ending in "all" ("small square",
          //     "install square" — the "all" sits mid-word with no boundary). "[- ]?" covers "all square"/
          //     "all-square". Byte-identical to spoilers.ts.
          //     "(?:runs?|running|ran) riot" is the blowout idiom soccer/WC recaps lean on for a side scoring
          //     freely in a one-sided win ("Man City run riot", "Spain run riot in a 6-0 rout", "Mbappé runs
          //     riot", "United ran riot") — a decisive-result reveal that names the dominant side yet carries no
          //     digits when the score is omitted (SCORE_RX misses "City run riot again") and slipped past the
          //     whole blowout family (thrash/thump/hammer/wallop/…): none of those verbs is "run", and bare
          //     "run" is too common to be a keyword alone. That is why it is anchored to the "riot" object —
          //     only the two-word "run riot" phrase matches, so bare "run"/"running"/"ran" never fires. "riot"
          //     only ever completes this dominate-the-game idiom in a sports title (the crowd-trouble "fans run
          //     riot" is a news headline, and this filter runs only on highlight/recap titles), and no in-scope
          //     club/nation is named "Riot", so any residual over-hide errs to the over-hide-is-safe side.
          //     Byte-identical to spoilers.ts.
          //     "sees?[- ]?red"/"saw[- ]?red" catch the red-card reveal in its other stock verb phrasing,
          //     beside the "red card" noun and the "send(?:s|ing)?[- ]?off"/"sent[- ]?off" form: "see red"/
          //     "sees red"/"saw red" is how highlight titles narrate a dismissal at least as often ("Ramos
          //     SEES RED", "Vinícius saw red late on") — the same match-event leak as "red card", with no
          //     digits for SCORE_RX. Structured like the sibling "sees?[- ]?off"/"saw[- ]?off": "sees?"
          //     covers see/sees, "saw[- ]?red" the past tense, and the required trailing "red" keeps bare
          //     "see"/"saw"/"sees" from firing ("must-see", "saw the ball"). The leading \b keeps it clear
          //     of "oversees red…" and the closing \b anchors whole-word "red". Its one benign collision —
          //     the anger idiom "see red" — never appears in the per-match highlight titles this filter
          //     runs on, and errs over-hide-safe. Byte-identical to spoilers.ts.
          //     "pip(?:s|ped|ping)?" sits beside "edge\w*" in the narrow-win family: "pip"/"pipped" is the
          //     stock idiom for edging a rival by a hair — a match ("Canada pip USA"), a table finish
          //     ("Spain pip Germany to top spot"), or a title race ("pipped to the title"/"pipped at the
          //     post"). Names the side that came out ahead yet carries no digits for SCORE_RX, and "edge\w*"
          //     was the only synonym present. Enumerated (NOT "pip\w*", which would swallow "pipe"/
          //     "pipeline"): "pip(?:s|ped|ping)?" + the trailing \b keeps whole words like "pipe"/"Pippa"/
          //     "pippin" out, and no benign sense survives in per-clip highlight titles. Byte-identical to
          //     spoilers.ts.
          //     "share(?:s|d)? the points"/"a point (?:apiece|each)" join "share the spoils" in the draw
          //     family: splitting the points is the stock idiom for a level result ("share the points",
          //     "shared the points", "a point apiece", "a point each"), carrying no digits for SCORE_RX.
          //     Anchored to "the points"; the singular "a point" before apiece/each keeps basketball
          //     box-score plurals ("30 points apiece", "25 points each") out. Byte-identical to spoilers.ts.
          //     "fight(?:s|ing)?[- ]?back"/"fought[- ]?back" complete the comeback-reveal family beside
          //     "comeback"/"come[- ]from[- ]behind"/"(?:storm|roar|claw)…back"/"battl…back" — "fight back"
          //     is the commonest way a recap title frames a rally, yet was the one member still missing
          //     ("Spain fight back to level", "United fought back from two down", "Chelsea fighting back",
          //     "Arsenal's fightback falls short"). Same score-state leak "comeback" hides (a side was
          //     behind and rallied), no digits for SCORE_RX. Like "battl…back" the inflection sits on the
          //     verb: "(?:s|ing)?" covers fight/fights/fighting, "fought[- ]?back" the irregular past. The
          //     mandatory trailing "back" pins it to the comeback sense (bare "title fight"/"fight for the
          //     ball" never fires) and the leading \b keeps "infighting"/"firefight" out; "[- ]?" covers
          //     "fight back"/"fight-back"/"fightback". The one benign idiom "fight back tears" errs
          //     over-hide-safe. Byte-identical to spoilers.ts.
          //     "salvag\w*" catches the rescue-a-result reveal soccer/hockey recaps lean on constantly
          //     ("Spurs salvage a late point", "United salvage a draw", "Barca salvage pride with a
          //     consolation", "City salvaged a draw at the Etihad") — each names the outcome (a rescued
          //     draw/point, or a consolation in a loss) just as plainly as the "share the spoils"/"held to
          //     a draw" family beside it, yet the bare word carries no digits (SCORE_RX misses it) and
          //     slipped past the whole draw set. In a per-match highlight/recap title "salvage" means
          //     nothing but rescuing a lesser result — no in-scope club or nation is named anything
          //     beginning with "salvag", and the literal wreck/salvage sense never appears in a match
          //     title. The stem drops the trailing "e" (salvag, not salvage) so the -ing form matches too,
          //     exactly like the "toppl\w*"/"trounc\w*" siblings, so the trailing \w* covers salvage/
          //     salvages/salvaged/salvaging at negligible false-positive risk. Byte-identical to spoilers.ts.
          //     "blank(?:s|ed|ing)" catches the shutout VERB — the sibling of the nil-reveal family
          //     (shut[- ]?outs?/goalless/scoreless/clean[- ]?sheets?): to "blank" a side is to keep it
          //     scoreless ("deGrom blanks Marlins", "Bruins blanked Canadiens", "City blanking United"),
          //     with no digits for SCORE_RX. The inflection is REQUIRED — "(?:s|ed|ing)", not bare "blank"
          //     or "blank\w*" — so the bare noun/adjective senses ("point-blank", "draws a blank", "blank
          //     stare"/"blank check"/"fill in the blank") never fire, while blanks/blanked/blanking only
          //     ever name the shutout in a per-match highlight title. No in-scope club or nation matches it;
          //     any residual over-hide errs over-hide-safe. Byte-identical to spoilers.ts.
          //     "consolat\w*" catches the consolation-goal reveal soccer/hockey recaps lean on constantly
          //     ("Georgia grab a late consolation", "Barca's consolation strike") — a side only ever scores a
          //     "consolation" when it is LOSING, so the word reveals a goal AND the result direction (the
          //     scoring side is behind), with no digits for SCORE_RX. Sits beside "salvag\w*" in the
          //     lesser-result family (that note even cites "salvage pride with a consolation"). The anchor is
          //     the stem "consolat", NOT bare "consol" — so the comfort verb console/consoling and
          //     "consolidate\w*"/"consolidation" (both diverge right after "consol", an "e"/"i" where
          //     "consolat" needs "a") never fire; only consolation/consolations/consolatory match (the
          //     adjective form the old "consolation\w*" anchor missed), each naming a losing side's late goal
          //     in the titles this filter sees. No in-scope club or nation is named it; the rare neutral
          //     "consolation final/bracket"
          //     never appears here and would err over-hide-safe. Byte-identical to spoilers.ts.
          //     "rescu\w*" is the direct synonym of "salvag\w*" in the same lesser-result family — the salvage
          //     note literally calls what it catches "the rescue-a-result reveal", yet "rescue" itself was never
          //     a keyword. Football recap titles use it constantly ("United rescue a point", "Spurs rescue a
          //     draw", "late goal rescues a point"), each naming the same salvaged draw/point, with no digits for
          //     SCORE_RX and no keyword catching it. A keeper's stop is a "save", never a "rescue", and no
          //     in-scope club or nation begins with "rescu", so the trailing \w* covers rescue/rescues/rescued/
          //     rescuing/rescuer at the same negligible false-positive risk as salvag\w*; any residual over-hide
          //     (a metaphorical "rescue mission" preview) errs over-hide-safe. Byte-identical to spoilers.ts.
          //     "rall(?:y|ies|ied|ying) (?:past|back|from)" sits beside the comeback cluster: "rally past" is the
          //     commonest come-from-behind winner-reveal in US recap titles ("Warriors rally past Lakers"), with
          //     "rally back"/"rally from behind" its siblings — each names a side that erased a deficit to win, all
          //     digit-less (SCORE_RX misses them). The MANDATORY trailing direction (past|back|from) leaves the
          //     tennis NOUN "rally" ("rally at the net"/"longest rally of…"/"30-shot rally", none followed by
          //     past/back/from) and the gather-support sense ("rally the crowd"/"fans rally to support", followed
          //     by the/to) untouched. Covers rally/rallies/rallied/rallying; the rare "rally from injury" errs
          //     over-hide-safe. Byte-identical to spoilers.ts.
          //     "TKO"/"submission\w*"/"submit(?:s|ted|ting)" catch the two canonical COMBAT-SPORTS method-of-
          //     victory reveals — the UFC/MMA analogue of soccer's "red card" or hockey's "shutout" — that this
          //     globally-applied filter (it gates the UFC/ESPN fight highlights the app pulls, exactly like every
          //     other sport, see the SCORE_RX/SPOILER_RX title test below) otherwise leaked: "Makhachev SUBMITS
          //     Oliveira", "wins via submission", "Pereira TKO Hill" each name the winner AND the finish, yet
          //     carry no digits (SCORE_RX misses them) and none of the win\w*/beat\w*/knock…out set. "TKO"
          //     (technical knockout) is combat-only — no in-scope league, club, fighter or benign sports-title
          //     word is spelled "TKO", so the outer \b(…)\b bounds it with zero cross-sport collisions.
          //     "submission\w*" matches only submission/submissions (it can't reach "submissive", which diverges
          //     after "submissi"), and "submit(?:s|ted|ting)" the verb forms (the bare imperative "submit"
          //     excluded) — both name a bout's finish in a per-fight title; the rare compilation ("Top 10
          //     Submissions") errs over-hide-safe. "tap(?:s|ped|ping)?[- ]?out" is that same submission finish
          //     told from the LOSER's side ("Oliveira taps out", "forced to tap-out", "tapout finish") — the
          //     phrase every grappling/MMA recap leans on, digit-less and outside the submit/beat set, with no
          //     benign fight-title meaning; the \b(…)\b keeps it clear of "untapped"/"tap into". Byte-identical
          //     to spoilers.ts.
          //     "decimat\w*" is the same total-destruction blowout word the all-caps fan-channel highlight
          //     titles lean on beside DESTROY/OBLITERATE/ANNIHILATE ("Real Madrid DECIMATE Barcelona",
          //     "Spain decimated Georgia 5-0") — a lopsided-defeat reveal that slipped past the demolish/
          //     destroy/obliterate/annihilate/pulverise/thrash set despite naming the routed side just as
          //     plainly, digit-less (SCORE_RX misses it). The pedantic "kill one in ten" sense never appears
          //     in a per-match highlight title and no in-scope club or nation begins with "decimat", so the
          //     trailing \w* covers decimate/decimates/decimated/decimating/decimation at negligible
          //     false-positive risk. Byte-identical to spoilers.ts.
          //     "knock(?:s|ed|ing)? off" catches the defeat/UPSET idiom US recap titles lean on constantly —
          //     distinct from the already-covered "knock(?:s|ed|ing)[- ]?out" (elimination): "Warriors knock
          //     off Lakers", "Duke knocks off UNC", "15-seed knocks off 2-seed" each name the beaten side
          //     (usually flagging an upset), digit-less (SCORE_RX misses them) and matching none of the
          //     beat/defeat/upset set. The separator is a MANDATORY single space (" off", NOT "[- ]?off"):
          //     that keeps the counterfeit-product homograph "knockoff"/"knock-off" OUT (no space, never
          //     fires), excludes "knock it off" ("knock" is followed by " it"), and leaves bare "knockout"/
          //     "knockout stage" untouched. The rare benign "knock off the rust" errs over-hide-safe.
          //     Byte-identical to spoilers.ts.
          //     "relegat\w*" catches the definitive season-outcome reveal for the promotion/relegation
          //     leagues the app covers (EPL/UCL/UEL et al.) — the flip side of the "surviv\w*" survival
          //     framing beside it: "Leeds relegated to the Championship", "Sheffield United relegation
          //     confirmed" each name the team AND its fate (dropped a division), digit-less (SCORE_RX
          //     misses them) and matching none of the beat/defeat/lose set. In a per-match highlight or
          //     news title "relegated"/"relegation" essentially always means the drop; the only benign
          //     sense ("relegated to the bench") is itself result-adjacent and rare, so the trailing \w*
          //     covers relegate/relegated/relegating/relegation at negligible false-positive risk. The
          //     mirror term "promot\w*" is deliberately NOT added — "promotional video"/"promoted
          //     content"/"coach promoted" are common benign titles that would over-hide. Byte-identical
          //     to spoilers.ts.
          //     "(?:unanimous|split|majority)[- ]?decision" completes the combat-sports method-of-victory
          //     family alongside "TKO"/"submission\w*"/"submit"/"tap…out": when a UFC/boxing bout goes the
          //     distance the result is a scorecard decision, and the winner is named right beside it
          //     ("Canelo wins by unanimous decision", "Jones def. Gustafsson via split decision", "majority
          //     decision for Usman") — a distinct result reveal the finish-only combat terms miss (a decision
          //     is precisely NOT a KO/submission), often phrased with the abbreviation "def." that "defeat\w*"
          //     never matches, and carrying no digits for SCORE_RX. It is anchored to the mandatory scorecard
          //     adjective (unanimous/split/majority), which keeps it clean: bare "decision" never fires, so
          //     the common benign "VAR decision"/"referee's decision"/"controversial decision" all pass
          //     through untouched — those three adjectives only ever precede "decision" as a judges' verdict
          //     in the per-match highlight titles this filter sees. The "[- ]?" covers "unanimous decision"/
          //     "unanimous-decision". Byte-identical to spoilers.ts.
          //     "whitewash\w*" catches the clean-sweep / comprehensive-defeat framing tennis, cricket and
          //     aggregate-tie recaps lean on ("Argentina whitewash Brazil", "India whitewashed 3-0",
          //     "a series whitewash") — a result that names the side that lost every game/set, yet its
          //     bare-verb present tense ("X whitewash Y") slipped past the sibling "sweep\w*|swept" entry
          //     beside it and carries no digits when phrased without a scoreline. In a sports-title context
          //     "whitewash" means nothing but a one-sided sweep (the literal paint/cover-up sense never
          //     appears in a highlight or headline feed, and no in-scope team is named anything beginning
          //     with it), so the trailing \w* covers whitewash/whitewashes/whitewashed/whitewashing at the
          //     same negligible false-positive risk as the sweep/rout family. Byte-identical to spoilers.ts.
          const SPOILER_RX = /\b(walk[- ]?off|buzzer[- ]?beaters?|comeback|come[- ]from[- ]behind|(?:storm|roar|claw)(?:s|ed|ing)?[- ]?back|battl(?:e|es|ed|ing)[- ]?back|fight(?:s|ing)?[- ]?back|fought[- ]?back|rall(?:y|ies|ied|ying) (?:past|back|from)|extra[- ]?innings?|overtime|extra[- ]?time|sudden[- ]?death|stun|stuns|stunned|stunning|stunner|shock|shocks|shocked|shocking|crush\w*|outlast\w*|outclass\w*|outplay\w*|overpower\w*|overwhelm\w*|outgun\w*|outduel\w*|outscor\w*|prevail\w*|surviv\w*|relegat\w*|overcome|overcomes|overcoming|overcame|dominat\w*|defeat\w*|beat\w*|edge\w*|pip(?:s|ped|ping)?|dispatch\w*|sinks?|sank|holds?[- ]?off|held[- ]?off|hold(?:s|ing)?[- ]?on|held[- ]?on|hang(?:s|ing)?[- ]?on|hung[- ]?on|sees?[- ]?off|saw[- ]?off|fends?[- ]?off|fended[- ]?off|rout|routs|routed|top(?:s|ped)|toppl\w*|trounc\w*|demolish\w*|destroy\w*|dismantl\w*|humiliat\w*|embarrass\w*|capitulat\w*|collaps\w*|obliterat\w*|annihilat\w*|decimat\w*|vanquish\w*|pulveri[sz]\w*|thrash\w*|thump\w*|pummel\w*|steamroll\w*|drub\w*|smash\w*|wallop\w*|spank\w*|maul\w*|clobber\w*|shellac\w*|brush(?:es|ed|ing)?[- ]?aside|(?:runs?|running|ran) riot|to the sword|hammer(?:ed|ing)|batter(?:ed|ing)|cruise(?:s|d)?|canter(?:s|ed|ing)?|(?:eas(?:e|es|ed)|power(?:s|ed)?|breez(?:e|es|ed)|coast(?:s|ed)?|stroll(?:s|ed)?|waltz(?:es|ed)?|roll(?:s|ed)?)[- ]?past|(?:sneak(?:s|ed)?|snuck|slip(?:s|ped)?|squeez(?:e|es|ed))[- ]?past|triumph\w*|romp\w*|conquer\w*|dethron\w*|upset\w*|clinch\w*|seals?|sealed|snatch\w*|sweep\w*|swept|whitewash\w*|oust\w*|eliminat\w*|bow(?:s|ed|ing)?[- ]?out|crash(?:es|ed|ing)?[- ]?out|dump(?:s|ed|ing)?[- ]?out|knock(?:s|ed|ing)[- ]?out|knock(?:s|ed|ing)? off|sent[- ]?packing|qualif(?:y|ies|ied)|advanc\w*|book(?:s|ed)? (?:their|its|a) (?:place|spot|berth|ticket|passage)|punch(?:es|ed)? (?:their|its|a) ticket|reach(?:es|ed|ing)? (?:the )?(?:finals?|semi[- ]?finals?|semis?|quarter[- ]?finals?|quarters?|last[- ]?(?:16|8|4))(?!\s+third)|through to (?:the )?(?:finals?|semi[- ]?finals?|semis?|quarter[- ]?finals?|quarters?|last[- ]?(?:16|8|4))(?!\s+third)|into (?:the )?(?:finals?|semi[- ]?finals?|semis?|quarter[- ]?finals?|quarters?|last[- ]?(?:16|8|4))(?!\s+third)|progress(?:es|ed|ing)? (?:to |into |through to )?(?:the )?(?:finals?|semi[- ]?finals?|semis?|quarter[- ]?finals?|quarters?|last[- ]?(?:16|8|4))(?!\s+third)|crowned (?:world )?champions?|world[- ]?(?:cup[- ]?)?champions?|(?:lift|hoist)(?:s|ed|ing)? (?:the )?(?:world[- ]?cup|trophy)|leads?|leaders?|winning|winners?|wins|won|win|victory|victories|victorious|(?:comes?|came)[- ]?out on top|losing|lose|loses|lost|loss|hat[- ]?tricks?|braces?|no[- ]?hitter|empty[- ]?net(?:s|ter|ters)?|shut[- ]?outs?|blow[- ]?outs?|shoot[- ]?outs?|goalless|scoreless|blank(?:s|ed|ing)|\d{1,2}[- ]?nil|nil[- ]?(?:\d{1,2}|nil|all)|clean[- ]?sheets?|deadlock\w*|stalemate\w*|salvag\w*|rescu\w*|consolat\w*|share(?:s|d)? the spoils|share(?:s|d)? the points|a point (?:apiece|each)|honou?rs even|held to an? (?:[\w-]+ )?draw|settl(?:e|es|ed|ing) for (?:a|an|the) (?:draw|point|stalemate)|all[- ]?square|equali[sz]\w*|level(?:l)?ers?|go[- ]?ahead (?:goal|run|homer|home[- ]?run|score|basket|bucket|touchdown|header|strike)s?|own[- ]?goals?|grand slam|send(?:s|ing)?[- ]?off|sent[- ]?off|sees?[- ]?red|saw[- ]?red|red card|all three points|TKO|submission\w*|submit(?:s|ted|ting)|tap(?:s|ped|ping)?[- ]?out|(?:unanimous|split|majority)[- ]?decision)\b/i;
          // Official WC highlight titles sometimes include the final score
          // ("Argentina 3-2 Egypt") or neutral advancement language in the title.
          // The app never displays YouTube titles in the card, and the modal masks
          // the title chrome, so allow these only for official WC uploaders.
          const isOfficialWorldCupUpload = isWorldCupQuery && WC_OFFICIAL_CHANNELS.includes(channel.toLowerCase());
          if (!isOfficialWorldCupUpload && (SCORE_RX.test(title) || SPOILER_RX.test(title))) continue;

          // Simulation/videogame hard-skip — NBA 2K, MLB The Show, FIFA,
          // Madden, NHL 2K sim channels autopost "highlights" of games
          // that haven't been played yet, with titles that match the
          // real-game query format ("THUNDER vs SPURS FULL GAME 3
          // HIGHLIGHTS MAY 23, 2026 ... | NBA 2K26 GAMEPLAY"). Without
          // this filter, those sim uploads win the non-channel fallback
          // tier whenever the official league channel hasn't posted the
          // real recap yet (common for games that just ended).
          const SIM_RX = /\b(2k\d{2}|nba\s*2k|nhl\s*2k|mlb\s*the\s*show|fifa\s*\d{2}|madden\s*\d{2}|gameplay|simulation|simulated)\b/i;
          if (SIM_RX.test(title)) continue;

          // Reaction/watch-along hard-skip — fan channels reupload a recap's
          // thumbnail under "TEAM vs TEAM Highlights M/D/YY (REACTION)" with
          // teams+date that match the query, so they win the unscoped best-
          // match tier when the real recap is excluded (the 2nd highlight
          // button). They're never what the user wants and the title emotion
          // ("I'M DISGUSTED!") routinely spoils the result.
          const REACTION_RX = /\b(reaction|react|watch[- ]?along|watchalong|watch party)\b/i;
          if (REACTION_RX.test(title)) continue;

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

          // MLB single-play clip demote — the official "MLB" channel
          // posts lots of one-play shorts ("Tsung-Che Cheng collects
          // his first MLB hit! | MLB Highlights (Red Sox vs. Yankees)")
          // that carry both team names and so win the channelTeams tier,
          // beating the channel's actual full-game recap. Demote any
          // from-MLB-channel highlight that ISN'T a real game recap
          // (no "game/full/condensed/recap" phrase and no matching date
          // token) below the extended tier so the full-game recap wins
          // the MLB channel button. Gated to the MLB channel so no other
          // league's ranking changes. (Declared here, after the date vars
          // it reads are initialized.)
          const looksLikeFullRecap =
            /\b(game highlights|full game|condensed|recap|full match)\b/i.test(titleLower);
          const isMlbChannelClip =
            preferChannelLower === "mlb" &&
            !isExtended &&
            !looksLikeFullRecap &&
            !(titleHasExplicitDate && titleDateMatches);

          // Track channel-specific matches
          if (isFromChannel) {
            if (hasTeams && hasYear && (!queryGameNum || hasGameNum)) {
              if (!isExtended && !isMlbChannelClip && !channelBestId) channelBestId = videoId;
              if (isExtended && !channelBestExtendedId) channelBestExtendedId = videoId;
            }
            if (hasTeams && hasYear) {
              if (!isExtended && !isMlbChannelClip && !channelTeamsYearId) channelTeamsYearId = videoId;
              if (isExtended && !channelTeamsYearExtendedId) channelTeamsYearExtendedId = videoId;
            }
            if (hasTeams) {
              if (!isExtended && !isMlbChannelClip && !channelTeamsId) channelTeamsId = videoId;
              if (isExtended && !channelTeamsExtendedId) channelTeamsExtendedId = videoId;
            }
            // Single-play MLB clip — sits below the extended tier so the
            // channel's full-game recap wins, but still serves as a last
            // resort if the channel has nothing but clips.
            if (isMlbChannelClip && !channelPlayerReelId) channelPlayerReelId = videoId;
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
          // Channel-filtered priority (highest → lowest). When the
          // caller specifies a channel, we never fall through to
          // non-channel matches — the client already has a separate
          // "anywhere" button for that, and falling through here means
          // the labeled "▶ NBA" button serves a Prime Video Philippines
          // upload (or NHL on ESPN, etc.) when the real NBA channel
          // hasn't posted yet. SIM_RX upstream catches 2K-style fakes
          // but not streaming-service uploaders with legitimate-looking
          // titles. Returning null instead lets the client drop to the
          // external YouTube search URL, which is the right escape
          // hatch for "official channel doesn't have it yet."
          videoId = preferExtended ? (
            // Extended, then standard fallback within the requested channel.
            channelBestExtendedId ||
            channelTeamsYearExtendedId ||
            channelTeamsExtendedId ||
            channelBestId ||
            channelGolfRecapYearId ||
            channelGolfRecapId ||
            channelTeamsYearId ||
            channelGolfRoundYearId ||
            channelGolfRoundId ||
            channelTeamsId ||
            // Weakest: player reels and any-from-channel
            channelPlayerReelId ||
            (isGolfQuery && !channelImpliesGolfTournament ? null : (queryHasSpecificTeams ? null : channelAnyExtendedId)) ||
            (isGolfQuery && !channelImpliesGolfTournament ? null : (queryHasSpecificTeams ? null : channelAnyId)) ||
            null
          ) : (
            // Standard, then extended fallback within the requested channel.
            channelBestId ||
            channelGolfRecapYearId ||
            channelGolfRecapId ||
            channelTeamsYearId ||
            channelGolfRoundYearId ||
            channelGolfRoundId ||
            channelTeamsId ||
            channelBestExtendedId ||
            channelTeamsYearExtendedId ||
            channelTeamsExtendedId ||
            // Weakest: player reels and any-from-channel
            channelPlayerReelId ||
            (isGolfQuery && !channelImpliesGolfTournament ? null : (queryHasSpecificTeams ? null : channelAnyId)) ||
            (isGolfQuery && !channelImpliesGolfTournament ? null : (queryHasSpecificTeams ? null : channelAnyExtendedId)) ||
            null
          );
        } else {
          // General (non-channel) search: standard everywhere first,
          // then extended, then weakest fallbacks. firstHighlightId
          // is the fallback for non-golf only.
          // When prefer=extended, the SAME tiers run but the extended cut of each
          // tier is checked before its standard sibling — so the longer "Extended
          // Highlights" wins if it exists, else it falls straight back to the
          // standard ordering (never returns fewer results than the default).
          videoId = preferExtended ? (
            bestMatchExtendedId ||
            teamsGameExtendedId ||
            teamsExtendedId ||
            yearMatchedExtendedId ||
            bestMatchId ||
            teamsGameMatchedId ||
            golfRecapYearId ||
            golfRecapId ||
            golfRoundYearId ||
            golfRoundId ||
            teamsMatchedId ||
            yearMatchedId ||
            playerReelId ||
            (isGolfQuery || queryHasSpecificTeams ? null : firstHighlightExtendedId) ||
            (isGolfQuery || queryHasSpecificTeams ? null : firstHighlightId)
          ) : (
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
            (isGolfQuery || queryHasSpecificTeams ? null : firstHighlightExtendedId)
          );
        }
        if (!videoId && !isGolfQuery && !queryHasSpecificTeams) {
          // Raw-regex fallback — only for non-golf. For golf we'd
          // rather return 404 than guess wrong and let a random
          // PGA TOUR highlight win the Masters slot.
          const allMatches = [...html.matchAll(/"videoId":"([a-zA-Z0-9_-]{11})"/g)];
          const firstAllowed = allMatches.find((m) => !excludeSet.has(m[1]));
          videoId = firstAllowed ? firstAllowed[1] : null;
        }
        // Channel-identity gate. Telemundo has always been verified this way;
        // `strict=1` extends the same check to any requested channel (tennis
        // Slams, golf majors) so a reupload whose title looks official can't
        // slip through the soft-match fallback tiers. Ground truth = oembed
        // author_name. On any failure/mismatch, drop to a clean 404.
        //
        // Fast path: if the video was picked from a tier that already parsed its
        // ownerText as the requested channel, we know it's official — skip the
        // oembed round-trip. Only pay it when the id came from a non-channel
        // fallback tier (or the raw/rescue paths, where it's not in `videos`) —
        // i.e. exactly the junk-risk case. Telemundo keeps its always-verify
        // behavior since its search ownerText parse proved unreliable.
        if (videoId && preferChannelLower && (strictChannelParam || preferChannelLower === "telemundo deportes")) {
          const parsed = videos.find((v) => v.videoId === videoId);
          const parsedChannelMatches = !!parsed && parsed.channel.toLowerCase() === preferChannelLower;
          const needsOembedVerify = preferChannelLower === "telemundo deportes" || !parsedChannelMatches;
          if (needsOembedVerify) {
            try {
              const oembedRes = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}&format=json`);
              const oembed = oembedRes.ok ? await oembedRes.json() : null;
              if (String(oembed?.author_name ?? "").toLowerCase() !== preferChannelLower) {
                videoId = null;
              }
            } catch {
              videoId = null;
            }
          }
        }

        // World Cup channel-scoped rescue. The unscoped search above ranks by
        // YouTube relevance, and for lopsided / marquee games (e.g. a 7-1
        // blowout, or a debut nation) the official FOX recap gets buried below
        // page 1 by reupload spam ("7-1 ALL GOALS"), FOX's own short moment
        // clips (anthem, single goals), and multi-hour livestream VODs. The
        // official-only WC gate then drops everything and we 404 even though
        // the recap exists. As a last resort, search WITHIN FOX Sports' own
        // channel — no other uploader competes there, so the recap always
        // surfaces. Take the standard cut by default, but honor
        // `prefer=extended` for the World Cup 2nd button so it can serve the
        // longer companion video instead of colliding with the primary recap.
        // FIFA/World-Cup queries with two named teams only; inert elsewhere.
        if (!videoId && isWorldCupQuery && queryHasSpecificTeams && teamsMatch) {
          try {
            const wcChannelSearchPaths = {
              "fox sports": "@FOXSports",
              "fox soccer": "@FOXSports",
              "fifa": "@fifa",
              "telemundo deportes": "channel/UCjZ7QPKb89R-4SxzBoceyOg",
            };
            const rescueChannelPath = preferChannelLower
              ? wcChannelSearchPaths[preferChannelLower]
              : wcChannelSearchPaths["fox sports"];
            const rescueAllowedChannels = preferChannelLower
              ? [preferChannelLower]
              : WC_OFFICIAL_CHANNELS;
            if (!rescueChannelPath) throw new Error("Unsupported World Cup rescue channel");
            const rescueTeams = preferChannelLower === "telemundo deportes" && queryTeams.length === 2
              ? queryTeams.map((team) => (TEAM_ALIASES[team] || [team]).find((alias) => alias !== team) || team)
              : [teamsMatch[1], teamsMatch[2]];
            const rescueKind = preferChannelLower === "telemundo deportes"
              ? (preferExtended ? "resumen extendido" : "resumen")
              : "highlights";
            const rescueTeamOrders = preferChannelLower === "telemundo deportes"
              ? [rescueTeams, [...rescueTeams].reverse()]
              : [rescueTeams];
            for (const teamOrder of rescueTeamOrders) {
              const chQuery = `${teamOrder[0]} ${teamOrder[1]} ${rescueKind}`.trim();
              const chUrl = `https://www.youtube.com/${rescueChannelPath}/search?query=${encodeURIComponent(chQuery)}`;
              const chRes = await fetch(chUrl, {
                headers: {
                  "User-Agent":
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                  "Accept-Language": "en-US,en;q=0.9",
                },
              });
              const chHtml = await chRes.text();
              const chBlocks = chHtml.split('"videoRenderer":{').slice(1);
              let chStandardId = null;
              let chExtendedId = null;
              for (const block of chBlocks) {
                const idMatch = block.match(/^"videoId":"([a-zA-Z0-9_-]{11})"/);
                if (!idMatch || excludeSet.has(idMatch[1])) continue;
                const titleMatch = block.match(/"title":\{"runs":\[\{"text":"(.*?)"\}/);
                const channelMatch = block.match(/"ownerText":\{"runs":\[\{"text":"(.*?)"/);
                const titleLower = (titleMatch ? titleMatch[1] : "").toLowerCase();
                const channelLower = (channelMatch ? channelMatch[1] : "").toLowerCase();
                // Same gates as the main loop: official WC channel, "World Cup"
                // in the title, a highlight/recap keyword, and BOTH named teams.
                if (!rescueAllowedChannels.includes(channelLower)) continue;
                if (!/\b(world cup|copa mundial|fifa)\b/.test(titleLower)) continue;
                if (!titleLower.includes("highlight") && !titleLower.includes("recap") && !titleLower.includes("resumen")) continue;
                if (!titleHasTeam(titleLower, queryTeams[0]) || !titleHasTeam(titleLower, queryTeams[1])) continue;
                if (/\b(extended|extendido)\b/.test(titleLower)) {
                  if (!chExtendedId) chExtendedId = idMatch[1];
                } else {
                  chStandardId = idMatch[1];
                  if (!preferExtended) break; // standard recap wins outright
                }
              }
              videoId = preferExtended
                ? (chExtendedId || chStandardId || null)
                : (chStandardId || chExtendedId || null);
              if (videoId) break;
            }
          } catch {
            // Channel lookup failed — fall through to the 404 below (hide the
            // button) rather than surfacing a 500.
          }
        }

        if (!videoId) {
          // Deliberately NOT cached: a game's recap can post any minute after
          // full-time, and this app's whole value is surfacing it the instant
          // it's up. Re-scraping a miss on each request is cheap enough at real
          // traffic (a normal page load is ~20 lookups, all served) that it's
          // not worth trading recap freshness for.
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

    // MLB.com recap + condensed-game video links. StatsAPI sends the per-game
    // highlight payload, but browsers/Capacitor should not call it directly from
    // every card. Normalize it here into the shape espn.ts expects.
    if (url.pathname === "/api/mlb-videos") {
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
      const raw = url.searchParams.get("date") || "";
      const iso = /^\d{8}$/.test(raw)
        ? `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`
        : raw;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
        return corsJson({ error: "Bad date" }, 400, 0);
      }
      try {
        const res = await fetch(`https://statsapi.mlb.com/api/v1/schedule?date=${encodeURIComponent(iso)}&sportId=1&hydrate=game(content(highlights(highlights)))`, {
          headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" },
        });
        if (!res.ok) return corsJson({ games: [] }, 200, 60);
        const data = await res.json();
        const teamName = (t) => t?.team?.name || "";
        const textOf = (h) => [
          h?.title,
          h?.headline,
          h?.seoTitle,
          h?.slug,
          h?.blurb,
          ...(h?.keywordsAll || []).flatMap((k) => [k?.value, k?.displayName, k?.type]),
          ...(h?.keywordsDisplay || []).flatMap((k) => [k?.value, k?.displayName, k?.type]),
        ].filter(Boolean).join(" ").toLowerCase();
        const playbackOf = (h) => {
          const playbacks = h?.playbacks || [];
          return (
            playbacks.find((p) => p?.name === "hlsCloud") ||
            playbacks.find((p) => /\.m3u8(?:$|\?)/i.test(p?.url || "")) ||
            playbacks[0] ||
            null
          )?.url || null;
        };
        const posterOf = (h) => {
          const cuts = h?.image?.cuts || [];
          return (
            cuts.find((c) => c?.aspectRatio === "16:9" && c?.width >= 1280) ||
            cuts.find((c) => c?.aspectRatio === "16:9") ||
            cuts[0] ||
            null
          )?.src || null;
        };
        const clipOf = (h) => h ? ({
          url: h.slug ? `https://www.mlb.com/video/${h.slug}` : null,
          playback: playbackOf(h),
          poster: posterOf(h),
        }) : null;
        const games = [];
        for (const dt of data?.dates || []) {
          for (const g of dt?.games || []) {
            const items = g?.content?.highlights?.highlights?.items || [];
            const recap = items.find((h) => {
              const t = textOf(h);
              return !/condensed/.test(t) && (
                /\bmlb_recap\b/.test(t) ||
                /\bmlbcom_game_recap\b/.test(t) ||
                /\bgame-recap\b/.test(t) ||
                /\bgame recap\b/.test(t)
              );
            });
            const condensed = items.find((h) => {
              const t = textOf(h);
              return /\bcondensed-game\b/.test(t) || /\bcondensed game\b/.test(t) || /\bcondensed\b/.test(t);
            });
            const out = {
              date: g?.gameDate || null,
              away: teamName(g?.teams?.away),
              home: teamName(g?.teams?.home),
              recap: clipOf(recap),
              condensed: clipOf(condensed),
            };
            if (out.away && out.home && (out.recap || out.condensed)) games.push(out);
          }
        }
        return corsJson({ games });
      } catch {
        return corsJson({ games: [] }, 200, 60);
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
   } catch {
     // Last-resort guard: a transient R2 / HTMLRewriter / subrequest failure must
     // never surface as a Cloudflare 1101 "Worker threw an exception" page. For a
     // document request fall back to the static SPA shell (routing + data happen
     // client-side, so the page still loads); otherwise a soft, retryable 503.
     // (Jacob 6/18 — "should never happen, full reliability check".)
     try {
       const accept = request.headers.get("accept") || "";
       if (request.method === "GET" && accept.includes("text/html")) {
         return await env.ASSETS.fetch(request);
       }
     } catch { /* fall through to 503 */ }
     return new Response("", { status: 503, headers: { "Retry-After": "2" } });
   }
  },
};

// ===========================================================================
// Sign in with Apple (web) + cross-device preference sync.
//
// Why this exists: all hidescore prefs live in browser localStorage, so they
// don't follow a user between Safari/Firefox/phone. Signing in with Apple
// gives each user a stable id (Apple's `sub`); we store their prefs JSON in R2
// at `prefs/<sub>.json` (not in any public-serving allowlist, so it's only
// reachable through these authenticated endpoints). The client merges the
// server copy over its local copy on load and writes back on change.
//
// Required env (set as Pages secrets; handlers 503/skip until present):
//   APPLE_SERVICES_ID   the Services ID = OAuth client_id (e.g. com.hidescore.web)
//   APPLE_TEAM_ID       10-char Apple Team ID
//   APPLE_KEY_ID        10-char key id of the Sign in with Apple .p8 key
//   APPLE_PRIVATE_KEY   full PEM contents of the .p8 (BEGIN/END PRIVATE KEY)
//   SESSION_SECRET      random string; signs our own session + login state
//
// The Apple "client secret" is a short-lived ES256 JWT minted per token
// exchange (below), so there is NO 6-month secret to rotate.
// ===========================================================================

const APPLE_AUTHORIZE = "https://appleid.apple.com/auth/authorize";
const APPLE_TOKEN_URL = "https://appleid.apple.com/auth/token";
const APPLE_KEYS_URL = "https://appleid.apple.com/auth/keys";
const SIWA_SESSION_COOKIE = "hs_session";
const SIWA_SESSION_TTL = 60 * 60 * 24 * 90; // 90 days
const SIWA_STATE_TTL = 60 * 10; // login round-trip must finish in 10 min

const _siwaEnc = new TextEncoder();
const _siwaDec = new TextDecoder();
function _siwaNow() { return Math.floor(Date.now() / 1000); }

// base64url helpers (JWT/JWS use base64url, no padding)
function _b64urlFromBytes(buf) {
  const arr = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function _bytesFromB64url(str) {
  let s = String(str).replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function _bytesFromB64(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function _b64urlFromJSON(obj) { return _b64urlFromBytes(_siwaEnc.encode(JSON.stringify(obj))); }
function _jsonFromB64url(str) { return JSON.parse(_siwaDec.decode(_bytesFromB64url(str))); }

// --- HMAC (signs our session token and the OAuth `state`) ------------------
async function _siwaHmacKey(secret) {
  return crypto.subtle.importKey("raw", _siwaEnc.encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}
async function _siwaHmacSign(secret, data) {
  const sig = await crypto.subtle.sign("HMAC", await _siwaHmacKey(secret), _siwaEnc.encode(data));
  return _b64urlFromBytes(sig);
}
async function _siwaHmacVerify(secret, data, sig) {
  try {
    return await crypto.subtle.verify("HMAC", await _siwaHmacKey(secret),
      _bytesFromB64url(sig), _siwaEnc.encode(data));
  } catch { return false; }
}

// --- Our own session token: base64url(payload).hmac, verified server-side --
async function _siwaMakeSession(env, payload) {
  const body = _b64urlFromJSON(payload);
  return `${body}.${await _siwaHmacSign(env.SESSION_SECRET, body)}`;
}
async function _siwaReadSession(env, token) {
  if (!token || !env.SESSION_SECRET) return null;
  const dot = token.lastIndexOf(".");
  if (dot < 1) return null;
  const body = token.slice(0, dot), sig = token.slice(dot + 1);
  if (!(await _siwaHmacVerify(env.SESSION_SECRET, body, sig))) return null;
  let payload;
  try { payload = _jsonFromB64url(body); } catch { return null; }
  if (!payload.exp || payload.exp < _siwaNow()) return null;
  return payload;
}

// --- Apple client secret: ES256 JWT signed with the .p8 private key --------
async function _siwaImportApplePrivateKey(pem) {
  const b64 = pem.replace(/-----BEGIN PRIVATE KEY-----/, "")
                 .replace(/-----END PRIVATE KEY-----/, "")
                 .replace(/\s+/g, "");
  return crypto.subtle.importKey("pkcs8", _bytesFromB64(b64),
    { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
}
async function _siwaMakeClientSecret(env) {
  const header = { alg: "ES256", kid: env.APPLE_KEY_ID };
  const iat = _siwaNow();
  const payload = {
    iss: env.APPLE_TEAM_ID, iat, exp: iat + 300,
    aud: "https://appleid.apple.com", sub: env.APPLE_SERVICES_ID,
  };
  const signingInput = `${_b64urlFromJSON(header)}.${_b64urlFromJSON(payload)}`;
  const key = await _siwaImportApplePrivateKey(env.APPLE_PRIVATE_KEY);
  // Web Crypto ECDSA returns raw r||s (IEEE P1363) = exactly the JWS ES256 form.
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key,
    _siwaEnc.encode(signingInput));
  return `${signingInput}.${_b64urlFromBytes(sig)}`;
}

// --- Verify Apple's id_token (RS256, keys from Apple's JWKS) ----------------
let _siwaKeysCache = null; // { exp, keys }
async function _siwaAppleKeys() {
  if (_siwaKeysCache && _siwaKeysCache.exp > _siwaNow()) return _siwaKeysCache.keys;
  const res = await fetch(APPLE_KEYS_URL);
  const { keys } = await res.json();
  _siwaKeysCache = { exp: _siwaNow() + 3600, keys };
  return keys;
}
async function _siwaVerifyIdToken(idToken, env, expectedAud) {
  if (!idToken) return null;
  const parts = idToken.split(".");
  if (parts.length !== 3) return null;
  const [h, p, s] = parts;
  let header, payload;
  try { header = _jsonFromB64url(h); payload = _jsonFromB64url(p); } catch { return null; }
  const jwk = (await _siwaAppleKeys()).find((k) => k.kid === header.kid);
  if (!jwk) return null;
  let ok = false;
  try {
    const key = await crypto.subtle.importKey("jwk", jwk,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
    ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key,
      _bytesFromB64url(s), _siwaEnc.encode(`${h}.${p}`));
  } catch { return null; }
  if (!ok) return null;
  if (payload.iss !== "https://appleid.apple.com") return null;
  const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!aud.includes(expectedAud || env.APPLE_SERVICES_ID)) return null;
  if (!payload.exp || payload.exp < _siwaNow()) return null;
  return payload; // { sub, email?, nonce?, ... }
}

// --- cookies ---------------------------------------------------------------
function _siwaSetCookie(name, value, maxAge) {
  return `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}
function _siwaGetCookie(request, name) {
  const h = request.headers.get("Cookie") || "";
  const m = h.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return m ? m[1] : null;
}

// --- route handlers --------------------------------------------------------
function _siwaConfigured(env) {
  return !!(env.APPLE_SERVICES_ID && env.APPLE_TEAM_ID && env.APPLE_KEY_ID &&
            env.APPLE_PRIVATE_KEY && env.SESSION_SECRET);
}
function _siwaJson(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
function _siwaErrRedirect(code) {
  return new Response(null, { status: 303, headers: { Location: `/?auth_error=${code}` } });
}

// GET /auth/apple/login -> 302 to Apple's authorize endpoint.
// State + nonce are signed (HMAC) and round-tripped via the `state` param, so
// no pre-callback cookie is needed (Apple POSTs the callback cross-site, where
// a SameSite=Lax cookie wouldn't be sent anyway).
async function siwaLogin(request, env, url) {
  if (!_siwaConfigured(env)) return new Response("Sign in is not configured yet", { status: 503 });
  const returnToRaw = url.searchParams.get("returnTo") || "/";
  const returnTo = returnToRaw.startsWith("/") ? returnToRaw : "/";
  const nonce = _b64urlFromBytes(crypto.getRandomValues(new Uint8Array(16)));
  const stateBody = _b64urlFromJSON({ n: nonce, r: returnTo, t: _siwaNow() });
  const state = `${stateBody}.${await _siwaHmacSign(env.SESSION_SECRET, stateBody)}`;
  const auth = new URL(APPLE_AUTHORIZE);
  auth.searchParams.set("response_type", "code");
  auth.searchParams.set("response_mode", "form_post"); // required once scope is requested
  auth.searchParams.set("client_id", env.APPLE_SERVICES_ID);
  auth.searchParams.set("redirect_uri", `${url.origin}/auth/apple/callback`);
  auth.searchParams.set("scope", "name email");
  auth.searchParams.set("state", state);
  auth.searchParams.set("nonce", nonce);
  return Response.redirect(auth.toString(), 302);
}

// POST /auth/apple/callback (form_post from appleid.apple.com)
async function siwaCallback(request, env, url) {
  if (!_siwaConfigured(env)) return _siwaErrRedirect("not_configured");
  let form;
  try { form = await request.formData(); } catch { return _siwaErrRedirect("bad_request"); }
  const code = form.get("code");
  const state = form.get("state");
  if (!code || !state) return _siwaErrRedirect("missing_code");

  const dot = String(state).lastIndexOf(".");
  if (dot < 1) return _siwaErrRedirect("bad_state");
  const sBody = String(state).slice(0, dot), sSig = String(state).slice(dot + 1);
  if (!(await _siwaHmacVerify(env.SESSION_SECRET, sBody, sSig))) return _siwaErrRedirect("bad_state");
  let st;
  try { st = _jsonFromB64url(sBody); } catch { return _siwaErrRedirect("bad_state"); }
  if (!st.t || st.t < _siwaNow() - SIWA_STATE_TTL) return _siwaErrRedirect("expired");

  let tokens;
  try {
    const res = await fetch(APPLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: env.APPLE_SERVICES_ID,
        client_secret: await _siwaMakeClientSecret(env),
        code: String(code),
        grant_type: "authorization_code",
        redirect_uri: `${url.origin}/auth/apple/callback`,
      }),
    });
    if (!res.ok) return _siwaErrRedirect("token_exchange");
    tokens = await res.json();
  } catch { return _siwaErrRedirect("token_exchange"); }

  const claims = await _siwaVerifyIdToken(tokens.id_token, env);
  if (!claims) return _siwaErrRedirect("bad_id_token");
  if (claims.nonce && claims.nonce !== st.n) return _siwaErrRedirect("bad_nonce");

  const session = await _siwaMakeSession(env, {
    sub: `apple:${claims.sub}`, email: claims.email || null, exp: _siwaNow() + SIWA_SESSION_TTL,
  });
  return new Response(null, {
    status: 303,
    headers: {
      Location: st.r && st.r.startsWith("/") ? st.r : "/",
      "Set-Cookie": _siwaSetCookie(SIWA_SESSION_COOKIE, session, SIWA_SESSION_TTL),
    },
  });
}

// POST /auth/apple/native — body { identityToken, nonce?, email? } from the
// in-app NATIVE Sign in with Apple (Capacitor @capacitor-community/apple-sign-in).
// The iOS app's WebView loads hidescore.com, so the Set-Cookie here lands in the
// app's own cookie jar -> the in-app site is signed in. (The web /auth/apple/login
// redirect can't: it logs in inside Safari, not the app's WebView.) The native
// id_token's aud is the APP BUNDLE ID (com.jacobhl.hidescore), not the web Services
// ID, so verify against APPLE_APP_BUNDLE_ID. No client_secret / code exchange
// needed -- the identityToken is already an Apple-signed JWT.
async function siwaNative(request, env) {
  if (!env.SESSION_SECRET) return _siwaJson({ error: "not_configured" }, 503);
  let body;
  try { body = await request.json(); } catch { return _siwaJson({ error: "bad_request" }, 400); }
  const idToken = body && body.identityToken;
  if (!idToken) return _siwaJson({ error: "missing_token" }, 400);
  const expectedAud = env.APPLE_APP_BUNDLE_ID || "com.jacobhl.hidescore";
  const claims = await _siwaVerifyIdToken(idToken, env, expectedAud);
  if (!claims) return _siwaJson({ error: "bad_id_token" }, 401);
  if (body.nonce && claims.nonce && claims.nonce !== body.nonce) {
    return _siwaJson({ error: "bad_nonce" }, 401);
  }
  const session = await _siwaMakeSession(env, {
    sub: `apple:${claims.sub}`,
    email: claims.email || body.email || null,
    exp: _siwaNow() + SIWA_SESSION_TTL,
  });
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "Set-Cookie": _siwaSetCookie(SIWA_SESSION_COOKIE, session, SIWA_SESSION_TTL),
    },
  });
}

// POST /auth/logout -> clear the session cookie.
function siwaLogout() {
  return new Response(null, {
    status: 303,
    headers: { Location: "/", "Set-Cookie": _siwaSetCookie(SIWA_SESSION_COOKIE, "", 0) },
  });
}

// GET /api/me -> { signedIn, email, providers } — providers reflects which
// sign-in methods have their secrets set, so the UI only shows live buttons.
async function siwaMe(request, env) {
  const u = await _siwaReadSession(env, _siwaGetCookie(request, SIWA_SESSION_COOKIE));
  return _siwaJson({
    signedIn: !!u,
    email: (u && u.email) || null,
    providers: { apple: _siwaConfigured(env), google: _googleConfigured(env) },
  });
}

// GET /api/prefs -> { prefs } (the user's stored prefs JSON, or null)
async function prefsGet(request, env) {
  const u = await _siwaReadSession(env, _siwaGetCookie(request, SIWA_SESSION_COOKIE));
  if (!u) return _siwaJson({ error: "unauthorized" }, 401);
  if (!env.DATA) return _siwaJson({ prefs: null });
  const obj = await env.DATA.get(`prefs/${u.sub}.json`);
  return _siwaJson({ prefs: obj ? await obj.json() : null });
}

// PUT /api/prefs  body = prefs JSON -> { ok: true }
async function prefsPut(request, env) {
  const u = await _siwaReadSession(env, _siwaGetCookie(request, SIWA_SESSION_COOKIE));
  if (!u) return _siwaJson({ error: "unauthorized" }, 401);
  if (!env.DATA) return _siwaJson({ error: "no_store" }, 503);
  const text = await request.text();
  if (text.length > 64 * 1024) return _siwaJson({ error: "too_large" }, 413);
  let parsed;
  try { parsed = JSON.parse(text); } catch { return _siwaJson({ error: "bad_json" }, 400); }
  // Prefs must be a plain JSON object. Reject arrays / strings / numbers / null so a
  // malformed body can't be stored and then break the client-side prefs reader.
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return _siwaJson({ error: "bad_shape" }, 400);
  }
  await env.DATA.put(`prefs/${u.sub}.json`, JSON.stringify(parsed),
    { httpMetadata: { contentType: "application/json" } });
  return _siwaJson({ ok: true });
}

// DELETE /api/account -> delete the signed-in user's stored data + clear the session.
// Satisfies Apple's in-app account-deletion requirement (App Store guideline 5.1.1(v)).
// All data we hold for a user is their prefs object at `prefs/<sub>.json`; sessions are
// stateless HMAC cookies (no server-side store), so clearing the cookie fully signs out.
// The iOS app loads this site in a WebView sharing the same cookie, so this deletes
// on-device too. We can't unlink their Apple/Google ID (external), only erase our data.
async function accountDelete(request, env) {
  const u = await _siwaReadSession(env, _siwaGetCookie(request, SIWA_SESSION_COOKIE));
  if (!u) return _siwaJson({ error: "unauthorized" }, 401);
  if (env.DATA) {
    try { await env.DATA.delete(`prefs/${u.sub}.json`); } catch (_e) { /* already gone */ }
  }
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Set-Cookie": _siwaSetCookie(SIWA_SESSION_COOKIE, "", 0),
    },
  });
}

// ===========================================================================
// Sign in with Google (web). Same session + R2 prefs model as Apple, keyed by
// `google:<sub>` so the two providers never collide. Inert until the
// GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET secrets are set.
// ===========================================================================
const GOOGLE_AUTHORIZE = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_CERTS_URL = "https://www.googleapis.com/oauth2/v3/certs";

function _googleConfigured(env) {
  return !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.SESSION_SECRET);
}

let _googleKeysCache = null;
async function _googleKeys() {
  if (_googleKeysCache && _googleKeysCache.exp > _siwaNow()) return _googleKeysCache.keys;
  const res = await fetch(GOOGLE_CERTS_URL);
  const { keys } = await res.json();
  _googleKeysCache = { exp: _siwaNow() + 3600, keys };
  return keys;
}

// Verify Google's id_token (RS256 via Google's JWKS).
async function _googleVerifyIdToken(idToken, env) {
  if (!idToken) return null;
  const parts = idToken.split(".");
  if (parts.length !== 3) return null;
  const [h, p, s] = parts;
  let header, payload;
  try { header = _jsonFromB64url(h); payload = _jsonFromB64url(p); } catch { return null; }
  const jwk = (await _googleKeys()).find((k) => k.kid === header.kid);
  if (!jwk) return null;
  let ok = false;
  try {
    const key = await crypto.subtle.importKey("jwk", jwk,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
    ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key,
      _bytesFromB64url(s), _siwaEnc.encode(`${h}.${p}`));
  } catch { return null; }
  if (!ok) return null;
  if (payload.iss !== "https://accounts.google.com" && payload.iss !== "accounts.google.com") return null;
  if (payload.aud !== env.GOOGLE_CLIENT_ID) return null;
  if (!payload.exp || payload.exp < _siwaNow()) return null;
  return payload; // { sub, email?, nonce?, ... }
}

// GET /auth/google/login -> 302 to Google's consent screen.
async function googleLogin(request, env, url) {
  if (!_googleConfigured(env)) return new Response("Sign in is not configured yet", { status: 503 });
  const returnToRaw = url.searchParams.get("returnTo") || "/";
  const returnTo = returnToRaw.startsWith("/") ? returnToRaw : "/";
  const nonce = _b64urlFromBytes(crypto.getRandomValues(new Uint8Array(16)));
  const stateBody = _b64urlFromJSON({ n: nonce, r: returnTo, t: _siwaNow() });
  const state = `${stateBody}.${await _siwaHmacSign(env.SESSION_SECRET, stateBody)}`;
  const auth = new URL(GOOGLE_AUTHORIZE);
  auth.searchParams.set("client_id", env.GOOGLE_CLIENT_ID);
  auth.searchParams.set("redirect_uri", `${url.origin}/auth/google/callback`);
  auth.searchParams.set("response_type", "code");
  auth.searchParams.set("scope", "openid email");
  auth.searchParams.set("state", state);
  auth.searchParams.set("nonce", nonce);
  return Response.redirect(auth.toString(), 302);
}

// GET /auth/google/callback?code=&state= (Google redirects with query params).
async function googleCallback(request, env, url) {
  if (!_googleConfigured(env)) return _siwaErrRedirect("not_configured");
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) return _siwaErrRedirect("missing_code");
  const dot = state.lastIndexOf(".");
  if (dot < 1) return _siwaErrRedirect("bad_state");
  const sBody = state.slice(0, dot), sSig = state.slice(dot + 1);
  if (!(await _siwaHmacVerify(env.SESSION_SECRET, sBody, sSig))) return _siwaErrRedirect("bad_state");
  let st;
  try { st = _jsonFromB64url(sBody); } catch { return _siwaErrRedirect("bad_state"); }
  if (!st.t || st.t < _siwaNow() - SIWA_STATE_TTL) return _siwaErrRedirect("expired");

  let tokens;
  try {
    const res = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: env.GOOGLE_CLIENT_ID,
        client_secret: env.GOOGLE_CLIENT_SECRET,
        code,
        grant_type: "authorization_code",
        redirect_uri: `${url.origin}/auth/google/callback`,
      }),
    });
    if (!res.ok) return _siwaErrRedirect("token_exchange");
    tokens = await res.json();
  } catch { return _siwaErrRedirect("token_exchange"); }

  const claims = await _googleVerifyIdToken(tokens.id_token, env);
  if (!claims) return _siwaErrRedirect("bad_id_token");
  if (claims.nonce && claims.nonce !== st.n) return _siwaErrRedirect("bad_nonce");

  const session = await _siwaMakeSession(env, {
    sub: `google:${claims.sub}`, email: claims.email || null, exp: _siwaNow() + SIWA_SESSION_TTL,
  });
  return new Response(null, {
    status: 303,
    headers: {
      Location: st.r && st.r.startsWith("/") ? st.r : "/",
      "Set-Cookie": _siwaSetCookie(SIWA_SESSION_COOKIE, session, SIWA_SESSION_TTL),
    },
  });
}
