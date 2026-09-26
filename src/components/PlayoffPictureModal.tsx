"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import {
  BEST_OF,
  broadcastFor,
  buildBracket,
  contendersBySeed,
  fetchPlayoffOdds,
  fetchPlayoffPicture,
  playBracket,
  roundLabel,
  shadeFor,
  sortTeams,
  teamLogo,
  worldSeriesOf,
  type BracketMatchup,
  type BracketRound,
  type BracketMatchupKey,
  type BracketResult,
  type BracketSlot,
  type ClinchKind,
  type LeagueBracket,
  type LeagueKey,
  type Odd,
  type PlayoffLeague,
  type PlayoffOdds,
  type PlayoffPicture,
  type PlayoffTeam,
  type SortDir,
  type SortKey,
} from "@/lib/playoffPicture";
import { fetchMlbPostseason, mlbPickBracket, mlbRoundHeading, type MlbPostseason } from "@/lib/mlbPicks";
import BracketPicks from "@/components/BracketPicks";

// The MLB playoff picture, behind one reveal.
//
// Unlike the Slam bracket, there is no useful partial gate here: the ORDER of
// the six seeds is itself derived from every result to date, so revealing "who's
// in" without the numbers would leak the same thing. One cover, one tap — and
// every tab sits behind it, Picks included (its seats are the seeds). Picks
// adds a second cover of its own for series results; see BracketPicks.
//
// The cover is the whole point of the panel existing at all — a W-L record is a
// second-order spoiler (today's 82-62 encodes whether they won last night), the
// same reasoning that keeps `showTeamRecords` opt-in and default-off.
//
// Behind the cover the numbers shown are chances, not records: they answer the
// question the picture is opened for and move a little less per game than a W-L
// line. Games back is a step closer to a record, so it sits behind its own
// toggle, off by default.

const REVEAL_KEY = (season: number) => `mlb-playoff-picture-revealed-${season}`;
const SORT_KEY = "mlb-playoff-picture-sort";
const TAB_KEY = "mlb-playoff-picture-tab";

type TabKey = "odds" | "bracket" | "picks";
const TABS: { key: TabKey; label: string }[] = [
  { key: "odds", label: "Odds" },
  { key: "bracket", label: "Bracket" },
  { key: "picks", label: "Picks" },
];

interface Sort { key: SortKey; dir: SortDir }
// The panel opens on the odds, best chance first. The question it is opened
// for is "who is getting in", and a probability order answers that directly,
// where a seed order answers "who is where right now" and leaves the reader to
// do the comparing. Seed is one click away and keeps the dividers.
const DEFAULT_SORT: Sort = { key: "playoff", dir: "desc" };

function loadRevealed(season: number): boolean {
  try {
    return window.localStorage.getItem(REVEAL_KEY(season)) === "1";
  } catch {
    return false;
  }
}

// Read on mount rather than in a useState initialiser: this app is a static
// export, so the first render happens without a window and a stored preference
// read during it would be a hydration mismatch.
function readSort(): Sort | null {
  try {
    const raw = window.localStorage.getItem(SORT_KEY);
    if (!raw) return null;
    const [key, dir] = raw.split(":");
    const keys: SortKey[] = ["seed", "playoff", "division", "wildCard"];
    if (!keys.includes(key as SortKey)) return null;
    return { key: key as SortKey, dir: dir === "asc" ? "asc" : "desc" };
  } catch {
    return null;
  }
}

function readTab(): TabKey | null {
  try {
    const t = window.localStorage.getItem(TAB_KEY);
    return t === "bracket" || t === "odds" || t === "picks" ? t : null;
  } catch {
    return null;
  }
}

const CLINCH_TEXT: Record<ClinchKind, string> = {
  bye: "Clinched bye",
  division: "Clinched division",
  berth: "Clinched berth",
  wildcard: "Clinched wild card",
};

// The one-line status a row earns, most decisive first. A bare "Clinched" is
// never enough — it reads as "clinched the division" to half the people who see
// it, which is wrong for a team that has only locked up a berth.
function statusFor(t: PlayoffTeam, showGamesBack: boolean): { text: string; tone: "good" | "plain" } | null {
  if (t.clinch) return { text: CLINCH_TEXT[t.clinch], tone: "good" };
  // `clinched` without an indicator: a berth is the one thing every clinch
  // implies, so it is the safe thing to say.
  if (t.clinched) return { text: "Clinched berth", tone: "good" };
  if (t.divisionLeader && t.magicNumber && t.magicNumber !== "-") return { text: `Magic ${t.magicNumber}`, tone: "good" };
  if (t.divisionLeader) return { text: "Leads division", tone: "good" };
  if (!showGamesBack) return null;
  const gb = t.wildCardGamesBack;
  if (gb && gb !== "-") return { text: gb.startsWith("+") ? `${gb.slice(1)} up` : `${gb} back`, tone: "plain" };
  return { text: "In the mix", tone: "plain" };
}

// A sortable column needs a value in every cell, so a clinched club reads 100%
// rather than the blank it used to show — "Clinched berth" in the status column
// already says why.
function playoffOdd(t: PlayoffTeam, odds: PlayoffOdds | null): Odd | null {
  if (t.clinched) return { value: 100, label: "100%" };
  return odds?.[t.abbrev]?.playoff ?? null;
}

function OddsCell({ odd, className = "" }: { odd: Odd | null; className?: string }) {
  return (
    <td
      className={`text-[11px] tabular-nums text-right px-1 py-1 ${className}`}
      style={{ background: shadeFor(odd), color: "var(--text)" }}
    >
      {odd?.label ?? "—"}
    </td>
  );
}

const SORT_LABEL: Record<SortKey, string> = {
  seed: "Seed",
  playoff: "Playoffs",
  division: "Division",
  wildCard: "Wild card",
};

function SortHeader({
  colKey, sort, onSort, className = "", title,
}: {
  colKey: SortKey;
  sort: Sort;
  onSort: (k: SortKey) => void;
  className?: string;
  title?: string;
}) {
  const active = sort.key === colKey;
  return (
    <th
      scope="col"
      className={`px-1 py-1 font-normal ${className}`}
      aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
    >
      <button
        type="button"
        onClick={() => onSort(colKey)}
        title={title}
        className="w-full text-inherit cursor-pointer whitespace-nowrap"
        style={{ color: active ? "var(--accent)" : "var(--text-muted)" }}
      >
        {SORT_LABEL[colKey]}
        <span aria-hidden className="ml-0.5">{active ? (sort.dir === "asc" ? "▲" : "▼") : ""}</span>
      </button>
    </th>
  );
}

function TeamRow({ team, seed, odds, showGamesBack }: {
  team: PlayoffTeam;
  seed: number | null;
  odds: PlayoffOdds | null;
  showGamesBack: boolean;
}) {
  const status = statusFor(team, showGamesBack);
  const row = odds?.[team.abbrev] ?? null;
  return (
    <tr style={{ background: "var(--bg-card)" }}>
      <td className="text-[11px] w-11 text-center tabular-nums font-bold px-1 py-1" style={{ color: seed ? "var(--text)" : "var(--text-muted)", opacity: seed ? 1 : 0.5 }}>
        {seed ?? "—"}
      </td>
      {/* max-w-0 is what lets the name truncate instead of widening the column:
          it gives the cell a zero min-content so the flex child can shrink. */}
      <td className="px-1 py-1 max-w-0">
        <div className="flex items-center gap-1.5 min-w-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={teamLogo(team.id)}
            alt=""
            loading="lazy"
            decoding="async"
            width={18}
            height={18}
            className="w-[18px] h-[18px] object-contain shrink-0"
            draggable={false}
            onError={(e) => { e.currentTarget.style.display = "none"; }}
          />
          <span className="text-xs truncate min-w-0" style={{ color: "var(--text)" }} title={team.name}>{team.name}</span>
        </div>
      </td>
      <OddsCell odd={playoffOdd(team, odds)} className="w-[46px]" />
      <OddsCell odd={row?.division ?? null} className="w-[46px] hidden sm:table-cell" />
      <OddsCell odd={row?.wildCard ?? null} className="w-[46px] hidden sm:table-cell" />
      <td
        className="text-[10px] tabular-nums text-right px-1 py-1 w-[104px] whitespace-nowrap"
        style={{ color: status?.tone === "good" ? "var(--accent)" : "var(--text-muted)", opacity: !status || status.tone === "good" ? 1 : 0.75 }}
      >
        {status?.text ?? ""}
      </td>
    </tr>
  );
}

function DividerRow({ label }: { label: string }) {
  return (
    <tr>
      <td colSpan={6} className="py-1.5">
        <div className="flex items-center gap-2">
          <div className="h-px flex-1" style={{ background: "var(--border)" }} />
          <span className="text-[9px] uppercase tracking-wide" style={{ color: "var(--text-muted)", opacity: 0.7 }}>{label}</span>
          <div className="h-px flex-1" style={{ background: "var(--border)" }} />
        </div>
      </td>
    </tr>
  );
}

function LeagueTable({ league, odds, showGamesBack, sort, onSort }: {
  league: PlayoffLeague;
  odds: PlayoffOdds | null;
  showGamesBack: boolean;
  sort: Sort;
  onSort: (k: SortKey) => void;
}) {
  // Seed view keeps the shape a standings picture is read in — the six, split
  // at the bye line, then the chase. Any odds sort, including the one the panel
  // opens on, drops the dividers: they mark seed boundaries, and in a
  // probability order they would mark nothing.
  const bySeed = sort.key === "seed";
  const seeded = useMemo(
    () => (bySeed ? sortTeams(league.seeded, odds, sort.key, sort.dir) : []),
    [bySeed, league.seeded, odds, sort.key, sort.dir],
  );
  const hunt = useMemo(
    () => (bySeed ? sortTeams(league.hunt, odds, "playoff", "desc") : []),
    [bySeed, league.hunt, odds],
  );
  const flat = useMemo(
    () => (bySeed ? [] : sortTeams([...league.seeded, ...league.hunt], odds, sort.key, sort.dir)),
    [bySeed, league.seeded, league.hunt, odds, sort.key, sort.dir],
  );

  // Capped at what the widest club name needs: max-w-0 on the name cell hands
  // it all the table's slack, so an uncapped table left a wide gap between
  // the name and its odds. The second league sits flush right when the two
  // are side by side, so the pair spans the panel edge to edge.
  return (
    <div className="min-w-0 w-full max-w-[24rem] sm:max-w-[30rem] lg:even:justify-self-end">
      <div className="text-[10px] font-bold uppercase tracking-wide mb-1.5" style={{ color: "var(--text-muted)" }}>
        {league.name}
      </div>
      {/* Auto layout, not table-fixed: below `sm` the Division and Wild card
          cells are display:none, and a fixed-layout table still treats their
          columns as auto and hands them a third of the row — which left the
          team name one letter wide on a phone. Auto layout drops a hidden
          column entirely and gives the slack to the name. */}
      <table className="w-full border-separate" style={{ borderSpacing: "0 2px" }}>
        <caption className="sr-only">{league.name} playoff odds, sorted by {SORT_LABEL[sort.key]}</caption>
        <thead>
          <tr className="text-[10px]" style={{ color: "var(--text-muted)" }}>
            {/* Wide enough for the word plus its sort arrow: at w-6 the header
                ran straight into the Team column. */}
            <SortHeader colKey="seed" sort={sort} onSort={onSort} className="w-11" />
            <th scope="col" className="px-1 py-1 font-normal text-left">Team</th>
            <SortHeader colKey="playoff" sort={sort} onSort={onSort} className="w-[46px]" title="Chance of making the playoffs" />
            <SortHeader colKey="division" sort={sort} onSort={onSort} className="w-[46px] hidden sm:table-cell" title="Chance of winning the division" />
            <SortHeader colKey="wildCard" sort={sort} onSort={onSort} className="w-[46px] hidden sm:table-cell" title="Chance of taking a wild card" />
            <th scope="col" className="px-1 py-1 font-normal text-right w-[104px]">Status</th>
          </tr>
        </thead>
        <tbody>
          {bySeed ? (
            <>
              {seeded.map((t, i) => (
                <Fragment key={t.id}>
                  <TeamRow team={t} seed={t.seed} odds={odds} showGamesBack={showGamesBack} />
                  {/* Seeds 1-2 sit out the wild-card round; 3-6 play it. The rule
                      the divider marks is the one a picture is read for. */}
                  {i === 1 ? <DividerRow label="bye · wild-card round below" /> : null}
                </Fragment>
              ))}
              {hunt.length ? (
                <>
                  <DividerRow label="still alive" />
                  {hunt.map((t) => <TeamRow key={t.id} team={t} seed={null} odds={odds} showGamesBack={showGamesBack} />)}
                </>
              ) : null}
            </>
          ) : (
            flat.map((t) => <TeamRow key={t.id} team={t} seed={t.seed} odds={odds} showGamesBack={showGamesBack} />)
          )}
        </tbody>
      </table>
    </div>
  );
}

// ── Bracket ──────────────────────────────────────────────────────────────────

// The same shading rule the Odds tab paints its cells with, so a percentage
// means the same thing on both tabs rather than going flat grey over here.
function OddsPill({ odd, small = false }: { odd: Odd | null; small?: boolean }) {
  if (!odd) return null;
  return (
    <span
      className={`${small ? "text-[9px]" : "text-[10px]"} tabular-nums rounded px-1 py-px shrink-0 ml-auto`}
      style={{ background: shadeFor(odd), color: "var(--text)" }}
    >
      {odd.label}
    </span>
  );
}

// An empty seat says who can still arrive in it. When the feeding matchup is
// already two named clubs that is the pair itself ("TEX/CWS winner"); one round
// further on, where the feeder is itself a winner seat, the round it comes out
// of is all there is to say.
function feederLabel(bracket: LeagueBracket, from: BracketMatchupKey): string {
  const m = bracket.matchups.find((x) => x.key === from);
  const a = m?.sides[0].team?.abbrev;
  const b = m?.sides[1].team?.abbrev;
  if (a && b) return `${a}/${b} winner`;
  return `${m ? roundLabel(m.round, bracket.league) : "Round"} winner`;
}

// One club's line in a matchup card: seed, logo, abbreviation, its chance of
// making the field. Wide and short on purpose — the old layout stacked two
// near-square tiles, which read as a grid of boxes rather than as a bracket.
// A clinched club gets the small tick and no odds pill: the pill would only
// ever say 100%, and a bright pill pulls the eye off the matchup. A seat a
// series winner has moved into shows that club's seed but no pill either: by
// then every club left is in the field. The loser of a finished series is dimmed rather than removed, so
// the pairing still reads.
function Seat({ slot, odds, chasers, emptyLabel, outcome = null, compact = false }: {
  slot: BracketSlot;
  odds: PlayoffOdds | null;
  chasers: PlayoffTeam[];
  emptyLabel: string;
  outcome?: "won" | "lost" | null;
  // Both seats of the card are empty: no logo gutter, label centred.
  compact?: boolean;
}) {
  const t = slot.team;
  if (!t) {
    if (compact) {
      return (
        <div data-bracket-slot className="flex items-center justify-center px-1.5 h-[30px]">
          <span className="text-[9px] italic whitespace-nowrap" style={{ color: "var(--text-muted)", opacity: 0.75 }}>
            {emptyLabel}
          </span>
        </div>
      );
    }
    return (
      <div data-bracket-slot className="flex items-center gap-1.5 px-1.5 h-[30px]">
        <span className="w-[18px] shrink-0" />
        <span className="text-[9px] italic truncate min-w-0" style={{ color: "var(--text-muted)", opacity: 0.75 }} title={emptyLabel}>
          {emptyLabel}
        </span>
      </div>
    );
  }
  const shown = chasers.slice(0, 2);
  const extra = chasers.length - shown.length;
  const clinched = !!(t.clinch || t.clinched);
  return (
    <div style={outcome === "lost" ? { opacity: 0.4 } : undefined}>
      <div
        // Seeded seats and advanced seats are counted apart: QA pins exactly
        // twelve seeded clubs, however far the postseason has gone.
        {...(slot.from ? { "data-bracket-advanced": "" } : { "data-bracket-team": "" })}
        {...(outcome ? { "data-bracket-outcome": outcome } : {})}
        className="flex items-center gap-1.5 px-1.5 h-[30px]"
        title={outcome === "won" ? `${t.name} won the series` : outcome === "lost" ? `${t.name} lost the series` : t.name}
      >
        {slot.seed ?? t.seed ? (
          <span className="text-[9px] font-bold tabular-nums w-2 shrink-0" style={{ color: "var(--text-muted)" }}>
            {slot.seed ?? t.seed}
          </span>
        ) : null}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={teamLogo(t.id)}
          alt=""
          loading="lazy"
          decoding="async"
          width={18}
          height={18}
          className="w-[18px] h-[18px] object-contain shrink-0"
          draggable={false}
          onError={(e) => { e.currentTarget.style.display = "none"; }}
        />
        <span className="text-[11px] font-bold leading-none shrink-0" style={{ color: "var(--text)" }}>{t.abbrev}</span>
        {clinched ? (
          <span className="text-[9px] leading-none shrink-0" style={{ color: "var(--accent)" }} title={t.clinch ? CLINCH_TEXT[t.clinch] : "Clinched berth"}>✓</span>
        ) : null}
        {slot.from || clinched ? null : <OddsPill odd={playoffOdd(t, odds)} />}
      </div>
      {shown.length ? (
        <div className="pl-1.5 pr-1.5 pb-1">
          <div className="text-[8px] uppercase tracking-wide leading-none mb-0.5" style={{ color: "var(--text-muted)", opacity: 0.65 }}>
            Chasing this spot
          </div>
          {shown.map((c) => (
            <div key={c.id} data-bracket-chaser className="flex items-center gap-1 h-[16px]" title={`${c.name} is still in it for this spot`}>
              <span className="w-2 shrink-0 text-[9px] leading-none" style={{ color: "var(--text-muted)", opacity: 0.5 }}>↳</span>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={teamLogo(c.id)}
                alt=""
                loading="lazy"
                decoding="async"
                width={12}
                height={12}
                className="w-[12px] h-[12px] object-contain shrink-0"
                draggable={false}
                onError={(e) => { e.currentTarget.style.display = "none"; }}
              />
              <span className="text-[9px] leading-none shrink-0" style={{ color: "var(--text-muted)" }}>{c.abbrev}</span>
              <OddsPill odd={playoffOdd(c, odds)} small />
            </div>
          ))}
          {extra > 0 ? (
            <div className="text-[8px] pl-3 leading-none" style={{ color: "var(--text-muted)", opacity: 0.6 }}>+{extra} more</div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

// A card whose two seats are both still empty ("ALDS winner" over "ALDS
// winner") shrinks to its labels instead of holding a full card's width, so
// the whole bracket fits and the NL side shows without a sideways scroll
// (Jacob 9/25). It grows back to full width once a club moves into it.
const CARD_W = "w-[124px] xl:w-[140px]";

// One card per matchup, two lines and a hairline between them — the same shape
// the World Cup bracket uses, so the two brackets in this app read alike.
function MatchupBox({ matchup, bracket, odds, chasers }: {
  matchup: BracketMatchup;
  bracket: LeagueBracket;
  odds: PlayoffOdds | null;
  chasers: Map<number, PlayoffTeam[]>;
}) {
  const seatChasers = (slot: BracketSlot) => (slot.seed ? chasers.get(slot.seed) ?? [] : []);
  const label = (slot: BracketSlot) => (slot.from ? feederLabel(bracket, slot.from) : slot.seed ? `Seed ${slot.seed}` : "Winner");
  const outcome = (slot: BracketSlot) =>
    matchup.winner == null || !slot.team ? null : slot.team.id === matchup.winner ? "won" as const : "lost" as const;
  const compact = !matchup.sides[0].team && !matchup.sides[1].team;
  return (
    <div
      {...(compact ? { "data-bracket-compact": "" } : {})}
      className={`rounded-lg py-0.5 ${compact ? "" : CARD_W}`}
      style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
    >
      <Seat slot={matchup.sides[0]} odds={odds} chasers={seatChasers(matchup.sides[0])} emptyLabel={label(matchup.sides[0])} outcome={outcome(matchup.sides[0])} compact={compact} />
      <div className="mx-1.5 h-px" style={{ background: "var(--border)", opacity: 0.6 }} />
      <Seat slot={matchup.sides[1]} odds={odds} chasers={seatChasers(matchup.sides[1])} emptyLabel={label(matchup.sides[1])} outcome={outcome(matchup.sides[1])} compact={compact} />
    </div>
  );
}

// The round header is a fixed height in every column so the connector lines
// between columns line up with the boxes rather than with the labels.
const HEADER_H = "h-[44px]";

function RoundColumn({ round, league, season, matchups, bracket, odds, chasers }: {
  round: BracketRound;
  league: LeagueKey;
  season: number;
  matchups: BracketMatchup[];
  bracket: LeagueBracket;
  odds: PlayoffOdds | null;
  chasers: Map<number, PlayoffTeam[]>;
}) {
  const channel = broadcastFor(season, round, league);
  return (
    <div className="flex flex-col shrink-0">
      <div className={`${HEADER_H} text-center px-0.5 sm:px-1`}>
        <div className="text-[10px] font-bold uppercase tracking-wide leading-tight" style={{ color: "var(--text)" }}>
          {roundLabel(round, league)}
        </div>
        <div className="text-[9px] leading-tight" style={{ color: "var(--text-muted)" }}>Best of {BEST_OF[round]}</div>
        {channel ? (
          <div data-bracket-channel className="text-[9px] leading-tight" style={{ color: "var(--text-muted)", opacity: 0.85 }}>
            {channel}
          </div>
        ) : null}
      </div>
      <div className="flex-1 flex flex-col justify-around gap-3">
        {matchups.map((m) => <MatchupBox key={m.key} matchup={m} bracket={bracket} odds={odds} chasers={chasers} />)}
      </div>
    </div>
  );
}

function LeagueHalf({ league, bracket, season, odds, mirrored }: {
  league: PlayoffLeague;
  bracket: LeagueBracket;
  season: number;
  odds: PlayoffOdds | null;
  mirrored: boolean;
}) {
  const chasers = useMemo(() => contendersBySeed(league, odds), [league, odds]);
  const of = (round: BracketRound) => bracket.matchups.filter((m) => m.round === round);
  const col = (round: BracketRound) => (
    <RoundColumn round={round} league={league.key} season={season} odds={odds} matchups={of(round)} bracket={bracket} chasers={chasers} />
  );
  // No drawn connectors. `justify-around` centres each matchup between the two
  // it feeds on, so the halving rounds read as a tree on their own — the same
  // thing WorldCupBracket does, and the only thing that stays aligned now that
  // a card with chasers under it is taller than one without.
  return (
    <div className={`flex items-stretch gap-1 sm:gap-2 xl:gap-3 ${mirrored ? "flex-row lg:flex-row-reverse" : "flex-row"}`}>
      {col("wildCard")}
      {col("divisionSeries")}
      {col("championship")}
    </div>
  );
}

function WorldSeriesColumn({ season, al, nl, winner }: {
  season: number;
  al: PlayoffTeam | null;
  nl: PlayoffTeam | null;
  winner: number | null;
}) {
  const channel = broadcastFor(season, "worldSeries", "AL");
  // `from` marks these as winner seats, so a pennant winner shows its seed and
  // no odds pill, like every other seat a series winner moves into.
  const seat = (team: PlayoffTeam | null): BracketSlot => ({ team, seed: null, from: "cs" });
  const outcome = (team: PlayoffTeam | null) => (winner == null || !team ? null : team.id === winner ? "won" as const : "lost" as const);
  const compact = !al && !nl;
  return (
    <div className="flex flex-col shrink-0">
      <div className={`${HEADER_H} text-center`}>
        <div className="text-[10px] font-bold uppercase tracking-wide leading-tight" style={{ color: "var(--text)" }}>World Series</div>
        <div className="text-[9px] leading-tight" style={{ color: "var(--text-muted)" }}>Best of {BEST_OF.worldSeries}</div>
        {channel ? (
          <div data-bracket-channel className="text-[9px] leading-tight" style={{ color: "var(--text-muted)", opacity: 0.85 }}>{channel}</div>
        ) : null}
      </div>
      <div className="flex-1 flex flex-col justify-center">
        <div
          {...(compact ? { "data-bracket-compact": "" } : {})}
          className={`rounded-lg py-0.5 ${compact ? "" : CARD_W}`}
          style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
        >
          <Seat slot={seat(al)} odds={null} chasers={[]} emptyLabel="AL champion" outcome={outcome(al)} compact={compact} />
          <div className="mx-1.5 h-px" style={{ background: "var(--border)", opacity: 0.6 }} />
          <Seat slot={seat(nl)} odds={null} chasers={[]} emptyLabel="NL champion" outcome={outcome(nl)} compact={compact} />
        </div>
      </div>
    </div>
  );
}

// Series winners come from MLB's postseason feed and move up the bracket as
// each series ends. `coverResults` is for the search pages, which show the
// panel with no cover: seeds are open there, but a series winner is a result,
// so it waits behind one tap. The tap lasts for this visit only, so coming back
// after the next series never shows its winner unasked. On the board the whole
// panel is already behind its own cover, and results show once that is lifted.
const NO_RESULTS: BracketResult[] = [];

function BracketView({ picture, odds, results, coverResults, onShowResults }: {
  picture: PlayoffPicture;
  odds: PlayoffOdds | null;
  results: BracketResult[];
  coverResults: boolean;
  onShowResults: () => void;
}) {
  const hideResults = coverResults && results.length > 0;
  const played = hideResults ? NO_RESULTS : results;
  const al = picture.leagues.find((l) => l.key === "AL");
  const nl = picture.leagues.find((l) => l.key === "NL");
  const alB = useMemo(() => (al ? playBracket(buildBracket(al), played) : null), [al, played]);
  const nlB = useMemo(() => (nl ? playBracket(buildBracket(nl), played) : null), [nl, played]);
  if (!al || !nl || !alB || !nlB) return null;
  const ws = worldSeriesOf(alB, nlB, played);
  // Every seed clinched = the regular season is over and the field is final.
  const fieldSet = picture.leagues.every((l) => l.seeded.length === 6 && l.seeded.every((t) => t.clinched));
  return (
    <div>
      {hideResults ? (
        <div className="flex justify-center mb-2">
          <button
            type="button"
            data-bracket-results-toggle
            onClick={onShowResults}
            className="text-xs font-medium px-3 py-1.5 rounded-full cursor-pointer"
            style={{ background: "var(--bg-card)", color: "var(--text)", border: "1px solid var(--border)" }}
          >
            Show series results (spoilers)
          </button>
        </div>
      ) : null}
      {/* One DOM for both widths: the halves sit side by side with the World
          Series between them from lg up, and stack below it. The seven columns
          need ~760px even with the later rounds compact (more once ALDS winners
          fill the ALCS cards), so a 768px tablet stacks like a phone. The NL half is
          mirrored only when there is room to mirror it. The desktop row scrolls
          sideways rather than squeezing the cards, since a narrow viewport
          inside the dialog is the only thing the seven columns won't fit. */}
      <div className="overflow-x-auto pb-1" tabIndex={0} role="group" aria-label="MLB postseason bracket">
        {/* w-max so the row sizes to its own columns and the scroller has
            something to scroll; mx-auto still centres it whenever it fits. A
            phone stacks the halves but each half is still three columns wide,
            so the sideways scroll is needed at every width, not just desktop. */}
        <div className="flex flex-col items-center gap-4 w-max mx-auto lg:flex-row lg:items-stretch lg:gap-2">
          <LeagueHalf league={al} bracket={alB} season={picture.season} odds={odds} mirrored={false} />
          <WorldSeriesColumn season={picture.season} al={ws.al} nl={ws.nl} winner={ws.winner} />
          <LeagueHalf league={nl} bracket={nlB} season={picture.season} odds={odds} mirrored />
        </div>
      </div>
      <p data-bracket-note className="text-[10px] text-center mt-3 m-0" style={{ color: "var(--text-muted)", opacity: 0.8 }}>
        {fieldSet
          ? "The field is set. Winners move on as each series ends."
          : "If the season ended today. Seeds change until the last day."}
      </p>
    </div>
  );
}

// ── Picks ──────────────────────────────────────────────────────────────────

// The bracket the Bracket tab draws, made pickable. The lock time and the
// finished series come from MLB's postseason feed; everything else — seats,
// scoring, storage, the leaderboard — is the generic BracketPicks.
// The feed is fetched once by the panel, which the Bracket tab reads too.
function PicksView({ picture, post, failed }: { picture: PlayoffPicture; post: MlbPostseason | null; failed: boolean }) {
  const bracket = useMemo(() => {
    const al = picture.leagues.find((l) => l.key === "AL");
    const nl = picture.leagues.find((l) => l.key === "NL");
    if (!al || !nl) return null;
    return mlbPickBracket(picture.season, buildBracket(al), buildBracket(nl), teamLogo);
  }, [picture]);

  if (!bracket) return null;
  if (failed) {
    return (
      <p role="status" className="text-xs py-6 text-center" style={{ color: "var(--text-muted)" }}>
        Couldn&rsquo;t load MLB&rsquo;s postseason schedule right now, so picks can&rsquo;t open.
      </p>
    );
  }
  if (!post) {
    return (
      <p role="status" className="text-xs py-6 text-center" style={{ color: "var(--text-muted)" }}>
        Loading picks&hellip;
      </p>
    );
  }
  return (
    <BracketPicks
      bracket={bracket}
      roundHeading={(round, half) => mlbRoundHeading(round, half === "AL" || half === "NL" ? half : null)}
      lockAt={post.lockAt}
      lockTbd={post.lockTbd}
      results={post.results}
      note="Seeds can still move until the regular season ends. If one moves, the picks it touches clear and you pick again."
    />
  );
}

// ── Modal ────────────────────────────────────────────────────────────────────

// `variant="page"` renders the same panel in the document flow instead of as a
// dialog: no backdrop, no ✕, no Escape, no focus grab, and no cover over the
// seeds and odds (series winners still wait behind one tap). It exists for the MLB
// search landing pages (/mlb-playoff-bracket and friends), which put the panel
// straight under their h1 so a visitor from search sees the bracket first and
// never meets the board's first-run league picker. `initialTab` and
// `initialSort` are the view that page is about; they outrank the stored ones,
// and a click still wins.
export default function PlayoffPictureModal({
  onClose,
  initialTab,
  initialSort,
  variant = "modal",
}: {
  onClose?: () => void;
  initialTab?: TabKey;
  initialSort?: SortKey;
  variant?: "modal" | "page";
}) {
  const inline = variant === "page";
  const [picture, setPicture] = useState<PlayoffPicture | null>(null);
  const [odds, setOdds] = useState<PlayoffOdds | null>(null);
  const [failed, setFailed] = useState(false);
  const [override, setOverride] = useState(false);
  const [showGamesBack, setShowGamesBack] = useState(false);
  const [tabOverride, setTabOverride] = useState<TabKey | null>(null);
  const [sortOverride, setSortOverride] = useState<Sort | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const tablistRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    (async () => {
      try {
        const p = await fetchPlayoffPicture(ctrl.signal);
        if (ctrl.signal.aborted) return;
        if (!p) { setFailed(true); return; }
        setPicture(p);
      } catch {
        if (!ctrl.signal.aborted) setFailed(true);
      }
    })();
    return () => ctrl.abort();
  }, []);

  // MLB's postseason feed: the Picks tab's lock time and results, and the
  // series winners the Bracket tab plays through. Fetched once per panel.
  const season = picture?.season ?? null;
  const [post, setPost] = useState<MlbPostseason | null>(null);
  const [postFailed, setPostFailed] = useState(false);
  const [resultsShown, setResultsShown] = useState(false);
  useEffect(() => {
    if (season == null) return;
    const ctrl = new AbortController();
    (async () => {
      try {
        const p = await fetchMlbPostseason(season, ctrl.signal);
        if (!ctrl.signal.aborted) setPost(p);
      } catch {
        if (!ctrl.signal.aborted) setPostFailed(true);
      }
    })();
    return () => ctrl.abort();
  }, [season]);

  // Odds are a second feed from a second host; if it fails the picture still
  // renders, with the columns showing a dash rather than the whole panel failing.
  useEffect(() => {
    const ctrl = new AbortController();
    (async () => {
      try {
        const o = await fetchPlayoffOdds(ctrl.signal);
        if (!ctrl.signal.aborted) setOdds(o);
      } catch {
        /* columns stay "—" */
      }
    })();
    return () => ctrl.abort();
  }, []);

  // Stored view preferences, derived at render once the fetch has landed — the
  // same shape the reveal below uses, and for the same reason: reading a stored
  // preference during the static prerender would be a hydration mismatch, and
  // setting state from an effect would cascade a render.
  const storedSort = useMemo(() => (picture ? readSort() : null), [picture]);
  const storedTab = useMemo(() => (picture ? readTab() : null), [picture]);
  // Same direction a first click on that column picks: seeds up, odds down.
  const pageSort: Sort | null = initialSort ? { key: initialSort, dir: initialSort === "seed" ? "asc" : "desc" } : null;
  const sort = sortOverride ?? pageSort ?? storedSort ?? DEFAULT_SORT;
  const tab = tabOverride ?? initialTab ?? storedTab ?? "odds";

  const onSort = useCallback((k: SortKey) => {
    // A second click on the live column flips it. A first click on a new one
    // opens it the way that column is read: seeds count up from 1, odds count
    // down from the best chance.
    const next: Sort = sort.key === k
      ? { key: k, dir: sort.dir === "desc" ? "asc" : "desc" }
      : { key: k, dir: k === "seed" ? "asc" : "desc" };
    try { window.localStorage.setItem(SORT_KEY, `${next.key}:${next.dir}`); } catch {}
    setSortOverride(next);
  }, [sort]);

  const pickTab = useCallback((k: TabKey) => {
    setTabOverride(k);
    try { window.localStorage.setItem(TAB_KEY, k); } catch {}
  }, []);

  const onTabKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft" && e.key !== "Home" && e.key !== "End") return;
    e.preventDefault();
    const i = TABS.findIndex((t) => t.key === tab);
    const next = e.key === "Home" ? 0
      : e.key === "End" ? TABS.length - 1
      : (i + (e.key === "ArrowRight" ? 1 : TABS.length - 1)) % TABS.length;
    pickTab(TABS[next].key);
    // Roving focus: the tab a user arrowed to is the one that should be focused.
    const btns = tablistRef.current?.querySelectorAll<HTMLElement>('[role="tab"]');
    btns?.[next]?.focus();
  };

  useEffect(() => {
    if (inline || !onClose) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, inline]);

  // Focus management + Tab trap (WCAG 2.4.3), matching GameDetailModal /
  // WorldCupGroupsModal / SlamBracketModal.
  useEffect(() => {
    if (inline) return;
    const opener = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    dialog?.focus({ preventScroll: true });
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Tab" || !dialog) return;
      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'
        )
      ).filter((el) => el.offsetParent !== null);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (e.shiftKey) {
        if (active === first || active === dialog) { e.preventDefault(); last.focus(); }
      } else if (active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      // preventScroll: the scroll lock below puts the board back where it was;
      // a scrolling focus() would then nudge it to the pill's edge.
      opener?.focus?.({ preventScroll: true });
    };
  }, [inline]);

  // Body scroll lock — EventDetailModal's position:fixed + negative-top lock.
  // Without it a scroll inside the picture runs on into the board behind, and
  // on close Safari leaves the page further down than where the reader tapped.
  useEffect(() => {
    if (inline) return;
    const scrollY = window.scrollY;
    const body = document.body;
    const prev = {
      overflow: body.style.overflow,
      position: body.style.position,
      top: body.style.top,
      width: body.style.width,
    };
    body.style.overflow = "hidden";
    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.width = "100%";
    return () => {
      body.style.overflow = prev.overflow;
      body.style.position = prev.position;
      body.style.top = prev.top;
      body.style.width = prev.width;
      window.scrollTo(0, scrollY);
    };
  }, [inline]);

  // Derived at render (not synced through an effect) so switching seasons or
  // remounting can't trigger a cascading setState — same shape SlamBracketModal
  // uses for its per-round reveals.
  const savedReveal = useMemo(
    () => (picture ? loadRevealed(picture.season) : false),
    [picture],
  );
  // The search pages open uncovered (Jacob, 9/23): a visitor who searched for
  // the bracket asked to see it. Nothing is written to REVEAL_KEY, so the
  // board's copy of this panel keeps its cover. Series winners keep a cover of
  // their own on those pages; see BracketView.
  const revealed = override || savedReveal || inline;

  const reveal = () => {
    setOverride(true);
    if (picture) {
      try { window.localStorage.setItem(REVEAL_KEY(picture.season), "1"); } catch {}
    }
  };

  const updatedLabel = picture?.updated
    ? (() => {
        const d = new Date(picture.updated);
        return isNaN(d.getTime()) ? null : d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
      })()
    : null;

  const panel = (
      <div
        ref={dialogRef}
        tabIndex={inline ? undefined : -1}
        className={inline
          ? "relative rounded-xl p-4 sm:p-5 w-full"
          : "relative rounded-xl p-4 sm:p-5 w-full max-w-6xl max-h-[85vh] overflow-y-auto shadow-xl"}
        style={{ background: "var(--bg)", border: "1px solid var(--border)", outline: "none" }}
        onClick={inline ? undefined : (e) => e.stopPropagation()}
        role={inline ? "region" : "dialog"}
        aria-modal={inline ? undefined : "true"}
        aria-label="MLB playoff picture"
        data-picture-variant={variant}
      >
        {inline ? null : (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="absolute top-3 right-3 text-lg leading-none cursor-pointer"
            style={{ color: "var(--text-muted)" }}
          >
            ✕
          </button>
        )}
        <div className={`flex flex-wrap items-start justify-between gap-x-4 gap-y-1 mb-2${inline ? "" : " pr-6"}`}>
          <h2 className="text-base sm:text-lg font-bold" style={{ color: "var(--text)" }}>
            ⚾ MLB — Playoff picture
          </h2>
          <div className="flex flex-col items-end gap-1 text-[10px]" style={{ color: "var(--text-muted)" }}>
            {tab !== "picks" ? (
              <span title="Any mix of that many wins or losses by the runner-up clinches the division">
                <span className="font-bold" style={{ color: "var(--accent)" }}>Magic N</span> = wins or rival losses left to clinch the division
              </span>
            ) : null}
            {tab === "odds" ? (
              <label className="flex items-center gap-1.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  className="w-3 h-3 cursor-pointer"
                  checked={showGamesBack}
                  onChange={(e) => setShowGamesBack(e.target.checked)}
                  aria-label="Show games back"
                />
                Show games back
              </label>
            ) : null}
          </div>
        </div>

        {/* The tab strip stays outside the cover so a covered panel can still be
            switched; what it switches between is covered either way. */}
        <div
          ref={tablistRef}
          role="tablist"
          aria-label="Playoff picture view"
          className="flex items-center gap-1 mb-3"
          onKeyDown={onTabKeyDown}
        >
          {TABS.map((t) => {
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                type="button"
                role="tab"
                id={`mlb-picture-tab-${t.key}`}
                aria-selected={active}
                aria-controls={`mlb-picture-panel-${t.key}`}
                tabIndex={active ? 0 : -1}
                onClick={() => pickTab(t.key)}
                className="text-xs px-2.5 py-1 rounded-full cursor-pointer"
                style={{
                  background: active ? "var(--bg-card)" : "transparent",
                  color: active ? "var(--text)" : "var(--text-muted)",
                  border: `1px solid ${active ? "var(--border-hover)" : "var(--border)"}`,
                }}
              >
                {t.label}
              </button>
            );
          })}
        </div>

        {failed ? (
          <p role="status" aria-live="polite" className="text-xs py-6 text-center" style={{ color: "var(--text-muted)" }}>
            Couldn&rsquo;t load the playoff picture right now.
          </p>
        ) : !picture ? (
          <p role="status" aria-live="polite" className="text-xs py-6 text-center" style={{ color: "var(--text-muted)" }}>
            Loading playoff picture&hellip;
          </p>
        ) : (
          <>
            <div className="relative">
              <div
                data-picture-body
                role="tabpanel"
                id={`mlb-picture-panel-${tab}`}
                aria-labelledby={`mlb-picture-tab-${tab}`}
                // The blur is the spoiler cover, so the content behind it must
                // also be untappable, unselectable and hidden from assistive
                // tech — same guard the Slam bracket uses.
                style={revealed ? undefined : { filter: "blur(7px)", pointerEvents: "none", userSelect: "none" }}
                aria-hidden={revealed ? undefined : true}
              >
                {tab === "odds" ? (
                  // Side by side only from `lg`: at `md` each half was ~355px,
                  // and six columns in that squeezed every name to one letter.
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {picture.leagues.map((l) => (
                      <LeagueTable key={l.key} league={l} odds={odds} showGamesBack={showGamesBack} sort={sort} onSort={onSort} />
                    ))}
                  </div>
                ) : tab === "bracket" ? (
                  <BracketView
                    picture={picture}
                    odds={odds}
                    results={post?.results ?? NO_RESULTS}
                    coverResults={inline && !resultsShown}
                    onShowResults={() => setResultsShown(true)}
                  />
                ) : (
                  <PicksView picture={picture} post={post} failed={postFailed} />
                )}
              </div>
              {!revealed ? (
                <button
                  type="button"
                  onClick={reveal}
                  className="absolute inset-0 flex items-center justify-center cursor-pointer rounded-lg"
                  aria-label="Show the playoff picture (reveals standings and playoff odds)"
                >
                  <span
                    className="text-xs font-medium px-3 py-1.5 rounded-full"
                    style={{ background: "var(--bg)", color: "var(--text)", border: "1px solid var(--border)" }}
                  >
                    Show the picture (spoilers)
                  </span>
                </button>
              ) : null}
            </div>
            <div data-picture-footer className="flex items-baseline justify-between gap-x-4 text-[10px] mt-3" style={{ color: "var(--text-muted)", opacity: 0.7 }}>
              <p className="m-0">Seeds 1&ndash;3 are the division winners, 4&ndash;6 the wild cards.</p>
              {updatedLabel ? <p className="m-0 ml-auto whitespace-nowrap tabular-nums">Updated {updatedLabel}</p> : null}
            </div>
          </>
        )}
      </div>
  );

  if (inline) return panel;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50" />
      {panel}
    </div>
  );
}
