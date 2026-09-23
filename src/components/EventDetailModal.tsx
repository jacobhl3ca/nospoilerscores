"use client";

import { useEffect, useRef } from "react";
import { LeagueEventCard, FightBout } from "@/lib/types";
import { openExternal } from "@/lib/openExternal";
import { getTimeZone } from "@/lib/etDay";
import CalendarButtons from "@/components/CalendarButtons";
import { buildEventCalendarEvent } from "@/lib/calendarLink";

// Spoiler-safe detail sheet for the EVENT tiles — races, UFC bouts, boxing,
// chess and poker. The score cards have had GameDetailModal since day one; the
// event tiles had nothing, so a tile was the one card on the board that did
// not answer a tap (Jacob 8/11: "nothing happens when i click the fight card,
// should have more info… and all cards should have more info when clicked
// across all leagues").
//
// It also fixes the OTHER half of that report. The tile fits its title to one
// line by stepping the font down and, at the floor, truncating — so on a 3-up
// mobile board "World Series of Poker Main Event" and "British Chess
// Championship" still lost their tails. Truncation is only tolerable while the
// full string is reachable SOMEWHERE, and this is that somewhere: every line
// here wraps and nothing is abbreviated. That is why the title below is a
// plain wrapping <h2> with no FittedLine and no `truncate` — do not "fix" it
// to match the tile.
//
// ⛔ Spoiler contract, identical to the tile's: never render a finishing
// order, a fight outcome, a chess result or a poker payout. Everything shown
// here describes the FIELD, the FORMAT, the VENUE and the SCHEDULE. The one
// result-adjacent field is a fighter's career W-L record, which GameDetailModal
// already treats as safe — it is not a result of THIS event.

// "Sat, Aug 16, 8:00 PM EDT" — the same long form GameDetailModal uses, in the
// user's chosen zone (Settings → Time zone, defaulting to the device's own).
// The tile shows a clipped "8:00PM"; the sheet is where the whole thing fits.
function longWhen(iso?: string): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleString("en-US", {
      weekday: "short", month: "short", day: "numeric",
      hour: "numeric", minute: "2-digit", timeZoneName: "short",
      timeZone: getTimeZone(),
    });
  } catch {
    return "";
  }
}

// Midnight in the DISPLAY zone is ESPN's "time TBD" placeholder, exactly as
// whenLabel in EventCard treats it. Showing "12:00 AM" for a race whose start
// time hasn't been published is worse than showing the day alone.
function isTimePlaceholder(iso?: string): boolean {
  if (!iso) return true;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return true;
  const hm = new Intl.DateTimeFormat("en-GB", {
    timeZone: getTimeZone(), hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(d);
  return hm === "00:00" || hm === "24:00";
}

function dayOnly(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", {
    weekday: "short", month: "short", day: "numeric", timeZone: getTimeZone(),
  });
}

// One label/value line. Values wrap — a detail sheet that truncated would
// defeat the reason this component exists.
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 text-xs py-1">
      <span className="shrink-0 uppercase tracking-wide w-24" style={{ color: "var(--text-muted)" }}>{label}</span>
      <span className="min-w-0 flex-1 break-words" style={{ color: "var(--text-secondary)" }}>{children}</span>
    </div>
  );
}

export default function EventDetailModal({
  event,
  fight,
  leagueLabel,
  onClose,
  reminderLinkTemplate,
}: {
  event: LeagueEventCard;
  // Set when a single UFC BOUT card was tapped rather than the event tile —
  // the sheet then leads with that bout and lists the rest of the card under
  // it. The fight-card layout renders one card per bout, so a tap has to be
  // able to say WHICH bout it was about.
  fight?: FightBout;
  leagueLabel?: string;
  onClose: () => void;
  // Settings → Reminder link. Blank = no "Remind me" button (CalendarButtons).
  reminderLinkTemplate?: string;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Focus management + Tab trap (WCAG 2.4.3) — GameDetailModal's effect
  // verbatim, including focusing the CONTAINER rather than a control so mouse
  // users see no focus ring, and restoring focus to the opener on close.
  // Focusables are queried live on each keypress so anything that mounts after
  // open is included, and offsetParent filters out hidden controls.
  const dialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    dialog?.focus();
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

  // Body scroll lock — the position:fixed + negative-top technique the other
  // three overlays use, because plain overflow:hidden does not stop iOS WebKit
  // scrolling the board behind the dialog.
  useEffect(() => {
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
  }, []);

  const isLive = (fight?.state ?? event.state) === "in";
  const isPost = (fight?.state ?? event.state) === "post";
  const statusLabel = isPost ? "Final" : isLive ? "In progress" : "Upcoming";

  // The headline of the sheet. A tapped bout names the bout; everything else
  // names the event. Always the FULL string — event.title, never a variant.
  const heading = fight ? `${fight.red.name} vs ${fight.blue.name}` : event.title;
  const whenIso = fight?.date ?? event.date;
  // Poker festivals carry a source-backed date WINDOW instead of a kickoff
  // clock (scheduleLabel), because no trustworthy exact start exists — prefer
  // it over inventing a time, the same precedence the tile's status uses.
  const when = event.kind === "poker" && event.scheduleLabel && !fight
    ? event.scheduleLabel
    : isTimePlaceholder(whenIso)
      ? dayOnly(whenIso)
      : longWhen(whenIso);

  // The tile links out only on a pre/live race, because a finished event's
  // ESPN page prints the finishing order. Keep exactly that rule here: the
  // sheet must not become a back door to the spoiler the tile refuses to open.
  const showExternal = !!event.eventUrl && !isPost;
  // Boxing's eventUrl is a www.youtube.com watch URL (boxing.ts points it at the
  // DAZN Boxing fixture/preview clip), not an ESPN page — the fall-through noun
  // was wrong on both counts, and it is the button's whole accessible name.
  const externalNoun = event.kind === "chess"
    ? "Follow live on Lichess"
    : event.kind === "poker"
      ? "Official tournament details"
      : event.kind === "boxing"
        ? "Fight preview on YouTube"
        : event.kind === "ufc"
          ? "Fight card on ESPN"
          : "Race details on ESPN";

  const dialogLabel = `${heading} — event details`;

  // "Add to calendar" / "Remind me" — upcoming only, and null for a poker
  // festival that carries a date window instead of a clock (scheduleLabel).
  const calendarEvent = buildEventCalendarEvent(event, fight);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50" />
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="relative rounded-xl p-5 max-w-sm w-full shadow-xl max-h-[85vh] overflow-y-auto"
        style={{ background: "var(--bg)", border: "1px solid var(--border)", outline: "none" }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={dialogLabel}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute top-3 right-3 w-7 h-7 flex items-center justify-center rounded-full cursor-pointer"
          style={{ color: "var(--text-muted)" }}
          aria-label="Close"
        >
          <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
        </button>

        {/* Title — wraps, never fits or truncates. This is the whole point. */}
        <h2 className="text-base font-semibold mb-1 pr-6 break-words" style={{ color: "var(--text)" }}>
          {heading}
        </h2>
        {/* When a bout is the headline, the EVENT name becomes the subtitle so
            the sheet still says which card this fight is on. */}
        {fight ? (
          <div className="text-xs mb-3 break-words" style={{ color: "var(--text-muted)" }}>{event.title}</div>
        ) : leagueLabel ? (
          <div className="text-xs mb-3" style={{ color: "var(--text-muted)" }}>{leagueLabel}</div>
        ) : <div className="mb-3" />}

        <div className="flex flex-col divide-y" style={{ borderColor: "var(--border)" }}>
          <Row label="Status">
            {isLive ? (
              <span className="inline-flex items-center gap-1.5" style={{ color: "#16a34a" }}>
                <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: "#16a34a" }} />
                {statusLabel}
              </span>
            ) : statusLabel}
          </Row>
          {when ? (
            <Row label="When">
              {/* Semantic <time> exposes the machine-readable ISO while the
                  visible text stays zone-formatted, as GameDetailModal does.
                  The poker window is prose, not an instant, so it gets none. */}
              {event.kind === "poker" && event.scheduleLabel && !fight
                ? when
                : <time dateTime={whenIso}>{when}</time>}
            </Row>
          ) : null}
          {/* The venue line the tile had to shorten — "Circuit Park Zandvoort ·
              Zandvoort, Netherlands" in full, from event.subtitle rather than
              any rung of subtitleVariants. */}
          {event.subtitle ? <Row label="Venue">{event.subtitle}</Row> : null}
          {fight?.weightClass ? <Row label="Division">{fight.weightClass}</Row> : null}
          {/* Career records, not results of this fight — the same call
              GameDetailModal makes for a team's W-L. */}
          {fight && (fight.red.record || fight.blue.record) ? (
            <Row label="Records">
              {fight.red.name} {fight.red.record || "—"} · {fight.blue.name} {fight.blue.record || "—"}
            </Row>
          ) : null}
          {!fight && event.headline ? <Row label="Main event">{event.headline}</Row> : null}
          {!fight && event.boutCount ? <Row label="Card">{event.boutCount} bouts</Row> : null}
          {/* Chess: the FIELD and the FORMAT. Deliberately no standings — see
              the spoiler note on LeagueEventCard's chess fields. */}
          {event.chessRound ? <Row label="Round">{event.chessRound}</Row> : null}
          {event.chessFormat ? <Row label="Format">{event.chessFormat}</Row> : null}
          {event.chessTimeControl ? <Row label="Time control">{event.chessTimeControl}</Row> : null}
          {event.chessPlayers?.length ? <Row label="Players">{event.chessPlayers.join(" · ")}</Row> : null}
          {/* Broadcasts, like GameDetailModal, only while they're still useful:
              once the event is over "where to watch" is noise and the highlight
              button on the tile is the affordance. */}
          {event.broadcasts.length > 0 && !isPost ? (
            <Row label="Watch">{event.broadcasts.join(" · ")}</Row>
          ) : null}
        </div>

        {/* The rest of the fight card, when a single bout opened this sheet.
            Names only — no state, no result. */}
        {fight && event.fights && event.fights.length > 1 ? (
          <div className="mt-3">
            <div className="text-[10px] uppercase tracking-wide mb-1" style={{ color: "var(--text-muted)" }}>Rest of the card</div>
            <div className="flex flex-col gap-0.5">
              {event.fights.filter((f) => f.id !== fight.id).map((f) => (
                <div key={f.id} className="text-xs break-words" style={{ color: "var(--text-secondary)" }}>
                  {f.red.name} vs {f.blue.name}
                  {f.weightClass ? <span style={{ color: "var(--text-muted)" }}> · {f.weightClass}</span> : null}
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <CalendarButtons event={calendarEvent} reminderTemplate={reminderLinkTemplate} onClose={onClose} />

        {showExternal ? (
          <button
            type="button"
            onClick={() => { openExternal(event.eventUrl!); onClose(); }}
            className="mt-4 w-full py-2 rounded-lg text-sm font-medium cursor-pointer"
            style={{ background: "var(--accent)", color: "white" }}
          >
            {externalNoun}
          </button>
        ) : null}
        {/* Lichess has no results-hiding mode — buildChessEventUrl links the
            live round when it can, but a board already finished within that
            round still shows its result there. Say so rather than promise a
            clean page (A7). */}
        {showExternal && event.kind === "chess" ? (
          <p className="mt-2 text-[11px] text-center" style={{ color: "var(--text-muted)" }}>
            Lichess shows results of finished boards.
          </p>
        ) : null}
      </div>
    </div>
  );
}
