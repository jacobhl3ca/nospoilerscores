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
  // search page puts it first.
  "Atlantic Hockey America": "atlantichockeyamerica",
};

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
// `cards` are parseYtVideoRenderers() rows with `publishedMs` added. A card
// passes when it names both teams (`titleHasTeams`), carries the competition
// token when one is required (`compOk`), is not a women's / youth fixture,
// runs at least `minSec` (a minute by default), is not excluded, names no
// other date than the game's own, and its age fits the game date. The date in
// the title matters for a series: AHA played Ohio State–Penn State on 9/24 and
// 9/25, and the 9/25 cut sits first on the page for both nights. A
// card whose age did not parse is kept but ranked after every dated one — the
// bake's watch-page date gate decides it.
export function pickChannelSearchCards(cards, { titleHasTeams, compOk = () => true, gameMs, exclude = [], limit = 2, minSec = MIN_HIGHLIGHT_SEC }) {
  const skip = new Set(exclude.filter(Boolean));
  const days = gameDays(gameMs);
  const dated = [];
  const undated = [];
  for (const card of Array.isArray(cards) ? cards : []) {
    const title = String(card?.title ?? "");
    if (!card?.videoId || skip.has(card.videoId) || !title) continue;
    if (NOT_FIRST_TEAM_RX.test(title)) continue;
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
