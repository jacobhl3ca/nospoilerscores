// "What matters today" — auto-derives the qualification stakes of each World
// Cup match on a given date from live ESPN standings + the day's fixtures.
//
// Spoiler note: the OUTPUT reveals who is already through / out, so the card
// that renders this is tap-to-reveal (collapsed by default). Nothing here is
// shown until the user opts in.
//
// Approach: ESPN's standings feed already runs the full cross-group
// "best-8 third place" model and tags each team with a note
// ("Advance to Round of 32" / "Best 8 advance" / "Eliminated"). We trust that
// note for elimination/third-place calls, and compute the within-group top-2
// picture ourselves (enumerating the matchday's two results) so the copy can
// say precisely whether a team is through, safe-with-a-draw, or must-win.

import { etSlateYmd, nextYmd } from "./etDay";

const STANDINGS_URL =
  "https://site.web.api.espn.com/apis/v2/sports/soccer/fifa.world/standings";
// site.web.api, NOT site.api — see the BASE_URL note in espn.ts.
const SCOREBOARD_URL = (dates: string) =>
  `https://site.web.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?dates=${dates}`;

// Group-stage tiers (qualification stakes) + knockout tiers (marquee/balance).
export type WcTier =
  | "mustwin"
  | "decider"
  | "seeding"
  | "marquee"
  | "competitive"
  | "lopsided";

export interface WcStakeMatch {
  group: string; // "Group L" (or "Round of 32" etc. in knockouts)
  tier: WcTier;
  away: string; // display name
  home: string;
  copy: string; // the generated stakes sentence
  state: "pre" | "in" | "post";
}

export interface WcStakes {
  date: string;
  matches: WcStakeMatch[]; // sorted most-critical first
}

interface Row {
  abbr: string;
  name: string;
  pts: number;
  gd: number;
  played: number;
  rank: number; // finishing position within the group (1 = group winner)
  note: string;
  group: string;
}

type Status =
  | "through" // top-2 locked no matter what
  | "drawsafe" // a draw secures top-2 (a loss might still risk it)
  | "mustwin" // only a win can reach top-2
  | "bubble" // result + the other game decide
  | "best8" // can't reach top-2 but alive for a best-third-place spot
  | "eliminated";

const num = (s: unknown): number =>
  parseInt(String(s ?? "").replace("+", ""), 10) || 0;

async function fetchJson(url: string, timeoutMs = 7000): Promise<unknown | null> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { cache: "no-store", signal: controller.signal });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

function parseStandings(data: unknown): { groups: Map<string, Row[]>; byAbbr: Map<string, Row> } {
  const groups = new Map<string, Row[]>();
  const byAbbr = new Map<string, Row>();
  const d = data as { children?: Array<Record<string, unknown>> } | null;
  for (const child of d?.children ?? []) {
    const gname = String(child.name ?? child.abbreviation ?? "");
    const standings = child.standings as { entries?: Array<Record<string, unknown>> } | undefined;
    const rows: Row[] = [];
    for (const e of standings?.entries ?? []) {
      const team = e.team as { abbreviation?: string; displayName?: string } | undefined;
      const stats = (e.stats as Array<{ name?: string; displayValue?: string }> | undefined) ?? [];
      const st: Record<string, string> = {};
      for (const s of stats) if (s.name) st[s.name] = s.displayValue ?? "";
      const note = (e.note as { description?: string } | undefined)?.description ?? "";
      const row: Row = {
        abbr: String(team?.abbreviation ?? ""),
        name: String(team?.displayName ?? team?.abbreviation ?? ""),
        pts: num(st.points),
        gd: num(st.pointDifferential),
        played: num(st.gamesPlayed),
        rank: num(st.rank),
        note,
        group: gname,
      };
      if (!row.abbr) continue;
      rows.push(row);
      byAbbr.set(row.abbr, row);
    }
    groups.set(gname, rows);
  }
  return { groups, byAbbr };
}

interface Fixture {
  home: string; // abbr
  away: string;
  homeName: string;
  awayName: string;
  state: "pre" | "in" | "post";
  knockoutLabel: string | null;
  roundSlug: string; // ESPN event.season.slug, e.g. "round-of-32", "final"
  iso: string; // ESPN event.date (ISO kickoff) — used for slate-day bucketing
}

function parseFixtures(data: unknown): Fixture[] {
  const d = data as { events?: Array<Record<string, unknown>> } | null;
  const out: Fixture[] = [];
  for (const e of d?.events ?? []) {
    const comps = (e.competitions as Array<Record<string, unknown>> | undefined) ?? [];
    const c = comps[0];
    if (!c) continue;
    const competitors = (c.competitors as Array<Record<string, unknown>> | undefined) ?? [];
    const h = competitors.find((x) => x.homeAway === "home");
    const a = competitors.find((x) => x.homeAway === "away");
    if (!h || !a) continue;
    const ht = h.team as { abbreviation?: string; displayName?: string };
    const at = a.team as { abbreviation?: string; displayName?: string };
    const status = e.status as { type?: { state?: string } } | undefined;
    const season = e.season as { slug?: string } | undefined;
    const notes = (c.notes as Array<{ headline?: string }> | undefined) ?? [];
    const headline = notes[0]?.headline ?? "";
    out.push({
      home: String(ht?.abbreviation ?? ""),
      away: String(at?.abbreviation ?? ""),
      homeName: String(ht?.displayName ?? ""),
      awayName: String(at?.displayName ?? ""),
      state: (status?.type?.state as Fixture["state"]) ?? "pre",
      // Word-boundary the round names so they match whole words, not unrelated
      // substrings — the same fix the sibling playoff detector in espn.ts's
      // parseGame already carries. Unbounded, `final` hit "finale", `semi` hit
      // "seminal", and `quarter` hit "headquarters", giving a group-stage
      // fixture a spurious knockoutLabel that misroutes it into the knockouts
      // bucket below (win-or-out copy instead of group-qualification analysis)
      // and renders the stray headline as its label. Every real knockout
      // headline still matches ("Round of 32", "Quarterfinal", "Semifinal",
      // "Final", "Play-off").
      knockoutLabel: /\bround of\b|\bfinals?\b|\bquarter-?finals?\b|\bsemi-?finals?\b|\bknockout\b|\bplay-?offs?\b/i.test(headline)
        ? headline
        : null,
      roundSlug: String(season?.slug ?? ""),
      iso: String(e.date ?? ""),
    });
  }
  return out;
}

// Enumerate the matchday's two group results (9 point-outcomes) and derive each
// team's qualification status. `pairs` is [[home,away],[home,away]] (abbrevs).
function analyzeGroup(rows: Row[], pairs: [string, string][]): Map<string, Status> {
  const base: Record<string, number> = {};
  const gd: Record<string, number> = {};
  for (const r of rows) {
    base[r.abbr] = r.pts;
    gd[r.abbr] = r.gd;
  }
  const abbrs = rows.map((r) => r.abbr);
  const outcomes: [number, number][] = [
    [3, 0],
    [1, 1],
    [0, 3],
  ]; // [homePts, awayPts]
  const combos: Array<{ pts: Record<string, number>; kind: Record<string, string> }> = [];
  for (const o1 of outcomes)
    for (const o2 of outcomes) {
      const pts = { ...base };
      const kind: Record<string, string> = {};
      const apply = (m: [string, string], o: [number, number]) => {
        pts[m[0]] += o[0];
        pts[m[1]] += o[1];
        kind[m[0]] = o[0] === 3 ? "W" : o[0] === 1 ? "D" : "L";
        kind[m[1]] = o[1] === 3 ? "W" : o[1] === 1 ? "D" : "L";
      };
      apply(pairs[0], o1);
      apply(pairs[1], o2);
      combos.push({ pts, kind });
    }
  // favor=true: team wins point-ties (best case); false: loses them (worst case)
  const inTop2 = (pts: Record<string, number>, team: string, favor: boolean): boolean => {
    const sorted = [...abbrs].sort((x, y) => {
      if (pts[y] !== pts[x]) return pts[y] - pts[x];
      if (x === team) return favor ? -1 : 1;
      if (y === team) return favor ? 1 : -1;
      return gd[y] - gd[x];
    });
    return sorted.indexOf(team) < 2;
  };
  const status = new Map<string, Status>();
  for (const r of rows) {
    const t = r.abbr;
    if (r.note === "Eliminated") {
      status.set(t, "eliminated");
      continue;
    }
    const clinched = combos.every((c) => inTop2(c.pts, t, false));
    const canReach = combos.some((c) => inTop2(c.pts, t, true));
    const drawSub = combos.filter((c) => c.kind[t] === "D");
    const drawClinches = drawSub.length > 0 && drawSub.every((c) => inTop2(c.pts, t, false));
    const noWin = combos.filter((c) => c.kind[t] !== "W");
    // "Only a win reaches top-2" — but that's only meaningful if a win CAN get
    // there. Without the canReach guard, a team that can't reach top-2 in ANY
    // outcome (winning included) makes every non-win combo vacuously fail the
    // inTop2 test, so winNeeded went true and the team was mislabeled "mustwin"
    // instead of falling through to best8 / eliminated.
    const winNeeded = canReach && noWin.every((c) => !inTop2(c.pts, t, true));
    let s: Status;
    if (clinched) s = "through";
    else if (drawClinches) s = "drawsafe";
    else if (winNeeded) s = "mustwin";
    else if (canReach) s = "bubble";
    else if (r.note === "Best 8 advance") s = "best8";
    else s = "eliminated";
    status.set(t, s);
  }
  return status;
}

const SAFE = new Set<Status>(["through", "drawsafe"]);
const LIVE = new Set<Status>(["bubble", "mustwin", "best8"]);

function tierFor(sa: Status, sb: Status): WcTier {
  const live = [sa, sb].filter((s) => LIVE.has(s));
  if (live.length === 0) return "seeding";
  if (live.some((s) => s === "mustwin" || s === "best8")) return "mustwin";
  return "decider";
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

interface Side {
  name: string;
  s: Status;
}

function copyFor(tier: WcTier, away: Side, home: Side, group: string): string {
  const sides = [away, home];
  const live = sides.filter((t) => LIVE.has(t.s));
  const safe = sides.filter((t) => SAFE.has(t.s));
  const out = sides.filter((t) => t.s === "eliminated");

  if (tier === "mustwin") {
    const w = live.find((t) => t.s === "mustwin" || t.s === "best8") ?? live[0];
    const other = w === away ? home : away;
    const otherTxt =
      other.s === "eliminated"
        ? `${other.name} are out`
        : other.s === "through"
          ? `${other.name} are already through`
          : other.s === "drawsafe"
            ? `${other.name} are all but through (a draw seals it)`
            : `${other.name} need a result too`;
    // A "best8" side can't reach the group's top two at all — its only route
    // left is the best-third-place race. A "mustwin" side, by contrast, climbs
    // straight into the top two by winning (see the Status doc: mustwin = only
    // a win can reach top-2). Naming the best-third-place race for BOTH told a
    // mustwin team the wrong route to advancement, so split the stakes clause.
    const stakes =
      w.s === "best8"
        ? "must win to keep their hopes alive — likely via the best-third-place race"
        : "must win to reach the top two";
    return `${w.name} ${stakes}. ${otherTxt}.`;
  }

  if (tier === "decider") {
    if (safe.length === 1 && live.length === 1) {
      // Distinguish an already-qualified "through" side (advances on ANY result)
      // from a "drawsafe" one (a draw secures top-two) — the same split the
      // seeding branch below already makes. The old shared copy said both "go
      // through with a draw" AND cast the safe side as a possible "loser"
      // dropping into the best-third-place scramble, which is false for a through
      // team: it can't finish outside the top two no matter the result.
      if (safe[0].s === "through") {
        return `${cap(safe[0].name)} are already through; ${live[0].name} are fighting for the other top-two spot — win it or risk the best-third-place scramble.`;
      }
      return `${cap(safe[0].name)} go through with a draw; ${live[0].name} need a win to stay in the top two. The loser drops into the best-third-place scramble.`;
    }
    // One side is already out (ESPN "Eliminated") while the other's top-two
    // fate is still live — a dead rubber for the eliminated team. "Both are
    // fighting for it" (below) would misdescribe it, so name only who's still
    // playing for something. In this tier the live side is always a "bubble"
    // team (mustwin/best8 route to the mustwin tier), i.e. result-dependent.
    if (out.length === 1 && live.length === 1) {
      return `${live[0].name} are still playing for a top-two spot; ${out[0].name} are already out.`;
    }
    return `Both are fighting for it — the winner books a Round-of-32 spot and the loser drops into the best-third-place scramble.`;
  }

  // seeding — both settled
  if (safe.length === 2) {
    // Both sides are top-two SAFE, but only a genuinely "through" side advances
    // on ANY result. A "drawsafe" side clinches with a draw yet a DEFEAT can
    // still drop it (see the Status doc), so a decisive result here can decide
    // qualification — not just seeding — and claiming "both are through" would
    // falsely tell the user a team has already qualified. Only make that claim
    // when both truly are through; otherwise say what's actually at stake. This
    // is the same through/drawsafe split the decider (safe===1) and safe===1/
    // out===1 branches above already make.
    if (safe.every((t) => t.s === "through")) {
      return `Both are through — this decides who wins ${group} (1st vs 2nd) and the kinder Round-of-32 draw.`;
    }
    return `A draw sends both through as ${group}'s top two, but a defeat could drop the loser into the best-third-place scramble.`;
  }
  if (safe.length === 1 && out.length === 1) {
    const s = safe[0];
    const through =
      s.s === "through"
        ? `${s.name} are already through`
        : `${s.name} are all but through (a draw seals it)`;
    return `${through} and ${out[0].name} are out — the result only affects ${s.name}'s seeding, so top ${group} for an easier path.`;
  }
  // Both sides are already out — the ONLY combination left in this tier once
  // the safe===2 and safe===1/out===1 branches above are handled: the
  // seeding tier is reached only when live.length===0 (see tierFor), so every
  // side is safe or eliminated, and with two sides that leaves out.length===2 as
  // the exhaustive remainder. Neither team can advance, so there is nothing at
  // stake: NOT seeding, NOT goal difference (both matter only to teams still in
  // the tournament). This is the unconditional final return — the previous
  // `if (out.length === 2)` guard left a trailing fallback ("nothing left to
  // settle but seeding and goal difference") that was both unreachable AND wrong
  // (it cast this dead rubber as a fight for group position), so it's dropped.
  return `Both are already out — a dead rubber with nothing at stake.`;
}

// Group-stage and knockout tiers never appear on the same day, so they share
// the 0/1/2 ordering slots (most-worth-watching first within each phase).
const TIER_RANK: Record<WcTier, number> = {
  mustwin: 0,
  decider: 1,
  seeding: 2,
  marquee: 0,
  competitive: 1,
  lopsided: 2,
};

// ── Knockout "what matters" = the STAKES of the tie ──────────────────────────
// Each knockout match is win-or-out; the round (from ESPN's season slug) tells
// us what the winner plays for next, which escalates naturally toward the final.
const ROUND_NEXT: Record<string, { label: string; next: string }> = {
  "round-of-32": { label: "Round of 32", next: "the Round of 16" },
  "round-of-16": { label: "Round of 16", next: "the quarterfinals" },
  quarterfinals: { label: "Quarterfinals", next: "the semifinals" },
  semifinals: { label: "Semifinals", next: "the final" },
};

function knockoutStakes(roundSlug: string): { tier: WcTier; round: string; copy: string } {
  if (roundSlug === "final") {
    return { tier: "mustwin", round: "Final", copy: "The final — win it and they're world champions." };
  }
  if (/3rd|third/i.test(roundSlug)) {
    return { tier: "mustwin", round: "Third place", copy: "The third-place playoff — the tournament's last match for both." };
  }
  const r = ROUND_NEXT[roundSlug];
  if (r) {
    return { tier: "mustwin", round: r.label, copy: `Win to reach ${r.next} — lose and they're out.` };
  }
  // Unknown / not-yet-labelled knockout round.
  return { tier: "mustwin", round: "Knockout", copy: "Single-elimination — the winner advances, the loser is out." };
}

/* FUTURE — marquee/balance ranking of knockout ties, kept for reference.
   Ranks each tie by combined strength + balance from group-stage form, so the
   heavyweight clashes and genuine toss-ups bubble up (vs. the flat win-or-out
   stakes used now). To re-enable: call classifyKnockout() instead of
   knockoutStakes() in the knockouts loop below — the marquee / competitive /
   lopsided tiers are already wired into TIER_META + TIER_RANK.

function strengthOf(r: Row): number {
  // Points dominate; goal difference refines; group winners get a bump.
  const rankBonus = r.rank === 1 ? 1.5 : r.rank >= 3 ? -1.5 : 0;
  return r.pts + r.gd * 0.5 + rankBonus;
}

function classifyKnockout(away: Row | undefined, home: Row | undefined, awayName: string, homeName: string): { tier: WcTier; copy: string } {
  if (!away || !home) return { tier: "competitive", copy: "Knockout tie — win or go home." };
  const gap = Math.abs(strengthOf(away) - strengthOf(home));
  const bothStrong = away.pts >= 6 && home.pts >= 6;
  const awayFav = strengthOf(away) >= strengthOf(home);
  const favName = awayFav ? awayName : homeName;
  const dogName = awayFav ? homeName : awayName;
  if (bothStrong && gap <= 4) {
    const bothWon = away.rank === 1 && home.rank === 1;
    return { tier: "marquee", copy: `Heavyweight tie — two of the group stage's strongest sides, and a real toss-up.${bothWon ? " Two group winners collide." : ""} The pick of the round.` };
  }
  if (gap >= 7) return { tier: "lopsided", copy: `${favName} were the standout side in the groups — ${dogName} will need an upset.` };
  return { tier: "competitive", copy: `Evenly matched on group-stage form — this one could go either way.` };
}
*/

export async function getWorldCupStakes(date: string): Promise<WcStakes | null> {
  const [standingsData, scoreData] = await Promise.all([
    fetchJson(STANDINGS_URL),
    // Fetch a 2-day window [date, date+1] and re-bucket by slate day below, the
    // same reconcile the score column does (fetchGames' soccer path in espn.ts).
    // ESPN buckets a fixture under its raw ET calendar day, but the app's date
    // nav rolls the day over at 1 AM local (etDay.ts is the single source of
    // truth), so a western-venue World Cup night match kicking off 12 AM–1 AM ET
    // (e.g. 9 PM PT) belongs to the PREVIOUS day's slate. Without this, the
    // "What matters today" card fetched only the raw calendar day and diverged
    // from the score column by a day at that boundary — omitting a match the
    // column lists (and listing one it doesn't).
    fetchJson(SCOREBOARD_URL(`${date}-${nextYmd(date)}`)),
  ]);
  if (!standingsData || !scoreData) return null;
  const { groups, byAbbr } = parseStandings(standingsData);
  const fixtures = parseFixtures(scoreData).filter((f) => etSlateYmd(f.iso) === date);
  if (fixtures.length === 0) return null;

  // Bucket the day's fixtures by group so the within-group enumeration sees
  // both of a group's matchday games together.
  const byGroup = new Map<string, Fixture[]>();
  const knockouts: Fixture[] = [];
  for (const f of fixtures) {
    const hg = byAbbr.get(f.home)?.group;
    const ag = byAbbr.get(f.away)?.group;
    // Two teams from different groups can only meet in the knockout rounds —
    // a robust knockout signal even before ESPN fills in the round headline
    // ("Round of 32" etc.). Also treat an unknown/missing group as knockout.
    if (f.knockoutLabel || !hg || !ag || hg !== ag) {
      knockouts.push(f);
      continue;
    }
    if (!byGroup.has(hg)) byGroup.set(hg, []);
    byGroup.get(hg)!.push(f);
  }

  const matches: WcStakeMatch[] = [];

  for (const [g, fs] of byGroup) {
    const rows = groups.get(g) ?? [];
    const finalMatchday = rows.length === 4 && rows.every((r) => r.played === 2);
    let status = new Map<string, Status>();
    if (finalMatchday && fs.length === 2) {
      const pairs = fs.map((f) => [f.home, f.away] as [string, string]);
      status = analyzeGroup(rows, pairs);
    }
    for (const f of fs) {
      const sa = status.get(f.home);
      const sb = status.get(f.away);
      // Pre-final-matchday (or unexpected data): no confident call → skip the
      // match rather than show a guess. The card just won't list it.
      if (!sa || !sb) continue;
      const tier = tierFor(sa, sb);
      matches.push({
        group: g,
        tier,
        away: f.awayName,
        home: f.homeName,
        state: f.state,
        copy: copyFor(tier, { name: f.awayName, s: sb }, { name: f.homeName, s: sa }, g),
      });
    }
  }

  for (const f of knockouts) {
    const k = knockoutStakes(f.roundSlug);
    matches.push({
      group: f.knockoutLabel ?? k.round,
      tier: k.tier,
      away: f.awayName,
      home: f.homeName,
      state: f.state,
      copy: k.copy,
    });
  }

  if (matches.length === 0) return null;
  matches.sort((a, b) => TIER_RANK[a.tier] - TIER_RANK[b.tier]);
  return { date, matches };
}
