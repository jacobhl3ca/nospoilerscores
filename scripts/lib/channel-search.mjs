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
};

export function channelSearchHandle(channel) {
  return (channel && CHANNEL_SEARCH_HANDLES[channel]) || null;
}

// Club channels post their women's, youth and reserve sides under the same
// two club names ("Albion Women 3-1 Birmingham City Women"). None of those is
// the ESPN game on the card.
export const NOT_FIRST_TEAM_RX = /\b(women|womens|ladies|lionesses|u-?1[5-9]|u-?2[0-3]|under[- ]?(?:1[5-9]|2[0-3])|academy|reserves?|pl2|premier league 2|youth|fa youth cup)\b/i;

// A goal clip, a reaction or a Short is not the game's highlight package.
const MIN_HIGHLIGHT_SEC = 60;
// Card ages are coarse ("1mo ago" covers 30–59 days), so the pre-filter is
// wider than the real upload-date gate the bake applies to the pick.
const EARLY_SLACK_MS = 3 * 86400e3;
const LATE_SLACK_MS = 16 * 86400e3;

// The cards worth checking, best first, from one channel search page.
// `cards` are parseYtVideoRenderers() rows with `publishedMs` added. A card
// passes when it names both teams (`titleHasTeams`), carries the competition
// token when one is required (`compOk`), is not a women's / youth fixture,
// runs at least a minute, is not excluded, and its age fits the game date. A
// card whose age did not parse is kept but ranked after every dated one — the
// bake's watch-page date gate decides it.
export function pickChannelSearchCards(cards, { titleHasTeams, compOk = () => true, gameMs, exclude = [], limit = 2 }) {
  const skip = new Set(exclude.filter(Boolean));
  const dated = [];
  const undated = [];
  for (const card of Array.isArray(cards) ? cards : []) {
    const title = String(card?.title ?? "");
    if (!card?.videoId || skip.has(card.videoId) || !title) continue;
    if (NOT_FIRST_TEAM_RX.test(title)) continue;
    if (Number.isFinite(card.durationSec) && card.durationSec < MIN_HIGHLIGHT_SEC) continue;
    if (!titleHasTeams(title) || !compOk(title)) continue;
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
