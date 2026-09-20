"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import {
  BEST_OF,
  broadcastFor,
  buildBracket,
  fetchPlayoffOdds,
  fetchPlayoffPicture,
  roundLabel,
  sortTeams,
  teamLogo,
  type BracketMatchup,
  type BracketRound,
  type BracketSlot,
  type ClinchKind,
  type LeagueKey,
  type Odd,
  type PlayoffLeague,
  type PlayoffOdds,
  type PlayoffPicture,
  type PlayoffTeam,
  type SortDir,
  type SortKey,
} from "@/lib/playoffPicture";

// The MLB playoff picture, behind one reveal.
//
// Unlike the Slam bracket, there is no useful partial gate here: the ORDER of
// the six seeds is itself derived from every result to date, so revealing "who's
// in" without the numbers would leak the same thing. One cover, one tap — and
// both tabs sit behind it.
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

type TabKey = "odds" | "bracket";
const TABS: { key: TabKey; label: string }[] = [
  { key: "odds", label: "Odds" },
  { key: "bracket", label: "Bracket" },
];

interface Sort { key: SortKey; dir: SortDir }
const DEFAULT_SORT: Sort = { key: "seed", dir: "asc" };

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
    return t === "bracket" || t === "odds" ? t : null;
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

// ESPN shades its odds cells by the number in them. `color-mix` keeps that tied
// to the theme's own accent, so the shade follows a theme switch instead of
// baking in a light-mode blue.
function shadeFor(odd: Odd | null): string | undefined {
  if (!odd || !(odd.value > 0)) return undefined;
  return `color-mix(in srgb, var(--accent) ${(odd.value * 0.35).toFixed(1)}%, transparent)`;
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
      <OddsCell odd={row?.division ?? null} className="w-[46px] hidden md:table-cell" />
      <OddsCell odd={row?.wildCard ?? null} className="w-[46px] hidden md:table-cell" />
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
  // Seed view keeps the shape a playoff picture is read in — the six, split at
  // the bye line, then the chase. Any odds sort drops the dividers: they mark
  // seed boundaries, and in a probability order they would mark nothing.
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

  return (
    <div className="min-w-0">
      <div className="text-[10px] font-bold uppercase tracking-wide mb-1.5" style={{ color: "var(--text-muted)" }}>
        {league.name}
      </div>
      {/* Auto layout, not table-fixed: below `md` the Division and Wild card
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
            <SortHeader colKey="division" sort={sort} onSort={onSort} className="w-[46px] hidden md:table-cell" title="Chance of winning the division" />
            <SortHeader colKey="wildCard" sort={sort} onSort={onSort} className="w-[46px] hidden md:table-cell" title="Chance of taking a wild card" />
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

function Seat({ slot, odds }: { slot: BracketSlot; odds: PlayoffOdds | null }) {
  const t = slot.team;
  if (!t) {
    return (
      <div
        data-bracket-slot
        className="rounded-lg flex items-center justify-center px-1 h-[64px] md:h-[70px]"
        style={{ background: "var(--bg-card)", border: "1px dashed var(--border)" }}
      >
        <span className="text-[9px] text-center" style={{ color: "var(--text-muted)", opacity: 0.8 }}>
          {slot.seed ? `Seed ${slot.seed}` : "Winner"}
        </span>
      </div>
    );
  }
  const odd = playoffOdd(t, odds);
  return (
    <div
      data-bracket-team
      className="relative rounded-lg flex flex-col items-center justify-center gap-0.5 px-1 h-[64px] md:h-[70px]"
      style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
      title={t.name}
    >
      {slot.seed ? (
        <span className="absolute top-0.5 left-1 text-[9px] font-bold tabular-nums" style={{ color: "var(--text-muted)" }}>
          {slot.seed}
        </span>
      ) : null}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={teamLogo(t.id)}
        alt=""
        loading="lazy"
        decoding="async"
        width={26}
        height={26}
        className="w-[26px] h-[26px] object-contain"
        draggable={false}
        onError={(e) => { e.currentTarget.style.display = "none"; }}
      />
      <span className="text-[10px] font-bold leading-none" style={{ color: "var(--text)" }}>{t.abbrev}</span>
      {t.clinched ? (
        <span className="text-[9px] leading-none" style={{ color: "var(--accent)" }} title="Clinched a spot">✓</span>
      ) : (
        <span className="text-[9px] leading-none tabular-nums" style={{ color: "var(--text-muted)" }}>{odd?.label ?? ""}</span>
      )}
    </div>
  );
}

function MatchupBox({ matchup, odds }: { matchup: BracketMatchup; odds: PlayoffOdds | null }) {
  return (
    <div className="flex flex-col gap-1 w-[76px] md:w-[92px]">
      <Seat slot={matchup.sides[0]} odds={odds} />
      <Seat slot={matchup.sides[1]} odds={odds} />
    </div>
  );
}

// The round header is a fixed height in every column so the connector lines
// between columns line up with the boxes rather than with the labels.
const HEADER_H = "h-[44px]";

function RoundColumn({ round, league, season, matchups, odds }: {
  round: BracketRound;
  league: LeagueKey;
  season: number;
  matchups: BracketMatchup[];
  odds: PlayoffOdds | null;
}) {
  const channel = broadcastFor(season, round, league);
  return (
    <div className="flex flex-col shrink-0">
      <div className={`${HEADER_H} text-center px-1`}>
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
        {matchups.map((m) => <MatchupBox key={m.key} matchup={m} odds={odds} />)}
      </div>
    </div>
  );
}

function Connector({ lines }: { lines: number }) {
  return (
    <div className="w-3 md:w-4 shrink-0 self-stretch flex flex-col" aria-hidden>
      <div className={`${HEADER_H} shrink-0`} />
      <div className="flex-1 flex flex-col justify-around">
        {Array.from({ length: lines }, (_, i) => (
          <div key={i} className="h-px" style={{ background: "var(--border)" }} />
        ))}
      </div>
    </div>
  );
}

function LeagueHalf({ league, season, odds, mirrored }: {
  league: PlayoffLeague;
  season: number;
  odds: PlayoffOdds | null;
  mirrored: boolean;
}) {
  const bracket = useMemo(() => buildBracket(league), [league]);
  const of = (round: BracketRound) => bracket.matchups.filter((m) => m.round === round);
  return (
    <div className={`flex items-stretch ${mirrored ? "flex-row md:flex-row-reverse" : "flex-row"}`}>
      <RoundColumn round="wildCard" league={league.key} season={season} odds={odds} matchups={of("wildCard")} />
      <Connector lines={2} />
      <RoundColumn round="divisionSeries" league={league.key} season={season} odds={odds} matchups={of("divisionSeries")} />
      <Connector lines={1} />
      <RoundColumn round="championship" league={league.key} season={season} odds={odds} matchups={of("championship")} />
    </div>
  );
}

function WorldSeriesColumn({ season }: { season: number }) {
  const channel = broadcastFor(season, "worldSeries", "AL");
  return (
    <div className="flex flex-col shrink-0 px-2 md:px-3">
      <div className={`${HEADER_H} text-center`}>
        <div className="text-[10px] font-bold uppercase tracking-wide leading-tight" style={{ color: "var(--text)" }}>World Series</div>
        <div className="text-[9px] leading-tight" style={{ color: "var(--text-muted)" }}>Best of {BEST_OF.worldSeries}</div>
        {channel ? (
          <div data-bracket-channel className="text-[9px] leading-tight" style={{ color: "var(--text-muted)", opacity: 0.85 }}>{channel}</div>
        ) : null}
      </div>
      <div className="flex-1 flex flex-col justify-center">
        <div className="flex flex-col gap-1 w-[76px] md:w-[92px]">
          <Seat slot={{ team: null, seed: null, from: "cs" }} odds={null} />
          <Seat slot={{ team: null, seed: null, from: "cs" }} odds={null} />
        </div>
      </div>
    </div>
  );
}

function BracketView({ picture, odds }: { picture: PlayoffPicture; odds: PlayoffOdds | null }) {
  const al = picture.leagues.find((l) => l.key === "AL");
  const nl = picture.leagues.find((l) => l.key === "NL");
  if (!al || !nl) return null;
  return (
    <div>
      {/* One DOM for both widths: the halves sit side by side with the World
          Series between them on desktop, and stack on a phone. The NL half is
          mirrored only when there is room to mirror it. */}
      <div className="flex flex-col items-center gap-4 md:flex-row md:items-stretch md:justify-center md:gap-0">
        <LeagueHalf league={al} season={picture.season} odds={odds} mirrored={false} />
        <WorldSeriesColumn season={picture.season} />
        <LeagueHalf league={nl} season={picture.season} odds={odds} mirrored />
      </div>
      <p className="text-[10px] text-center mt-3 m-0" style={{ color: "var(--text-muted)", opacity: 0.8 }}>
        If the season ended today. Seeds change until the last day.
      </p>
    </div>
  );
}

// ── Modal ────────────────────────────────────────────────────────────────────

export default function PlayoffPictureModal({ onClose }: { onClose: () => void }) {
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
  const sort = sortOverride ?? storedSort ?? DEFAULT_SORT;
  const tab = tabOverride ?? storedTab ?? "odds";

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
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Focus management + Tab trap (WCAG 2.4.3), matching GameDetailModal /
  // WorldCupGroupsModal / SlamBracketModal.
  useEffect(() => {
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
      opener?.focus?.();
    };
  }, []);

  // Derived at render (not synced through an effect) so switching seasons or
  // remounting can't trigger a cascading setState — same shape SlamBracketModal
  // uses for its per-round reveals.
  const savedReveal = useMemo(
    () => (picture ? loadRevealed(picture.season) : false),
    [picture],
  );
  const revealed = override || savedReveal;

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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50" />
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="relative rounded-xl p-4 sm:p-5 w-full max-w-5xl max-h-[85vh] overflow-y-auto shadow-xl"
        style={{ background: "var(--bg)", border: "1px solid var(--border)", outline: "none" }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="MLB playoff picture"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute top-3 right-3 text-lg leading-none cursor-pointer"
          style={{ color: "var(--text-muted)" }}
        >
          ✕
        </button>
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 mb-2 pr-6">
          <h2 className="text-base sm:text-lg font-bold" style={{ color: "var(--text)" }}>
            ⚾ MLB — Playoff picture
          </h2>
          <div className="flex flex-col items-end gap-1 text-[10px]" style={{ color: "var(--text-muted)" }}>
            <span title="Any mix of that many wins or losses by the runner-up clinches the division">
              <span className="font-bold" style={{ color: "var(--accent)" }}>Magic N</span> = wins or rival losses left to clinch the division
            </span>
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
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {picture.leagues.map((l) => (
                      <LeagueTable key={l.key} league={l} odds={odds} showGamesBack={showGamesBack} sort={sort} onSort={onSort} />
                    ))}
                  </div>
                ) : (
                  <BracketView picture={picture} odds={odds} />
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
            <div className="flex flex-wrap justify-between gap-x-4 gap-y-1 text-[10px] mt-3" style={{ color: "var(--text-muted)", opacity: 0.7 }}>
              <p className="m-0">
                Seeds 1&ndash;3 are the division winners, 4&ndash;6 the wild cards. The percentages are each club&rsquo;s chances of making the playoffs, winning the division and taking a wild card (FanGraphs, via ESPN). Standings are a spoiler, so this stays covered until you ask for it.
              </p>
              {updatedLabel ? <p className="m-0 ml-auto whitespace-nowrap tabular-nums">Updated {updatedLabel}</p> : null}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
