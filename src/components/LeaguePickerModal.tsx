"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Sport } from "@/lib/types";
import { LeagueMark } from "./LeagueMark";
import { trackEvent } from "@/lib/track";

export interface LeaguePickerOption {
  sport: Sport;
  label: string;
  offseason?: boolean;
  // false = an opt-in league (not in the switcher by default). The first-run
  // sheet keeps those behind "More leagues".
  defaultInSwitcher?: boolean;
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
  removed,
  hidden,
  onHide,
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
  // single only: leagues taken out of the switcher, newest first. They leave
  // the main grid and sit in a "Previously removed" group at the bottom.
  removed?: Sport[];
  // single only: leagues struck off the catalog (catalogHiddenLeagues). They
  // leave the sheet; "N hidden · Show" lists them in a "Hidden" group.
  hidden?: Sport[];
  // single only: "Edit list" × on a pill. Unset = no Edit list link.
  onHide?: (sport: Sport) => void;
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
  // The first-run sheet opens on the default leagues only (Jacob 10/4: "a
  // shorter list"); "More leagues" adds the opt-in rest after them. A stable
  // split, so the first-screen pills never move, and a picked league stays
  // after "Fewer". No numeric cap: ~10 pills on 10/4, ~11 at most in a year.
  const [expanded, setExpanded] = useState(false);
  const core = options.filter((o) => o.defaultInSwitcher !== false);
  const rest = options.filter((o) => o.defaultInSwitcher === false);
  const canCollapse = multi && core.length > 0 && rest.length > 0;
  // "Previously removed" (Jacob 10/8): its own group, newest first, and
  // drawn whatever the offseason toggle says. It is his own short list, and
  // hiding an entry there would make a removal look lost. The column's own
  // league never moves.
  // "Edit list" and "N hidden · Show" (Jacob 10/8, as in Settings' My
  // leagues): a struck league leaves the sheet, and the Hidden group at the
  // very bottom lists them, offseason or not. Both states live only while the
  // sheet is open.
  const [editing, setEditing] = useState(false);
  const [showHidden, setShowHidden] = useState(false);
  const isStruck = (sport: Sport) => !multi && !selected.includes(sport) && !!hidden?.includes(sport);
  const hiddenOptions = multi ? [] : options.filter((o) => isStruck(o.sport));
  const removedOptions = multi
    ? []
    : (removed ?? []).flatMap((sport) => {
        const o = options.find((x) => x.sport === sport);
        return o && !selected.includes(sport) && !isStruck(sport) ? [o] : [];
      });
  const isRemoved = (sport: Sport) => removedOptions.some((o) => o.sport === sport);
  const shown = multi
    ? (!canCollapse || expanded ? [...core, ...rest] : [...core, ...rest.filter((o) => selected.includes(o.sport))])
    : (showOffseason ? options : options.filter((o) => !o.offseason || selected.includes(o.sport)))
        .filter((o) => !isRemoved(o.sport) && !isStruck(o.sport));

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

  const renderPill = (o: LeaguePickerOption, struck = false) => {
    const idx = selected.indexOf(o.sport);
    const on = idx >= 0;
    const demoOption = demoLabels?.get(o.sport);
    // Single mode: the column's own league is marked, never filled —
    // a filled pill reads as "picked", and nothing is picked until a tap.
    const current = !multi && on;
    const elsewhere = multi || current ? undefined : shownElsewhere?.find((e) => e.sport === o.sport);
    const full = multi && selected.length >= max && !on;
    // Edit mode: a × after each pill, but not on the column's own league or a
    // league on the board (· col N), where a strike would swap a column out
    // (same rule as Remove from list…). A pill-body tap does nothing then.
    const canStrike = editing && !!onHide && !struck && !current && !elsewhere;
    const pill = (
      <button
        key={o.sport}
        type="button"
        disabled={full}
        onClick={() => { if (!editing) onPick(o.sport); }}
        // Multi-select toggle: expose the picked state to assistive
        // tech, since it's otherwise conveyed only by the accent
        // background (and a "1. " number prefix). Matches the
        // aria-pressed pattern every other toggle pill in the app
        // already uses (view tabs, the news reveal/text-post pills,
        // the World Cup groups band/day pills) — this picker was the
        // lone group missing it.
        aria-pressed={multi ? on : undefined}
        aria-current={current ? "true" : undefined}
        // The Settings league chip's look (Jacob 10/1: one chip
        // everywhere): rounded-md, 11px, uppercase name.
        className="inline-flex items-center gap-1.5 pl-1.5 pr-2 py-1 rounded-md text-[11px] font-semibold transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
        style={multi && on
          ? { background: "var(--accent)", color: "white", border: "1px solid var(--accent)" }
          : {
              background: "var(--bg-card)",
              color: current ? "var(--accent)" : !multi && o.offseason ? "var(--text-muted)" : "var(--text)",
              border: `1px solid ${current ? "var(--accent)" : "var(--border)"}`,
              ...(struck ? { opacity: 0.6 } : {}),
              ...(editing ? { cursor: "default" } : {}),
            }}
      >
        {/* Fixed 1rem slot, reserved whether or not this pill is
            picked, so selecting one never changes any pill's width. */}
        {multi && (
          <span aria-hidden className="inline-block w-3 shrink-0 text-center text-[11px] font-bold tabular-nums">
            {on ? idx + 1 : ""}
          </span>
        )}
        {/* No white plate (Jacob 10/1), the same mark as the
            Settings chips: ESPN's dark-theme copy in dark mode and on
            the accent fill, a sport emoji for a league with none. */}
        <LeagueMark sport={o.sport} src={demoOption?.logo} tone={multi && on ? "dark" : "auto"} className="-my-0.5" />
        <span className="uppercase tracking-wide">{demoOption?.label ?? o.label}</span>
        {/* Start dates dropped here on purpose (Jacob 8/9): six
            "· starts Aug 21" tails made the grid unreadable and are
            noise at signup. The kickoff banner still announces them
            and the column switcher still shows them. "offseason"
            stays — that one changes whether the column has games. */}
        {o.offseason && <em className="font-normal text-[11px]" style={{ color: multi && on ? "inherit" : "var(--text-muted)" }}>offseason</em>}
        {elsewhere && <em className="font-normal text-[11px]" style={{ color: "var(--text-muted)" }}>· col {elsewhere.col}</em>}
      </button>
    );
    if (!canStrike) return pill;
    const name = demoOption?.label ?? o.label;
    // The Settings chip's × (SwitcherChip).
    return (
      <span key={o.sport} className="inline-flex items-center">
        {pill}
        <button type="button"
          onClick={() => onHide?.(o.sport)}
          aria-label={`Hide ${name} from this list`}
          title="Hide from this list"
          className="w-5 h-5 -mr-1 flex items-center justify-center rounded-full cursor-pointer hover:opacity-80"
          style={{ color: "var(--text-muted)" }}
        >
          <svg aria-hidden="true" width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="M5 5l14 14M19 5L5 19" /></svg>
        </button>
      </span>
    );
  };
  const groupHeading = (testId: string, text: string) => (
    <div
      data-testid={testId}
      className="basis-full mt-2 pt-2 text-center text-[11px] font-semibold"
      style={{ color: "var(--text-muted)", borderTop: "1px solid var(--border)" }}
    >
      {text}
    </div>
  );

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
        <div data-testid="league-picker-grid" className={`flex flex-wrap justify-center gap-2 mb-4 overflow-y-auto min-h-0 -mx-1 px-1${subtitle ? "" : " mt-3"}`}>
          {shown.map((o) => renderPill(o))}
          {removedOptions.length > 0 && (
            <>
              {/* Full width, so the group starts on its own line under a
                  rule. Pills inside look and tap like the rest. */}
              {groupHeading("league-picker-removed", "Previously removed")}
              {removedOptions.map((o) => renderPill(o))}
            </>
          )}
          {/* Struck leagues, view only and faded. A tap is the normal pick,
              which also takes the league off the struck list. */}
          {showHidden && hiddenOptions.length > 0 && (
            <>
              {groupHeading("league-picker-hidden", "Hidden")}
              {hiddenOptions.map((o) => renderPill(o, true))}
            </>
          )}
          {/* Last in the grid, outline and no mark, like the Settings chip. */}
          {canCollapse && (
            <button
              type="button"
              data-testid="league-picker-more"
              aria-expanded={expanded}
              onClick={() => {
                if (!expanded) track("more");
                setExpanded((v) => !v);
              }}
              className="inline-flex items-center px-2 py-1 rounded-md text-[11px] font-semibold uppercase tracking-wide transition-colors cursor-pointer"
              style={{ background: "var(--bg-card)", color: "var(--text)", border: "1px solid var(--border)" }}
            >
              {expanded ? "Fewer" : "More leagues"}
            </button>
          )}
        </div>
        {/* Settings' My leagues text links (Jacob 10/8). */}
        {!multi && (onHide || hiddenOptions.length > 0) && (
          <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 -mt-2 mb-3 text-xs shrink-0">
            {onHide && (
              <button type="button"
                data-testid="league-picker-edit"
                onClick={() => setEditing((v) => !v)}
                aria-pressed={editing}
                className="underline underline-offset-2 cursor-pointer hover:opacity-80"
                style={{ color: "var(--text-muted)" }}
              >
                {editing ? "Done" : "Edit list"}
              </button>
            )}
            {hiddenOptions.length > 0 && (
              <button type="button"
                data-testid="league-picker-show-hidden"
                onClick={() => setShowHidden((v) => !v)}
                aria-expanded={showHidden}
                className="underline underline-offset-2 cursor-pointer hover:opacity-80"
                style={{ color: "var(--text-muted)" }}
              >
                {showHidden ? "Hide" : `${hiddenOptions.length} hidden · Show`}
              </button>
            )}
          </div>
        )}
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
                track("done", { picks: String(selected.length), leagues: selected.join(",").slice(0, 100), more: expanded ? "1" : "0" });
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
