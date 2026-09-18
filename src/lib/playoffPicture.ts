// The MLB playoff picture — who's in, who's chasing, how close it is.
//
// Source is MLB's own StatsAPI, not ESPN, and that's deliberate:
//
//   • It publishes the things a playoff picture is actually made of — magic
//     numbers, elimination numbers, clinch flags, and games back from the third
//     wild card — as first-class fields. Deriving those from an ESPN standings
//     table would mean reimplementing MLB's own tiebreak math.
//   • statsapi.mlb.com serves plain CORS-open JSON with no WAF challenge, so
//     unlike every ESPN feed in this app it works from a datacenter IP too. If
//     this ever needs prebaking in CI or proxying through the worker, it can be
//     (see the constraint note at the top of lib/wcBracket).
//
// Spoiler posture: this whole table is a second-order spoiler — a W-L record
// encodes whether a team won last night, which is exactly what a delayed viewer
// is avoiding. It is the same reasoning that keeps `showTeamRecords` opt-in and
// default-off in lib/preferences. So nothing here is ever rendered on the board;
// it lives behind the reveal gate in PlayoffPictureModal.
//
// This file imports NOTHING so `node --test --experimental-strip-types` can load
// it directly — see tests/playoff-picture.test.ts.

export type LeagueKey = "AL" | "NL";

export interface PlayoffTeam {
  id: number;
  name: string;
  abbrev: string;
  league: LeagueKey;
  division: string;
  wins: number;
  losses: number;
  pct: string;
  /** 1–6 when the team currently holds a playoff spot, else null. */
  seed: number | null;
  divisionLeader: boolean;
  clinched: boolean;
  /** Games back in the division ("-" when leading, "+N" when ahead on the WC). */
  gamesBack: string;
  /** Games back of the third wild card. */
  wildCardGamesBack: string;
  /** Wins needed to clinch the division, when MLB publishes one. */
  magicNumber: string | null;
  eliminated: boolean;
}

/**
 * Chance of reaching the postseason, keyed by MLB abbreviation, as a short
 * label ready to render ("85%", ">99%", "<1%"). Missing = no number published.
 */
export type PlayoffOdds = Record<string, string>;

export interface PlayoffLeague {
  key: LeagueKey;
  name: string;
  /** The six teams currently in, seeds 1–6 in order. */
  seeded: PlayoffTeam[];
  /** Still alive, still outside the six — nearest first. */
  hunt: PlayoffTeam[];
}

export interface PlayoffPicture {
  season: number;
  /** ISO timestamp MLB last recomputed the standings. */
  updated: string | null;
  leagues: PlayoffLeague[];
}

// Stable MLB division ids (verified live against /api/v1/divisions?sportId=1).
const DIVISIONS: Record<number, { league: LeagueKey; name: string; short: string }> = {
  200: { league: "AL", name: "American League West", short: "AL West" },
  201: { league: "AL", name: "American League East", short: "AL East" },
  202: { league: "AL", name: "American League Central", short: "AL Central" },
  203: { league: "NL", name: "National League West", short: "NL West" },
  204: { league: "NL", name: "National League East", short: "NL East" },
  205: { league: "NL", name: "National League Central", short: "NL Central" },
};
const LEAGUE_NAME: Record<LeagueKey, string> = { AL: "American League", NL: "National League" };

// How many chasing teams to list per league. Four is enough to cover a real
// race without turning the panel into the full standings. buildPicture keeps
// every live chaser (by record); the panel cuts to this many AFTER ordering
// by playoff odds, see orderHunt — the odds arrive from a second feed.
export const HUNT_LIMIT = 4;

export interface StatsApiTeamRecord {
  team?: { id?: number; name?: string; abbreviation?: string };
  wins?: number;
  losses?: number;
  winningPercentage?: string;
  gamesBack?: string;
  wildCardGamesBack?: string;
  magicNumber?: string | null;
  eliminationNumber?: string;
  divisionLeader?: boolean;
  clinched?: boolean;
}
export interface StatsApiRecord {
  division?: { id?: number };
  lastUpdated?: string;
  teamRecords?: StatsApiTeamRecord[];
}

// Descending by winning percentage. MLB's real seeding tiebreakers are head-to-
// head and then intradivision record, neither of which is in this payload — but
// MLB also publishes the standings already ordered, so ties here are rare and
// cosmetic. Falling back to the raw win count (then the name, for determinism)
// keeps the order stable across polls rather than letting equal teams swap.
function byRecord(a: PlayoffTeam, b: PlayoffTeam): number {
  const pa = parseFloat(a.pct) || 0;
  const pb = parseFloat(b.pct) || 0;
  if (pb !== pa) return pb - pa;
  if (b.wins !== a.wins) return b.wins - a.wins;
  return a.name.localeCompare(b.name);
}

export function buildPicture(records: StatsApiRecord[], season: number): PlayoffPicture {
  const teams: PlayoffTeam[] = [];
  let updated: string | null = null;

  for (const rec of records) {
    const div = DIVISIONS[rec.division?.id ?? -1];
    if (!div) continue; // a division we don't know is dropped, never guessed at
    if (rec.lastUpdated && (!updated || rec.lastUpdated > updated)) updated = rec.lastUpdated;
    for (const t of rec.teamRecords ?? []) {
      if (t.team?.id == null) continue;
      teams.push({
        id: t.team.id,
        name: t.team.name ?? "",
        abbrev: t.team.abbreviation ?? "",
        league: div.league,
        division: div.short,
        wins: t.wins ?? 0,
        losses: t.losses ?? 0,
        pct: t.winningPercentage ?? "",
        seed: null,
        divisionLeader: t.divisionLeader === true,
        clinched: t.clinched === true,
        gamesBack: t.gamesBack ?? "-",
        wildCardGamesBack: t.wildCardGamesBack ?? "-",
        magicNumber: t.magicNumber ?? null,
        // MLB writes the literal "E" into eliminationNumber once a team can no
        // longer reach the postseason; a number is how many more wins/losses it
        // would take. Anything else ("-" for a team in control) is not out.
        eliminated: (t.eliminationNumber ?? "").toUpperCase() === "E",
      });
    }
  }

  const leagues: PlayoffLeague[] = (["AL", "NL"] as LeagueKey[]).map((key) => {
    const inLeague = teams.filter((t) => t.league === key);
    // Seeds 1–3 are the division winners ordered by record; 4–6 are the best
    // three teams that aren't leading a division. That is the 12-team format
    // MLB has used since 2022.
    const leaders = inLeague.filter((t) => t.divisionLeader).sort(byRecord);
    const rest = inLeague.filter((t) => !t.divisionLeader).sort(byRecord);
    const wildCards = rest.slice(0, 3);
    const seeded = [...leaders.slice(0, 3), ...wildCards];
    seeded.forEach((t, i) => { t.seed = i + 1; });
    const hunt = rest.slice(3).filter((t) => !t.eliminated);
    return { key, name: LEAGUE_NAME[key], seeded, hunt };
  });

  return { season, updated, leagues };
}


const STANDINGS = (season: number) =>
  `https://statsapi.mlb.com/api/v1/standings?leagueId=103,104&season=${season}&standingsTypes=byDivision&hydrate=team`;

export async function fetchPlayoffPicture(signal?: AbortSignal, now: Date = new Date()): Promise<PlayoffPicture | null> {
  // MLB seasons are named for the calendar year they're played in, so the
  // current year is always the right season to ask for.
  const season = now.getUTCFullYear();
  const r = await fetch(STANDINGS(season), { signal });
  if (!r.ok) throw new Error(`mlb standings → ${r.status}`);
  const data = (await r.json()) as { records?: StatsApiRecord[] };
  const picture = buildPicture(data.records ?? [], season);
  // Before opening day there are no records to seed from; say nothing rather
  // than render six empty rows.
  if (picture.leagues.every((l) => !l.seeded.length)) return null;
  return picture;
}

// ── Playoff odds ─────────────────────────────────────────────────────────────
//
// MLB's StatsAPI publishes no probability. ESPN's standings feed carries
// FanGraphs' "make the playoffs" number as `playoffPercent`, is CORS-open, and
// is already on this app's preconnect list — so the odds ride alongside the
// StatsAPI picture rather than replacing it. The two feeds spell exactly two
// clubs differently; everything else keys straight across.
const ESPN_TO_MLB: Record<string, string> = { ARI: "AZ", CHW: "CWS" };

export interface EspnStandingsNode {
  children?: EspnStandingsNode[];
  standings?: { entries?: EspnStandingsEntry[] };
}
export interface EspnStandingsEntry {
  team?: { abbreviation?: string };
  stats?: { name?: string; value?: number; displayValue?: string }[];
}

// A whole-number label: "85%". ESPN's own ">99.9%" / "<0.1%" edges are kept as
// ">99%" / "<1%" so a team that has NOT clinched never reads as 100% and a team
// that is not yet out never reads as 0%.
export function formatOdds(value: number | undefined, display: string | undefined): string | null {
  const d = (display ?? "").trim();
  if (d.startsWith(">")) return ">99%";
  if (d.startsWith("<")) return "<1%";
  const v = typeof value === "number" && Number.isFinite(value) ? value : parseFloat(d);
  if (!Number.isFinite(v)) return null;
  if (v >= 100) return "100%";
  if (v >= 99.5) return ">99%";
  if (v > 0 && v < 0.5) return "<1%";
  return `${Math.round(v)}%`;
}

export function oddsFromEspn(root: EspnStandingsNode): PlayoffOdds {
  const out: PlayoffOdds = {};
  const walk = (n: EspnStandingsNode) => {
    for (const c of n.children ?? []) walk(c);
    for (const e of n.standings?.entries ?? []) {
      const ab = e.team?.abbreviation;
      if (!ab) continue;
      const stat = (e.stats ?? []).find((st) => st.name === "playoffPercent");
      if (!stat) continue;
      const label = formatOdds(stat.value, stat.displayValue);
      if (label) out[ESPN_TO_MLB[ab] ?? ab] = label;
    }
  };
  walk(root);
  return out;
}

// A formatted odds label back to a sortable number. ">99%" sorts above "99%"
// and "<1%" above "0%"; a team with no label sorts last. Only used to ORDER —
// the label itself is what renders.
export function oddsValue(label: string | null | undefined): number {
  if (!label) return -1;
  if (label.startsWith(">")) return 99.5;
  if (label.startsWith("<")) return 0.5;
  const v = parseFloat(label);
  return Number.isFinite(v) ? v : -1;
}

// The "still alive" list, best chance first. Games back is hidden by default
// and the odds are the one number on the row, so the row order has to follow
// the odds or the list reads upside-down (2026-09-13: a 0.4% club sat above a
// 7% club because their records tied). Record breaks an odds tie; a club with
// no odds yet keeps its record position at the end.
export function orderHunt(hunt: PlayoffTeam[], odds: PlayoffOdds | null, limit = HUNT_LIMIT): PlayoffTeam[] {
  return [...hunt]
    .sort((a, b) => oddsValue(odds?.[b.abbrev]) - oddsValue(odds?.[a.abbrev]) || byRecord(a, b))
    .slice(0, limit);
}

const ESPN_STANDINGS = "https://site.web.api.espn.com/apis/v2/sports/baseball/mlb/standings?level=3";

export async function fetchPlayoffOdds(signal?: AbortSignal): Promise<PlayoffOdds> {
  const r = await fetch(ESPN_STANDINGS, { signal });
  if (!r.ok) throw new Error(`espn standings → ${r.status}`);
  return oddsFromEspn((await r.json()) as EspnStandingsNode);
}

export function teamLogo(id: number): string {
  return `https://www.mlbstatic.com/team-logos/${id}.svg`;
}
