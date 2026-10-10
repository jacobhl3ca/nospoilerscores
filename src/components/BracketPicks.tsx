"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { abortOwn } from "@/lib/abort";
import {
  applyPick,
  championOf,
  cleanName,
  cleanPicks,
  effectivePicks,
  isComplete,
  maxPoints,
  nameKey,
  NAME_MAX,
  openKeysAt,
  pickedCount,
  rankEntries,
  scorePicks,
  sidesFor,
  type BoardEntry,
  type PickBracket,
  type PickMatchup,
  type PickStatus,
  type PickTeam,
  type Picks,
  type SeriesResult,
  type SeriesStart,
} from "@/lib/bracketPicks";
import {
  DEVICE_KEY,
  PICKS_SYNC_EVENT,
  SEEN_KEY,
  STORE_KEY,
  isPicks,
  parseSaved,
  syncPicksWithAccount,
  type Saved,
  type Sent,
} from "@/lib/picksAccount";
import { shadeFor } from "@/lib/playoffPicture";
import { cachedAuthState, getAuthState, hasNativeGoogleBridge, signInWithApple, signInWithGoogle, type AuthState } from "@/lib/prefsSync";
import { trackSoon } from "@/lib/umamiTrack";
import { getApiBase } from "@/lib/youtube";
import { getTimeZone } from "@/lib/etDay";

// The Picks tab: tap a winner per series, submit, and see how it went.
//
// Spoiler posture, in two layers. The whole tab already sits behind the
// playoff picture's own cover, because the seeds it is built from ARE the
// standings. Results are a second, stronger spoiler — a ✓ next to a pick says
// who won last night — so every mark, score and leaderboard figure sits behind
// a second cover of the same shape. That cover remembers how many results the
// reader has seen, not a yes/no: a series finishing since the last look covers
// it again, so a reveal on Tuesday can't spoil Thursday.
//
// Storage is two layers too. The device keeps its own draft, its submitted
// picks and its score in localStorage, which works with or without the shared
// leaderboard. The leaderboard (/api/picks in public/_worker.js) takes one
// entry per device and per name, and before the lock hands back names only.
// Signed in, the account carries the device token and the submitted picks, so
// every device on it shows and edits the same entry (lib/picksAccount).
//
// After the lock a device with no bracket can still send a late one, until
// World Series Game 1. It picks only the series that have not started; the
// rest hold the real winners, score nothing, and need results revealed to
// show (lib/bracketPicks "Late brackets"). Late brackets play for fun.

/** The prize rule, word for word. */
export const PRIZE_RULE = "Perfect bracket OR first place: HideScore grants one wish (within reason).";

function readSaved(id: string): Saved {
  try { return parseSaved(window.localStorage.getItem(STORE_KEY(id))); } catch { return parseSaved(null); }
}

function writeSaved(id: string, s: Saved) {
  try { window.localStorage.setItem(STORE_KEY(id), JSON.stringify(s)); } catch {}
}

function readSeen(id: string): number {
  try { return Number(window.localStorage.getItem(SEEN_KEY(id))) || 0; } catch { return 0; }
}

function deviceToken(): string {
  try {
    const have = window.localStorage.getItem(DEVICE_KEY);
    if (have && /^[A-Za-z0-9_-]{16,64}$/.test(have)) return have;
    const t = crypto.randomUUID();
    window.localStorage.setItem(DEVICE_KEY, t);
    return t;
  } catch {
    return crypto.randomUUID();
  }
}

const samePicks = (a: Picks, b: Picks) => {
  const ka = Object.keys(a), kb = Object.keys(b);
  return ka.length === kb.length && ka.every((k) => a[k] === b[k]);
};

const fmtLock = (d: Date) =>
  d.toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: getTimeZone() });

type Board =
  | { state: "loading" }
  | { state: "off" }
  | { state: "error" }
  | { state: "open"; count: number; names: string[] }
  | { state: "locked"; entries: BoardEntry[] };

type Post = { state: "idle" | "sending" | "ok" | "warn"; msg?: string };

// ── Seats ────────────────────────────────────────────────────────────────────

function TeamLogo({ team, size }: { team: PickTeam; size: number }) {
  if (!team.logo) return <span className="shrink-0" style={{ width: size }} />;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={team.logo}
      alt=""
      loading="lazy"
      decoding="async"
      width={size}
      height={size}
      className="object-contain shrink-0"
      style={{ width: size, height: size }}
      draggable={false}
      onError={(e) => { e.currentTarget.style.display = "none"; }}
    />
  );
}

// The Bracket tab's seat, as a button: seed, logo, abbreviation. The picked
// side is shaded in the accent the odds pills use; the other side fades.
function PickSeat({ team, label, picked, faded, status, disabled, onPick, round }: {
  team: PickTeam | null;
  label: string;
  picked: boolean;
  faded: boolean;
  status: PickStatus | null;
  disabled: boolean;
  onPick: () => void;
  round: string;
}) {
  if (!team) {
    return (
      <div data-pick-empty className="flex items-center gap-1.5 px-1.5 h-[30px]">
        <span className="w-[18px] shrink-0" />
        <span className="text-[9px] italic truncate min-w-0" style={{ color: "var(--text-muted)", opacity: 0.75 }} title={label}>
          {label}
        </span>
      </div>
    );
  }
  const wrong = picked && status === "wrong";
  return (
    <button
      type="button"
      data-pick-seat={team.abbrev}
      aria-pressed={picked}
      aria-label={`${team.name} to win the ${round}`}
      disabled={disabled}
      onClick={onPick}
      className={`w-full flex items-center gap-1.5 px-1.5 h-[30px] rounded-md text-left ${disabled ? "cursor-default" : "cursor-pointer"}`}
      style={{
        background: picked ? shadeFor({ value: 60 }) : "transparent",
        opacity: faded ? 0.45 : 1,
      }}
      title={team.name}
    >
      {team.seed ? (
        <span className="text-[9px] font-bold tabular-nums w-2 shrink-0" style={{ color: "var(--text-muted)" }}>{team.seed}</span>
      ) : null}
      <TeamLogo team={team} size={18} />
      <span
        className={`text-[11px] leading-none shrink-0 ${picked ? "font-bold" : "font-medium"}`}
        style={{ color: "var(--text)", textDecoration: wrong ? "line-through" : undefined }}
      >
        {team.abbrev}
      </span>
      {picked && status === "correct" ? (
        <span data-pick-mark="correct" className="text-[10px] leading-none ml-auto" style={{ color: "var(--accent)" }} aria-label="right">✓</span>
      ) : wrong ? (
        <span data-pick-mark="wrong" className="text-[10px] leading-none ml-auto" style={{ color: "var(--text-muted)" }} aria-label="wrong">✗</span>
      ) : null}
    </button>
  );
}

function PickCard({ m, bracket, picks, locked, status, onPick, round, started }: {
  m: PickMatchup;
  bracket: PickBracket;
  picks: Picks;
  locked: boolean;
  status: PickStatus | null;
  onPick: (key: string, teamId: string) => void;
  round: string;
  /** A late bracket's started series: not pickable, and shows no pick. */
  started?: boolean;
}) {
  const [a, b] = sidesFor(bracket, picks, m.key);
  const pick = started ? undefined : picks[m.key];
  const seat = (t: PickTeam | null, i: 0 | 1) => (
    <PickSeat
      team={t}
      label={m.sides[i].label}
      picked={!!t && pick === t.id}
      faded={!!t && !!pick && pick !== t.id}
      status={status}
      disabled={locked || !!started || !t || !(a && b)}
      onPick={() => t && onPick(m.key, t.id)}
      round={round}
    />
  );
  return (
    <div
      data-pick-card={m.key}
      data-pick-started={started ? "" : undefined}
      className="rounded-lg p-0.5 w-[124px] md:w-[140px]"
      style={{ background: "var(--bg-card)", border: "1px solid var(--border)", opacity: started ? 0.6 : undefined }}
    >
      {seat(a, 0)}
      <div className="mx-1.5 h-px" style={{ background: "var(--border)", opacity: 0.6 }} />
      {seat(b, 1)}
    </div>
  );
}

const HEADER_H = "h-[44px]";

function RoundHead({ title, bestOf, weight }: { title: string; bestOf: number | null; weight: number }) {
  return (
    <div className={`${HEADER_H} text-center px-1`}>
      <div className="text-[10px] font-bold uppercase tracking-wide leading-tight" style={{ color: "var(--text)" }}>{title}</div>
      {bestOf ? <div className="text-[9px] leading-tight" style={{ color: "var(--text-muted)" }}>Best of {bestOf}</div> : null}
      <div className="text-[9px] leading-tight" style={{ color: "var(--accent)" }}>{weight} pt{weight === 1 ? "" : "s"} each</div>
    </div>
  );
}

// ── Covers ───────────────────────────────────────────────────────────────────

function ResultsCover({ covered, onReveal, children }: { covered: boolean; onReveal: () => void; children: React.ReactNode }) {
  return (
    <div className="relative">
      <div
        data-results-body
        style={covered ? { filter: "blur(7px)", pointerEvents: "none", userSelect: "none" } : undefined}
        aria-hidden={covered ? true : undefined}
        inert={covered || undefined}
      >
        {children}
      </div>
      {covered ? (
        <button
          type="button"
          onClick={onReveal}
          className="absolute inset-0 flex items-center justify-center cursor-pointer rounded-lg"
          aria-label="Show results (reveals which series have been won)"
        >
          <span
            className="text-xs font-medium px-3 py-1.5 rounded-full"
            style={{ background: "var(--bg)", color: "var(--text)", border: "1px solid var(--border)" }}
          >
            Show results (spoilers)
          </span>
        </button>
      ) : null}
    </div>
  );
}

// The cover's pill on its own, for a view whose covered state already hides
// every result and only needs the way to show them.
function RevealButton({ onReveal }: { onReveal: () => void }) {
  return (
    <button
      type="button"
      onClick={onReveal}
      className="self-start text-xs font-medium px-3 py-1.5 rounded-full cursor-pointer"
      style={{ background: "var(--bg)", color: "var(--text)", border: "1px solid var(--border)" }}
      aria-label="Show results (reveals which series have been won)"
    >
      Show results (spoilers)
    </button>
  );
}

// ── Tab ──────────────────────────────────────────────────────────────────────

type View = "mine" | "board";

/** Set while a sign-in started from the Picks prompt is out, so the tab can say
 *  "Linked to your account." when the reader comes back signed in. */
const LINK_FLAG = "hs-picks-link";

const onlyKeys = (p: Picks, keys: ReadonlySet<string>): Picks =>
  Object.fromEntries(Object.entries(p).filter(([k]) => keys.has(k)));

export default function BracketPicks({ bracket, roundHeading, lockAt, lockTbd, results, starts = [], lateClose = null, note }: {
  bracket: PickBracket;
  /** Column heading for a round in one half (null for the final). */
  roundHeading: (round: number, half: string | null) => string;
  lockAt: Date | null;
  /** The lock is a stand-in time until the first game's start is set. */
  lockTbd: boolean;
  results: SeriesResult[];
  /** When each series starts: which ones a late bracket can still pick. */
  starts?: SeriesStart[];
  /** Late brackets close here (World Series Game 1); null = not listed yet. */
  lateClose?: Date | null;
  /** One line under the rules, e.g. why seeds can still move. */
  note?: string;
}) {
  const id = bracket.id;
  const [saved, setSaved] = useState<Saved>(() => readSaved(id));
  const [seen, setSeen] = useState<number>(() => readSeen(id));
  const [view, setView] = useState<View>("mine");
  const [viewing, setViewing] = useState<BoardEntry | null>(null);
  const [post, setPost] = useState<Post>({ state: "idle" });
  const [board, setBoard] = useState<Board>({ state: "loading" });
  const [boardTick, setBoardTick] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [auth, setAuth] = useState<AuthState | null>(() => cachedAuthState());
  const [linked, setLinked] = useState(false);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const locked = !!lockAt && now >= lockAt.getTime();
  const closed = locked && !!lateClose && now >= lateClose.getTime();

  // Signed in, pick up the bracket this account submitted on another device,
  // on open and whenever the app comes back to the front.
  useEffect(() => {
    const reread = () => setSaved(readSaved(id));
    const onVis = () => { if (document.visibilityState === "visible") void syncPicksWithAccount(); };
    window.addEventListener(PICKS_SYNC_EVENT, reread);
    document.addEventListener("visibilitychange", onVis);
    void syncPicksWithAccount();
    return () => {
      window.removeEventListener(PICKS_SYNC_EVENT, reread);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [id]);

  // Sign-in state for the "keep this bracket on your account" prompt. Back
  // from a sign-in the prompt started, wait for the account sync, then say so.
  useEffect(() => {
    let alive = true;
    (async () => {
      const a = await getAuthState();
      if (!alive) return;
      setAuth(a);
      let flagged = false;
      try { flagged = window.sessionStorage.getItem(LINK_FLAG) === "1"; } catch {}
      if (!a.signedIn || !flagged) return;
      await syncPicksWithAccount();
      try { window.sessionStorage.removeItem(LINK_FLAG); } catch {}
      if (alive) setLinked(true);
    })();
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    const ctrl = new AbortController();
    (async () => {
      try {
        const r = await fetch(`${getApiBase()}/api/picks?board=${encodeURIComponent(id)}`, { signal: ctrl.signal });
        if (ctrl.signal.aborted) return;
        // 404 is a host without the worker (local dev); 503 is the worker
        // without its KV binding. Both mean "no shared board", not "broken".
        if (r.status === 404 || r.status === 503) { setBoard({ state: "off" }); return; }
        if (!r.ok) { setBoard({ state: "error" }); return; }
        const j = (await r.json()) as { locked?: boolean; count?: number; names?: unknown; entries?: unknown };
        if (j.locked && Array.isArray(j.entries)) {
          const entries = (j.entries as BoardEntry[])
            .filter((e) => e && typeof e.name === "string" && isPicks(e.picks))
            .map((e) => (e.late ? { name: e.name, picks: e.picks, late: true, lateAt: typeof e.lateAt === "string" ? e.lateAt : undefined } : { name: e.name, picks: e.picks }));
          setBoard({ state: "locked", entries });
        } else {
          const names = Array.isArray(j.names) ? (j.names as unknown[]).filter((n): n is string => typeof n === "string") : [];
          setBoard({ state: "open", count: typeof j.count === "number" ? j.count : names.length, names });
        }
      } catch {
        if (!ctrl.signal.aborted) setBoard({ state: "error" });
      }
    })();
    return () => abortOwn(ctrl);
  }, [id, boardTick, locked]);

  const save = useCallback((next: Saved) => {
    setSaved(next);
    writeSaved(id, next);
  }, [id]);

  // The series a late bracket's open picks are judged on: the ones not
  // started when it first came in. Null for an on-time bracket.
  const lateOpen = useCallback((e: { lateAt?: string } | null | undefined): Set<string> | null => {
    const t = e?.lateAt ? Date.parse(e.lateAt) : NaN;
    return Number.isFinite(t) ? openKeysAt(bracket, results, starts, t) : null;
  }, [bracket, results, starts]);

  // This device's own late bracket, if it sent one: the leaderboard's word
  // first (an account copy from another device carries no lateAt), then the
  // lateAt this device kept when it sent it.
  const boardMine = saved.sent && board.state === "locked"
    ? board.entries.find((e) => nameKey(e.name) === nameKey(saved.sent!.name))
    : undefined;
  const myLateAt = saved.sent ? (boardMine ? boardMine.lateAt ?? null : saved.sent.lateAt ?? null) : null;
  const myOpen = useMemo(() => lateOpen(myLateAt ? { lateAt: myLateAt } : null), [lateOpen, myLateAt]);
  // Late mode: locked, still before World Series Game 1, and no on-time
  // bracket on this device (an on-time bracket never changes after the lock).
  const lateMode = locked && !closed && (!saved.sent || !!myLateAt);
  const openNow = useMemo(() => (lateMode ? openKeysAt(bracket, results, starts, now) : null), [lateMode, bracket, results, starts, now]);

  const draft = useMemo(
    () => (openNow ? onlyKeys(effectivePicks(bracket, saved.draft, results, openNow), openNow) : cleanPicks(bracket, saved.draft).picks),
    [bracket, saved.draft, results, openNow],
  );
  const sentClean = useMemo(() => (saved.sent ? cleanPicks(bracket, saved.sent.picks) : null), [bracket, saved.sent]);
  const mine = openNow
    ? effectivePicks(bracket, draft, results, openNow)
    : locked
      ? myOpen && saved.sent ? effectivePicks(bracket, saved.sent.picks, results, myOpen) : sentClean?.picks ?? {}
      : draft;

  const covered = results.length > seen;
  const marksShown = results.length > 0 && !covered;
  const myScore = useMemo(() => (saved.sent ? scorePicks(bracket, saved.sent.picks, results, myOpen) : null), [bracket, saved.sent, results, myOpen]);

  const onPick = useCallback((key: string, teamId: string) => {
    if (locked && !openNow) return;
    if (openNow && !openNow.has(key)) return;
    // A late draft holds only its open picks; the real winners fill the rest
    // so a pick into a seat a finished series fed survives the clean.
    const base = openNow ? effectivePicks(bracket, draft, results, openNow) : draft;
    const cur = draft[key];
    // A second tap on the picked side clears it, so a pick can be undone.
    const next = cur === teamId
      ? cleanPicks(bracket, Object.fromEntries(Object.entries(base).filter(([k]) => k !== key))).picks
      : applyPick(bracket, base, key, teamId);
    save({ ...saved, draft: openNow ? onlyKeys(next, openNow) : next });
    if (post.state !== "sending") setPost({ state: "idle" });
  }, [bracket, draft, locked, openNow, post.state, results, save, saved]);

  const reveal = () => {
    setSeen(results.length);
    try { window.localStorage.setItem(SEEN_KEY(id), String(results.length)); } catch {}
  };

  const name = cleanName(saved.name);
  const complete = isComplete(bracket, draft);
  const total = openNow ? openNow.size : bracket.matchups.length;
  const picked = openNow ? Object.keys(draft).length : pickedCount(bracket, draft);
  const sentCompare = saved.sent ? (openNow ? onlyKeys(saved.sent.picks, openNow) : saved.sent.picks) : null;
  const unsent = !saved.sent || saved.sent.name !== name || !sentCompare || !samePicks(sentCompare, draft);
  const canSubmit = openNow
    ? !!name && picked > 0 && post.state !== "sending" && (unsent || !saved.posted)
    : !!lockAt && !locked && complete && !!name && post.state !== "sending" && (unsent || !saved.posted);
  const signedIn = !!auth?.signedIn;

  const submit = async () => {
    if (!canSubmit || !name) return;
    const late = !!openNow;
    const at = new Date().toISOString();
    const sent: Sent = { name, picks: draft, at, ...(late ? { lateAt: myLateAt ?? at } : {}) };
    const next: Saved = { ...saved, name, sent, posted: false };
    save(next);
    setPost({ state: "sending" });
    let msg: Post;
    try {
      const r = await fetch(`${getApiBase()}/api/picks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ board: id, name, token: deviceToken(), picks: draft }),
      });
      if (r.ok) {
        // A late bracket comes back as the server kept it: started series
        // dropped, earlier picks on series that started since kept.
        const j = (await r.json().catch(() => ({}))) as { picks?: unknown; lateAt?: unknown };
        const kept: Sent = late && isPicks(j.picks)
          ? { ...sent, picks: j.picks, lateAt: typeof j.lateAt === "string" ? j.lateAt : sent.lateAt }
          : sent;
        save({ ...next, sent: kept, posted: true });
        void syncPicksWithAccount();
        trackSoon("picks-submit", { late: String(late), signedIn: String(signedIn) });
        msg = late
          ? { state: "ok", msg: "Submitted as a late bracket. You can change picks on series that have not started." }
          : { state: "ok", msg: "Submitted. You can change your picks until they lock." };
      } else if (r.status === 409) {
        msg = { state: "warn", msg: "Someone already has that name on the leaderboard. Try another name." };
      } else if (r.status === 423) {
        msg = { state: "warn", msg: "Picks are locked." };
      } else if (r.status === 429) {
        msg = { state: "warn", msg: "Too many tries. Wait a few minutes, then submit again." };
      } else if (r.status === 400) {
        msg = { state: "warn", msg: late ? "That did not save. Pick at least one series that has not started." : "That did not save. Check your name and picks." };
      } else {
        msg = { state: "ok", msg: "Saved on this device. The shared leaderboard is not on yet." };
      }
    } catch {
      msg = { state: "warn", msg: "Saved on this device. The leaderboard did not answer — submit again later." };
    }
    setPost(msg);
    setBoardTick((n) => n + 1);
  };

  const halfName = (h: 0 | 1) => bracket.halves[h];
  const finalRound = bracket.matchups.find((m) => m.key === bracket.final)?.round ?? bracket.rounds.length - 1;
  const earlyRounds = Array.from({ length: finalRound }, (_, r) => r);
  const finalMatchup = bracket.matchups.find((m) => m.key === bracket.final);

  // One round grid for every bracket the tab shows: the reader's own (editable
  // before the lock or as a late bracket) and anyone's from the leaderboard.
  const grid = ({ picks, editable, statusOf, open, label, championLabel }: {
    picks: Picks;
    editable: boolean;
    statusOf: (key: string) => PickStatus | null;
    /** A late bracket's open keys: every other card shows as started. */
    open: ReadonlySet<string> | null;
    label: string;
    championLabel: string;
  }) => {
    const champ = championOf(bracket, picks);
    const card = (m: PickMatchup, round: string) => (
      <PickCard
        key={m.key}
        m={m}
        bracket={bracket}
        picks={picks}
        locked={!editable}
        status={statusOf(m.key)}
        onPick={onPick}
        round={round}
        started={!!open && !open.has(m.key)}
      />
    );
    const column = (round: number, half: 0 | 1 | null, ms: PickMatchup[]) => {
      const r = bracket.rounds[round];
      const title = roundHeading(round, half == null ? null : halfName(half));
      return (
        <div key={`${half}-${round}`} className="flex flex-col shrink-0">
          <RoundHead title={title} bestOf={r?.bestOf ?? null} weight={r?.weight ?? 0} />
          <div className="flex-1 flex flex-col justify-around gap-3">
            {ms.map((m) => card(m, title))}
          </div>
        </div>
      );
    };
    const half = (h: 0 | 1) => (
      <div className={`flex items-stretch gap-2 md:gap-3 ${h === 1 ? "flex-row md:flex-row-reverse" : "flex-row"}`}>
        {earlyRounds.map((r) => column(r, h, bracket.matchups.filter((m) => m.half === h && m.round === r)))}
      </div>
    );
    return (
      <div className="overflow-x-auto pb-1" tabIndex={0} role="group" aria-label={label}>
        <div className="flex flex-col items-center gap-4 w-max mx-auto md:flex-row md:items-stretch md:gap-2">
          {half(0)}
          {finalMatchup ? (
            <div className="flex flex-col shrink-0">
              <RoundHead title={roundHeading(finalMatchup.round, null)} bestOf={bracket.rounds[finalMatchup.round]?.bestOf ?? null} weight={bracket.rounds[finalMatchup.round]?.weight ?? 0} />
              <div className="flex-1 flex flex-col justify-center items-center gap-2">
                {card(finalMatchup, roundHeading(finalMatchup.round, null))}
                <div data-pick-champion className="flex items-center gap-1.5 text-[11px]" style={{ color: champ ? "var(--text)" : "var(--text-muted)" }}>
                  {champ ? <TeamLogo team={champ} size={22} /> : null}
                  <span className={champ ? "font-bold" : "italic"}>{champ ? `${champ.name}` : championLabel}</span>
                </div>
              </div>
            </div>
          ) : null}
          {half(1)}
        </div>
      </div>
    );
  };

  // A late bracket's grid shows the real winners of the series it did not
  // pick, so while results are covered the whole grid sits behind the cover.
  const coverIfLate = (late: boolean, node: React.ReactNode) =>
    late && results.length > 0 ? <ResultsCover covered={covered} onReveal={reveal}>{node}</ResultsCover> : node;

  const myStatusOf = (key: string): PickStatus | null =>
    marksShown && myScore && locked && !openNow ? myScore.status[key] ?? null : null;

  const scoring = bracket.rounds.map((r) => `${r.label} ${r.weight}`).join(" · ");
  // The date is the one thing a reader needs off this line, so it is bold.
  const lockDate = lockAt ? <b data-lock-date style={{ color: "var(--text)" }}>{fmtLock(lockAt)}</b> : null;
  const firstGame = `first pitch of the first ${bracket.rounds[0]?.label ?? ""} game`;
  const lockLine = !lockAt
    ? "Picks open once the postseason schedule is out."
    : closed && lateClose
      ? <>Picks locked <b data-lock-date style={{ color: "var(--text)" }}>{fmtLock(lateClose)}</b>.</>
      : locked
        // Late brackets are open until World Series Game 1 (Jacob 10/1).
        ? <>Picks locked <s data-lock-struck className="font-normal" style={{ color: "var(--text-muted)" }}>{fmtLock(lockAt)}.</s> never - that&rsquo;s no fun</>
        : lockTbd
          ? <>Picks lock at {firstGame}. That time is not set yet, so for now picks lock {lockDate}.</>
          : <>Picks lock at {firstGame}: {lockDate}.</>;
  const dropped = !locked && sentClean ? sentClean.dropped.length : 0;

  const pill = (v: View, label: string) => {
    const active = view === v;
    return (
      <button
        type="button"
        aria-pressed={active}
        onClick={() => { setView(v); setViewing(null); }}
        className="text-[11px] px-2.5 py-0.5 rounded-full cursor-pointer"
        style={{
          background: active ? "var(--bg-card)" : "transparent",
          color: active ? "var(--text)" : "var(--text-muted)",
          border: `1px solid ${active ? "var(--border-hover)" : "var(--border)"}`,
        }}
      >
        {label}
      </button>
    );
  };

  // Signed out, the bracket lives on this device only, and a signed-out
  // winner of the one wish can't be reached. Signed in: nothing to say.
  const hasEntry = !!saved.posted && !!saved.sent;
  const accountLine = linked
    ? <p data-picks-linked className="m-0 text-[11px]" style={{ color: "var(--text-secondary)" }}>Linked to your account.</p>
    : auth && !auth.signedIn
      ? <SignInPrompt auth={auth} text={hasEntry
          ? "Sign in to keep this bracket on your account, and so we can reach you if you win"
          : "Sign in to keep your bracket on all your devices"} />
      : null;
  const editing = !locked || !!openNow;

  const viewed = viewing ? (() => {
    const open = viewing.late ? lateOpen(viewing) : null;
    const score = scorePicks(bracket, viewing.picks, results, open);
    return {
      open,
      picks: effectivePicks(bracket, viewing.picks, results, open),
      statusOf: (key: string): PickStatus | null => (marksShown ? score.status[key] ?? null : null),
    };
  })() : null;

  return (
    <div data-picks className="flex flex-col gap-3">
      <div className="rounded-lg px-3 py-2 text-xs" style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text)" }}>
        <p data-prize className="m-0 font-bold">🏆 {PRIZE_RULE}</p>
        {locked ? <p data-prize-late className="m-0 text-[11px]" style={{ color: "var(--text-secondary)" }}>Late brackets play for fun.</p> : null}
        <p className="m-0 mt-1 text-[11px]" style={{ color: "var(--text-secondary)" }}>
          Pick the winner of every series. Each right pick scores its round&rsquo;s points: {scoring} (max {maxPoints(bracket)}).
        </p>
        <p data-lock-line className="m-0 mt-1 text-[11px]" style={{ color: "var(--text-secondary)" }}>{lockLine}</p>
        {note && !locked ? <p className="m-0 mt-1 text-[10px]" style={{ color: "var(--text-muted)" }}>{note}</p> : null}
      </div>

      <div className="flex items-center gap-1.5" role="group" aria-label="Picks view">
        {pill("mine", "My bracket")}
        {pill("board", "Leaderboard")}
      </div>

      {view === "mine" ? (
        <>
          {dropped > 0 ? (
            <p role="alert" className="m-0 text-[11px] font-medium" style={{ color: "var(--accent)" }}>
              The seeds moved since you submitted: {dropped} pick{dropped === 1 ? "" : "s"} cleared. Re-pick and submit again.
            </p>
          ) : null}
          {openNow ? (
            <p data-late-intro className="m-0 text-xs font-medium" style={{ color: "var(--text)" }}>
              Missed the lock? Pick the series that have not started.
            </p>
          ) : null}
          {editing ? (
            <div className="flex flex-col gap-1">
              <label className="flex flex-wrap items-center gap-2 text-xs" style={{ color: "var(--text)" }}>
                Your name or initials
                <input
                  type="text"
                  value={saved.name}
                  maxLength={NAME_MAX}
                  autoComplete="nickname"
                  onChange={(e) => save({ ...saved, name: e.target.value })}
                  className="text-xs px-2 py-1 rounded-md w-40"
                  style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text)" }}
                />
                {saved.name.trim() && !name ? (
                  <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>Letters, numbers, spaces and . &apos; - only.</span>
                ) : null}
              </label>
              {!hasEntry ? accountLine : null}
            </div>
          ) : saved.sent ? (
            <p className="m-0 text-xs" style={{ color: "var(--text)" }}>Your bracket, as <b>{saved.sent.name}</b>{myOpen ? " (late)" : ""}.</p>
          ) : (
            <p className="m-0 text-xs" style={{ color: "var(--text-muted)" }}>You did not submit a bracket on this device.</p>
          )}

          {coverIfLate(!!openNow || !!myOpen, grid({
            picks: mine,
            editable: editing,
            statusOf: myStatusOf,
            open: openNow ?? myOpen,
            label: "Your bracket picks",
            championLabel: "Your champion",
          }))}

          {editing ? (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <button
                type="button"
                onClick={submit}
                disabled={!canSubmit}
                className="text-xs font-bold px-3 py-1.5 rounded-full"
                style={{
                  background: canSubmit ? "var(--accent)" : "var(--bg-card)",
                  color: canSubmit ? "var(--bg)" : "var(--text-muted)",
                  border: `1px solid ${canSubmit ? "var(--accent)" : "var(--border)"}`,
                  cursor: canSubmit ? "pointer" : "default",
                }}
              >
                {post.state === "sending" ? "Submitting…" : saved.sent ? "Update picks" : "Submit picks"}
              </button>
              <span className="text-[11px] tabular-nums" style={{ color: "var(--text-muted)" }}>
                {picked} of {total} {openNow ? "open series " : ""}picked{!name ? " · add your name" : ""}
                {saved.sent && !unsent && saved.posted ? " · submitted" : saved.sent && unsent ? " · changes not submitted" : ""}
              </span>
              {post.msg ? (
                <span role="status" className="text-[11px]" style={{ color: post.state === "warn" ? "var(--accent)" : "var(--text-secondary)" }}>
                  {post.msg}
                </span>
              ) : null}
            </div>
          ) : null}
          {hasEntry ? accountLine : null}

          {locked && myScore && results.length > 0 ? (
            <ResultsCover covered={covered} onReveal={reveal}>
              {/* Covered, the line is a stand-in, not the real one blurred: a
                  blur still shows how long a line is and what colour its emoji
                  is, and "perfect bracket 🏆" is longer than "12 of 20". */}
              <p data-my-score className="m-0 text-xs py-1" style={{ color: "var(--text)" }}>
                {covered ? (
                  "Your score: 00 of 00 possible so far (00%) · 00 still reachable"
                ) : (
                  <>
                    Your score: <b>{myScore.points}</b> of {myScore.possible} possible so far
                    {myScore.pct != null ? ` (${myScore.pct}%)` : ""} · {myScore.maxLeft} still reachable
                    {myScore.perfect ? " · perfect bracket" : myScore.perfectAlive ? " · still perfect" : ""}
                  </>
                )}
              </p>
            </ResultsCover>
          ) : null}
        </>
      ) : viewing && viewed ? (
        <>
          <div className="flex items-center gap-2">
            <button
              type="button"
              data-board-back
              onClick={() => setViewing(null)}
              className="text-[11px] px-2 py-0.5 rounded-full cursor-pointer"
              style={{ color: "var(--text-secondary)", border: "1px solid var(--border)" }}
            >
              ◂ Leaderboard
            </button>
            <p data-viewing className="m-0 text-xs font-bold truncate" style={{ color: "var(--text)" }}>
              {viewing.name}&rsquo;s bracket{viewing.late ? <LateTag /> : null}
            </p>
          </div>
          {coverIfLate(!!viewed.open, grid({
            picks: viewed.picks,
            editable: false,
            statusOf: viewed.statusOf,
            open: viewed.open,
            label: `${viewing.name}'s bracket picks`,
            championLabel: "No champion picked",
          }))}
          {/* Picks are no spoiler, so an on-time bracket shows while results
              are covered; only its ✓/✗ marks wait for this. */}
          {!viewed.open && covered && results.length > 0 ? <RevealButton onReveal={reveal} /> : null}
        </>
      ) : (
        <Leaderboard
          bracket={bracket}
          board={board}
          locked={locked}
          results={results}
          covered={covered}
          onReveal={reveal}
          mine={saved.sent ? { ...saved.sent, late: !!myLateAt, lateAt: myLateAt ?? undefined } : null}
          openKeysOf={(e) => (e.late ? lateOpen(e) : null)}
          onOpen={setViewing}
        />
      )}
    </div>
  );
}

function LateTag() {
  return (
    <span data-late-tag className="ml-1 text-[10px] font-normal" style={{ color: "var(--text-muted)" }}>late</span>
  );
}

// The sign-in the Settings Account section offers, behind one line: tap it for
// the same Apple / Google buttons (lib/prefsSync), which come back to this page.
function SignInPrompt({ auth, text }: { auth: AuthState; text: string }) {
  const [open, setOpen] = useState(false);
  // The Picks tab only renders after its feeds land, so never on the server.
  const [canUseGoogle] = useState(() => {
    const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
    return !cap?.isNativePlatform?.() || hasNativeGoogleBridge();
  });
  const go = (fn: (returnTo?: string) => void) => {
    try { window.sessionStorage.setItem(LINK_FLAG, "1"); } catch {}
    fn(window.location.pathname + window.location.search);
  };
  const btn = "text-[11px] font-semibold px-2.5 py-1 rounded-full cursor-pointer";
  return (
    <div data-picks-signin className="flex flex-col gap-1.5">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="text-left text-[11px] cursor-pointer p-0"
        style={{ color: "var(--text-secondary)", background: "none", border: 0 }}
      >
        {text} ▸
      </button>
      {open ? (
        <div className="flex flex-wrap gap-2">
          {auth.providers?.apple !== false ? (
            <button type="button" className={btn} onClick={() => go(signInWithApple)}
              style={{ background: "var(--text)", color: "var(--bg)" }}>
              Sign in with Apple
            </button>
          ) : null}
          {auth.providers?.google && canUseGoogle ? (
            <button type="button" className={btn} onClick={() => go(signInWithGoogle)}
              style={{ background: "#fff", color: "#1f1f1f", border: "1px solid #dadce0" }}>
              Sign in with Google
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function Leaderboard({ bracket, board, locked, results, covered, onReveal, mine, openKeysOf, onOpen }: {
  bracket: PickBracket;
  board: Board;
  locked: boolean;
  results: SeriesResult[];
  covered: boolean;
  onReveal: () => void;
  mine: (Sent & { late: boolean }) | null;
  openKeysOf: (e: BoardEntry) => ReadonlySet<string> | null;
  onOpen: (e: BoardEntry) => void;
}) {
  const muted = { color: "var(--text-muted)" } as const;
  if (board.state === "loading") {
    return <p role="status" className="m-0 text-xs py-4 text-center" style={muted}>Loading the leaderboard…</p>;
  }
  const offLine = board.state === "off"
    ? "The shared leaderboard is not on yet. Your own picks and score still save on this device."
    : board.state === "error"
      ? "Couldn’t load the leaderboard right now."
      : null;

  if (!locked) {
    const names = board.state === "open" ? board.names : [];
    return (
      <div className="text-xs flex flex-col gap-1.5" style={{ color: "var(--text)" }}>
        {offLine ? <p className="m-0" style={muted}>{offLine}</p> : null}
        {board.state === "open" ? (
          <p data-board-names className="m-0">
            <b>{board.count}</b> in so far{names.length ? `: ${names.join(", ")}` : ""}.
          </p>
        ) : null}
        <p className="m-0" style={muted}>Brackets and scores show here once picks lock.</p>
      </div>
    );
  }

  // After the lock: the server's entries, plus this device's own if the server
  // never got it (worker off, or the POST failed) — so a player always sees
  // themselves ranked against whatever the board holds.
  const entries: BoardEntry[] = board.state === "locked" ? [...board.entries] : [];
  if (mine && !entries.some((e) => nameKey(e.name) === nameKey(mine.name))) {
    entries.push(mine.late ? { name: mine.name, picks: mine.picks, late: true, lateAt: mine.lateAt } : { name: mine.name, picks: mine.picks });
  }
  const marks = results.length > 0 && !covered;
  // Covered, the rows go alphabetical with no rank: a blurred table still
  // shows its order, and the order is the result.
  const rows = marks || results.length === 0
    ? rankEntries(bracket, entries, results, openKeysOf)
    : rankEntries(bracket, entries, [], openKeysOf).sort((a, b) => a.name.localeCompare(b.name));

  const table = (
    <table className="w-full border-separate text-xs" style={{ borderSpacing: "0 2px" }}>
      <caption className="sr-only">Bracket picks leaderboard</caption>
      <thead>
        <tr className="text-[10px]" style={muted}>
          <th scope="col" className="px-1 py-1 font-normal text-center w-8">#</th>
          <th scope="col" className="px-1 py-1 font-normal text-left">Name</th>
          <th scope="col" className="px-1 py-1 font-normal text-right w-[72px]">% correct</th>
          <th scope="col" className="px-1 py-1 font-normal text-left w-[92px]">Champion</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const isMe = !!mine && nameKey(mine.name) === nameKey(r.name);
          const busted = marks && r.score.status[bracket.final] === "wrong";
          return (
            <tr key={r.name} data-board-row style={{ background: "var(--bg-card)" }}>
              <td className="px-1 py-1 text-center tabular-nums font-bold" style={{ color: "var(--text)" }}>{marks || results.length === 0 ? r.rank : "–"}</td>
              <td className="px-1 py-1 max-w-0">
                {/* Upright + ▸: tapping opens that bracket (the subtitle
                    affordance rule). */}
                <button
                  type="button"
                  data-board-open={r.name}
                  onClick={() => onOpen(r.entry)}
                  className="flex items-baseline gap-1 max-w-full cursor-pointer text-left p-0"
                  style={{ background: "none", border: 0 }}
                  title={`Open ${r.name}'s bracket`}
                >
                  <span className={`truncate ${isMe ? "font-bold" : ""}`} style={{ color: isMe ? "var(--accent)" : "var(--text)" }}>{r.name}</span>
                  {r.late ? <LateTag /> : null}
                  <span aria-hidden="true" className="shrink-0 text-[10px]" style={muted}>▸</span>
                </button>
              </td>
              <td
                className="px-1 py-1 text-right tabular-nums"
                style={{ background: marks && r.score.pct != null ? shadeFor({ value: r.score.pct }) : undefined, color: "var(--text)" }}
                title={marks ? `${r.score.points} of ${r.score.possible} points` : undefined}
              >
                {marks && r.score.pct != null ? `${r.score.pct}%` : "—"}
              </td>
              <td className="px-1 py-1">
                {r.champion ? (
                  <span className="flex items-center gap-1" style={{ opacity: busted ? 0.5 : 1 }}>
                    <TeamLogo team={r.champion} size={14} />
                    <span style={{ color: "var(--text)", textDecoration: busted ? "line-through" : undefined }}>{r.champion.abbrev}</span>
                  </span>
                ) : <span style={muted}>—</span>}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );

  return (
    <div className="flex flex-col gap-1.5">
      {offLine ? <p className="m-0 text-xs" style={muted}>{offLine}</p> : null}
      {/* Covered, the table holds no result: no rank, no %, no busted
          champion, and alphabetical order. So it stays readable and every
          name stays tappable; only the reveal sits above it. */}
      {rows.length ? (
        <>
          {results.length > 0 && covered ? <RevealButton onReveal={onReveal} /> : null}
          {table}
        </>
      ) : (
        <p className="m-0 text-xs" style={muted}>No brackets were submitted.</p>
      )}
    </div>
  );
}
