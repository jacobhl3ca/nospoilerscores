// The "Playoff race" tag on NFL cards (owner design 10/9): a small badge on at
// most 3 games a week, regular-season weeks 13–18, for the tightest races.
//
// Pure, so node --test can load it. The standings come from
// lib/nflPlayoffPicture (ESPN standings, clincher letters); the week's games
// from ESPN's NFL scoreboard for that week (lib/usePlayoffRace fetches both).
//
// Spoiler rule: the picks may not move because of a result from this week.
// The standings feed updates as games go final, so this module rebuilds the
// table as it stood before the week's first kickoff:
// - Each team on the slate gets its going-in record from the scoreboard. ESPN
//   holds that record on a pre or live game (see lib/upcomingRecords). On a
//   finished game the record already counts the result, so the result is taken
//   back out (winner −1 W, loser −1 L, a tie −1 T).
// - ESPN's clincher letters are used only while the feed holds no result from
//   this week. After that, a letter could come from a game played this week,
//   so only a team that is out on the week-start numbers counts as eliminated.
// - Every game of the week is ranked, finished ones too, so a game going final
//   never hands its place to another game. The card hides the badge on a
//   finished game.
// A feed that disagrees with the scoreboard by more than this week's game
// (stale or missing) gives no picks at all.

import { byRecord, type NflPicture, type NflTeam } from "./nflPlayoffPicture.ts";

export const PLAYOFF_RACE_FIRST_WEEK = 13;
export const PLAYOFF_RACE_LAST_WEEK = 18;
export const PLAYOFF_RACE_MAX_GAMES = 3;
// "Within 1 game" of the wildcard line or the division lead.
const RACE_GAMES = 1;
const REGULAR_SEASON_GAMES = 17;

export type PlayoffRaceSide = { teamId: string; record: string; winner: boolean };

export type PlayoffRaceGame = {
  id: string;
  date: string; // ISO kickoff
  state: "pre" | "in" | "post";
  home: PlayoffRaceSide;
  away: PlayoffRaceSide;
};

export function isPlayoffRaceWeek(week: number | null | undefined): week is number {
  return typeof week === "number" && week >= PLAYOFF_RACE_FIRST_WEEK && week <= PLAYOFF_RACE_LAST_WEEK;
}

type Rec = { wins: number; losses: number; ties: number };

function parseRecord(s: string): Rec | null {
  const m = /^(\d+)-(\d+)(?:-(\d+))?$/.exec(s.trim());
  if (!m) return null;
  return { wins: +m[1], losses: +m[2], ties: m[3] ? +m[3] : 0 };
}

const played = (r: Rec) => r.wins + r.losses + r.ties;

// Games back of `ahead`, counting a tie as half a win and half a loss.
function gamesBack(ahead: Rec, t: Rec): number {
  return ((ahead.wins - ahead.losses) - (t.wins - t.losses)) / 2;
}

// The record a side carried into this game.
function goingIn(game: PlayoffRaceGame, side: "home" | "away"): Rec | null {
  const me = game[side];
  const r = parseRecord(me.record);
  if (!r || game.state !== "post") return r;
  const other = game[side === "home" ? "away" : "home"];
  if (me.winner) r.wins -= 1;
  else if (other.winner) r.losses -= 1;
  else r.ties -= 1;
  return r.wins < 0 || r.losses < 0 || r.ties < 0 ? null : r;
}

type RaceTeam = NflTeam & { out: boolean; distance: number };

// The table as it stood before the week's first kickoff, or null when the feed
// does not line up with the scoreboard.
function weekStartTable(games: PlayoffRaceGame[], picture: NflPicture): Map<string, RaceTeam> | null {
  const feed = new Map<string, NflTeam>();
  for (const c of picture.conferences) for (const d of c.divisions) for (const t of d.teams) feed.set(t.id, t);

  const start = new Map<string, Rec>();
  let clean = true;
  for (const g of games) {
    for (const side of ["home", "away"] as const) {
      const id = g[side].teamId;
      const r = goingIn(g, side);
      const f = feed.get(id);
      if (!r || !f) return null;
      const fp = played(f);
      if (fp < played(r) || fp > played(r) + 1) return null;
      if (fp !== played(r)) clean = false;
      else if (f.wins !== r.wins || f.losses !== r.losses || f.ties !== r.ties) return null;
      start.set(id, r);
    }
  }

  const table = new Map<string, RaceTeam>();
  for (const c of picture.conferences) {
    const divisions = c.divisions.map((d) =>
      d.teams.map((f): RaceTeam => {
        const r = start.get(f.id) ?? f;
        const n = played(r);
        return {
          ...f,
          wins: r.wins,
          losses: r.losses,
          ties: r.ties,
          pct: n ? (r.wins + r.ties / 2) / n : 0,
          seed: null,
          divisionLeader: false,
          out: clean && f.clinch === "eliminated",
          distance: Infinity,
        };
      }).sort(byRecord),
    );
    const teams = divisions.flat();
    for (const d of divisions) d[0].divisionLeader = true;
    const leaders = divisions.map((d) => d[0]).sort(byRecord);
    const rest = teams.filter((t) => !t.divisionLeader).sort(byRecord);
    [...leaders.slice(0, 4), ...rest.slice(0, 3)].forEach((t, i) => { t.seed = i + 1; });
    const seventh = rest[2];
    const firstOut = rest[3];

    const points = (r: Rec) => r.wins + r.ties / 2;
    for (const d of divisions) {
      const leader = d[0];
      for (const t of d) {
        // Out on the numbers: seven clubs already finish ahead even if this one
        // wins out, and its division leader does too.
        const best = points(t) + Math.max(0, REGULAR_SEASON_GAMES - played(t));
        const ahead = teams.filter((o) => o !== t && points(o) > best).length;
        const divisionGone = t !== leader && points(leader) > best;
        if (ahead >= 7 && divisionGone) t.out = true;

        // How close its race is: a division leader's lead, a chaser's deficit;
        // a wild card's lead over the first club out, or a club out of the
        // seeds' deficit to seed 7.
        const division = t === leader ? (d[1] ? gamesBack(t, d[1]) : Infinity) : gamesBack(leader, t);
        let wildcard = Infinity;
        if (!t.divisionLeader) {
          if (t.seed != null) wildcard = firstOut ? gamesBack(t, firstOut) : Infinity;
          else if (seventh) wildcard = gamesBack(seventh, t);
        }
        t.distance = Math.min(division, wildcard);
      }
    }
    for (const t of teams) table.set(t.id, t);
  }
  return table;
}

/**
 * The ids of the (at most 3) games that carry the Playoff race tag this week.
 * Empty outside weeks 13–18, or when the standings are missing or out of step.
 */
export function pickPlayoffRaceGames(
  games: PlayoffRaceGame[],
  picture: NflPicture | null,
  week: number | null | undefined,
): Set<string> {
  if (!picture || !isPlayoffRaceWeek(week) || !games.length) return new Set();
  const table = weekStartTable(games, picture);
  if (!table) return new Set();

  const ranked: { id: string; date: string; tightness: number; inRace: number }[] = [];
  for (const g of games) {
    const home = table.get(g.home.teamId);
    const away = table.get(g.away.teamId);
    if (!home || !away || home.out || away.out) continue;
    const tightness = Math.min(home.distance, away.distance);
    if (tightness > RACE_GAMES) continue;
    const inRace = (home.distance <= RACE_GAMES ? 1 : 0) + (away.distance <= RACE_GAMES ? 1 : 0);
    ranked.push({ id: g.id, date: g.date, tightness, inRace });
  }
  ranked.sort((a, b) =>
    a.tightness - b.tightness
    || b.inRace - a.inRace
    || Date.parse(a.date) - Date.parse(b.date)
    || a.id.localeCompare(b.id));
  return new Set(ranked.slice(0, PLAYOFF_RACE_MAX_GAMES).map((r) => r.id));
}

type EspnScoreboard = {
  events?: {
    id?: string;
    date?: string;
    week?: { number?: number };
    season?: { type?: number };
    status?: { type?: { state?: string } };
    competitions?: {
      competitors?: {
        homeAway?: string;
        winner?: boolean;
        team?: { id?: string };
        records?: { summary?: string }[];
      }[];
    }[];
  }[];
};

/** ESPN's NFL scoreboard for one week → that week's regular-season games. */
export function playoffRaceGamesFromScoreboard(data: EspnScoreboard, week: number): PlayoffRaceGame[] {
  const out: PlayoffRaceGame[] = [];
  for (const e of data.events ?? []) {
    if (e.season?.type !== 2 || e.week?.number !== week || !e.id || !e.date) continue;
    const state = e.status?.type?.state;
    if (state !== "pre" && state !== "in" && state !== "post") continue;
    const cs = e.competitions?.[0]?.competitors ?? [];
    const side = (homeAway: string): PlayoffRaceSide | null => {
      const c = cs.find((x) => x.homeAway === homeAway);
      const teamId = c?.team?.id;
      return teamId ? { teamId, record: c.records?.[0]?.summary ?? "", winner: !!c.winner } : null;
    };
    const home = side("home");
    const away = side("away");
    if (home && away) out.push({ id: e.id, date: e.date, state, home, away });
  }
  return out;
}
