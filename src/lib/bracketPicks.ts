// Bracket picks — a generic "tap a winner per series" engine.
//
// Nothing in here knows about baseball. A bracket is plain data: rounds with a
// points weight, matchups whose two seats are either a known team or "the
// winner of matchup X". The MLB adapter (lib/mlbPicks) builds one from the
// playoff picture; an NCAA bracket in March is the same shape with more rounds.
//
// Picks are stored as matchup key → team id. They are never trusted as given:
// every read goes through `cleanPicks`, which walks the bracket in round order
// and drops any pick whose team is not actually in that seat. That one rule
// covers three cases at once — a seed that moved before the lock, a changed
// early-round pick that orphans the later ones, and a hand-crafted POST that
// picks a team into a series it can never reach.
//
// This file imports NOTHING so `node --test --experimental-strip-types` can load
// it directly — see tests/bracket-picks.test.ts.

export interface PickTeam {
  /** Stable id, as a string. MLB uses its numeric team id. */
  id: string;
  abbrev: string;
  name: string;
  seed: number | null;
  logo: string | null;
}

export interface PickSide {
  /** The team that holds this seat outright (a seeded seat). */
  team: PickTeam | null;
  /** The matchup whose picked winner fills this seat. */
  from: string | null;
  /** What an empty seat says: "AL Wild Card winner", "Seed 3". */
  label: string;
}

export interface PickMatchup {
  key: string;
  /** Index into `rounds`. */
  round: number;
  /** Which half of the drawn bracket it sits in; the final sits in neither. */
  half: 0 | 1 | null;
  sides: [PickSide, PickSide];
}

export interface PickRound {
  label: string;
  /** Points for each correct series winner in this round. */
  weight: number;
  bestOf: number | null;
}

export interface PickBracket {
  id: string;
  rounds: PickRound[];
  matchups: PickMatchup[];
  /** The title matchup; its pick is the champion. */
  final: string;
  /** Short names for the two halves ("AL", "NL"). */
  halves: [string, string];
}

/** matchup key → team id */
export type Picks = Record<string, string>;

/** One finished series. `round` indexes the bracket's rounds. */
export interface SeriesResult {
  round: number;
  winner: string;
  loser: string;
}

const byRound = (b: PickBracket) => [...b.matchups].sort((x, y) => x.round - y.round);

/**
 * The two teams actually in a matchup given the picks so far. A seeded seat is
 * its team; a winner seat is whoever was picked in the feeding matchup (after
 * that pick was itself checked). Assumes `picks` is already clean.
 */
export function sidesFor(bracket: PickBracket, picks: Picks, key: string): [PickTeam | null, PickTeam | null] {
  const m = bracket.matchups.find((x) => x.key === key);
  if (!m) return [null, null];
  const resolve = (s: PickSide): PickTeam | null => {
    if (s.team) return s.team;
    if (!s.from) return null;
    const id = picks[s.from];
    if (!id) return null;
    const [a, b] = sidesFor(bracket, picks, s.from);
    return a?.id === id ? a : b?.id === id ? b : null;
  };
  return [resolve(m.sides[0]), resolve(m.sides[1])];
}

/**
 * Drop every pick that does not name a team in its seat, in round order so a
 * dropped early pick takes the later ones it fed with it. `dropped` lists the
 * matchup keys that were cleared (including keys the bracket does not have).
 */
export function cleanPicks(bracket: PickBracket, picks: Picks): { picks: Picks; dropped: string[] } {
  const out: Picks = {};
  const dropped: string[] = [];
  const known = new Set(bracket.matchups.map((m) => m.key));
  for (const k of Object.keys(picks)) if (!known.has(k)) dropped.push(k);
  for (const m of byRound(bracket)) {
    const id = picks[m.key];
    if (!id) continue;
    const [a, b] = sidesFor(bracket, out, m.key);
    if (a?.id === id || b?.id === id) out[m.key] = id;
    else dropped.push(m.key);
  }
  return { picks: out, dropped };
}

/** Set one pick and clear whatever it orphans downstream. */
export function applyPick(bracket: PickBracket, picks: Picks, key: string, teamId: string): Picks {
  return cleanPicks(bracket, { ...picks, [key]: teamId }).picks;
}

export function pickedCount(bracket: PickBracket, picks: Picks): number {
  return bracket.matchups.filter((m) => picks[m.key]).length;
}

export function isComplete(bracket: PickBracket, picks: Picks): boolean {
  return pickedCount(bracket, picks) === bracket.matchups.length;
}

export function teamById(bracket: PickBracket, id: string | undefined): PickTeam | null {
  if (!id) return null;
  for (const m of bracket.matchups) for (const s of m.sides) if (s.team?.id === id) return s.team;
  return null;
}

export function championOf(bracket: PickBracket, picks: Picks): PickTeam | null {
  return teamById(bracket, picks[bracket.final]);
}

export function maxPoints(bracket: PickBracket): number {
  return bracket.matchups.reduce((n, m) => n + (bracket.rounds[m.round]?.weight ?? 0), 0);
}

// ── Late brackets ────────────────────────────────────────────────────────────
//
// A bracket sent after the lock picks only the series that had not started
// when it came in. Its other series are not its picks: they hold the real
// winner, so the seats they feed resolve, and they score nothing either way.

/** When one series starts, and which clubs are in it so far. */
export interface SeriesStart {
  round: number;
  /** Real club ids listed in the series so far; placeholders left out. */
  teams: string[];
  /** First pitch of its first game, ms. */
  at: number;
}

/**
 * matchup key → the club that really won it, for every decided series. Walked
 * in round order so a seat fed by a decided series resolves for the next one.
 */
export function actualPicks(bracket: PickBracket, results: SeriesResult[]): Picks {
  const out: Picks = {};
  for (const m of byRound(bracket)) {
    const [a, b] = sidesFor(bracket, out, m.key);
    if (!a || !b) continue;
    const r = results.find((x) => x.round === m.round &&
      ((x.winner === a.id && x.loser === b.id) || (x.winner === b.id && x.loser === a.id)));
    if (r) out[m.key] = r.winner;
  }
  return out;
}

/**
 * Matchup keys whose series had started by `t`. A series is found by a club
 * the real results put in one of its seats; a matchup with no club known yet
 * (both feeders still playing) counts as started only once every series of
 * its round has. Same rule as `_picksStarted` in public/_worker.js, which
 * checks the picked club instead of the seats.
 */
export function startedKeys(bracket: PickBracket, results: SeriesResult[], starts: SeriesStart[], t: number): Set<string> {
  const actual = actualPicks(bracket, results);
  const out = new Set<string>();
  for (const m of bracket.matchups) {
    const ids = sidesFor(bracket, actual, m.key).flatMap((x) => (x ? [x.id] : []));
    const own = ids.length ? starts.find((s) => s.round === m.round && s.teams.some((id) => ids.includes(id))) : undefined;
    if (own) {
      if (own.at <= t) out.add(m.key);
      continue;
    }
    const round = starts.filter((s) => s.round === m.round);
    if (round.length && round.every((s) => s.at <= t)) out.add(m.key);
  }
  return out;
}

/** The keys a late bracket sent at `t` could pick. */
export function openKeysAt(bracket: PickBracket, results: SeriesResult[], starts: SeriesStart[], t: number): Set<string> {
  const started = startedKeys(bracket, results, starts, t);
  return new Set(bracket.matchups.map((m) => m.key).filter((k) => !started.has(k)));
}

/**
 * A late bracket as a full one: its own picks on its open keys, the real
 * winner everywhere else, then cleaned like any bracket. On-time brackets
 * (`openKeys` null) are just cleaned.
 */
export function effectivePicks(bracket: PickBracket, raw: Picks, results: SeriesResult[], openKeys: ReadonlySet<string> | null): Picks {
  if (!openKeys) return cleanPicks(bracket, raw).picks;
  const actual = actualPicks(bracket, results);
  const merged: Picks = {};
  for (const m of bracket.matchups) {
    const v = openKeys.has(m.key) ? raw[m.key] : actual[m.key];
    if (v) merged[m.key] = v;
  }
  return cleanPicks(bracket, merged).picks;
}

export type PickStatus = "correct" | "wrong" | "pending";

export interface PickScore {
  points: number;
  /** Points every entry could have scored from the series decided so far. */
  possible: number;
  /** points / possible, 0–100; null before any series is decided. */
  pct: number | null;
  /** points + everything still pending and not already busted. */
  maxLeft: number;
  correct: number;
  wrong: number;
  /** No wrong pick yet and every series picked. */
  perfectAlive: boolean;
  /** Every series decided and every pick right. */
  perfect: boolean;
  status: Record<string, PickStatus>;
}

/**
 * Score a set of picks against finished series.
 *
 * Scoring is by team and round, not by seat: a pick is right when the team
 * picked to win a round-R series did win a round-R series. With clean picks a
 * team appears in at most one matchup per round, so this is the same as
 * matching seat by seat — but it stays right if the drawn seats were ever off
 * by a tiebreak the standings feed can't see.
 *
 * A pick is wrong as soon as its team is out: losing a series in the same or an
 * earlier round busts every later pick of that team.
 */
export function scorePicks(bracket: PickBracket, raw: Picks, results: SeriesResult[], openKeys: ReadonlySet<string> | null = null): PickScore {
  const picks = effectivePicks(bracket, raw, results, openKeys);
  const weight = (r: number) => bracket.rounds[r]?.weight ?? 0;
  const won = new Set(results.map((r) => `${r.round}:${r.winner}`));
  const outAt = new Map<string, number>();
  for (const r of results) {
    const prev = outAt.get(r.loser);
    if (prev == null || r.round < prev) outAt.set(r.loser, r.round);
  }
  const status: Record<string, PickStatus> = {};
  let points = 0, correct = 0, wrong = 0, pending = 0;
  for (const m of bracket.matchups) {
    // A late bracket's started series hold the real winner, not a pick.
    if (openKeys && !openKeys.has(m.key)) continue;
    const id = picks[m.key];
    if (!id) continue;
    const out = outAt.get(id);
    if (won.has(`${m.round}:${id}`)) {
      status[m.key] = "correct";
      points += weight(m.round);
      correct++;
    } else if (out != null && out <= m.round) {
      status[m.key] = "wrong";
      wrong++;
    } else {
      status[m.key] = "pending";
      pending += weight(m.round);
    }
  }
  // A late bracket is held to the series it could pick: its % is out of the
  // points those series have paid so far, so missing a round costs it nothing.
  let possible = results.reduce((n, r) => n + weight(r.round), 0);
  if (openKeys) {
    const actual = actualPicks(bracket, results);
    possible = bracket.matchups.reduce((n, m) => n + (openKeys.has(m.key) && actual[m.key] ? weight(m.round) : 0), 0);
  }
  // Late brackets play for fun: never perfect, never a prize.
  const complete = !openKeys && isComplete(bracket, picks);
  return {
    points,
    possible,
    pct: possible > 0 ? Math.round((points / possible) * 100) : null,
    maxLeft: points + pending,
    correct,
    wrong,
    perfectAlive: complete && wrong === 0,
    perfect: complete && wrong === 0 && correct === bracket.matchups.length,
    status,
  };
}

export interface BoardEntry {
  name: string;
  picks: Picks;
  /** Sent after the lock (see "Late brackets" above). */
  late?: boolean;
  /** When the late bracket first came in: its open series are the ones not started then. */
  lateAt?: string;
}

export interface BoardRow {
  rank: number;
  name: string;
  late: boolean;
  entry: BoardEntry;
  score: PickScore;
  champion: PickTeam | null;
}

/**
 * Rank entries by points, then by the most they can still reach, then by name
 * so the order is stable between polls. Ties share a rank (1, 1, 3).
 */
export function rankEntries(
  bracket: PickBracket,
  entries: BoardEntry[],
  results: SeriesResult[],
  /** A late entry's open keys; null for an on-time entry. */
  openKeysOf: (e: BoardEntry) => ReadonlySet<string> | null = () => null,
): BoardRow[] {
  const rows = entries.map((e) => {
    const open = openKeysOf(e);
    return {
      rank: 0,
      name: e.name,
      late: !!e.late,
      entry: e,
      score: scorePicks(bracket, e.picks, results, open),
      champion: championOf(bracket, effectivePicks(bracket, e.picks, results, open)),
    };
  });
  rows.sort((a, b) =>
    b.score.points - a.score.points ||
    b.score.maxLeft - a.score.maxLeft ||
    a.name.localeCompare(b.name));
  rows.forEach((r, i) => {
    const prev = rows[i - 1];
    r.rank = prev && prev.score.points === r.score.points && prev.score.maxLeft === r.score.maxLeft ? prev.rank : i + 1;
  });
  return rows;
}

// ── Names ────────────────────────────────────────────────────────────────────

/** The longest name (or initials) an entry can carry. The worker enforces the same cap. */
export const NAME_MAX = 20;
const NAME_RE = /^[\p{L}\p{N}][\p{L}\p{N} .'-]*$/u;

/**
 * Tidy a typed name: trim, collapse runs of spaces. Returns null when it is
 * empty, too long, or carries anything beyond letters, digits, spaces and
 * `.'-` — the entry name is the only free text the leaderboard takes.
 */
export function cleanName(raw: string): string | null {
  const s = raw.normalize("NFKC").replace(/\s+/g, " ").trim();
  if (!s || s.length > NAME_MAX || !NAME_RE.test(s)) return null;
  return s;
}

/** Two names that differ only in case or spacing are the same entry. */
export function nameKey(name: string): string {
  return name.normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase();
}
