"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  fetchPlayoffOdds,
  fetchPlayoffPicture,
  orderHunt,
  teamLogo,
  type PlayoffLeague,
  type PlayoffOdds,
  type PlayoffPicture,
  type PlayoffTeam,
} from "@/lib/playoffPicture";

// The MLB playoff picture, behind one reveal.
//
// Unlike the Slam bracket, there is no useful partial gate here: the ORDER of
// the six seeds is itself derived from every result to date, so revealing "who's
// in" without the numbers would leak the same thing. One cover, one tap.
//
// The cover is the whole point of the panel existing at all — a W-L record is a
// second-order spoiler (today's 82-62 encodes whether they won last night), the
// same reasoning that keeps `showTeamRecords` opt-in and default-off.
//
// Behind the cover the number shown is the chance of making the playoffs, not
// the record: it answers the question the picture is opened for and moves a
// little less per game than a W-L line. Games back is a step closer to a
// record, so it sits behind its own toggle, off by default. A clinched team
// shows no percentage at all — "Clinched" already says 100.

const REVEAL_KEY = (season: number) => `mlb-playoff-picture-revealed-${season}`;

function loadRevealed(season: number): boolean {
  try {
    return window.localStorage.getItem(REVEAL_KEY(season)) === "1";
  } catch {
    return false;
  }
}

// "Updated 2:58 PM" when the feed stamped today, "Updated Sep 12, 2:58 PM"
// otherwise — the date only earns its space once it is not obvious.
export function formatUpdated(iso: string, now: Date = new Date()): string | null {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  const sameDay = d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
  return sameDay ? time : `${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}, ${time}`;
}

// The one-line status a row earns, most decisive first: a clinched berth, then
// the wins that would clinch a division, then — only when asked for — how far
// back the chase is. MLB writes "-" for wild-card games back when a club holds
// or is tied for the LAST wild-card spot (zero back, zero up): a seeded club
// holds it, an unseeded one is tied for it and lost the tiebreak.
export function statusFor(t: PlayoffTeam, showGamesBack: boolean, seeded: boolean): { text: string; tone: "good" | "plain" } | null {
  if (t.clinched) return { text: "Clinched", tone: "good" };
  if (t.divisionLeader && t.magicNumber) return { text: `Magic ${t.magicNumber}`, tone: "good" };
  if (t.divisionLeader) return { text: "Leads division", tone: "good" };
  if (!showGamesBack) return null;
  const gb = t.wildCardGamesBack;
  if (gb && gb !== "-") return { text: gb.startsWith("+") ? `${gb.slice(1)} up` : `${gb} back`, tone: "plain" };
  return { text: seeded ? "Holds last spot" : "Tied for last spot", tone: "plain" };
}

function Row({ team, seed, odds, showGamesBack }: { team: PlayoffTeam; seed: number | null; odds: string | null; showGamesBack: boolean }) {
  const status = statusFor(team, showGamesBack, seed != null);
  return (
    <div className="flex items-center gap-2 py-1 px-1.5 rounded min-w-0" style={{ background: "var(--bg-card)" }}>
      <span className="text-[11px] w-4 text-center shrink-0 tabular-nums font-bold" style={{ color: seed ? "var(--text)" : "var(--text-muted)", opacity: seed ? 1 : 0.5 }}>
        {seed ?? "—"}
      </span>
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
      <span className="text-xs truncate flex-1 min-w-0" style={{ color: "var(--text)" }} title={team.name}>
        {team.name}
      </span>
      <span
        className="text-[11px] tabular-nums shrink-0 text-right"
        style={{ width: 40, color: "var(--text-muted)" }}
        title={team.clinched ? undefined : odds ? "Chance of making the playoffs" : undefined}
      >
        {team.clinched ? "" : odds ?? "—"}
      </span>
      <span
        className="text-[10px] tabular-nums shrink-0 text-right"
        style={{ width: 74, color: status?.tone === "good" ? "var(--accent)" : "var(--text-muted)", opacity: !status || status.tone === "good" ? 1 : 0.75 }}
      >
        {status?.text ?? ""}
      </span>
    </div>
  );
}

function LeaguePanel({ league, odds, showGamesBack }: { league: PlayoffLeague; odds: PlayoffOdds | null; showGamesBack: boolean }) {
  const oddsFor = (t: PlayoffTeam) => odds?.[t.abbrev] ?? null;
  return (
    <div className="min-w-0">
      <div className="text-[10px] font-bold uppercase tracking-wide mb-1.5" style={{ color: "var(--text-muted)" }}>
        {league.name}
      </div>
      <div className="space-y-1">
        {league.seeded.map((t, i) => (
          <div key={t.id}>
            <Row team={t} seed={t.seed} odds={oddsFor(t)} showGamesBack={showGamesBack} />
            {/* Seeds 1-2 sit out the wild-card round; 3-6 play it. The rule the
                divider marks is the one a picture is read for. */}
            {i === 1 ? (
              <div className="flex items-center gap-2 my-1.5">
                <div className="h-px flex-1" style={{ background: "var(--border)" }} />
                <span className="text-[9px] uppercase tracking-wide" style={{ color: "var(--text-muted)", opacity: 0.7 }}>bye · wild-card round below</span>
                <div className="h-px flex-1" style={{ background: "var(--border)" }} />
              </div>
            ) : null}
          </div>
        ))}
      </div>
      {league.hunt.length ? (
        <>
          <div className="flex items-center gap-2 my-2">
            <div className="h-px flex-1" style={{ background: "var(--border)" }} />
            <span className="text-[9px] uppercase tracking-wide" style={{ color: "var(--text-muted)", opacity: 0.7 }}>still alive</span>
            <div className="h-px flex-1" style={{ background: "var(--border)" }} />
          </div>
          <div className="space-y-1">
            {orderHunt(league.hunt, odds).map((t) => <Row key={t.id} team={t} seed={null} odds={oddsFor(t)} showGamesBack={showGamesBack} />)}
          </div>
        </>
      ) : null}
    </div>
  );
}

export default function PlayoffPictureModal({ onClose }: { onClose: () => void }) {
  const [picture, setPicture] = useState<PlayoffPicture | null>(null);
  const [odds, setOdds] = useState<PlayoffOdds | null>(null);
  const [failed, setFailed] = useState(false);
  const [override, setOverride] = useState(false);
  const [showGamesBack, setShowGamesBack] = useState(false);
  const dialogRef = useRef<HTMLDivElement | null>(null);

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
  // renders, with the column showing a dash rather than the whole panel failing.
  useEffect(() => {
    const ctrl = new AbortController();
    (async () => {
      try {
        const o = await fetchPlayoffOdds(ctrl.signal);
        if (!ctrl.signal.aborted) setOdds(o);
      } catch {
        /* column stays "—" */
      }
    })();
    return () => ctrl.abort();
  }, []);

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

  const updatedLabel = picture?.updated ? formatUpdated(picture.updated) : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50" />
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="relative rounded-xl p-4 sm:p-5 w-full max-w-4xl max-h-[85vh] overflow-y-auto shadow-xl"
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
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 mb-3 pr-6">
          <h2 className="text-base sm:text-lg font-bold" style={{ color: "var(--text)" }}>
            ⚾ MLB — Playoff picture
          </h2>
          <div className="flex flex-col items-end gap-1 text-[10px]" style={{ color: "var(--text-muted)" }}>
            <span title="Any mix of that many wins or losses by the runner-up clinches the division">
              <span className="font-bold" style={{ color: "var(--accent)" }}>Magic N</span> = wins or rival losses left to clinch the division
            </span>
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
          </div>
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
                className="grid grid-cols-1 md:grid-cols-2 gap-4"
                // Same guard as the bracket: the blur is the spoiler cover, so
                // the content behind it must also be untappable, unselectable
                // and hidden from assistive tech.
                style={revealed ? undefined : { filter: "blur(7px)", pointerEvents: "none", userSelect: "none" }}
                aria-hidden={revealed ? undefined : true}
              >
                {picture.leagues.map((l) => <LeaguePanel key={l.key} league={l} odds={odds} showGamesBack={showGamesBack} />)}
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
            <p className="m-0 mt-3 text-[10px]" style={{ color: "var(--text-muted)", opacity: 0.7 }}>
              Seeds 1&ndash;3 are the division winners, 4&ndash;6 the wild cards.
              {updatedLabel ? <em className="tabular-nums" style={{ opacity: 0.75 }}> Updated {updatedLabel}</em> : null}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
