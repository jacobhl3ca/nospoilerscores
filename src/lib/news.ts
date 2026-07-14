import { Sport } from "./types";
import { getApiBase } from "./youtube";
import { getTimeZone } from "./etDay";

// League-specific news (articles) — CORS-open, same origin as scoreboard API.
const BASE_URL = "https://site.api.espn.com/apis/site/v2/sports";
// ESPN "now" feed — homepage headlines across all sports.
const HOME_NEWS_URL = "https://now.core.api.espn.com/v1/sports/news";

const SPORT_NEWS_PATHS: Partial<Record<Sport, string>> = {
  mlb: "/baseball/mlb",
  nba: "/basketball/nba",
  wnba: "/basketball/wnba",
  ncaam: "/basketball/mens-college-basketball",
  ncaaw: "/basketball/womens-college-basketball",
  ncaaf: "/football/college-football",
  nfl: "/football/nfl",
  nhl: "/hockey/nhl",
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
  // Racing/combat leagues share ESPN's league-base + /news pattern (the path is
  // the scoreboard path minus /scoreboard — see espn.ts). Without these, the
  // "ESPN F1"/"ESPN UFC" cards that leagueSourceCascade() builds for every sport
  // always came back empty, since fetchLeagueNews() bails on a missing path.
  f1: "/racing/f1",
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
  // Prefer the largest header-like image ESPN returns; fall back to first one with a url.
  const images = (raw.images ?? []).filter((i): i is RawImage & { url: string } => !!i.url);
  const best = images.reduce<(RawImage & { url: string }) | null>((acc, img) => {
    if (!acc) return img;
    const area = (img.width ?? 0) * (img.height ?? 0);
    const accArea = (acc.width ?? 0) * (acc.height ?? 0);
    return area > accArea ? img : acc;
  }, null);
  return {
    id: String(raw.id ?? raw.nowId ?? raw.contentKey ?? articleUrl),
    headline: raw.headline ?? raw.title ?? "",
    description: raw.description ?? "",
    published: raw.published ?? raw.lastModified ?? "",
    imageUrl: best?.url ?? null,
    articleUrl,
    byline: raw.byline ?? "",
    section: raw.section ?? raw.root ?? "",
  };
}

export async function fetchLeagueNews(sport: Sport, limit = 20): Promise<NewsItem[]> {
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
const LEAGUE_LOGO: Record<Sport, string> = {
  mlb: "https://a.espncdn.com/combiner/i?img=/i/teamlogos/leagues/500/mlb.png&w=40&h=40&transparent=true",
  nba: "https://a.espncdn.com/combiner/i?img=/i/teamlogos/leagues/500/nba.png&w=40&h=40&transparent=true",
  wnba: "https://a.espncdn.com/combiner/i?img=/i/teamlogos/leagues/500/wnba.png&w=40&h=40&transparent=true",
  nhl: "https://a.espncdn.com/combiner/i?img=/i/teamlogos/leagues/500/nhl.png&w=40&h=40&transparent=true",
  nfl: "https://a.espncdn.com/combiner/i?img=/i/teamlogos/leagues/500/nfl.png&w=40&h=40&transparent=true",
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
  golf: "https://a.espncdn.com/combiner/i?img=/i/teamlogos/leagues/500/pgatour.png&w=40&h=40&transparent=true",
  tennis: "https://upload.wikimedia.org/wikipedia/commons/thumb/1/16/International_Tennis_Federation_Logo.svg/250px-International_Tennis_Federation_Logo.svg.png",
  epl: "https://a.espncdn.com/i/leaguelogos/soccer/500/23.png",
  // UCL = ESPN soccer league id 2; UEL = id 2310.
  ucl: "https://a.espncdn.com/i/leaguelogos/soccer/500/2.png",
  uel: "https://a.espncdn.com/i/leaguelogos/soccer/500/2310.png",
  f1: "https://a.espncdn.com/combiner/i?img=/i/teamlogos/leagues/500/f1.png&w=40&h=40&transparent=true",
  ufc: "https://a.espncdn.com/combiner/i?img=/i/teamlogos/leagues/500/ufc.png&w=40&h=40&transparent=true",
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
  ncaaw: { key: "reddit-ncaaw", label: "r/ncaaw" },
};

// Cascade of news cards for a league column. Order (Jacob 2026-07-14):
//   Reddit → highlights video → ESPN headlines.
// The subreddit leads — its "hot" feed is the freshest, most-used source. The
// official-site feeds (MLB.com Most Popular / NBA.com) and the BBC / Guardian
// editorial substitutes were dropped here: the .com feeds duplicated ESPN
// coverage and the substitutes went unused. PREBAKED_FEEDS is still exported /
// baked in case we want to re-add them. CBS Sports + theScore were dropped
// earlier for the same duplicate-of-ESPN reason.
export function leagueSourceCascade(sport: Sport): ColumnSource[] {
  const logoUrl = LEAGUE_LOGO[sport];
  const out: ColumnSource[] = [];
  // Reddit first.
  const reddit = REDDIT_SUB[sport];
  if (reddit) out.push({ label: reddit.label, key: reddit.key, kind: "prebaked", logoUrl });
  // World Cup also gets the high-volume r/soccer firehose alongside r/worldcup
  // (Jacob 6/4). reddit-soccer is baked by prebake-news.mjs.
  if (sport === "fifa") out.push({ label: "r/soccer", key: "reddit-soccer", kind: "prebaked", logoUrl });
  // Highlights video (spoiler-safe), where the league has a prebaked feed.
  const officialVideos = PREBAKED_VIDEOS[sport];
  if (officialVideos) out.push({ label: officialVideos.label, key: officialVideos.key, kind: "prebaked", logoUrl, variant: "video", youtubeChannel: officialVideos.channel });
  // ESPN headlines close out the column — the reliable catch-all. fifa's ESPN
  // feed is the World Cup league feed (see SPORT_NEWS_PATHS), labeled as such.
  const espnLabel = sport === "fifa" ? "ESPN World Cup" : `ESPN ${sport.toUpperCase()}`;
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
  "mlb", "nba", "nhl", "nfl", "ncaam", "ncaaf",
  "fifa", "epl", "ucl", "uel", "mls", "golf", "tennis", "wnba", "ncaaw",
];

// Col 3's default (no league picked) — Reddit first (Jacob 2026-07-14), then
// the ESPN video + headline pair. CBS / theScore removed earlier at Jacob's
// request.
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
export function proxyImage(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  if (!/\.redd\.it\//.test(url)) return url;
  return `https://images.weserv.nl/?url=${encodeURIComponent(url.replace(/^https?:\/\//, ""))}`;
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
