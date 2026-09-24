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

// Map a redlib media-proxy URL back to Reddit's own CDN. The bake stopped
// emitting these in 5969c0d7 (redlibMediaToReddit in scripts/prebake-news.mjs),
// but every link shared BEFORE that still carries one in ?hp / ?hi — and the
// volunteer media hosts answer weserv with a 403, which silently trips the
// &default= fallback so the unfurl showed the generic site blob instead of the
// clip's still. Path shapes are redlib's own (/preview/pre/, /preview/external-pre/,
// /img/); /img/ is generic enough that it's gated on a known redlib host so a
// legitimate someothersite.com/img/… is never rewritten to i.redd.it.
const REDLIB_MEDIA_HOST = /(redlib|safereddit|perennialte|catsarch|kittywit|bloat\.cat)/i;
function deRedlibMedia(u) {
  const m = String(u).match(/^https?:\/\/([^/]+)(\/(?:img|preview)\/.+)$/i);
  if (!m) return u;
  const [, host, p] = m;
  if (p.startsWith("/preview/external-pre/")) return "https://external-preview.redd.it/" + p.slice(22);
  if (p.startsWith("/preview/pre/")) return "https://preview.redd.it/" + p.slice(13);
  if (p.startsWith("/img/") && REDLIB_MEDIA_HOST.test(host)) return "https://i.redd.it/" + p.slice(5);
  return u;
}

// Bump when the card design changes — appended to og:image as ?r=N so crawlers
// and the CDN fetch a fresh URL instead of a stale cached image.
const CARD_REV = 4;

// Strict official combat clips are safe in HideScore even when the YouTube
// title names the finish: the masked player never renders YouTube title chrome.
// Keep this narrow. An unscoped result-bearing upload must still be rejected.
const MASKED_COMBAT_CHANNELS = new Set(["ufc on paramount+", "ufc", "espn mma"]);

// Chess organizers who post the ROUND itself as a full broadcast VOD, with no
// "highlights"/"recap" keyword in the title. Lowercased YouTube author_name —
// mirrors CHESS_ORGANIZER_CHANNELS in src/lib/espn.ts, keep the two in step.
// Used by isChessRoundBroadcast below; unlike MASKED_COMBAT_CHANNELS this does
// NOT exempt anything from the spoiler filter.
const CHESS_BROADCAST_CHANNELS = new Set(["saint louis chess club", "fide chess"]);

// Wrap an arbitrary news image (Reddit photo, preview thumb, league poster, or
// YouTube still) for use as the social-card image. Routed through weserv — the
// SAME proxy the app already uses for every redd.it thumbnail (see proxyImage in
// src/lib/news.ts): it normalizes Reddit's webp-as-jpeg + hotlink blocks, crops
// to the 1.91:1 OG frame with a smart focal point, and — via &default= — serves
// the branded site card if the source ever 404s, so a dead link can never beat
// the default blob.
function newsOgImage(raw) {
  const src = deRedlibMedia(raw).replace(/^https?:\/\//, "");
  const fallback = encodeURIComponent("https://hidescore.com/og-image.png");
  return `https://images.weserv.nl/?url=${encodeURIComponent(src)}&w=1200&h=630&fit=cover&a=attention&output=jpg&q=82&default=${fallback}`;
}

// ── Racing race-gate helpers (see the `race` param in /api/youtube) ─────────
// Punctuation-insensitive compare: ESPN writes "Mid-Ohio" / "St. Petersburg",
// the channels write "Mid Ohio" / "St. Pete", and NASCAR hyphenates
// "All-Star Race" where ESPN does not.
function normalizeRaceToken(s) {
  return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

// Tracks the official channel titles differently than ESPN names them. Without
// these the gate would HIDE three races it currently gets RIGHT: Atlanta races
// are titled "EchoPark Speedway" (the track's sponsor name since 2024),
// Charlotte's is titled by the race ("Coca-Cola 600"), and INDYCAR's St.
// Petersburg reel says "St. Pete". Illinois is the reverse case — the gate
// needs these to know that "World Wide Technology Raceway" IS the Grand Prix
// of Illinois, rather than falling through to whatever raced most recently.
// Keyed by the NORMALIZED ESPN token. Add a row whenever a track is renamed.
const RACE_TOKEN_ALIASES = {
  atlanta: ["echopark"],
  charlotte: ["coca cola 600"],
  illinois: ["world wide technology", "gateway", "wwt"],
  indianapolis: ["brickyard"],
  "st petersburg": ["st pete"],
};

// True when `title` is plausibly about the race `tokens` describe. Deliberately
// permissive on WORD PREFIXES in both directions — "Chicago" must match
// "Chicagoland Speedway", and "Sonoma" must match "Sonoma Raceway" — but it
// will not match a different race, which is the whole point.
// Sessions that happen AT the same circuit, carry the same venue token, and are
// not the race. Verified 2026-08-04 in production: a Bahrain Grand Prix query
// matched "Day 1 Highlights | 2026 Bahrain Pre-Season Test 1" — correct
// channel, correct venue word, correct "highlights" keyword, wrong event
// entirely. The venue token alone cannot separate these, because the venue IS
// the same. F1 runs testing and practice at race circuits; NASCAR posts
// qualifying reels; sprints are their own event and not what the race tile
// promises. Rejecting one of these hides the button, which is the intended
// failure direction.
const NON_RACE_SESSION_RX =
  /\b(pre[\s-]?season|testing|test \d|practice|fp[123]\b|qualifying|qualifier|shootout|warm[\s-]?up|sprint)\b/i;

// ── Competition title gate (see the `comp` param in /api/youtube) ──────────
// The race gate's sibling for team sports. Some official channels upload more
// than ONE competition between the SAME two teams inside the same window, so
// the channel gate, the both-teams gate and the year gate can all agree while
// the video is still the wrong event. Verified case (2026-08-12): World Rugby
// posts the senior Nations Championship AND the U20 Junior World Championships
// in the same July, both as "Italy v Japan", and three of thirteen strict hits
// for senior fixtures were U20 matches.
//
// Substring on the normalized title, OR across tokens — an empty token list is
// no gate at all, so every sport that doesn't set `comp` is byte-for-byte
// unchanged. Reuses normalizeRaceToken purely as a punctuation-insensitive
// lowercase; it carries no racing semantics.
function compTitleMatches(tokens, titleLower) {
  if (tokens.length === 0) return true; // no gate requested → unchanged behaviour
  const nt = normalizeRaceToken(titleLower);
  return tokens.some((tok) => tok && nt.includes(tok));
}

// YouTube bylines a CO-UPLOAD with both accounts joined by " and ": the search
// page reported "TUDN USA and ViX" as the ownerText of TUDN's Puebla–Atlante
// recap on 2026-09-18, while oembed still names the single real owner ("TUDN
// USA"). The exact-equality channel test then read false, so NO channel tier
// fired, and a `strict=1` Liga MX lookup returned "No results" for a video that
// was sitting at rank 1 of the page it had just parsed — the card went dark
// with the correct clip in hand. (The unscoped lookup found it, which is how
// the split showed up at all.)
//
// This only decides whether a video is ALLOWED INTO the channel tiers. Ground
// truth stays the oembed author_name check at the end of the handler: a pick
// whose parsed byline is not an exact match still pays the oembed round-trip
// and is still dropped unless author_name equals the requested channel. So a
// collaborator can never smuggle in its own upload.
function bylineNamesChannel(byline, preferChannelLower) {
  if (!preferChannelLower) return false;
  const b = String(byline || "").toLowerCase();
  if (b === preferChannelLower) return true;
  return b.split(/\s+and\s+/).some((part) => part.trim() === preferChannelLower);
}

function raceTitleMatches(tokens, titleLower) {
  if (tokens.length === 0) return true; // no gate requested → unchanged behaviour
  if (NON_RACE_SESSION_RX.test(titleLower)) return false;
  const nt = normalizeRaceToken(titleLower);
  const titleWords = nt.split(" ");
  for (const tok of tokens) {
    if (!tok) continue;
    if (nt.includes(tok)) return true;
    for (const w of titleWords) {
      if (w.length >= 5 && (w.startsWith(tok) || tok.startsWith(w))) return true;
    }
    for (const alias of RACE_TOKEN_ALIASES[tok] || []) {
      if (nt.includes(alias)) return true;
    }
  }
  return false;
}

// YouTube's relative upload stamp, in ms per unit. Approximate by design —
// the stamp itself is approximate.
const PUBLISHED_UNIT_MS = {
  second: 1000,
  minute: 60 * 1000,
  hour: 60 * 60 * 1000,
  day: 24 * 60 * 60 * 1000,
  week: 7 * 24 * 60 * 60 * 1000,
  month: 30 * 24 * 60 * 60 * 1000,
  year: 365 * 24 * 60 * 60 * 1000,
};

// Abbreviated spelling YouTube also emits for this same field ("2y ago",
// "1mo ago", "3d ago" — measured live 2026-09-22 on a CFL search: the
// SAME videoRenderer block that would read "2 years ago" elsewhere on the
// site read "2y ago" here). The full-word regex below never matched these —
// no space between the digit and the unit, and the unit itself is a letter
// code, not a word — so latestPossiblePublish silently returned null and
// publishedBeforeGame treated the stamp as unreadable ("no stamp → unchanged"),
// letting a 2024 upload sail through the age gate for a 2026 game (wk6
// HAM@SSK, wk15 SSK@WPG). Root cause of the #84 age-gate miss.
const PUBLISHED_UNIT_ABBR = { s: "second", m: "minute", h: "hour", d: "day", w: "week", mo: "month", y: "year" };

// "3 years ago" / "Streamed 5 months ago" / "2y ago" → the NEWEST instant
// that text can mean. YouTube floors the count, so "1 month ago" (or "1mo
// ago") is anything from 30 to 59 days back and the real upload can only be
// OLDER than what this returns. null when the stamp is absent or in a shape
// we don't read.
function latestPossiblePublish(publishedText, nowMs) {
  const m = String(publishedText || "")
    .toLowerCase()
    .match(/(\d+)\s*(second|minute|hour|day|week|month|year|mo|s|m|h|d|w|y)s?\s+ago/);
  if (!m) return null;
  const unitWord = PUBLISHED_UNIT_ABBR[m[2]] || m[2];
  const unit = PUBLISHED_UNIT_MS[unitWord];
  if (!unit) return null;
  return nowMs - parseInt(m[1], 10) * unit;
}

// AGE GATE — a highlight cannot predate its own game. ESPN FC / CBS / MLS /
// Serie A title their recaps with the two clubs and nothing else: no date, no
// year. For a fixture that repeats every season BOTH meetings therefore pass
// the team, competition and week checks, and whichever ranks first wins. The
// 2nd ("extended") highlight button made this visible: it re-asks with the
// 1st video excluded, so the next-best hit is very often last season's cut.
// Measured against the live manifest 2026-09-20: about 105 of 135 soccer
// `extended` slots held the wrong season, the oldest a 2012 MLS game.
// publishedTimeText is the only season signal those blocks carry.
// Two days of slack absorbs the gap between the game's local date, the UTC
// date built from the query, and YouTube's own rounding.
const AGE_GATE_SLACK_MS = 2 * 24 * 60 * 60 * 1000;
function publishedBeforeGame(publishedText, gameMs, nowMs) {
  if (!gameMs) return false; // no date in the query (golf, tournaments) → unchanged
  const latest = latestPossiblePublish(publishedText, nowMs);
  if (latest === null) return false; // no stamp we can read → unchanged
  return latest < gameMs - AGE_GATE_SLACK_MS;
}

// WEEK TOKEN — shared by the gridiron week gate below. Reads both digit
// ("Week 15", "Wk 15") and spelled-out ("WEEK ONE" … "WEEK TWENTY-ONE")
// forms. TSN spells CFL weeks 1–5 out in full ("CFL WEEK ONE: …", "CFL WEEK
// FIVE: …") and switches to digits from week 6 on; the old digit-only regex
// read a spelled title as carrying NO week token, which the wrong-week
// hard-skip below treats as "untouched" — so wk6 OTT@EDM, wk8 CGY@WPG and
// wk8 HAM@MTL all passed the gate under the WEEK ONE recap of the same
// fixture (measured live 2026-09-22, 3/3 wrong). 21 covers a full CFL
// regular season (18 weeks) plus margin; NFL/NCAAF never spell a week past
// low single digits in practice, so this is a superset of the old behaviour,
// never a narrower one.
const WEEK_WORDS = [
  "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
  "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen",
  "nineteen", "twenty",
];
const WEEK_TOKEN_RE = new RegExp(
  `\\bw(?:ee)?k\\.?\\s*(\\d{1,2}|${WEEK_WORDS.join("|")})(?:[\\s-]one)?\\b`,
  "i",
);
function weekWordToNumber(word) {
  const w = word.toLowerCase();
  if (/^\d+$/.test(w)) return parseInt(w, 10);
  const base = WEEK_WORDS.indexOf(w);
  return base >= 0 ? base : null;
}
// Returns the week number a title names, or null if it names none. The
// "twenty-one" suffix rides on the same match as "twenty" (see the regex's
// trailing `(?:[\s-]one)?` group) rather than a second capture group, so a
// bare "twenty" still resolves to 20 and "twenty-one"/"twenty one" both
// bump it to 21.
function parseWeekFromTitle(title) {
  const m = String(title || "").match(WEEK_TOKEN_RE);
  if (!m) return null;
  const whole = m[0].toLowerCase();
  const base = weekWordToNumber(m[1]);
  if (base === null) return null;
  return base === 20 && /twenty[\s-]one\b/.test(whole) ? 21 : base;
}
// Channels whose regular-season title format ALWAYS carries a week token, so
// a title with none is a different upload format entirely rather than a
// same-format title the week gate just can't see. TSN's current 2026 CFL
// cut is "CFL WEEK N: Away vs. Home | Full Highlights"; its own 2024/2025
// re-uploads are "Away vs. Home | CFL HIGHLIGHTS" with no week and no year,
// so without this a same-teams-different-season upload cleared the wrong-
// week hard-skip below (which — correctly, for NFL/NCAAF — leaves a
// no-week title untouched) and served a 2024 game for a 2026 query (wk6
// HAM@SSK, live; wk15 SSK@WPG, baked — 2026-09-22 QA). NFL/NCAAF are NOT
// listed: their postseason and some per-team-channel cuts genuinely carry no
// week, and that has to keep passing through untouched.
const WEEK_TOKEN_REQUIRED_CHANNELS = new Set(["tsn"]);

export default {
  async fetch(request, env, ctx) {
   try {
    const url = new URL(request.url);

    // --- iOS universal links. Served from the worker, NOT from public/, and
    // never as a redirect: Apple's CDN fetches this file itself and follows
    // neither a redirect nor an SPA 404 fallback, which is exactly why the path
    // 404'd for months while public/.well-known/assetlinks.json (Android, a
    // real .json file) served fine. An extensionless static file would also
    // land with the wrong Content-Type; Apple requires application/json.
    //
    // Team V45QZXMDAW + PRODUCT_BUNDLE_IDENTIFIER com.jacobhl.hidescore, both
    // read out of ios/App/App.xcodeproj/project.pbxproj. This file alone does
    // NOT enable universal links — the app must also carry the matching
    // com.apple.developer.associated-domains entitlement and ship a build.
    //
    // /auth/* is excluded so the Sign in with Apple / Google web callbacks stay
    // in the browser that started them; bouncing mid-flow into the app breaks
    // the handoff. /api/* is machine traffic and /.well-known/* must stay
    // fetchable by Apple and Google themselves.
    if (url.pathname === "/.well-known/apple-app-site-association" ||
        url.pathname === "/apple-app-site-association") {
      return new Response(JSON.stringify({
        applinks: {
          details: [{
            appIDs: ["V45QZXMDAW.com.jacobhl.hidescore"],
            components: [
              { "/": "/auth/*",        exclude: true },
              { "/": "/api/*",         exclude: true },
              { "/": "/.well-known/*", exclude: true },
              { "/": "/*" },
            ],
          }],
        },
      }), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "public, max-age=3600",
        },
      });
    }

    // --- Sign in with Apple (web) + cross-device preference sync. See the
    // SIWA_* helpers at the bottom of this file. These routes are inert until
    // the APPLE_* / SESSION_SECRET env vars are set (handlers 503 otherwise),
    // so deploying this is safe before the secrets are in place.
    if (url.pathname === "/auth/apple/login")    return siwaLogin(request, env, url);
    if (url.pathname === "/auth/apple/callback") return siwaCallback(request, env, url);
    if (url.pathname === "/auth/apple/native" && request.method === "POST") return siwaNative(request, env);
    if (url.pathname === "/auth/google/login")    return googleLogin(request, env, url);
    if (url.pathname === "/auth/google/callback") return googleCallback(request, env, url);
    if (url.pathname === "/auth/google/native" && request.method === "POST") return googleNativeComplete(request, env);
    if (url.pathname === "/auth/email/request" && request.method === "POST") return emailCodeRequest(request, env);
    if (url.pathname === "/auth/email/verify" && request.method === "POST") return emailCodeVerify(request, env);
    if (url.pathname === "/auth/logout")         return siwaLogout();
    if (url.pathname === "/api/me")              return siwaMe(request, env, ctx);
    if (url.pathname === "/api/prefs") {
      if (request.method === "PUT") return prefsPut(request, env, ctx);
      return prefsGet(request, env, ctx);
    }
    if (url.pathname === "/api/account" && request.method === "DELETE") return accountDelete(request, env);

    // --- "Add to calendar" (.ics) for the native wrapper. The web builds a
    // data:text/calendar download in the page (lib/calendarLink.ts), but
    // SFSafariViewController takes only http(s); this echoes the SAME text
    // back under text/calendar so iOS shows its Add-to-Calendar sheet. It is a
    // reflection of the caller's own text, bounded and typed: must be one
    // VCALENDAR, capped at 8 KB, served as an attachment with nosniff so no
    // browser will ever render it as markup.
    if (url.pathname === "/api/ics") {
      const t = url.searchParams.get("t") || "";
      if (t.length > 8192 || !/^BEGIN:VCALENDAR\r?\n/.test(t) || !/END:VCALENDAR\r?\n?$/.test(t) || /<|>/.test(t)) {
        return new Response("Bad calendar text", { status: 400 });
      }
      const uid = (t.match(/^UID:([A-Za-z0-9@._-]+)/m) || [])[1] || "event";
      const name = `hidescore-${uid.replace(/@.*$/, "")}.ics`;
      return new Response(t, {
        headers: {
          "Content-Type": "text/calendar; charset=utf-8",
          "Content-Disposition": `attachment; filename="${name}"`,
          "X-Content-Type-Options": "nosniff",
          "Cache-Control": "private, no-store",
        },
      });
    }

    // --- Bracket picks leaderboard (MLB postseason). See picksRoute below.
    if (url.pathname === "/api/picks") return picksRoute(request, env, ctx, url);

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
      // race=<a|b|c> → RACE GATE for motorsport (see RACE_TOKEN_ALIASES and
      // buildRaceTokens in src/lib/espn.ts). The channel gate alone is not
      // enough here: F1 / NASCAR / INDYCAR each upload to ONE official channel
      // all season, so when that channel has no reel for the race you asked
      // about, the matcher happily returns its most recent race reel instead.
      // Measured 2026-08-03 over all 50 completed 2026 races: 7 served the
      // WRONG race (Grand Prix of Illinois → Nashville, Bahrain GP →
      // Barcelona-Catalunya, Saudi GP → Hungarian, plus the four Daytona
      // speedweek exhibitions, which have no Cup reel at all). This is the
      // motorsport analogue of the golf-tournament and World Cup gates.
      const raceTokens = (url.searchParams.get("race") || "")
        .split("|").map((s) => normalizeRaceToken(s)).filter(Boolean);
      // comp=<a|b> → COMPETITION TITLE GATE (see compTitleMatches above and
      // COMPETITION_TITLE_TOKENS in src/lib/youtube.ts). Same shape as `race`,
      // one sport family over: the channel is right, the teams are right, the
      // year is right, and the COMPETITION is wrong.
      const compTokens = (url.searchParams.get("comp") || "")
        .split("|").map((s) => normalizeRaceToken(s)).filter(Boolean);
      // week=<n> → WEEK GATE for gridiron football (NFL / NCAAF regular season).
      // Same failure class as the race gate, one league down: the NFL channel
      // titles every recap "… Game Highlights | NFL 2025 Season Week 15" with
      // NO calendar date, so for a pair that meets twice in a season BOTH
      // uploads carry the same two teams and the same year — the date gate
      // can't fire (no date token) and the year gate agrees (same year). The
      // earlier upload then wins channelTeamsYearId just by ranking first.
      // Measured against the LIVE worker 2026-08-10 over the eight-game
      // Dec 14 2025 slate: 7/8 correct, and Commanders@Giants returned the
      // WEEK 1 recap of the same fixture. Week is the only discriminator the
      // title carries, so it has to be the gate.
      const weekParam = parseInt(url.searchParams.get("week") || "", 10);
      const queryWeek = Number.isFinite(weekParam) && weekParam >= 1 && weekParam <= 25 ? weekParam : null;
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

        // The game date as ms, for the upload-age gate (publishedBeforeGame).
        // Set only when the query carries a full "Mon D, YYYY" — GameCard
        // always sends one, golf/tournament queries do not, and those keep
        // today's behaviour.
        const queryGameMs = (queryYear && queryMonth && queryDay)
          ? Date.UTC(parseInt(queryYear, 10), queryMonth - 1, queryDay)
          : null;
        const ageGateNowMs = Date.now();

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
          // CFL — theScore's shortDisplayName (the query text) vs. TSN's own
          // spelling and typos in its upload titles. "B.C. Lions" (periods) is
          // TSN's house style against theScore's plain "BC Lions", so without
          // the punctuated variant every BC game read as no-teams-matched and
          // 404'd even though TSN had posted the recap (wk9 BC@WPG, measured
          // 2026-09-22). "Saskatechewan"/"Roughiders" are TSN's own typos
          // (extra "e", missing "r") reproduced verbatim so the real upload
          // still matches; both were seen live on different 2026 uploads.
          "bc lions": ["bc lions", "b.c. lions", "british columbia lions"],
          "saskatchewan roughriders": [
            "saskatchewan roughriders", "roughriders",
            "saskatechewan roughriders", "saskatchewan roughiders",
          ],
          "trail blazers": ["blazers", "trail blazers", "portland"],
          "timberwolves": ["timberwolves", "wolves", "minnesota"],
          "76ers": ["76ers", "sixers", "philadelphia"],
          // WNBA expansion clubs — ESPN's compact names vs official titles.
          "tempo": ["tempo", "toronto tempo", "toronto"],
          "valkyries": ["valkyries", "golden state valkyries", "golden state"],
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
          "red bull ny": ["red bull ny", "new york red bulls", "red bulls", "red bull new york"],
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
        const normalizeTeamMatch = (value) => String(value || "")
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/[‘’]/g, "'")
          .toLowerCase();
        const TEAM_VARIANT_INDEX = {};
        for (const variants of Object.values(TEAM_ALIASES)) {
          for (const v of variants) {
            TEAM_VARIANT_INDEX[normalizeTeamMatch(v)] = variants;
          }
        }
        function getTeamVariants(teamName) {
          const lower = normalizeTeamMatch(teamName);
          return TEAM_VARIANT_INDEX[lower] || TEAM_ALIASES[lower] || [lower];
        }

        function titleHasTeam(titleLower, teamName) {
          const variants = getTeamVariants(teamName);
          const normalizedTitle = normalizeTeamMatch(titleLower);
          if (variants.some((v) => normalizedTitle.includes(normalizeTeamMatch(v)))) return true;
          // Singular-nickname tolerance. Not hypothetical: the OFFICIAL NFL
          // channel's Week 15 recap of Dec 14 2025 is titled "Washington
          // Commanders vs New York Giant Game Highlights | 2025 NFL Season
          // Week 15" — singular "Giant", the league's own typo (verified
          // 2026-08-10). The plural never matched, so the CORRECT clip failed
          // hasTeams and fell out of every tier, and the Week 1 upload of the
          // same fixture — spelled correctly — took the slot instead. A title
          // typo on the one channel we trust must not be able to serve the
          // wrong game.
          //
          // Deliberately narrow: only a trailing "s" is forgiven, only on a
          // whole word, and only on variants of 5+ characters. The length floor
          // is what keeps the risky short nicknames out — "Jets"/"Rams"/"Nets"/
          // "Suns" would each strip to a common English word — while the
          // boundary check stops "Lions"→"lion" from matching "Lionel". In
          // practice the variant that fires here is the full "New York Giants",
          // which is unambiguous.
          if (variants.some((v) => {
            const n = normalizeTeamMatch(v);
            if (!n.endsWith("s") || n.length < 5) return false;
            const singular = n.slice(0, -1).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            return new RegExp(`(^|[^a-z0-9])${singular}([^a-z0-9]|$)`).test(normalizedTitle);
          })) return true;
          // Name-order tolerance for people, not clubs. ESPN's tennis feed
          // names Chinese players family-name-first ("Zheng Qinwen", "Wu
          // Yibing") while the US Open channel titles them given-name-first
          // ("Qinwen Zheng vs. Elena Rybakina Highlights | 2026 US Open
          // Quarterfinal", verified 2026-09-11). The substring test above can
          // never match the swapped order, so every card for such a player
          // strict-resolved to "No results" — four US Open R3+ cards wore an
          // empty highlight band. The channel is not consistent either (its
          // Round 1 cut is "Wu Yibing vs. Adam Walton"), so swapping is not
          // enough: accept a TWO-word name whose words both appear as whole
          // words anywhere in the title. Two words only — club names carry
          // the city/nickname shape ("New York Giants") that an any-order
          // match could pin on the wrong club, and no Eastern-order player
          // name ESPN emits has more than two words.
          return variants.some((v) => {
            const words = normalizeTeamMatch(v).split(/[^a-z0-9]+/).filter(Boolean);
            if (words.length !== 2 || words.some((w) => w.length < 2)) return false;
            return words.every((w) => {
              const esc = w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
              return new RegExp(`(^|[^a-z0-9])${esc}([^a-z0-9]|$)`).test(normalizedTitle);
            });
          });
        }

        // Split HTML into videoRenderer blocks and parse each one individually
        const blocks = html.split('"videoRenderer":{').slice(1);
        const videos = blocks.map((block) => {
          const idMatch = block.match(/^"videoId":"([a-zA-Z0-9_-]{11})"/);
          const titleMatch = block.match(/"title":\{"runs":\[\{"text":"(.*?)"\}/);
          const channelMatch = block.match(/"ownerText":\{"runs":\[\{"text":"(.*?)"/);
          const publishedMatch = block.match(/"publishedTimeText":\{"simpleText":"(.*?)"/);
          if (!idMatch) return null;
          if (excludeSet.has(idMatch[1])) return null;
          // Drop anything that cannot have been uploaded after this game.
          // Done here rather than per-tier so every tier — channelTeamsId
          // included, which is the one serving the wrong-season soccer cuts —
          // sees the same filtered list.
          if (publishedBeforeGame(publishedMatch ? publishedMatch[1] : "", queryGameMs, ageGateNowMs)) return null;
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
          // Tolerates YouTube's "A and B" co-upload byline — see
          // bylineNamesChannel. The oembed gate at the end still has the last word.
          const isFromChannel = bylineNamesChannel(channel, preferChannelLower);

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
          // WNBA sometimes publishes its normal 10-minute recap as only
          // "Team A vs. Team B | Month D, YYYY". It is still a highlight when
          // (and only when) the caller requested the strict WNBA channel; the
          // team/date gates below still have to match exactly.
          const isStrictBareWnbaRecap =
            strictChannelParam && isFromChannel && preferChannelLower === "wnba" && queryHasSpecificTeams;
          // Chess publishes NO highlight package at all — verified 2026-08-10
          // across every organizer that broadcasts on Lichess. What exists is
          // the round itself, posted as a full VOD titled "2026 Sinquefield
          // Cup: Round 1 | #GrandChessTour" or "… Almaty Diary, Day 5" — no
          // "highlights", no "recap" (Saint Louis last used that word in 2019).
          // Same shape as roundOnlyTitleOk for golf: accept a bare Round/Day
          // title, but ONLY on a strict request against a verified organizer
          // channel, so this can never widen any other sport's candidate pool.
          // The `race=` token gate still has to match the tournament name, and
          // SPOILER_RX still drops result-bearing titles ("… Wins Blitz
          // Playoff!") — this only relaxes the highlight-keyword requirement.
          const isChessRoundBroadcast =
            strictChannelParam &&
            isFromChannel &&
            CHESS_BROADCAST_CHANNELS.has(preferChannelLower) &&
            /\b(?:round|day|game|playoff|tiebreaks?)\s*\d/.test(titleLower);
          // The NFL channel titles its PRESEASON cuts without the word at all:
          // every 2026 exhibition is "Detroit Lions vs Indianapolis Colts |
          // 2026 Preseason Week 3" (measured 2026-09-06: 32 of 32 across Weeks
          // 1–3; only the Hall of Fame Game says "Highlights"). New in 2026 —
          // the 2025 cuts were "… Game Highlights | 2025 Preseason Week 2" —
          // and the regular season keeps "… Game Highlights | NFL 2025 Season
          // Week 15", so every preseason card went dark while the correct clip
          // sat at rank 1 of the very page this loop was reading. Same shape
          // as the WNBA bare-recap carve-out, one gate tighter: the caller has
          // to have ASKED for the preseason (`comp=preseason`, which
          // GameHighlights sends only for a Game.isPreseason card), so a
          // regular-season lookup can never widen to an exhibition, and the
          // comp gate below still has to agree. No trailing \b on purpose: the
          // league's own "Houston Texans vs. Carolina Panthers | 2026
          // PreseasonWeek 3" would otherwise be the one dark card of the slate.
          const isStrictBareNflPreseason =
            strictChannelParam &&
            isFromChannel &&
            preferChannelLower === "nfl" &&
            queryHasSpecificTeams &&
            compTokens.includes("preseason") &&
            /\bpreseason/.test(titleLower);
          // TSN doesn't always append "| Full Highlights" to a CFL cut — a
          // handful of uploads are titled just "CFL WEEK N: Away vs. Home"
          // with no highlight/recap keyword at all (wk9 EDM@SSK `eXrSguIPxd4`,
          // verified live 2026-09-22: title carries neither word, no other
          // channel or format difference from its "| Full Highlights" peers).
          // Requires the bare CFL house prefix AND the title's own week token
          // to agree with the query's — the same week token WEEK_TOKEN_REQUIRED
          // above already demands for TSN, computed once here and reused below.
          const titleWeek = parseWeekFromTitle(title);
          const isStrictBareCflWeek =
            strictChannelParam &&
            isFromChannel &&
            preferChannelLower === "tsn" &&
            queryHasSpecificTeams &&
            queryWeek !== null &&
            titleWeek === queryWeek &&
            /^cfl\s+week\b/i.test(titleLower.trim());
          const isHighlight =
            titleLower.includes("highlight") ||
            titleLower.includes("recap") ||
            (isWorldCupQuery && titleLower.includes("resumen")) ||
            isStrictBareCflWeek ||
            roundOnlyTitleOk ||
            isStrictBareWnbaRecap ||
            isChessRoundBroadcast ||
            isStrictBareNflPreseason;
          if (!isHighlight) continue;

          // Racing race gate (see the `race` param above). The official channel
          // posts one reel per race all season, so without this the F1 /
          // NASCAR / INDYCAR tile silently plays a DIFFERENT race whenever the
          // one you asked about has no reel. Same "better to 404 than serve the
          // wrong event" posture as the World Cup gate below — a rejected race
          // resolves to null and the tile hides its button.
          if (!raceTitleMatches(raceTokens, titleLower)) continue;

          // Competition gate (see the `comp` param above). Rejecting here hides
          // the button, which is the intended failure direction — an U20 match
          // rendered on a senior card would put a wrong scoreline on a card
          // whose entire promise is that it doesn't leak one.
          if (!compTitleMatches(compTokens, titleLower)) continue;

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
          // Wrong-week hard-skip (gridiron) — see the queryWeek note up top.
          // Deliberately shaped like the wrong-year skip above: a title whose
          // week token DISAGREES is dropped outright, a title carrying NO week
          // token falls through untouched to the existing date/year tiers. That
          // asymmetry is what keeps this safe for the uploads that don't use the
          // house format at all (postseason cuts are titled "Divisional Round",
          // never "Week N", and the client sends no week for them anyway).
          // "Week 15" / "Week15" / "Wk 15" / spelled-out "WEEK ONE"…"WEEK
          // TWENTY-ONE" are all accepted spellings — see parseWeekFromTitle.
          // WEEK_TOKEN_REQUIRED_CHANNELS flips the no-token case to a REJECT
          // for CFL (channel=TSN), the one channel whose no-week uploads are
          // a different, older season's format rather than a legitimately
          // week-less cut.
          if (queryWeek) {
            // titleWeek was already computed above for isStrictBareCflWeek.
            if (titleWeek !== null && titleWeek !== queryWeek) continue;
            if (titleWeek === null && WEEK_TOKEN_REQUIRED_CHANNELS.has(preferChannelLower)) continue;
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
          //     coast(?:s|ed)?|stroll(?:s|ed)?|glid(?:e|es|ed)|waltz(?:es|ed)?|roll(?:s|ed)?)[- ]?past — adds the
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
          //     "blow(?:s|n)?|blew" joins that group as its going-away/blowout-tempo
          //     member — "blow past" is the American-sports idiom for running clean
          //     away ("Mavericks blow past the Suns", "Cowboys blew past the Eagles",
          //     "the Bills were blown past"), and like "roll past" every form slipped
          //     the ease/power/breeze/coast/stroll/waltz/roll set and carries no digits.
          //     Same trailing "past" anchor keeps the common bare "blow" safe ("blow the
          //     lead", "blow a save", "blow-by-blow", "don't blow it" never fire, and
          //     "blow[- ]?outs?" still owns "blowout"); covers blow/blows/blown/blew, the
          //     -ing form left alone like roll's. Byte-identical to spoilers.ts.
          //     "glid(?:e|es|ed)" is the smooth-motion member of that group — the
          //     breeze/coast/waltz cousin tennis, motorsport and NBA recap titles use
          //     ("Alcaraz glides past Sinner", "Verstappen glided past Hamilton",
          //     "Celtics glide past the Nets") — a beaten side named with no digits.
          //     Same trailing "past" anchor keeps bare "glide" safe ("glide path",
          //     "hang gliding" never fire); covers glide/glides/glided, the -ing form
          //     left alone like breeze's. Byte-identical to spoilers.ts.
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
          //     "sunk" is the past participle the sink/sinks/sank set misses — the passive defeat reveal
          //     ("Arsenal sunk by a late Rodri goal", "Liverpool sunk at the death") that never reads the
          //     active "sank". Whole-word (\bsunk\b, so not "sunken"); "sunk cost"/"the ship sunk" never
          //     appear in per-match highlight titles and err over-hide-safe.
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
          //     "knock(?:s|ed|ing)[- ]?out|knock out" completes the knockout-elimination family (bow…out/
          //     crash…out/oust/eliminat): "knocked out" is the commonest WC/cup phrasing for going out ("Germany
          //     knocked out of the World Cup", "Argentina knocks out Brazil"), with no digits for SCORE_RX. The
          //     inflected form keeps its "(?:s|ed|ing)" so bare one-word "knockout"/hyphenated "knock-out" — the
          //     neutral schedule term ("knockout stage") — stays visible. The "knock out" alternative then adds
          //     the bare plural-present verb ("Spain knock out Germany") without reopening that collision, since
          //     it requires a literal SPACE (so "knockout"/"knock-out" still don't match). Byte-identical to
          //     spoilers.ts.
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
          //     "bundl(?:e|es|ed|ing)?[- ]?out" joins that same knockout-elimination family (bow…out/
          //     crash…out/dump…out/knock…out): "bundled out" is another stock British WC/cup phrasing for
          //     a side going out ("Germany bundled out of the World Cup", "holders bundled out on
          //     penalties"), carrying no digits for SCORE_RX and slipping past every sibling. Structured
          //     exactly like them — the inflection sits on the verb, so "(?:e|es|ed|ing)?" covers
          //     bundle/bundles/bundled/bundling while the required trailing "out" keeps the goal-mouth
          //     scramble senses "bundled home"/"bundled in" (no "out") from firing. No in-scope
          //     club/nation is named "Bundle", so any benign collision errs to the over-hide-is-safe
          //     side. Byte-identical to spoilers.ts.
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
          // season spans out. The separator class is [-–—:] (hyphen, en-dash,
          // em-dash, colon) so it also catches the colon scoreline European
          // soccer titles lean on ("Real Madrid 3:1 Barcelona") and the em-dash
          // form ("3—2") — both slipped past the hyphen/en-dash-only class. A
          // colon between two 1-3 digit runs is a score in a per-match title;
          // the 4-digit cap still drops "3: 2026" (2026 fails \d{1,3}\b), and a
          // skipped false-positive just falls back to the next source (the
          // over-hide-safe side the filter already embraces). Byte-identical to
          // spoilers.ts.
          const SCORE_RX = /(?<![-/])\b\d{1,3}\s*[-–—:]\s*\d{1,3}\b(?![-/])/;
          //     "book(?:s|ed)? (?:their|its|a|his|her) (?:place|spot|berth|ticket|passage)" is the canonical
          //     knockout qualification idiom WC / cup-tie coverage reaches for the instant a side goes
          //     through ("England book their place in the final", "Brazil booked their passage") — a pure
          //     advancement reveal carrying no digits (SCORE_RX misses it) that headlines phrase this way
          //     far more than they say "advance". The trailing place/spot/berth/ticket/passage requirement
          //     keeps the football sense of a bare "booked" (a yellow card) out. The "his|her" in the
          //     determiner set covers the individual-athlete framing the team-only (their|its) set missed —
          //     tennis/boxing/athletics/golf/swimming recaps phrase advancement about a person ("Djokovic
          //     books his place in the final", "Gauff books her spot in the semis") — and stays as safe:
          //     "took his place on the bench" has no "book", "book your tickets" uses "your". Byte-identical
          //     to spoilers.ts.
          //     "punch(?:es|ed)? (?:their|its|a|his|her) ticket" is the American sibling of the "book their
          //     ticket" idiom above — the phrase US playoff/tournament coverage reaches for the instant a
          //     side clinches ("Chiefs punch their ticket to the Super Bowl", "Duke punched its ticket to
          //     the Final Four", "Fury punches his ticket to a title shot") — a pure advancement reveal
          //     carrying no digits (SCORE_RX misses it). The required "(their|its|a|his|her) ticket" object
          //     keeps a bare boxing/UFC "punch" out. Byte-identical to spoilers.ts.
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
          //     "rampant" rides the same anchor, so the object is now "(?:riot|rampant)": "(?:runs?|running|ran)
          //     rampant" is the sibling blowout idiom the "run riot" entry missed ("Liverpool run rampant",
          //     "City ran rampant in a 5-0 win", "Mbappé runs rampant") — the same one-sided-win reveal, and
          //     "rampant" only ever completes this dominate-the-game phrase in a highlight title, with no
          //     in-scope club/nation named "Rampant", so it inherits the same near-zero false-positive risk.
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
          //     "share(?:s|d)? the honou?rs" is the third draw idiom beside "share the spoils"/"share the
          //     points": sharing the honours reports a drawn/split result ("Arsenal and City share the
          //     honours", "the sides shared the honours"). Distinct from "honou?rs even" already in the set
          //     (that needs the trailing "even"), anchored to "the honou?rs" so a lone share/honours never
          //     fires, and "honou?r" covers honours/honors. No digits for SCORE_RX. Byte-identical to spoilers.ts.
          //     "(?:claim|take|took) the honou?rs" is the WINNING-side counterpart: taking/claiming the honours
          //     means a side WON (sibling of "(?:claim|take|took) the spoils"), as derby/motorsport recaps say
          //     ("Rangers take the honours in the derby", "Hamilton takes the honours at Silverstone"). Pinned
          //     to the claim/take/took verb before "the honou?rs", so "do the honours"/"guard of honour"/"New
          //     Year honours" never fire; carries no digits for SCORE_RX. Byte-identical to spoilers.ts.
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
          //     "peg(?:s|ged|ging)?[- ]?back" and "(?:pulls?|pulled|pulling|grabs?|grabbed|grabbing) (?:one|a
          //     goal|another) back" are the OTHER half of the comeback reveal — the trailing side scoring to
          //     cut the deficit, the mirror of the already-covered "claw…back". Staple soccer/cricket framing
          //     ("Real Madrid pegged back by Barca", "United pull one back", "Chelsea grabbed another back",
          //     "England pegged back to 2-2"): a lead was cut, the game is closer than the neutral title lets
          //     on, yet none carries "comeback"/"claw" or digits for SCORE_RX. "peg…back" is pinned to the
          //     comeback sense by the trailing "back" (finance's "pegged at" and "peg leg" have no "back").
          //     The pull/grab branch REQUIRES the object "one"/"a goal"/"another" before "back" so the bare
          //     cutback-cross idiom ("great pull-back from Messi", "pulls it back across goal") — an assist
          //     that reveals no result — stays untouched, catching only the comeback-goal form. Errs
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
          //     covers relegate/relegated/relegating/relegation at negligible false-positive risk.
          //     Promotion mirrors that season-outcome reveal, but a bare "promot\w*" over-hides
          //     ("promotional video"/"coach promoted to a role"), so it is caught in two anchored forms
          //     only: a result verb bound to the noun ("secure/earn/gain/confirm/achieve/complete/
          //     celebrate/seal/clinch/win promotion" — secure/earn/gain/… are not standalone win-verbs,
          //     so "Leeds secure promotion" had leaked), and "promoted/promotion to <division>" gated on
          //     a league/tier word (league/division/flight/tier/premier/championship/Serie A/Bundesliga/
          //     La Liga/Eredivisie), so "promoted to captain" and a boxing org's "promotion" stay
          //     visible. Byte-identical to spoilers.ts.
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
          //     "(?:goes|going|went|gone)[- ]the[- ]distance" is the OUTCOME sibling of the scorecard-
          //     decision entry above: a boxing/MMA bout that "goes the distance" reached the final bell
          //     with no stoppage, so a title saying so reveals the fight was NOT finished early — the same
          //     method-of-result leak the KO/TKO/submission/decision terms mask, told from the went-the-
          //     full-length angle ("Canelo goes the distance against Charlo", "Fury vs Usyk went the
          //     distance", "gone the distance for the first time"). Carries no digits for SCORE_RX and
          //     matched no existing token. Scoped to the four completed-result forms goes/going/went/gone
          //     on purpose so the bare-infinitive PREVIEW form never fires — "Can Fury go the distance?"/
          //     "Will he go the distance tonight?" ask an open question and must pass through, the same
          //     tight scoping the "qualify" note keeps. "the distance" must follow immediately, so "goes
          //     the extra distance"/"long-distance"/"the full distance" never match. Byte-identical to
          //     spoilers.ts.
          //     "(?:puts?|putting)[- ]...[- ]to[- ]sleep" is the combat-slang KO reveal that sits beside the
          //     stoppage/decision cluster above: a fighter "put to sleep" was knocked cold or choked
          //     unconscious, the most literal finish there is, yet the phrasing carries no digits for
          //     SCORE_RX and no existing token ("Khabib puts McGregor to sleep", "Ngannou put Gane to
          //     sleep", "Poirier put to sleep"). The one benign homograph is the boredom idiom "put the
          //     fans/crowd to sleep", so the {0,3}-word object slot is fenced with a negative lookahead that
          //     refuses the audience nouns/pronouns that idiom always takes (fans/crowd/viewers/spectators/
          //     everyone/us/me/you/em/them) — a KO names the opponent (a proper name or him/her), never the
          //     audience — while "to sleep" must follow the object immediately, so "sleeps 8"/"the city that
          //     never sleeps"/"sleepwalk" never match. Byte-identical to spoilers.ts.
          //     "whitewash\w*" catches the clean-sweep / comprehensive-defeat framing tennis, cricket and
          //     aggregate-tie recaps lean on ("Argentina whitewash Brazil", "India whitewashed 3-0",
          //     "a series whitewash") — a result that names the side that lost every game/set, yet its
          //     bare-verb present tense ("X whitewash Y") slipped past the sibling "sweep\w*|swept" entry
          //     beside it and carries no digits when phrased without a scoreline. In a sports-title context
          //     "whitewash" means nothing but a one-sided sweep (the literal paint/cover-up sense never
          //     appears in a highlight or headline feed, and no in-scope team is named anything beginning
          //     with it), so the trailing \w* covers whitewash/whitewashes/whitewashed/whitewashing at the
          //     same negligible false-positive risk as the sweep/rout family. Byte-identical to spoilers.ts.
          //     "clos(?:e|es|ed|ing)[- ]?out(?: the| a| their| its)? series" catches the playoff series-clinch
          //     framing NBA/NHL/MLB recaps lead with ("Celtics close out the series in Game 5", "Panthers closing
          //     out the series", "Dodgers closed out series") — to close out a series is to WIN it and eliminate the
          //     other side, a decisive reveal that carries no digits for SCORE_RX and slipped past the sibling
          //     "sweep\w*|whitewash\w*" entries beside it (a series win need not be a sweep). Deliberately anchored to
          //     the object "series" — the one sense in which "close out" can only mean winning — so the everyday
          //     senses that DO appear on a sports channel are all left untouched: the defensive "close out on a
          //     shooter" drill, a "season close out" roundup and a "close out the year" retrospective have no
          //     "series" after "out" and never match. The (?: the| a| their| its)? covers the article/possessive
          //     forms and the bare "close out series"; the leading clos(?:e|es|ed|ing) covers close/closes/closed/
          //     closing. Byte-identical to spoilers.ts.
          //     ── Cricket (added 2026-08-03 with the IPL column) ──
          //     Cricket states its results in vocabulary no other sport uses, so ten of the commonest IPL
          //     result headlines walked straight through the filter above. Measured before this block:
          //     "Mumbai Indians all out for 98", "Gujarat Titans bowled out for 155", "Chennai chase down
          //     201", "Rajasthan chased 210", "Super Over drama", "SRH post 277 for 3", "RCB 161/5",
          //     "Titans defend 155" and "Punjab skittled for 88" all PASSED. Each of them names the result.
          //     Every term here is deliberately narrower than its natural phrasing, because this regex also
          //     runs against NFL/NBA/soccer titles:
          //       "bowl(?:s|ed|ing)[- ]?out" REQUIRES a verb suffix. The bare "bowl out" would fire on
          //         "Super Bowl out of reach for the Jets" — the [- ]? also matches a space. Cricket only
          //         ever says bowled/bowls/bowling out, so demanding the suffix costs nothing.
          //       "defend(?:s|ed|ing)? \d{2,3}" and "chas(?:e|es|ed) \d{2,3}" REQUIRE the digits, so
          //         "Chiefs defending champions" and "Curry chasing history in Game 5" stay clean.
          //       "\d{2,3}\/(?:10|\d)" is the runs/wickets notation. The 2-3 digit head and the 0-10
          //         wicket tail are what keep US date formats out: "12/25" fails the wicket group and
          //         "5/31" fails the runs group, so neither a schedule nor a game-time headline trips it.
          //       "\d{2,3} for \d" is the spoken form of the same score ("277 for 3"); the 2-3 digit head
          //         keeps a basketball shooting line like "5 for 12" out.
          //     "all[- ]?out for", "super[- ]?over" (which reveals a tie), "five[- ]?for", "fifer",
          //     "wicket haul" and "skittl\w*" carry no non-cricket sense in a sports feed at all.
          //     Verified against a 24-case battery (10 cricket results blocked, 14 non-spoiler headlines
          //     still passing, including the Super Bowl and date-format traps). Byte-identical to the
          //     worker's copy.
          const SPOILER_RX = /\b(walk[- ]?off|walk(?:s|ed|ing)?[- ]?it[- ]?off|buzzer[- ]?beaters?|comeback|(?:come|comes|came)[- ]from[- ]behind|(?:complet(?:e|es|ed|ing)|stag(?:e|es|ed|ing)|mount(?:s|ed|ing)?|produc(?:e|es|ed|ing)|orchestrat(?:e|es|ed|ing)|pull(?:s|ed|ing)?[- ]?off)(?:[- ][\w'’-]+){0,3}?[- ]turnarounds?|(?:come|comes|came)[- ]from(?:[- ](?:an?|\d{1,2}|one|two|three|four|five|six))?(?:[- ](?:goals?|sets?|points?|runs?|scores?))?[- ]down\b|(?:storm|roar|claw)(?:s|ed|ing)?[- ]?back|battl(?:e|es|ed|ing)[- ]?back|peg(?:s|ged|ging)?[- ]?back|(?:pulls?|pulled|pulling|grabs?|grabbed|grabbing) (?:one|a goal|another) back|fight(?:s|ing)?[- ]?back|fought[- ]?back|rall(?:y|ies|ied|ying) (?:past|back|from)|(?:overturn(?:s|ed|ing)?|overhaul(?:s|ed|ing)?|wip(?:e|es|ed|ing)[- ]?out|eras(?:e|es|ed|ing))(?: [\w'’-]+){0,4}? deficit|(?:cut(?:s|ting)?|halv(?:e|es|ed|ing)|reduc(?:e|es|ed|ing)|trim(?:s|med|ming)?|slash(?:es|ed|ing)?)(?: [\w'’-]+){0,3}? (?<!(?:budget|trade|fiscal|spending|wage|wages|federal|national|structural) )deficit|extra[- ]?innings?|overtime|extra[- ]?time|sudden[- ]?death|golden[- ]?(?:goals?|points?)|stun|stuns|stunned|stunning|stunner|shock|shocks|shocked|shocking|crush\w*|outlast\w*|outclass\w*|outplay\w*|overpower\w*|overwhelm\w*|outgun\w*|outmuscl\w*|outduel\w*|outscor\w*|outpoint\w*|outbox\w*|outfight\w*|outfought|prevail\w*|surviv\w*|relegat\w*|(?:secur\w*|earn\w*|seal\w*|clinch\w*|gain\w*|confirm\w*|achiev\w*|complet\w*|celebrat\w*|win|won)(?:[- ][\w'’-]+){0,3}?[- ]promotion\b|promot(?:ed|ion)[- ](?:to|into|back[- ]to|straight[- ]back[- ]to)[- ](?:the[- ])?(?:[\w'’-]+[- ]){0,3}?(?:league|division|flight|tier|premier|championship|serie[- ]a|bundesliga|la[- ]liga|eredivisie)|overcome|overcomes|overcoming|overcame|dominat\w*|dominant(?:ly)?|defeat\w*|beat\w*|edge\w*|pip(?:s|ped|ping)?|dispatch\w*|(?:takes?|taking|took) down|sinks?|sank|sunk|(?<!ups and )downs|downed|holds?[- ]?off|held[- ]?off|hold(?:s|ing)?[- ]?on|held[- ]?on|hang(?:s|ing)?[- ]?on|hung[- ]?on|(?:cling(?:s|ing)?|clung)[- ]?on|(?:cling(?:s|ing)?|clung)[- ]?to (?:a |an |the |their |his |her |its )?(?:[\w'’-]+ )?(?:win|victory|lead|advantage|points?|result)|(?:hold(?:s|ing)?|held)[- ]out[- ]for (?:a |an |the |their )?(?:[\w'’-]+ )?(?:win|victory|draw|points?|result|lead)|escap(?:e|es|ed|ing)[- ]with (?:a |an |the |their )?(?:[\w'’-]+ )?(?:win|victory|draw|points?|result)|(?:hold(?:s|ing)?|held)[- ](?:their|his|her|its)[- ]nerve|(?:sees?|saw|seen|seeing) out (?:a |an |the )?(?:[\w-]+ )?(?:win|victory|result|points?|lead)|sees?[- ]?off|saw[- ]?off|fends?[- ]?off|fended[- ]?off|rout|routs|routed|top(?:s|ped)|toppl\w*|trounc\w*|demoli(?:sh\w*|tions?)|destroy\w*|dismantl\w*|humiliat\w*|embarrass\w*|capitulat\w*|choke\w*|collaps\w*|obliterat\w*|annihilat\w*|decimat\w*|vanquish\w*|pulveri[sz]\w*|thrash\w*|thump\w*|pummel\w*|steamroll\w*|drub\w*|smash\w*|wallop\w*|spank\w*|maul\w*|clobber\w*|shellac\w*|overrun\w*|overran|nil(?:led|ling)|brush(?:es|ed|ing)?[- ]?aside|swat(?:s|ted|ting)?[- ]?aside|(?:runs?|running|ran) (?:riot|rampant)|(?:runs?|running|ran)[- ]?away[- ]?with|(?:runs?|running|ran) rings (?:a)?round|to the sword|(?:tak(?:e|es|ing)|took|claim(?:s|ed|ing)?)[- ]?(?:the[- ]?)?che(?:ck|qu)ered[- ]?flag|cross(?:es|ed|ing)?[- ]?(?:the[- ]?)?(?:finish[- ]?)?line[- ]?first|podium[- ]?finish(?:es)?|(?:laps|lapped|lapping)[- ]the[- ]field|wire[- ]to[- ]wire|hammer(?:ed|ing)|batter(?:ed|ing)|cruise(?:s|d)?|canter(?:s|ed|ing)?|pull(?:s|ed|ing)?[- ]?away|pull(?:s|ed|ing)?[- ]?clear|(?:makes?|made|making) (?:light|hard|short) work of|prov(?:e|es|ed|ing) too (?:strong|good|much)|(?:ha(?:ve|s|d)|having) too much (?:class |quality |firepower |pace |power |strength )?for|too (?:good|strong) for(?! (?:words|comfort)\b)|(?:gets?|getting|got) the better of|(?<!\bto )(?:get(?:s|ting)?|got)[- ]one[- ]over[- ]on\b|(?:(?:gets?|getting|got) the )?job done|(?:gets?|getting|got) over the line|put(?:s|ting)?[- ]?(?:the |this |that )?(?:game|tie|match|contest|result|series|final|derby|affair)s? to bed|put(?:s|ting)?[- ]?(?:the |this |that )?(?:game|tie|match|contest|result|series|final|derby)s? away|(?<!\b(?:the|on|onto|hit|hits|hitting)[- ])\bic(?:e|es|ed|ing)[- ](?:the[- ])?(?:game|match|win|victory|contest|result)|put(?:s|ting)?[- ](?:it[- ]on[- ]ice\b|(?:the|this|that|their)[- ](?:[\w'’-]+[- ])?(?:game|match|tie|contest|result|series|win|victory|lead)[- ]on[- ]ice\b)|put(?:s|ting)?[- ]?(?:the |this |that |it |a |an )?(?:[\w'’-]+ )?(?:beyond (?:all )?(?:doubt|reach)|out of (?:sight|reach))|(?:grind(?:s|ing)?|ground)[- ]?out (?:a |an |the )?(?:win|victory|result|draw|points?)|ek(?:e|es|ed|ing)[- ]?out (?:a |an |the )?(?:win|victory|result|draw|points?)|(?:eas(?:e|es|ed)|power(?:s|ed)?|breez(?:e|es|ed)|coast(?:s|ed)?|sail(?:s|ed)?|stroll(?:s|ed)?|glid(?:e|es|ed)|waltz(?:es|ed)?|roll(?:s|ed)?|blow(?:s|n)?|blew|battl(?:e|es|ed|ing)|grind(?:s|ing)?|ground|get(?:s|ting)?|got)[- ]?past|(?:sneak(?:s|ed)?|snuck|slip(?:s|ped)?|squeez(?:e|es|ed))[- ]?past|squeak(?:s|ed|ing)?[- ]?(?:past|by|through)|scrap(?:e|es|ed|ing)[- ]?(?:past|by|through)|(?:put(?:s|ting)?|stick(?:s|ing)?|stuck|slam(?:s|med|ming)?|bang(?:s|ed|ing)?|slot(?:s|ted|ting)?|rifle(?:s|d)?|fire(?:s|d)?|bur(?:y|ies|ied)) (?:\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten) past|(?:the|a|their)[- ](?:league[- ]|domestic[- ]|season(?:['’]s)?[- ])?double[- ]over\b|leapfrog(?:s|ged|ging)?|triumph\w*|romp\w*|conquer\w*|dethron\w*|reign(?:s|ed|ing)?[- ]supreme|(?:go|goes|going|went|gone)[- ]back[- ]?to[- ]?back\b(?![- ]?(?:games?|nights?|road|home|away|fixtures?|sets?|weekends?|weeks?|days?|matches|contests?|series|losses|defeats?|wins?|victories|outings?|starts?|clean[- ]?sheets?|shut[- ]?outs?))|(?:end(?:s|ed|ing)?|halt(?:s|ed|ing)?)(?:[- ][\w'’-]+){0,2}?[- ](?:their|its|his|her|[\w'’-]+['’]s)[- ](?:[\w'’-]+[- ])?reign\b|(?<!\bto )(?:gets?|getting|got|gains?|gaining|gained|exacts?|exacting|exacted|takes?|taking|took)(?:[- ][\w'’-]+){0,3}?[- ]revenge\b|(?<!\bto )aveng(?:e|es|ed|ing)\b|upset\w*|upend\w*|(?:spoil(?:s|ed|t|ing)?|ruin(?:s|ed|ing)?)[- ]?(?:the|their|[\w'’-]+['’]s)[- ]?(?:party|homecoming|return|debut|farewell|reunion|swan[- ]?song)|clinch\w*|seals?|sealed|snatch\w*|nick(?:s|ed|ing)?[- ]?(?:it|the (?:win|points?|lead|victory|title|tie)|an? (?:win|winner|point|victory|late (?:winner|goal))|all[- ]?three[- ]?points)|(?:steals?|stealing|stole|stolen)[- ]?(?:it|the (?:win|points?|lead|victory|title|tie)|an? (?:win|winner|point|victory|late (?:winner|goal))|all[- ]?three[- ]?points)|shad(?:e|es|ed|ing)[- ](?:it|(?:the|this|that)[- ](?:[\w'’-]+[- ])?(?:set|sets|game|games|frame|frames|leg|legs|round|rounds|opener|decider|contest|match|tie|fight|bout|series|final))|sweep\w*|swept|whitewash\w*|clos(?:e|es|ed|ing)[- ]?out(?: the| a| their| its)? series|oust\w*|eliminat\w*|bow(?:s|ed|ing)?[- ]?out|crash(?:es|ed|ing)?[- ]?out|dump(?:s|ed|ing)?[- ]?out|bundl(?:e|es|ed|ing)?[- ]?out|(?:knock|dump|bundl|boot)\w* (?:[\w'’.-]+ ){1,4}out of (?:the |their |any |all )?(?:[\w'’.-]+ ){0,2}(?:cup|competition|tournament|tourney|play[- ]?offs?|post[- ]?season|semi[- ]?finals?|semis?|quarter[- ]?finals?|quarters?|world[- ]?cup|champions[- ]?league|europ[ae]|last[- ]?(?:32|16|8|4|sixteen|eight|four)(?!\s+(?:third|minutes?|mins?|seconds?|secs?|games?|matches|weeks?|days?|overs?|balls?|laps?|holes?|rounds?|innings?|men|places?)))|knock(?:s|ed|ing)[- ]?out|knock out|knock(?:s|ed|ing)? off|(?:sends?|sent)(?:[- ][\w'’-]+){0,3}?[- ]packing\b|qualif(?:y|ies|ied)|advanc\w*|(?<!(?:season|campaign|tournament|competition|time|show|world|life|year|band|war|army|parade|fans?|supporters?|crowd|faithful)[- ])\bmarch(?:es|ed|ing)?[- ]on\b(?![- ]?(?:to|toward|towards|together)\b)|book(?:s|ed)? (?:(?:their|its|a|his|her) (?:place|spot|berth|ticket|passage)|(?:place|spot|berth|passage))|book(?:s|ed)? (?:(?:their|its|a|his|her)[- ])?(?:(?:grand[- ]?)?final|semi[- ]?finals?|semis?|quarter[- ]?finals?|quarters?|last[- ]?(?:32|16|8|4|sixteen|eight|four)|play[- ]?offs?)[- ](?:place|spot|berth|passage)|punch(?:es|ed)? (?:their|its|a|his|her) ticket|reach(?:es|ed|ing)? (?:the )?(?:finals?|semi[- ]?finals?|semis?|quarter[- ]?finals?|quarters?|last[- ]?(?:32|16|8|4|sixteen|eight|four)(?!\s+(?:third|minutes?|mins?|seconds?|secs?|games?|matches|weeks?|days?|overs?|balls?|laps?|holes?|rounds?|innings?|men|places?)))(?!\s+third)|through to (?:the )?(?:finals?|semi[- ]?finals?|semis?|quarter[- ]?finals?|quarters?|last[- ]?(?:32|16|8|4|sixteen|eight|four)(?!\s+(?:third|minutes?|mins?|seconds?|secs?|games?|matches|weeks?|days?|overs?|balls?|laps?|holes?|rounds?|innings?|men|places?)))(?!\s+third)|into (?:the )?(?:finals?|semi[- ]?finals?|semis?|quarter[- ]?finals?|quarters?|last[- ]?(?:32|16|8|4|sixteen|eight|four)(?!\s+(?:third|minutes?|mins?|seconds?|secs?|games?|matches|weeks?|days?|overs?|balls?|laps?|holes?|rounds?|innings?|men|places?)))(?!\s+third)|progress(?:es|ed|ing)? (?:to |into |through to )?(?:the )?(?:finals?|semi[- ]?finals?|semis?|quarter[- ]?finals?|quarters?|last[- ]?(?:32|16|8|4|sixteen|eight|four)(?!\s+(?:third|minutes?|mins?|seconds?|secs?|games?|matches|weeks?|days?|overs?|balls?|laps?|holes?|rounds?|innings?|men|places?)))(?!\s+third)|(?:reach(?:es|ed|ing)?|through to|progress(?:es|ed|ing)?(?: to| into| through to)?|(?:eas(?:e|es|ed)|breez(?:e|es|ed)|glid(?:e|es|ed)|sail(?:s|ed)?|waltz(?:es|ed)?|stroll(?:s|ed)?|coast(?:s|ed)?|saunter(?:s|ed)?|power(?:s|ed)?|storm(?:s|ed)?) into) (?:the )?next round(?! of (?:talks|negotiations|funding|fundraising|voting|votes?|interviews?|applications?|layoffs?|redundancies|job cuts|tariffs?|sanctions?|testing|tests?|fixtures|games|matches))|set(?:s|ting)?[- ]?up (?:a |an |the |their |his |her |its )?(?:[\w'’-]+ ){0,3}?(?:(?:(?:grand[- ]?)?final|semi[- ]?finals?|semis?|quarter[- ]?finals?|quarters?|last[- ]?(?:32|16|8|4|sixteen|eight|four))(?: (?:showdown|clash|rematch|meeting|tie|decider|encounter))?|showdown|clash|rematch|tie|decider) (?:with|against|versus|vs)|crowned (?:world )?champions?|world[- ]?(?:cup[- ]?)?champions?|(?:lift|hoist)(?:s|ed|ing)? (?:the )?(?:[\w'’-]+ ){0,2}?(?:world[- ]?cup|trophy|cup\b|silverware)|(?:lift(?:s|ed|ing)?|hoist(?:s|ed|ing)?|rais(?:e|es|ed|ing)|captur(?:e|es|ed|ing)|(?:re)?claim(?:s|ed|ing)?|secur(?:e|es|ed|ing)|tak(?:e|es|ing)|took|win|wins|won|slip(?:s|ped)? on) (?:the |a |their )?(?:stanley[- ]?cup|claret[- ]?jug|green[- ]?jacket|larry[- ]?o['’]?brien(?: trophy)?|lombardi(?: trophy)?|wanamaker(?: trophy)?|commissioner['’]?s trophy)|(?:re)?claim(?:s|ed|ing)? (?:the )?(?:title|crown|trophy|championship|pennant|silverware)|(?:(?:re)?claim(?:s|ed|ing)?|tak(?:e|es|ing)|took|secur(?:e|es|ed|ing)|captur(?:e|es|ed|ing)|land(?:s|ed|ing)?|bag(?:s|ged|ging)?|pocket(?:s|ed|ing)?|scoop(?:s|ed|ing)?|lift(?:s|ed|ing)?|hoist(?:s|ed|ing)?)(?:[- ][\w'’-]+){0,3}?[- ](?:title|crown)s?(?!\s*(?:of|bout|fight|clash|race|shot|tilt|eliminator|showdown|decider|defen[cs]e|picture|hopes|challenge|contention|contenders?|holders?|hopefuls?|dream|charge|push|bid|run[- ]?in|jewel|hunt|chase|aspirations?|ambitions?|credentials?|favou?rites?|odds|pedigree))|(?:storm|surg|roar|power|march|charg|dash|sprint|glid|blaz|thunder|romp|waltz|saunter|canter|roll|bulldoz|eas|breez)(?:e|es|ed|ing|s)?[- ]to (?:the |a |an |their |his |her |its )?(?:title|crown|championships?|scudetto|pennant|glory|three[- ]?peat)(?!\s*(?:bout|fight|clash|race|shot|tilt|eliminator|showdown|decider|defen[cs]e|picture|hopes|challenge|contention|contenders?|holders?|hopefuls?|dream|charge|push|bid|run[- ]?in))|wrap(?:s|ped|ping)?[- ]?up (?:the |a |an |their )?(?:[\w'’-]+ ){0,2}?(?:title|crown|trophy|championship|pennant|silverware|scudetto|series|sweep|win|victory)|(?:claim|claims|claimed|claiming|take|takes|taking|took|secure|secures|secured|grab|grabs|grabbed|bag|bags|bagged|scoop|scoops|scooped|strike|strikes|struck) (?:the |a |an )?(?:gold|silver|bronze)(?!\s*coast)(?:[- ]?medals?)?(?![-\w])|(?:captur(?:es|ed|ing)|unif(?:ies|ied|ying)|wrest(?:s|ed|ing)|rip(?:s|ped|ping)|strip(?:s|ped|ping)|(?:re)?claim(?:s|ed|ing)|lift(?:s|ed|ing)|hoist(?:s|ed|ing)|snatch(?:es|ed|ing))[- ](?:the[- ]|a[- ]|his[- ]|her[- ]|their[- ])?(?:[\w'’-]+[- ]){0,2}?belts?\b|(?:end|ends|ended|ending|snap|snaps|snapped|snapping|halt|halts|halted|halting|break|breaks|breaking|broke|broken)(?:\s+[\w'’.-]+){0,3}?\s+(?:unbeaten|unbeatable|winless|perfect|flawless)[- ]?(?:run|streak|start|record)|(?:unbeaten|unbeatable|winless|perfect|flawless)[- ]?(?:run|streak|start|record)(?:\s+[\w'’.-]+){0,2}?\s+(?:ends?|ended|ending|over|snapped|halted|broken|done)|(?:end|ends|ended|ending|snap|snaps|snapped|snapping|halt|halts|halted|halting|break|breaks|breaking|broke|broken)(?:\s+[\w'’.-]+){0,3}?\s+drought\b|drought(?:\s+[\w'’.-]+){0,2}?\s+(?:ends?|ended|ending|over|snapped|halted|broken)|(?:end|ends|ended|ending|snap|snaps|snapped|snapping|halt|halts|halted|halting|break|breaks|breaking|broke|broken)(?:\s+[\w'’.-]+){0,3}?\s+skid\b|(?:makes?|making|made)[- ]it[- ](?:\d{1,2}|two|three|four|five|six|seven|eight|nine|ten)[- ](?:in[- ]a[- ]row|straight|on[- ]the[- ](?:trot|bounce|spin))|(?:go(?:es|ing)?|went|gone|mov(?:e|es|ed|ing)|climb(?:s|ed|ing)?|jump(?:s|ed|ing)?|leap(?:s|ed|t|ing)?|ris(?:e|es|ing)|rose|risen|surg(?:e|es|ed|ing)|storm(?:s|ed|ing)?|vault(?:s|ed|ing)?|shot|sit(?:s|ting)?|sat|stay(?:s|ed|ing)?|remain(?:s|ed|ing)?|return(?:s|ed|ing)?)[- ](?:back[- ])?(?:up[- ])?(?:to[- ](?:the[- ])?)?(?:joint[- ])?top[- ]of[- ](?:the[- ])?(?:table|league|standings|pile|tree|log|ladder|division|premier[- ]?league|championship|bundesliga|eredivisie|serie[- ]a|la[- ]liga|conference)|(?:go(?:es|ing)?|went|gone|mov(?:e|es|ed|ing)|climb(?:s|ed|ing)?|jump(?:s|ed|ing)?|leap(?:s|ed|t|ing)?|ris(?:e|es|ing)|rose|risen|surg(?:e|es|ed|ing)|storm(?:s|ed|ing)?|vault(?:s|ed|ing)?|shot|sit(?:s|ting)?|sat|stay(?:s|ed|ing)?|remain(?:s|ed|ing)?|return(?:s|ed|ing)?|reclaim(?:s|ed|ing)?)[- ](?:back[- ])?(?:up[- ])?(?:(?:to[- ])?top[- ]spot|(?:to[- ])?the[- ]summit|atop[- ](?:the[- ])?(?:table|league|standings|pile|division))|(?:doubl(?:e|es|ed|ing)|restor(?:e|es|ed|ing)|extend(?:s|ed|ing)?|stretch(?:es|ed|ing)?|increas(?:e|es|ed|ing))[- ](?:their|his|her|its|the)[- ]advantage|(?:\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten)[- ]points?[- ]clear\b|leads?|leaders?|winning|winners?|wins|won|win|victory|victories|victorious|victors|(?:match|game)[- ]?winn(?:er|ers|ing)|(?:comes?|came)[- ]?out on top|(?:ha(?:ve|s|d|ving)|got|get(?:s|ting)?) the last laugh|losing|lose|loses|lost|loss|(?:comes?|came)[- ]?up[- ]?short|(?:falls?|fell)[- ]?short|(?:falls?|fell)[- ]to(?![- ](?:(?:his|her|their|its|the)[- ])?(?:knees|feet|floor|ground|turf|pitch|deck|ice|canvas|mat|grass|dirt|mud|snow|earth|pieces|bits|silence)\b)|(?:go(?:es)?|going|went|gone)[- ]down[- ]to(?![- ](?:(?:the[- ])?(?:wire|last|earth)|(?:\d{1,2}|ten|nine|eight|seven|six)[- ]?men|injur\w*)\b)|succumb(?:s|ed|ing)?[- ]to(?![- ](?:a[- ]|an[- ]|the[- ]|his[- ]|her[- ]|their[- ]|its[- ])?(?:injur\w*|knock|strain|illness|disease|cancer|virus|infection|fever|wound\w*|pressure|nerves|fatigue|exhaustion|cramp\w*|temptation|heat|conditions|elements|hamstring|knee|ankle|groin|calf|thigh|quad\w*|shoulder|concussion|setback|problem)\b)|hat[- ]?tricks?|braces?|(?:scor(?:e|es|ed|ing)|net(?:s|ted|ting)?|slot(?:s|ted|ting)?|fir(?:e|es|ed|ing)|convert(?:s|ed|ing)?)[- ](?:twice|thrice|three[- ]times|four[- ]times)|(?:triple|double)[- ]?doubles?|no[- ]?hitter|perfect[- ]?games?|empty[- ]?net(?:s|ter|ters)?|shut[- ]?outs?|\d{1,3}[- ]?unanswered|unanswered[- ]?(?:points?|runs?|goals?|scores?|buckets?)|(?:\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten)(?:[- ](?:goals?|tries|try|points?|runs?|scores?|buckets?))? without (?:a |any )?reply|blow[- ]?outs?|shoot[- ]?outs?|straight[- ]?sets?|\b(?:break(?:s|ing)?|broke)[- ](?:back[- ]|the[- ]|[\w'’-]+['’]s[- ])?serve\b|\bbreaks?[- ]of[- ]serve\b|match[- ]?points?|\bserv(?:e|es|ed|ing)[- ]out[- ](?:a[- ]|an[- ]|the[- ]|his[- ]|her[- ]|their[- ])?(?:[\w'-]+[- ])?(?:set|match)\b(?![- ](?:ban|bans|suspension|suspensions))|on penalt(?:ies|y kicks)|goalless|scoreless|blank(?:s|ed|ing)|\d{1,2}[- ]?nil|nil[- ]?(?:\d{1,2}|nil|all)|clean[- ]?sheets?|deadlock\w*|stalemate\w*|(?<!\bwho[- ])open(?:s|ed|ing)[- ]the[- ]scoring|salvag\w*|rescu\w*|consolat\w*|(?:claim(?:s|ed|ing)?|tak(?:e|es|ing)|took) the spoils|(?:claim(?:s|ed|ing)?|tak(?:e|es|ing)|took) the honou?rs|(?:claim(?:s|ed|ing)?|tak(?:e|es|ing)|took|secur(?:e|es|ed|ing)|earn(?:s|ed|ing)?|grab(?:s|bed|bing)?|bag(?:s|ged|ging)?|pocket(?:s|ed|ing)?|collect(?:s|ed|ing)?|pick(?:s|ed|ing)?[- ]?up) (?:the )?maximum points|(?:tak(?:e|es|ing)|took|claim(?:s|ed|ing)?|grab(?:s|bed|bing)?|collect(?:s|ed|ing)?|pocket(?:s|ed|ing)?|scoop(?:s|ed|ing)?)[- ]the[- ]points\b|(?:claim(?:s|ed|ing)?|tak(?:e|es|ing)|took|earn(?:s|ed|ing)?)(?:[- ][\w'’-]+){0,3}?[- ]bragging[- ]?rights|bragging[- ]?rights(?:[- ][\w'’-]+){0,2}?[- ](?:go|goes|went|belong(?:s|ed)?)[- ]to|share(?:s|d)?(?: of)? the spoils|share(?:s|d)? the points|share(?:s|d)? the honou?rs|(?:spoils|points|honou?rs) (?:were |are |fairly |evenly |duly )?shared|a point (?:apiece|each)|\b(?:com(?:e|es|ing)|came)[- ]away[- ](?:with[- ](?:(?:just[- ]|only[- ]|merely[- ])?a[- ](?:single[- ])?point|the[- ]points|nothing)|empty[- ]?handed)\b(?![- ](?:to[- ]prove|to[- ]make))|honou?rs even|held to an? (?:[\w-]+ )?draw|(?:ends?|ended|ending) in an? (?:[\w-]+ )?draw|(?:ends?|ended|ending|finish(?:es|ed|ing)?)[- ](?:all[- ]|dead[- ]|honou?rs[- ])?level\b|play(?:s|ed|ing)?[- ]?out an? (?:[\w-]+ )?draw|(?:battl(?:e|es|ed|ing)|fight(?:s|ing)?|fought|grind(?:s|ing)?|play(?:s|ed|ing)?)[- ]to an? (?:[\w-]+ )?draw|settl(?:e|es|ed|ing)[- ]?(?:it\b|the[- ](?:tie|match|game|contest|series|final|derby|affair)s?)|settl(?:e|es|ed|ing) for (?:a|an|the) (?:draw|point|stalemate)|(?:mak(?:e|es|ing)|made) do with (?:a|an|the) (?:draw|point|stalemate)|(?:(?:ends?|ended|ending|finish(?:es|ed|ing)?) in|play(?:s|ed|ing)? to|settl(?:e|es|ed|ing) for) (?:an?|the) (?:[\w-]+ )?tie(?![-\w])|(?:grab(?:s|bed|bing)?|earn(?:s|ed|ing)?|secur(?:e|es|ed|ing)|pick(?:s|ed|ing)?[- ]?up) (?:a|an|the) (?:draw|point|stalemate)|(?:hard[- ]?fought|hard[- ]?earned|battling|gritty|spirited|creditable|dour|drab|gutsy|point[- ]?saving)[- ]draws?|all[- ]?square|restor(?:e|es|ed|ing)[- ]parity|equali[sz]\w*|level(?:l)?ers?|(?:draws?|drew|drawing)[- ]?level|level(?:s|led|ling)?[- ]?(?:it\b|things up|the (?:scores?|tie|match|contest|derby|affair|aggregate))|(?:even(?:s|ed|ing)?|squar(?:e|es|ed|ing)|t(?:ie|ies|ied|ying)|knot(?:s|ted|ting)?|level(?:s|led|ling|ed|ing)?)(?:[- ]up)?[- ]the[- ]series|(?:t(?:ie|ies|ied|ying)|knot(?:s|ted|ting)?|squar(?:e|es|ed|ing))(?:[- ]up)?[- ]the[- ](?:games?|scores?)|(?:tak(?:e|es|ing)|took|drop(?:s|ped|ping)?)[- ]the[- ]series|(?:claim(?:s|ed|ing)?|tak(?:e|es|ing)|took) (?:the )?rubber[- ]?(?:match|game)|forc(?:e|es|ed|ing)[- ](?:a[- ]|an[- ]|another[- ])?(?:deciding[- ]game|game[- ](?:\d{1,2}|five|seven)|decider)|\b(?:fires?|fired|firing|heads?|headed|heading|nods?|nodded|nodding|slots?|slotted|slotting|taps?|tapped|tapping|tucks?|tucked|tucking|curls?|curled|curling|rifles?|rifled|rifling|lashes?|lashed|lashing|prods?|prodded|prodding|pokes?|poked|poking|bundles?|bundled|bundling|steers?|steered|steering|volleys?|volleyed|volleying|sweeps?|swept|sweeping|puts?|putting) (?:[\w'’-]+[- ]){0,3}?(?:ahead(?![- ]of)|in[- ]front(?![- ]of)|(?:in)?to (?:a |an |the )?(?:\d[- ]?\d[- ])?lead)|\b(?:slots|slotted|slotting|taps|tapped|tapping|nods|nodded|nodding|rifles|rifled|rifling|curls|curled|curling|prods|prodded|prodding|pokes|poked|poking|bundles|bundled|bundling|lashes|lashed|lashing|tucks|tucked|tucking|volleys|volleyed|volleying|steers|steered|steering)[- ]home\b(?![- ](?:advantage|comforts?|form|ground|soil|crowd|faithful|support|supporters|fans|straight|record|debut|fixtures?))|go[- ]?ahead (?:goal|run|homer|home[- ]?run|score|basket|bucket|touchdown|header|strike|dunk|three|lay[- ]?up|jumper|try)s?|(?:last[- ]?gasp|last[- ](?:minute|second)|stoppage[- ]?time|injury[- ]?time|added[- ]?time|dying[- ](?:minutes|seconds|embers)|\d{1,3}(?:st|nd|rd|th)?[- ]minute|late)[- ](?:goals?|strikes?)\b(?![- ](?:line|kick|kicks|mouth|post|posts|scoring|scorer|scorers|keeper|keepers|difference|action))|own[- ]?goals?|worldies?|golazos?|wonder[- ]?goals?|screamers?|grand slam|send(?:s|ing)?[- ]?off|sent[- ]?off|sees?[- ]?red|saw[- ]?red|red card|marching[- ]orders|(?:reduc(?:e|es|ed|ing)(?:[- ][\w'’-]+){0,2}?|down)[- ]to[- ](?:nine|ten|9|10)[- ]men|all three points|(?:maiden|double|triple)[- ]centur(?:y|ies)(?!(?:\s+of|[- ]old)\b)|(?:hits?|smash(?:es|ed)|blast(?:s|ed)?|notch(?:es|ed)?|slam(?:s|med)?|crack(?:s|ed)?|rack(?:s|ed)?[- ]?up|brings?[- ]?up|brought[- ]?up|compil(?:e|es|ed))[- ](?:a[- ]|an[- ]|his[- ]|her[- ]|their[- ]|the[- ]|another[- ])?(?:[\w'’-]+[- ]){0,2}?centur(?:y|ies)(?!(?:\s+of|[- ]old)\b)|bowl(?:s|ed|ing)[- ]?out|all[- ]?out for|chas(?:e|es|ed|ing)[- ]?down|chas(?:e|es|ed) \d{2,3}\b|super[- ]?over|defend(?:s|ed|ing)? \d{2,3}\b|\d{2,3}\/(?:10|\d)\b|\d{2,3} for \d\b|five[- ]?for\b|fifer|wicket haul|skittl\w*|TKO|KOs?|KO'd|stops|stopped|def(?=\.)|retain(?:s|ed)|finish(?:es|ed)|flat[- ]?lin(?:e|es|ed|ing)|starch\w*|submission\w*|submit(?:s|ted|ting)|tap(?:s|ped|ping)?[- ]?out|(?:goes|going|went|gone)[- ]the[- ]distance|(?:puts?|putting)[- ](?:(?!fans|crowd|viewers|spectators|everyone|us|me|you|em|them)[\w'’.-]+[- ]){0,3}?to[- ]sleep|\b(?:sends?|sent|sending|put(?:s|ting)?|drops?|dropped|dropping|floor(?:s|ed|ing)?|crash(?:es|ed|ing)?|tumbl(?:e|es|ed|ing)|sink(?:s|ing)?|sank|sunk|slump(?:s|ed|ing)?|slip(?:s|ped|ping)?|flat|down)(?:[- ][\w'’-]+){0,3}?[- ](?:to|on|onto)[- ]the[- ]canvas\b|\b(?:hit|hits|hitting|kiss(?:es|ed|ing)?|meet(?:s|ing)?|met)[- ](?:the[- ])?canvas\b|\b(?:hand|arm)[- ]raised\b|(?:unanimous|split|majority)[- ]?decision)\b/i;
          // SPOILER_RX carries /i, so under [A-Z] means "any letter" and a team/score/team/score
          // alternative living there caught lowercase listicle titles too ("top 10 plays of week 2").
          // Kept as its own case-sensitive regex, byte-identical to spoilers.ts — it only means
          // anything when the two "teams" are genuinely capitalized proper names. Catches the
          // comma-or-space box score SCORE_RX's hyphenated form misses ("Grizzlies 110, Lakers 105",
          // "Lakers 105 Grizzlies 110").
          const TEAM_SCORE_RX =
            /\b([A-Z][\w.'-]+(?: [A-Z][\w.'-]+)*) (\d{1,3}),? ([A-Z][\w.'-]+(?: [A-Z][\w.'-]+)*) (\d{1,3})\b/;
          // A Title Case listicle/schedule headline ("Top 3 Storylines Heading Into Round 2",
          // "Ranking the Top 5 QBs After Week 6") still satisfies TEAM_SCORE_RX's shape even
          // case-sensitively, because every word in that kind of title is capitalized. None of
          // these words is ever a real team name, so a match naming one is rejected outright.
          const TEAM_SCORE_LISTICLE_WORDS = new Set([
            "Top",
            "Best",
            "Week",
            "Game",
            "Round",
            "Match",
            "Day",
            "Part",
            "Episode",
            "Vol",
            "Season",
          ]);
          const isTeamScoreSpoiler = (text) => {
            const m = text.match(TEAM_SCORE_RX);
            if (!m) return false;
            const [, team1, , team2] = m;
            const words = [...team1.split(" "), ...team2.split(" ")];
            return !words.some((word) => TEAM_SCORE_LISTICLE_WORDS.has(word));
          };
          // Official WC highlight titles sometimes include the final score
          // ("Argentina 3-2 Egypt") or neutral advancement language in the title.
          // The app never displays YouTube titles in the card, and the modal masks
          // the title chrome, so allow these only for official WC uploaders.
          const isOfficialWorldCupUpload = isWorldCupQuery && WC_OFFICIAL_CHANNELS.includes(channel.toLowerCase());
          const isMaskedOfficialCombatUpload =
            strictChannelParam && isFromChannel && MASKED_COMBAT_CHANNELS.has(preferChannelLower);
          if (
            !isOfficialWorldCupUpload &&
            !isMaskedOfficialCombatUpload &&
            (SCORE_RX.test(title) || SPOILER_RX.test(title) || isTeamScoreSpoiler(title))
          )
            continue;

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
        if (!videoId && !isGolfQuery && !queryHasSpecificTeams && raceTokens.length === 0 && compTokens.length === 0) {
          // Raw-regex fallback — only for non-golf. For golf we'd
          // rather return 404 than guess wrong and let a random
          // PGA TOUR highlight win the Masters slot.
          //
          // ⚠️ Racing is excluded for EXACTLY the same reason, added 2026-08-04
          // after the race gate above looked correct in isolation but changed
          // nothing in production. This fallback takes the first videoId in the
          // whole results page with no title check at all, so every candidate
          // the race gate had just rejected came straight back in through here
          // — and `strict=1` passed it, because the CHANNEL was right and only
          // the race was wrong. A query carrying race tokens has asked for a
          // specific event; if nothing matches it, 404 and hide the button.
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
                const publishedMatch = block.match(/"publishedTimeText":\{"simpleText":"(.*?)"/);
                // Same age gate as the main loop.
                if (publishedBeforeGame(publishedMatch ? publishedMatch[1] : "", queryGameMs, ageGateNowMs)) continue;
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
    // ── Chess: upcoming/live/finished elite broadcasts (Lichess) ────────────
    // Lichess DOES send `Access-Control-Allow-Origin: *`, so this proxy is not
    // strictly required — it exists to cache. Every browser hitting Lichess
    // directly would be a needless load on a free volunteer-funded service for
    // data that is identical for all users; one cached edge response is
    // neighbourly and faster. No key, no auth.
    //
    // `tier` does the curation: 5 = marquee (Grand Chess Tour, FIDE world
    // championships), 4 = strong international, 3 = local Swiss opens. Probed
    // 2026-08-03: 53 active broadcasts, of which only 8 were tier >= 4. Without
    // the filter the column is 45 rows of amateur weekend events.
    if (url.pathname === "/api/chess") {
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
      const MIN_TIER = 4;
      try {
        const res = await fetch("https://lichess.org/api/broadcast/top?nb=20", {
          // Lichess asks API consumers to identify themselves. A generic
          // browser UA is what gets projects rate-limited here.
          headers: { "User-Agent": "HideScore/1.0 (+https://hidescore.com)", Accept: "application/json" },
        });
        if (!res.ok) return corsJson({ events: [] }, 200, 60);
        const data = await res.json();
        const pick = (t, state) => {
          const tour = t?.tour || {};
          const round = t?.round || {};
          const info = tour.info || {};
          if ((tour.tier || 0) < MIN_TIER) return null;
          return {
            id: String(tour.id || ""),
            name: String(tour.name || ""),
            state,                                  // "in" | "pre" | "post"
            round: String(round.name || ""),
            startsAt: round.startsAt || (tour.dates && tour.dates[0]) || null,
            endsAt: (tour.dates && tour.dates[1]) || null,
            format: info.format || "",
            timeControl: info.tc || "",
            location: info.location || "",
            // Player list is a plain comma string on Lichess. It is NOT a
            // spoiler (it's the field, not the result) and it is the single
            // most useful "is this worth watching" signal a chess card has.
            players: String(info.players || "").split(",").map((s) => s.trim()).filter(Boolean),
            url: tour.url || (tour.slug && tour.id ? `https://lichess.org/broadcast/${tour.slug}/${tour.id}` : null),
            website: info.website || null,
            image: tour.image || null,
            tier: tour.tier || 0,
            // The round's own url + ongoing flag, so the client can prefer it
            // over the tour url (which points at the CURRENT round and leaks
            // finished-board results — see A7 / buildChessEventUrl in
            // src/lib/eventTiles.ts).
            roundUrl: round.url || null,
            ongoing: !!round.ongoing,
          };
        };
        const events = [];
        for (const [key, state] of [["active", "in"], ["upcoming", "pre"], ["past", "post"]]) {
          // ⚠️ `active` and `upcoming` are plain arrays but `past` is PAGINATED
          // — an object with the rows under `currentPageResults`. Iterating it
          // as an array throws and takes the whole endpoint down with it, so
          // normalize the shape rather than assuming. (Caught in testing
          // 2026-08-04, before deploy.)
          const raw = data?.[key];
          const list = Array.isArray(raw) ? raw : (raw?.currentPageResults || []);
          for (const t of list) {
            const row = pick(t, state);
            if (row && row.id && row.name) events.push(row);
          }
        }
        return corsJson({ events });
      } catch {
        return corsJson({ events: [] }, 200, 60);
      }
    }

    // ── Esports: elite matches across the big four titles (PandaScore) ──────
    // PANDASCORE_TOKEN is a Pages secret — must never reach the client.
    //
    // Two filters do all the work, and without them the column is unusable.
    // `tournament.tier` is PandaScore's own grading: measured 2026-08-04 over
    // 100 upcoming matches, tiers c+d were 78 of them (ESEA Advanced, Prime
    // League, LFL, "Road Of Legends") while s+a were the LCK, LPL and Esports
    // World Cup. And the title filter keeps this to the four games a
    // Western spoiler-avoiding audience actually follows on VOD — the raw feed
    // is heavy with Honor of Kings and KoG, which are China-market and were
    // outnumbering LoL in the tier-s rows.
    //
    // ?date=YYYY-MM-DD returns that day's matches (the board is date-driven);
    // omitted → upcoming. Matches are two-team with scores, so these map onto
    // the normal game card rather than an event tile.
    if (url.pathname === "/api/esports") {
      if (request.method === "OPTIONS") {
        return new Response(null, {
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, OPTIONS",
            "Access-Control-Max-Age": "86400",
          },
        });
      }
      const corsJson = (body, status = 200, maxAge = 300) =>
        new Response(JSON.stringify(body), {
          status,
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": `public, max-age=${maxAge}`,
            "Access-Control-Allow-Origin": "*",
          },
        });
      if (!env.PANDASCORE_TOKEN) return corsJson({ games: [], disabled: true }, 200, 300);
      const TITLES = ["league-of-legends", "cs-go", "cs2", "dota-2", "valorant"];
      const ALLOWED_TIERS = ["s", "a"];
      const date = url.searchParams.get("date");
      try {
        const qs = new URLSearchParams({ per_page: "100", sort: "begin_at" });
        const hasDate = /^\d{4}-\d{2}-\d{2}$/.test(date || "");
        if (hasDate) qs.set("range[begin_at]", `${date}T00:00:00Z,${date}T23:59:59Z`);
        // ⚠️ `/matches` with NO range is every match PandaScore has ever
        // recorded, and `sort=begin_at` is ascending — so the dateless call
        // returned the 2014 World Championship group stage. Only the dated form
        // may use /matches; without a date ask for /upcoming explicitly.
        // (Caught in testing 2026-08-04, before deploy.)
        const path = hasDate ? "matches" : "matches/upcoming";
        const res = await fetch(`https://api.pandascore.co/${path}?${qs}`, {
          headers: { Authorization: `Bearer ${env.PANDASCORE_TOKEN}`, Accept: "application/json" },
        });
        if (!res.ok) return corsJson({ games: [] }, 200, 120);
        const data = await res.json();
        const games = [];
        for (const m of Array.isArray(data) ? data : []) {
          const tier = (m?.tournament?.tier || "").toLowerCase();
          const slug = m?.videogame?.slug || "";
          if (!ALLOWED_TIERS.includes(tier) || !TITLES.includes(slug)) continue;
          const ops = (m.opponents || []).map((o) => o?.opponent).filter(Boolean);
          // Bracket placeholders ("TBD vs TBD") carry no opponents yet — a card
          // with no teams tells the user nothing, so drop rather than render it.
          if (ops.length < 2) continue;
          const results = m.results || [];
          const scoreFor = (id) => {
            const r = results.find((x) => x?.team_id === id);
            return r && r.score != null ? String(r.score) : "";
          };
          // PandaScore has no home/away for esports — it is a neutral-site
          // bracket. Slot 0 is treated as away purely so the card's existing
          // "A @ B" layout renders; nothing depends on the distinction.
          const [away, home] = ops;
          const status = m.status; // not_started | running | finished | canceled
          if (status === "canceled") continue;
          games.push({
            id: String(m.id),
            date: m.begin_at || m.scheduled_at || null,
            state: status === "finished" ? "post" : status === "running" ? "in" : "pre",
            bestOf: m.number_of_games || null,
            league: m?.league?.name || "",
            serie: m?.serie?.full_name || "",
            tier,
            title: slug,
            away: { id: String(away.id), name: away.name || "", acronym: away.acronym || "", image: away.image_url || "", score: scoreFor(away.id) },
            home: { id: String(home.id), name: home.name || "", acronym: home.acronym || "", image: home.image_url || "", score: scoreFor(home.id) },
            winnerId: m.winner_id != null ? String(m.winner_id) : null,
          });
        }
        return corsJson({ games });
      } catch {
        return corsJson({ games: [] }, 200, 120);
      }
    }

    // ── CFL: theScore's app API, reshaped to the ESPN scoreboard ───────────
    // ESPN stopped serving the CFL after 2023 (probed 2026-09-13: the calendar
    // is frozen at 2023 and every date returns 0 events), so the config-only
    // league recipe does not apply. theScore's undocumented app API
    // (api.thescore.com/cfl/…, CORS *, s-maxage=10 at Cloudflare) is the only
    // live free JSON source, and prebake-news already depends on this host for
    // the thescore-* feeds. The client keeps calling fetchGames → parseGame:
    // this route converts each theScore event into the ESPN scoreboard shape,
    // so every football behaviour (FOOTBALL_CLOSENESS rating, Q1–Q4/OT labels,
    // "End of 4th" settle, playoff flag, lookahead/lookback, the localStorage
    // cache, the standings chip) comes for free. Three routes:
    //   GET /api/cfl?dates=YYYYMMDD[-YYYYMMDD]  → { events: ScoreboardEvent[] }
    //   GET /api/cfl/standings                  → ESPN standings (one table + rank)
    //   GET /api/cfl/teams                      → ESPN core-API teams { items }
    // Always HTTP 200; `{ events: [] }` on any upstream failure like every
    // other JSON route here — fetchGames only distinguishes failure by res.ok,
    // so a worker 5xx would bypass the client's cache fallback.
    //
    // ⚠️ `rpp`: omit it or send rpp=200. The default returns everything in the
    // window (a whole season is ~90 events); rpp=50 truncates silently.
    if (url.pathname === "/api/cfl" || url.pathname === "/api/cfl/standings" || url.pathname === "/api/cfl/teams") {
      if (request.method === "OPTIONS") {
        return new Response(null, {
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, OPTIONS",
            "Access-Control-Max-Age": "86400",
          },
        });
      }
      const corsJson = (body, status = 200, maxAge = 300) =>
        new Response(JSON.stringify(body), {
          status,
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": `public, max-age=${maxAge}`,
            "Access-Control-Allow-Origin": "*",
          },
        });
      const SCORE = "https://api.thescore.com/cfl";
      const scoreFetch = (path) =>
        fetch(`${SCORE}${path}`, {
          headers: { "User-Agent": "HideScore/1.0 (+https://hidescore.com)", Accept: "application/json" },
        });
      // theScore team → ESPN competitor.team. shortDisplayName carries the FULL
      // name on purpose: TSN titles its recaps "CFL WEEK 15: Ottawa Redblacks
      // vs. Toronto Argonauts | Full Highlights", and GameHighlights + the
      // prebake build the YouTube query from shortDisplayName (16/16 clean on
      // Weeks 12–15 with full names, 2026-09-13).
      const toEspnTeam = (t) => ({
        id: String(t?.id ?? ""),
        abbreviation: String(t?.abbreviation || t?.short_name || ""),
        displayName: String(t?.full_name || t?.name || ""),
        shortDisplayName: String(t?.full_name || t?.name || ""),
        name: String(t?.name || ""),
        location: String(t?.location || ""),
        logo: t?.logos?.large || t?.logos?.w72xh72 || "",
        color: String(t?.colour_1 || "666666").replace(/^#/, ""),
      });
      const ordinal = (n) => `${n}${n === 1 ? "st" : n === 2 ? "nd" : n === 3 ? "rd" : "th"}`;
      const toEspnEvent = (ev) => {
        const home = ev?.home_team || {};
        const away = ev?.away_team || {};
        const box = ev?.box_score || null;
        const progress = box?.progress || {};
        const rawStatus = String(ev?.event_status || ev?.status || progress.status || "pre_game").toLowerCase();
        const segment = Number.isFinite(Number(progress.segment)) ? Number(progress.segment) : 0;
        const overtime = progress.overtime === true || segment > 4;
        const clock = String(progress.clock || "");
        const clockLabel = String(progress.clock_label || progress.string || "");
        // Season type follows ESPN's numbering (1 pre, 2 regular, 3 post) so
        // eventsToGames' preseason filter and parseGame's playoff flag apply.
        const gameType = String(ev?.game_type || "");
        const seasonType = /exhibition|pre/i.test(gameType) ? 1 : /playoff|post/i.test(gameType) ? 3 : 2;
        // Regular-season week only — the postseason reuses the numbering, and
        // TSN titles those by round, never by week (see gridironWeekNumber).
        const weekMatch = String(ev?.season_week || "").match(/-(\d{1,2})$/);
        const week = seasonType === 2 && weekMatch ? Number(weekMatch[1]) : (seasonType === 2 && Number.isFinite(Number(ev?.week)) ? Number(ev.week) : null);
        let state = "pre", name = "STATUS_SCHEDULED", completed = false, detail = "";
        if (rawStatus === "final") {
          state = "post"; name = "STATUS_FINAL"; completed = true;
          detail = overtime ? "Final/OT" : "Final";
        } else if (rawStatus === "in_progress") {
          state = "in"; name = "STATUS_IN_PROGRESS";
          // Live strings are unverified until the first live window (Fri
          // 2026-09-18 23:30Z MTL@HAM). Map defensively onto ESPN's shapes:
          // "Halftime" / "End of 2nd" / "8:32 - 2nd", which liveProgress reads.
          const nth = segment <= 4 ? ordinal(segment) : segment === 5 ? "OT" : `${segment - 4}OT`;
          if (/half/i.test(clockLabel)) { name = "STATUS_HALFTIME"; detail = "Halftime"; }
          else if (/^end/i.test(clockLabel)) detail = `End of ${nth}`;
          else if (/delay/i.test(clockLabel)) { name = "STATUS_DELAYED"; detail = clockLabel; }
          else detail = clock && segment ? `${clock} - ${nth}` : (clockLabel || "In Progress");
        } else if (rawStatus === "postponed") {
          name = "STATUS_POSTPONED"; detail = "Postponed";
        } else if (rawStatus === "cancelled" || rawStatus === "canceled") {
          state = "post"; name = "STATUS_CANCELED"; detail = "Canceled";
        } else if (rawStatus === "delayed") {
          name = "STATUS_DELAYED"; detail = "Delayed";
        }
        const score = box?.score || null;
        const winnerId = String(score?.winning_team || "").split("/").pop();
        const competitor = (team, homeAway, s, standing) => {
          const t = toEspnTeam(team);
          // 2025 events carry "10-8-0" (ties segment always present); 2026
          // ones carry "10-3". Drop a zero ties tail so both read W-L, and
          // keep a real tie ("6-6-1") — CFL ties are real.
          const rec = String(standing?.short_record || "").replace(/^(\d+)-(\d+)-0$/, "$1-$2");
          return {
            homeAway,
            id: t.id,
            team: t,
            score: s != null && s !== "" ? String(s) : "0",
            winner: !!winnerId && t.id === winnerId && state === "post",
            // theScore stamps each side's current record on the event; the
            // standings route fills anything this leaves blank (future games).
            records: rec ? [{ summary: String(rec) }] : [],
          };
        };
        const us = ev?.tv_listings_by_country_code?.us;
        // US audience: a game with no US listing streams free on CFL+.
        const network = Array.isArray(us) && us[0]?.short_name ? String(us[0].short_name) : "CFL+";
        // game_description is either a title ("Banjo Bowl", "Eastern Semi-Final",
        // "112th Grey Cup") or, on some finished games, a full sentence about
        // a record set in the game — which names the winner. Only the short
        // titles pass through as a note; the sentences never leave the worker.
        const desc = String(ev?.game_description || "").trim();
        const notes = desc && desc.length <= 40 && !/[.!]$/.test(desc) ? [{ headline: desc }] : [];
        const isGreyCup = /grey cup/i.test(desc);
        const location = String(ev?.location || "");
        const [city, province] = location.split(",").map((s) => s.trim());
        const id = String(ev?.id ?? "");
        const date = (() => { const d = new Date(ev?.game_date); return Number.isNaN(d.getTime()) ? null : d.toISOString(); })();
        return {
          id,
          date,
          name: `${away.full_name || away.name || ""} at ${home.full_name || home.name || ""}`,
          shortName: `${away.abbreviation || ""} @ ${home.abbreviation || ""}`,
          season: { type: seasonType, year: date ? Number(date.slice(0, 4)) : undefined },
          ...(week ? { week: { number: week } } : {}),
          status: {
            displayClock: state === "in" ? clock : "0:00",
            period: segment,
            type: { name, state, completed, detail, shortDetail: detail },
          },
          links: [{ rel: ["summary"], href: `https://www.thescore.com/cfl/event/${id}` }],
          competitions: [{
            id,
            date,
            neutralSite: isGreyCup,
            competitors: [
              competitor(home, "home", score?.home?.score, ev?.standings?.home),
              competitor(away, "away", score?.away?.score, ev?.standings?.away),
            ],
            broadcasts: [{ names: [network] }],
            notes,
            venue: {
              fullName: String(ev?.stadium || ""),
              address: { city: city || "", state: province || "", country: "Canada" },
            },
          }],
        };
      };

      if (url.pathname === "/api/cfl/teams") {
        try {
          const res = await scoreFetch("/teams");
          if (!res.ok) return corsJson({ items: [] }, 200, 60);
          const data = await res.json();
          const items = (Array.isArray(data) ? data : []).map((t) => {
            const e = toEspnTeam(t);
            return { id: e.id, displayName: e.displayName, shortDisplayName: e.shortDisplayName, abbreviation: e.abbreviation, active: true, logos: e.logo ? [{ href: e.logo }] : [] };
          });
          return corsJson({ items }, 200, 86400);
        } catch {
          return corsJson({ items: [] }, 200, 60);
        }
      }

      if (url.pathname === "/api/cfl/standings") {
        // One combined table with a `rank` stat: fetchStandingsRanks' oneTable
        // branch reads it directly. rank = theScore's playoff_seed, which is
        // league-wide (1–9) with the crossover rule already applied. Ties are
        // real in the CFL, so the record keeps its third segment when ties > 0.
        try {
          const res = await scoreFetch("/standings");
          if (!res.ok) return corsJson({ children: [] }, 200, 60);
          const data = await res.json();
          const rows = Array.isArray(data) ? data : [];
          const entries = rows.map((s) => {
            const t = toEspnTeam(s?.team || {});
            const w = Number(s?.wins ?? 0), l = Number(s?.losses ?? 0), ties = Number(s?.ties ?? 0);
            const summary = ties > 0 ? `${w}-${l}-${ties}` : `${w}-${l}`;
            const seed = Number(s?.playoff_seed);
            const pct = Number.parseFloat(String(s?.winning_percentage ?? ""));
            return {
              team: { id: t.id, abbreviation: t.abbreviation, displayName: t.displayName },
              stats: [
                { name: "overall", summary, displayValue: summary },
                ...(Number.isFinite(seed) && seed > 0 ? [{ name: "rank", value: seed, displayValue: String(seed) }] : []),
                ...(Number.isFinite(pct) ? [{ name: "winPercent", value: pct, displayValue: String(pct) }] : []),
                { name: "points", value: Number(s?.points ?? 0), displayValue: String(s?.points ?? 0) },
                // wins/losses/ties feed the client's early-season rank gate
                // (lib/standingsRank.ts gamesPlayed) — no "#N" at 0-0.
                { name: "wins", value: w, displayValue: String(w) },
                { name: "losses", value: l, displayValue: String(l) },
                { name: "ties", value: ties, displayValue: String(ties) },
              ],
            };
          }).filter((e) => e.team.id);
          return corsJson({ children: [{ name: "CFL", standings: { entries } }] }, 200, 600);
        } catch {
          return corsJson({ children: [] }, 200, 60);
        }
      }

      // Scoreboard. `dates` is ESPN's YYYYMMDD or YYYYMMDD-YYYYMMDD, read as
      // ET calendar days (ESPN buckets by ET, and so does the client's date
      // nav). theScore is queried in UTC with a day of slack either side, then
      // every event is re-bucketed onto its ET day so a 02:14Z Sunday kickoff
      // (10:14pm ET Saturday) lands on the Saturday it belongs to. Intl does
      // the DST math — the Nov 1 fall-back sits inside the playoff window.
      const etDay = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" });
      const etYmd = (d) => etDay.format(d).replace(/-/g, "");
      const datesParam = url.searchParams.get("dates") || "";
      const m = datesParam.match(/^(\d{8})(?:-(\d{8}))?$/);
      let from, to;
      if (m) { from = m[1]; to = m[2] || m[1]; }
      else { const today = etYmd(new Date()); from = today; to = today; }
      if (to < from) [from, to] = [to, from];
      const utcAt = (ymd, dayShift, hour) =>
        new Date(Date.UTC(+ymd.slice(0, 4), +ymd.slice(4, 6) - 1, +ymd.slice(6, 8) + dayShift, hour)).toISOString();
      const windowStart = utcAt(from, 0, 0);   // ET midnight is 04:00Z/05:00Z — 00:00Z is already 4h+ early
      const windowEnd = utcAt(to, 1, 12);      // and noon Z the next day is 7h+ past ET midnight
      try {
        const res = await scoreFetch(`/events?game_date.in=${encodeURIComponent(`${windowStart},${windowEnd}`)}&rpp=200`);
        if (!res.ok) return corsJson({ events: [] }, 200, 60);
        const data = await res.json();
        const events = [];
        let live = false;
        for (const ev of Array.isArray(data) ? data : []) {
          const d = new Date(ev?.game_date);
          if (Number.isNaN(d.getTime())) continue;
          const day = etYmd(d);
          if (day < from || day > to) continue;
          const e = toEspnEvent(ev);
          if (!e.id || !e.date) continue;
          if (e.status.type.state === "in") live = true;
          events.push(e);
        }
        events.sort((a, b) => a.date.localeCompare(b.date));
        return corsJson({ events }, 200, live ? 20 : 300);
      } catch {
        return corsJson({ events: [] }, 200, 60);
      }
    }

    // ── Boxing: fight-card schedule (boxing-data.com via RapidAPI) ──────────
    // ESPN has NO boxing endpoint — its core API rejects the sport outright
    // ("Invalid sport (boxing)"), so this is the only structured source.
    // BOXING_API_KEY is a Pages secret; it must never reach the client, which
    // is the whole reason this is a worker route rather than a direct fetch.
    // The plan is Basic: 100 requests/month, HARD-capped, no card on file — so
    // this cannot generate a bill, but it also cannot absorb per-user traffic.
    // Hence the long cache: boxing announces cards 6-8 weeks out and the feed
    // only carries a handful of events, so hourly is far more than fresh
    // enough and keeps us near ~24 requests/day worst case.
    if (url.pathname === "/api/boxing") {
      if (request.method === "OPTIONS") {
        return new Response(null, {
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, OPTIONS",
            "Access-Control-Max-Age": "86400",
          },
        });
      }
      const corsJson = (body, status = 200, maxAge = 3600) =>
        new Response(JSON.stringify(body), {
          status,
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": `public, max-age=${maxAge}`,
            "Access-Control-Allow-Origin": "*",
          },
        });
      if (!env.BOXING_API_KEY) return corsJson({ events: [], disabled: true }, 200, 300);
      try {
        const host = "boxing-data-api.p.rapidapi.com";
        const res = await fetch(`https://${host}/v2/events/schedule`, {
          headers: {
            "x-rapidapi-host": host,
            "x-rapidapi-key": env.BOXING_API_KEY,
            "Content-Type": "application/json",
          },
        });
        // A 429 here means the month's 100 requests are spent. Serve empty and
        // let the column fall back rather than surfacing an error to the user.
        if (!res.ok) return corsJson({ events: [] }, 200, 900);
        const data = await res.json();
        const events = (data?.data || []).map((e) => ({
          id: String(e.id || ""),
          title: String(e.title || ""),
          date: e.date || null,
          venue: e.venue || null,
          location: e.location || null,
          // `broadcast` is per-country: [{country, broadcasters:[...]}]. Keep
          // only the US/UK rows — those are the ones Jacob can actually watch.
          broadcasts: (e.broadcast || [])
            .filter((b) => ["United States", "United Kingdom"].includes(b?.country))
            .flatMap((b) => b?.broadcasters || []),
          poster: e.poster_image_url || null,
        })).filter((e) => e.id && e.title && e.date);
        return corsJson({ events });
      } catch {
        return corsJson({ events: [] }, 200, 300);
      }
    }

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
    // /alerts/_*.json is PERSONAL and must never be public: `_dashboard.json`
    // carries the Priorities card (health, money, travel) and `_prefs.json` the
    // synced card order. The dashboard reads those same-origin from
    // alerts.hidescore.com, which is behind CF Access. Do not re-open them here.
    // The remaining /alerts/*.json are non-personal deal listings scraped from
    // public subreddits, and six local deal-notify crons curl them, so they stay
    // public. Flat keys only — no nesting, no leading underscore.
    const alertsKey = url.pathname.startsWith("/alerts/")
      ? url.pathname.slice("/alerts/".length)
      : null;
    const isPublicAlerts =
      !!alertsKey && !alertsKey.startsWith("_") && !alertsKey.includes("/");
    if (env.DATA && (url.pathname.startsWith("/news/") || isPublicAlerts || R2_ROOT_PATHS.has(url.pathname))) {
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

// A `returnTo` / state `r` redirect target must stay same-path, same-origin.
// "//evil.com" and "/\evil.com" both start with "/" but browsers normalize
// them to a scheme-relative URL, so a bare startsWith("/") check lets an
// open redirect through — reject those two forms as well.
function _safeReturnTo(raw) {
  if (typeof raw !== "string" || !raw.startsWith("/")) return "/";
  if (raw.startsWith("//") || raw.startsWith("/\\")) return "/";
  if (/[\x00-\x1f\x7f]/.test(raw) || raw.includes("\\")) return "/";
  try {
    if (new URL(raw, "https://x.invalid").origin !== "https://x.invalid") return "/";
  } catch {
    return "/";
  }
  return raw;
}

// GET /auth/apple/login -> 302 to Apple's authorize endpoint.
// State + nonce are signed (HMAC) and round-tripped via the `state` param, so
// no pre-callback cookie is needed (Apple POSTs the callback cross-site, where
// a SameSite=Lax cookie wouldn't be sent anyway).
async function siwaLogin(request, env, url) {
  if (!_siwaConfigured(env)) return new Response("Sign in is not configured yet", { status: 503 });
  const returnToRaw = url.searchParams.get("returnTo") || "/";
  const returnTo = _safeReturnTo(returnToRaw);
  const nonce = _b64urlFromBytes(crypto.getRandomValues(new Uint8Array(16)));
  let linkUid = null;
  if (url.searchParams.get("link") === "1") {
    const current = await _siwaReadSession(env, _siwaGetCookie(request, SIWA_SESSION_COOKIE));
    if (current) linkUid = (await _hsResolveAccount(env, current)).uid;
  }
  const stateBody = _b64urlFromJSON({ n: nonce, r: returnTo, t: _siwaNow(), l: linkUid });
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

  let u;
  try {
    u = await _hsResolveAccount(env, {
      sub: `apple:${claims.sub}`, email: claims.email || null, emailVerified: true,
    }, st.l || null);
  } catch { return _siwaErrRedirect("identity_already_linked"); }
  const session = await _siwaMakeSession(env, {
    sub: u.sub, uid: u.uid, email: u.email || null, exp: _siwaNow() + SIWA_SESSION_TTL,
  });
  return new Response(null, {
    status: 303,
    headers: {
      Location: _safeReturnTo(st.r),
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
  let linkUid = null;
  if (body.link) {
    const current = await _siwaReadSession(env, _siwaGetCookie(request, SIWA_SESSION_COOKIE));
    if (current) linkUid = (await _hsResolveAccount(env, current)).uid;
  }
  let u;
  try {
    u = await _hsResolveAccount(env, {
      sub: `apple:${claims.sub}`,
      email: claims.email || body.email || null,
      emailVerified: true,
    }, linkUid);
  } catch { return _siwaJson({ error: "identity_already_linked" }, 409); }
  const session = await _siwaMakeSession(env, {
    sub: u.sub, uid: u.uid, email: u.email || null, exp: _siwaNow() + SIWA_SESSION_TTL,
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

// ===========================================================================
// Per-account usage record — R2 `users/<sub>.json`. Sessions are stateless HMAC
// cookies, so before this the ONLY thing we knew about an account was that a
// `prefs/<sub>.json` blob existed: no email, no signup date, no way to tell a
// browser user from an iPhone-app user. This record answers "does this account
// use the app?" and "which account is which?" without adding a database.
//
//   { sub, uid, email, provider, firstSeen, lastSeen,
//     platforms: { ios: <iso>, web: <iso> }, counts: { ios, web } }
//
// `uid` is HMAC(SESSION_SECRET, sub) truncated — a stable pseudonymous id the
// client can hand to Umami so a signed-in session is attributable in analytics
// WITHOUT ever sending Apple/Google subs or emails off-box.
//
// Writes are throttled: we re-PUT only when the platform is new for this user
// or the last write is older than USER_TOUCH_MS, so a chatty client can't turn
// every /api/me poll into an R2 write. Deleted by /api/account (5.1.1(v)).
// ===========================================================================
const USER_TOUCH_MS = 6 * 60 * 60 * 1000;

// Which client made this request. The Capacitor WebView's User-Agent is
// indistinguishable from mobile Safari, so we trust an explicit header the app
// bundle sets (see hsClientHeaders in src/lib/prefsSync.ts) and default to web.
function _hsPlatform(request) {
  const h = (request.headers.get("X-HS-Client") || "").trim().toLowerCase();
  return h === "ios" || h === "android" ? h : "web";
}

async function _hsUid(env, sub) {
  if (!env.SESSION_SECRET) return null;
  const sig = await _siwaHmacSign(env.SESSION_SECRET, `uid:${sub}`);
  return sig.replace(/[^a-zA-Z0-9]/g, "").slice(0, 16);
}

async function _hsPrivateId(env, kind, value) {
  const sig = await _siwaHmacSign(env.SESSION_SECRET, `${kind}:${value}`);
  return sig.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 32);
}

async function _hsReadJson(env, key) {
  if (!env.DATA) return null;
  try {
    const obj = await env.DATA.get(key);
    return obj ? await obj.json() : null;
  } catch { return null; }
}

// Resolve an Apple or Google identity onto one canonical account. Identity and
// verified-email indexes are HMAC-keyed, so the private R2 namespace cannot be
// enumerated by guessing emails. Existing provider-keyed prefs are copied
// lazily on first sign-in; the legacy object is retained as a recovery copy.
async function _hsResolveAccount(env, u, linkUid = null) {
  const fallbackUid = await _hsUid(env, u.sub);
  if (!env.DATA || !env.SESSION_SECRET) return { ...u, uid: fallbackUid, linkedProviders: [String(u.sub).split(":")[0]] };

  const identityId = await _hsPrivateId(env, "identity", u.sub);
  const identityKey = `accounts/identity/${identityId}.json`;
  const existingIdentity = await _hsReadJson(env, identityKey);
  if (linkUid && existingIdentity?.uid && existingIdentity.uid !== linkUid) {
    throw new Error("identity_already_linked");
  }

  let uid = linkUid || existingIdentity?.uid || null;
  let emailKey = null;
  if (!uid && u.email && u.emailVerified !== false) {
    const emailId = await _hsPrivateId(env, "email", String(u.email).trim().toLowerCase());
    emailKey = `accounts/email/${emailId}.json`;
    uid = (await _hsReadJson(env, emailKey))?.uid || null;
  }
  uid = uid || fallbackUid;

  const accountKey = `accounts/${uid}.json`;
  const prior = (await _hsReadJson(env, accountKey)) || {};
  const identities = Array.isArray(prior.identities) ? prior.identities.filter((v) => typeof v === "string") : [];
  if (!identities.includes(u.sub)) identities.push(u.sub);
  const linkedProviders = [...new Set(identities.map((sub) => String(sub).split(":")[0]).filter(Boolean))];
  const account = {
    ...prior,
    uid,
    identities,
    linkedProviders,
    email: u.email || prior.email || null,
    updatedAt: new Date().toISOString(),
    createdAt: prior.createdAt || new Date().toISOString(),
  };
  await env.DATA.put(identityKey, JSON.stringify({ uid }), { httpMetadata: { contentType: "application/json" } });
  if (u.email && u.emailVerified !== false) {
    if (!emailKey) {
      const emailId = await _hsPrivateId(env, "email", String(u.email).trim().toLowerCase());
      emailKey = `accounts/email/${emailId}.json`;
    }
    const mapped = await _hsReadJson(env, emailKey);
    // Explicit linking may adopt an otherwise-unmapped email. Never silently
    // repoint an email already owned by a different canonical account.
    if (!mapped?.uid || mapped.uid === uid) {
      await env.DATA.put(emailKey, JSON.stringify({ uid }), { httpMetadata: { contentType: "application/json" } });
    }
  }
  await env.DATA.put(accountKey, JSON.stringify(account), { httpMetadata: { contentType: "application/json" } });

  const canonicalPrefs = `prefs/${uid}.json`;
  if (!(await env.DATA.head(canonicalPrefs))) {
    const legacy = await env.DATA.get(`prefs/${u.sub}.json`);
    if (legacy) await env.DATA.put(canonicalPrefs, legacy.body, { httpMetadata: { contentType: "application/json" } });
  }
  return { ...u, uid, linkedProviders };
}

// Read (and lazily upgrade) the record. Returns null when there's no store.
async function _hsTouchUser(env, request, u, ctx) {
  if (!env.DATA || !u || !u.sub) return null;
  const key = `users/${u.uid || u.sub}.json`;
  let rec = null;
  try {
    const obj = await env.DATA.get(key);
    if (obj) rec = await obj.json();
  } catch { /* unreadable record — treat as new and overwrite below */ }
  const now = new Date().toISOString();
  const platform = _hsPlatform(request);
  if (!rec || typeof rec !== "object") {
    rec = { uid: u.uid || null, firstSeen: now, platforms: {}, counts: {} };
  }
  if (!rec.platforms || typeof rec.platforms !== "object") rec.platforms = {};
  if (!rec.counts || typeof rec.counts !== "object") rec.counts = {};
  const stale = !rec.lastSeen || (Date.now() - Date.parse(rec.lastSeen) > USER_TOUCH_MS);
  const newPlatform = !rec.platforms[platform];
  const emailChanged = !!u.email && rec.email !== u.email;
  rec.uid = rec.uid || u.uid || (await _hsUid(env, u.sub));
  rec.provider = String(u.sub).split(":")[0] || null;
  rec.linkedProviders = u.linkedProviders || rec.linkedProviders || [rec.provider];
  if (u.email) rec.email = u.email;
  if (stale || newPlatform || emailChanged) {
    rec.lastSeen = now;
    rec.platforms[platform] = now;
    rec.counts[platform] = (rec.counts[platform] || 0) + 1;
    // This write is bookkeeping — nothing in the caller's answer depends on it.
    // It used to sit in the critical path of /api/me, which is the request the
    // Settings drawer blocks on, on top of the identity/account reads already
    // done by _hsResolveAccount. Hand it to waitUntil when the caller gave us a
    // ctx so the response goes out first; without one, keep the old behaviour.
    try {
      const put = env.DATA.put(key, JSON.stringify(rec),
        { httpMetadata: { contentType: "application/json" } });
      if (ctx && typeof ctx.waitUntil === "function") ctx.waitUntil(Promise.resolve(put).catch(() => {}));
      else await put;
    } catch { /* analytics only — never fail the request over it */ }
  }
  return rec;
}

// GET /api/me -> { signedIn, email, providers, uid, provider, platforms, ... }
// providers reflects which sign-in methods have their secrets set, so the UI
// only shows live buttons; `platforms`/`nativeApp` drive the Settings > Account
// summary ("used in the iPhone app and the web").
async function siwaMe(request, env, ctx) {
  const sessionUser = await _siwaReadSession(env, _siwaGetCookie(request, SIWA_SESSION_COOKIE));
  const base = {
    signedIn: !!sessionUser,
    email: (sessionUser && sessionUser.email) || null,
    providers: { apple: _siwaConfigured(env), google: _googleConfigured(env), email: _emailConfigured(env) },
  };
  if (!sessionUser) return _siwaJson(base);
  const u = await _hsResolveAccount(env, sessionUser).catch(() => ({ ...sessionUser, uid: sessionUser.uid || null }));
  let rec = null;
  try { rec = await _hsTouchUser(env, request, u, ctx); } catch { /* best effort */ }
  return _siwaJson({
    ...base,
    uid: (rec && rec.uid) || (await _hsUid(env, u.sub)),
    provider: String(u.sub).split(":")[0] || null,
    linkedProviders: u.linkedProviders || [],
    platform: _hsPlatform(request),
    platforms: (rec && rec.platforms) || {},
    firstSeen: (rec && rec.firstSeen) || null,
    lastSeen: (rec && rec.lastSeen) || null,
  });
}

// GET /api/prefs -> { prefs } (the user's stored prefs JSON, or null)
async function prefsGet(request, env, ctx) {
  const sessionUser = await _siwaReadSession(env, _siwaGetCookie(request, SIWA_SESSION_COOKIE));
  if (!sessionUser) return _siwaJson({ error: "unauthorized" }, 401);
  if (!env.DATA) return _siwaJson({ prefs: null });
  const u = await _hsResolveAccount(env, sessionUser);
  if (ctx) ctx.waitUntil(_hsTouchUser(env, request, u).catch(() => {}));
  const obj = await env.DATA.get(`prefs/${u.uid}.json`);
  return _siwaJson({ prefs: obj ? await obj.json() : null });
}

// PUT /api/prefs  body = prefs JSON -> { ok: true }
async function prefsPut(request, env, ctx) {
  const sessionUser = await _siwaReadSession(env, _siwaGetCookie(request, SIWA_SESSION_COOKIE));
  if (!sessionUser) return _siwaJson({ error: "unauthorized" }, 401);
  if (!env.DATA) return _siwaJson({ error: "no_store" }, 503);
  const u = await _hsResolveAccount(env, sessionUser);
  const text = await request.text();
  if (text.length > 64 * 1024) return _siwaJson({ error: "too_large" }, 413);
  let parsed;
  try { parsed = JSON.parse(text); } catch { return _siwaJson({ error: "bad_json" }, 400); }
  // Prefs must be a plain JSON object. Reject arrays / strings / numbers / null so a
  // malformed body can't be stored and then break the client-side prefs reader.
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return _siwaJson({ error: "bad_shape" }, 400);
  }
  await env.DATA.put(`prefs/${u.uid}.json`, JSON.stringify(parsed),
    { httpMetadata: { contentType: "application/json" } });
  if (ctx) ctx.waitUntil(_hsTouchUser(env, request, u).catch(() => {}));
  return _siwaJson({ ok: true });
}

// DELETE /api/account -> delete the signed-in user's stored data + clear the session.
// Satisfies Apple's in-app account-deletion requirement (App Store guideline 5.1.1(v)).
// All data we hold for a user is their prefs object at `prefs/<sub>.json` plus the usage
// record at `users/<sub>.json` (email / first+last seen / which platforms) — BOTH are
// erased here; sessions are stateless HMAC cookies (no server-side store), so clearing
// the cookie fully signs out.
// The iOS app loads this site in a WebView sharing the same cookie, so this deletes
// on-device too. We can't unlink their Apple/Google ID (external), only erase our data.
async function accountDelete(request, env) {
  const sessionUser = await _siwaReadSession(env, _siwaGetCookie(request, SIWA_SESSION_COOKIE));
  if (!sessionUser) return _siwaJson({ error: "unauthorized" }, 401);
  const u = await _hsResolveAccount(env, sessionUser);
  if (env.DATA) {
    try { await env.DATA.delete(`prefs/${u.uid}.json`); } catch { /* already gone */ }
    try { await env.DATA.delete(`users/${u.uid}.json`); } catch { /* already gone */ }
    const account = await _hsReadJson(env, `accounts/${u.uid}.json`);
    for (const sub of account?.identities || []) {
      try { await env.DATA.delete(`accounts/identity/${await _hsPrivateId(env, "identity", sub)}.json`); } catch { /* already gone */ }
      try { await env.DATA.delete(`prefs/${sub}.json`); } catch { /* legacy recovery copy */ }
      try { await env.DATA.delete(`users/${sub}.json`); } catch { /* legacy usage record */ }
    }
    if (account?.email) {
      try { await env.DATA.delete(`accounts/email/${await _hsPrivateId(env, "email", String(account.email).trim().toLowerCase())}.json`); } catch { /* already gone */ }
    }
    try { await env.DATA.delete(`accounts/${u.uid}.json`); } catch { /* already gone */ }
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
// Six-digit email sign-in. This mirrors Islander's security surface: uniform
// CSPRNG codes, SHA-256 at rest, one live code per address, ten-minute expiry,
// five guesses, atomic single-use claim, per-address and per-IP rate limits.
// A typed code is deliberate: mail scanners prefetch links and mail apps often
// open them in a different cookie jar than the app the person started in.
// ===========================================================================
function _emailConfigured(env) {
  return !!(env.RESEND_API_KEY && env.SESSION_SECRET && env.AUTH_DB && env.DATA);
}

function _hsNormalizeEmail(value) {
  const email = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}

function _hsNewLoginCode() {
  const ceiling = Math.floor(0x1_0000_0000 / 1_000_000) * 1_000_000;
  const value = new Uint32Array(1);
  do { crypto.getRandomValues(value); } while (value[0] >= ceiling);
  return String(value[0] % 1_000_000).padStart(6, "0");
}

async function _hsSha256Hex(value) {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", _siwaEnc.encode(value)));
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function _hsConstantTimeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let difference = 0;
  for (let index = 0; index < a.length; index += 1) difference |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return difference === 0;
}

function _hsMutationAllowed(request) {
  if ((request.headers.get("Sec-Fetch-Site") || "").toLowerCase() === "cross-site") return false;
  const origin = request.headers.get("Origin");
  if (!origin) return true;
  try {
    return ["hidescore.com", "www.hidescore.com", "localhost", "127.0.0.1"].includes(new URL(origin).hostname);
  } catch { return false; }
}

function _hsRequestIp(request) {
  return (request.headers.get("CF-Connecting-IP") || request.headers.get("X-Forwarded-For") || "unknown")
    .split(",")[0].trim().slice(0, 64) || "unknown";
}

async function _hsSendLoginCode(env, email, code) {
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: env.EMAIL_FROM || "HideScore <login@hidescore.com>",
        to: [email],
        subject: `${code} is your HideScore sign-in code`,
        text: `Your HideScore sign-in code is ${code}\n\nType it back into the app. It works once and expires in 10 minutes.\n\nIf you didn't ask to sign in, ignore this email. We will never ask you for this code by phone, text or reply.`,
        html: `<!doctype html><html><body style="margin:0;background:#0b0f16;padding:28px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#f8fafc"><div style="max-width:520px;margin:0 auto;background:#121826;border:1px solid #293244;border-radius:14px;overflow:hidden"><div style="height:5px;background:#22c55e"></div><div style="padding:26px 28px 30px"><p style="margin:0 0 14px;font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#22c55e;font-weight:700">HideScore</p><h1 style="margin:0 0 14px;font-size:22px">Your sign-in code</h1><p style="margin:0 0 18px;font-size:15px;line-height:1.6">Type this back into the app:</p><p style="margin:0 0 18px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:38px;font-weight:700;letter-spacing:.18em">${code}</p><p style="margin:0 0 12px;font-size:14px;line-height:1.6;color:#94a3b8">It works once and expires in 10 minutes.</p><p style="margin:0;font-size:14px;line-height:1.6;color:#94a3b8">If you didn't ask to sign in, ignore this email. We'll never ask you for this code by phone, text or reply.</p></div></div></body></html>`,
      }),
    });
    if (!response.ok) console.error("[login-code] Resend rejected", response.status);
    return response.ok;
  } catch {
    console.error("[login-code] delivery failed");
    return false;
  }
}

async function _hsEmailJsonBody(request) {
  const declared = Number(request.headers.get("Content-Length") || 0);
  if (declared > 4096) throw new Error("too_large");
  const raw = await request.text();
  if (raw.length > 4096) throw new Error("too_large");
  return JSON.parse(raw || "{}");
}

async function emailCodeRequest(request, env) {
  if (!_hsMutationAllowed(request)) return _siwaJson({ error: "cross_site" }, 403);
  if (!_emailConfigured(env)) return _siwaJson({ error: "not_configured" }, 503);
  let body;
  try { body = await _hsEmailJsonBody(request); } catch { return _siwaJson({ error: "bad_request" }, 400); }
  const email = _hsNormalizeEmail(body && body.email);
  if (!email) return _siwaJson({ error: "bad_email" }, 400);
  const now = Date.now();
  const cutoff = now - 60 * 60 * 1000;
  const emailKey = await _hsPrivateId(env, "login-code-email", email);
  const ipKey = await _hsPrivateId(env, "login-code-ip", _hsRequestIp(request));
  const emailCount = await env.AUTH_DB.prepare(`SELECT COUNT(*) AS count FROM email_login_rate_events
    WHERE kind = 'email' AND key_hash = ? AND created_at > ?`).bind(emailKey, cutoff).first();
  const ipCount = await env.AUTH_DB.prepare(`SELECT COUNT(*) AS count FROM email_login_rate_events
    WHERE kind = 'request_ip' AND key_hash = ? AND created_at > ?`).bind(ipKey, cutoff).first();
  if ((emailCount?.count || 0) >= 5 || (ipCount?.count || 0) >= 10) {
    return _siwaJson({ error: "throttled" }, 429);
  }

  const code = _hsNewLoginCode();
  const eventBase = _b64urlFromBytes(crypto.getRandomValues(new Uint8Array(18)));
  await env.AUTH_DB.prepare("INSERT INTO email_login_rate_events (id, kind, key_hash, created_at) VALUES (?, 'email', ?, ?)")
    .bind(`${eventBase}:e`, emailKey, now).run();
  await env.AUTH_DB.prepare("INSERT INTO email_login_rate_events (id, kind, key_hash, created_at) VALUES (?, 'request_ip', ?, ?)")
    .bind(`${eventBase}:i`, ipKey, now).run();
  const codeHash = await _hsSha256Hex(code);
  await env.AUTH_DB.prepare(`INSERT INTO email_login_codes (email_key, email, code_hash, expires_at, attempts, created_at)
    VALUES (?, ?, ?, ?, 0, ?) ON CONFLICT(email_key) DO UPDATE SET email = excluded.email,
    code_hash = excluded.code_hash, expires_at = excluded.expires_at, attempts = 0, created_at = excluded.created_at`)
    .bind(emailKey, email, codeHash, now + 10 * 60 * 1000, now).run();
  const delivered = await _hsSendLoginCode(env, email, code);
  if (!delivered) await env.AUTH_DB.prepare("DELETE FROM email_login_codes WHERE email_key = ? AND code_hash = ?")
    .bind(emailKey, codeHash).run();
  await Promise.all([
    env.AUTH_DB.prepare("DELETE FROM email_login_rate_events WHERE created_at < ?")
      .bind(now - 24 * 60 * 60 * 1000).run().catch(() => {}),
    env.AUTH_DB.prepare("DELETE FROM email_login_codes WHERE expires_at < ?")
      .bind(now - 24 * 60 * 60 * 1000).run().catch(() => {}),
  ]);
  return _siwaJson({ ok: true });
}

async function emailCodeVerify(request, env) {
  if (!_hsMutationAllowed(request)) return _siwaJson({ error: "cross_site" }, 403);
  if (!_emailConfigured(env)) return _siwaJson({ error: "not_configured" }, 503);
  let body;
  try { body = await _hsEmailJsonBody(request); } catch { return _siwaJson({ error: "bad_request" }, 400); }
  const email = _hsNormalizeEmail(body && body.email);
  const code = String((body && body.code) || "").replace(/\D/g, "");
  const now = Date.now();
  const ipKey = await _hsPrivateId(env, "login-code-verify-ip", _hsRequestIp(request));
  const verifyCount = await env.AUTH_DB.prepare(`SELECT COUNT(*) AS count FROM email_login_rate_events
    WHERE kind = 'verify_ip' AND key_hash = ? AND created_at > ?`)
    .bind(ipKey, now - 60 * 60 * 1000).first();
  if ((verifyCount?.count || 0) >= 20) return _siwaJson({ error: "throttled" }, 429);
  await env.AUTH_DB.prepare("INSERT INTO email_login_rate_events (id, kind, key_hash, created_at) VALUES (?, 'verify_ip', ?, ?)")
    .bind(_b64urlFromBytes(crypto.getRandomValues(new Uint8Array(18))), ipKey, now).run();
  if (!email || code.length !== 6) return _siwaJson({ error: "bad_code" }, 401);

  const emailKey = await _hsPrivateId(env, "login-code-email", email);
  const record = await env.AUTH_DB.prepare("SELECT code_hash, expires_at, attempts FROM email_login_codes WHERE email_key = ?")
    .bind(emailKey).first();
  if (!record || record.expires_at < now || record.attempts >= 5) {
    if (record) await env.AUTH_DB.prepare("DELETE FROM email_login_codes WHERE email_key = ?").bind(emailKey).run();
    return _siwaJson({ error: "bad_code" }, 401);
  }
  const submittedHash = await _hsSha256Hex(code);
  if (!_hsConstantTimeEqual(submittedHash, record.code_hash)) {
    await env.AUTH_DB.prepare(`UPDATE email_login_codes SET attempts = attempts + 1
      WHERE email_key = ? AND code_hash = ? AND attempts < 5`).bind(emailKey, record.code_hash).run();
    await env.AUTH_DB.prepare("DELETE FROM email_login_codes WHERE email_key = ? AND attempts >= 5").bind(emailKey).run();
    return _siwaJson({ error: "bad_code" }, 401);
  }
  const claimed = await env.AUTH_DB.prepare(`DELETE FROM email_login_codes
    WHERE email_key = ? AND code_hash = ? AND expires_at >= ?`).bind(emailKey, record.code_hash, now).run();
  if ((claimed.meta?.changes || 0) !== 1) return _siwaJson({ error: "bad_code" }, 401);

  let linkUid = null;
  const current = await _siwaReadSession(env, _siwaGetCookie(request, SIWA_SESSION_COOKIE));
  if (current) linkUid = (await _hsResolveAccount(env, current)).uid;
  const identity = {
    sub: `email:${await _hsPrivateId(env, "email-identity", email)}`,
    email,
    emailVerified: true,
  };
  let account;
  try { account = await _hsResolveAccount(env, identity, linkUid); }
  catch { return _siwaJson({ error: "identity_already_linked" }, 409); }
  const session = await _siwaMakeSession(env, {
    sub: identity.sub, uid: account.uid, email, exp: _siwaNow() + SIWA_SESSION_TTL,
  });
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      "Content-Type": "application/json", "Cache-Control": "no-store",
      "Set-Cookie": _siwaSetCookie(SIWA_SESSION_COOKIE, session, SIWA_SESSION_TTL),
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
  const returnTo = _safeReturnTo(returnToRaw);
  const nativeChallengeRaw = url.searchParams.get("nativeChallenge") || "";
  const nativeChallenge = /^[A-Za-z0-9_-]{43}$/.test(nativeChallengeRaw) ? nativeChallengeRaw : null;
  if (url.searchParams.has("nativeChallenge") && !nativeChallenge) {
    return _siwaErrRedirect("bad_native_challenge");
  }
  let linkUid = null;
  const nativeLinkToken = url.searchParams.get("nativeLinkToken");
  if (nativeChallenge && nativeLinkToken) {
    const dot = nativeLinkToken.lastIndexOf(".");
    if (dot < 1 || !(await _siwaHmacVerify(env.SESSION_SECRET, nativeLinkToken.slice(0, dot), nativeLinkToken.slice(dot + 1)))) {
      return _siwaErrRedirect("bad_link_token");
    }
    let linkProof;
    try { linkProof = _jsonFromB64url(nativeLinkToken.slice(0, dot)); }
    catch { return _siwaErrRedirect("bad_link_token"); }
    if (linkProof.p !== "google_link" || typeof linkProof.u !== "string" || linkProof.e < _siwaNow()) {
      return _siwaErrRedirect("bad_link_token");
    }
    linkUid = linkProof.u;
  } else if (url.searchParams.get("link") === "1") {
    const current = await _siwaReadSession(env, _siwaGetCookie(request, SIWA_SESSION_COOKIE));
    if (current) linkUid = (await _hsResolveAccount(env, current)).uid;
  }
  const nonce = _b64urlFromBytes(crypto.getRandomValues(new Uint8Array(16)));
  const stateBody = _b64urlFromJSON({ n: nonce, r: returnTo, t: _siwaNow(), c: nativeChallenge, l: linkUid });
  const state = `${stateBody}.${await _siwaHmacSign(env.SESSION_SECRET, stateBody)}`;
  const auth = new URL(GOOGLE_AUTHORIZE);
  const origin = String(env.APP_ORIGIN || "https://hidescore.com").replace(/\/$/, "");
  auth.searchParams.set("client_id", env.GOOGLE_CLIENT_ID);
  auth.searchParams.set("redirect_uri", `${origin}/auth/google/callback`);
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
  const origin = String(env.APP_ORIGIN || "https://hidescore.com").replace(/\/$/, "");
  try {
    const res = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: env.GOOGLE_CLIENT_ID,
        client_secret: env.GOOGLE_CLIENT_SECRET,
        code,
        grant_type: "authorization_code",
        redirect_uri: `${origin}/auth/google/callback`,
      }),
    });
    if (!res.ok) return _siwaErrRedirect("token_exchange");
    tokens = await res.json();
  } catch { return _siwaErrRedirect("token_exchange"); }

  const claims = await _googleVerifyIdToken(tokens.id_token, env);
  if (!claims) return _siwaErrRedirect("bad_id_token");
  if (claims.nonce && claims.nonce !== st.n) return _siwaErrRedirect("bad_nonce");

  let u;
  try {
    u = await _hsResolveAccount(env, {
      sub: `google:${claims.sub}`,
      email: claims.email || null,
      emailVerified: claims.email_verified === true || claims.email_verified === "true",
    }, st.l || null);
  } catch { return _siwaErrRedirect("identity_already_linked"); }

  if (st.c) {
    if (!env.DATA) return _siwaErrRedirect("no_store");
    const handoffCode = _b64urlFromBytes(crypto.getRandomValues(new Uint8Array(32)));
    await env.DATA.put(`auth/handoff/${handoffCode}.json`, JSON.stringify({
      sub: u.sub,
      uid: u.uid,
      email: u.email || null,
      challenge: st.c,
      exp: _siwaNow() + 300,
    }), { httpMetadata: { contentType: "application/json" } });
    const callback = new URL("hidescore-auth://google");
    callback.searchParams.set("code", handoffCode);
    callback.searchParams.set("returnTo", _safeReturnTo(st.r));
    return new Response(null, { status: 303, headers: { Location: callback.toString() } });
  }

  const session = await _siwaMakeSession(env, {
    sub: u.sub, uid: u.uid, email: u.email || null, exp: _siwaNow() + SIWA_SESSION_TTL,
  });
  return new Response(null, {
    status: 303,
    headers: {
      Location: _safeReturnTo(st.r),
      "Set-Cookie": _siwaSetCookie(SIWA_SESSION_COOKIE, session, SIWA_SESSION_TTL),
    },
  });
}

// POST /auth/google/native { code, verifier } — finish the system-browser flow
// from inside the Capacitor WebView. The handoff is one-use and bound to the
// app-generated PKCE verifier, so another app claiming the same custom scheme
// cannot redeem an intercepted callback URL.
async function googleNativeComplete(request, env) {
  if (!env.DATA || !env.SESSION_SECRET) return _siwaJson({ error: "not_configured" }, 503);
  let body;
  try { body = await request.json(); } catch { return _siwaJson({ error: "bad_request" }, 400); }
  if (body && body.action === "link_token") {
    if (request.headers.get("Sec-Fetch-Site")?.toLowerCase() === "cross-site") {
      return _siwaJson({ error: "cross_site" }, 403);
    }
    const current = await _siwaReadSession(env, _siwaGetCookie(request, SIWA_SESSION_COOKIE));
    if (!current) return _siwaJson({ error: "unauthorized" }, 401);
    const account = await _hsResolveAccount(env, current);
    const tokenBody = _b64urlFromJSON({ p: "google_link", u: account.uid, e: _siwaNow() + 300 });
    const token = `${tokenBody}.${await _siwaHmacSign(env.SESSION_SECRET, tokenBody)}`;
    return _siwaJson({ linkToken: token });
  }
  const code = body && body.code;
  const verifier = body && body.verifier;
  if (!/^[A-Za-z0-9_-]{43}$/.test(code || "") || !/^[A-Za-z0-9_-]{43}$/.test(verifier || "")) {
    return _siwaJson({ error: "bad_handoff" }, 400);
  }
  const key = `auth/handoff/${code}.json`;
  const handoff = await _hsReadJson(env, key);
  // Claim before checking so even a malformed/replayed attempt burns the code.
  try { await env.DATA.delete(key); } catch { /* absent/replayed */ }
  if (!handoff || handoff.exp < _siwaNow()) return _siwaJson({ error: "bad_handoff" }, 401);
  const digest = await crypto.subtle.digest("SHA-256", _siwaEnc.encode(verifier));
  if (_b64urlFromBytes(digest) !== handoff.challenge) return _siwaJson({ error: "bad_handoff" }, 401);
  const session = await _siwaMakeSession(env, {
    sub: handoff.sub, uid: handoff.uid, email: handoff.email || null, exp: _siwaNow() + SIWA_SESSION_TTL,
  });
  return new Response(JSON.stringify({ ok: true, returnTo: _safeReturnTo(body.returnTo) }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "Set-Cookie": _siwaSetCookie(SIWA_SESSION_COOKIE, session, SIWA_SESSION_TTL),
    },
  });
}

// ===========================================================================
// Bracket picks leaderboard — /api/picks
//
// The client (components/BracketPicks) keeps a player's own picks and score in
// localStorage; this is the shared half. KV binding PICKS, one key per entry:
//
//   e:<board>:<name key>  → { name, picks, owner, at }   (metadata: name, picks)
//   d:<board>:<owner>     → the entry key this device owns
//   rl:<ip hash>          → POST count, expires after 10 minutes
//
// `owner` is the SHA-256 of a random token the device generates and keeps, so
// a name belongs to the device that took it first and only that device can
// edit it. One entry per device: submitting under a new name moves the entry.
//
// The server stores picks and never scores them. Scoring needs the results,
// the client already fetches those from StatsAPI, and lib/bracketPicks cleans
// every entry against the real bracket before scoring it — so a hand-built POST
// that picks a team into a series it cannot reach scores nothing for it.
//
// Picks lock at first pitch of the first wild-card game, read from StatsAPI
// with the same rule as lib/mlbPicks lockTimeFrom. Before the lock a GET
// returns names only, so nobody can copy a bracket; after it, everything.
//
// Inert until the KV namespace is bound: every call answers 503 {disabled}.

const PICKS_BOARD_RE = /^mlb-(\d{4})$/;
const PICKS_KEY_RE = /^(?:(?:AL|NL):(?:wc-a|wc-b|ds-a|ds-b|cs)|ws)$/;
const PICKS_TEAM_RE = /^1\d{2}$/; // MLB club ids run 108–158
const PICKS_MAX = 11; // 4 wild card + 4 division + 2 LCS + the World Series
const PICKS_NAME_MAX = 20;
const PICKS_NAME_RE = /^[\p{L}\p{N}][\p{L}\p{N} .'-]*$/u;
const PICKS_TOKEN_RE = /^[A-Za-z0-9_-]{16,64}$/;
const PICKS_POST_LIMIT = 10;
const PICKS_POST_WINDOW = 600; // seconds; KV's own floor is 60
const PICKS_LOCK_TTL = 10 * 60 * 1000;
const _picksLockCache = new Map();

function _picksJson(body, status = 200, maxAge = 0) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": maxAge ? `public, max-age=${maxAge}` : "no-store",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

// Same rule as lib/bracketPicks cleanName.
function _picksCleanName(raw) {
  if (typeof raw !== "string") return null;
  const s = raw.normalize("NFKC").replace(/\s+/g, " ").trim();
  if (!s || s.length > PICKS_NAME_MAX || !PICKS_NAME_RE.test(s)) return null;
  return s;
}

function _picksCleanPicks(raw) {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const keys = Object.keys(raw);
  if (keys.length > PICKS_MAX) return null;
  const out = {};
  for (const k of keys) {
    const v = raw[k];
    if (!PICKS_KEY_RE.test(k) || typeof v !== "string" || !PICKS_TEAM_RE.test(v)) return null;
    out[k] = v;
  }
  return out;
}

async function _picksSha(text) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Mirror of lib/mlbPicks lockTimeFrom: the earliest wild-card game on the
// opening day, and noon ET (16:00Z) for any game there still marked TBD.
function _picksLockFrom(data) {
  const games = (data?.series || []).flatMap((s) => s.games || []).filter((g) => g.gameType === "F" && g.officialDate);
  if (!games.length) return null;
  const first = games.map((g) => g.officialDate).sort()[0];
  let lock = Infinity;
  for (const g of games) {
    if (g.officialDate !== first) continue;
    const t = g.gameDate ? Date.parse(g.gameDate) : NaN;
    lock = Math.min(lock, g.status?.startTimeTBD || !Number.isFinite(t) ? Date.parse(`${first}T16:00:00Z`) : t);
  }
  return Number.isFinite(lock) ? lock : null;
}

// undefined = could not ask; null = MLB has no wild-card games listed.
async function _picksLock(season) {
  const hit = _picksLockCache.get(season);
  if (hit && Date.now() - hit.fetched < PICKS_LOCK_TTL) return hit.at;
  try {
    const res = await fetch(`https://statsapi.mlb.com/api/v1/schedule/postseason/series?sportId=1&season=${season}`, {
      headers: { "User-Agent": "HideScore/1.0 (+https://hidescore.com)", Accept: "application/json" },
    });
    if (!res.ok) throw new Error(String(res.status));
    const at = _picksLockFrom(await res.json());
    _picksLockCache.set(season, { at, fetched: Date.now() });
    return at;
  } catch {
    // A stale answer beats none: the lock time only ever moves by hours.
    return hit ? hit.at : undefined;
  }
}

async function _picksListEntries(env, board) {
  const out = [];
  let cursor;
  for (let page = 0; page < 5; page++) {
    const res = await env.PICKS.list({ prefix: `e:${board}:`, cursor });
    for (const k of res.keys) {
      const m = k.metadata;
      if (m && typeof m.n === "string" && m.p && typeof m.p === "object") out.push({ name: m.n, picks: m.p });
    }
    if (res.list_complete || !res.cursor) break;
    cursor = res.cursor;
  }
  return out;
}

async function picksRoute(request, env, ctx, url) {
  try {
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
          "Access-Control-Max-Age": "86400",
        },
      });
    }
    if (!env.PICKS) return _picksJson({ disabled: true }, 503);
    const thisYear = new Date().getUTCFullYear();

    if (request.method === "GET") {
      const board = url.searchParams.get("board") || "";
      const bm = PICKS_BOARD_RE.exec(board);
      if (!bm || Number(bm[1]) !== thisYear) return _picksJson({ error: "bad_board" }, 400);
      const cacheKey = new Request(`https://hidescore.com/api/picks?board=${board}`);
      const cache = typeof caches !== "undefined" ? caches.default : null;
      if (cache) {
        const hit = await cache.match(cacheKey);
        if (hit) return hit;
      }
      const lockAt = await _picksLock(bm[1]);
      const locked = lockAt != null && Date.now() >= lockAt;
      const entries = await _picksListEntries(env, board);
      const body = {
        board,
        lockAt: lockAt != null ? new Date(lockAt).toISOString() : null,
        locked,
        count: entries.length,
        ...(locked ? { entries } : { names: entries.map((e) => e.name) }),
      };
      const res = _picksJson(body, 200, 60);
      if (cache && ctx?.waitUntil) ctx.waitUntil(cache.put(cacheKey, res.clone()));
      return res;
    }

    if (request.method !== "POST") return _picksJson({ error: "method" }, 405);
    if (Number(request.headers.get("Content-Length") || 0) > 2048) return _picksJson({ error: "too_large" }, 413);
    const raw = await request.text();
    if (raw.length > 2048) return _picksJson({ error: "too_large" }, 413);
    let body;
    try { body = JSON.parse(raw); } catch { return _picksJson({ error: "bad_json" }, 400); }
    const bm = PICKS_BOARD_RE.exec(typeof body?.board === "string" ? body.board : "");
    if (!bm || Number(bm[1]) !== thisYear) return _picksJson({ error: "bad_board" }, 400);
    const board = body.board;
    const name = _picksCleanName(body.name);
    if (!name) return _picksJson({ error: "bad_name" }, 400);
    if (typeof body.token !== "string" || !PICKS_TOKEN_RE.test(body.token)) return _picksJson({ error: "bad_token" }, 400);
    const picks = _picksCleanPicks(body.picks);
    if (!picks) return _picksJson({ error: "bad_picks" }, 400);

    // Rate limit before any other KV work. KV is eventually consistent, so this
    // is a ceiling on a burst, not an exact count — enough to stop a script.
    const rlKey = `rl:${await _picksSha(`picks|${_hsRequestIp(request)}`)}`;
    const used = Number(await env.PICKS.get(rlKey)) || 0;
    if (used >= PICKS_POST_LIMIT) return _picksJson({ error: "throttled" }, 429);
    await env.PICKS.put(rlKey, String(used + 1), { expirationTtl: PICKS_POST_WINDOW });

    const lockAt = await _picksLock(bm[1]);
    if (lockAt == null) return _picksJson({ error: "lock_unknown" }, 503);
    if (Date.now() >= lockAt) return _picksJson({ error: "locked", lockAt: new Date(lockAt).toISOString() }, 423);

    const owner = await _picksSha(body.token);
    const entryKey = `e:${board}:${encodeURIComponent(name.toLowerCase())}`;
    const existing = await env.PICKS.get(entryKey, "json");
    if (existing && existing.owner !== owner) return _picksJson({ error: "name_taken" }, 409);

    const devKey = `d:${board}:${owner}`;
    const prevKey = await env.PICKS.get(devKey);
    if (prevKey && prevKey !== entryKey) {
      const prev = await env.PICKS.get(prevKey, "json");
      if (prev && prev.owner === owner) await env.PICKS.delete(prevKey);
    }
    const at = new Date().toISOString();
    await env.PICKS.put(entryKey, JSON.stringify({ name, picks, owner, at }), { metadata: { n: name, p: picks } });
    if (prevKey !== entryKey) await env.PICKS.put(devKey, entryKey);
    if (typeof caches !== "undefined") {
      try { await caches.default.delete(new Request(`https://hidescore.com/api/picks?board=${board}`)); } catch { /* best effort */ }
    }
    return _picksJson({ ok: true, name, at });
  } catch {
    return _picksJson({ error: "unavailable" }, 503);
  }
}
