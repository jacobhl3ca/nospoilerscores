"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { fifaRank } from "@/lib/fifaRankings";
import { getTimeZone } from "@/lib/etDay";

interface GroupTeam {
  name: string;
  flag: string;
  rank: number | null;
}
interface WcGroup {
  name: string;
  teams: GroupTeam[];
}

type View = "groups" | "ranked";
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
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

// YYYYMMDD for an offset in days, in the app's effective time zone (Settings →
// Time zone) — matches how the rest of the app buckets ESPN by calendar day.
function etDate(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return new Intl.DateTimeFormat("en-CA", { timeZone: getTimeZone(), year: "numeric", month: "2-digit", day: "2-digit" })
    .format(d)
    .replace(/-/g, "");
}

function loadView(): View {
  if (typeof window === "undefined") return "groups";
  try {
    return window.localStorage.getItem(VIEW_KEY) === "ranked" ? "ranked" : "groups";
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
export default function WorldCupGroupsModal({ onClose }: { onClose: () => void }) {
  const [groups, setGroups] = useState<WcGroup[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [view, setView] = useState<View>(() => loadView());
  const [band, setBand] = useState<Band>(() => loadBand());
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
    setView(v);
    try { window.localStorage.setItem(VIEW_KEY, v); } catch {}
  };
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
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    const ctrl = new AbortController();
    (async () => {
      try {
        const r = await fetch(
          "https://site.api.espn.com/apis/v2/sports/soccer/fifa.world/standings",
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
              // spoiler-safe while reading like a seeding. Unranked teams last.
              .sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999));
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
            `https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?dates=${etDate(def.offset)}`,
            { signal: ctrl.signal },
          );
          if (!r.ok) continue;
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
  const title =
    view === "ranked"
      ? band === "top"
        ? "⚽ World Cup — Top 10 by FIFA ranking"
        : band === "bottom"
          ? "⚽ World Cup — Bottom 10 by FIFA ranking"
          : `⚽ World Cup — By FIFA ranking${ranked.length ? ` (${ranked.length})` : ""}`
      : `⚽ World Cup — Groups${range}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50" />
      <div
        className="relative rounded-xl p-4 sm:p-5 w-full max-w-3xl max-h-[85vh] overflow-y-auto shadow-xl"
        style={{ background: "var(--bg)", border: "1px solid var(--border)" }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="World Cup groups"
      >
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute top-3 right-3 text-lg leading-none cursor-pointer"
          style={{ color: "var(--text-muted)" }}
        >
          ✕
        </button>
        <h2 className="text-base sm:text-lg font-bold mb-3 pr-6" style={{ color: "var(--text)" }}>
          {title}
        </h2>

        {groups ? (
          <div className="mb-3 space-y-2">
            {/* Row 1: view toggle · country search (center) · top/bottom band filter */}
            <div className="flex items-center gap-3 flex-wrap">
              <div className="inline-flex rounded-lg overflow-hidden shrink-0" style={{ border: "1px solid var(--border)" }}>
                {([
                  { v: "groups" as View, label: "Groups" },
                  { v: "ranked" as View, label: "Ranked" },
                ]).map((o) => {
                  const active = view === o.v;
                  return (
                    <button
                      key={o.v}
                      onClick={() => changeView(o.v)}
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
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Highlight a country…"
                aria-label="Highlight a country"
                className="flex-1 min-w-[7rem] text-xs rounded-lg px-2.5 py-1.5 outline-none"
                style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text)" }}
              />
              {/* Top/Bottom 10 narrows the ranked list to that band — meaningful
                  only there, so it's hidden in the grouped view. Mutually
                  exclusive: tap the active one again to clear back to all. */}
              {view === "ranked" ? (
                <div className="flex items-center gap-2 flex-wrap shrink-0">
                  {([
                    { key: "top" as Band, label: "Top 10", color: "rgb(34,197,94)" },
                    { key: "bottom" as Band, label: "Bottom 10", color: "rgb(239,68,68)" },
                  ]).map((o) => {
                    const active = band === o.key;
                    return (
                      <button
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
            </div>
            {/* Row 2: highlight teams playing on a given day */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>Playing:</span>
              {DAY_DEFS.map((def) => {
                const active = days[def.key];
                return (
                  <button
                    key={def.key}
                    onClick={() => selectDay(def.key)}
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
          </div>
        ) : null}

        {failed ? (
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
                  <img src={t.flag} alt="" width={16} height={16} className="w-4 h-4 object-contain shrink-0" draggable={false} />
                ) : (
                  <span className="w-4 h-4 shrink-0" />
                )}
                <span className="text-xs truncate flex-1" style={{ color: "var(--text)" }}>{t.name}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
            {groups.map((g) => (
              <div
                key={g.name}
                className="rounded-lg p-2"
                style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
              >
                <div className="text-[11px] font-bold uppercase tracking-wide mb-1.5" style={{ color: "var(--text)" }}>
                  {g.name}
                </div>
                <ul className="flex flex-col gap-1">
                  {g.teams.map((t) => (
                    <li key={t.name} className="flex items-center gap-1.5 min-w-0 rounded px-1 py-0.5" style={rowStyle(t.name)}>
                      {t.flag ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={t.flag} alt="" width={16} height={16} className="w-4 h-4 object-contain shrink-0" draggable={false} />
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
            ))}
          </div>
        )}
        {groups ? (
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
    </div>
  );
}
