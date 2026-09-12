// Spoiler-safe Grand Slam draw, assembled live from ESPN.
//
// The shape mirrors lib/wcBracket — fetched CLIENT-SIDE (ESPN's CloudFront WAF
// challenges datacenter IPs, so neither CI nor the Cloudflare worker can prebake
// it, but real browsers are fine and ESPN serves `access-control-allow-origin:
// *`), and we read only names, dates and who advanced. Never a score.
//
// The WIRING, though, is a different problem, and it is the reason this file
// exists instead of a second config block in wcBracket:
//
//   • The World Cup knockout carries FIXED global match numbers, so wcBracket
//     places every slot from a `matchNumber` lookup plus a hard-coded topology.
//   • A Slam draw has neither. ESPN hands back the 127 main-draw singles matches
//     in ARBITRARY order. Probed live against the 2026 US Open men's draw on
//     2026-09-08: pairing Round 1 sequentially into Round 2 matched 0/32 slots,
//     and sorting by competition id first ALSO matched 0/32. There is no index,
//     id or ordering in the payload we can lay the tree out from.
//
// What IS derivable: a player in round N+1 got there by winning exactly one
// match in round N. So every finished match is an edge, and the tree is rebuilt
// from the edges (buildRounds below). Rounds already played wire up exactly;
// rounds not yet played keep ESPN's "TBD" and are ordered under whatever feeders
// are known. The bracket therefore fills itself in as the tournament runs, with
// no per-round maintenance — the same self-advancing property wcBracket has.
//
// To extend to another Slam: nothing. The active major is read off the payload
// (`event.major`), so Melbourne, Paris and Wimbledon come along for free.
//
// This file imports NOTHING — same constraint eventTiles.ts and raceDetails.ts
// work under, so `node --test --experimental-strip-types` can load it directly
// (an extensionless relative import is not resolvable under plain node ESM).
// See tests/slam-bracket.test.ts.

export type DrawKey = "mens-singles" | "womens-singles";

export interface SlamPlayer {
  name: string;
  flag: string | null;
}
export interface SlamSide {
  player?: SlamPlayer;
  // Set on an undecided slot when we know the match that will fill it, so the
  // UI can render "Winner: A v B" instead of a bare TBD. Indexes into the
  // PREVIOUS round's ordered matches.
  feederPos?: number;
}
export interface SlamMatch {
  id: string;
  date: string | null;
  completed: boolean;
  sides: [SlamSide, SlamSide];
}
export interface SlamRound {
  /** ESPN's own round label — also the stable key ("Round 1" … "Final"). */
  key: string;
  name: string;
  short: string;
  matches: SlamMatch[];
  /** Any match in this round has finished — i.e. showing it can spoil. */
  hasResults: boolean;
}
export interface SlamDraw {
  key: DrawKey;
  label: string;
  rounds: SlamRound[];
}
export interface Slam {
  /** Tournament name straight off ESPN ("US Open", "Wimbledon", …). */
  name: string;
  draws: SlamDraw[];
}

// Main draw only. Qualifying (three more rounds ESPN also returns) is dropped:
// it finishes before the tournament proper starts, nobody tracks it, and it
// would triple the width of an already-wide tree.
const MAIN_ROUNDS = ["Round 1", "Round 2", "Round 3", "Round 4", "Quarterfinal", "Semifinal", "Final"] as const;
const SHORT: Record<string, string> = {
  "Round 1": "R1", "Round 2": "R2", "Round 3": "R3", "Round 4": "R16",
  Quarterfinal: "QF", Semifinal: "SF", Final: "F",
};
const DRAW_LABEL: Record<DrawKey, string> = {
  "mens-singles": "Men's singles",
  "womens-singles": "Women's singles",
};

// site.web.api, NOT site.api — same host note as espn.ts/wcBracket.
const SCOREBOARD = (range: string) =>
  `https://site.web.api.espn.com/apis/site/v2/sports/tennis/atp/scoreboard?dates=${range}`;

type EspnAthlete = { displayName?: string; shortName?: string; flag?: { href?: string } };
type EspnCompetitor = { athlete?: EspnAthlete; winner?: boolean };
export type EspnCompetition = {
  id?: string;
  date?: string;
  competitors?: EspnCompetitor[];
  round?: { displayName?: string };
  status?: { type?: { completed?: boolean; name?: string } };
};
type EspnGrouping = { grouping?: { slug?: string }; competitions?: EspnCompetition[] };
type EspnEvent = { id?: string; name?: string; major?: boolean; groupings?: EspnGrouping[] };

// ESPN's placeholder for a slot the draw hasn't filled yet.
const isTbd = (n: string) => !n || /^tbd$/i.test(n.trim());

function side(c: EspnCompetitor | undefined): SlamSide {
  const a = c?.athlete ?? {};
  const name = a.displayName ?? a.shortName ?? "";
  if (isTbd(name)) return {};
  return { player: { name, flag: a.flag?.href ?? null } };
}

function winnerName(m: EspnCompetition): string | null {
  for (const c of m.competitors ?? []) {
    if (c.winner) {
      const n = c.athlete?.displayName ?? c.athlete?.shortName ?? "";
      if (!isTbd(n)) return n;
    }
  }
  return null;
}

function playerNames(m: EspnCompetition): string[] {
  return (m.competitors ?? [])
    .map((c) => c.athlete?.displayName ?? c.athlete?.shortName ?? "")
    .filter((n) => !isTbd(n));
}

// Stable ordering for a round we can't wire from below (see buildRounds): date
// first, then numeric id. ESPN's array order is not stable across polls, and an
// unstable anchor would make the whole tree below it jump on every refresh.
function stableSort(ms: EspnCompetition[]): EspnCompetition[] {
  return [...ms].sort((a, b) => {
    const d = (a.date ?? "").localeCompare(b.date ?? "");
    if (d) return d;
    return (parseInt(a.id ?? "0", 10) || 0) - (parseInt(b.id ?? "0", 10) || 0);
  });
}

function toMatch(m: EspnCompetition): SlamMatch {
  const comps = m.competitors ?? [];
  return {
    id: m.id ?? `${m.round?.displayName ?? "?"}-${playerNames(m).join("-")}`,
    date: m.date ?? null,
    completed: m.status?.type?.completed === true,
    sides: [side(comps[0]), side(comps[1])],
  };
}

// Rebuild the draw tree from finished matches.
//
// Direction matters. Going purely top-down (Final → R1) is what the tree shape
// wants, but mid-tournament the top rounds are exactly the ones NOT yet decided
// — during the quarterfinals the Final reads TBD v TBD, so it can claim no
// feeders and the whole tree below it falls back to arbitrary order. Going
// purely bottom-up doesn't work either: Round 1's order is the very thing we're
// trying to recover.
//
// So: anchor on the DEEPEST round the results have fully wired, expand down from
// it (exact — those rounds are complete by definition), then expand up (ordered
// by whichever feeders are known, arbitrary-but-stable for the rest).
export function buildRounds(all: EspnCompetition[]): SlamRound[] {
  const present = MAIN_ROUNDS.filter((r) => all.some((m) => m.round?.displayName === r));
  if (!present.length) return [];
  const buckets = present.map((r) => all.filter((m) => m.round?.displayName === r));

  // feeders[i][j] = matches in round i-1 whose winner plays in round i's match j.
  const feedersFor = (i: number, m: EspnCompetition): EspnCompetition[] => {
    if (i === 0) return [];
    const names = new Set(playerNames(m));
    return buckets[i - 1].filter((p) => {
      const w = winnerName(p);
      return w != null && names.has(w);
    });
  };

  // The anchor is the deepest round r such that every round from 1..r has both
  // feeders resolved for every one of its matches — i.e. the tree is exactly
  // known from Round 1 up to r.
  let anchor = 0;
  for (let i = 1; i < buckets.length; i++) {
    const wired = buckets[i].every((m) => feedersFor(i, m).length === 2);
    if (!wired) break;
    anchor = i;
  }

  const ordered: EspnCompetition[][] = new Array(buckets.length);
  ordered[anchor] = stableSort(buckets[anchor]);

  // Downward: each anchor-side match expands into its two feeders, in order.
  // The PAIR is stableSort-ed too — feedersFor reads them out of the raw bucket,
  // which is in ESPN's arbitrary array order, so without this the two halves of
  // every matchup would swap places between polls even though the tree itself
  // was correct.
  for (let i = anchor - 1; i >= 0; i--) {
    const out: EspnCompetition[] = [];
    const claimed = new Set<EspnCompetition>();
    for (const m of ordered[i + 1]) {
      for (const f of stableSort(feedersFor(i + 1, m))) {
        if (claimed.has(f)) continue;
        claimed.add(f);
        out.push(f);
      }
    }
    // Defensive: a walkover or a retired match ESPN never marks with a winner
    // would leave its slot unclaimed. Append rather than drop it.
    for (const m of stableSort(buckets[i])) if (!claimed.has(m)) out.push(m);
    ordered[i] = out;
  }

  // Upward: PLACE each match in its slot rather than merely sorting. Slot k of
  // round i is fed by slots 2k and 2k+1 of round i-1, so one identified feeder
  // pins the match — a semifinal whose single decided player came through
  // quarterfinal 3 belongs in slot 1, not slot 0, and a sort by feeder position
  // would have put it first simply because it was the only one anchored at all.
  // Matches with no identifiable feeder fill the slots left over, in stable
  // order, so a round nobody has started yet still renders in full.
  for (let i = anchor + 1; i < buckets.length; i++) {
    const prev = ordered[i - 1];
    const cur = stableSort(buckets[i]);
    const slots: Array<EspnCompetition | null> = new Array(Math.max(cur.length, Math.ceil(prev.length / 2))).fill(null);
    const unplaced: EspnCompetition[] = [];
    for (const m of cur) {
      const fs = feedersFor(i, m).map((f) => prev.indexOf(f)).filter((p) => p >= 0);
      const slot = fs.length ? Math.floor(Math.min(...fs) / 2) : -1;
      if (slot >= 0 && slot < slots.length && slots[slot] === null) slots[slot] = m;
      else unplaced.push(m);
    }
    for (const m of unplaced) {
      const k = slots.indexOf(null);
      if (k >= 0) slots[k] = m;
      else slots.push(m);
    }
    ordered[i] = slots.filter((x): x is EspnCompetition => x !== null);
  }

  return present.map((name, i) => {
    const prev = i > 0 ? ordered[i - 1] : [];
    return {
      key: name,
      name,
      short: SHORT[name] ?? name,
      hasResults: ordered[i].some((m) => m.status?.type?.completed === true),
      matches: ordered[i].map((m, k): SlamMatch => {
        const built = toMatch(m);
        // Name the feeder match for any slot still reading TBD. Read it
        // POSITIONALLY off the tree we just built (slot k is fed by 2k and
        // 2k+1) — not by name, because the feeder we want to name is precisely
        // the one whose winner isn't known yet, so there is no name to match on.
        // Which two players will contest an unplayed match is schedule
        // information, not a result, and the bracket sits behind the reveal
        // gate regardless.
        if (i > 0 && prev.length === ordered[i].length * 2) {
          const cand = [2 * k, 2 * k + 1];
          const taken = new Set<number>();
          for (const s of built.sides) {
            if (!s.player) continue;
            const p = cand.find((c) => !taken.has(c) && winnerName(prev[c]) === s.player!.name);
            if (p != null) taken.add(p);
          }
          const free = cand.filter((c) => !taken.has(c));
          let n = 0;
          for (const s of built.sides) if (!s.player && n < free.length) s.feederPos = free[n++];
        }
        return built;
      }),
    };
  });
}

// A window wide enough to cover any Slam's main draw from either end. ESPN
// accepts a date RANGE, and one call returns the whole tournament — every round,
// including matches days away — so the bracket never needs a per-round fetch.
//
// Deliberately computed in UTC rather than through etDay's service day: this is
// a coarse ±3-week net around a two-week tournament, so a few hours of timezone
// drift at either edge cannot change which Slam it catches, and staying
// import-free is what keeps this file unit-testable (see the header note).
export function windowFor(now: Date): string {
  const ymd = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, "");
  const back = new Date(now.getTime() - 21 * 86400_000);
  const fwd = new Date(now.getTime() + 21 * 86400_000);
  return `${ymd(back)}-${ymd(fwd)}`;
}

export async function fetchSlam(signal?: AbortSignal, now: Date = new Date()): Promise<Slam | null> {
  const r = await fetch(SCOREBOARD(windowFor(now)), { signal });
  if (!r.ok) throw new Error(`slam scoreboard → ${r.status}`);
  const data = (await r.json()) as { events?: EspnEvent[] };

  // Grand Slam only — the ATP scoreboard also carries the week's tune-up
  // tournaments, and only the Slams set major:true. Same gate buildTennisGames
  // applies in espn.ts, and for the same reason (Jacob 6/7).
  const events = (data.events ?? []).filter((e) => e.major);
  if (!events.length) return null;
  // A 6-week window can straddle two Slams only in theory (they're months
  // apart), but take the one with the most main-draw matches to be safe.
  const scored = events.map((e) => {
    const comps = (e.groupings ?? []).flatMap((g) => g.competitions ?? []);
    return { e, n: comps.filter((c) => (MAIN_ROUNDS as readonly string[]).includes(c.round?.displayName ?? "")).length };
  });
  scored.sort((a, b) => b.n - a.n);
  const event = scored[0].e;
  if (!scored[0].n) return null;

  const draws: SlamDraw[] = [];
  for (const key of ["mens-singles", "womens-singles"] as DrawKey[]) {
    const g = (event.groupings ?? []).find((x) => (x.grouping?.slug ?? "").toLowerCase() === key);
    if (!g) continue;
    const main = (g.competitions ?? []).filter((c) => (MAIN_ROUNDS as readonly string[]).includes(c.round?.displayName ?? ""));
    const rounds = buildRounds(main);
    if (rounds.length) draws.push({ key, label: DRAW_LABEL[key], rounds });
  }
  if (!draws.length) return null;
  return { name: event.name ?? "Grand Slam", draws };
}
