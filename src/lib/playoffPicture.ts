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

/**
 * What a club has already locked up. MLB's standings legend, confirmed against
 * mlb.com/standings: x = a postseason berth, y = the division, z = a division
 * title that also carries the first-round bye, w = a wild card.
 *
 * ESPN publishes its own `clincher` letter and the two feeds disagree (on 9/20
 * ESPN had TB as `z` and MIL as `x` while StatsAPI said `x` and `y`), so only
 * StatsAPI's indicator is read here.
 */
export type ClinchKind = "berth" | "wildcard" | "division" | "bye";

const CLINCH_BY_INDICATOR: Record<string, ClinchKind> = {
  x: "berth",
  y: "division",
  z: "bye",
  w: "wildcard",
};

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
  /** Which thing is clinched, when MLB says. null when nothing is. */
  clinch: ClinchKind | null;
  /** Games back in the division ("-" when leading, "+N" when ahead on the WC). */
  gamesBack: string;
  /** Games back of the third wild card. */
  wildCardGamesBack: string;
  /** Wins needed to clinch the division, when MLB publishes one. */
  magicNumber: string | null;
  eliminated: boolean;
  /** Out of the division race. A club can be out of this and still alive. */
  divisionEliminated: boolean;
  /** Out of the wild-card race. Both true is what `eliminated` means. */
  wildCardEliminated: boolean;
}

/** One published probability: the number to sort on, and the label to print. */
export interface Odd {
  value: number;
  label: string;
}

/**
 * The three chances ESPN publishes per club. ESPN's own tracker shows a fourth
 * (the first-round bye) but its standings feed carries no `byePercent`, so this
 * app has three odds columns rather than four.
 */
export interface TeamOdds {
  playoff: Odd | null;
  division: Odd | null;
  wildCard: Odd | null;
}

/** Keyed by MLB abbreviation. A club with nothing published is absent. */
export type PlayoffOdds = Record<string, TeamOdds>;

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

export interface StatsApiTeamRecord {
  team?: { id?: number; name?: string; abbreviation?: string };
  wins?: number;
  losses?: number;
  winningPercentage?: string;
  gamesBack?: string;
  wildCardGamesBack?: string;
  magicNumber?: string | null;
  eliminationNumber?: string;
  wildCardEliminationNumber?: string;
  clinchIndicator?: string;
  divisionLeader?: boolean;
  clinched?: boolean;
}
export interface StatsApiRecord {
  division?: { id?: number };
  lastUpdated?: string;
  teamRecords?: StatsApiTeamRecord[];
}

// MLB writes the literal "E" into an elimination number once that particular
// road is closed; a number is how many more wins/losses it would take, and "-"
// means the team is in control.
const isOut = (v: string | null | undefined): boolean => (v ?? "").trim().toUpperCase() === "E";

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
      // A club is out only when BOTH roads are closed. `eliminationNumber` is
      // the DIVISION race; `wildCardEliminationNumber` is the wild-card one.
      // Reading only the first is why Toronto (4.7%), Baltimore (1.0%) and
      // Arizona (7.1%) used to vanish from "Still alive", and why the NL showed
      // no "Still alive" section at all. When the wild-card field is missing
      // altogether the division number is all there is, so fall back to it
      // rather than calling every out-of-it club alive.
      const wcElim = t.wildCardEliminationNumber;
      const divisionEliminated = isOut(t.eliminationNumber);
      // A feed with no wild-card field at all only knows about the division, so
      // the division verdict has to stand in for both rather than declaring a
      // club alive on a road the feed never mentioned.
      const wildCardEliminated = wcElim == null ? divisionEliminated : isOut(wcElim);
      const eliminated = divisionEliminated && wildCardEliminated;
      const clinch = CLINCH_BY_INDICATOR[(t.clinchIndicator ?? "").trim().toLowerCase()] ?? null;
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
        clinched: t.clinched === true || clinch != null,
        clinch,
        gamesBack: t.gamesBack ?? "-",
        wildCardGamesBack: t.wildCardGamesBack ?? "-",
        magicNumber: t.magicNumber ?? null,
        eliminated,
        divisionEliminated,
        wildCardEliminated,
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
    // Every live chaser, uncapped. How many of them fit on screen is the
    // panel's call, not this layer's — an odds sort needs the whole field.
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
// FanGraphs' numbers as `playoffPercent` / `divisionPercent` / `wildCardPercent`,
// is CORS-open, and is already on this app's preconnect list — so the odds ride
// alongside the StatsAPI picture rather than replacing it. The two feeds spell
// exactly two clubs differently; everything else keys straight across.
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

// The label is what a reader sees; `value` is the raw percentage the sort and
// the cell shading run on, so two clubs that both print ">99%" still order
// against each other rather than landing in an arbitrary tie.
function oddFrom(stats: EspnStandingsEntry["stats"], name: string): Odd | null {
  const st = (stats ?? []).find((s) => s.name === name);
  if (!st) return null;
  const label = formatOdds(st.value, st.displayValue);
  if (label == null) return null;
  const raw = typeof st.value === "number" && Number.isFinite(st.value)
    ? st.value
    : parseFloat((st.displayValue ?? "").replace(/[<>]/g, ""));
  return { value: Number.isFinite(raw) ? raw : 0, label };
}

export function oddsFromEspn(root: EspnStandingsNode): PlayoffOdds {
  const out: PlayoffOdds = {};
  const walk = (n: EspnStandingsNode) => {
    for (const c of n.children ?? []) walk(c);
    for (const e of n.standings?.entries ?? []) {
      const ab = e.team?.abbreviation;
      if (!ab) continue;
      const odds: TeamOdds = {
        playoff: oddFrom(e.stats, "playoffPercent"),
        division: oddFrom(e.stats, "divisionPercent"),
        wildCard: oddFrom(e.stats, "wildCardPercent"),
      };
      // A club ESPN publishes nothing for stays absent, so its cells read "—"
      // rather than a fabricated 0%.
      if (!odds.playoff && !odds.division && !odds.wildCard) continue;
      out[ESPN_TO_MLB[ab] ?? ab] = odds;
    }
  };
  walk(root);
  return out;
}

const ESPN_STANDINGS = "https://site.web.api.espn.com/apis/v2/sports/baseball/mlb/standings?level=3";

export async function fetchPlayoffOdds(signal?: AbortSignal): Promise<PlayoffOdds> {
  const r = await fetch(ESPN_STANDINGS, { signal });
  if (!r.ok) throw new Error(`espn standings → ${r.status}`);
  return oddsFromEspn((await r.json()) as EspnStandingsNode);
}

// ── Sorting ──────────────────────────────────────────────────────────────────

export type SortKey = "seed" | "playoff" | "division" | "wildCard";
export type SortDir = "asc" | "desc";

const ODD_FIELD: Record<Exclude<SortKey, "seed">, keyof TeamOdds> = {
  playoff: "playoff",
  division: "division",
  wildCard: "wildCard",
};

/**
 * Order a league's rows by one column. Pure, so the sort is unit-testable
 * without a DOM.
 *
 * Two rows that tie on the sorted column fall back to seed order and then to
 * the club name, which keeps the list from reshuffling between polls — the same
 * determinism rule `byRecord` follows. A club with no seed, or with no number
 * published for the sorted column, sorts last in BOTH directions: an ascending
 * sort is asking for the smallest real number, not for the blanks.
 */
export function sortTeams(
  teams: PlayoffTeam[],
  odds: PlayoffOdds | null,
  key: SortKey,
  dir: SortDir,
): PlayoffTeam[] {
  const mul = dir === "desc" ? -1 : 1;
  const seedOf = (t: PlayoffTeam) => t.seed ?? Number.POSITIVE_INFINITY;
  const tiebreak = (a: PlayoffTeam, b: PlayoffTeam) =>
    seedOf(a) - seedOf(b) || a.name.localeCompare(b.name);

  const out = [...teams];
  out.sort((a, b) => {
    if (key === "seed") {
      if (a.seed == null && b.seed == null) return a.name.localeCompare(b.name);
      if (a.seed == null) return 1;
      if (b.seed == null) return -1;
      if (a.seed !== b.seed) return (a.seed - b.seed) * mul;
      return a.name.localeCompare(b.name);
    }
    const field = ODD_FIELD[key];
    const va = odds?.[a.abbrev]?.[field]?.value;
    const vb = odds?.[b.abbrev]?.[field]?.value;
    if (va == null && vb == null) return tiebreak(a, b);
    if (va == null) return 1;
    if (vb == null) return -1;
    if (va !== vb) return (va - vb) * mul;
    return tiebreak(a, b);
  });
  return out;
}

// ── Bracket ──────────────────────────────────────────────────────────────────

export type BracketRound = "wildCard" | "divisionSeries" | "championship" | "worldSeries";
export type BracketMatchupKey = "wc-a" | "wc-b" | "ds-a" | "ds-b" | "cs";

export interface BracketSlot {
  /** The club holding this seat today, when the seat belongs to a seed. */
  team: PlayoffTeam | null;
  /** 1–6 when the seat belongs to a seed, null when a winner fills it. */
  seed: number | null;
  /** The matchup whose winner fills this seat, when it is a winner seat. */
  from: BracketMatchupKey | null;
}

export interface BracketMatchup {
  key: BracketMatchupKey;
  round: BracketRound;
  bestOf: number;
  sides: [BracketSlot, BracketSlot];
}

export interface LeagueBracket {
  league: LeagueKey;
  matchups: BracketMatchup[];
}

export const BEST_OF: Record<BracketRound, number> = {
  wildCard: 3,
  divisionSeries: 5,
  championship: 7,
  worldSeries: 7,
};

/**
 * The 12-team format as plain data, so the pairings are unit-testable.
 *
 * Seeds 1 and 2 sit out the wild-card round. The 3 seed hosts the 6 and that
 * winner meets the 2; the 4 hosts the 5 and that winner meets the 1. This is
 * "if the season ended today" — the seeds move until the last day, and no
 * series result is ever read in, so the later seats stay empty on purpose.
 */
export function buildBracket(league: PlayoffLeague): LeagueBracket {
  const bySeed = (n: number) => league.seeded.find((t) => t.seed === n) ?? null;
  const seat = (n: number): BracketSlot => ({ team: bySeed(n), seed: n, from: null });
  const winner = (from: BracketMatchupKey): BracketSlot => ({ team: null, seed: null, from });
  return {
    league: league.key,
    matchups: [
      { key: "wc-a", round: "wildCard", bestOf: BEST_OF.wildCard, sides: [seat(3), seat(6)] },
      { key: "wc-b", round: "wildCard", bestOf: BEST_OF.wildCard, sides: [seat(4), seat(5)] },
      { key: "ds-a", round: "divisionSeries", bestOf: BEST_OF.divisionSeries, sides: [seat(2), winner("wc-a")] },
      { key: "ds-b", round: "divisionSeries", bestOf: BEST_OF.divisionSeries, sides: [seat(1), winner("wc-b")] },
      { key: "cs", round: "championship", bestOf: BEST_OF.championship, sides: [winner("ds-a"), winner("ds-b")] },
    ],
  };
}

/**
 * Who is still chasing each seat that is not yet locked up, keyed by seed.
 *
 * A club outside the six is chasing exactly one thing: the single seat it is
 * likeliest to take. That is its own division's leader when the division is the
 * better of its two roads, and otherwise the LAST wild card still open — seat 6
 * before 5 before 4, because the bottom seat is the one a chaser actually
 * displaces.
 *
 * A seat whose occupant has clinched takes no chasers. Clinching settles the
 * spot; the seed order above it can still move, but nobody is fighting that
 * club for a place in the field any more.
 *
 * Odds decide which road is better when ESPN has published them. When it has
 * not, MLB's own two elimination numbers still say which races a club is alive
 * in, so the chase is assigned from those rather than dropped — the box loses
 * its percentages, not its contenders.
 */
export function contendersBySeed(
  league: PlayoffLeague,
  odds: PlayoffOdds | null,
): Map<number, PlayoffTeam[]> {
  const out = new Map<number, PlayoffTeam[]>();
  const atSeed = (n: number) => league.seeded.find((t) => t.seed === n) ?? null;
  const open = (t: PlayoffTeam | null) => !!t && !t.clinched;
  // The bottom wild card still up for grabs — the seat a chaser takes.
  const lastWildCard = [6, 5, 4].map(atSeed).find(open)?.seed ?? null;
  const oddValue = (t: PlayoffTeam, field: "division" | "wildCard") =>
    odds?.[t.abbrev]?.[field]?.value ?? 0;

  for (const t of league.hunt) {
    const divOdd = oddValue(t, "division");
    const wcOdd = oddValue(t, "wildCard");
    // A published 0% closes a road the elimination number has not caught up to
    // yet; with nothing published, the elimination number is the only word.
    const divAlive = !t.divisionEliminated && (odds == null || divOdd > 0);
    const wcAlive = !t.wildCardEliminated && (odds == null || wcOdd > 0);
    if (!divAlive && !wcAlive) continue;

    let seat: number | null = null;
    if (divAlive && (!wcAlive || divOdd >= wcOdd)) {
      const leader = league.seeded.find((s) => s.division === t.division && s.divisionLeader) ?? null;
      if (open(leader)) seat = leader!.seed;
    }
    if (seat == null && wcAlive) seat = lastWildCard;
    if (seat == null) continue;

    const list = out.get(seat);
    if (list) list.push(t);
    else out.set(seat, [t]);
  }

  // Best chance first, so a box that only has room for two shows the two that
  // matter. `hunt` already arrives in record order, which breaks the ties.
  for (const list of out.values()) {
    list.sort((a, b) => (odds?.[b.abbrev]?.playoff?.value ?? 0) - (odds?.[a.abbrev]?.playoff?.value ?? 0));
  }
  return out;
}

export function roundLabel(round: BracketRound, league: LeagueKey): string {
  if (round === "worldSeries") return "World Series";
  if (round === "wildCard") return `${league} Wild Card`;
  return `${league}${round === "divisionSeries" ? "DS" : "CS"}`;
}

/**
 * Who carries each round, per season, taken from MLB's own postseason graphic.
 * Rights move between contracts, so this is keyed by season and a season with
 * no entry shows no channel line at all rather than last year's network.
 */
export const BROADCAST: Record<number, {
  wildCard: Record<LeagueKey, string>;
  divisionSeries: Record<LeagueKey, string>;
  championship: Record<LeagueKey, string>;
  worldSeries: string;
}> = {
  2026: {
    wildCard: { AL: "NBC / Peacock", NL: "NBC / Peacock" },
    divisionSeries: { AL: "TBS / HBO Max", NL: "FOX / FS1" },
    championship: { AL: "TBS / HBO Max", NL: "FOX / FS1" },
    worldSeries: "FOX",
  },
};

export function broadcastFor(season: number, round: BracketRound, league: LeagueKey): string | null {
  const year = BROADCAST[season];
  if (!year) return null;
  if (round === "worldSeries") return year.worldSeries;
  return year[round][league] ?? null;
}

export function teamLogo(id: number): string {
  return `https://www.mlbstatic.com/team-logos/${id}.svg`;
}
