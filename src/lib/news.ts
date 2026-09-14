import { Sport } from "./types";
import { getApiBase } from "./youtube";
import { getTimeZone } from "./etDay";

// League-specific news (articles) — same host as the scoreboard API.
// site.web.api, NOT site.api: see the BASE_URL note in espn.ts. site.api
// answers a browser request without CORS headers, so this was failing exactly
// like the scoreboards did.
const BASE_URL = "https://site.web.api.espn.com/apis/site/v2/sports";
// ESPN "now" feed — homepage headlines across all sports.
const HOME_NEWS_URL = "https://now.core.api.espn.com/v1/sports/news";
// ESPN's JSON sports API has no Boxing league path (the obvious candidates
// return 400/404), but ESPN publishes this official CORS-open RSS feed.
const BOXING_RSS_URL = "https://www.espn.com/espn/rss/boxing/news";

const SPORT_NEWS_PATHS: Partial<Record<Sport, string>> = {
  mlb: "/baseball/mlb",
  nba: "/basketball/nba",
  wnba: "/basketball/wnba",
  ncaam: "/basketball/mens-college-basketball",
  ncaaw: "/basketball/womens-college-basketball",
  ncaaf: "/football/college-football",
  nfl: "/football/nfl",
  ufl: "/football/ufl",
  nhl: "/hockey/nhl",
  ncaah: "/hockey/mens-college-hockey",
  // Both /news feeds answered 200 on 2026-09-14.
  ncaabase: "/baseball/college-baseball",
  ncaasoft: "/baseball/college-softball",
  // Probed 2026-09-14: 200, 6 articles (women's tournament schedule/results).
  ncaawh: "/hockey/womens-college-hockey",
  // Probed 2026-09-14: 200, 6 articles (ESPN "Game Highlights" clips).
  ncaavb: "/volleyball/womens-college-volleyball",
  golf: "/golf/pga",
  // ESPN has no bare /tennis/news feed (404) — the ATP league feed carries the
  // marquee tennis news (Slams, both tours' headlines), so route tennis there.
  tennis: "/tennis/atp",
  // ESPN's bare /soccer/news now 404s; the World Cup league feed carries the
  // actual WC coverage (squads, match previews, group analysis). Route fifa
  // there so the "ESPN World Cup" news card stops coming back empty.
  fifa: "/soccer/fifa.world",
  epl: "/soccer/eng.1",
  mls: "/soccer/usa.1",
  ucl: "/soccer/uefa.champions",
  uel: "/soccer/uefa.europa",
  laliga: "/soccer/esp.1",
  seriea: "/soccer/ita.1",
  bundesliga: "/soccer/ger.1",
  ligue1: "/soccer/fra.1",
  // Second wave — same league-base + /news pattern (scoreboard path minus
  // /scoreboard). Without an entry here fetchLeagueNews() bails and the
  // column's ESPN card comes back permanently empty.
  ligamx: "/soccer/mex.1",
  nwsl: "/soccer/usa.nwsl",
  efl: "/soccer/eng.2",
  libertadores: "/soccer/conmebol.libertadores",
  euro: "/soccer/uefa.euro",
  afcon: "/soccer/caf.nations",
  saudi: "/soccer/ksa.1",
  // Cricket: same league-base + /news shape. Note this feed is ESPNcricinfo's
  // GENERAL cricket wire, not IPL-only — it carries county / Hundred / Test
  // headlines too. That's still the right feed (it's the only one ESPN serves
  // for the sport) and it's the same tradeoff tennis already makes by routing
  // through the ATP feed.
  cricket: "/cricket/8048",
  // Racing/combat leagues share ESPN's league-base + /news pattern (the path is
  // the scoreboard path minus /scoreboard — see espn.ts). Without these, the
  // "ESPN F1"/"ESPN UFC" cards that leagueSourceCascade() builds for every sport
  // always came back empty, since fetchLeagueNews() bails on a missing path.
  f1: "/racing/f1",
  // IndyCar's feed works (6 articles on 2026-08-03). NASCAR's is mapped to the
  // correct path but ESPN currently returns ZERO articles for it — every
  // nascar-* slug does, while the sibling f1 and irl feeds populate normally.
  // That reads as ESPN no longer producing NASCAR editorial (they haven't held
  // the rights in years), not a wrong path. Left wired anyway: it costs nothing,
  // it self-heals if ESPN ever backfills, and the NASCAR column's real payload
  // is the race tile, not the news card.
  indycar: "/racing/irl",
  nascar: "/racing/nascar-premier",
  ufc: "/mma/ufc",
};

export interface NewsItem {
  id: string;
  headline: string;
  description: string;
  published: string;
  imageUrl: string | null;
  articleUrl: string;
  byline: string;
  section: string;
  // Small sport badge shown before the headline in text cards (ESPN top
  // headlines uses this to tag each article with its league).
  leagueLogo?: string | null;
  // When the prebake finds the exact same clip uploaded to the league's
  // official YouTube channel (validated by channel author + title overlap),
  // the videoId goes here so the client can play it in the in-app modal.
  // When null/undefined, clicking the video opens the source URL in a new tab.
  youtubeVideoId?: string | null;
  // Direct HLS (or MP4) stream URL from the source itself — e.g. MLB's
  // statsapi serves per-highlight m3u8 playbacks that play in a native <video>.
  // When set, the modal plays this directly (bypassing YouTube entirely).
  playbackUrl?: string | null;
  // v.redd.it CMAF fallback URL — single muxed MP4 that plays in <video>
  // without hls.js. Set on Reddit posts where Reddit hosts the clip directly.
  videoUrl?: string | null;
  // Brightcove default-player iframe URL — set on NHL.com videos, which are
  // Brightcove-hosted rather than YouTube/raw-HLS. The modal renders it in a
  // plain <iframe> (embedMode), letting Brightcove handle policy key/geo/DRM.
  embedUrl?: string | null;
  // i.redd.it full-res image URL — set when the post is an image post hosted
  // on Reddit. Lets the client pop a lightbox instead of bouncing out.
  imageFullUrl?: string | null;
  // Every picture of a multi-image (Reddit gallery) post, full-res, in post
  // order. imageFullUrl is images[0]; the modal pages through the rest.
  images?: string[] | null;
  // The only picture we have is Reddit's 140px listing thumbnail (external-link
  // posts — the article's preview crop). Fine as a row tile, a blurry postage
  // stamp blown up, so the modal must NOT lightbox it.
  thumbOnly?: boolean;
  // Reddit selftext for text posts (no image/video). Raw markdown — rendered
  // by the modal with minimal formatting (paragraph breaks + autolinking).
  // Null for non-text posts so the modal layout stays a clean lightbox.
  body?: string | null;
  // Top Reddit comments for the post (prebaked — Reddit blocks client/datacenter
  // fetches, so the cron scrapes them from a residential IP). Plain text, spoiler-
  // blurred in the Feed view like headlines. Only set on Reddit items, and only
  // for the top handful of posts per feed (comment scraping is rate-limited).
  comments?: string[] | null;
}

interface RawImage { url?: string; height?: number; width?: number }
interface RawLink { href?: string }
interface RawLinks { web?: RawLink; mobile?: RawLink }
interface RawArticle {
  id?: string | number;
  nowId?: string;
  contentKey?: string;
  headline?: string;
  title?: string;
  description?: string;
  published?: string;
  lastModified?: string;
  images?: RawImage[];
  links?: RawLinks;
  byline?: string;
  section?: string;
  root?: string;
}

function parseArticle(raw: RawArticle): NewsItem {
  const links = raw.links ?? {};
  const articleUrl = links.web?.href ?? links.mobile?.href ?? "";
  // ESPN articles normally carry a stable id (or nowId/contentKey on the "now"
  // homepage feed). When every identifier AND the article URL are absent — seen
  // on some link-less "now" items — String(undefined ?? "") collapses to "", so
  // two such items would share the same empty React key (item.id is the key in
  // NewsColumn/AlignedVideoStrip) and reconcile onto each other, reusing the
  // wrong post on refresh. Fall back to the headline+published pair so a
  // link-less item still gets a distinct, render-stable key. Unchanged whenever
  // any real id — or a non-empty articleUrl — is present (the overwhelming case).
  const fallbackId = articleUrl || `${raw.headline ?? raw.title ?? ""}|${raw.published ?? raw.lastModified ?? ""}`;
  // Prefer the largest header-like image ESPN returns; fall back to first one with a url.
  const images = (raw.images ?? []).filter((i): i is RawImage & { url: string } => !!i.url);
  const best = images.reduce<(RawImage & { url: string }) | null>((acc, img) => {
    if (!acc) return img;
    const area = (img.width ?? 0) * (img.height ?? 0);
    const accArea = (acc.width ?? 0) * (acc.height ?? 0);
    return area > accArea ? img : acc;
  }, null);
  return {
    id: String(raw.id ?? raw.nowId ?? raw.contentKey ?? fallbackId),
    headline: raw.headline ?? raw.title ?? "",
    description: raw.description ?? "",
    published: raw.published ?? raw.lastModified ?? "",
    imageUrl: best?.url ?? null,
    articleUrl,
    byline: raw.byline ?? "",
    section: raw.section ?? raw.root ?? "",
  };
}

// RSS feeds (the boxing source below) emit <pubDate> in RFC-822 form
// ("Mon, 02 Jun 2025 14:30:00 +0000"), but the rest of the app treats
// NewsItem.published as an ISO-8601 instant: NewsFeed and VideoModal render it
// straight into <time dateTime={published}>, whose HTML datetime attribute is
// only valid as an ISO datetime — an RFC-822 value there is unparseable by
// assistive tech and crawlers, defeating the semantic-time markup those
// components deliberately add. ESPN's JSON feed already returns ISO, so normalize
// the RSS instant here too so both sources land in one format. An unparseable or
// absent date collapses to "" — the same empty sentinel parseArticle uses, which
// formatPublished already renders as blank (so the <time> simply doesn't paint).
function toIsoInstant(raw: string): string {
  const ms = Date.parse(raw);
  return Number.isNaN(ms) ? "" : new Date(ms).toISOString();
}

export async function fetchLeagueNews(sport: Sport, limit = 20): Promise<NewsItem[]> {
  if (sport === "boxing") {
    try {
      const res = await fetch(BOXING_RSS_URL);
      if (!res.ok) return [];
      const doc = new DOMParser().parseFromString(await res.text(), "text/xml");
      if (doc.querySelector("parsererror")) return [];
      return [...doc.querySelectorAll("item")].slice(0, limit).map((item) => {
        const value = (tag: string) => item.getElementsByTagName(tag)[0]?.textContent?.trim() ?? "";
        const articleUrl = value("link");
        return {
          id: value("guid") || articleUrl,
          headline: value("title"),
          description: value("description"),
          published: toIsoInstant(value("pubDate")),
          imageUrl: null,
          articleUrl,
          byline: value("dc:creator"),
          section: "Boxing",
        };
      }).filter((item) => item.headline && item.articleUrl);
    } catch {
      return [];
    }
  }
  const path = SPORT_NEWS_PATHS[sport];
  if (!path) return [];
  try {
    const res = await fetch(`${BASE_URL}${path}/news?limit=${limit}`);
    if (!res.ok) return [];
    const data = await res.json();
    return (data.articles ?? []).map(parseArticle);
  } catch {
    return [];
  }
}

export async function fetchTopHeadlines(limit = 20): Promise<NewsItem[]> {
  try {
    const res = await fetch(`${HOME_NEWS_URL}?limit=${limit}`);
    if (!res.ok) return [];
    const data = await res.json();
    return (data.headlines ?? []).map(parseArticle);
  } catch {
    return [];
  }
}

// Prebaked feeds live at /news/{name}.json — written by scripts/prebake-news.mjs
// on a schedule and deployed with the static site. Use these for origins that
// block direct browser fetches (MLB.com, NBA.com, NHL.com).
export async function fetchPrebaked(name: string): Promise<NewsItem[]> {
  // One quick retry before giving up: a single transient blip (CF cold-start,
  // R2 hiccup, flaky mobile radio) otherwise blanks a whole news column to "No
  // headlines" on what is really a momentary failure. cache:"no-store" keeps the
  // day fresh; the service worker still serves last-good on a hard outage.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(`${getApiBase()}/news/${name}.json`, { cache: "no-store" });
      if (!res.ok) {
        if (res.status >= 500 && attempt === 0) { await new Promise((r) => setTimeout(r, 400)); continue; }
        return [];
      }
      const data = await res.json();
      return (data.items ?? []) as NewsItem[];
    } catch {
      if (attempt === 0) { await new Promise((r) => setTimeout(r, 400)); continue; }
      return [];
    }
  }
  return [];
}

// Leagues that have a prebaked official-site feed. Add here as new scrapers land.
export const PREBAKED_FEEDS: Partial<Record<Sport, { name: string; label: string }>> = {
  mlb: { name: "mlb", label: "MLB.com" },
  nba: { name: "nba", label: "NBA.com" },
  wnba: { name: "wnba", label: "WNBA.com" },
  nhl: { name: "nhl", label: "NHL.com" },
};

// Small league badge shown left of the source label and the per-article
// headline. Two CDN paths cover every sport we surface — the
// `teamlogos/leagues` set for the leagues that have a proper logo there
// (MLB / NBA / NHL / etc.), and ESPN's redesign sport-icon set for the rest
// (NCAAM / golf / tennis / etc.). Every Sport must resolve so a new column
// never ships logo-less. EPL has its own slug under `leaguelogos/soccer`.
export const LEAGUE_LOGO: Record<Sport, string> = {
  mlb: "https://a.espncdn.com/combiner/i?img=/i/teamlogos/leagues/500/mlb.png&w=40&h=40&transparent=true",
  // Little League has no entry in the `teamlogos/leagues` set (llb.png 404s,
  // checked 2026-08-11). ESPN's own llb scoreboard serves the redesign
  // baseball sport-icon as its league logo, so use exactly that — same family
  // NASCAR and boxing already fall back to. Verified 200 image/png.
  llws: "https://a.espncdn.com/redesign/assets/img/icons/ESPN-icon-baseball.png",
  // College baseball's own scoreboard serves the same baseball sport-icon;
  // college softball has a real league mark (both read 2026-09-14).
  ncaabase: "https://a.espncdn.com/combiner/i?img=/redesign/assets/img/icons/ESPN-icon-baseball.png",
  ncaasoft: "https://a.espncdn.com/i/espn/misc_logos/500/ncaa_womens_softball.png",
  nba: "https://a.espncdn.com/combiner/i?img=/i/teamlogos/leagues/500/nba.png&w=40&h=40&transparent=true",
  wnba: "https://a.espncdn.com/combiner/i?img=/i/teamlogos/leagues/500/wnba.png&w=40&h=40&transparent=true",
  nhl: "https://a.espncdn.com/combiner/i?img=/i/teamlogos/leagues/500/nhl.png&w=40&h=40&transparent=true",
  nfl: "https://a.espncdn.com/combiner/i?img=/i/teamlogos/leagues/500/nfl.png&w=40&h=40&transparent=true",
  ufl: "https://a.espncdn.com/combiner/i?img=/i/teamlogos/leagues/500/ufl.png&w=40&h=40&transparent=true",
  mls: "https://a.espncdn.com/combiner/i?img=/i/teamlogos/leagues/500/mls.png&w=40&h=40&transparent=true",
  fifa: "https://a.espncdn.com/combiner/i?img=/i/teamlogos/leagues/500/fifa.png&w=40&h=40&transparent=true",
  // ESPN's CDN doesn't host real league logos for NCAAM or tennis — even
  // their own scoreboard API serves the generic ESPN-icon-* assets that look
  // like ESPN branding rather than league branding. Wikipedia hosts the
  // canonical NCAA and ITF (international governing body, neutral between
  // ATP/WTA) marks via upload.wikimedia.org, which allows hotlinking with a
  // browser UA and is fronted by Wikimedia's CDN.
  ncaam: "https://upload.wikimedia.org/wikipedia/commons/thumb/d/dd/NCAA_logo.svg/250px-NCAA_logo.svg.png",
  // NCAAW/NCAAF reuse the NCAA mark — same governing body, no league-specific
  // logo on ESPN's CDN. Distinction is in the column header label + game data.
  ncaaw: "https://upload.wikimedia.org/wikipedia/commons/thumb/d/dd/NCAA_logo.svg/250px-NCAA_logo.svg.png",
  ncaaf: "https://upload.wikimedia.org/wikipedia/commons/thumb/d/dd/NCAA_logo.svg/250px-NCAA_logo.svg.png",
  ncaah: "https://upload.wikimedia.org/wikipedia/commons/thumb/d/dd/NCAA_logo.svg/250px-NCAA_logo.svg.png",
  ncaawh: "https://upload.wikimedia.org/wikipedia/commons/thumb/d/dd/NCAA_logo.svg/250px-NCAA_logo.svg.png",
  // ESPN's own league mark for women's college volleyball (leagues[0].logos, 2026-09-14).
  ncaavb: "https://a.espncdn.com/combiner/i?img=/redesign/assets/img/icons/sports-volleyball-solid.png",
  golf: "https://a.espncdn.com/combiner/i?img=/i/teamlogos/leagues/500/pgatour.png&w=40&h=40&transparent=true",
  tennis: "https://upload.wikimedia.org/wikipedia/commons/thumb/1/16/International_Tennis_Federation_Logo.svg/250px-International_Tennis_Federation_Logo.svg.png",
  epl: "https://a.espncdn.com/i/leaguelogos/soccer/500/23.png",
  // UCL = ESPN soccer league id 2; UEL = id 2310.
  ucl: "https://a.espncdn.com/i/leaguelogos/soccer/500/2.png",
  uel: "https://a.espncdn.com/i/leaguelogos/soccer/500/2310.png",
  // ESPN soccer league ids, read straight off each scoreboard's `leagues[0].logos`
  // (verified 2026-08-03): LaLiga 15, Bundesliga 10, Serie A 12, Ligue 1 9.
  laliga: "https://a.espncdn.com/i/leaguelogos/soccer/500/15.png",
  bundesliga: "https://a.espncdn.com/i/leaguelogos/soccer/500/10.png",
  seriea: "https://a.espncdn.com/i/leaguelogos/soccer/500/12.png",
  ligue1: "https://a.espncdn.com/i/leaguelogos/soccer/500/9.png",
  // Second-wave league ids, read the same way — straight off each scoreboard's
  // `leagues[0].logos[0].href` on 2026-08-03: Liga MX 22, EFL Championship 24,
  // Libertadores 58, Euro 74, AFCON 76, NWSL 2323, Saudi Pro League 2488.
  ligamx: "https://a.espncdn.com/i/leaguelogos/soccer/500/22.png",
  efl: "https://a.espncdn.com/i/leaguelogos/soccer/500/24.png",
  libertadores: "https://a.espncdn.com/i/leaguelogos/soccer/500/58.png",
  euro: "https://a.espncdn.com/i/leaguelogos/soccer/500/74.png",
  afcon: "https://a.espncdn.com/i/leaguelogos/soccer/500/76.png",
  nwsl: "https://a.espncdn.com/i/leaguelogos/soccer/500/2323.png",
  saudi: "https://a.espncdn.com/i/leaguelogos/soccer/500/2488.png",
  // Cricket keys its league logos by series id under its own /cricket/ path
  // (8048 = IPL), not the /soccer/ path. Verified 200 on 2026-08-03.
  cricket: "https://a.espncdn.com/i/leaguelogos/cricket/500/8048.png",
  // Rugby has no `leaguelogos/rugby/500/<id>.png` set at all (8323 and 8337
  // both 404, checked 2026-08-11) — ESPN's own rugby scoreboards serve the
  // redesign sport icon as `leagues[0].logos[0]`, identically for all five
  // competitions. One shared mark is therefore what ESPN itself shows; the
  // competitions are told apart by their column label, not their badge.
  sixnations: "https://a.espncdn.com/redesign/assets/img/icons/ESPN-icon-rugby.png",
  rugbywc: "https://a.espncdn.com/redesign/assets/img/icons/ESPN-icon-rugby.png",
  rugbychamp: "https://a.espncdn.com/redesign/assets/img/icons/ESPN-icon-rugby.png",
  superrugby: "https://a.espncdn.com/redesign/assets/img/icons/ESPN-icon-rugby.png",
  rugbytest: "https://a.espncdn.com/redesign/assets/img/icons/ESPN-icon-rugby.png",
  nationschamp: "https://a.espncdn.com/redesign/assets/img/icons/ESPN-icon-rugby.png",
  // Racing has no entry in the `teamlogos/leagues` set (nascar/indycar/irl all
  // 404 there). NASCAR does have one in ESPN's redesign sport-icon set; IndyCar
  // has neither, so it falls back to Wikimedia exactly like NCAAM and tennis
  // already do. Both verified 200 image/png on 2026-08-03.
  nascar: "https://a.espncdn.com/redesign/assets/img/icons/ESPN-icon-nascar.png",
  indycar: "https://upload.wikimedia.org/wikipedia/commons/thumb/4/49/INDYCAR_textlogo.svg/250px-INDYCAR_textlogo.svg.png",
  f1:"https://a.espncdn.com/combiner/i?img=/i/teamlogos/leagues/500/f1.png&w=40&h=40&transparent=true",
  ufc: "https://a.espncdn.com/combiner/i?img=/i/teamlogos/leagues/500/ufc.png&w=40&h=40&transparent=true",
  // ESPN publishes no league logo for chess/poker/esports (it does not carry
  // them). Chess and esports pointed at the UFC mark — a copy-paste slip, so
  // every chess and esports card in the app was flying a UFC logo (spotted in
  // the league picker, 2026-08-09). Locally-served glyphs instead, matching the
  // poker one that was already done this way: no hotlink to 404 or mislabel.
  // Was networks_shows/500/boxing.png — a 404 (verified 2026-08-09), so every
  // boxing card shipped logo-less. ESPN's redesign icon set has a real one,
  // same path family NASCAR already uses.
  boxing: "https://a.espncdn.com/redesign/assets/img/icons/ESPN-icon-boxing.png",
  chess: "/chess.svg",
  poker: "/poker.svg",
  esports: "/esports.svg",
  // Top events: an inline star so the picker pill and switcher never hotlink
  // anything for a column that has no league behind it.
  top: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath fill='%23f5a524' d='M12 2l2.9 6.6 7.1.7-5.4 4.8 1.6 7L12 17.3 5.8 21l1.6-7L2 9.3l7.1-.7z'/%3E%3C/svg%3E",
};

// ESPN brand mark — used as the source-card logo for ESPN-branded feeds
// (ESPN Videos, ESPN top headlines, ESPN <league>) so those headers don't
// inherit the league logo and look identical to MLB.com / NBA.com cards.
export const ESPN_BRAND_LOGO = "https://a.espncdn.com/i/espn/misc_logos/500/espn.png";

export interface ColumnSource {
  label: string;
  key: string;
  kind: "prebaked" | "espn-league";
  sport?: Sport;
  logoUrl?: string;
  variant?: "text" | "video";
  // YouTube channel hint for video cards — ensures the in-app player plays the
  // actual league highlight rather than a random search result.
  youtubeChannel?: string;
}

// Leagues with a prebaked video feed (big-format highlights). `channel` is the
// official YouTube channel name passed to the /api/youtube lookup so the modal
// player finds the exact clip instead of a generic search hit.
const PREBAKED_VIDEOS: Partial<Record<Sport, { key: string; label: string; channel?: string }>> = {
  mlb: { key: "mlb-videos", label: "MLB Most Popular", channel: "MLB" },
  nba: { key: "nba-videos", label: "NBA Top Videos", channel: "NBA" },
  wnba: { key: "wnba-videos", label: "WNBA Top Videos", channel: "WNBA" },
  nhl: { key: "nhl-videos", label: "NHL Top Videos", channel: "NHL" },
  // World Cup + MLS have no scrapeable .com video feed — their leading video
  // card is baked from the league's official YouTube channel (prebake-news.mjs
  // fetchYouTubeChannelVideos), so items already carry youtubeVideoId.
  fifa: { key: "fifa-videos", label: "World Cup Top Videos", channel: "FIFA" },
  mls: { key: "mls-videos", label: "MLS Top Videos", channel: "MLS" },
};

// Per-league subreddit card — pinned just below the official news link since
// Reddit's "hot" surfaces story-of-the-hour posts that official feeds miss.
const REDDIT_SUB: Partial<Record<Sport, { key: string; label: string }>> = {
  mlb: { key: "reddit-mlb", label: "r/baseball" },
  nba: { key: "reddit-nba", label: "r/nba" },
  wnba: { key: "reddit-wnba", label: "r/wnba" },
  nhl: { key: "reddit-nhl", label: "r/hockey" },
  nfl: { key: "reddit-nfl", label: "r/nfl" },
  ncaam: { key: "reddit-ncaam", label: "r/CollegeBasketball" },
  golf: { key: "reddit-golf", label: "r/golf" },
  tennis: { key: "reddit-tennis", label: "r/tennis" },
  epl: { key: "reddit-epl", label: "r/PremierLeague" },
  mls: { key: "reddit-mls", label: "r/MLS" },
  ucl: { key: "reddit-ucl", label: "r/championsleague" },
  uel: { key: "reddit-uel", label: "r/EuropaLeague" },
  fifa: { key: "reddit-fifa", label: "r/worldcup" },
  ncaaf: { key: "reddit-ncaaf", label: "r/CFB" },
  // r/Cricket added 2026-08-03. It is the general cricket sub (county, the
  // Hundred, Tests, internationals), which matches our ESPN cricket wire —
  // deliberately not an IPL-only sub. One more feed costs one more 45s gate
  // slot in the reddit bake; see the batch/cooldown notes in prebake-news.mjs.
  cricket: { key: "reddit-cricket", label: "r/Cricket" },
  ncaaw: { key: "reddit-ncaaw", label: "r/ncaaw" },
  ncaah: { key: "reddit-ncaah", label: "r/collegehockey" },
  // r/UFL is the University of Florida (checked 2026-09-14); the league's live
  // sub is r/UnitedFootballLeague (r/UFL_Football stopped in Feb 2025).
  ufl: { key: "reddit-ufl", label: "r/UnitedFootballLeague" },
  // 2026-09-14: college baseball gets r/collegebaseball. Softball has NO card
  // on purpose — no sub with volume (r/collegesoftball is near-empty).
  ncaabase: { key: "reddit-ncaabase", label: "r/collegebaseball" },
  // r/collegehockey covers both tours, so the women's column reads the SAME
  // baked snapshot — no second bake job, no second staleness entry.
  ncaawh: { key: "reddit-ncaah", label: "r/collegehockey" },
  ufc: { key: "reddit-ufc", label: "r/ufc" },
  boxing: { key: "reddit-boxing", label: "r/Boxing" },
  f1: { key: "reddit-f1", label: "r/formula1" },
  // NWSL + the two US racing series added 2026-08-04, same 45s-per-feed cost
  // as cricket. NWSL gets its own sub rather than the r/soccer firehose for
  // the reason spelled out in SOCCER_REDDIT_FIREHOSE below. NASCAR and IndyCar
  // had no discussion layer at all — ESPN's racing wire is their only card.
  nwsl: { key: "reddit-nwsl", label: "r/NWSL" },
  nascar: { key: "reddit-nascar", label: "r/NASCAR" },
  indycar: { key: "reddit-indycar", label: "r/INDYCAR" },
};

// Cascade of news cards for a league column. The stable smart order is:
//   Reddit → highlights video → ESPN headlines.
// Reddit's community discussion leads every column (Jacob 7/16, matching the
// per-push order below and GENERIC_CASCADE); the playable highlight video keeps
// the Cards columns aligned and ESPN closes as the reliable catch-all. The
// official-site feeds (MLB.com Most Popular / NBA.com) and the BBC / Guardian
// editorial substitutes were dropped here: the .com feeds duplicated ESPN
// coverage and the substitutes went unused. PREBAKED_FEEDS is still exported /
// baked in case we want to re-add them. CBS Sports + theScore were dropped
// earlier for the same duplicate-of-ESPN reason.
const SOCCER_REDDIT_FIREHOSE = new Set<Sport>([
  "fifa", "epl", "ucl", "uel", "laliga", "seriea", "bundesliga", "ligue1",
  // Second wave joins the shared r/soccer bake rather than getting seven new
  // per-league subs — same call, and same reason, as the big-five block: every
  // new sub is another prebake job competing for the Mac mini's Reddit per-IP
  // budget, which is the known cause of the 429 storms.
  "ligamx", "efl", "libertadores", "euro", "afcon", "saudi",
  // nwsl is deliberately NOT here. r/soccer is overwhelmingly men's club
  // football, so piping it into the NWSL column would fill that column with
  // news about a different sport. As of 2026-08-04 NWSL has its own r/NWSL
  // entry in REDDIT_SUB above instead.
]);

// ESPN card label per league. Default is `ESPN ${sport.toUpperCase()}`, which
// reads fine for acronym sports (ESPN NBA) but not for the word-shaped soccer
// keys — "ESPN LALIGA" / "ESPN SERIEA" / "ESPN LIGUE1". Override those.
const ESPN_LEAGUE_LABEL: Partial<Record<Sport, string>> = {
  fifa: "ESPN World Cup",
  laliga: "ESPN La Liga",
  seriea: "ESPN Serie A",
  bundesliga: "ESPN Bundesliga",
  ligue1: "ESPN Ligue 1",
  // Second wave — every one of these keys is word-shaped, so without an
  // override they'd render as "ESPN LIGAMX" / "ESPN LIBERTADORES" / "ESPN EFL".
  // (nwsl and afcon are genuine acronyms and fall through to the default.)
  ligamx: "ESPN Liga MX",
  efl: "ESPN Championship",
  libertadores: "ESPN Libertadores",
  euro: "ESPN Euro",
  saudi: "ESPN Saudi Pro League",
};

export function leagueSourceCascade(sport: Sport): ColumnSource[] {
  // ESPN has no poker desk/league feed. Do not manufacture an "ESPN POKER"
  // card that can only return empty; the score/event view remains complete.
  if (sport === "poker") return [];
  const logoUrl = LEAGUE_LOGO[sport];
  const out: ColumnSource[] = [];
  // Reddit FIRST (Jacob 7/16): the freshest community discussion leads every
  // column, above the official highlight video and the ESPN catch-all.
  const reddit = REDDIT_SUB[sport];
  if (reddit) out.push({ label: reddit.label, key: reddit.key, kind: "prebaked", logoUrl });
  // The soccer league columns also get the high-volume r/soccer firehose
  // alongside their dedicated subs (World Cup Jacob 6/4; EPL/UCL/UEL Jacob
  // 7/20 — their own subs are lower-volume). One shared reddit-soccer bake
  // feeds all four cards. MLS deliberately excluded: r/soccer is Euro-centric
  // and r/MLS carries the MLS discussion.
  // La Liga / Serie A / Bundesliga / Ligue 1 get r/soccer as their ONLY Reddit
  // card — deliberately no dedicated per-league sub. Each new sub means another
  // prebake job on the Mac mini, and that box's Reddit per-IP budget is already
  // the known cause of 429 storms across the 19 existing feeds (see the
  // reddit-budget contention notes). r/soccer is Euro-centric and covers all
  // four leagues heavily, so the marginal value doesn't justify the risk.
  if (SOCCER_REDDIT_FIREHOSE.has(sport)) {
    out.push({ label: "r/soccer", key: "reddit-soccer", kind: "prebaked", logoUrl });
  }
  // Spoiler-safe highlight video next, where the league has a prebaked feed.
  const officialVideos = PREBAKED_VIDEOS[sport];
  if (officialVideos) out.push({ label: officialVideos.label, key: officialVideos.key, kind: "prebaked", logoUrl, variant: "video", youtubeChannel: officialVideos.channel });
  // ESPN headlines close out the column — the reliable catch-all. fifa's ESPN
  // feed is the World Cup league feed (see SPORT_NEWS_PATHS), labeled as such.
  const espnLabel = ESPN_LEAGUE_LABEL[sport] ?? `ESPN ${sport.toUpperCase()}`;
  out.push({ label: espnLabel, key: `espn-${sport}`, kind: "espn-league", sport, logoUrl: ESPN_BRAND_LOGO });
  return out;
}

// Fixed global league priority for the MOBILE merged news feed (Jacob 6/1).
// The desktop columns use the app's canonical precedence (NBA before MLB), but
// the single mobile feed is hand-ordered MLB-first and stays that way no matter
// how the scores columns are arranged. Whichever two leagues are in season sort
// by this list to decide which leads the merged feed. Tune here (or, later, via
// the filter button — backlogged) to re-rank. Leagues not listed fall to the
// tail in their column order.
export const MOBILE_NEWS_LEAGUE_ORDER: Sport[] = [
  "mlb", "nba", "nhl", "nfl", "ncaam", "ncaaf", "ufl",
  "fifa", "epl", "ucl", "uel", "laliga", "seriea", "bundesliga", "ligue1",
  "mls", "golf", "tennis", "wnba", "ncaaw", "ncaavb", "ncaah", "ncaawh", "ncaabase", "ncaasoft",
  // Second-wave soccer sorts below the established leagues in the merged mobile
  // feed, Liga MX first (largest US audience of the group). The two
  // yearCycle-gated national-team tournaments sit just above it, since in a year
  // when they're active they're the biggest story in the sport.
  "euro", "afcon", "ligamx", "nwsl", "efl", "libertadores", "saudi",
  "cricket",
  "ufc", "boxing", "f1", "nascar", "indycar", "poker",
];

// Col 3's default (no league picked): Reddit-first (Jacob 7/16) — r/sports leads,
// then the ESPN video and headlines catch-all. CBS / theScore remain out.
export const GENERIC_CASCADE: ColumnSource[] = [
  { label: "r/sports", key: "reddit-general", kind: "prebaked" },
  { label: "ESPN Videos", key: "espn-videos", kind: "prebaked", variant: "video", youtubeChannel: "ESPN", logoUrl: ESPN_BRAND_LOGO },
  { label: "ESPN", key: "espn-top", kind: "prebaked", logoUrl: ESPN_BRAND_LOGO },
];

// Classify a news source by its origin for the funnel source filter.
//  - reddit:    `reddit-*` keys (r/sports, r/nba, …)
//  - topvideos: any `*-videos` feed (NBA Top Videos, MLB Most Popular, ESPN Videos)
//  - espn:      ESPN headlines + ESPN per-league cards (`espn-top`, `espn-<sport>`)
//  - homepage:  the league-official site feeds (NBA.com / MLB.com — bare sport keys)
export type NewsSourceType = "topvideos" | "espn" | "reddit" | "homepage";
export function classifySource(src: { key?: string; label?: string }): NewsSourceType {
  const key = src.key ?? "";
  if (key.startsWith("reddit-")) return "reddit";
  if (key.endsWith("-videos")) return "topvideos";
  if (key.startsWith("espn")) return "espn";
  return "homepage";
}

// Reddit's preview.redd.it / external-preview.redd.it images get blocked by
// Safari's anti-tracking and Firefox's strict mode when loaded as third-party
// from hidescore.com — the request silently fails and onError fires, so the
// thumbnail container is dropped and the row collapses to text. Proxying the
// URL through a first-party-looking image proxy bypasses both. weserv.nl is
// a stable, widely-used free image proxy (Cloudflare-fronted, IIIF-compatible)
// that returns the image with permissive CORS and re-encodes WebP→JPEG so
// older clients are happy. No-op for non-redd.it URLs.
// `width` caps the delivered pixels: Reddit gallery images come through at the
// original capture size (4000px+ / 3.5 MB each), which is absurd for a phone
// lightbox — weserv resizes on its side, so we ship ~1400px/0.5 MB instead.
// `&we` = never enlarge, so a small thumbnail is passed through untouched
// rather than being upscaled into mush.
export function proxyImage(url: string | null | undefined, width?: number): string | undefined {
  if (!url) return undefined;
  if (!/\.redd\.it\//.test(url)) return url;
  const w = width ? `&w=${width}&we` : "";
  return `https://images.weserv.nl/?url=${encodeURIComponent(url.replace(/^https?:\/\//, ""))}${w}`;
}

export function formatPublished(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const diffMs = Date.now() - d.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  // Format this absolute instant in the app's effective time zone (the Settings
  // "Time zone" override, or the device zone by default) so the fallback date
  // agrees with every other absolute-instant label in the app — WorldCupBracket,
  // EventCard, GameHighlights, TeamView all pass timeZone: getTimeZone() here.
  // Without it, an article published near local midnight and older than 7 days
  // could render the wrong calendar day for a user on a non-device zone. No-op
  // for the default (no-override) case, where getTimeZone() is the device zone.
  const tz = getTimeZone();
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", timeZone: tz };
  // Add the year when the article isn't from the current year (in the same
  // effective zone), so a cross-year fallback isn't ambiguous — near January an
  // item older than 7 days could otherwise show a bare "Dec 28" that reads as
  // either last year or this. Same-year items (the overwhelmingly common case)
  // stay byte-identical to before.
  const yearIn = (dt: Date) => dt.toLocaleDateString("en-US", { year: "numeric", timeZone: tz });
  if (yearIn(d) !== yearIn(new Date())) opts.year = "numeric";
  return d.toLocaleDateString("en-US", opts);
}
