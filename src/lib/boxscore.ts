import type { Game, Sport } from "./types";
import { BASE_URL, SPORT_PATHS } from "./espn";

// Our own box score, read from ESPN's per-event summary endpoint (open CORS,
// ~65 KB gzipped for MLB). The popup fetches it ONLY after the user taps
// "Show box score" behind the warning, so no score is in the DOM before that.
// One shape covers every league below: boxscore.players[team].statistics[group]
// = { name|type|text, labels[], athletes[{ athlete, stats[] }], totals? }, and
// the line score sits in header.competitions[0].competitors[].linescores.
// Every other league keeps the plain "Open ESPN" link.
export const BOXSCORE_SPORTS: ReadonlySet<Sport> = new Set<Sport>([
  "mlb", "nba", "wnba", "ncaam", "ncaaw", "ncaaf", "nfl", "nhl",
]);

export interface BoxScoreGroup {
  title: string;
  labels: string[];
  rows: { name: string; stats: string[] }[];
  totals: string[] | null;
}

export interface BoxScoreTeam {
  abbr: string;
  name: string;
  logo: string;
  lineScore: string[];
  total: string;
  // MLB only: hits + errors, summed from the per-inning line score.
  hits: string | null;
  errors: string | null;
  groups: BoxScoreGroup[];
}

export interface BoxScore {
  // Away first, the way the popup lists the matchup.
  teams: BoxScoreTeam[];
}

export function summaryUrl(game: Pick<Game, "id" | "sport">): string | null {
  if (!BOXSCORE_SPORTS.has(game.sport)) return null;
  const path = SPORT_PATHS[game.sport];
  if (!path || !game.id) return null;
  return `${BASE_URL}${path.replace(/\/scoreboard$/, "/summary")}?event=${encodeURIComponent(game.id)}`;
}

type Json = Record<string, unknown>;
const isObj = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown): string => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "");

// "kickReturns" → "Kick returns", "batting" → "Batting".
function groupTitle(g: Json): string {
  const raw = str(g.name) || str(g.type);
  if (!raw) return "Players";
  const words = raw.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function parseGroup(g: unknown): BoxScoreGroup | null {
  if (!isObj(g) || !Array.isArray(g.labels) || !Array.isArray(g.athletes)) return null;
  const labels = g.labels.map(str);
  const rows: BoxScoreGroup["rows"] = [];
  for (const a of g.athletes) {
    if (!isObj(a) || !Array.isArray(a.stats) || a.stats.length === 0) continue;
    const ath = isObj(a.athlete) ? a.athlete : {};
    const name = str(ath.shortName) || str(ath.displayName);
    if (!name) continue;
    rows.push({ name, stats: a.stats.map(str) });
  }
  // NHL sends a "skaters" group with no athletes; NBA lists DNPs with no stats.
  if (rows.length === 0) return null;
  const totals = Array.isArray(g.totals) && g.totals.some((t) => str(t) !== "") ? g.totals.map(str) : null;
  return { title: groupTitle(g), labels, rows, totals };
}

function logoOf(team: Json): string {
  if (Array.isArray(team.logos) && isObj(team.logos[0])) return str(team.logos[0].href);
  return str(team.logo);
}

export function parseBoxScore(json: unknown): BoxScore | null {
  if (!isObj(json) || !isObj(json.header) || !Array.isArray(json.header.competitions)) return null;
  const comp = json.header.competitions[0];
  if (!isObj(comp) || !Array.isArray(comp.competitors) || comp.competitors.length !== 2) return null;
  const box = isObj(json.boxscore) ? json.boxscore : {};
  const players = Array.isArray(box.players) ? box.players : [];

  const sides: { home: boolean; team: BoxScoreTeam }[] = [];
  for (const c of comp.competitors) {
    if (!isObj(c) || !isObj(c.team)) return null;
    const team = c.team;
    const id = str(team.id);
    const lines = Array.isArray(c.linescores) ? c.linescores.filter(isObj) : [];
    const sum = (k: string) => (lines.some((l) => typeof l[k] === "number") ? String(lines.reduce((n, l) => n + (typeof l[k] === "number" ? (l[k] as number) : 0), 0)) : null);
    const entry = players.find((p) => isObj(p) && isObj(p.team) && str(p.team.id) === id);
    const groups = isObj(entry) && Array.isArray(entry.statistics)
      ? entry.statistics.map(parseGroup).filter((g): g is BoxScoreGroup => g !== null)
      : [];
    sides.push({ home: c.homeAway === "home", team: {
      abbr: str(team.abbreviation),
      name: str(team.displayName) || str(team.shortDisplayName) || str(team.abbreviation),
      logo: logoOf(team),
      lineScore: lines.map((l) => str(l.displayValue)),
      total: str(c.score),
      hits: sum("hits"),
      errors: sum("errors"),
      groups,
    } });
  }
  // Away first. ESPN lists home first in the header.
  const teams = sides.sort((a, b) => Number(a.home) - Number(b.home)).map((s) => s.team);
  if (teams.some((t) => !t.abbr || t.total === "")) return null;
  if (teams.every((t) => t.lineScore.length === 0 && t.groups.length === 0)) return null;
  return { teams };
}

// In-memory cache by event id: 30 s while live, kept for good once final.
const LIVE_TTL_MS = 30_000;
const cache = new Map<string, { at: number; final: boolean; box: BoxScore }>();
// A second open while the first fetch is out (or a dev double-effect) shares it.
const inflight = new Map<string, Promise<BoxScore | null>>();

export async function fetchBoxScore(game: Pick<Game, "id" | "sport" | "state">): Promise<BoxScore | null> {
  const url = summaryUrl(game);
  if (!url) return null;
  const key = `${game.sport}:${game.id}`;
  const hit = cache.get(key);
  // A live entry never answers for a game that has since gone final.
  const fresh = hit && (hit.final || (game.state !== "post" && Date.now() - hit.at < LIVE_TTL_MS));
  if (hit && fresh) return hit.box;
  const pending = inflight.get(key);
  if (pending) return pending;
  const p = (async () => {
    const res = await fetch(url);
    if (!res.ok) return null;
    const box = parseBoxScore(await res.json());
    if (box) cache.set(key, { at: Date.now(), final: game.state === "post", box });
    return box;
  })().finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}
