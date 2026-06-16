"use client";

import { useEffect, useState } from "react";
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

// All 12 World Cup groups in one spoiler-safe overlay: the DRAW only (which
// teams are in each group). Teams are listed ALPHABETICALLY — never by
// standing/points — so it reveals nothing about who's winning or advancing.
// Sourced from ESPN's fifa.world standings endpoint, from which we take only
// the team name + flag and drop every standings field.
export default function WorldCupGroupsModal({ onClose }: { onClose: () => void }) {
  const [groups, setGroups] = useState<WcGroup[] | null>(null);
  const [failed, setFailed] = useState(false);

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

  // "A to L (12)" once loaded (strip the "Group " prefix off the first/last
  // group names); just the plain title while loading.
  const range =
    groups && groups.length
      ? ` ${groups[0].name.replace(/^group\s*/i, "")} to ${groups[groups.length - 1].name.replace(/^group\s*/i, "")} (${groups.length})`
      : "";

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
          ⚽ World Cup — Groups{range}
        </h2>

        {failed ? (
          <p className="text-xs py-6 text-center" style={{ color: "var(--text-muted)" }}>
            Couldn&rsquo;t load groups right now.
          </p>
        ) : !groups ? (
          <p className="text-xs py-6 text-center" style={{ color: "var(--text-muted)" }}>
            Loading groups&hellip;
          </p>
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
                    <li key={t.name} className="flex items-center gap-1.5 min-w-0">
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
          </p>
        ) : null}
      </div>
    </div>
  );
}
