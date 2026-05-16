"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LeagueData, Sport } from "@/lib/types";
import { fetchSportTeams, SportTeam } from "@/lib/espn";
import {
  Preferences,
  Theme,
  DefaultDateMode,
  DefaultLandingView,
  DefaultRatings,
} from "@/lib/preferences";

interface LeagueOption { sport: Sport; label: string }

interface SettingsPanelProps {
  open: boolean;
  onClose: () => void;
  prefs: Preferences;
  updatePrefs: (update: Partial<Preferences>) => void;
  resolvedTheme: "dark" | "light";
  // All currently-active leagues (so each slot dropdown can offer the full set).
  thirdLeagueOptions: LeagueOption[];
  // Currently-displayed leagues for default-fallback labels in the slot dropdowns.
  displayedLeagues: LeagueData[];
  // Used to map favorited team IDs → display names when the team is in view.
  // Falls back to the raw ID otherwise.
  knownTeams: { id: string; sport: Sport; displayName: string; logo?: string }[];
  onShareFavorites: () => void;
  shareCopied: boolean;
}

const DATE_MODE_OPTIONS: { value: DefaultDateMode; label: string; hint: string }[] = [
  { value: "smart", label: "Smart", hint: "Yesterday before 10:30 AM ET, today after" },
  { value: "yesterday", label: "Yesterday", hint: "Always start on yesterday" },
  { value: "today", label: "Today", hint: "Always start on today" },
];

const LANDING_VIEW_OPTIONS: { value: DefaultLandingView; label: string; hint: string }[] = [
  { value: "remember", label: "Last opened", hint: "Pick up where you left off" },
  { value: "scores", label: "Scores", hint: "Always start on scores" },
  { value: "news", label: "News", hint: "Always start on news (spoilers)" },
];

const DEFAULT_RATINGS_OPTIONS: { value: DefaultRatings; label: string; hint: string }[] = [
  { value: "auto", label: "Auto", hint: "Off in morning, last state after noon ET" },
  { value: "off", label: "Off", hint: "Always start with ratings hidden" },
  { value: "on", label: "On", hint: "Always start with ratings shown" },
];

const THEME_OPTIONS: { value: Theme; label: string }[] = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

const SPORT_LABEL: Record<Sport, string> = {
  mlb: "MLB",
  nba: "NBA",
  ncaam: "NCAAM",
  nfl: "NFL",
  nhl: "NHL",
  golf: "Golf",
  tennis: "Tennis",
  fifa: "FIFA",
  epl: "EPL",
  mls: "MLS",
};

function teamSportFromId(id: string): Sport | null {
  const dash = id.indexOf("-");
  if (dash === -1) return null;
  return id.slice(0, dash) as Sport;
}

export default function SettingsPanel({
  open,
  onClose,
  prefs,
  updatePrefs,
  resolvedTheme,
  thirdLeagueOptions,
  displayedLeagues,
  knownTeams,
  onShareFavorites,
  shareCopied,
}: SettingsPanelProps) {
  const drawerRef = useRef<HTMLDivElement>(null);

  // Esc to close
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  // Lock body scroll while open
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  // Shared per-sport team cache. The TeamPicker writes into this when the
  // user opens a tab / searches; the favorites display reads from it so
  // every favorited team gets a friendly name + logo. On mount we eagerly
  // load sports represented in the persisted favorites list so names appear
  // immediately even before the user interacts with the picker.
  const [teamsBySportCache, setTeamsBySportCache] = useState<Map<Sport, SportTeam[]>>(new Map());
  const [loadingTeamSports, setLoadingTeamSports] = useState<Set<Sport>>(new Set());
  const loadTeamSport = useCallback((sport: Sport) => {
    setTeamsBySportCache((prev) => {
      if (prev.has(sport)) return prev;
      setLoadingTeamSports((ls) => {
        if (ls.has(sport)) return ls;
        const next = new Set(ls);
        next.add(sport);
        return next;
      });
      fetchSportTeams(sport).then((list) => {
        setTeamsBySportCache((p) => {
          const next = new Map(p);
          next.set(sport, list);
          return next;
        });
        setLoadingTeamSports((ls) => {
          if (!ls.has(sport)) return ls;
          const next = new Set(ls);
          next.delete(sport);
          return next;
        });
      });
      return prev;
    });
  }, []);

  // Eagerly fetch teams for sports the user already has favorites in, so the
  // favorites list shows friendly names on settings-open instead of "nba-8".
  // Skip when the picker drawer isn't open (no point fetching ahead of view).
  useEffect(() => {
    if (!open) return;
    const sportsToLoad = new Set<Sport>();
    for (const id of prefs.favoriteTeams) {
      const sport = teamSportFromId(id);
      if (sport) sportsToLoad.add(sport);
    }
    for (const sport of sportsToLoad) loadTeamSport(sport);
  }, [open, prefs.favoriteTeams, loadTeamSport]);

  // Per-slot dropdown options exclude leagues currently in OTHER slots so the
  // user can't pick a duplicate (matches the in-header dropdown behavior).
  const displayedSports = useMemo(
    () => displayedLeagues.map((l) => l.sport),
    [displayedLeagues],
  );
  const slotOptionsFor = (slotIdx: number) => {
    const others = new Set(displayedSports.filter((_, i) => i !== slotIdx));
    return thirdLeagueOptions.filter((o) => !others.has(o.sport));
  };

  const setSlot = (slotIdx: number, sport: Sport | undefined) => {
    if (slotIdx === 0) updatePrefs({ firstLeague: sport });
    else if (slotIdx === 1) updatePrefs({ secondLeague: sport });
    else if (slotIdx === 2) updatePrefs({ thirdLeague: sport });
  };

  const slotValues: (Sport | undefined)[] = [
    prefs.firstLeague,
    prefs.secondLeague,
    prefs.thirdLeague,
  ];

  // Group favorited teams by sport, attaching display name + logo from
  // (a) currently-loaded games (knownTeams) and (b) the picker's per-sport
  // team cache, so favorites get friendly names even when the team isn't
  // playing today. Group order matches displayedLeagues (the main page's
  // column order), so a favorited Tigers row sits in the same lane as the
  // MLB column on the home view.
  const teamsBySport = useMemo(() => {
    const teamLookup = new Map<string, { id: string; displayName: string; logo?: string }>();
    for (const t of knownTeams) teamLookup.set(t.id, t);
    // Picker cache wins as a backup since it's the canonical full team list.
    for (const [, list] of teamsBySportCache) {
      for (const t of list) {
        if (!teamLookup.has(t.id)) {
          teamLookup.set(t.id, { id: t.id, displayName: t.displayName, logo: t.logo });
        }
      }
    }
    const grouped = new Map<Sport, { id: string; displayName: string; logo?: string }[]>();
    for (const id of prefs.favoriteTeams) {
      const sport = teamSportFromId(id);
      if (!sport) continue;
      const known = teamLookup.get(id);
      const entry = {
        id,
        displayName: known?.displayName ?? id,
        logo: known?.logo,
      };
      const arr = grouped.get(sport) ?? [];
      arr.push(entry);
      grouped.set(sport, arr);
    }
    // Reorder to match the main page's column lineup. Sports that are
    // currently displayed go first in column order; remaining sports
    // (favorites whose league isn't on screen today) come after.
    const ordered = new Map<Sport, { id: string; displayName: string; logo?: string }[]>();
    for (const sport of displayedSports) {
      const arr = grouped.get(sport);
      if (arr) {
        ordered.set(sport, arr);
        grouped.delete(sport);
      }
    }
    for (const [sport, arr] of grouped) ordered.set(sport, arr);
    return ordered;
  }, [prefs.favoriteTeams, knownTeams, teamsBySportCache, displayedSports]);

  const removeTeam = (id: string) => {
    updatePrefs({ favoriteTeams: prefs.favoriteTeams.filter((t) => t !== id) });
  };

  const clearTeamsForSport = (sport: Sport) => {
    updatePrefs({
      favoriteTeams: prefs.favoriteTeams.filter((id) => teamSportFromId(id) !== sport),
    });
  };

  const clearAllTeams = () => {
    if (prefs.favoriteTeams.length === 0) return;
    updatePrefs({ favoriteTeams: [] });
  };

  const toggleTeamFavorite = (teamId: string) => {
    if (prefs.favoriteTeams.includes(teamId)) {
      updatePrefs({ favoriteTeams: prefs.favoriteTeams.filter((id) => id !== teamId) });
    } else {
      updatePrefs({ favoriteTeams: [...prefs.favoriteTeams, teamId] });
    }
  };

  const resetAll = () => {
    updatePrefs({
      favoriteLeagues: [],
      favoriteTeams: [],
      theme: "system",
      showRatings: false,
      skipExplainer: false,
      skipNewsExplainer: false,
      showNews: false,
      firstLeague: undefined,
      secondLeague: undefined,
      thirdLeague: undefined,
      newsThirdLeague: undefined,
      defaultDateMode: "smart",
      defaultLandingView: "remember",
      defaultRatings: "auto",
    });
  };

  // Available news col-3 leagues mirror the slot-3 picker but we let it overlap
  // with the scores layout since the news view is independent.
  const newsCol3Options = thirdLeagueOptions;

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60]" aria-modal="true" role="dialog" aria-label="Settings">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 animate-fade-in"
        onClick={onClose}
      />
      {/* Drawer: right-side on md+, full-height sheet on small screens */}
      <div
        ref={drawerRef}
        className="absolute right-0 top-0 bottom-0 w-full sm:max-w-md flex flex-col shadow-2xl"
        style={{
          background: "var(--bg)",
          borderLeft: "1px solid var(--border)",
          paddingTop: "env(safe-area-inset-top)",
          paddingBottom: "env(safe-area-inset-bottom)",
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 py-3"
          style={{ borderBottom: "1px solid var(--border)" }}
        >
          <h2 className="text-base font-bold" style={{ color: "var(--text)" }}>Settings</h2>
          <button
            onClick={onClose}
            aria-label="Close settings"
            className="w-8 h-8 flex items-center justify-center rounded-full transition-colors cursor-pointer"
            style={{ color: "var(--text-muted)" }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-card-hover)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-6">
          {/* Default View */}
          <Section title="Default view">
            <Field label="Landing date" hint="What day to show when you open the app">
              <RadioGroup
                value={prefs.defaultDateMode ?? "smart"}
                options={DATE_MODE_OPTIONS}
                onChange={(v) => updatePrefs({ defaultDateMode: v })}
              />
            </Field>
            <Field label="Landing view" hint="Scores or news on launch">
              <RadioGroup
                value={prefs.defaultLandingView ?? "remember"}
                options={LANDING_VIEW_OPTIONS}
                onChange={(v) => updatePrefs({ defaultLandingView: v })}
              />
            </Field>
            <Field label="Ratings on launch" hint="Show or hide game ratings + best-games sort">
              <RadioGroup
                value={prefs.defaultRatings ?? "auto"}
                options={DEFAULT_RATINGS_OPTIONS}
                onChange={(v) => updatePrefs({ defaultRatings: v })}
              />
            </Field>
          </Section>

          {/* League columns */}
          <Section title="League columns">
            <p className="text-xs mb-2" style={{ color: "var(--text-muted)" }}>
              Pick a league for each slot. <em>Auto</em> uses the in-season default.
            </p>
            {[0, 1, 2].map((idx) => {
              const fallbackLabel = displayedLeagues[idx]?.label ?? "—";
              const value = slotValues[idx];
              return (
                <Field
                  key={idx}
                  label={`Slot ${idx + 1}`}
                  hint={value ? undefined : `Auto · currently ${fallbackLabel}`}
                >
                  <select
                    value={value ?? ""}
                    onChange={(e) => setSlot(idx, e.target.value ? (e.target.value as Sport) : undefined)}
                    className="w-full px-3 py-2 rounded-lg text-sm cursor-pointer"
                    style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text)" }}
                  >
                    <option value="">Auto</option>
                    {slotOptionsFor(idx).map((o) => (
                      <option key={o.sport} value={o.sport}>{o.label}</option>
                    ))}
                  </select>
                </Field>
              );
            })}
          </Section>

          {/* Favorite teams — picker first so adding a team doesn't push the
              picker off-screen, then the favorited-teams readout below. */}
          <Section title="Favorite teams">
            <TeamPicker
              sports={thirdLeagueOptions}
              favorites={prefs.favoriteTeams}
              onToggle={toggleTeamFavorite}
              teamsBySport={teamsBySportCache}
              loadingSports={loadingTeamSports}
              loadSport={loadTeamSport}
            />
            {prefs.favoriteTeams.length === 0 ? (
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                Pick a team above, or tap the star next to a team in any game card.
              </p>
            ) : (
              <>
                {Array.from(teamsBySport.entries()).map(([sport, teams]) => (
                  <div key={sport} className="mb-3">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[11px] uppercase tracking-wide font-semibold" style={{ color: "var(--text-muted)" }}>
                        {SPORT_LABEL[sport] ?? sport}
                      </span>
                      <button
                        onClick={() => clearTeamsForSport(sport)}
                        className="text-[11px] underline underline-offset-2 cursor-pointer hover:opacity-80"
                        style={{ color: "var(--text-muted)" }}
                      >
                        Clear
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {teams.map((t) => (
                        <button
                          key={t.id}
                          onClick={() => removeTeam(t.id)}
                          className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs cursor-pointer transition-opacity hover:opacity-80"
                          style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text)" }}
                          title="Remove from favorites"
                        >
                          {t.logo && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={t.logo} alt="" width={14} height={14} className="w-3.5 h-3.5" />
                          )}
                          <span>{t.displayName}</span>
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--text-muted)" }}>
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                          </svg>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
                <div className="flex items-center justify-between pt-2" style={{ borderTop: "1px solid var(--border)" }}>
                  <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                    {prefs.favoriteTeams.length} total
                  </span>
                  <button
                    onClick={clearAllTeams}
                    className="text-xs underline underline-offset-2 cursor-pointer hover:opacity-80"
                    style={{ color: "var(--text-muted)" }}
                  >
                    Clear all
                  </button>
                </div>
              </>
            )}
          </Section>

          {/* News */}
          <Section title="News">
            <Field label="3rd news column" hint="Default league for the third news column">
              <select
                value={prefs.newsThirdLeague ?? ""}
                onChange={(e) => updatePrefs({ newsThirdLeague: e.target.value ? (e.target.value as Sport) : undefined })}
                className="w-full px-3 py-2 rounded-lg text-sm cursor-pointer"
                style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text)" }}
              >
                <option value="">Top headlines</option>
                {newsCol3Options.map((o) => (
                  <option key={o.sport} value={o.sport}>{o.label}</option>
                ))}
              </select>
            </Field>
          </Section>

          {/* Theme */}
          <Section title="Theme">
            <RadioGroup
              value={prefs.theme}
              options={THEME_OPTIONS}
              onChange={(v) => {
                updatePrefs({ theme: v });
                if (v === "system") {
                  const sys = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
                  document.documentElement.setAttribute("data-theme", sys);
                } else {
                  document.documentElement.setAttribute("data-theme", v);
                }
              }}
            />
            <p className="text-[11px] mt-1.5" style={{ color: "var(--text-muted)" }}>
              Currently rendering: {resolvedTheme}
            </p>
          </Section>

          {/* Onboarding hints */}
          <Section title="Spoiler explainers">
            <ToggleRow
              label="Show ratings explainer"
              hint="Off after first 'Don't show again' confirm"
              checked={!prefs.skipExplainer}
              onChange={(v) => updatePrefs({ skipExplainer: !v })}
            />
            <ToggleRow
              label="Show news warning"
              hint="The 'FULL OF SPOILERS' confirm before opening news"
              checked={!prefs.skipNewsExplainer}
              onChange={(v) => updatePrefs({ skipNewsExplainer: !v })}
            />
          </Section>

          {/* Share & Reset */}
          <Section title="Share & reset">
            <div className="flex flex-col gap-2">
              <button
                onClick={onShareFavorites}
                disabled={prefs.favoriteTeams.length === 0 && prefs.favoriteLeagues.length === 0 && !prefs.firstLeague && !prefs.secondLeague && !prefs.thirdLeague}
                className="w-full py-2 rounded-lg text-sm font-medium cursor-pointer transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                style={{ background: "var(--accent)", color: "white" }}
              >
                {shareCopied ? "Copied!" : "Copy settings link"}
              </button>
              <button
                onClick={() => {
                  if (confirm("Reset all settings to defaults? Favorites will be cleared.")) resetAll();
                }}
                className="w-full py-2 rounded-lg text-sm font-medium cursor-pointer transition-colors"
                style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text)" }}
              >
                Reset to defaults
              </button>
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="text-[11px] uppercase tracking-wide font-semibold mb-2" style={{ color: "var(--text-muted)" }}>
        {title}
      </h3>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1">
        <label className="text-sm font-medium" style={{ color: "var(--text)" }}>{label}</label>
        {hint && <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>{hint}</span>}
      </div>
      {children}
    </div>
  );
}

interface RadioOption<T extends string> { value: T; label: string; hint?: string }
function RadioGroup<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: RadioOption<T>[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="grid grid-cols-3 gap-1.5">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            className="px-2 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-colors text-center"
            style={{
              background: active ? "var(--accent)" : "var(--bg-card)",
              border: `1px solid ${active ? "var(--accent)" : "var(--border)"}`,
              color: active ? "white" : "var(--text)",
            }}
            title={o.hint}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// Always-visible team picker. Sport tab pills sit directly in the Favorite
// teams section; the active tab's team list lazy-loads via fetchSportTeams
// and is cached per-sport in lib/espn.ts so re-selecting a tab is instant.
// Sports without a per-team concept (golf, tennis) are filtered out.
// Cache + loader are hoisted to SettingsPanel so the favorites display can
// also read team names from them (otherwise favorited teams that aren't in
// today's loaded games would show "nba-8" instead of "Atlanta Hawks").
const TEAM_PICKER_SKIP: Sport[] = ["golf", "tennis"];
function TeamPicker({
  sports,
  favorites,
  onToggle,
  teamsBySport,
  loadingSports,
  loadSport,
}: {
  sports: LeagueOption[];
  favorites: string[];
  onToggle: (teamId: string) => void;
  teamsBySport: Map<Sport, SportTeam[]>;
  loadingSports: Set<Sport>;
  loadSport: (sport: Sport) => void;
}) {
  const tabSports = useMemo(
    () => sports.filter((s) => !TEAM_PICKER_SKIP.includes(s.sport)),
    [sports],
  );
  // Start with no league selected — search across all leagues until the user
  // picks one to narrow the list.
  const [activeSport, setActiveSport] = useState<Sport | null>(null);
  const [query, setQuery] = useState("");
  const favSet = useMemo(() => new Set(favorites), [favorites]);
  const trimmedQuery = query.trim().toLowerCase();

  // If the active sport disappears from the active-leagues list (e.g., season
  // ended while the picker was open), clear it back to "nothing selected"
  // instead of jumping to another sport.
  useEffect(() => {
    if (activeSport && !tabSports.some((s) => s.sport === activeSport)) {
      setActiveSport(null);
    }
  }, [tabSports, activeSport]);

  // Fetch the active sport's teams when one is picked.
  useEffect(() => {
    if (!activeSport) return;
    loadSport(activeSport);
  }, [activeSport, loadSport]);

  // Cross-league search: as soon as the user types into search WITHOUT a
  // sport selected, kick off fetches for every available sport in parallel.
  // Results stream in as each promise resolves; lib/espn's per-sport cache
  // keeps re-typing cheap.
  useEffect(() => {
    if (activeSport) return;
    if (!trimmedQuery) return;
    for (const s of tabSports) loadSport(s.sport);
  }, [trimmedQuery, activeSport, tabSports, loadSport]);

  // currentTeams is sport-scoped when a tab is active, otherwise the union
  // across every loaded sport (used by cross-league search). Each entry
  // carries its sport so the row can render a small league badge in the
  // cross-league results view.
  const currentTeams = useMemo<(SportTeam & { sport: Sport })[]>(() => {
    if (activeSport) {
      const list = teamsBySport.get(activeSport) ?? [];
      return list.map((t) => ({ ...t, sport: activeSport }));
    }
    const out: (SportTeam & { sport: Sport })[] = [];
    for (const s of tabSports) {
      const list = teamsBySport.get(s.sport);
      if (!list) continue;
      for (const t of list) out.push({ ...t, sport: s.sport });
    }
    return out;
  }, [activeSport, teamsBySport, tabSports]);

  const filtered = useMemo(() => {
    if (!trimmedQuery) return currentTeams;
    return currentTeams.filter(
      (t) =>
        t.displayName.toLowerCase().includes(trimmedQuery) ||
        t.abbreviation.toLowerCase().includes(trimmedQuery),
    );
  }, [currentTeams, trimmedQuery]);

  // Aggregate loading: spinner when the focused scope is loading. For
  // single-sport view, that's just the active sport. For cross-league
  // search, show the spinner only until AT LEAST ONE sport has results —
  // staged display feels faster than blocking on every sport.
  const anySportLoaded = currentTeams.length > 0;
  const showSkeleton = activeSport
    ? loadingSports.has(activeSport) && !teamsBySport.has(activeSport)
    : !!trimmedQuery && !anySportLoaded && loadingSports.size > 0;

  if (tabSports.length === 0) return null;

  return (
    <div className="pt-3 mt-3 space-y-2" style={{ borderTop: "1px solid var(--border)" }}>
      <div className="text-[11px] uppercase tracking-wide font-semibold" style={{ color: "var(--text-muted)" }}>
        Browse teams
      </div>
      {/* Sport tabs — always visible. Clicking the active tab again clears
          the filter (back to cross-league search). */}
      <div className="flex flex-wrap gap-1.5">
        {tabSports.map((s) => {
          const active = s.sport === activeSport;
          return (
            <button
              key={s.sport}
              onClick={() => setActiveSport(active ? null : s.sport)}
              className="px-2 py-1 rounded-md text-[11px] font-semibold uppercase tracking-wide cursor-pointer transition-colors"
              style={{
                background: active ? "var(--accent)" : "var(--bg-card)",
                border: `1px solid ${active ? "var(--accent)" : "var(--border)"}`,
                color: active ? "white" : "var(--text)",
              }}
              title={active ? "Click to clear filter" : `Show ${s.label} teams`}
            >
              {s.label}
            </button>
          );
        })}
      </div>

      {/* Search box — always visible. With no league picked it queries every
          loaded sport; first keystroke triggers parallel lazy-loads. */}
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={activeSport ? `Search ${activeSport.toUpperCase()} teams` : "Search all teams"}
        className="w-full px-3 py-1.5 rounded-md text-sm"
        style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text)" }}
      />

      {/* Team grid */}
      <div className="max-h-72 overflow-y-auto -mx-1 px-1">
        {showSkeleton ? (
          <div className="grid grid-cols-2 gap-1.5">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div
                key={i}
                className="h-8 rounded-md animate-pulse"
                style={{ background: "var(--bg-card)" }}
              />
            ))}
          </div>
        ) : !activeSport && !trimmedQuery ? (
          <p className="text-xs py-3 text-center" style={{ color: "var(--text-muted)" }}>
            Type to search across all leagues, or pick a league above.
          </p>
        ) : filtered.length === 0 ? (
          <p className="text-xs py-3 text-center" style={{ color: "var(--text-muted)" }}>
            {trimmedQuery
              ? loadingSports.size > 0
                ? "Searching…"
                : "No matches"
              : "No teams available"}
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-1.5">
            {filtered.map((t) => {
              const isFav = favSet.has(t.id);
              return (
                <button
                  key={t.id}
                  onClick={() => onToggle(t.id)}
                  className="flex items-center gap-1.5 px-2 py-1.5 rounded-md text-xs cursor-pointer transition-colors text-left"
                  style={{
                    background: isFav ? "var(--accent)" : "var(--bg-card)",
                    border: `1px solid ${isFav ? "var(--accent)" : "var(--border)"}`,
                    color: isFav ? "white" : "var(--text)",
                  }}
                  title={isFav ? "Remove from favorites" : `Add ${t.displayName} to favorites`}
                >
                  {t.logo && (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={t.logo} alt="" width={16} height={16} className="w-4 h-4 shrink-0 object-contain" />
                  )}
                  <span className="min-w-0 truncate flex-1">{t.shortDisplayName}</span>
                  {/* Sport badge — only in cross-league view so the user can
                      tell Yankees (MLB) from Yankees-named results elsewhere */}
                  {!activeSport && (
                    <span
                      className="text-[9px] font-bold uppercase tracking-wide shrink-0 opacity-70"
                      style={{ color: isFav ? "white" : "var(--text-muted)" }}
                    >
                      {t.sport}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function ToggleRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-start justify-between gap-3 cursor-pointer select-none">
      <div className="flex-1">
        <div className="text-sm font-medium" style={{ color: "var(--text)" }}>{label}</div>
        {hint && <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>{hint}</div>}
      </div>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 accent-[var(--accent)] cursor-pointer"
      />
    </label>
  );
}
