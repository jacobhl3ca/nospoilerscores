"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { getTimeZone } from "@/lib/etDay";
import { fetchSlam, type Slam, type SlamDraw, type SlamMatch, type SlamRound, type DrawKey } from "@/lib/slamBracket";

// The Grand Slam draw, as a spoiler-gated bracket.
//
// Every round after the first is a spoiler by construction: a quarterfinal
// matchup is only knowable because eight fourth-round matches already have
// winners. So the reveal is PER ROUND — Round 1 (the published draw, which
// reveals nothing) renders plainly, and each later round sits behind a blur
// until it's tapped. Someone who watched through the third round can open the
// fourth without the semifinals leaking past it, which is the whole point.
//
// Reveals persist per tournament + draw, so reopening the bracket doesn't
// re-blur what the user already chose to see. A new Slam starts covered again.
//
// We never render a score or mark a winner. Advancement alone tells the story,
// and it's the minimum a bracket can show and still be a bracket.

const REVEAL_KEY = (slam: string, draw: DrawKey) => `slam-bracket-revealed-${slam}-${draw}`;

// Where the default view starts. A full men's draw is 64 first-round matches —
// a ~3,000px column that buries the part anyone opens a bracket to look at. The
// last four rounds are 15 matches and read at a glance; "Show full draw"
// switches to all seven.
const DEFAULT_FROM = "Round 4";

function loadRevealed(slam: string, draw: DrawKey): number {
  try {
    const v = window.localStorage.getItem(REVEAL_KEY(slam, draw));
    const n = v == null ? -1 : parseInt(v, 10);
    return Number.isFinite(n) ? n : -1;
  } catch {
    return -1;
  }
}

function dateLabel(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  // toLocaleDateString on an Invalid Date returns the literal "Invalid Date"
  // rather than throwing — the same guard WorldCupBracket applies.
  if (isNaN(d.getTime())) return null;
  try {
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: getTimeZone() });
  } catch {
    return null;
  }
}

function Side({ match, index, prevRound }: { match: SlamMatch; index: 0 | 1; prevRound: SlamRound | null }) {
  const side = match.sides[index];
  if (side.player) {
    return (
      <div className="flex items-center gap-1.5 min-w-0">
        {side.player.flag ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={side.player.flag}
            alt=""
            loading="lazy"
            decoding="async"
            width={16}
            height={16}
            className="w-4 h-4 object-contain shrink-0"
            draggable={false}
            onError={(e) => { e.currentTarget.style.display = "none"; }}
          />
        ) : (
          <span className="w-4 h-4 shrink-0" />
        )}
        <span className="text-xs truncate" style={{ color: "var(--text)" }} title={side.player.name}>
          {side.player.name}
        </span>
      </div>
    );
  }
  // An undecided slot names the match that will fill it when we can — "Winner:
  // Alcaraz v Shelton" is schedule information, not a result.
  const feeder = side.feederPos != null ? prevRound?.matches[side.feederPos] : null;
  const both = feeder?.sides.map((s) => s.player?.name).filter(Boolean) as string[] | undefined;
  const label = both && both.length === 2 ? `Winner: ${both[0]} v ${both[1]}` : "TBD";
  return (
    <div className="flex items-center gap-1.5 min-w-0">
      <span className="w-4 h-4 shrink-0" />
      <span className="text-[11px] italic truncate" style={{ color: "var(--text-muted)", opacity: 0.8 }} title={label}>
        {label}
      </span>
    </div>
  );
}

function MatchCard({ match, prevRound }: { match: SlamMatch; prevRound: SlamRound | null }) {
  const label = dateLabel(match.date);
  return (
    <div className={`relative rounded-lg p-1.5 w-full ${label ? "pr-8" : ""}`} style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
      {label ? (
        <div className="absolute top-1 right-1.5 text-[9px] tabular-nums" style={{ color: "var(--text-muted)", opacity: 0.6 }}>{label}</div>
      ) : null}
      <Side match={match} index={0} prevRound={prevRound} />
      <div className="my-0.5 h-px" style={{ background: "var(--border)", opacity: 0.6 }} />
      <Side match={match} index={1} prevRound={prevRound} />
    </div>
  );
}

export default function SlamBracketModal({ onClose }: { onClose: () => void }) {
  const [slam, setSlam] = useState<Slam | null>(null);
  const [failed, setFailed] = useState(false);
  const [drawKey, setDrawKey] = useState<DrawKey>("mens-singles");
  // Reveal depth is per tournament + draw, and lives half in localStorage (what
  // the user revealed on a previous open) and half in state (what they've
  // revealed since this one). Derived at render rather than synced through an
  // effect — an effect here would setState on every draw switch, which is a
  // cascading render and exactly what react-hooks/set-state-in-effect flags.
  const [revealOverrides, setRevealOverrides] = useState<Record<string, number>>({});
  const [fullDraw, setFullDraw] = useState(false);
  const dialogRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    (async () => {
      try {
        const s = await fetchSlam(ctrl.signal);
        if (ctrl.signal.aborted) return;
        if (!s) { setFailed(true); return; }
        setSlam(s);
        setDrawKey(s.draws[0].key);
      } catch {
        if (!ctrl.signal.aborted) setFailed(true);
      }
    })();
    return () => ctrl.abort();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Focus management + Tab trap (WCAG 2.4.3) — the pattern GameDetailModal and
  // WorldCupGroupsModal already use. Focusables are queried live per keypress so
  // the async-loaded bracket controls are included once they mount.
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

  const draw: SlamDraw | null = useMemo(
    () => slam?.draws.find((d) => d.key === drawKey) ?? slam?.draws[0] ?? null,
    [slam, drawKey],
  );

  // The men's and women's draws are gated independently: watching one is no
  // reason to spoil the other.
  const revealKey = slam ? `${slam.name}|${drawKey}` : "";
  const savedReveal = useMemo(
    () => (slam ? loadRevealed(slam.name, drawKey) : -1),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [revealKey],
  );
  const revealed = revealOverrides[revealKey] ?? savedReveal;

  // Which rounds are on screen. Indices stay absolute (into draw.rounds) so a
  // saved reveal depth means the same thing in both views.
  const startIdx = useMemo(() => {
    if (!draw) return 0;
    if (fullDraw) return 0;
    const i = draw.rounds.findIndex((r) => r.key === DEFAULT_FROM);
    return i >= 0 ? i : 0;
  }, [draw, fullDraw]);

  const reveal = (idx: number) => {
    if (!slam) return;
    setRevealOverrides((prev) => ({ ...prev, [revealKey]: idx }));
    try { window.localStorage.setItem(REVEAL_KEY(slam.name, drawKey), String(idx)); } catch {}
  };

  // A round leaks results when any of its matchups is already decided, because
  // that pairing could only be known from the previous round's winners. Round 0
  // is the published draw and is never a spoiler.
  const spoils = (r: SlamRound, i: number) => i > 0 && r.matches.some((m) => m.sides.some((s) => s.player));

  const lastIdx = draw ? draw.rounds.length - 1 : 0;
  const anythingHidden = !!draw && draw.rounds.some((r, i) => spoils(r, i) && i > revealed);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50" />
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="relative rounded-xl p-4 sm:p-5 w-full max-w-6xl max-h-[85vh] overflow-y-auto shadow-xl"
        style={{ background: "var(--bg)", border: "1px solid var(--border)", outline: "none" }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={slam ? `${slam.name} bracket` : "Grand Slam bracket"}
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
        <h2 className="text-base sm:text-lg font-bold mb-3 pr-6" style={{ color: "var(--text)" }}>
          🎾 {slam ? slam.name : "Grand Slam"} — Bracket
        </h2>

        {draw ? (
          <div className="mb-3 flex items-center gap-3 flex-wrap">
            {slam && slam.draws.length > 1 ? (
              <div className="inline-flex rounded-lg overflow-hidden shrink-0" style={{ border: "1px solid var(--border)" }}>
                {slam.draws.map((d) => {
                  const active = d.key === draw.key;
                  return (
                    <button
                      type="button"
                      key={d.key}
                      onClick={() => setDrawKey(d.key)}
                      aria-pressed={active}
                      className="text-xs font-medium px-3 py-1 cursor-pointer transition-colors"
                      style={{ background: active ? "var(--accent)" : "var(--bg-card)", color: active ? "white" : "var(--text)" }}
                    >
                      {d.label}
                    </button>
                  );
                })}
              </div>
            ) : null}
            <button
              type="button"
              onClick={() => setFullDraw((v) => !v)}
              className="text-xs px-2.5 py-1 rounded-full cursor-pointer"
              style={{ background: "var(--bg-card)", color: "var(--text-muted)", border: "1px solid var(--border)" }}
            >
              {fullDraw ? "Last rounds only" : "Show full draw"}
            </button>
            {anythingHidden ? (
              <button
                type="button"
                onClick={() => reveal(lastIdx)}
                className="text-xs px-2.5 py-1 rounded-full cursor-pointer"
                style={{ background: "var(--bg-card)", color: "var(--text-muted)", border: "1px solid var(--border)" }}
              >
                Reveal all (spoilers)
              </button>
            ) : null}
          </div>
        ) : null}

        {failed ? (
          <p role="status" aria-live="polite" className="text-xs py-6 text-center" style={{ color: "var(--text-muted)" }}>
            No Grand Slam draw to show right now.
          </p>
        ) : !draw ? (
          <p role="status" aria-live="polite" className="text-xs py-6 text-center" style={{ color: "var(--text-muted)" }}>
            Loading bracket&hellip;
          </p>
        ) : (
          <>
            {/* Wider than a phone, so it scrolls horizontally. A scrollable
                region must be keyboard-operable (WCAG 2.1.1): tabIndex makes it
                focusable for arrow-key scrolling, role+label name it. */}
            <div className="overflow-x-auto pb-1" tabIndex={0} role="group" aria-label={`${draw.label} bracket`}>
              <div className="flex gap-2 sm:gap-3" style={{ minWidth: "min-content" }}>
                {draw.rounds.map((round, i) => {
                  if (i < startIdx) return null;
                  const hidden = spoils(round, i) && i > revealed;
                  const prevRound = i > 0 ? draw.rounds[i - 1] : null;
                  return (
                    <div key={round.key} className="flex flex-col shrink-0" style={{ width: 158 }}>
                      <div className="text-[10px] font-bold uppercase tracking-wide mb-1.5 text-center" style={{ color: "var(--text-muted)" }}>
                        {round.name}
                      </div>
                      <div className="relative flex-1">
                        <div
                          className="flex flex-col justify-around gap-2 h-full"
                          // The blur IS the spoiler guard, so the content behind
                          // it must also be unreachable: no pointer events, no
                          // text selection, and hidden from assistive tech —
                          // otherwise a screen reader or a copy-paste reads out
                          // exactly what the blur exists to cover.
                          style={hidden ? { filter: "blur(6px)", pointerEvents: "none", userSelect: "none" } : undefined}
                          aria-hidden={hidden || undefined}
                        >
                          {round.matches.map((m, k) => (
                            <MatchCard key={m.id || `${round.key}-${k}`} match={m} prevRound={prevRound} />
                          ))}
                        </div>
                        {hidden ? (
                          <button
                            type="button"
                            onClick={() => reveal(i)}
                            className="absolute inset-0 flex items-center justify-center cursor-pointer rounded-lg"
                            aria-label={`Show the ${round.name} (reveals who advanced)`}
                          >
                            <span
                              className="text-[11px] font-medium px-2.5 py-1 rounded-full"
                              style={{ background: "var(--bg)", color: "var(--text)", border: "1px solid var(--border)" }}
                            >
                              Show {round.short}
                            </span>
                          </button>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            <p className="text-[10px] mt-3" style={{ color: "var(--text-muted)", opacity: 0.7 }}>
              Matchups only, never a score. Each round stays covered until you tap it, and fills in on its own as the draw plays out.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
