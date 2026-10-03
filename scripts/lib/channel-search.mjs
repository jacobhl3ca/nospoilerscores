// Channel-scoped search: our own second pass for an EMPTY soccer official
// slot, run before FotMob (added 2026-09-25).
//
// Why it exists. The official resolver asks /api/youtube, which searches all
// of YouTube and keeps the approved uploader's hits. For a fixture that repeats
// every season, YouTube ranks an OLD meeting first — "Orlando vs New England"
// on the MLS channel returned the 2017 cut, "Leverkusen vs Leipzig" on the
// Bundesliga channel last season's Matchday 32 — the upload-date gate rightly
// refuses it, and the slot stays empty. FotMob then filled 16 games over
// 9/19–9/21 that way; 7 of the 16 were on the very channel we had already
// asked. Adding the year or matchday to the query did not fix it (tested).
//
// The same two team names typed into the channel's OWN search page
// (youtube.com/@<handle>/search?query=) put this week's cut first or second in
// every case probed, with its age on the card ("5d ago"). This module is the
// pure half: which channels have a search page, and which card on it to take.
// The bake fetches the page, then puts the pick through the same oEmbed,
// teams, competition, upload-date and embed gates as any other official.
//
// Only channels listed here are searched — a channel without a handle keeps
// its old behaviour. Names are the exact oEmbed `author_name` the slot's
// channel marker must equal; handles were read off each channel's page
// 2026-09-25.

export const CHANNEL_SEARCH_HANDLES = {
  // League / broadcaster channels already used as the primary or 2nd uploader.
  "Major League Soccer": "MLS",
  "Bundesliga": "bundesliga",
  "EFL": "theEFL",
  "CBS Sports Golazo": "cbssportsgolazo",
  "CBS Sports Golazo - Europe": "CBSSportsGolazoEurope",
  "TUDN USA": "tudn_usa",
  // Liga MX's own channel (the chain fallback in collegeHighlightChannels.json).
  "LIGA BBVA MX": "ligabbvamx",
  // EFL Championship clubs, 2026-27 (the efl chain in
  // collegeHighlightChannels.json). Re-check after promotion/relegation.
  "Birmingham City Football Club": "BCFC",
  "Blackburn Rovers Football Club": "BlackburnRovers",
  "Bolton Wanderers FC": "OfficialBWFC",
  "Bristol City": "BristolCityFootballClub",
  "Burnley Football Club": "burnleyofficial",
  "Cardiff City FC": "CardiffCityFC",
  "Charlton Athletic Football Club": "CAFCOfficial",
  "Derby County Football Club": "dcfcofficial",
  "Lincoln City FC": "lincolncityfc1685",
  "Middlesbrough FC": "MiddlesbroughFC",
  "Millwall FC": "MillwallFC",
  "Norwich City Football Club": "CanariesTV",
  "Portsmouth FC": "OfficialPompey",
  "Preston North End FC": "pnefcofficial",
  "QPR FC": "QPR",
  "Sheffield United FC": "sheffieldunited",
  "Southampton FC": "SouthamptonFC",
  "Stoke City FC": "StokeCity",
  "Swansea City AFC": "SwanseaCity",
  "Watford FC": "watfordfcofficial",
  "West Bromwich Albion": "OfficialAlbion",
  "West Ham United FC": "westhamunited",
  "Wolves": "OfficialWolvesVideo",
  "Wrexham AFC": "WxmAFCofficial",
  // Women's college hockey (the ncaawh chain, added 2026-09-26). YouTube's
  // global results for "Ohio State vs Penn State highlights" are 20 football
  // cuts, so the /api/youtube lookup never sees this channel's video; its own
  // search page puts it first. ECAC's pairs carry the same risk (Yale–Harvard,
  // Cornell–Princeton are football names too); its titles print the date
  // ("Highlights - September 25, 2026"), so the title-date check below keeps
  // the two nights of a weekend series apart.
  "Atlantic Hockey America": "atlantichockeyamerica",
  "ECAC Hockey": "ECACHockeyLeague",
  // NFL (added 2026-09-27). On Week 3 (9/27) the /api/youtube lookup found
  // 1 of 5 probed games; the @NFL search page put the right "Game
  // Highlights | NFL 2026 Season Week 3" cut first for all 5. The channel
  // posts dozens of clips a day, so its feed reaches back only a few hours.
  "NFL": "NFL",
  // MAC (the ncaaf chain, added 2026-09-27). Its global-search rank lost
  // Robert Morris at Buffalo (9/26) to the 2019 meeting; its own search page
  // put the 9.26.26 cut first.
  "Get Some MACtion": "GetSomeMACtion",
  // Top 14 (added 2026-10-03). Round 4 posted 49 try clips beside its 7
  // match cuts, so the feed rolls past a Saturday's cuts within hours.
  "TOP 14 - Officiel": "top14",
};

// A card title must carry one of these words on this channel's search page.
// The @NFL page ranks the game's preview ("Game Preview | 2026 Week 3") and a
// 16-minute "down to the wire ending" beside the game cut; only the cut says
// "Game Highlights".
const TITLE_TOKENS_BY_CHANNEL = {
  "NFL": ["game highlights"],
  // The conference channels post a full replay of the same game ("Florida
  // State vs. Louisville Full Match Replay | 2026 ACC Women's Soccer", 1 h
  // 42 m) beside its cut. The worker's highlight words keep only the cut.
  "ACC Digital Network": ["highlight", "recap"],
  "Big 12 Conference": ["highlight", "recap"],
  "SEC": ["highlight", "recap"],
  // Its try clips name both clubs ("TOP 14 - Essai de Antoine DUPONT (ST) -
  // Stade Toulousain - Montpellier Hérault Rugby"); a match cut says
  // "Highlights" or "Match Summary" (TOP14_SUMMARY_RX in public/_worker.js).
  "TOP 14 - Officiel": ["highlight", "summary", "resume"],
};

export function channelSearchTitleTokens(channel) {
  return TITLE_TOKENS_BY_CHANNEL[channel] ?? [];
}

// Channels whose uploads refuse every embed by design. Their cards open on the
// "Watch on YouTube" hand-off (EMBED_BLOCKED_CHANNELS in src/lib/youtube.ts),
// so the embed check would refuse every cut they post.
const EMBED_BLOCKED_SEARCH_CHANNELS = new Set(["NFL"]);

export function channelSearchNeedsEmbed(channel) {
  return !EMBED_BLOCKED_SEARCH_CHANNELS.has(channel);
}

// Channels read for some sports only. The conference channels are in the
// ncaaf and ncaavb chains too; their feeds are read for college soccer only.
const CHANNEL_SEARCH_SPORTS = {
  "ACC Digital Network": ["ncaawsoc", "ncaamsoc"],
  "Big 12 Conference": ["ncaawsoc", "ncaamsoc"],
  "SEC": ["ncaawsoc", "ncaamsoc"],
};

export function channelSearchServesSport(channel, sport) {
  const sports = CHANNEL_SEARCH_SPORTS[channel];
  return !sports || sports.includes(sport);
}

// Channel id (UC…) per channel, for its uploads feed
// (youtube.com/feeds/videos.xml?channel_id=). Read off each @handle page
// 2026-09-26. The bake reads the feed BEFORE the search page: it holds the 15
// newest uploads with their exact upload times, and YouTube does not throttle
// it the way it throttles results pages, so a game the feed already holds
// costs none of the bake's 30 search pages. Feed depth measured 2026-09-26:
// MLS and Bundesliga ~6 days, West Brom ~10, ECAC and AHA a full weekend.
export const CHANNEL_FEED_IDS = {
  "Major League Soccer": "UCSZbXT5TLLW_i-5W8FZpFsg",
  "Bundesliga": "UC6UL29enLNe4mqwTfAyeNuw",
  "EFL": "UCCmo_NIuQR5eU4AvBa6sEQQ",
  "CBS Sports Golazo": "UCET00YnetHT7tOpu12v8jxg",
  "CBS Sports Golazo - Europe": "UCf8YPuOWXlpTS7RibaJlP4g",
  "TUDN USA": "UCSo19KhHogXxu3sFsOpqrcQ",
  "LIGA BBVA MX": "UCq8BPLXtFeiSFOvmJrknWGg",
  "Birmingham City Football Club": "UCW1HMToSBse9JgQtsm2vMsQ",
  "Blackburn Rovers Football Club": "UCg4185wSpo9swSCSUEYUGTg",
  "Bolton Wanderers FC": "UC6oTkDRXLR6GO53l44i0LFw",
  "Bristol City": "UCq_5VYwAoOvaL4lyGkwoboQ",
  "Burnley Football Club": "UChvUXuSDeEFSQZS8GcPMtkg",
  "Cardiff City FC": "UCfBVy8PAMwyNbac6D0Mk8gQ",
  "Charlton Athletic Football Club": "UC99akEsugT_s4tv_r2oxuOQ",
  "Derby County Football Club": "UCsOKCDfSRPwRhnbCqBO8CQw",
  "Lincoln City FC": "UCCLmGW0zE-1Gdagxg52G7sA",
  "Middlesbrough FC": "UCdXWsJhkXzx5hFJGcxjy_5Q",
  "Millwall FC": "UCPyLfjCylafteypHYuYvGbQ",
  "Norwich City Football Club": "UCzdkZv6--BWsUQ9rKUtQ1TQ",
  "Portsmouth FC": "UC2pUjr6WECIEprPQxcD51OA",
  "Preston North End FC": "UCWSRYI78ApCEDssqg5UjXKw",
  "QPR FC": "UCiegSQxYwraPK5efklvTO5w",
  "Sheffield United FC": "UCVER_UoBt84YUrA6s402Q-g",
  "Southampton FC": "UCxvXjfiIHQ2O6saVx_ZFqnw",
  "Stoke City FC": "UCmFPjHUFr0hyE6eFGvCm7IA",
  "Swansea City AFC": "UCSMZZFBE92Yn-_XYdDiiANA",
  "Watford FC": "UCptKljTrbdMTgmuekGKhRug",
  "West Bromwich Albion": "UCnDBNo0zLm11TTXPVXvEN1g",
  "West Ham United FC": "UCCNOsmurvpEit9paBOzWtUg",
  "Wolves": "UCQ7Lqg5Czh5djGK6iOG53KQ",
  "Wrexham AFC": "UCS7BAYpqOSaYy-pZp6oO4PA",
  "Atlantic Hockey America": "UC0x7S4TIeXr86mei-ni-kYQ", // gitleaks:allow (public channel id; "Hockey" reads as "key")
  "ECAC Hockey": "UCjUTtbKNR2Gf2GziiKf74TQ", // gitleaks:allow
  "NFL": "UCDVYQ4Zhbm3S2dlz7P1GBDg",
  "Get Some MACtion": "UCpiOTTxIB7VvB4N4LIYMhVw",
  // College soccer (the ncaawsoc / ncaamsoc chains, added 2026-10-03): feed
  // only, no search page, so they never spend the bake's 30 pages. A
  // weeknight's soccer cuts sit in the global results under the football
  // ones: the 10/2 lookups found 5 of 15 games, while the Big 12 feed held all
  // 7 of its cuts. Feed depth 2026-10-03: ACC ~13 h, Big 12 ~14 h, SEC ~4
  // days, so the hourly bake reads every upload while it is in the feed.
  "ACC Digital Network": "UC0hy7TcR1gGD8nQBqrF2FaA",
  "Big 12 Conference": "UCLnfOCTbfqMy_3ah8OmTHEQ",
  "SEC": "UC60q_WUDde_NK-ze3frvtiA",
  "TOP 14 - Officiel": "UCWrD2VhZdO-_W8QDBxiXmeg",
  // Pac-12 (the ncaaf chain, added 2026-10-03): feed only. Its 15 uploads
  // reach back about 4 days (2026-10-03), so the hourly bake reads each game
  // cut while it is in the feed.
  "Pac-12": "UCtxdtF8iCxZw593FSUIPrxg",
};

export function channelFeedId(channel) {
  return (channel && CHANNEL_FEED_IDS[channel]) || null;
}

function decodeXml(s) {
  return String(s ?? "")
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#0?39;|&#x27;/gi, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&amp;/g, "&");
}

// Uploads feed XML → { cards, oldestMs }. `cards` are in the shape
// pickChannelSearchCards takes, newest first. Shorts are dropped (their link
// is /shorts/…); the feed carries no length, so `durationSec` is unknown and
// the bake reads it off the watch page for the pick instead. `oldestMs` is the
// oldest upload in the feed, Shorts included: every upload since then is in
// it, so for a game that started after it the feed is the whole answer and
// the search page could show nothing more (see feedCoversGame).
export function parseChannelFeed(xml) {
  const cards = [];
  let oldestMs = null;
  for (const [, block] of String(xml ?? "").matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
    const videoId = (block.match(/<yt:videoId>([^<]+)<\/yt:videoId>/) || [])[1]?.trim();
    const title = decodeXml((block.match(/<title>([\s\S]*?)<\/title>/) || [])[1]).trim();
    const link = (block.match(/<link rel="alternate" href="([^"]+)"/) || [])[1] ?? "";
    const publishedMs = Date.parse((block.match(/<published>([^<]+)<\/published>/) || [])[1] ?? "");
    if (!videoId) continue;
    if (Number.isFinite(publishedMs)) oldestMs = oldestMs === null ? publishedMs : Math.min(oldestMs, publishedMs);
    if (!title || /\/shorts\//.test(link)) continue;
    cards.push({ videoId, title, publishedMs: Number.isFinite(publishedMs) ? publishedMs : null, durationSec: null });
  }
  return { cards, oldestMs };
}

// Whether the feed reaches back to the game's start, so it already holds any
// cut of it. When it does and holds none, the cut is not posted yet and a
// results page would be spent for nothing.
export function feedCoversGame(feed, gameMs) {
  return Number.isFinite(feed?.oldestMs) && Number.isFinite(gameMs) && feed.oldestMs <= gameMs;
}

// Channels whose game cut runs under a minute. AHA posts a scoreline recap
// per game at 59–161 s ("Syracuse 3, Stonehill 0 - Sept. 25, 2026" is 59 s).
const MIN_SEC_BY_CHANNEL = {
  "Atlantic Hockey America": 45,
};

export function channelSearchMinSec(channel) {
  return MIN_SEC_BY_CHANNEL[channel] ?? MIN_HIGHLIGHT_SEC;
}

export function channelSearchHandle(channel) {
  return (channel && CHANNEL_SEARCH_HANDLES[channel]) || null;
}

// Club channels post their women's, youth and reserve sides under the same
// two club names ("Albion Women 3-1 Birmingham City Women"). None of those is
// the ESPN game on the card.
export const NOT_FIRST_TEAM_RX = /\b(women|womens|ladies|lionesses|u-?1[5-9]|u-?2[0-3]|under[- ]?(?:1[5-9]|2[0-3])|academy|reserves?|pl2|premier league 2|youth|fa youth cup)\b/i;

// Women's leagues: their own cuts say "Women's" ("RPI at Mercyhurst | NCAA
// Women's Ice Hockey | …"), so the filter above would refuse the very game on
// the card. It is skipped for these sports.
const WOMENS_SPORTS = new Set(["ncaawh", "ncaaw", "ncaavb", "ncaawsoc", "wnba", "nwsl"]);

export function isWomensSport(sport) {
  return WOMENS_SPORTS.has(sport);
}

// A goal clip, a reaction or a Short is not the game's highlight package.
const MIN_HIGHLIGHT_SEC = 60;

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

// The date a title names, as YYYYMMDD, or "" when it names none (or no year).
// "Sept. 24, 2026", "September 27, 2017", "9.24.26", "9/24/2026".
export function titleDateYmd(title) {
  const t = String(title ?? "");
  const long = t.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2}),\s+(\d{4})\b/i);
  if (long) {
    const m = MONTHS.indexOf(long[1].toLowerCase()) + 1;
    return `${long[3]}${String(m).padStart(2, "0")}${long[2].padStart(2, "0")}`;
  }
  const short = t.match(/\b(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2}|\d{4})\b/);
  if (short) {
    const m = +short[1];
    const d = +short[2];
    if (m < 1 || m > 12 || d < 1 || d > 31) return "";
    const y = short[3].length === 2 ? `20${short[3]}` : short[3];
    return `${y}${String(m).padStart(2, "0")}${String(d).padStart(2, "0")}`;
  }
  return "";
}

// The game's calendar day in ET and in PT: a title names the local day, and a
// West Coast night game has already rolled over in ET.
function gameDays(gameMs) {
  if (!Number.isFinite(gameMs)) return [];
  return ["America/New_York", "America/Los_Angeles"].map((timeZone) =>
    new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" })
      .format(new Date(gameMs)).replace(/-/g, ""));
}
// Card ages are coarse ("1mo ago" covers 30–59 days), so the pre-filter is
// wider than the real upload-date gate the bake applies to the pick.
const EARLY_SLACK_MS = 3 * 86400e3;
const LATE_SLACK_MS = 16 * 86400e3;

// The cards worth checking, best first, from one channel search page.
// `cards` are parseYtVideoRenderers() rows with `publishedMs` added, or
// parseChannelFeed() rows. A card passes when it names both teams
// (`titleHasTeams`), carries the competition token when one is required
// (`compOk`), is not a women's / youth fixture (unless `womensGame`),
// runs at least `minSec` (a minute by default), is not excluded, names no
// other date than the game's own, and its age fits the game date. The date in
// the title matters for a series: AHA played Ohio State–Penn State on 9/24 and
// 9/25, and the 9/25 cut sits first on the page for both nights. A
// card whose age did not parse is kept but ranked after every dated one — the
// bake's watch-page date gate decides it.
export function pickChannelSearchCards(cards, { titleHasTeams, compOk = () => true, gameMs, exclude = [], limit = 2, minSec = MIN_HIGHLIGHT_SEC, womensGame = false }) {
  const skip = new Set(exclude.filter(Boolean));
  const days = gameDays(gameMs);
  const dated = [];
  const undated = [];
  for (const card of Array.isArray(cards) ? cards : []) {
    const title = String(card?.title ?? "");
    if (!card?.videoId || skip.has(card.videoId) || !title) continue;
    if (!womensGame && NOT_FIRST_TEAM_RX.test(title)) continue;
    if (Number.isFinite(card.durationSec) && card.durationSec < minSec) continue;
    if (!titleHasTeams(title) || !compOk(title)) continue;
    const named = titleDateYmd(title);
    if (named && days.length && !days.includes(named)) continue;
    if (Number.isFinite(card.publishedMs) && Number.isFinite(gameMs)) {
      if (card.publishedMs < gameMs - EARLY_SLACK_MS || card.publishedMs > gameMs + LATE_SLACK_MS) continue;
      dated.push(card);
    } else {
      undated.push(card);
    }
  }
  return [...dated, ...undated].slice(0, limit);
}

// Lower-cased, accent-free, punctuation-free — the form the competition token
// check compares ("EFL Championship" → "efl championship").
export function normalizeTitle(title) {
  return String(title ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function titleHasCompToken(title, tokens) {
  if (!tokens?.length) return true;
  const t = normalizeTitle(title);
  return tokens.some((tok) => {
    const n = normalizeTitle(tok);
    return n && t.includes(n);
  });
}
