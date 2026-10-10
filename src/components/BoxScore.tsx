"use client";

import { useEffect, useRef, useState } from "react";
import type { Game, Sport } from "@/lib/types";
import { fetchBoxScore, type BoxScore as BoxScoreData, type BoxScoreGroup } from "@/lib/boxscore";
import { handleExternalClick } from "@/lib/openExternal";

// Periods before overtime, for the line-score headers. MLB just counts innings.
const REGULATION: Partial<Record<Sport, number>> = {
  nba: 4, wnba: 4, ncaaw: 4, ncaam: 2, nfl: 4, ncaaf: 4, nhl: 3,
};

function periodLabels(sport: Sport, count: number, isPlayoff: boolean): string[] {
  const reg = REGULATION[sport];
  return Array.from({ length: count }, (_, i) => {
    if (!reg || i < reg) return String(i + 1);
    // NHL regular season: one OT, then the shootout. Playoffs go 2OT, 3OT…
    if (sport === "nhl" && !isPlayoff && i === reg + 1) return "SO";
    const ot = i - reg + 1;
    return ot === 1 ? "OT" : `${ot}OT`;
  });
}

const cell = "px-1.5 py-1 text-right whitespace-nowrap";
const nameCell = "px-1.5 py-1 text-left whitespace-nowrap sticky sticky-nolip left-0 z-[1]";

// Each table scrolls sideways on its own (sticky name column), so the line
// score and the team tabs never slide out of view on a phone.
function StatTable({ group, label }: { group: BoxScoreGroup; label: string }) {
  return (
    <div className="overflow-x-auto">
    <table className="w-full text-xs tabular-nums border-collapse" aria-label={label}>
      <thead>
        <tr style={{ color: "var(--text-muted)" }}>
          <th scope="col" className={`${nameCell} font-semibold`} style={{ background: "var(--bg)" }}>{group.title}</th>
          {group.labels.map((l, i) => <th key={i} scope="col" className={`${cell} font-medium`}>{l}</th>)}
        </tr>
      </thead>
      <tbody style={{ color: "var(--text)" }}>
        {group.rows.map((r, i) => (
          <tr key={i} style={{ borderTop: "1px solid var(--border)" }}>
            <th scope="row" className={`${nameCell} font-normal`} style={{ background: "var(--bg)" }}>{r.name}</th>
            {r.stats.map((s, j) => <td key={j} className={cell}>{s}</td>)}
          </tr>
        ))}
        {group.totals ? (
          <tr className="font-semibold" style={{ borderTop: "1px solid var(--border)" }}>
            <th scope="row" className={nameCell} style={{ background: "var(--bg)" }}>Team</th>
            {group.totals.map((s, j) => <td key={j} className={cell}>{s}</td>)}
          </tr>
        ) : null}
      </tbody>
    </table>
    </div>
  );
}

// The box score itself, shown in the details popup only after the user passed
// the warning (BoxScoreDialog). It fetches on mount, so nothing about the score
// reaches the page before that tap.
export default function BoxScore({ game, espnUrl }: { game: Game; espnUrl: string }) {
  const [state, setState] = useState<{ box: BoxScoreData | null; status: "loading" | "ok" | "error" }>({ box: null, status: "loading" });
  const [tab, setTab] = useState(0);
  const regionRef = useRef<HTMLDivElement>(null);

  // The Box score button that opened this is gone, so seat focus here.
  useEffect(() => { regionRef.current?.focus(); }, []);

  // One fetch per open, one more when a live game goes final, and every 30 s
  // while it is live (the cache entry turns over at the same rate). A failed
  // refresh keeps the last good box score; "Try again" bumps `attempt`.
  const { id, sport, state: gameState } = game;
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    const load = () => fetchBoxScore({ id, sport, state: gameState })
      .then((box) => { if (!cancelled) setState((prev) => (box ? { box, status: "ok" } : prev.box ? prev : { box: null, status: "error" })); })
      .catch(() => { if (!cancelled) setState((prev) => (prev.box ? prev : { box: null, status: "error" })); });
    load();
    const timer = gameState === "in" ? window.setInterval(load, 30_000) : undefined;
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [id, sport, gameState, attempt]);

  const espnLink = (text: string) => (
    <a
      href={espnUrl}
      target="_blank"
      rel="noopener noreferrer"
      onClick={handleExternalClick(espnUrl)}
      className="underline underline-offset-2 hover:opacity-80 transition-opacity"
      style={{ color: "var(--accent)" }}
    >
      {text}
    </a>
  );

  const box = state.box;
  const isMlb = game.sport === "mlb";
  const periods = box ? Math.max(...box.teams.map((t) => t.lineScore.length)) : 0;
  const labels = periodLabels(game.sport, periods, game.isPlayoff);

  return (
    <div ref={regionRef} tabIndex={-1} className="mt-4" style={{ outline: "none" }} role="region" aria-label="Box score" data-testid="box-score">
      {state.status === "loading" ? (
        <div className="text-sm py-2" style={{ color: "var(--text-muted)" }}>Loading box score…</div>
      ) : !box ? (
        <div className="text-sm py-2" style={{ color: "var(--text-muted)" }}>
          Box score not available — {espnLink("open ESPN")}
          {" · "}
          <button
            type="button"
            onClick={() => { setState({ box: null, status: "loading" }); setAttempt((n) => n + 1); }}
            className="underline underline-offset-2 cursor-pointer"
            style={{ color: "var(--accent)" }}
          >
            Try again
          </button>
        </div>
      ) : (
        <>
          <div className="max-h-[55dvh] overflow-y-auto overscroll-contain">
            <div className="overflow-x-auto mb-3">
            <table className="w-full text-xs tabular-nums border-collapse" aria-label="Line score">
              <thead>
                <tr style={{ color: "var(--text-muted)" }}>
                  <th scope="col" className={nameCell} style={{ background: "var(--bg)" }}><span className="sr-only">Team</span></th>
                  {labels.map((l, i) => <th key={i} scope="col" className={`${cell} font-medium`}>{l}</th>)}
                  <th scope="col" className={`${cell} font-semibold`}>{isMlb ? "R" : "T"}</th>
                  {isMlb ? <><th scope="col" className={`${cell} font-semibold`}>H</th><th scope="col" className={`${cell} font-semibold`}>E</th></> : null}
                </tr>
              </thead>
              <tbody style={{ color: "var(--text)" }}>
                {box.teams.map((t) => (
                  <tr key={t.abbr} style={{ borderTop: "1px solid var(--border)" }}>
                    <th scope="row" className={`${nameCell} font-semibold`} style={{ background: "var(--bg)" }}>{t.abbr}</th>
                    {labels.map((_, i) => <td key={i} className={cell}>{t.lineScore[i] ?? ""}</td>)}
                    <td className={`${cell} font-semibold`}>{t.total}</td>
                    {isMlb ? <><td className={cell}>{t.hits ?? ""}</td><td className={cell}>{t.errors ?? ""}</td></> : null}
                  </tr>
                ))}
              </tbody>
            </table>
            </div>

            {box.teams.some((t) => t.groups.length) ? (
              <>
                <div className="flex gap-1 mb-2" role="group" aria-label="Team">
                  {box.teams.map((t, i) => (
                    <button
                      key={t.abbr}
                      type="button"
                      aria-pressed={tab === i}
                      onClick={() => setTab(i)}
                      className="flex-1 py-1 rounded-md text-xs font-semibold cursor-pointer"
                      style={tab === i
                        ? { background: "var(--accent)", color: "white" }
                        : { background: "var(--bg-card-hover)", color: "var(--text)" }}
                    >
                      {t.name}
                    </button>
                  ))}
                </div>
                <div className="space-y-3">
                  {box.teams[tab]?.groups.map((g, i) => (
                    <StatTable key={`${tab}-${i}`} group={g} label={`${box.teams[tab].name} ${g.title}`} />
                  ))}
                </div>
              </>
            ) : null}
          </div>
          <div className="text-xs mt-2" style={{ color: "var(--text-muted)" }}>
            {espnLink("Full box score on ESPN ↗")}
          </div>
        </>
      )}
    </div>
  );
}
