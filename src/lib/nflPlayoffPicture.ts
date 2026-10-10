// The NFL playoff picture and standings, from one ESPN standings payload
// (added 2026-10-07 for /nfl-playoff-picture and /nfl-standings).
//
// Own leaf module with no imports, like standingsRank.ts, so a node --test run
// can load it. Source: site.web.api.espn.com …/football/nfl/standings?level=3,
// the same CORS-open host lib/espn.ts reads standings from. level=3 nests
// conference → division → teams, which gives each club its division without a
// second request. Every entry carries ESPN's own `playoffSeed` (1–16 per
// conference, NFL tiebreakers applied); clinch letters arrive as a `clincher`
// stat late in the season.
//
// Seeding, the NFL's 14-team format since 2020: per conference, the four
// division winners are seeds 1–4 by record, and the three best records among
// everyone else are seeds 5–7. Only seed 1 gets a bye. Ties on record fall back
// to ESPN's playoffSeed, which already applies head-to-head, division and
// conference tiebreakers; this module does not try to re-derive them.
//
// What is shown: W-L(-T), win %, games back. NOT points for or against — those
// are a step closer to a score. The pages carry no cover (same call as the MLB
// pages, Jacob 9/23): a visitor who searched for standings asked to see them.

export type NflConfKey = "AFC" | "NFC";

export type NflClinch = "bye" | "division" | "berth" | "eliminated";

export type NflTeam = {
  id: string;
  name: string;
  abbrev: string;
  logo: string | null;
  conference: NflConfKey;
  division: string; // "AFC East"
  wins: number;
  losses: number;
  ties: number;
  pct: number;
  record: string; // "3-1" or "3-1-1"
  gamesBack: string; // in the division, "-" for the leader
  espnSeed: number | null;
  clinch: NflClinch | null;
  seed: number | null; // 1–7 once seeded, else null
  divisionLeader: boolean;
};

export type NflDivision = { name: string; teams: NflTeam[] };

export type NflConference = {
  key: NflConfKey;
  name: string;
  seeds: NflTeam[]; // 7, seed order
  hunt: NflTeam[]; // the rest, not eliminated, best first
  out: NflTeam[]; // eliminated
  divisions: NflDivision[];
};

export type NflPicture = {
  season: number | null;
  // Weeks the median club has played. 0 = before Week 1: the order is ESPN's
  // listing, not a standing.
  weeksPlayed: number;
  conferences: NflConference[];
};

type EspnStat = { name?: string; type?: string; value?: number; displayValue?: string; summary?: string };
type EspnEntry = {
  team?: { id?: string; displayName?: string; abbreviation?: string; logos?: { href?: string }[] };
  stats?: EspnStat[];
};
type EspnNode = {
  name?: string;
  abbreviation?: string;
  season?: number;
  children?: EspnNode[];
  standings?: { season?: number; entries?: EspnEntry[] };
};
export type NflStandingsPayload = EspnNode & { season?: number | { year?: number } };

const CONF_NAME: Record<NflConfKey, string> = {
  AFC: "American Football Conference",
  NFC: "National Football Conference",
};

// ESPN's clincher letters (shared with its NFL standings page): z = top seed,
// y = division, x = playoff berth, * = also top seed on some feeds, e = out.
const CLINCH_BY_LETTER: Record<string, NflClinch> = {
  z: "bye",
  "*": "bye",
  y: "division",
  x: "berth",
  e: "eliminated",
};

export const NFL_CLINCH_TEXT: Record<Exclude<NflClinch, "eliminated">, string> = {
  bye: "Clinched bye",
  division: "Clinched division",
  berth: "Clinched berth",
};

function stat(e: EspnEntry, name: string): EspnStat | undefined {
  return e.stats?.find((s) => s.name === name);
}
function num(e: EspnEntry, name: string): number | null {
  const s = stat(e, name);
  if (!s) return null;
  const v = s.value ?? (s.displayValue != null ? parseFloat(s.displayValue) : NaN);
  return Number.isFinite(v) ? (v as number) : null;
}

function confKeyOf(node: EspnNode): NflConfKey | null {
  const a = (node.abbreviation ?? "").toUpperCase();
  if (a === "AFC" || a === "NFC") return a;
  const n = (node.name ?? "").toLowerCase();
  if (n.includes("american")) return "AFC";
  if (n.includes("national")) return "NFC";
  return null;
}

function toTeam(e: EspnEntry, conference: NflConfKey, division: string): NflTeam | null {
  const id = e.team?.id;
  if (!id) return null;
  const wins = num(e, "wins") ?? 0;
  const losses = num(e, "losses") ?? 0;
  const ties = num(e, "ties") ?? 0;
  const played = wins + losses + ties;
  const pct = num(e, "winPercent") ?? (played ? (wins + ties / 2) / played : 0);
  const letter = (stat(e, "clincher")?.displayValue ?? "").trim().toLowerCase();
  return {
    id,
    name: e.team?.displayName ?? "",
    abbrev: e.team?.abbreviation ?? "",
    logo: e.team?.logos?.[0]?.href ?? null,
    conference,
    division,
    wins,
    losses,
    ties,
    pct,
    record: ties ? `${wins}-${losses}-${ties}` : `${wins}-${losses}`,
    gamesBack: "-",
    espnSeed: num(e, "playoffSeed"),
    clinch: CLINCH_BY_LETTER[letter] ?? null,
    seed: null,
    divisionLeader: false,
  };
}

// Better record first; a tie on win % goes to ESPN's seed (its tiebreakers),
// then to fewer losses, then to the name so the order is stable.
export function byRecord(a: NflTeam, b: NflTeam): number {
  if (b.pct !== a.pct) return b.pct - a.pct;
  const sa = a.espnSeed ?? 99;
  const sb = b.espnSeed ?? 99;
  if (sa !== sb) return sa - sb;
  if (a.losses !== b.losses) return a.losses - b.losses;
  return a.name.localeCompare(b.name);
}

function gamesBackFrom(leader: NflTeam, t: NflTeam): string {
  const gb = ((leader.wins - t.wins) + (t.losses - leader.losses)) / 2;
  if (gb <= 0) return "-";
  return Number.isInteger(gb) ? String(gb) : gb.toFixed(1);
}

function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** ESPN standings payload (level=3, or a flat conference payload) → the picture. */
export function buildNflPicture(data: NflStandingsPayload): NflPicture {
  const conferences: NflConference[] = [];
  const all: NflTeam[] = [];
  for (const confNode of data.children ?? []) {
    const key = confKeyOf(confNode);
    if (!key) continue;
    const divisions: NflDivision[] = [];
    if (confNode.children?.length) {
      for (const divNode of confNode.children) {
        const shortName = (divNode.name ?? "").trim();
        if (!shortName) continue;
        const teams = (divNode.standings?.entries ?? [])
          .map((e) => toTeam(e, key, shortName))
          .filter((t): t is NflTeam => !!t);
        if (teams.length) divisions.push({ name: shortName, teams });
      }
    }
    if (!divisions.length) continue;
    for (const d of divisions) {
      d.teams.sort(byRecord);
      const leader = d.teams[0];
      leader.divisionLeader = true;
      for (const t of d.teams) t.gamesBack = t === leader ? "-" : gamesBackFrom(leader, t);
    }
    const teams = divisions.flatMap((d) => d.teams);
    all.push(...teams);
    const leaders = divisions.map((d) => d.teams[0]).sort(byRecord);
    const rest = teams.filter((t) => !t.divisionLeader).sort(byRecord);
    const seeds = [...leaders.slice(0, 4), ...rest.slice(0, 3)];
    seeds.forEach((t, i) => { t.seed = i + 1; });
    const unseeded = rest.slice(3);
    conferences.push({
      key,
      name: CONF_NAME[key],
      seeds,
      hunt: unseeded.filter((t) => t.clinch !== "eliminated"),
      out: unseeded.filter((t) => t.clinch === "eliminated"),
      divisions,
    });
  }
  conferences.sort((a, b) => (a.key === b.key ? 0 : a.key === "AFC" ? -1 : 1));
  const rawSeason = (data as { season?: number | { year?: number } }).season;
  const season =
    typeof rawSeason === "number" ? rawSeason : typeof rawSeason === "object" && rawSeason?.year ? rawSeason.year : null;
  return {
    season,
    weeksPlayed: median(all.map((t) => t.wins + t.losses + t.ties)),
    conferences,
  };
}

// ── Bracket ──────────────────────────────────────────────────────────────────
//
// Wild Card weekend: 2 v 7, 3 v 6, 4 v 5 in each conference, the higher seed at
// home; seed 1 waits. The Divisional round RESEEDS: seed 1 hosts the lowest
// seed left, the other two winners meet. No results are read, so the later
// rounds only say where their seats come from.

export type NflPairing = { home: NflTeam | null; away: NflTeam | null; homeLabel: string; awayLabel: string };

export function wildCardPairings(conf: NflConference): NflPairing[] {
  const s = (n: number) => conf.seeds[n - 1] ?? null;
  return [
    [2, 7],
    [3, 6],
    [4, 5],
  ].map(([h, a]) => ({ home: s(h), away: s(a), homeLabel: `Seed ${h}`, awayLabel: `Seed ${a}` }));
}

/**
 * When each round is played, from ESPN's NFL calendar (scoreboard
 * leagues[0].calendar and seasontype=3 events, read 2026-10-07). Baked, keyed by
 * season, like BROADCAST in lib/playoffPicture: a season with no entry shows no
 * dates rather than last year's.
 */
export const NFL_PLAYOFF_DATES: Record<number, {
  week18: string;
  wildCard: string;
  divisional: string;
  conference: string;
  superBowl: string;
  superBowlName: string;
  superBowlVenue: string;
}> = {
  2026: {
    week18: "Jan 9 – 10",
    wildCard: "Jan 16 – 18",
    divisional: "Jan 23 – 24",
    conference: "Jan 31",
    superBowl: "Feb 14",
    superBowlName: "Super Bowl LXI",
    superBowlVenue: "SoFi Stadium",
  },
};

const STANDINGS_URL = "https://site.web.api.espn.com/apis/v2/sports/football/nfl/standings?level=3";

export async function fetchNflPicture(signal?: AbortSignal): Promise<NflPicture | null> {
  const r = await fetch(STANDINGS_URL, { signal });
  if (!r.ok) throw new Error(`nfl standings → ${r.status}`);
  const picture = buildNflPicture((await r.json()) as NflStandingsPayload);
  if (picture.conferences.length !== 2 || picture.conferences.some((c) => c.seeds.length !== 7)) return null;
  return picture;
}
