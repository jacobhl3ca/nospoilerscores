// Spoiler-safe World Cup knockout bracket, assembled live from ESPN.
//
// Why this shape: HideScore can't prebake this in CI (ESPN's CloudFront WAF
// challenges GitHub Actions datacenter IPs — see .github/workflows/news-
// prebake.yml, which skips every espn-* feed), and the Cloudflare worker is a
// datacenter IP too, so it can't proxy ESPN either. But real browsers are NOT
// challenged and ESPN serves `access-control-allow-origin: *`, so we build the
// bracket CLIENT-SIDE: one date-range scoreboard call for the matchups, plus a
// `matchNumber` lookup (core API) for each game that already has real teams, to
// place it at its exact slot. Future rounds arrive as ESPN placeholder names
// ("Round of 32 4 Winner") which encode the tree wiring. We only read team
// names + the fixed schedule, never scores. As each round finishes, ESPN fills
// the next round's real teams (the same matchups the score column already shows),
// so the bracket advances on its own — no per-round maintenance. To extend to a
// future tournament, only KNOCKOUT (dates + start) and the TOPO feeder map below
// need revisiting.

export type RoundKey = "r32" | "r16" | "qf" | "sf" | "final" | "third";

export interface BracketTeam {
  name: string;
  abbr: string | null;
  flag: string | null;
}
export interface Feeder {
  round: RoundKey;
  pos: number;
  res: "W" | "L"; // winner (most slots) or loser (third-place match)
}
export interface BracketSide {
  team?: BracketTeam;
  feeder?: Feeder; // shown as "Winner of …" until ESPN fills the real team
  tbd?: boolean;
}
export interface BracketMatch {
  pos: number;
  date: string | null;
  home: BracketSide;
  away: BracketSide;
}
export interface BracketRound {
  key: RoundKey;
  name: string;
  matches: BracketMatch[];
}
export interface Bracket {
  rounds: BracketRound[];
  knockoutStarted: boolean; // any Round-of-32 game has a real team yet
}

// WC2026 knockout window (dates ESPN schedules R32 → Final under). One scoreboard
// call covers the whole range. KNOCKOUT_START gates the modal's default view.
const KNOCKOUT_DATE_RANGE = "20260628-20260719";
export const KNOCKOUT_START_YMD = "20260628";

// site.web.api, NOT site.api — see the BASE_URL note in espn.ts.
const SCOREBOARD = `https://site.web.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?dates=${KNOCKOUT_DATE_RANGE}`;
const CORE_EVENT = (id: string) =>
  `https://sports.core.api.espn.com/v2/sports/soccer/leagues/fifa.world/events/${id}`;

const SLUG2ROUND: Record<string, RoundKey> = {
  "round-of-32": "r32",
  "round-of-16": "r16",
  quarterfinals: "qf",
  semifinals: "sf",
  "3rd-place-match": "third",
  final: "final",
};
// FIFA global match numbers per round (R32 = 73–88, …). pos = matchNumber − base.
const ROUND_BASE: Record<RoundKey, number> = { r32: 72, r16: 88, qf: 96, sf: 100, third: 102, final: 103 };
const ROUND_NAME: Record<RoundKey, string> = {
  r32: "Round of 32", r16: "Round of 16", qf: "Quarterfinals", sf: "Semifinals", final: "Final", third: "Third place",
};
const ROUND_ORDER: RoundKey[] = ["r32", "r16", "qf", "sf", "final", "third"];

// Fixed WC2026 knockout wiring — each slot's two feeder matches. Derived from
// ESPN's own placeholder names; the structure is constant for the tournament.
function feeders(round: RoundKey, pairs: number[], res: "W" | "L" = "W"): Feeder[] {
  return pairs.map((pos) => ({ round, pos, res }));
}
const TOPO: Record<RoundKey, Array<{ pos: number; feeders: Feeder[] | null }>> = {
  r32: Array.from({ length: 16 }, (_, i) => ({ pos: i + 1, feeders: null })),
  r16: [[2, 5], [1, 3], [4, 6], [7, 8], [11, 12], [9, 10], [14, 16], [13, 15]].map((f, i) => ({ pos: i + 1, feeders: feeders("r32", f) })),
  qf: [[1, 2], [5, 6], [3, 4], [7, 8]].map((f, i) => ({ pos: i + 1, feeders: feeders("r16", f) })),
  sf: [[1, 2], [3, 4]].map((f, i) => ({ pos: i + 1, feeders: feeders("qf", f) })),
  final: [{ pos: 1, feeders: feeders("sf", [1, 2]) }],
  third: [{ pos: 1, feeders: feeders("sf", [1, 2], "L") }],
};

const PLACEHOLDER = /winner|loser|round of \d+|quarterfinals?|semifinals?|to be determined|^tbd$/i;

type EspnCompetitor = { homeAway?: string; team?: { displayName?: string; name?: string; abbreviation?: string; flag?: { href?: string }; logos?: Array<{ href?: string }>; logo?: string } };
type EspnEvent = { id: string; date?: string; season?: { slug?: string }; competitions?: Array<{ competitors?: EspnCompetitor[] }> };

function parseSide(c?: EspnCompetitor): BracketSide {
  const t = c?.team ?? {};
  const name = t.displayName ?? t.name ?? "";
  const flag = t.flag?.href ?? t.logos?.[0]?.href ?? t.logo ?? null;
  if (name && !PLACEHOLDER.test(name)) return { team: { name, abbr: t.abbreviation ?? null, flag } };
  const m = name.match(/(round of 32|round of 16|quarterfinals?|semifinals?)\s+(\d+)\s+(winner|loser)/i);
  if (m) {
    const r = m[1].toLowerCase();
    const round: RoundKey = r.startsWith("round of 32") ? "r32" : r.startsWith("round of 16") ? "r16" : r.startsWith("quarter") ? "qf" : "sf";
    return { feeder: { round, pos: +m[2], res: m[3].toLowerCase().startsWith("l") ? "L" : "W" } };
  }
  return { tbd: true };
}

async function getJson(url: string, signal?: AbortSignal): Promise<unknown> {
  const r = await fetch(url, { signal });
  if (!r.ok) throw new Error(`${url} → ${r.status}`);
  return r.json();
}

// Run the async mapper over items with a small concurrency cap (keep ESPN calls
// polite). Mutates in place via the callback; resolves when all are done.
async function pool<T>(items: T[], n: number, fn: (item: T) => Promise<void>): Promise<void> {
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (i < items.length) await fn(items[i++]);
    }),
  );
}

const feederKey = (s: BracketSide): string | null => (s.feeder ? `${s.feeder.round}-${s.feeder.pos}` : null);

export async function fetchBracket(signal?: AbortSignal): Promise<Bracket> {
  const sb = (await getJson(SCOREBOARD, signal)) as { events?: EspnEvent[] };
  type G = { id: string; round: RoundKey; date: string | null; home: BracketSide; away: BracketSide; pos?: number };
  const games: G[] = (sb.events ?? [])
    .map((ev): G | null => {
      const round = SLUG2ROUND[ev.season?.slug ?? ""];
      if (!round) return null;
      const comps = ev.competitions?.[0]?.competitors ?? [];
      const home = comps.find((x) => x.homeAway === "home") ?? comps[0];
      const away = comps.find((x) => x.homeAway === "away") ?? comps[1];
      return { id: ev.id, round, date: ev.date ?? null, home: parseSide(home), away: parseSide(away) };
    })
    .filter((g): g is G => !!g);

  // Games with a real team need exact placement → look up matchNumber. Future
  // (all-placeholder) games are positioned by matching their feeder set to TOPO,
  // so they cost no extra calls.
  const needNum = games.filter((g) => g.home.team || g.away.team);
  await pool(needNum, 8, async (g) => {
    try {
      const core = (await getJson(CORE_EVENT(g.id), signal)) as { competitions?: Array<{ matchNumber?: number }> };
      const mn = core.competitions?.[0]?.matchNumber;
      if (mn != null) g.pos = mn - ROUND_BASE[g.round];
    } catch { /* leave unplaced; feeder-set fallback below may still catch it */ }
  });
  for (const g of games) {
    if (g.pos != null) continue;
    const fk = new Set([feederKey(g.home), feederKey(g.away)].filter(Boolean) as string[]);
    const slot = TOPO[g.round].find((s) => s.feeders && s.feeders.every((f) => fk.has(`${f.round}-${f.pos}`)));
    if (slot) g.pos = slot.pos;
  }

  const rounds: BracketRound[] = ROUND_ORDER.map((rk) => ({
    key: rk,
    name: ROUND_NAME[rk],
    matches: TOPO[rk].map((slot): BracketMatch => {
      const g = games.find((x) => x.round === rk && x.pos === slot.pos);
      const fb = (i: number): BracketSide => (slot.feeders ? { feeder: slot.feeders[i] } : { tbd: true });
      return {
        pos: slot.pos,
        date: g?.date ?? null,
        home: g?.home ?? fb(0),
        away: g?.away ?? fb(1),
      };
    }),
  }));

  const knockoutStarted = (rounds.find((r) => r.key === "r32")?.matches ?? []).some((m) => m.home.team || m.away.team);
  return { rounds, knockoutStarted };
}
