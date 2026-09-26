"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { fifaRank } from "@/lib/fifaRankings";
import { getEtServiceDate, toYmd } from "@/lib/etDay";
import WorldCupBracket from "./WorldCupBracket";
import { KNOCKOUT_START_YMD } from "@/lib/wcBracket";

interface GroupTeam {
  name: string;
  flag: string;
  rank: number | null;
}
interface WcGroup {
  name: string;
  teams: GroupTeam[];
}

type View = "groups" | "ranked" | "bracket";
// Ranked view can be narrowed to just the strongest or weakest 10 — a real view
// switch, not an overlay on the full list.
type Band = "all" | "top" | "bottom";

// View + highlight choices stick across opens (and reloads) via localStorage —
// the same lightweight pattern the app uses for its other view prefs. Defaults
// preserve the original behavior: grouped view, no filtering.
const VIEW_KEY = "wc-groups-view";
const HL_TOP_KEY = "wc-groups-hl-top";       // legacy toggle — migrated into BAND_KEY
const HL_BOTTOM_KEY = "wc-groups-hl-bottom"; // legacy toggle — migrated into BAND_KEY
const BAND_KEY = "wc-groups-band";           // "all" | "top" | "bottom"
const DAY_KEY_PREFIX = "wc-groups-day-";
const BRACKET_WARN_KEY = "wc-bracket-spoiler-warning-seen";

// The "Playing:" day pills highlight teams with a fixture on that day. SPOILER-
// SAFE: we read ONLY team names off the scoreboard (never scores/status), and a
// fixture date is public schedule info, not a result.
const DAY_DEFS = [
  { key: "yesterday", label: "Yesterday", offset: -1 },
  { key: "today", label: "Today", offset: 0 },
  { key: "tomorrow", label: "Tomorrow", offset: 1 },
] as const;
type DayKey = (typeof DAY_DEFS)[number]["key"];

// Lowercase + strip diacritics so ESPN's standings/scoreboard names and the
// search box all compare on the same key (Türkiye, Curaçao, …).
function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    // Fold curly apostrophes (’ U+2019, ‘ U+2018) to the straight ASCII
    // ' — NFD leaves them untouched, and ESPN's fifa.world feed sends the
    // typographic ’ that "Côte d'Ivoire" renders with, so a user typing a
    // plain apostrophe ("cote d'ivoire") produced q="…'…" that n.includes(q)
    // couldn't find in the curly-quoted row name, silently failing the search
    // highlight for that nation. Mirrors the same fold in fifaRankings.fifaRank
    // and youtube.ts; a straight-apostrophe or apostrophe-free name is
    // unaffected, and applying it to both sides keeps the day-fixture pairing
    // (which also runs through norm) consistent.
    .replace(/[‘’]/g, "'")
    .toLowerCase()
    .trim();
}

// YYYYMMDD for an offset in days off the app's canonical "service day" — the
// same 1 AM-rollover boundary getEtServiceDate gives the date nav and the data
// layer (see etDay.ts). Deriving from that single source keeps the "Playing:
// Today" pill and the knockout/Bracket-tab gate on the same slate as the board
// the user is looking at; a raw new Date() drifts a day between local midnight
// and 1 AM, before the service day rolls over.
function etDate(offsetDays: number): string {
  const d = getEtServiceDate();
  d.setDate(d.getDate() + offsetDays);
  return toYmd(d);
}

function loadView(): View {
  if (typeof window === "undefined") return "groups";
  try {
    const v = window.localStorage.getItem(VIEW_KEY);
    return v === "bracket" || v === "ranked" ? v : "groups";
  } catch {
    return "groups";
  }
}
function loadFlag(key: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}
function loadBand(): Band {
  if (typeof window === "undefined") return "all";
  try {
    const v = window.localStorage.getItem(BAND_KEY);
    if (v === "top" || v === "bottom" || v === "all") return v;
    // Migrate the old independent top/bottom highlight toggles: if exactly one
    // was on, adopt it as the band; otherwise show everything.
    const top = window.localStorage.getItem(HL_TOP_KEY) === "1";
    const bottom = window.localStorage.getItem(HL_BOTTOM_KEY) === "1";
    if (top && !bottom) return "top";
    if (bottom && !top) return "bottom";
    return "all";
  } catch {
    return "all";
  }
}

const FIND_BG = "rgba(234,179,8,0.22)";   // amber — the country you searched
const FIND_BAR = "inset 2px 0 0 rgba(234,179,8,0.95)";

// One distinct color per match on the selected day(s): both teams in a fixture
// share a color, so you can see who plays whom at a glance — even when they sit
// far apart in the ranked list. Ordered for high contrast between adjacent
// matches; cycles if a day has more fixtures than colors. Amber is reserved for
// search, so it's deliberately left out.
const PAIR_PALETTE: Array<{ bg: string; bar: string }> = [
  { bg: "rgba(59,130,246,0.22)", bar: "inset 2px 0 0 rgba(59,130,246,0.95)" },  // blue
  { bg: "rgba(249,115,22,0.22)", bar: "inset 2px 0 0 rgba(249,115,22,0.95)" },  // orange
  { bg: "rgba(34,197,94,0.22)", bar: "inset 2px 0 0 rgba(34,197,94,0.95)" },    // green
  { bg: "rgba(236,72,153,0.24)", bar: "inset 2px 0 0 rgba(236,72,153,0.95)" },  // pink
  { bg: "rgba(168,85,247,0.24)", bar: "inset 2px 0 0 rgba(168,85,247,0.95)" },  // purple
  { bg: "rgba(20,184,166,0.22)", bar: "inset 2px 0 0 rgba(20,184,166,0.95)" },  // teal
  { bg: "rgba(239,68,68,0.20)", bar: "inset 2px 0 0 rgba(239,68,68,0.95)" },    // red
  { bg: "rgba(6,182,212,0.22)", bar: "inset 2px 0 0 rgba(6,182,212,0.95)" },    // cyan
];

// All 12 World Cup groups in one spoiler-safe overlay: the DRAW only (which
// teams are in each group). Within a group, teams are ordered by FIFA world
// ranking — a fixed pre-tournament fact, NOT the live standing — so it reveals
// nothing about who's winning or advancing. "Ranked" view flattens the same
// teams into one raw list by that ranking. Sourced from ESPN's fifa.world
// standings endpoint, from which we take only the team name + flag and drop
// every standings field.
export default function WorldCupGroupsModal({ onClose, highlightGroup, selectedDate }: { onClose: () => void; highlightGroup?: string | null; selectedDate?: string }) {
  // Once the knockout stage is under way, the bracket is the headline view — so
  // offer the Bracket tab and default to it (unless we were opened to spotlight
  // a specific group, which forces the grouped view). Date-gated so we don't add
  // an empty Bracket tab during the group stage. See lib/wcBracket.
  const knockoutActive = etDate(0) >= KNOCKOUT_START_YMD;
  const [groups, setGroups] = useState<WcGroup[] | null>(null);
  const [failed, setFailed] = useState(false);
  // A specific group to spotlight (tapped from a game card) forces the grouped
  // view so the group is visible, regardless of the saved view pref.
  const [view, setView] = useState<View>(() => (highlightGroup ? "groups" : knockoutActive ? "bracket" : loadView()));
  const [band, setBand] = useState<Band>(() => loadBand());
  const [showBracketExplainer, setShowBracketExplainer] = useState(() => !highlightGroup && knockoutActive && !loadFlag(BRACKET_WARN_KEY));
  // The spotlit group's card — scrolled into view once the grid renders.
  const hlCardRef = useRef<HTMLDivElement | null>(null);
  // The dialog container — focused on open for keyboard/SR users (see below).
  const dialogRef = useRef<HTMLDivElement | null>(null);
  // The nested bracket-spoiler confirm — focused + trapped on its own while up,
  // since it renders OUTSIDE dialogRef and the main trap steps aside for it.
  const explainerRef = useRef<HTMLDivElement | null>(null);
  // Mirror the explainer-open state into a ref so the empty-dep focus-trap effect
  // can read the latest value without re-subscribing. While the bracket-spoiler
  // explainer is up the Tab trap steps aside — that nested dialog renders its own
  // Cancel / Show buttons OUTSIDE this container (see the effect below).
  const explainerOpenRef = useRef(showBracketExplainer);
  explainerOpenRef.current = showBracketExplainer;
  const [query, setQuery] = useState("");
  // Single-select: at most one day active at a time. If an older multi-select
  // state is persisted, collapse to one (today wins, else the first enabled).
  const [days, setDays] = useState<Record<DayKey, boolean>>(() => {
    const on = DAY_DEFS.filter((d) => loadFlag(DAY_KEY_PREFIX + d.key)).map((d) => d.key);
    const pick: DayKey | null = on.includes("today") ? "today" : on[0] ?? null;
    return { yesterday: pick === "yesterday", today: pick === "today", tomorrow: pick === "tomorrow" };
  });
  // The fixtures on each enabled day, as team-name PAIRS (spoiler-safe: names
  // only). Fetched lazily and deduped via fetchedDays so toggling on/off doesn't
  // refetch. Each pair gets its own color in the list (see pairColor).
  const [dayMatches, setDayMatches] = useState<Partial<Record<DayKey, Array<[string, string]>>>>({});
  const fetchedDays = useRef<Set<DayKey>>(new Set());

  const changeView = (v: View) => {
    if (v === "bracket" && !loadFlag(BRACKET_WARN_KEY)) {
      setShowBracketExplainer(true);
      return;
    }
    setView(v);
    try { window.localStorage.setItem(VIEW_KEY, v); } catch {}
  };
  const confirmBracket = () => {
    setShowBracketExplainer(false);
    try { window.localStorage.setItem(BRACKET_WARN_KEY, "1"); } catch {}
    setView("bracket");
    try { window.localStorage.setItem(VIEW_KEY, "bracket"); } catch {}
  };
  const cancelBracket = () => {
    setShowBracketExplainer(false);
    if (view === "bracket" && !loadFlag(BRACKET_WARN_KEY)) {
      setView("groups");
      try { window.localStorage.setItem(VIEW_KEY, "groups"); } catch {}
    }
  };
  // Mirror cancelBracket into a ref so the empty-dep Escape effect below always
  // calls the latest one (it reads the current `view`) without re-subscribing.
  const cancelBracketRef = useRef(cancelBracket);
  cancelBracketRef.current = cancelBracket;
  const changeBand = (b: Band) => {
    setBand(b);
    try { window.localStorage.setItem(BAND_KEY, b); } catch {}
  };
  // Pick one day at a time (yesterday | today | tomorrow); tapping the active one
  // again clears it. Persist all three so an old multi-select state is cleaned up.
  const selectDay = (key: DayKey) => {
    setDays((prev) => {
      const turnOff = prev[key];
      const next: Record<DayKey, boolean> = { yesterday: false, today: false, tomorrow: false };
      if (!turnOff) next[key] = true;
      try {
        for (const def of DAY_DEFS) window.localStorage.setItem(DAY_KEY_PREFIX + def.key, next[def.key] ? "1" : "0");
      } catch {}
      return next;
    });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // While the bracket-spoiler confirm is up, Escape backs out of just that
      // dialog — matching its backdrop click (cancelBracket) — instead of
      // closing the whole World Cup overlay. Before this, Escape called onClose
      // unconditionally, so the two dismiss paths disagreed.
      if (explainerOpenRef.current) cancelBracketRef.current();
      else onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Focus management (WCAG 2.4.3): move focus into the dialog on open so
  // keyboard / screen-reader users land inside the overlay instead of being
  // stranded on the page behind it, and restore focus to the opener on close.
  // Focusing the dialog CONTAINER (tabIndex=-1) rather than a control keeps mouse
  // users from seeing a focus ring while still handing the dialog + its aria-label
  // to assistive tech; the first Tab then reaches the close button. preventScroll
  // keeps the container's own scroll (and the spotlight scroll-into-view below)
  // undisturbed. The modal mounts fresh per open (parent guards it behind
  // `groupsOpen &&`), so this fires on every open/close — matching GameDetailModal.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    dialog?.focus({ preventScroll: true });
    // Trap Tab within the dialog (WCAG 2.4.3) — same pattern GameDetailModal /
    // SettingsPanel adopted. aria-modal only marks the page behind inert for
    // assistive tech; it does NOT stop a sighted keyboard user from Tabbing out
    // of the overlay into the scores/news behind it. Wrap focus at the first/last
    // focusable control so Tab / Shift+Tab cycle inside the dialog. Focusables are
    // queried live per keypress (so the async-loaded groups grid / bracket controls
    // are included) and offsetParent-filtered so focus never lands on a hidden
    // (display:none) control. Suspended while the bracket-spoiler explainer is up —
    // that nested dialog renders its Cancel / Show buttons OUTSIDE this container,
    // so trapping here would put them out of Tab reach.
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Tab" || !dialog || explainerOpenRef.current) return;
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

  // Focus management for the nested bracket-spoiler confirm (WCAG 2.4.3). It's a
  // modal dialog rendered OUTSIDE dialogRef, so the main trap above steps aside
  // while it's up (explainerOpenRef) — leaving it, uniquely among the app's
  // dialogs, with no focus handling at all: focus stayed on the Bracket tab
  // behind the dim and Tab walked the group/search controls the warning exists
  // to gate. Give it its own trap: seat focus on open, cycle Tab between its
  // Cancel / Show buttons, and restore focus to the opener on close. Escape is
  // handled by the effect above (it cancels the explainer). Runs only on the
  // showBracketExplainer edge so it can't steal focus back on every render.
  useEffect(() => {
    if (!showBracketExplainer) return;
    const opener = document.activeElement as HTMLElement | null;
    const box = explainerRef.current;
    box?.focus({ preventScroll: true });
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Tab" || !box) return;
      const focusable = Array.from(
        box.querySelectorAll<HTMLElement>('button:not([disabled])')
      ).filter((el) => el.offsetParent !== null);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (e.shiftKey) {
        if (active === first || active === box) { e.preventDefault(); last.focus(); }
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
  }, [showBracketExplainer]);

  // When opened to spotlight a group, scroll its card into view — it can sit
  // below the fold in the 12-group grid. Wait a tick for the grid to render.
  useEffect(() => {
    if (!highlightGroup || view !== "groups" || !groups) return;
    const t = setTimeout(() => hlCardRef.current?.scrollIntoView({ block: "center", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" }), 60);
    return () => clearTimeout(t);
  }, [highlightGroup, view, groups]);

  useEffect(() => {
    const ctrl = new AbortController();
    (async () => {
      try {
        const r = await fetch(
          // site.web.api, NOT site.api — see the BASE_URL note in espn.ts.
          "https://site.web.api.espn.com/apis/v2/sports/soccer/fifa.world/standings",
          { signal: ctrl.signal },
        );
        if (!r.ok) throw new Error("bad status");
        const d = await r.json();
        const children: Array<{ name?: string; abbreviation?: string; standings?: { entries?: Array<{ team?: { displayName?: string; name?: string; logos?: Array<{ href?: string }>; logo?: string } }> } }> =
          d.children ?? [];
        const parsed: WcGroup[] = children
          .map((g) => {
            const entries = g.standings?.entries ?? [];
            const teams: GroupTeam[] = entries
              .map((e) => {
                const t = e.team ?? {};
                const name = t.displayName ?? t.name ?? "";
                return { name, flag: t.logos?.[0]?.href ?? t.logo ?? "", rank: fifaRank(name) };
              })
              .filter((t) => t.name)
              // Order by FIFA world ranking (strongest first) — a fixed
              // pre-tournament fact, NOT the live group standing, so it stays
              // spoiler-safe while reading like a seeding. Unranked teams last,
              // broken ALPHABETICALLY: ESPN's standings endpoint hands entries
              // back in LIVE group order, so two teams that both miss a FIFA
              // rank (a normalizer gap, a late rename) would otherwise keep that
              // order under the stable sort — leaking who's currently ahead in
              // the group, the exact spoiler this ordering exists to avoid.
              .sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999) || a.name.localeCompare(b.name));
            return { name: g.name ?? g.abbreviation ?? "", teams };
          })
          .filter((g) => g.teams.length)
          .sort((a, b) => a.name.localeCompare(b.name));
        if (!ctrl.signal.aborted) {
          if (parsed.length) setGroups(parsed);
          else setFailed(true);
        }
      } catch {
        if (!ctrl.signal.aborted) setFailed(true);
      }
    })();
    return () => ctrl.abort();
  }, []);

  // Lazily fetch the fixture list for any enabled day. We read ONLY the team
  // names off the scoreboard — never scores or status — so this stays spoiler-
  // safe (see DAY_DEFS). Each day is fetched at most once per open.
  useEffect(() => {
    const ctrl = new AbortController();
    (async () => {
      for (const def of DAY_DEFS) {
        if (!days[def.key] || fetchedDays.current.has(def.key)) continue;
        fetchedDays.current.add(def.key);
        try {
          const r = await fetch(
            // site.web.api, NOT site.api — see the BASE_URL note in espn.ts.
            `https://site.web.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?dates=${etDate(def.offset)}`,
            { signal: ctrl.signal },
          );
          // A transient HTTP error (ESPN 503/429/500) must be retryable on a
          // later toggle, exactly like the network/JSON failure the catch below
          // recovers. The day was marked fetched BEFORE the request (above), so
          // without un-marking it here the `fetchedDays.has` guard at the top of
          // the loop would block every re-fetch and leave this day's fixtures
          // blank for the whole modal session even after the endpoint recovers.
          if (!r.ok) { fetchedDays.current.delete(def.key); continue; }
          const d = await r.json();
          // Collect each fixture as a [teamA, teamB] pair of normalized names.
          const matches: Array<[string, string]> = [];
          for (const ev of d.events ?? []) {
            for (const comp of ev.competitions ?? []) {
              const pair: string[] = [];
              for (const c of comp.competitors ?? []) {
                const n = c.team?.displayName ?? c.team?.name;
                if (n) pair.push(norm(n));
              }
              if (pair.length === 2) matches.push([pair[0], pair[1]]);
            }
          }
          if (!ctrl.signal.aborted) setDayMatches((prev) => ({ ...prev, [def.key]: matches }));
        } catch {
          // Allow a retry on a later toggle if this fetch failed.
          fetchedDays.current.delete(def.key);
        }
      }
    })();
    return () => ctrl.abort();
  }, [days]);

  // Flat list across all groups + which FIFA-ranked teams fall in the top 10 /
  // bottom 10. "ranked" = every team sorted by FIFA ranking (the raw list view);
  // unranked teams (e.g. playoff slots still TBD) sort last, alphabetically.
  const { ranked, topNames, bottomNames } = useMemo(() => {
    const all: Array<{ name: string; flag: string; rank: number | null; group: string }> = [];
    for (const g of groups ?? []) {
      for (const t of g.teams) all.push({ ...t, group: g.name });
    }
    const withRank = all
      .filter((t) => t.rank != null)
      .sort((a, b) => (a.rank as number) - (b.rank as number));
    const withoutRank = all
      .filter((t) => t.rank == null)
      .sort((a, b) => a.name.localeCompare(b.name));

    const top = new Set(withRank.slice(0, 10).map((t) => t.name));
    // Guard the bottom slice so it can't overlap the top when few teams are
    // ranked (early in qualification): start no earlier than index 10.
    const bottomStart = Math.max(10, withRank.length - 10);
    const bottom = new Set(withRank.slice(bottomStart).map((t) => t.name));

    return { ranked: [...withRank, ...withoutRank], topNames: top, bottomNames: bottom };
  }, [groups]);

  const q = norm(query);
  const anyDay = days.yesterday || days.today || days.tomorrow;

  // Map every team playing on a selected day to its match's color index. Both
  // teams in a fixture get the same index, so a pair reads as a pair. Colors are
  // handed out per match across the enabled days; if a team plays on more than
  // one selected day, the later day wins (rare within a 3-day window).
  const pairColor = useMemo(() => {
    const map = new Map<string, number>();
    let i = 0;
    for (const def of DAY_DEFS) {
      if (!days[def.key]) continue;
      for (const [a, b] of dayMatches[def.key] ?? []) {
        const c = i % PAIR_PALETTE.length;
        map.set(a, c);
        map.set(b, c);
        i++;
      }
    }
    return map;
  }, [days, dayMatches]);

  // Most specific highlight wins: an explicit search, then the color of the
  // match this team is playing on a selected day.
  const rowStyle = (name: string): React.CSSProperties => {
    const n = norm(name);
    if (q && n.includes(q)) return { background: FIND_BG, boxShadow: FIND_BAR };
    const c = pairColor.get(n);
    if (c != null) return { background: PAIR_PALETTE[c].bg, boxShadow: PAIR_PALETTE[c].bar };
    return {};
  };

  // Top 10 / Bottom 10 SWITCH the ranked list to just that band — a real view
  // change, not an overlay on the full list.
  const rankedShown =
    band === "top" ? ranked.filter((t) => topNames.has(t.name))
    : band === "bottom" ? ranked.filter((t) => bottomNames.has(t.name))
    : ranked;

  // Groups view: "A to L (12)". Ranked view: total team count.
  const range =
    groups && groups.length
      ? ` ${groups[0].name.replace(/^group\s*/i, "")} to ${groups[groups.length - 1].name.replace(/^group\s*/i, "")} (${groups.length})`
      : "";
  // The leading ⚽ is decorative — it's rendered as its own aria-hidden span in
  // the <h2> below so a screen reader reading the heading doesn't announce
  // "soccer ball" before the title. Keep these strings glyph-free; the visible
  // emoji comes from the span. Mirrors how every other decorative emoji in the
  // app is handled (WorldCupMattersCard's ⚽, EventCard's sport glyph, the
  // HomeContent view-tab icons) — this heading was the lone outlier still baking
  // the glyph into spoken text.
  const title =
    view === "bracket"
      ? "World Cup — Bracket"
      : view === "ranked"
        ? band === "top"
          ? "World Cup — Top 10 by FIFA ranking"
          : band === "bottom"
            ? "World Cup — Bottom 10 by FIFA ranking"
            : `World Cup — By FIFA ranking${ranked.length ? ` (${ranked.length})` : ""}`
        : `World Cup — Groups${range}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50" />
      <div
        ref={dialogRef}
        // tabIndex=-1 makes the container programmatically focusable (see the
        // focus-management effect) without adding it to the tab order; outline
        // none suppresses the ring since it's focused only to seat assistive tech.
        tabIndex={-1}
        className={`relative rounded-xl p-4 sm:p-5 w-full ${view === "bracket" ? "max-w-6xl" : "max-w-3xl"} max-h-[85vh] overflow-y-auto shadow-xl`}
        style={{ background: "var(--bg)", border: "1px solid var(--border)", outline: "none" }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        // While the nested bracket-spoiler explainer is up, mark THIS dialog
        // inert to assistive tech so its virtual cursor can't swipe the groups/
        // ranked grid behind the warning. The keyboard Tab-trap already steps
        // aside for the explainer (explainerOpenRef), but aria-modal on the
        // explainer alone doesn't hide this sibling from a screen reader's swipe
        // navigation — two live aria-modal dialogs otherwise stack. The explainer
        // renders OUTSIDE this container and its focus effect seats focus on the
        // explainer box, so hiding this subtree never buries the focused control.
        aria-hidden={showBracketExplainer || undefined}
        // Keep the dialog's accessible name in sync with the view on screen —
        // a static "World Cup groups" mislabels the Bracket view (the default
        // once the knockout stage starts) and the Ranked view for screen readers.
        aria-label={view === "bracket" ? "World Cup bracket" : view === "ranked" ? "World Cup teams by FIFA ranking" : "World Cup groups"}
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
          <span aria-hidden="true">⚽ </span>{title}
        </h2>

        <div className="mb-3 space-y-2">
          {/* Row 1: view toggle (always) · country search + band (groups/ranked only) */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="inline-flex rounded-lg overflow-hidden shrink-0" style={{ border: "1px solid var(--border)" }}>
              {([
                ...(knockoutActive ? [{ v: "bracket" as View, label: "Bracket" }] : []),
                { v: "ranked" as View, label: "Ranked" },
                { v: "groups" as View, label: "Groups" },
              ]).map((o) => {
                const active = view === o.v;
                return (
                  <button
                    type="button"
                    key={o.v}
                    onClick={() => changeView(o.v)}
                    aria-pressed={active}
                    className="text-xs font-medium px-3 py-1 cursor-pointer transition-colors"
                    style={{
                      background: active ? "var(--accent)" : "var(--bg-card)",
                      color: active ? "white" : "var(--text)",
                    }}
                  >
                    {o.label}
                  </button>
                );
              })}
            </div>
            {groups && view !== "bracket" ? (
              <>
                <input
                  id="wc-country-filter"
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Highlight a country…"
                  aria-label="Highlight a country"
                  // This is a live filter — norm(query) re-runs on every
                  // keystroke — not a text field for prose. On mobile, iOS
                  // autocapitalize/autocorrect would rewrite a partial country
                  // name as you type (e.g. "arg" toward Argentina gets
                  // capitalized/"corrected"), silently changing what the filter
                  // matches. Turn all of that off, and disable autofill so name/
                  // address suggestions don't overlay the field. Matches the
                  // "not prose" input hygiene already on the ZIP + feedback
                  // inputs; purely behavioral hints, no visual change.
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  className="basis-full sm:basis-0 sm:flex-1 min-w-0 text-xs rounded-lg px-2.5 py-1.5 outline-none"
                  style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text)", fontFamily: "inherit" }}
                />
                {/* Top/Bottom 10 narrows the ranked list to that band — meaningful
                    only there, so it's hidden in the grouped view. */}
                {view === "ranked" ? (
                  <div className="flex items-center gap-2 flex-wrap shrink-0">
                    {([
                      { key: "top" as Band, label: "Top 10", color: "rgb(34,197,94)" },
                      { key: "bottom" as Band, label: "Bottom 10", color: "rgb(239,68,68)" },
                    ]).map((o) => {
                      const active = band === o.key;
                      return (
                        <button
                          type="button"
                          key={o.key}
                          onClick={() => changeBand(active ? "all" : o.key)}
                          aria-pressed={active}
                          className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full cursor-pointer transition-colors select-none"
                          style={{
                            background: active ? o.color : "var(--bg-card)",
                            color: active ? "white" : "var(--text-muted)",
                            border: `1px solid ${active ? o.color : "var(--border)"}`,
                          }}
                        >
                          <span className="inline-block w-2 h-2 rounded-sm" style={{ background: active ? "white" : o.color }} />
                          {o.label}
                        </button>
                      );
                    })}
                  </div>
                ) : null}
              </>
            ) : null}
          </div>
          {/* Row 2: highlight teams playing on a given day (groups/ranked only) */}
          {groups && view !== "bracket" ? (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>Playing:</span>
              {DAY_DEFS.map((def) => {
                const active = days[def.key];
                return (
                  <button
                    type="button"
                    key={def.key}
                    onClick={() => selectDay(def.key)}
                    aria-pressed={active}
                    className="text-xs px-2.5 py-1 rounded-full cursor-pointer transition-colors"
                    style={{
                      background: active ? "rgb(59,130,246)" : "var(--bg-card)",
                      color: active ? "white" : "var(--text-muted)",
                      border: `1px solid ${active ? "rgb(59,130,246)" : "var(--border)"}`,
                    }}
                  >
                    {def.label}
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>

        {view === "bracket" && !showBracketExplainer ? (
          // Bracket loads its own data live from ESPN (independent of the groups
          // standings fetch), so it renders regardless of the groups state.
          // Gated on the spoiler explainer being dismissed: on the first knockout
          // open we default `view` to "bracket" AND raise the explainer at the
          // same time (see the initial state above), so without this guard the
          // bracket — which reveals who advanced, who was eliminated, and match
          // winners — would mount and paint behind the warning's 50%-opacity dim,
          // leaking the exact result the warning exists to gate. While the
          // explainer is up we fall through to the spoiler-safe groups grid below
          // (names only); Show Bracket clears the explainer and it renders, Cancel
          // flips `view` to "groups". Only the auto-defaulted open hits this — the
          // Bracket-tab path (changeView) never sets view=bracket until confirmed.
          <WorldCupBracket selectedDate={selectedDate} />
        ) : failed ? (
          <p className="text-xs py-6 text-center" style={{ color: "var(--text-muted)" }}>
            Couldn&rsquo;t load groups right now.
          </p>
        ) : !groups ? (
          <p className="text-xs py-6 text-center" style={{ color: "var(--text-muted)" }}>
            Loading groups&hellip;
          </p>
        ) : view === "ranked" ? (
          // One flat list of names, flowing DOWN each column then to the next
          // (columns 1 → 2 → 3). Same column counts as the groups grid so the
          // overlay keeps its size when you switch views. break-inside-avoid
          // keeps a single team row from splitting across a column boundary. The
          // list sits on a lighter card, matching the group cards.
          <div className="rounded-lg p-2 columns-2 sm:columns-3 lg:columns-4 gap-2" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
            {rankedShown.map((t) => (
              <div
                key={t.name}
                className="flex items-center gap-2 min-w-0 rounded px-1.5 py-1 break-inside-avoid"
                style={rowStyle(t.name)}
              >
                <span className="text-[11px] w-7 text-right shrink-0 tabular-nums" style={{ color: t.rank ? "var(--text)" : "var(--text-muted)", opacity: t.rank ? 1 : 0.6 }}>
                  {t.rank ? `#${t.rank}` : "—"}
                </span>
                {t.flag ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={t.flag} alt="" loading="lazy" decoding="async" width={16} height={16} className="w-4 h-4 object-contain shrink-0" draggable={false} onError={(e) => { e.currentTarget.style.display = "none"; }} />
                ) : (
                  <span className="w-4 h-4 shrink-0" />
                )}
                <span className="text-xs truncate flex-1" style={{ color: "var(--text)" }}>{t.name}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
            {groups.map((g) => {
              const spotlight = !!highlightGroup && norm(g.name) === norm(highlightGroup);
              return (
              <div
                key={g.name}
                ref={spotlight ? hlCardRef : undefined}
                className="rounded-lg p-2"
                style={{
                  background: "var(--bg-card)",
                  border: `1px solid ${spotlight ? "rgb(59,130,246)" : "var(--border)"}`,
                  boxShadow: spotlight ? "0 0 0 2px rgba(59,130,246,0.9)" : undefined,
                }}
              >
                <div className="text-[11px] font-bold uppercase tracking-wide mb-1.5" style={{ color: "var(--text)" }}>
                  {g.name}
                </div>
                <ul className="flex flex-col gap-1">
                  {g.teams.map((t) => (
                    <li key={t.name} className="flex items-center gap-1.5 min-w-0 rounded px-1 py-0.5" style={rowStyle(t.name)}>
                      {t.flag ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={t.flag} alt="" loading="lazy" decoding="async" width={16} height={16} className="w-4 h-4 object-contain shrink-0" draggable={false} onError={(e) => { e.currentTarget.style.display = "none"; }} />
                      ) : (
                        <span className="w-4 h-4 shrink-0" />
                      )}
                      <span className="text-xs truncate flex-1" style={{ color: "var(--text-muted)" }}>{t.name}</span>
                      {t.rank ? (
                        <span className="text-[10px] shrink-0 tabular-nums" style={{ color: "var(--text-muted)", opacity: 0.7 }}>#{t.rank}</span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
              );
            })}
          </div>
        )}
        {groups && view !== "bracket" ? (
          <p className="text-[10px] mt-3" style={{ color: "var(--text-muted)", opacity: 0.7 }}>
            #N = FIFA world ranking coming into the tournament — not group position.
            {(() => {
              const parts: string[] = [];
              if (anyDay) parts.push("each color links the two teams in a match");
              if (query.trim()) parts.push("amber = your search");
              if (!parts.length) return "";
              const s = parts.join(", ");
              return ` ${s.charAt(0).toUpperCase()}${s.slice(1)}.`;
            })()}
          </p>
        ) : null}
      </div>
      {showBracketExplainer && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" onClick={(e) => { e.stopPropagation(); cancelBracket(); }}>
          <div className="absolute inset-0 bg-black/50" />
          <div
            ref={explainerRef}
            // tabIndex=-1 makes the container programmatically focusable (see the
            // explainer focus effect) without adding it to the tab order; outline
            // none suppresses the ring since it's focused only to seat assistive tech.
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-labelledby="bracket-explainer-title"
            className="relative rounded-xl p-5 max-w-sm w-full shadow-xl"
            style={{ background: "var(--bg)", border: "2px solid var(--accent)", outline: "none" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-center mb-2">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" role="img" aria-label="warning">
                <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </div>
            <h3 id="bracket-explainer-title" className="font-bold text-base mb-2 text-center" style={{ color: "var(--text)" }}>
              Warning
              <br />
              SPOILER: BRACKET SHOWS WINNERS
            </h3>
            <p className="text-sm mb-4 text-center" style={{ color: "var(--text-secondary)" }}>
              The bracket can show who advanced, who was eliminated, and match winners.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={cancelBracket}
                className="flex-1 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer"
                style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text)" }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--accent)"; e.currentTarget.style.background = "var(--bg-card-hover)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.background = "var(--bg-card)"; }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmBracket}
                className="flex-1 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer"
                style={{ background: "var(--accent)", color: "white" }}
                onMouseEnter={(e) => { e.currentTarget.style.filter = "brightness(1.15)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.filter = "none"; }}
              >
                Show Bracket
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
