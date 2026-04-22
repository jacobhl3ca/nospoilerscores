import { Sport } from "./types";

// League-specific news (articles) — CORS-open, same origin as scoreboard API.
const BASE_URL = "https://site.api.espn.com/apis/site/v2/sports";
// ESPN "now" feed — homepage headlines across all sports.
const HOME_NEWS_URL = "https://now.core.api.espn.com/v1/sports/news";

const SPORT_NEWS_PATHS: Partial<Record<Sport, string>> = {
  mlb: "/baseball/mlb",
  nba: "/basketball/nba",
  ncaam: "/basketball/mens-college-basketball",
  nfl: "/football/nfl",
  nhl: "/hockey/nhl",
  golf: "/golf/pga",
  tennis: "/tennis",
  fifa: "/soccer",
  epl: "/soccer/eng.1",
  mls: "/soccer/usa.1",
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
  try {
    const res = await fetch(`/news/${name}.json`, { cache: "no-store" });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.items ?? []) as NewsItem[];
  } catch {
    return [];
  }
}

// Leagues that have a prebaked official-site feed. Add here as new scrapers land.
export const PREBAKED_FEEDS: Partial<Record<Sport, { name: string; label: string }>> = {
  mlb: { name: "mlb", label: "MLB.com" },
  nba: { name: "nba", label: "NBA.com" },
  nhl: { name: "nhl", label: "NHL.com" },
};

// Which leagues have a CBS Sports RSS + prebaked JSON available.
const HAS_CBS: Record<Sport, boolean> = {
  mlb: true, nba: true, nhl: true, nfl: true, ncaam: true,
  golf: true, tennis: true, epl: true, mls: true, fifa: false,
};

// Which leagues have a theScore per-league endpoint + prebaked JSON.
const HAS_THESCORE: Record<Sport, boolean> = {
  mlb: true, nba: true, nhl: true, nfl: true, ncaam: true,
  epl: true, mls: true, golf: false, tennis: false, fifa: false,
};

// Small league badge — ESPN's CDN serves transparent versions at this path.
// Only slugs that actually resolve are listed here; NCAAM / golf / tennis / EPL
// don't have a matching logo on this CDN path, so those cards render without an icon.
const LEAGUE_LOGO: Partial<Record<Sport, string>> = {
  mlb: "https://a.espncdn.com/combiner/i?img=/i/teamlogos/leagues/500/mlb.png&w=40&h=40&transparent=true",
  nba: "https://a.espncdn.com/combiner/i?img=/i/teamlogos/leagues/500/nba.png&w=40&h=40&transparent=true",
  nhl: "https://a.espncdn.com/combiner/i?img=/i/teamlogos/leagues/500/nhl.png&w=40&h=40&transparent=true",
  nfl: "https://a.espncdn.com/combiner/i?img=/i/teamlogos/leagues/500/nfl.png&w=40&h=40&transparent=true",
  mls: "https://a.espncdn.com/combiner/i?img=/i/teamlogos/leagues/500/mls.png&w=40&h=40&transparent=true",
  fifa: "https://a.espncdn.com/combiner/i?img=/i/teamlogos/leagues/500/fifa.png&w=40&h=40&transparent=true",
};

export interface ColumnSource {
  label: string;
  key: string;
  kind: "prebaked" | "espn-league";
  sport?: Sport;
  logoUrl?: string;
  variant?: "text" | "video";
}

// Leagues with a prebaked video feed (big-format highlights).
const PREBAKED_VIDEOS: Partial<Record<Sport, { key: string; label: string }>> = {
  mlb: { key: "mlb-videos", label: "MLB Most Popular" },
  nba: { key: "nba-videos", label: "NBA Top Videos" },
};

// Cascade of news cards for a league column: official news → official videos →
// ESPN news → CBS → theScore. Sources with no feed are silently skipped.
export function leagueSourceCascade(sport: Sport): ColumnSource[] {
  const logoUrl = LEAGUE_LOGO[sport];
  const out: ColumnSource[] = [];
  const official = PREBAKED_FEEDS[sport];
  if (official) out.push({ label: official.label, key: official.name, kind: "prebaked", logoUrl });
  const officialVideos = PREBAKED_VIDEOS[sport];
  if (officialVideos) out.push({ label: officialVideos.label, key: officialVideos.key, kind: "prebaked", logoUrl, variant: "video" });
  out.push({ label: `ESPN ${sport.toUpperCase()}`, key: `espn-${sport}`, kind: "espn-league", sport, logoUrl });
  if (HAS_CBS[sport]) out.push({ label: "CBS Sports", key: `cbs-${sport}`, kind: "prebaked", logoUrl });
  if (HAS_THESCORE[sport]) out.push({ label: "theScore", key: `thescore-${sport}`, kind: "prebaked", logoUrl });
  return out;
}

// Col 3's default (no league picked) — ESPN homepage top headlines (exact order)
// + ESPN big-format videos + theScore + CBS Sports aggregators.
export const GENERIC_CASCADE: ColumnSource[] = [
  { label: "ESPN", key: "espn-top", kind: "prebaked" },
  { label: "ESPN Videos", key: "espn-videos", kind: "prebaked", variant: "video" },
  { label: "theScore", key: "thescore-general", kind: "prebaked" },
  { label: "CBS Sports", key: "cbs-general", kind: "prebaked" },
];

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
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
