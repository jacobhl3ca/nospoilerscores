"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  applyPick,
  championOf,
  cleanName,
  cleanPicks,
  isComplete,
  maxPoints,
  nameKey,
  NAME_MAX,
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
import { getApiBase } from "@/lib/youtube";

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
  d.toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

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

function PickCard({ m, bracket, picks, locked, status, onPick, round }: {
  m: PickMatchup;
  bracket: PickBracket;
  picks: Picks;
  locked: boolean;
  status: PickStatus | null;
  onPick: (key: string, teamId: string) => void;
  round: string;
}) {
  const [a, b] = sidesFor(bracket, picks, m.key);
  const pick = picks[m.key];
  const seat = (t: PickTeam | null, i: 0 | 1) => (
    <PickSeat
      team={t}
      label={m.sides[i].label}
      picked={!!t && pick === t.id}
      faded={!!t && !!pick && pick !== t.id}
      status={status}
      disabled={locked || !t || !(a && b)}
      onPick={() => t && onPick(m.key, t.id)}
      round={round}
    />
  );
  return (
    <div
      data-pick-card={m.key}
      className="rounded-lg p-0.5 w-[124px] md:w-[140px]"
      style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
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

// ── Tab ──────────────────────────────────────────────────────────────────────

type View = "mine" | "board";

export default function BracketPicks({ bracket, roundHeading, lockAt, lockTbd, results, note }: {
  bracket: PickBracket;
  /** Column heading for a round in one half (null for the final). */
  roundHeading: (round: number, half: string | null) => string;
  lockAt: Date | null;
  /** The lock is a stand-in time until the first game's start is set. */
  lockTbd: boolean;
  results: SeriesResult[];
  /** One line under the rules, e.g. why seeds can still move. */
  note?: string;
}) {
  const id = bracket.id;
  const [saved, setSaved] = useState<Saved>(() => readSaved(id));
  const [seen, setSeen] = useState<number>(() => readSeen(id));
  const [view, setView] = useState<View>("mine");
  const [post, setPost] = useState<Post>({ state: "idle" });
  const [board, setBoard] = useState<Board>({ state: "loading" });
  const [boardTick, setBoardTick] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const locked = !!lockAt && now >= lockAt.getTime();

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
          const entries = (j.entries as BoardEntry[]).filter((e) => e && typeof e.name === "string" && isPicks(e.picks));
          setBoard({ state: "locked", entries });
        } else {
          const names = Array.isArray(j.names) ? (j.names as unknown[]).filter((n): n is string => typeof n === "string") : [];
          setBoard({ state: "open", count: typeof j.count === "number" ? j.count : names.length, names });
        }
      } catch {
        if (!ctrl.signal.aborted) setBoard({ state: "error" });
      }
    })();
    return () => ctrl.abort();
  }, [id, boardTick, locked]);

  const save = useCallback((next: Saved) => {
    setSaved(next);
    writeSaved(id, next);
  }, [id]);

  const draft = useMemo(() => cleanPicks(bracket, saved.draft).picks, [bracket, saved.draft]);
  const sentClean = useMemo(() => (saved.sent ? cleanPicks(bracket, saved.sent.picks) : null), [bracket, saved.sent]);
  const mine = locked ? sentClean?.picks ?? {} : draft;

  const covered = results.length > seen;
  const marksShown = results.length > 0 && !covered;
  const myScore = useMemo(() => (saved.sent ? scorePicks(bracket, saved.sent.picks, results) : null), [bracket, saved.sent, results]);

  const onPick = useCallback((key: string, teamId: string) => {
    if (locked) return;
    const cur = draft[key];
    // A second tap on the picked side clears it, so a pick can be undone.
    const next = cur === teamId
      ? cleanPicks(bracket, Object.fromEntries(Object.entries(draft).filter(([k]) => k !== key))).picks
      : applyPick(bracket, draft, key, teamId);
    save({ ...saved, draft: next });
    if (post.state !== "sending") setPost({ state: "idle" });
  }, [bracket, draft, locked, post.state, save, saved]);

  const reveal = () => {
    setSeen(results.length);
    try { window.localStorage.setItem(SEEN_KEY(id), String(results.length)); } catch {}
  };

  const name = cleanName(saved.name);
  const complete = isComplete(bracket, draft);
  const total = bracket.matchups.length;
  const picked = pickedCount(bracket, draft);
  const unsent = !saved.sent || saved.sent.name !== name || !samePicks(saved.sent.picks, draft);
  const canSubmit = !!lockAt && !locked && complete && !!name && post.state !== "sending" && (unsent || !saved.posted);
  const champion = championOf(bracket, mine);

  const submit = async () => {
    if (!canSubmit || !name) return;
    const sent: Sent = { name, picks: draft, at: new Date().toISOString() };
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
        save({ ...next, posted: true });
        void syncPicksWithAccount();
        msg = { state: "ok", msg: "Submitted. You can change your picks until they lock." };
      } else if (r.status === 409) {
        msg = { state: "warn", msg: "Someone already has that name on the leaderboard. Try another name." };
      } else if (r.status === 423) {
        msg = { state: "warn", msg: "Picks are locked." };
      } else if (r.status === 429) {
        msg = { state: "warn", msg: "Too many tries. Wait a few minutes, then submit again." };
      } else if (r.status === 400) {
        msg = { state: "warn", msg: "That did not save. Check your name and picks." };
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
  const statusOf = (key: string): PickStatus | null => (marksShown && myScore && locked ? myScore.status[key] ?? null : null);

  const column = (round: number, half: 0 | 1 | null, ms: PickMatchup[]) => {
    const r = bracket.rounds[round];
    const title = roundHeading(round, half == null ? null : halfName(half));
    return (
      <div key={`${half}-${round}`} className="flex flex-col shrink-0">
        <RoundHead title={title} bestOf={r?.bestOf ?? null} weight={r?.weight ?? 0} />
        <div className="flex-1 flex flex-col justify-around gap-3">
          {ms.map((m) => (
            <PickCard key={m.key} m={m} bracket={bracket} picks={mine} locked={locked} status={statusOf(m.key)} onPick={onPick} round={title} />
          ))}
        </div>
      </div>
    );
  };
  const half = (h: 0 | 1) => (
    <div className={`flex items-stretch gap-2 md:gap-3 ${h === 1 ? "flex-row md:flex-row-reverse" : "flex-row"}`}>
      {earlyRounds.map((r) => column(r, h, bracket.matchups.filter((m) => m.half === h && m.round === r)))}
    </div>
  );
  const finalMatchup = bracket.matchups.find((m) => m.key === bracket.final);

  const scoring = bracket.rounds.map((r) => `${r.label} ${r.weight}`).join(" · ");
  // The date is the one thing a reader needs off this line, so it is bold.
  const lockDate = lockAt ? <b data-lock-date style={{ color: "var(--text)" }}>{fmtLock(lockAt)}</b> : null;
  const firstGame = `first pitch of the first ${bracket.rounds[0]?.label ?? ""} game`;
  const lockLine = !lockAt
    ? "Picks open once the postseason schedule is out."
    : locked
      ? <>Picks locked {lockDate}.</>
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
        onClick={() => setView(v)}
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

  return (
    <div data-picks className="flex flex-col gap-3">
      <div className="rounded-lg px-3 py-2 text-xs" style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text)" }}>
        <p data-prize className="m-0 font-bold">🏆 {PRIZE_RULE}</p>
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
          {!locked ? (
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
          ) : saved.sent ? (
            <p className="m-0 text-xs" style={{ color: "var(--text)" }}>Your bracket, as <b>{saved.sent.name}</b>.</p>
          ) : (
            <p className="m-0 text-xs" style={{ color: "var(--text-muted)" }}>You did not submit a bracket on this device.</p>
          )}

          <div className="overflow-x-auto pb-1" tabIndex={0} role="group" aria-label="Your bracket picks">
            <div className="flex flex-col items-center gap-4 w-max mx-auto md:flex-row md:items-stretch md:gap-2">
              {half(0)}
              {finalMatchup ? (
                <div className="flex flex-col shrink-0">
                  <RoundHead title={roundHeading(finalMatchup.round, null)} bestOf={bracket.rounds[finalMatchup.round]?.bestOf ?? null} weight={bracket.rounds[finalMatchup.round]?.weight ?? 0} />
                  <div className="flex-1 flex flex-col justify-center items-center gap-2">
                    <PickCard m={finalMatchup} bracket={bracket} picks={mine} locked={locked} status={statusOf(finalMatchup.key)} onPick={onPick} round={roundHeading(finalMatchup.round, null)} />
                    <div data-pick-champion className="flex items-center gap-1.5 text-[11px]" style={{ color: champion ? "var(--text)" : "var(--text-muted)" }}>
                      {champion ? <TeamLogo team={champion} size={22} /> : null}
                      <span className={champion ? "font-bold" : "italic"}>{champion ? `${champion.name}` : "Your champion"}</span>
                    </div>
                  </div>
                </div>
              ) : null}
              {half(1)}
            </div>
          </div>

          {!locked ? (
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
                {picked} of {total} picked{!name ? " · add your name" : ""}
                {saved.sent && !unsent && saved.posted ? " · submitted" : saved.sent && unsent ? " · changes not submitted" : ""}
              </span>
              {post.msg ? (
                <span role="status" className="text-[11px]" style={{ color: post.state === "warn" ? "var(--accent)" : "var(--text-secondary)" }}>
                  {post.msg}
                </span>
              ) : null}
            </div>
          ) : null}

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
      ) : (
        <Leaderboard
          bracket={bracket}
          board={board}
          locked={locked}
          results={results}
          covered={covered}
          onReveal={reveal}
          mine={saved.sent}
        />
      )}
    </div>
  );
}

function Leaderboard({ bracket, board, locked, results, covered, onReveal, mine }: {
  bracket: PickBracket;
  board: Board;
  locked: boolean;
  results: SeriesResult[];
  covered: boolean;
  onReveal: () => void;
  mine: Sent | null;
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
  if (mine && !entries.some((e) => nameKey(e.name) === nameKey(mine.name))) entries.push({ name: mine.name, picks: mine.picks });
  const marks = results.length > 0 && !covered;
  // Covered, the rows go alphabetical with no rank: a blurred table still
  // shows its order, and the order is the result.
  const rows = marks || results.length === 0
    ? rankEntries(bracket, entries, results)
    : rankEntries(bracket, entries, []).sort((a, b) => a.name.localeCompare(b.name));

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
                <span className={`block truncate ${isMe ? "font-bold" : ""}`} style={{ color: isMe ? "var(--accent)" : "var(--text)" }} title={r.name}>{r.name}</span>
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
      {rows.length ? (
        results.length > 0 ? <ResultsCover covered={covered} onReveal={onReveal}>{table}</ResultsCover> : table
      ) : (
        <p className="m-0 text-xs" style={muted}>No brackets were submitted.</p>
      )}
    </div>
  );
}
