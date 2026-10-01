"use client";

import { useEffect, useRef, type ReactNode } from "react";
import type { Sport } from "@/lib/types";
import { LeagueMark } from "./LeagueMark";
import { trackEvent } from "@/lib/track";

export interface LeaguePickerOption {
  sport: Sport;
  label: string;
  offseason?: boolean;
}

// The league pill sheet. Two callers share one look (Jacob 9/29: "a nice modal
// popup that we already built"):
// - "multi": the first-run "Pick your leagues" sheet. Tap order numbers the
//   pills, "Use defaults" / "Show N leagues" confirm.
// - "single": a column switcher's "Add more…". One tap switches that column
//   and closes. A "Show offseason leagues" toggle sits in the footer, so the
//   in-season leagues lead and the offseason ones are one tap away.
export function LeaguePickerModal({
  title,
  subtitle,
  options,
  mode,
  selected,
  max = Infinity,
  onPick,
  onConfirm,
  onClose,
  showOffseason,
  onToggleOffseason,
  demoLabels,
  shownElsewhere,
  trackPrefix,
}: {
  title: string;
  subtitle?: ReactNode;
  options: LeaguePickerOption[];
  mode: "multi" | "single";
  // multi: the picks in tap order. single: the league already in the column.
  selected: Sport[];
  // multi only: how many pills can be on at once.
  max?: number;
  onPick: (sport: Sport) => void;
  // multi only: the confirm button.
  onConfirm?: () => void;
  // Escape, the backdrop, and the left button (multi "Use defaults", single
  // "Cancel").
  onClose: () => void;
  // single only: offseason pills draw only while this is on.
  showOffseason?: boolean;
  onToggleOffseason?: () => void;
  // ?demo=1&picker=1 anonymized labels + logos (see demoMode.ts); null = real.
  demoLabels?: Map<string, { label: string; logo: string }> | null;
  // single only: leagues in the other columns, tagged "· col N" like the
  // dropdown rows.
  shownElsewhere?: { sport: Sport; col: number }[];
  // Umami events `<prefix>-shown`, then one of -done / -defaults / -backdrop /
  // -escape (2026-10-01). Shown minus those = left with the sheet open.
  // Unset = no events.
  trackPrefix?: string;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef(trackPrefix);
  const trackedShownRef = useRef(false);
  // trackEvent retries for ~5 s: the deferred tracker can load after the
  // sheet opens, and the drop-off count depends on the "shown" event.
  const track = (what: string, data?: Record<string, string>) => {
    if (trackRef.current) trackEvent(`${trackRef.current}-${what}`, data, 100);
  };
  // The ref guard keeps React's dev double-mount from counting one open twice.
  useEffect(() => {
    if (trackedShownRef.current || !trackRef.current) return;
    trackedShownRef.current = true;
    trackEvent(`${trackRef.current}-shown`);
  }, []);
  const multi = mode === "multi";
  const titleId = multi ? "league-picker-title" : "league-add-more-title";
  // The column's own league stays even when offseason, so the sheet always
  // shows where you are.
  const shown = multi || showOffseason ? options : options.filter((o) => !o.offseason || selected.includes(o.sport));

  // Escape closes the sheet too — same as tapping its backdrop. Brings it in
  // line with the ratings/news explainers and every other modal in the app,
  // which all dismiss on Escape. This effect also locks body scroll and seats
  // focus into the dialog while it's open — the same treatment the ratings/news
  // explainers (and every other modal) already get, which the first-run picker
  // was the last overlay still missing (it had role="dialog"/aria-modal +
  // Escape but never pinned the feed behind it or moved focus off the trigger).
  // The sheet mounts only while open, so mount/unmount is open/close.
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (trackRef.current) trackEvent(`${trackRef.current}-escape`);
        onCloseRef.current();
        return;
      }
      // Trap Tab within the dialog (WCAG 2.4.3) — same wrap-at-first/last pattern
      // as the ratings/news explainers and GameDetailModal. Without it a keyboard
      // user could Tab off the last league pill into the inert feed behind the
      // overlay. Focusables queried live so the disabled (3-picked) pills and any
      // hidden control are excluded (offsetParent drops display:none).
      if (e.key !== "Tab") return;
      const dialog = dialogRef.current;
      if (!dialog) return;
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
    window.addEventListener("keydown", onKey);
    // Lock body scroll (position:fixed + negative top pins iOS WebKit too, where
    // plain overflow:hidden leaks the feed behind the overlay); restore returns
    // you exactly where you were.
    const scrollY = window.scrollY;
    const body = document.body;
    const prevBody = {
      overflow: body.style.overflow,
      position: body.style.position,
      top: body.style.top,
      width: body.style.width,
    };
    body.style.overflow = "hidden";
    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.width = "100%";
    // Focus management (WCAG 2.4.3): move focus into the dialog (the tabIndex=-1
    // container, so no ring shows for mouse users) and restore it to the opener
    // on close.
    const opener = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    return () => {
      window.removeEventListener("keydown", onKey);
      body.style.overflow = prevBody.overflow;
      body.style.position = prevBody.position;
      body.style.top = prevBody.top;
      body.style.width = prevBody.width;
      window.scrollTo(0, scrollY);
      opener?.focus?.();
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => { track("backdrop"); onClose(); }}>
      <div className="absolute inset-0 bg-black/50" />
      <div
        ref={dialogRef}
        // tabIndex=-1 makes the container programmatically focusable (see the
        // focus-management effect) without joining the tab order; outline
        // none suppresses the ring since it's focused only to seat SR focus.
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        // Capped to the viewport (the backdrop's p-4 is the 2rem) and laid
        // out as a column so the league grid — not the dialog — absorbs the
        // overflow. Without this the modal simply grew past a short window
        // and, because the backdrop is a non-scrolling fixed layer, the
        // "Use defaults" / confirm row below was unreachable: Escape or a
        // backdrop click were the only ways out (Jacob 8/23, small Firefox
        // window). Worse on desktop than phone, since pickerMax = slotCount
        // offers five slots and a longer list on a wide viewport.
        className="relative rounded-xl p-5 max-w-sm w-full shadow-xl flex flex-col max-h-[calc(100dvh-2rem)]"
        style={{ background: "var(--bg)", border: "2px solid var(--accent)", outline: "none" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* The H mark welcomes a first visit; Add more… opens mid-session and
            spends that height on pills instead. */}
        {multi && (
          <div className="flex justify-center mb-2 shrink-0">
            <svg className="w-9 h-9" viewBox="0 0 32 32" fill="none" aria-hidden>
              <rect width="32" height="32" rx="6" className="header-logo-bg" />
              <text x="16" y="22" textAnchor="middle" fontSize="16" fontWeight="700" fontFamily="system-ui" className="header-logo-text">H</text>
            </svg>
          </div>
        )}
        <h3 id={titleId} className="font-bold text-lg mb-1 text-center" style={{ color: "var(--text)" }}>{title}</h3>
        {subtitle && (
          <p className="text-sm mb-4 text-center" style={{ color: "var(--text-secondary)" }}>
            {subtitle}
          </p>
        )}
        {/* Popularity-ordered, soccer grouped at the bottom (pickerOptions).
            Two rules keep this list STILL while you tap through it, which is
            the whole complaint (Jacob 8/9): nothing re-sorts on selection,
            and the order badge lives in a fixed-width slot that is present
            (blank) on every pill — the old `1. ` prefix grew the pill on
            click, which reflowed the wrap and made unrelated pills jump. */}
        {/* The only scrolling part: min-h-0 lets this flex child shrink
            below its content height (without it the grid keeps its natural
            size and the cap above does nothing), and the negative-margin /
            padding pair keeps the pills' focus rings from being clipped by
            the new overflow box. */}
        <div className={`flex flex-wrap justify-center gap-2 mb-4 overflow-y-auto min-h-0 -mx-1 px-1${subtitle ? "" : " mt-3"}`}>
          {shown.map((o) => {
            const idx = selected.indexOf(o.sport);
            const on = idx >= 0;
            const demoOption = demoLabels?.get(o.sport);
            // Single mode: the column's own league is marked, never filled —
            // a filled pill reads as "picked", and nothing is picked until a tap.
            const current = !multi && on;
            const elsewhere = multi || current ? undefined : shownElsewhere?.find((e) => e.sport === o.sport);
            const full = multi && selected.length >= max && !on;
            return (
              <button
                key={o.sport}
                type="button"
                disabled={full}
                onClick={() => onPick(o.sport)}
                // Multi-select toggle: expose the picked state to assistive
                // tech, since it's otherwise conveyed only by the accent
                // background (and a "1. " number prefix). Matches the
                // aria-pressed pattern every other toggle pill in the app
                // already uses (view tabs, the news reveal/text-post pills,
                // the World Cup groups band/day pills) — this picker was the
                // lone group missing it.
                aria-pressed={multi ? on : undefined}
                aria-current={current ? "true" : undefined}
                className="inline-flex items-center gap-1.5 pl-2 pr-3 py-1.5 rounded-full text-sm font-medium transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                style={multi && on
                  ? { background: "var(--accent)", color: "white", border: "1px solid var(--accent)" }
                  : {
                      background: "var(--bg-card)",
                      color: current ? "var(--accent)" : !multi && o.offseason ? "var(--text-muted)" : "var(--text)",
                      border: `1px solid ${current ? "var(--accent)" : "var(--border)"}`,
                    }}
              >
                {/* Fixed 1rem slot, reserved whether or not this pill is
                    picked, so selecting one never changes any pill's width. */}
                <span aria-hidden className="inline-block w-4 shrink-0 text-center text-xs font-bold tabular-nums">
                  {multi && on ? idx + 1 : ""}
                </span>
                {/* The mark always sits on a white chip. Most of these are
                    dark-on-transparent, so on the accent-blue selected fill
                    they'd disappear; knocking them to solid white instead
                    turned filled marks (MLB) into a featureless blob. The
                    chip keeps every logo legible and identical in both
                    states, so selecting a pill changes only its background. */}
                <LeagueMark sport={o.sport} size={16} src={demoOption?.logo} plate />
                <span>{demoOption?.label ?? o.label}</span>
                {/* Start dates dropped here on purpose (Jacob 8/9): six
                    "· starts Aug 21" tails made the grid unreadable and are
                    noise at signup. The kickoff banner still announces them
                    and the column switcher still shows them. "offseason"
                    stays — that one changes whether the column has games. */}
                {o.offseason && <em className="font-normal text-xs" style={{ color: multi && on ? "inherit" : "var(--text-muted)" }}>offseason</em>}
                {elsewhere && <em className="font-normal text-xs" style={{ color: "var(--text-muted)" }}>· col {elsewhere.col}</em>}
              </button>
            );
          })}
        </div>
        {multi ? (
          <div className="flex gap-2 shrink-0">
            <button
              type="button"
              onClick={() => { track("defaults"); onClose(); }}
              className="flex-1 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer"
              style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text)" }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--accent)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border)"; }}
            >
              Use defaults
            </button>
            <button
              type="button"
              onClick={() => {
                track("done", { picks: String(selected.length), leagues: selected.join(",").slice(0, 100) });
                onConfirm?.();
              }}
              className="flex-1 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer"
              style={{ background: "var(--accent)", color: "white" }}
              onMouseEnter={(e) => { e.currentTarget.style.filter = "brightness(1.15)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.filter = "none"; }}
            >
              {selected.length ? `Show ${selected.length} league${selected.length > 1 ? "s" : ""}` : "Done"}
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-2 shrink-0">
            {/* Off by default so the sheet opens on leagues with games; the
                choice is saved (showOffseasonInPicker) so it opens the way
                you left it. */}
            <button
              type="button"
              onClick={onToggleOffseason}
              aria-pressed={!!showOffseason}
              className="px-3 py-1.5 rounded-full text-xs font-medium transition-colors cursor-pointer"
              style={showOffseason
                ? { background: "var(--accent)", color: "white", border: "1px solid var(--accent)" }
                : { background: "var(--bg-card)", color: "var(--text)", border: "1px solid var(--border)" }}
            >
              Show offseason leagues
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer"
              style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text)" }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--accent)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border)"; }}
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
