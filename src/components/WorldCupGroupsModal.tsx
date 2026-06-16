"use client";

import { useEffect, useMemo, useState } from "react";
import { fifaRank } from "@/lib/fifaRankings";

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

// View + highlight choices stick across opens (and reloads) via localStorage —
// the same lightweight pattern the app uses for its other view prefs. Top and
// bottom highlight are independent toggles. Defaults preserve the original
// behavior: grouped view, no highlighting.
const VIEW_KEY = "wc-groups-view";
const HL_TOP_KEY = "wc-groups-hl-top";
const HL_BOTTOM_KEY = "wc-groups-hl-bottom";

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

// Subtle tints for the top-10 (green) / bottom-10 (red) FIFA-ranked teams, with
// an inset bar on the left edge. Semi-transparent so they read on either theme.
const TOP_BG = "rgba(34,197,94,0.16)";
const TOP_BAR = "inset 2px 0 0 rgba(34,197,94,0.9)";
const BOTTOM_BG = "rgba(239,68,68,0.14)";
const BOTTOM_BAR = "inset 2px 0 0 rgba(239,68,68,0.85)";

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
  const [hlTop, setHlTop] = useState<boolean>(() => loadFlag(HL_TOP_KEY));
  const [hlBottom, setHlBottom] = useState<boolean>(() => loadFlag(HL_BOTTOM_KEY));

  const changeView = (v: View) => {
    setView(v);
    try { window.localStorage.setItem(VIEW_KEY, v); } catch {}
  };
  const changeHlTop = (v: boolean) => {
    setHlTop(v);
    try { window.localStorage.setItem(HL_TOP_KEY, v ? "1" : "0"); } catch {}
  };
  const changeHlBottom = (v: boolean) => {
    setHlBottom(v);
    try { window.localStorage.setItem(HL_BOTTOM_KEY, v ? "1" : "0"); } catch {}
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

  const rowStyle = (name: string): React.CSSProperties => {
    if (hlTop && topNames.has(name)) return { background: TOP_BG, boxShadow: TOP_BAR };
    if (hlBottom && bottomNames.has(name)) return { background: BOTTOM_BG, boxShadow: BOTTOM_BAR };
    return {};
  };

  // Groups view: "A to L (12)". Ranked view: total team count.
  const range =
    groups && groups.length
      ? ` ${groups[0].name.replace(/^group\s*/i, "")} to ${groups[groups.length - 1].name.replace(/^group\s*/i, "")} (${groups.length})`
      : "";
  const title =
    view === "ranked"
      ? `⚽ World Cup — By FIFA ranking${ranked.length ? ` (${ranked.length})` : ""}`
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
          <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
            <div className="inline-flex rounded-lg overflow-hidden" style={{ border: "1px solid var(--border)" }}>
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
            <div className="flex items-center gap-3 flex-wrap">
              <label className="flex items-center gap-1.5 text-xs cursor-pointer select-none" style={{ color: "var(--text-muted)" }}>
                <input
                  type="checkbox"
                  checked={hlTop}
                  onChange={(e) => changeHlTop(e.target.checked)}
                  className="cursor-pointer"
                  style={{ accentColor: "rgb(34,197,94)" }}
                />
                <span className="inline-block w-2 h-2 rounded-sm" style={{ background: "rgb(34,197,94)" }} />
                Top 10
              </label>
              <label className="flex items-center gap-1.5 text-xs cursor-pointer select-none" style={{ color: "var(--text-muted)" }}>
                <input
                  type="checkbox"
                  checked={hlBottom}
                  onChange={(e) => changeHlBottom(e.target.checked)}
                  className="cursor-pointer"
                  style={{ accentColor: "rgb(239,68,68)" }}
                />
                <span className="inline-block w-2 h-2 rounded-sm" style={{ background: "rgb(239,68,68)" }} />
                Bottom 10
              </label>
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
          // keeps a single team row from splitting across a column boundary.
          <div className="columns-2 sm:columns-3 lg:columns-4 gap-2">
            {ranked.map((t) => (
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
            {hlTop && hlBottom
              ? " Green = strongest 10, red = weakest 10 by that ranking."
              : hlTop
                ? " Green = strongest 10 by that ranking."
                : hlBottom
                  ? " Red = weakest 10 by that ranking."
                  : ""}
          </p>
        ) : null}
      </div>
    </div>
  );
}
