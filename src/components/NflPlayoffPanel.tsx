"use client";

import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { useHideRanks } from "@/components/HideRanksContext";
import {
  NFL_CLINCH_TEXT,
  NFL_PLAYOFF_DATES,
  fetchNflPicture,
  wildCardPairings,
  type NflConference,
  type NflPicture,
  type NflTeam,
} from "@/lib/nflPlayoffPicture";

// The NFL playoff panel for /nfl-playoff-picture and /nfl-standings (added
// 2026-10-07). Same shape as PlayoffPictureModal's `variant="page"`: a live
// panel straight under the h1, no cover, no board, so no first-run league
// picker. Three tabs: Seeds (7 per conference + in the hunt), Divisions (all
// eight), Bracket (Wild Card pairings, then where each later seat comes from).
// No Picks tab and no results: the Bracket never reads a game, so nothing past
// the seeds can tell a viewer on delay who won.
//
// Data and rules: lib/nflPlayoffPicture. Records only, never points.

export type NflTab = "seeds" | "divisions" | "bracket";
const TABS: { key: NflTab; label: string }[] = [
  { key: "seeds", label: "Seeds" },
  { key: "divisions", label: "Divisions" },
  { key: "bracket", label: "Bracket" },
];

const muted = { color: "var(--text-muted)" };
const card = { background: "var(--bg-card)", border: "1px solid var(--border)" };

function Logo({ t, size = 18 }: { t: NflTeam; size?: number }) {
  if (!t.logo) return <span style={{ width: size }} className="shrink-0" />;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={t.logo}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      className="object-contain shrink-0"
      style={{ width: size, height: size }}
      draggable={false}
      onError={(e) => { e.currentTarget.style.display = "none"; }}
    />
  );
}

function ClinchTag({ t }: { t: NflTeam }) {
  if (!t.clinch || t.clinch === "eliminated") return null;
  return (
    <span className="text-[10px] shrink-0" style={{ color: "var(--accent)" }} title={NFL_CLINCH_TEXT[t.clinch]}>
      {NFL_CLINCH_TEXT[t.clinch]}
    </span>
  );
}

function SeedsTable({ conf }: { conf: NflConference }) {
  const hideRanks = useHideRanks();
  return (
    <section data-nfl-conference={conf.key} aria-label={`${conf.key} seeds`}>
      <h3 className="text-sm font-bold mb-1.5" style={{ color: "var(--text)" }}>{conf.key}</h3>
      <table className="w-full text-xs tabular-nums" style={{ borderCollapse: "collapse" }}>
        <thead>
          <tr style={muted}>
            <th className="text-left font-semibold py-1 w-8">Seed</th>
            <th className="text-left font-semibold py-1">Team</th>
            <th className="text-right font-semibold py-1 w-14">W-L</th>
          </tr>
        </thead>
        <tbody>
          {conf.seeds.map((t, i) => (
            <tr
              key={t.id}
              data-nfl-seed={t.seed ?? ""}
              style={{ borderTop: i === 4 ? "1px dashed var(--border-hover)" : "1px solid var(--border)" }}
            >
              <td className="py-1.5 font-bold">{hideRanks ? null : t.seed}</td>
              <td className="py-1.5">
                <span className="flex items-center gap-1.5 min-w-0">
                  <Logo t={t} />
                  <span className="font-semibold truncate" style={{ color: "var(--text)" }}>{t.name}</span>
                  {t.seed === 1 ? <span className="text-[10px] shrink-0" style={muted}>bye</span> : null}
                  {t.seed && t.seed <= 4 ? <span className="text-[10px] shrink-0 hidden sm:inline" style={muted}>{t.division}</span> : null}
                  <ClinchTag t={t} />
                </span>
              </td>
              <td className="py-1.5 text-right">{t.record}</td>
            </tr>
          ))}
          {conf.hunt.length ? (
            <tr>
              <td colSpan={3} className="pt-3 pb-1 text-[10px] uppercase tracking-wide" style={muted}>In the hunt</td>
            </tr>
          ) : null}
          {conf.hunt.map((t) => (
            <tr key={t.id} data-nfl-hunt="" style={{ borderTop: "1px solid var(--border)" }}>
              <td className="py-1" style={muted}>&ndash;</td>
              <td className="py-1">
                <span className="flex items-center gap-1.5 min-w-0">
                  <Logo t={t} size={14} />
                  <span className="truncate" style={{ color: "var(--text-body)" }}>{t.name}</span>
                </span>
              </td>
              <td className="py-1 text-right" style={muted}>{t.record}</td>
            </tr>
          ))}
          {conf.out.length ? (
            <tr>
              <td colSpan={3} className="pt-3 pb-1 text-[10px]" style={{ ...muted, opacity: 0.75 }}>
                Out: {conf.out.map((t) => t.abbrev).join(", ")}
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </section>
  );
}

function DivisionTable({ name, teams }: { name: string; teams: NflTeam[] }) {
  const hideRanks = useHideRanks();
  return (
    <section data-nfl-division={name} aria-label={name}>
      <h3 className="text-xs font-bold mb-1" style={{ color: "var(--text)" }}>{name}</h3>
      <table className="w-full text-xs tabular-nums" style={{ borderCollapse: "collapse" }}>
        <thead>
          <tr style={muted}>
            <th className="text-left font-semibold py-0.5">Team</th>
            <th className="text-right font-semibold py-0.5 w-12">W-L</th>
            <th className="text-right font-semibold py-0.5 w-12">Pct</th>
            <th className="text-right font-semibold py-0.5 w-10">GB</th>
          </tr>
        </thead>
        <tbody>
          {teams.map((t) => (
            <tr key={t.id} data-nfl-division-team="" style={{ borderTop: "1px solid var(--border)" }}>
              <td className="py-1">
                <span className="flex items-center gap-1.5 min-w-0">
                  <Logo t={t} size={16} />
                  <span className="truncate font-semibold" style={{ color: "var(--text)" }}>{t.name}</span>
                  {t.seed && !hideRanks ? <span className="text-[10px] shrink-0" style={muted}>#{t.seed}</span> : null}
                </span>
              </td>
              <td className="py-1 text-right">{t.record}</td>
              <td className="py-1 text-right" style={muted}>{t.pct.toFixed(3).replace(/^0/, "")}</td>
              <td className="py-1 text-right" style={muted}>{t.gamesBack}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function Seat({ team, label }: { team: NflTeam | null; label: string }) {
  const hideRanks = useHideRanks();
  if (!team) {
    return (
      <div className="flex items-center px-2 h-[28px] text-[10px] italic" style={{ ...muted, opacity: 0.8 }}>{label}</div>
    );
  }
  return (
    <div data-nfl-bracket-team="" className="flex items-center gap-1.5 px-2 h-[28px]" title={team.name}>
      <span className="text-[10px] font-bold w-2.5 shrink-0" style={muted}>{hideRanks ? null : team.seed}</span>
      <Logo t={team} />
      <span className="text-[11px] font-bold" style={{ color: "var(--text)" }}>{team.abbrev}</span>
    </div>
  );
}

function Matchup({ top, bottom, topLabel, bottomLabel }: { top: NflTeam | null; bottom: NflTeam | null; topLabel: string; bottomLabel: string }) {
  return (
    <div className="rounded-lg py-0.5 w-[132px]" style={card}>
      <Seat team={top} label={topLabel} />
      <div className="mx-2 h-px" style={{ background: "var(--border)", opacity: 0.6 }} />
      <Seat team={bottom} label={bottomLabel} />
    </div>
  );
}

function RoundHead({ title, dates }: { title: string; dates?: string }) {
  return (
    <div className="h-[34px] text-center">
      <div className="text-[10px] font-bold uppercase tracking-wide leading-tight" style={{ color: "var(--text)" }}>{title}</div>
      {dates ? <div data-nfl-bracket-dates className="text-[9px] leading-tight" style={muted}>{dates}</div> : null}
    </div>
  );
}

function ConferenceBracket({ conf, season }: { conf: NflConference; season: number | null }) {
  const dates = season != null ? NFL_PLAYOFF_DATES[season] : undefined;
  const pairs = wildCardPairings(conf);
  const one = conf.seeds[0] ?? null;
  return (
    <div data-nfl-bracket={conf.key} className="flex items-stretch gap-2 shrink-0">
      <div className="flex flex-col">
        <RoundHead title={`${conf.key} Wild Card`} dates={dates?.wildCard} />
        <div className="flex-1 flex flex-col justify-around gap-2">
          {pairs.map((m) => (
            <Matchup key={m.homeLabel} top={m.home} bottom={m.away} topLabel={m.homeLabel} bottomLabel={m.awayLabel} />
          ))}
        </div>
      </div>
      <div className="flex flex-col">
        <RoundHead title="Divisional" dates={dates?.divisional} />
        <div className="flex-1 flex flex-col justify-around gap-2">
          <Matchup top={one} bottom={null} topLabel="Seed 1" bottomLabel="Lowest seed left" />
          <Matchup top={null} bottom={null} topLabel="Wild Card winner" bottomLabel="Wild Card winner" />
        </div>
      </div>
      <div className="flex flex-col">
        <RoundHead title={`${conf.key} Championship`} dates={dates?.conference} />
        <div className="flex-1 flex flex-col justify-center">
          <Matchup top={null} bottom={null} topLabel="Divisional winner" bottomLabel="Divisional winner" />
        </div>
      </div>
    </div>
  );
}

function BracketView({ picture }: { picture: NflPicture }) {
  const [afc, nfc] = picture.conferences;
  const dates = picture.season != null ? NFL_PLAYOFF_DATES[picture.season] : undefined;
  return (
    <div>
      <div className="overflow-x-auto pb-1" tabIndex={0} role="group" aria-label="NFL playoff bracket">
        <div className="flex flex-col items-center gap-4 w-max mx-auto xl:flex-row xl:items-stretch xl:gap-3">
          <ConferenceBracket conf={afc} season={picture.season} />
          <div className="flex flex-col shrink-0">
            <RoundHead title={dates?.superBowlName ?? "Super Bowl"} dates={dates ? `${dates.superBowl}, ${dates.superBowlVenue}` : undefined} />
            <div className="flex-1 flex flex-col justify-center">
              <Matchup top={null} bottom={null} topLabel="AFC champion" bottomLabel="NFC champion" />
            </div>
          </div>
          <ConferenceBracket conf={nfc} season={picture.season} />
        </div>
      </div>
      <p className="text-[10px] text-center mt-3 m-0" style={{ ...muted, opacity: 0.8 }}>
        If the season ended today. Seed 1 has a bye; the Divisional round reseeds, so seed 1 hosts the lowest seed left.
      </p>
    </div>
  );
}

export default function NflPlayoffPanel({ initialTab = "seeds" }: { initialTab?: NflTab }) {
  const [picture, setPicture] = useState<NflPicture | null>(null);
  const [failed, setFailed] = useState(false);
  const [tab, setTab] = useState<NflTab>(initialTab);
  const tablistRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    (async () => {
      try {
        const p = await fetchNflPicture(ctrl.signal);
        if (ctrl.signal.aborted) return;
        if (!p) { setFailed(true); return; }
        setPicture(p);
      } catch {
        if (!ctrl.signal.aborted) setFailed(true);
      }
    })();
    return () => ctrl.abort();
  }, []);

  const onTabKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const i = TABS.findIndex((t) => t.key === tab);
    const next = TABS[(i + (e.key === "ArrowRight" ? 1 : TABS.length - 1)) % TABS.length].key;
    setTab(next);
    tablistRef.current?.querySelector<HTMLButtonElement>(`#nfl-picture-tab-${next}`)?.focus();
  };

  return (
    <div
      className="relative rounded-xl p-4 sm:p-5 w-full"
      style={{ background: "var(--bg)", border: "1px solid var(--border)" }}
      role="region"
      aria-label="NFL playoff picture"
      data-nfl-panel=""
    >
      <h2 className="text-base sm:text-lg font-bold mb-2" style={{ color: "var(--text)" }}>
        🏈 NFL — Playoff picture{picture?.season ? ` ${picture.season}` : ""}
      </h2>
      <div ref={tablistRef} role="tablist" aria-label="NFL playoff view" className="flex items-center gap-1 mb-3" onKeyDown={onTabKeyDown}>
        {TABS.map((t) => {
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              role="tab"
              id={`nfl-picture-tab-${t.key}`}
              aria-selected={active}
              aria-controls={`nfl-picture-panel-${t.key}`}
              tabIndex={active ? 0 : -1}
              onClick={() => setTab(t.key)}
              className="text-xs px-2.5 py-1 rounded-full cursor-pointer"
              style={{
                background: active ? "var(--bg-card)" : "transparent",
                color: active ? "var(--text)" : "var(--text-muted)",
                border: `1px solid ${active ? "var(--border-hover)" : "var(--border)"}`,
              }}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {failed ? (
        <p role="status" aria-live="polite" className="text-xs py-6 text-center" style={muted}>
          Couldn&rsquo;t load the NFL standings right now.
        </p>
      ) : !picture ? (
        <p role="status" aria-live="polite" className="text-xs py-6 text-center" style={muted}>
          Loading the NFL playoff picture&hellip;
        </p>
      ) : (
        <>
          <div data-nfl-body role="tabpanel" id={`nfl-picture-panel-${tab}`} aria-labelledby={`nfl-picture-tab-${tab}`}>
            {tab === "seeds" ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {picture.conferences.map((c) => <SeedsTable key={c.key} conf={c} />)}
              </div>
            ) : tab === "divisions" ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-5 gap-y-4">
                {picture.conferences.map((c) => (
                  <div key={c.key} className="space-y-4">
                    {c.divisions.map((d) => <DivisionTable key={d.name} name={d.name} teams={d.teams} />)}
                  </div>
                ))}
              </div>
            ) : (
              <BracketView picture={picture} />
            )}
          </div>
          <p data-nfl-footer className="text-[10px] mt-3 m-0" style={{ ...muted, opacity: 0.75 }}>
            {picture.weeksPlayed < 1
              ? "Before Week 1: every club is 0-0, so this order is a placeholder."
              : "Seeds 1–4 are the division leaders, 5–7 the wild cards. Ties use the NFL tiebreakers ESPN applies."}{" "}
            Records only: no points, no scores. Scores stay hidden on the board.
          </p>
        </>
      )}
    </div>
  );
}
