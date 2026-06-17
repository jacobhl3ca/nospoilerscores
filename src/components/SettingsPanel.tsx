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
import { getAuthState, signInWithApple, signInWithGoogle, signOut, type AuthState } from "@/lib/prefsSync";

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
  // The full settings-restore URL — the draggable bookmark chip's href, so
  // dragging it to the browser's bookmarks bar saves the setup directly.
  shareUrl?: string;
}

const DATE_MODE_OPTIONS: { value: DefaultDateMode; label: string; hint: string }[] = [
  { value: "smart", label: "Smart", hint: "Yesterday before 1 PM ET, today after" },
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

// Full IANA zone list for the Time zone picker, with a graceful fallback for
// runtimes without Intl.supportedValuesOf.
const TIME_ZONES: string[] = (() => {
  try {
    const I = Intl as typeof Intl & { supportedValuesOf?: (k: string) => string[] };
    const v = I.supportedValuesOf?.("timeZone");
    if (Array.isArray(v) && v.length) return v;
  } catch { /* fall through */ }
  return [
    "America/New_York", "America/Chicago", "America/Denver", "America/Phoenix",
    "America/Los_Angeles", "America/Anchorage", "Pacific/Honolulu",
    "Europe/London", "Europe/Paris", "Europe/Berlin", "Asia/Tokyo",
    "Asia/Kolkata", "Australia/Sydney",
  ];
})();

// Resolve a US ZIP to its IANA time zone via Open-Meteo's geocoder — the same
// CORS-open, key-free service the weather lookup uses. Returns the zone plus a
// friendly place label, or null if the ZIP can't be found.
async function lookupZipTimeZone(zip: string): Promise<{ tz: string; place: string } | null> {
  try {
    const r = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(zip)}&count=5&language=en&format=json&countryCode=US`,
    );
    if (!r.ok) return null;
    const d = await r.json();
    const list: Array<{ name?: string; admin1?: string; country_code?: string; country?: string; timezone?: string }> = d.results ?? [];
    const pick =
      list.find((x) => (x.country_code === "US" || x.country === "United States") && x.timezone) ??
      list.find((x) => x.timezone);
    if (!pick?.timezone) return null;
    return { tz: pick.timezone, place: [pick.name, pick.admin1].filter(Boolean).join(", ") };
  } catch {
    return null;
  }
}

const THEME_OPTIONS: { value: Theme; label: string }[] = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

const SWITCHER_MODE_OPTIONS: { value: "dropdown" | "arrows" | "off"; label: string; hint: string }[] = [
  { value: "dropdown", label: "Dropdown", hint: "Tap a header to pick from a list" },
  { value: "arrows", label: "Arrows", hint: "‹ › cycle the unused leagues, most relevant first" },
  { value: "off", label: "Off", hint: "Headers are plain — switch here instead" },
];

const SEEK_CONTROL_OPTIONS: { value: "both" | "bar" | "jumps"; label: string; hint: string }[] = [
  { value: "both", label: "Both", hint: "Progress bar + the 10% skip buttons" },
  { value: "bar", label: "Bar", hint: "Just the draggable progress bar" },
  { value: "jumps", label: "Skip %", hint: "Just the 10% jump buttons" },
];

const SEEK_FILL_OPTIONS: { value: "off" | "grey" | "white"; label: string; hint: string }[] = [
  { value: "off", label: "Off", hint: "Blank track — never shows how far in you are" },
  { value: "grey", label: "Grey", hint: "Subtle low-contrast position fill" },
  { value: "white", label: "White", hint: "Bright position fill" },
];

const SPORT_LABEL: Record<Sport, string> = {
  mlb: "MLB",
  nba: "NBA",
  wnba: "WNBA",
  ncaam: "NCAAM",
  ncaaw: "NCAAW",
  ncaaf: "NCAAF",
  nfl: "NFL",
  nhl: "NHL",
  golf: "Golf",
  tennis: "Tennis",
  fifa: "FIFA",
  epl: "EPL",
  mls: "MLS",
  ucl: "UCL",
  uel: "UEL",
  f1: "F1",
  ufc: "UFC",
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
  shareUrl,
}: SettingsPanelProps) {
  const drawerRef = useRef<HTMLDivElement>(null);
  // The device's own zone — shown in the "Auto" option so the user knows what
  // Auto resolves to. Computed at render (client) so it reflects their device.
  let deviceTimeZone = "";
  try { deviceTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch { /* ignore */ }
  // ZIP → time zone helper state (Settings → Time zone).
  const [zip, setZip] = useState("");
  const [zipBusy, setZipBusy] = useState(false);
  const [zipMsg, setZipMsg] = useState("");
  const [zipErr, setZipErr] = useState(false);
  const resolveZip = async () => {
    if (zip.length !== 5 || zipBusy) return;
    setZipBusy(true); setZipErr(false); setZipMsg("Looking up…");
    const res = await lookupZipTimeZone(zip);
    setZipBusy(false);
    if (res) {
      updatePrefs({ timezone: res.tz });
      setZipErr(false);
      setZipMsg(`${res.place} — ${res.tz.replace(/_/g, " ")}`);
    } else {
      setZipErr(true);
      setZipMsg("Couldn’t find that ZIP");
    }
  };

  // Safari ignores the text/x-moz-url + text/html drag overrides below and
  // names a dragged bookmark after the link's visible text instead. So on
  // Safari we make the chip's text read "HideScore" (the desired bookmark
  // name) and move the "drag me" affordance to the caption. Detected after
  // mount (defaults to false) so SSR and first client render match — no
  // hydration mismatch. Chrome's UA also contains "Safari", so exclude it
  // (plus iOS Chrome/Firefox: CriOS/FxiOS) and Chromium Edge (Edg).
  const [isSafari, setIsSafari] = useState(false);
  useEffect(() => {
    setIsSafari(/^((?!chrome|chromium|android|crios|fxios|edg).)*safari/i.test(navigator.userAgent));
  }, []);

  // Account / cross-device sync state (Sign in with Apple). Re-checked each
  // time the panel opens so the signed-in email reflects a just-finished login.
  const [auth, setAuth] = useState<AuthState>({ signedIn: false, email: null });
  useEffect(() => {
    if (!open) return;
    let alive = true;
    getAuthState().then((a) => { if (alive) setAuth(a); });
    return () => { alive = false; };
  }, [open]);

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

  const displayedSports = useMemo(
    () => displayedLeagues.map((l) => l.sport),
    [displayedLeagues],
  );

  // Each slot dropdown offers every in-season league. Duplicates are allowed —
  // picking a league already in another slot just sets this slot to it too;
  // unset slots lock to their on-screen league so the auto-picker doesn't
  // reshuffle columns the user didn't touch. Walks the displayed-league queue
  // (each non-empty slot consumed one rendered column) so empty slots don't
  // misalign the lock.
  const setSlot = (slotIdx: number, sport: Sport | "empty" | undefined) => {
    let queueIdx = 0;
    const resolved: (Sport | "empty" | undefined)[] = [0, 1, 2, 3, 4].map((i) => {
      const pref = slotValues[i];
      if (pref === "empty") return "empty";
      const shown = displayedSports[queueIdx++];
      return pref ?? shown;
    });
    resolved[slotIdx] = sport;
    updatePrefs({
      firstLeague: resolved[0],
      secondLeague: resolved[1],
      thirdLeague: resolved[2],
      fourthLeague: resolved[3],
      fifthLeague: resolved[4],
    });
  };

  const slotValues: (Sport | "empty" | undefined)[] = [
    prefs.firstLeague,
    prefs.secondLeague,
    prefs.thirdLeague,
    prefs.fourthLeague,
    prefs.fifthLeague,
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
      fourthLeague: undefined,
      fifthLeague: undefined,
      newsThirdLeague: undefined,
      defaultDateMode: "smart",
      defaultLandingView: "remember",
      defaultRatings: "auto",
      hideLeagueChevrons: undefined,
      hideTeamStars: undefined,
      wcBannerDismissed: undefined,
      leagueSwitcherMode: undefined,
      hiddenLeagues: undefined,
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
          {/* Account — Sign in with Apple syncs prefs across browsers/devices.
              First so the cross-device value prop is the first thing seen. */}
          <Section title="Account">
            {auth.signedIn ? (
              <div className="space-y-2">
                <p className="text-sm" style={{ color: "var(--text)" }}>
                  Signed in{auth.email ? <> as <span className="font-medium">{auth.email}</span></> : ""}.
                </p>
                <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                  Your teams, layout, and settings sync automatically across all your browsers and devices.
                </p>
                <button
                  onClick={() => signOut()}
                  className="w-full py-2 rounded-lg text-sm font-medium cursor-pointer transition-colors"
                  style={{ background: "transparent", color: "var(--text)", border: "1px solid var(--border)" }}
                >
                  Sign out
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                {auth.providers?.apple !== false && (
                <button
                  onClick={() => signInWithApple()}
                  className="w-full py-2.5 rounded-lg text-sm font-semibold cursor-pointer transition-opacity hover:opacity-90 flex items-center justify-center gap-2"
                  style={{
                    background: resolvedTheme === "dark" ? "#fff" : "#000",
                    color: resolvedTheme === "dark" ? "#000" : "#fff",
                  }}
                >
                  <svg width="15" height="15" viewBox="0 0 17 17" fill="currentColor" aria-hidden="true">
                    <path d="M13.79 9.06c-.02-1.86 1.52-2.75 1.59-2.79-.87-1.27-2.22-1.44-2.7-1.46-1.15-.12-2.24.68-2.82.68-.58 0-1.48-.66-2.43-.64-1.25.02-2.4.73-3.04 1.85-1.3 2.25-.33 5.58.93 7.41.62.9 1.35 1.9 2.31 1.86.93-.04 1.28-.6 2.4-.6 1.12 0 1.43.6 2.41.58 1-.02 1.63-.91 2.24-1.81.71-1.04 1-2.05 1.01-2.1-.02-.01-1.94-.74-1.96-2.95l.01-.34zM11.9 3.38c.51-.62.86-1.48.76-2.34-.74.03-1.64.49-2.17 1.11-.47.55-.89 1.43-.78 2.27.83.07 1.67-.42 2.19-1.04z"/>
                  </svg>
                  Sign in with Apple
                </button>
                )}
                {auth.providers?.google && (
                <button
                  onClick={() => signInWithGoogle()}
                  className="w-full py-2.5 rounded-lg text-sm font-semibold cursor-pointer transition-opacity hover:opacity-90 flex items-center justify-center gap-2"
                  style={{ background: "#fff", color: "#1f1f1f", border: "1px solid #dadce0" }}
                >
                  <svg width="15" height="15" viewBox="0 0 48 48" aria-hidden="true">
                    <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"/>
                    <path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"/>
                    <path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238A11.91 11.91 0 0 1 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"/>
                    <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.087 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"/>
                  </svg>
                  Sign in with Google
                </button>
                )}
                <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                  Sign in to sync your teams, layout, and settings across every browser and device.
                </p>
              </div>
            )}
          </Section>

          {/* Theme — first because the old standalone header toggle moved
              in here, and dark/light is the most-frequently-flipped setting. */}
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

          {/* Default View */}
          <Section title="Default view">
            <Field label="Landing date" hint="What day to show when you open the app">
              <RadioGroup
                value={prefs.defaultDateMode ?? "smart"}
                options={DATE_MODE_OPTIONS}
                onChange={(v) => updatePrefs({ defaultDateMode: v })}
              />
            </Field>
            {(prefs.defaultDateMode ?? "smart") === "smart" && (
              <Field label="Smart switch time" hint="Hour (your local time) when Smart flips from yesterday to today">
                <select
                  value={prefs.smartCutoffHour ?? 13}
                  onChange={(e) => updatePrefs({ smartCutoffHour: Number(e.target.value) })}
                  className="w-full px-3 py-2 rounded-lg text-sm cursor-pointer"
                  style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text)" }}
                >
                  {Array.from({ length: 24 }, (_, h) => {
                    const base = h === 0 ? "12 AM (midnight)"
                      : h === 12 ? "12 PM (noon)"
                      : h < 12 ? `${h} AM`
                      : `${h - 12} PM`;
                    const label = h === 13 ? `${base} (default)` : base;
                    return <option key={h} value={h}>{label}</option>;
                  })}
                </select>
              </Field>
            )}
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
            <Field label="Time zone" hint="Used for game times AND which day counts as today">
              <select
                value={prefs.timezone ?? ""}
                onChange={(e) => updatePrefs({ timezone: e.target.value || undefined })}
                className="w-full px-3 py-2 rounded-lg text-sm cursor-pointer"
                style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text)" }}
              >
                <option value="">Auto — your device{deviceTimeZone ? ` (${deviceTimeZone})` : ""}</option>
                {TIME_ZONES.map((tz) => (
                  <option key={tz} value={tz}>{tz.replace(/_/g, " ")}</option>
                ))}
              </select>
              {/* Or just type a US ZIP and we'll pick the zone for you. */}
              <div className="flex items-center gap-2 mt-2">
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={5}
                  value={zip}
                  onChange={(e) => { setZip(e.target.value.replace(/\D/g, "").slice(0, 5)); setZipMsg(""); }}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); resolveZip(); } }}
                  placeholder="or enter ZIP"
                  className="w-28 px-3 py-2 rounded-lg text-sm"
                  style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text)" }}
                />
                <button
                  onClick={resolveZip}
                  disabled={zip.length !== 5 || zipBusy}
                  className="px-3 py-2 rounded-lg text-sm font-medium cursor-pointer transition-opacity disabled:opacity-40 disabled:cursor-default"
                  style={{ background: "var(--accent)", color: "white" }}
                >
                  {zipBusy ? "…" : "Set"}
                </button>
              </div>
              {zipMsg && (
                <p className="text-[11px] mt-1" style={{ color: zipErr ? "rgb(239,68,68)" : "var(--text-muted)" }}>
                  {zipMsg}
                </p>
              )}
            </Field>
          </Section>

          {/* League columns */}
          <Section title="League columns">
            <p className="text-xs mb-2" style={{ color: "var(--text-muted)" }}>
              Pick a league for each slot. <em>Auto</em> uses the in-season default.
              You can also tap a column&rsquo;s header on the main screen to switch its league.
              Slots 4&ndash;5 only appear when the window is wide enough for five columns.
            </p>
            {[0, 1, 2, 3, 4].map((idx) => {
              const fallbackLabel = displayedLeagues[idx]?.label ?? "—";
              const value = slotValues[idx];
              const hint = value === "empty" ? "Hidden" : value ? undefined : `Auto · currently ${fallbackLabel}`;
              return (
                <Field
                  key={idx}
                  label={`Slot ${idx + 1}${idx >= 3 ? " (wide screens)" : ""}`}
                  hint={hint}
                >
                  <select
                    value={value ?? ""}
                    onChange={(e) => {
                      const v = e.target.value;
                      setSlot(idx, v === "" ? undefined : v === "empty" ? "empty" : (v as Sport));
                    }}
                    className="w-full px-3 py-2 rounded-lg text-sm cursor-pointer"
                    style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text)" }}
                  >
                    <option value="">Auto</option>
                    {thirdLeagueOptions.map((o) => (
                      <option key={o.sport} value={o.sport}>{o.label}</option>
                    ))}
                    <option value="empty">Empty</option>
                  </select>
                </Field>
              );
            })}
            <Field label="Header league switcher" hint="How tapping a column header behaves">
              <RadioGroup
                value={prefs.leagueSwitcherMode ?? "dropdown"}
                options={SWITCHER_MODE_OPTIONS}
                onChange={(v) => updatePrefs({ leagueSwitcherMode: v })}
              />
            </Field>
            {(prefs.leagueSwitcherMode ?? "dropdown") === "dropdown" && (
              <ToggleRow
                label="Dropdown arrow (▾)"
                hint="The hint arrow next to each header (tap still switches either way)"
                checked={!prefs.hideLeagueChevrons}
                onChange={(v) => updatePrefs({ hideLeagueChevrons: !v })}
              />
            )}
            <Field label="Leagues in the switcher" hint="Unchecked leagues stay out of the header switcher">
              <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                {thirdLeagueOptions.map((o) => {
                  const hidden = prefs.hiddenLeagues?.includes(o.sport) ?? false;
                  return (
                    <label key={o.sport} className="flex items-center gap-2 text-sm cursor-pointer select-none" style={{ color: "var(--text)" }}>
                      <input
                        type="checkbox"
                        checked={!hidden}
                        onChange={(e) => {
                          const cur = prefs.hiddenLeagues ?? [];
                          const next = e.target.checked
                            ? cur.filter((s) => s !== o.sport)
                            : [...cur, o.sport];
                          updatePrefs({ hiddenLeagues: next.length ? next : undefined });
                        }}
                        className="cursor-pointer accent-[var(--accent)]"
                      />
                      {o.label}
                    </label>
                  );
                })}
              </div>
            </Field>
          </Section>

          {/* Board layout */}
          <Section title="Board layout">
            <ToggleRow
              label="Single column"
              hint="Stack your leagues in one wide column with bigger cards, instead of side-by-side columns"
              checked={prefs.singleColumn ?? false}
              onChange={(v) => updatePrefs({ singleColumn: v })}
            />
          </Section>

          {/* Favorite teams — picker first so adding a team doesn't push the
              picker off-screen, then the favorited-teams readout below. */}
          <Section title="Favorite teams">
            <ToggleRow
              label="Stars on game cards"
              hint="The ★ next to team names (auto-hidden in a Finals matchup)"
              checked={!prefs.hideTeamStars}
              onChange={(v) => updatePrefs({ hideTeamStars: !v })}
            />
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

          {/* Highlight-video spoiler masks (the black bars over the player) */}
          <Section title="Highlight video">
            <ToggleRow
              label="Cover video title"
              hint="Black bar over YouTube's title so the headline can't spoil"
              checked={prefs.maskVideoTitle ?? true}
              onChange={(v) => updatePrefs({ maskVideoTitle: v })}
            />
            <ToggleRow
              label="Show YouTube's controls"
              hint="Use YouTube's own bar (progress + time) instead of the spoiler-safe one — reveals how far you are, but handy in fullscreen"
              checked={prefs.youtubeNativeControls ?? false}
              onChange={(v) => updatePrefs({ youtubeNativeControls: v })}
            />
            <Field label="Skip controls" hint="Jump around a clip — drag is capped at 90% so the ending stays hidden">
              <RadioGroup
                value={prefs.videoSeekControl ?? "both"}
                options={SEEK_CONTROL_OPTIONS}
                onChange={(v) => updatePrefs({ videoSeekControl: v })}
              />
            </Field>
            <Field label="Seek bar fill" hint="The bar shows no position by default so it can't spoil how far in you are">
              <RadioGroup
                value={prefs.videoSeekFill ?? "off"}
                options={SEEK_FILL_OPTIONS}
                onChange={(v) => updatePrefs({ videoSeekFill: v })}
              />
            </Field>
            <ToggleRow
              label="Allow seeking to the end"
              hint="Off keeps the last 10% unreachable so the ending stays hidden"
              checked={prefs.videoAllowEnd ?? false}
              onChange={(v) => updatePrefs({ videoAllowEnd: v })}
            />
            <ToggleRow
              label="Warn before skipping past halfway"
              hint="Asks to confirm a click/jump that lands in the second half"
              checked={prefs.videoWarnHalfway ?? false}
              onChange={(v) => updatePrefs({ videoWarnHalfway: v })}
            />
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
              {(() => {
                const nothingToShare = prefs.favoriteTeams.length === 0 && prefs.favoriteLeagues.length === 0 && !prefs.firstLeague && !prefs.secondLeague && !prefs.thirdLeague && !prefs.fourthLeague && !prefs.fifthLeague;
                return (
                  <>
                    <button
                      onClick={onShareFavorites}
                      disabled={nothingToShare}
                      className="w-full py-2 rounded-lg text-sm font-medium cursor-pointer transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                      style={{ background: "var(--accent)", color: "white" }}
                    >
                      {shareCopied ? "Copied!" : "Save settings link"}
                    </button>
                    {/* Real <a> so the browser treats it as a draggable link —
                        drag it onto the bookmarks/favorites bar and the saved
                        bookmark restores this exact setup (Jacob 6/11 —
                        bookmarking a copied URL is fiddly). The label is the
                        affordance ("Drag to Bookmarks Bar"); dragstart
                        overrides the drag payload so the bookmark itself gets
                        NAMED "HideScore" where the browser honors it (Firefox
                        x-moz-url title, Chromium text/html) instead of the
                        instructional label. Click copies, like the button. */}
                    {!nothingToShare && shareUrl && (
                      <a
                        href={shareUrl}
                        onClick={(e) => { e.preventDefault(); onShareFavorites(); }}
                        onDragStart={(e) => {
                          e.dataTransfer.setData("text/uri-list", shareUrl);
                          e.dataTransfer.setData("text/plain", shareUrl);
                          e.dataTransfer.setData("text/x-moz-url", `${shareUrl}\nHideScore`);
                          e.dataTransfer.setData("text/html", `<a href="${shareUrl}">HideScore</a>`);
                        }}
                        className="w-full py-2 rounded-lg text-sm cursor-grab transition-colors flex items-center justify-center gap-1.5"
                        style={{ background: "var(--bg-card)", border: "1px dashed var(--border)", color: "var(--text)" }}
                        onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--accent)"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border)"; }}
                        title="Drop on your bookmarks bar to save this setup as 'HideScore'"
                      >
                        {/* draggable={false} so grabbing the chip by the monkey
                            still drags the LINK (the bookmark), not the image. */}
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src="/monkey-see-no-evil.svg" alt="" width={14} height={14} className="inline-block" draggable={false} />
                        {/* Safari names the bookmark after this visible text,
                            so it must read "HideScore" there. Other browsers
                            take the name from the dragstart overrides above, so
                            they keep the instructional label. */}
                        {isSafari ? "HideScore" : "Drag to Bookmarks Bar"}
                      </a>
                    )}
                    {!nothingToShare && (
                      <p className="text-[11px] -mt-1" style={{ color: "var(--text-muted)" }}>
                        {isSafari
                          ? "Drag this onto your bookmarks bar to save this setup. Clicking copies the link instead."
                          : "The bookmark restores this exact setup. Clicking copies the link instead."}
                      </p>
                    )}
                  </>
                );
              })()}
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
