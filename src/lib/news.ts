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
