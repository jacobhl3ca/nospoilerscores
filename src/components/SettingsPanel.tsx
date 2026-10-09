"use client";

import { cloneElement, isValidElement, useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { LeagueData, Sport } from "@/lib/types";
import { fetchSportTeams, SportTeam, SPORT_GROUP_ORDER, sportGroup, catalogSortRank } from "@/lib/espn";
import { TEAM_PICKER_SKIP } from "@/lib/teamLogos";
import { ESPN_FRONT_PAGE_LABEL, TOP_EVENTS_ENABLED } from "@/lib/topEvents";
import { BEST_YESTERDAY_ENABLED, BEST_YESTERDAY_LABEL } from "@/lib/bestYesterday";
import { WATCH_QUEUE_ENABLED } from "@/lib/watchQueue";
import { dropRemoved, noteRemoved } from "@/lib/removedLeagues";
import { closeHiddenPins, lockBoardForRemoval, lockSlotsToBoard, restoreHiddenPins, slotPrefsPatch } from "@/lib/boardSlots";
import { LeagueMark } from "./LeagueMark";
import type { TvPlayer } from "@/lib/tvChannelLinks";
import { normalizeFrontend } from "@/lib/frontendLinks";
import { FREQUENT_RECORD_LEAGUES, recordKeysForLeagues, toggleRecordLeague, upcomingRecordLeagues } from "@/lib/upcomingRecords";
import {
  boardHiddenLeagues,
  Preferences,
  Theme,
  DefaultDateMode,
  DefaultLandingView,
  DefaultRatings,
} from "@/lib/preferences";
import { useAppStore, storeReviewHref } from "@/lib/useAppStore";
import { clearRememberedPairings, restoreRememberedPairings } from "@/lib/pairingMask";
import { getAuthState, cachedAuthState, hasNativeGoogleBridge, signInWithApple, signInWithGoogle, requestEmailCode, verifyEmailCode, signOut, deleteAccount, type AuthState } from "@/lib/prefsSync";

interface LeagueOption {
  sport: Sport;
  label: string;
  offseason?: boolean;
  // "starts Aug 21" for a league inside its pre-season selectable window.
  upcomingLabel?: string;
  defaultInSwitcher?: boolean;
}

interface SettingsPanelProps {
  open: boolean;
  onClose: () => void;
  prefs: Preferences;
  updatePrefs: (update: Partial<Preferences>) => void;
  resolvedTheme: "dark" | "light";
  // Every supported league, sectioned by KIND of sport in the UI (see
  // SPORT_GROUP_ORDER). Saved offseason picks stay visible here even while the
  // score board falls back to its active automatic columns.
  leagueOptions: LeagueOption[];
  // Opens the footer feedback modal with a league-request message prefilled.
  // Settings is the one place someone is already looking for a league that
  // isn't there, so the ask belongs at the end of the catalog.
  onRequestLeague?: () => void;
  // Opens the same footer feedback modal with an EMPTY message, for the quiet
  // Feedback link in the legal row at the bottom of the panel.
  onOpenFeedback?: () => void;
  // Every supported team league, including out-of-season leagues. Team
  // favorites are durable; the picker must not hide La Liga in July merely
  // because its score column is not active yet.
  teamLeagueOptions: LeagueOption[];
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
  // Yesterday first: it is the fresh-install default since 8/9, so the order
  // reads as the recommendation. Values are unchanged.
  { value: "yesterday", label: "Yesterday", hint: "Always start on yesterday" },
  { value: "today", label: "Today", hint: "Always start on today" },
  { value: "smart", label: "Automatic", hint: "Yesterday before the switch time, today after" },
];

const LANDING_VIEW_OPTIONS: { value: DefaultLandingView; label: string; hint: string }[] = [
  { value: "remember", label: "Last opened", hint: "Pick up where you left off" },
  { value: "scores", label: "Scores", hint: "Always start on scores" },
  { value: "ratings", label: "Ratings", hint: "Always start on scores with ratings on (spoilers)" },
  { value: "news", label: "News", hint: "Always start on news (spoilers)" },
];

const DEFAULT_RATINGS_OPTIONS: { value: DefaultRatings; label: string; hint: string }[] = [
  { value: "auto", label: "Auto", hint: "Off in morning, last state after noon" },
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

// The Time zone row (Jacob 10/4): one row of pills for the four US zones,
// the full list behind "Other…". A saved zone outside the four (Phoenix,
// London, "US/Eastern") opens Other on load and is never rewritten.
type ZonePill = "auto" | "et" | "ct" | "mt" | "pt" | "other";
const ZONE_PILLS: { value: ZonePill; label: string; zone?: string; name?: string }[] = [
  { value: "auto", label: "Auto" },
  { value: "et", label: "ET", zone: "America/New_York", name: "Eastern" },
  { value: "ct", label: "CT", zone: "America/Chicago", name: "Central" },
  { value: "mt", label: "MT", zone: "America/Denver", name: "Mountain" },
  { value: "pt", label: "PT", zone: "America/Los_Angeles", name: "Pacific" },
  { value: "other", label: "Other…" },
];
const zoneCity = (tz: string) => (tz.split("/").pop() || tz).replace(/_/g, " ");
// "now 9:41 AM" in a zone; a bad zone falls back to the runtime's own.
function nowIn(tz: string): string {
  try {
    return new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: tz || undefined });
  } catch {
    return new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  }
}

const THEME_OPTIONS: { value: Theme; label: string }[] = [
  { value: "system", label: "🖥️ System" },
  { value: "light", label: "☀️ Light" },
  { value: "dark", label: "🌙 Dark" },
];

// Sets <html data-theme> the moment the pref changes, as the Theme pills do.
function applyThemeAttr(theme: Theme) {
  const resolved = theme === "system"
    ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
    : theme;
  document.documentElement.setAttribute("data-theme", resolved);
}

// "1 PM (default)" for the Automatic switch-time select.
function hourLabel(h: number): string {
  const base = h === 0 ? "12 AM" : h === 12 ? "12 PM" : h < 12 ? `${h} AM` : `${h - 12} PM`;
  return h === 13 ? `${base} (default)` : base;
}

const PROVIDER_LABEL: Record<string, string> = { apple: "Apple", google: "Google", email: "email" };

const SWITCHER_MODE_OPTIONS: { value: "dropdown" | "arrows" | "both" | "off"; label: string; hint: string }[] = [
  { value: "dropdown", label: "Dropdown", hint: "Tap a header to pick from a list" },
  { value: "arrows", label: "Arrows", hint: "‹ › cycle the unused leagues, most relevant first" },
  { value: "both", label: "Both", hint: "‹ › beside a header that still opens the list" },
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

const PLAYER_OPTIONS: { value: "safe" | "youtube"; label: string; hint: string }[] = [
  // YouTube first: it is the default (Jacob 10/1).
  { value: "youtube", label: "YouTube", hint: "Use the familiar YouTube controls; progress may reveal how far you are" },
  { value: "safe", label: "Spoiler-safe", hint: "Hide progress and the ending with HideScore controls" },
];

const SPORT_LABEL: Record<Sport, string> = {
  mlb: "MLB",
  nba: "NBA",
  wnba: "WNBA",
  ncaam: "NCAAM",
  ncaaw: "NCAAW",
  ncaaf: "NCAAF",
  nfl: "NFL",
  ufl: "UFL",
  nhl: "NHL",
  ncaah: "NCAA Hockey",
  cfl: "CFL",
  ncaawh: "NCAA Women's Hockey",
  ncaavb: "NCAA Volleyball",
  ncaawsoc: "NCAA Women's Soccer",
  ncaamsoc: "NCAA Men's Soccer",
  llws: "Little League",
  ncaabase: "NCAA Baseball",
  ncaasoft: "NCAA Softball",
  golf: "Golf",
  tennis: "Tennis",
  fifa: "FIFA",
  epl: "Premier League",
  mls: "MLS",
  ucl: "UCL",
  uel: "UEL",
  laliga: "La Liga",
  seriea: "Serie A",
  bundesliga: "Bundesliga",
  ligue1: "Ligue 1",
  ligamx: "Liga MX",
  nwsl: "NWSL",
  efl: "Championship",
  libertadores: "Libertadores",
  euro: "Euro",
  afcon: "AFCON",
  saudi: "Saudi PL",
  uecl: "UEFA Conference League",
  facup: "FA Cup",
  copadelrey: "Copa del Rey",
  dfbpokal: "DFB-Pokal",
  nations: "UEFA Nations League",
  cricket: "IPL",
  cricketintl: "International cricket",
  sixnations: "Six Nations",
  rugbywc: "Rugby World Cup",
  rugbychamp: "Champions Cup",
  superrugby: "Super Rugby",
  rugbytest: "Rugby Tests",
  nationschamp: "Rugby Nations",
  premrugby: "Premiership Rugby",
  urc: "United Rugby Championship",
  top14: "Top 14",
  challengecup: "Challenge Cup",
  mlr: "Major League Rugby",
  nrl: "NRL (rugby league)",
  afl: "AFL (Aussie rules)",
  f1: "F1",
  nascar: "NASCAR",
  indycar: "IndyCar",
  ufc: "UFC",
  boxing: "Boxing",
  chess: "Chess",
  poker: "Poker",
  climbing: "Climbing",
  esports: "Esports",
  top: "ESPN front page",
  best: "Best of yesterday",
};

// Same query as WIDE_BOARD_QUERY in HomeContent.tsx: the board only shows
// columns 4-5 at this width, so their slot dropdowns only show here too.
const WIDE_BOARD_QUERY = "(min-width: 1280px)";

// matchMedia as state. False on the server and on the first client render so
// hydration matches; the effect corrects it right after mount.
function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const handler = () => setMatches(mq.matches);
    handler();
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [query]);
  return matches;
}

function teamSportFromId(id: string): Sport | null {
  const dash = id.indexOf("-");
  if (dash === -1) return null;
  return id.slice(0, dash) as Sport;
}

// Stand-in used while the real auth state is unknown. Everything optional is
// left undefined so no provider button can render off it: callers must gate on
// authKnown, not on this object.
const AUTH_UNKNOWN: AuthState = { signedIn: false, email: null };

export default function SettingsPanel({
  open,
  onClose,
  prefs,
  updatePrefs: savePrefs,
  resolvedTheme,
  leagueOptions,
  onRequestLeague,
  onOpenFeedback,
  teamLeagueOptions,
  displayedLeagues,
  knownTeams,
  onShareFavorites,
  shareCopied,
  shareUrl,
}: SettingsPanelProps) {
  const drawerRef = useRef<HTMLDivElement>(null);

  // One "Saved" mark in the header for every write (Jacob 10/1). It was only
  // under the two Links fields. "show" for 2 s, then "fade" while the opacity
  // runs out, then gone. Reduced motion skips the transition.
  const [savedMark, setSavedMark] = useState<"show" | "fade" | null>(null);
  const savedTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => { savedTimersRef.current.forEach(clearTimeout); }, []);
  const updatePrefs = useCallback((update: Partial<Preferences>) => {
    savePrefs(update);
    savedTimersRef.current.forEach(clearTimeout);
    setSavedMark("show");
    savedTimersRef.current = [
      setTimeout(() => setSavedMark("fade"), 2_000),
      setTimeout(() => setSavedMark(null), 2_300),
    ];
  }, [savePrefs]);

  // Undo for every destructive click in the panel (Jacob 10/1; Reset had it
  // since 9/28): a league chip off, a league struck off the list, a column
  // change, a team removed, Reset. The patch holds the prior value of every key
  // the click wrote, so Undo puts back exactly what was there, unset keys
  // included. One level: each new click replaces the last entry. 15 s, then
  // the pill goes. Cmd-Z / Ctrl-Z does the same (see the keydown effect).
  const [undo, setUndo] = useState<{ label: string; patch: Partial<Preferences>; pairings?: string } | null>(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (undoTimerRef.current) clearTimeout(undoTimerRef.current); }, []);
  const updateWithUndo = (label: string, patch: Partial<Preferences>, extra?: { pairings?: string }) => {
    const prior: Partial<Preferences> = {};
    for (const key of Object.keys(patch) as (keyof Preferences)[]) {
      (prior as Record<string, unknown>)[key] = prefs[key];
    }
    updatePrefs(patch);
    setUndo({ label, patch: prior, pairings: extra?.pairings });
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    undoTimerRef.current = setTimeout(() => setUndo(null), 15_000);
  };
  const applyUndo = useCallback(() => {
    if (!undo) return;
    updatePrefs(undo.patch);
    if (undo.pairings) restoreRememberedPairings(undo.pairings);
    if ("theme" in undo.patch) applyThemeAttr(undo.patch.theme ?? "system");
    setUndo(null);
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
  }, [undo, updatePrefs]);

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

  let deviceTimeZone = "";
  try { deviceTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch { /* ignore */ }
  // Time zone row: which pill is on, and whether the full list is open.
  const [zoneOtherOpen, setZoneOtherOpen] = useState(false);
  const savedZonePill = ZONE_PILLS.find((z) => z.zone && z.zone === prefs.timezone);
  const zoneIsOther = !!prefs.timezone && !savedZonePill;
  const zonePill: ZonePill = zoneOtherOpen || zoneIsOther ? "other" : savedZonePill?.value ?? "auto";
  const zoneLine = prefs.timezone
    ? `Times show in ${savedZonePill?.name ?? zoneCity(prefs.timezone)} · now ${nowIn(prefs.timezone)}`
    : `Auto · your device${deviceTimeZone ? ` (${zoneCity(deviceTimeZone)})` : ""} · now ${nowIn(deviceTimeZone)}`;

  // Account / cross-device sync state (Sign in with Apple). Re-checked each
  // time the panel opens so the signed-in email reflects a just-finished login.
  //
  // null means UNKNOWN, which is NOT the same as signed out. /api/me takes a
  // couple of seconds for a signed-in user, and this used to start at
  // { signedIn: false }, so opening Settings showed the "Sign in with Apple"
  // buttons to someone who was already signed in and then flipped to their
  // email once the answer landed. Seed from the cached snapshot (correct on the
  // first frame for anyone who has opened the app before) and render a
  // placeholder rather than the signed-out UI while we genuinely don't know.
  const [authState, setAuthState] = useState<AuthState | null>(() => cachedAuthState());
  const authKnown = authState !== null;
  const auth = authState ?? AUTH_UNKNOWN;
  const [canUseGoogle, setCanUseGoogle] = useState(false);
  const [emailStep, setEmailStep] = useState<"email" | "code">("email");
  const [emailAddress, setEmailAddress] = useState("");
  const [emailCode, setEmailCode] = useState("");
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailStatus, setEmailStatus] = useState("");
  const [emailError, setEmailError] = useState(false);
  // Linking a SECOND sign-in is a once-ever chore, but its buttons and the whole
  // email form sat open under every signed-in account and pushed the real
  // settings a screen down (Jacob 8/31: "it takes up too much space"). Collapsed
  // behind a grey link under Sign out; re-collapses each time the panel opens.
  const [showLinkMore, setShowLinkMore] = useState(false);
  // Signed out, the email form sat open under the Apple and Google buttons.
  // Most people use one of those, so the form waits behind a grey link
  // (Jacob 9/25). Re-collapses each time the panel opens, like showLinkMore.
  const [showEmailForm, setShowEmailForm] = useState(false);
  // A league chip unticked in My leagues stays in place, as an outline, until
  // the drawer closes (Jacob 10/4: "unticked league vanishes"). View state
  // only: keys are sports plus "best" / "top" / "topnews". Cleared on open.
  const [stickyOff, setStickyOff] = useState<Set<string>>(new Set());
  const keepSeen = (key: string, on: boolean) => {
    if (!on) setStickyOff((prev) => (prev.has(key) ? prev : new Set(prev).add(key)));
  };
  // Columns 4-5 exist only on a wide board, so their slots hide elsewhere.
  const isWideBoard = useMediaQuery(WIDE_BOARD_QUERY);
  // Native shells only — see the Rate link in the legal row below.
  const appStore = useAppStore();
  useEffect(() => {
    if (!open) return;
    const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
    setCanUseGoogle(!cap?.isNativePlatform?.() || hasNativeGoogleBridge());
    setShowLinkMore(false);
    setShowEmailForm(false);
    setStickyOff(new Set());
    let alive = true;
    getAuthState().then((a) => { if (alive) setAuthState(a); });
    return () => { alive = false; };
  }, [open]);

  // Everything this account could still link. A provider already linked simply
  // isn't here, so an account with nothing left to link shows no disclosure at
  // all. flex-wrap keeps the row honest if a third provider is ever added.
  const linkableProviders = useMemo(() => {
    const out: { key: string; label: string; onClick: () => void }[] = [];
    if (auth.providers?.google && canUseGoogle && !auth.linkedProviders?.includes("google")) {
      out.push({ key: "google", label: "Google", onClick: () => signInWithGoogle(undefined, true) });
    }
    if (auth.providers?.apple && !auth.linkedProviders?.includes("apple")) {
      out.push({ key: "apple", label: "Apple", onClick: () => signInWithApple(undefined, true) });
    }
    return out;
  }, [auth.providers, auth.linkedProviders, canUseGoogle]);
  const canLinkEmail = !!auth.providers?.email && !auth.linkedProviders?.includes("email");
  // Signed out: the email form opens on the link, stays open mid-code, and is
  // simply open when email is the only way in.
  const hasButtonSignIn = auth.providers?.apple !== false || (!!auth.providers?.google && canUseGoogle);
  const signedOutEmailOpen = showEmailForm || emailStep === "code" || !hasButtonSignIn;
  // Signed in AND known: the only state where Account moves down the panel.
  const signedInKnown = authKnown && auth.signedIn;
  const signedInProvider = auth.provider ?? auth.linkedProviders?.[0] ?? null;

  // Esc to close. Cmd-Z / Ctrl-Z takes back the last destructive click, but
  // never while typing: a text field keeps its own undo.
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") { onClose(); return; }
      if (!undo || e.key.toLowerCase() !== "z" || !(e.metaKey || e.ctrlKey) || e.shiftKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      const typing = t instanceof HTMLTextAreaElement
        || (t instanceof HTMLInputElement && !["checkbox", "radio", "button"].includes(t.type))
        || !!t?.isContentEditable;
      if (typing) return;
      e.preventDefault();
      applyUndo();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose, undo, applyUndo]);

  // Focus management (WCAG 2.4.3) — mirror GameDetailModal / WorldCupGroupsModal,
  // the app's other role="dialog" overlays. On open, move focus into the drawer
  // so keyboard / screen-reader users land inside the panel instead of being
  // stranded on the settings trigger behind the aria-modal barrier; on close,
  // restore focus to the element that opened it. Focusing the drawer CONTAINER
  // (tabIndex=-1, outline suppressed below) keeps mouse users from seeing a ring
  // while still handing the dialog + its "Settings" aria-label to assistive
  // tech; the first Tab then reaches the close button. Keyed on [open], so it
  // captures the opener and refocuses it only on real open/close transitions.
  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    const drawer = drawerRef.current;
    drawer?.focus();
    // Trap Tab within the drawer (WCAG 2.4.3) — mirror GameDetailModal, whose
    // focus-trap comment invited the other overlays to follow. On its own,
    // aria-modal="true" only tells assistive tech the page behind is inert; it
    // does NOT stop a sighted keyboard user from Tabbing out of the drawer into
    // the scores/news content behind it. Wrap focus at the first/last focusable
    // control so Tab / Shift+Tab cycle inside the panel until Escape or the
    // backdrop dismisses it, matching the focus-in / restore this effect already
    // does. Focusables are queried live on each keypress so the async team-picker
    // / league-dropdown controls that mount as the user drills in are included,
    // and offsetParent filters out any hidden (display:none) control.
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Tab" || !drawer) return;
      const focusable = Array.from(
        drawer.querySelectorAll<HTMLElement>(
          'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'
        )
      ).filter((el) => el.offsetParent !== null);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (e.shiftKey) {
        if (active === first || active === drawer) { e.preventDefault(); last.focus(); }
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
  }, [open]);

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
  // retryEmpty: fetch again when the last try came back empty (a failed fetch;
  // lib/espn does not cache those either).
  const loadTeamSport = useCallback((sport: Sport, retryEmpty = false) => {
    setTeamsBySportCache((prev) => {
      if (prev.has(sport) && !(retryEmpty && prev.get(sport)!.length === 0)) return prev;
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
  // favorites list shows friendly names and logos on settings-open instead of
  // "nba-8" — also for a league not on today's board. A sport whose last fetch
  // failed tries again on each open (Jacob 10/1: chips with no logo).
  // Skip when the picker drawer isn't open (no point fetching ahead of view).
  useEffect(() => {
    if (!open) return;
    const sportsToLoad = new Set<Sport>();
    for (const id of prefs.favoriteTeams) {
      const sport = teamSportFromId(id);
      if (sport) sportsToLoad.add(sport);
    }
    for (const sport of sportsToLoad) loadTeamSport(sport, true);
  }, [open, prefs.favoriteTeams, loadTeamSport]);

  const displayedSports = useMemo(
    () => displayedLeagues.map((l) => l.sport),
    [displayedLeagues],
  );

  // Each slot dropdown offers every supported league year-round. Duplicates
  // are allowed —
  // picking a league already in another slot just sets this slot to it too;
  // unset slots lock to their on-screen league so the auto-picker doesn't
  // reshuffle columns the user didn't touch — see lockSlotsToBoard. A pick
  // also closes the columns this screen does not show, as on the board, so a
  // wider window later shows the + button there, not an Auto league; Auto
  // closes nothing.
  const setSlot = (slotIdx: number, sport: Sport | "empty" | undefined) => {
    const locked = sport === undefined
      ? lockSlotsToBoard(slotValues, displayedSports)
      : lockSlotsToBoard(slotValues, displayedSports, [], visibleColumns);
    const resolved = restoreHiddenPins(locked, savedSlots, [slotIdx], sport);
    resolved[slotIdx] = sport;
    // Pinning a league that is turned off in the switcher list (or struck off
    // the catalog) turns it back on: the board shows the next league in place
    // of a turned-off one, so the pin would otherwise do nothing.
    const hiddenLeagues = (prefs.hiddenLeagues ?? []).filter((s) => s !== sport);
    const catalogHiddenLeagues = (prefs.catalogHiddenLeagues ?? []).filter((s) => s !== sport);
    updateWithUndo(`Column ${slotIdx + 1} changed`, {
      ...slotPrefsPatch(resolved),
      ...(hiddenLeagues.length !== (prefs.hiddenLeagues ?? []).length
        ? { hiddenLeagues: hiddenLeagues.length ? hiddenLeagues : undefined }
        : {}),
      ...(catalogHiddenLeagues.length !== (prefs.catalogHiddenLeagues ?? []).length
        ? { catalogHiddenLeagues: catalogHiddenLeagues.length ? catalogHiddenLeagues : undefined }
        : {}),
      ...(sport && sport !== "empty" && prefs.removedLeagues?.includes(sport) ? { removedLeagues: dropRemoved(prefs.removedLeagues, sport) } : {}),
    });
  };

  // The saved pins, and the board's view of them: a pin on a league turned
  // off in the switcher list is a closed column (closeHiddenPins), so its
  // Columns pill reads "Remove col". The "is it pinned" checks below read the
  // saved pins.
  const savedSlots: (Sport | "empty" | undefined)[] = [
    prefs.firstLeague,
    prefs.secondLeague,
    prefs.thirdLeague,
    prefs.fourthLeague,
    prefs.fifthLeague,
  ];
  const slotValues = closeHiddenPins(savedSlots, boardHiddenLeagues(prefs) ?? []);
  // Columns the board shows now: 5 wide or with scroll columns on, else 3.
  const visibleColumns = isWideBoard || (!!prefs.scrollColumns && !prefs.singleColumn) ? 5 : 3;
  // Taking a league out of the switcher list while a column shows it: lock
  // the board in the same save, so that column closes rather than an Auto
  // league taking it (Jacob 10/8). The same patch, so Undo reopens it too.
  const closeColumnsShowing = (sport: Sport): Partial<Preferences> => {
    const locked = lockBoardForRemoval(slotValues, displayedSports, [sport], visibleColumns);
    return locked ? slotPrefsPatch(restoreHiddenPins(locked, savedSlots)) : {};
  };

  // Whether a catalog row is currently ticked. Same rule the checkbox itself
  // renders from — pulled out so the offseason filter below can ask the
  // question without duplicating (and drifting from) the logic.
  const isSwitcherChecked = (option: LeagueOption) => {
    const hidden = prefs.hiddenLeagues?.includes(option.sport) ?? false;
    const shown = prefs.shownLeagues?.includes(option.sport) ?? false;
    const pinned = savedSlots.includes(option.sport);
    const preferred = option.defaultInSwitcher !== false || pinned || prefs.favoriteLeagues.includes(option.sport);
    return !hidden && (shown || preferred);
  };

  // The league catalog, sectioned by KIND of sport rather than by season
  // (Jacob 8/11). The old split was "In season" / "Offseason", which answered a
  // question nobody was asking here: Settings is the durable catalog, you come
  // to it to FIND a league, and 16 soccer competitions interleaved with the US
  // leagues is what made it unscannable. Nothing is lost in the swap — every
  // row still carries its own "· offseason" marker, and each group sorts its
  // in-season leagues first, so the seasonal signal survives at row level where
  // it belongs. Empty groups are dropped rather than rendered as bare headings.
  const groupedLeagueOptions = useMemo(() => {
    const byGroup = new Map<string, LeagueOption[]>();
    for (const option of leagueOptions) {
      const key = sportGroup(option.sport);
      const bucket = byGroup.get(key);
      if (bucket) bucket.push(option);
      else byGroup.set(key, [option]);
    }
    return SPORT_GROUP_ORDER.flatMap(({ key, label, emoji }) => {
      const options = byGroup.get(key);
      if (!options?.length) return [];
      // Within a group: in-season first, then a fixed stature order
      // (CATALOG_STATURE, 9/30; it replaced the season-calendar ALL_LEAGUES
      // order) — except that the short-window minority events sort to the tail
      // regardless of season, so Little League cannot outrank the NBA for three
      // weeks in August. See catalogSortRank / CATALOG_TAIL. A sport missing
      // from CATALOG_STATURE ties at the end, and the stable sort keeps those
      // in catalog order.
      const sorted = [...options].sort(
        (a, b) => catalogSortRank(a.sport, !!a.offseason) - catalogSortRank(b.sport, !!b.offseason),
      );
      return [{ key, label, emoji, options: sorted }];
    });
  }, [leagueOptions]);

  // "Hide offseason" — a Settings-ONLY view filter over the catalog above
  // (Jacob 8/22). Twenty-odd rows reading "· offseason" in August is most of
  // what makes this list long, and none of them are what he came here to
  // change. Only a slot-PINNED offseason league stays listed (it is "saved
  // for its return" and needs its row to be un-pinned), and the control
  // states how many rows it is holding back so the shortened list can't read
  // as the whole catalog. Groups emptied by the filter drop out with their
  // heading.
  //
  // Until 9/4 every CHECKED row stayed too — and the core leagues start
  // checked, so NBA, NHL, NCAAM, FIFA, UCL, UEL and Golf all survived the
  // filter, which hid 10 obscure rows out of 43 and read as broken (Jacob:
  // "hide offseason doesn't seem to work"). A checkbox on an offseason league
  // changes nothing until the league returns, so hiding the row costs
  // nothing; untick "Hide offseason" to reach it. The five slot dropdowns
  // follow the same filter (they had kept all 17 "· offseason" entries).
  const hideOffseason = !!prefs.hideOffseasonInCatalog;
  // Struck off the catalog with its × (Jacob 9/28). Gone from the chips, the
  // switchers and the board; "N hidden · Show" brings them all back.
  const catalogHidden = prefs.catalogHiddenLeagues ?? [];
  const catalogHiddenCount = leagueOptions.filter((option) => catalogHidden.includes(option.sport)).length;
  const [editingCatalog, setEditingCatalog] = useState(false);
  const [catalogAll, setCatalogAll] = useState(false);
  // The catalog itself (not the slot dropdowns) now starts with offseason rows
  // hidden when the pref was never set (Jacob 9/25). This is a view default
  // only: nothing is written until the checkbox is tapped, and an untick
  // holds for the rest of the session through this local override.
  const [catalogHideOverride, setCatalogHideOverride] = useState<boolean | null>(null);
  const catalogHideOffseason = catalogHideOverride ?? prefs.hideOffseasonInCatalog ?? true;
  const offseasonRowCount = leagueOptions.filter((option) => option.offseason).length;
  const keepOffseasonRow = (option: LeagueOption) => savedSlots.includes(option.sport);
  const hiddenOffseasonCount = leagueOptions.filter(
    (option) => option.offseason && !keepOffseasonRow(option) && !(prefs.catalogHiddenLeagues ?? []).includes(option.sport),
  ).length;
  const visibleLeagueGroups = groupedLeagueOptions.flatMap((group) => {
    const options = group.options.filter((option) =>
      !catalogHidden.includes(option.sport)
      && (!catalogHideOffseason || !option.offseason || keepOffseasonRow(option)));
    return options.length ? [{ ...group, options }] : [];
  });
  const slotDropdownGroups = (current: Sport | "empty" | undefined) => hideOffseason
    ? groupedLeagueOptions.flatMap((group) => {
        const options = group.options.filter((option) => !option.offseason || option.sport === current || keepOffseasonRow(option));
        return options.length ? [{ ...group, options }] : [];
      })
    : groupedLeagueOptions;
  // The team picker's league row shows the same leagues as the My leagues
  // chips (Jacob 10/1: 30+ text pills was "a lot to look at"); "More
  // leagues" opens the rest.
  const myLeagueSports = new Set(
    visibleLeagueGroups.flatMap((group) => group.options).filter(isSwitcherChecked).map((option) => option.sport),
  );
  // Records on upcoming games offers only the leagues in My leagues, in the
  // same order as that row (Jacob 10/4). A stored key for any other league
  // stays stored.
  const recordKeys = recordKeysForLeagues(
    visibleLeagueGroups.flatMap((group) => group.options).filter(isSwitcherChecked)
      .map((option) => ({ sport: option.sport, isSoccer: sportGroup(option.sport) === "soccer" })),
  );
  const recordSelected = upcomingRecordLeagues(prefs);

  // What a column pill says: the pinned league, or Auto and what it shows.
  const slotPillText = (value: Sport | "empty" | undefined, fallbackLabel: string | undefined) => {
    if (value === "empty") return "Removed";
    if (value === "best") return BEST_YESTERDAY_LABEL;
    if (value === "top") return ESPN_FRONT_PAGE_LABEL;
    if (value) return SPORT_LABEL[value] ?? value;
    return fallbackLabel ? `Auto · ${fallbackLabel}` : "Auto";
  };

  // The league whose logo a chip or pill shows (Jacob 9/30). The cross-league
  // columns (Best of yesterday, ESPN front page) stay text only.
  const markSport = (sport: Sport | "empty" | undefined): Sport | undefined =>
    sport && sport !== "empty" && sport !== "best" && sport !== "top" ? sport : undefined;

  const optionText = (option: LeagueOption) =>
    `${SPORT_LABEL[option.sport] ?? option.label}${option.offseason ? " · offseason" : option.upcomingLabel ? ` · starts ${option.upcomingLabel}` : ""}`;

  // One catalog chip. A tick keeps the same hidden/shown rule the checkbox
  // rows had. In "Edit list" mode a × strikes the league off the catalog
  // itself (catalogHiddenLeagues), which also takes it out of every switcher.
  const renderSwitcherChip = (option: LeagueOption, editing: boolean) => {
    const pinned = savedSlots.includes(option.sport);
    const preferred = option.defaultInSwitcher !== false || pinned || prefs.favoriteLeagues.includes(option.sport);
    const label = SPORT_LABEL[option.sport] ?? option.label;
    const note = option.offseason ? "offseason" : option.upcomingLabel ? `starts ${option.upcomingLabel}` : undefined;
    return (
      <SwitcherChip
        key={option.sport}
        label={label}
        note={note}
        sport={markSport(option.sport)}
        checked={isSwitcherChecked(option)}
        onToggle={(on) => {
          keepSeen(option.sport, on);
          const hiddenLeagues = new Set(prefs.hiddenLeagues ?? []);
          const shownLeagues = new Set(prefs.shownLeagues ?? []);
          hiddenLeagues.delete(option.sport);
          shownLeagues.delete(option.sport);
          // A column showing it closes (the lock pins it there, so it is
          // preferred now); turning it back on brings the column back.
          const closing = on ? {} : closeColumnsShowing(option.sport);
          if (on && !preferred) {
            shownLeagues.add(option.sport);
          } else if (!on && (preferred || Object.keys(closing).length)) {
            hiddenLeagues.add(option.sport);
          }
          // An untick feeds the Add more… sheet's "Previously removed" group
          // too; a tick takes the league off it. Same patch, so Undo restores
          // the list and the columns as well.
          updateWithUndo(`${label} ${on ? "on" : "off"}`, {
            ...closing,
            hiddenLeagues: hiddenLeagues.size ? [...hiddenLeagues] : undefined,
            shownLeagues: shownLeagues.size ? [...shownLeagues] : undefined,
            removedLeagues: on ? dropRemoved(prefs.removedLeagues, option.sport) : noteRemoved(prefs.removedLeagues, [option.sport]),
          });
        }}
        onRemove={editing ? () => updateWithUndo(`${label} hidden`, { ...closeColumnsShowing(option.sport), catalogHiddenLeagues: [...catalogHidden, option.sport] }) : undefined}
      />
    );
  };

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
    // It also fills a logo today's games did not carry (Jacob 10/1: favorite
    // chips showed no logo when their league was not on the board).
    for (const [, list] of teamsBySportCache) {
      for (const t of list) {
        const known = teamLookup.get(t.id);
        if (!known) {
          teamLookup.set(t.id, { id: t.id, displayName: t.displayName, logo: t.logo });
        } else if (!known.logo && t.logo) {
          teamLookup.set(t.id, { ...known, logo: t.logo });
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

  const removeTeam = (id: string, name: string) => {
    updateWithUndo(`${name} removed`, { favoriteTeams: prefs.favoriteTeams.filter((t) => t !== id) });
  };

  const clearTeamsForSport = (sport: Sport) => {
    updateWithUndo(`${SPORT_LABEL[sport] ?? sport} teams cleared`, {
      favoriteTeams: prefs.favoriteTeams.filter((id) => teamSportFromId(id) !== sport),
    });
  };

  const clearAllTeams = () => {
    if (prefs.favoriteTeams.length === 0) return;
    updateWithUndo("Teams cleared", { favoriteTeams: [] });
  };

  const toggleTeamFavorite = (teamId: string) => {
    if (prefs.favoriteTeams.includes(teamId)) {
      updatePrefs({ favoriteTeams: prefs.favoriteTeams.filter((id) => id !== teamId) });
    } else {
      updatePrefs({ favoriteTeams: [...prefs.favoriteTeams, teamId] });
    }
  };

  // Reset shows "Settings reset · Undo" for 15 s (Jacob 9/28), through the
  // same undo as every other destructive click. The remembered "Show teams"
  // taps live outside prefs (lib/pairingMask), so they ride in the undo entry.
  const resetAll = () => {
    // A second Reset inside the window keeps the first one's list too.
    const pairings = [undo?.pairings, clearRememberedPairings()].filter(Boolean).join(",") || undefined;
    updateWithUndo("Settings reset", resetPatch(), { pairings });
    applyThemeAttr("system");
  };

  const resetPatch = (): Partial<Preferences> => ({
    favoriteLeagues: [],
    favoriteTeams: [],
    theme: "system",
    showRatings: false,
    skipExplainer: false,
    skipNewsExplainer: false,
    skipBoxscoreWarning: false,
    showNews: false,
    firstLeague: undefined,
    secondLeague: undefined,
    thirdLeague: undefined,
    fourthLeague: undefined,
    fifthLeague: undefined,
    newsThirdLeague: undefined,
    newsTopNews: undefined,
    newsGenericHidden: undefined,
    topNewsHidden: undefined,
    newsGenericSlot: undefined,
    // Yesterday, not "smart" — this is the documented fresh-install default
    // (see `defaults` in preferences.ts, moved off "smart" on 2026-08-09 so a
    // new visitor after 1 PM local isn't dropped on a board of not-yet-started
    // games). Like smartCutoffHour/newsColCount/newsTypeFilter below, this pref
    // carries an explicit non-undefined default, so a reset must write that
    // value rather than "smart" for reset to match a genuine fresh install.
    defaultDateMode: "yesterday",
    defaultLandingView: "remember",
    defaultRatings: "auto",
    hideLeagueChevrons: undefined,
    hideTeamStars: undefined,
    favoritesOnly: undefined,
    favoritesOnlyStrict: undefined,
    hideWatchLaterPill: undefined,
    watchQueue: undefined,
    upcomingRecordLeagues: undefined,
    hideUpcomingRecords: undefined,
    // Reset means "act like a fresh install", and on a fresh install the
    // stars are on for two visits before the app hides them itself. Leaving
    // the counter at 3 would re-hide them on the very next open, which reads
    // as the reset not having worked. See lib/sessionVisits.ts.
    sessionCount: undefined,
    lastSessionAt: undefined,
    wcBannerDismissed: undefined,
    // Sibling of wcBannerDismissed: a full reset should bring back every
    // season-kickoff banner too, so clear the per-kickoff dismissal list.
    // Read as `?? []`, so undefined restores the fresh-install "none dismissed".
    kickoffBannersDismissed: undefined,
    leagueSwitcherMode: undefined,
    hiddenLeagues: undefined,
    shownLeagues: undefined,
    removedLeagues: undefined,
    // The spoiler-protection + layout controls the panel also exposes were
    // omitted here, so "Reset all settings to defaults" left them at whatever
    // the user had set — a reset could keep the video title strip revealed,
    // the seek cap lifted, or news headlines un-blurred, which defeats the
    // no-spoiler defaults a reset is supposed to restore. Clearing each to
    // undefined mirrors a fresh install: JSON.stringify drops undefined keys,
    // and every read falls back to its documented default (`?? true`/`?? false`
    // /`?? "both"` /`!!`). The three prefs with an explicit non-undefined
    // default in `defaults` (smartCutoffHour: 13, newsColCount: 3,
    // newsTypeFilter: "reddit") can't rely on that undefined fallback, so reset
    // each to its documented default value instead — otherwise a user's chosen
    // news source-type filter (e.g. "ESPN only") survived "Reset to defaults".
    maskVideoTitle: undefined,
    hideControlsHint: undefined,
    youtubeNativeControls: undefined,
    videoSeekControl: undefined,
    videoSeekFill: undefined,
    videoAllowEnd: undefined,
    videoWarnHalfway: undefined,
    revealNewsTitles: undefined,
    showTextPosts: undefined,
    revealNewsMedia: undefined,
    // The remaining news-view state the toolbar persists was still omitted, so
    // a reset kept the user's Feed-vs-Cards view, the 🎥 Videos-only filter, and
    // their drag-reordered source-type order. newsHiddenSources belongs here
    // too: it has no live setter, but it is still APPLIED as a source filter, so
    // a value left in localStorage from an earlier build hides sources with no
    // UI to clear it — a reset is the only way out. All four have no non-
    // undefined default, so clearing to undefined restores the fresh-install
    // default (Cards view, no video filter, default order, nothing hidden).
    // newsOldestFirst (the ⇅ control) was the last toolbar pref still
    // surviving a reset; it has no non-undefined default either. Same for
    // newsHideSeen (the 👁 control).
    newsFeedView: undefined,
    newsLayout: undefined,
    newsEspnBig: undefined,
    newsAutoplay: undefined,
    newsCardPrefs: undefined,
    newsVideosOnly: undefined,
    newsOldestFirst: undefined,
    newsHideSeen: undefined,
    newsTypeFilterOrder: undefined,
    newsHiddenSources: undefined,
    singleColumn: undefined,
    scrollColumns: undefined,
    newsSingleColumn: undefined,
    hideSensitiveNews: undefined,
    hideCrashNews: undefined,
    // Listen links: read as `?? true` / `?? false`, so undefined is the default.
    showListenLinks: undefined,
    listenAnywhere: undefined,
    timezone: undefined,
    reminderLinkTemplate: undefined,
    smartCutoffHour: 13,
    newsColCount: 3,
    newsTypeFilter: "reddit",
    newsTypeFilters: undefined,
    catalogHiddenLeagues: undefined,
  });

  // The catalog's three cross-league rows, as chips with their ticked state.
  const bestOn = !(prefs.hiddenLeagues ?? []).includes("best");
  const topOption: LeagueOption = { sport: "top", label: ESPN_FRONT_PAGE_LABEL, defaultInSwitcher: false };
  const acrossChips: { key: string; checked: boolean; node: React.ReactNode }[] = [
    ...(BEST_YESTERDAY_ENABLED ? [{
      key: "best",
      checked: bestOn,
      node: (
        <SwitcherChip
          key="best"
          label={BEST_YESTERDAY_LABEL}
          checked={bestOn}
          onToggle={(on) => {
            keepSeen("best", on);
            const hiddenLeagues = new Set(prefs.hiddenLeagues ?? []);
            if (on) hiddenLeagues.delete("best");
            else hiddenLeagues.add("best");
            // Off closes a column showing it, as for a league.
            updateWithUndo(`${BEST_YESTERDAY_LABEL} ${on ? "on" : "off"}`, {
              ...(on ? {} : closeColumnsShowing("best")),
              hiddenLeagues: hiddenLeagues.size ? [...hiddenLeagues] : undefined,
            });
          }}
        />
      ),
    }] : []),
    // ESPN front page starts off (Jacob 9/26), like an opt-in league: on =
    // shownLeagues, and off only needs hiddenLeagues while a column pins it.
    ...(TOP_EVENTS_ENABLED ? [{ key: "top", checked: isSwitcherChecked(topOption), node: renderSwitcherChip(topOption, false) }] : []),
    {
      key: "topnews",
      checked: !prefs.topNewsHidden,
      node: (
        <SwitcherChip
          key="topnews"
          label="Top news"
          checked={!prefs.topNewsHidden}
          onToggle={(on) => {
            keepSeen("topnews", on);
            updateWithUndo(`Top news ${on ? "on" : "off"}`, { topNewsHidden: on ? undefined : true });
          }}
        />
      ),
    },
  ];
  const allLeaguesChip = (
    <LeagueChip
      key="all-leagues"
      label={catalogAll ? "Fewer" : "More leagues"}
      on={false}
      ariaExpanded={catalogAll}
      onClick={() => setCatalogAll((v) => !v)}
      title={catalogAll ? "Show only the leagues in your switcher" : "Show every league HideScore carries"}
    />
  );

  // The email form: signed out it sits under the sign-in buttons; signed in it
  // is the "Link another way" disclosure under the Account line.
  const emailForm = canLinkEmail && (auth.signedIn ? showLinkMore : signedOutEmailOpen) ? (
    <form
      id="hs-link-more"
      className="mt-3 space-y-2"
      onSubmit={async (event) => {
        event.preventDefault();
        setEmailBusy(true);
        setEmailError(false);
        if (emailStep === "email") {
          const result = await requestEmailCode(emailAddress);
          setEmailBusy(false);
          if (result.ok) {
            setEmailStep("code");
            setEmailStatus("Check your email for a six-digit code.");
          } else {
            setEmailError(true);
            setEmailStatus(result.status === 429 ? "Too many tries. Wait a little and try again." : "Couldn’t send a code. Please try again.");
          }
          return;
        }
        const result = await verifyEmailCode(emailAddress, emailCode);
        if (result.ok) { window.location.reload(); return; }
        setEmailBusy(false);
        setEmailError(true);
        setEmailStatus(result.status === 429 ? "Too many tries. Wait a little and try again." : result.status === 401 ? "That code is wrong or expired." : "Couldn’t verify that code.");
      }}
    >
      <input
        type="email"
        inputMode="email"
        autoComplete="email"
        required
        readOnly={emailStep === "code"}
        value={emailAddress}
        onChange={(event) => setEmailAddress(event.target.value)}
        placeholder="Email address"
        aria-label="Email address"
        // On the email step a failed request (bad address, send error)
        // is voiced only by the red role="alert" status below — mark the
        // field itself invalid and point it at that message so a screen
        // reader announces the error state on the input too, matching the
        // FeedbackBox email field's aria-invalid/describedby pattern.
        aria-invalid={emailStep === "email" && emailError ? true : undefined}
        aria-describedby={emailStatus ? "hs-email-auth-status" : undefined}
        className="w-full min-h-11 rounded-lg px-3 text-sm"
        style={{ background: "var(--bg-card)", color: "var(--text)", border: "1px solid var(--border)" }}
      />
      {emailStep === "code" && (
        <input
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]*"
          maxLength={6}
          required
          autoFocus
          value={emailCode}
          onChange={(event) => setEmailCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
          placeholder="6-digit code"
          aria-label="Six-digit sign-in code"
          // On the code step a wrong/expired code is voiced only by the
          // red role="alert" status below — mark the code field invalid
          // and describe it by that message so the error state reaches
          // the input for assistive tech (same pattern as the email field).
          aria-invalid={emailStep === "code" && emailError ? true : undefined}
          aria-describedby={emailStatus ? "hs-email-auth-status" : undefined}
          className="w-full min-h-11 rounded-lg px-3 text-sm tracking-[0.18em]"
          style={{ background: "var(--bg-card)", color: "var(--text)", border: "1px solid var(--border)" }}
        />
      )}
      <button
        type="submit"
        disabled={emailBusy}
        className="w-full min-h-11 rounded-lg text-sm font-semibold disabled:opacity-50"
        style={{ background: "var(--bg-card-hover)", color: "var(--text)", border: "1px solid var(--border)" }}
      >
        {emailStep === "email" ? (auth.signedIn ? "Link email" : "Email me a code") : "Verify code"}
      </button>
      {emailStep === "code" && (
        <button
          type="button"
          className="w-full text-xs underline"
          style={{ color: "var(--text-muted)" }}
          onClick={() => { setEmailStep("email"); setEmailCode(""); setEmailStatus(""); setEmailError(false); }}
        >
          Use a different email
        </button>
      )}
      {emailStatus && (
        <p id="hs-email-auth-status" role={emailError ? "alert" : "status"} className="text-[11px]" style={{ color: emailError ? "#ef4444" : "var(--text-muted)" }}>
          {emailStatus}
        </p>
      )}
    </form>
  ) : null;

  const accountSection = (
    <Section title="Account">
      {!authKnown ? (
        // Unknown, not signed out. A skeleton is honest; the sign-in
        // buttons would be a lie for the ~2s /api/me can take.
        <div className="space-y-2" aria-busy="true">
          <div className="h-4 w-2/3 rounded animate-pulse" style={{ background: "var(--bg-card-hover)" }} />
          <div className="h-3 w-full rounded animate-pulse" style={{ background: "var(--bg-card-hover)" }} />
          <span className="sr-only">Checking your account</span>
        </div>
      ) : auth.signedIn ? (
        // One line (Jacob 9/28). The address is only a tooltip: for
        // Apple it is a private relay address, which is noise. Linking a
        // second sign-in sits right under it (Jacob 10/1: it was down in the
        // bottom row, far from the account it changes). Sign out and Delete
        // stay in the quiet row at the bottom.
        <div>
          <p className="flex items-center gap-1.5 text-sm" style={{ color: "var(--text)" }} title={auth.email ?? undefined}>
            <ProviderMark provider={signedInProvider} />
            <span>
              Signed in{signedInProvider ? ` with ${PROVIDER_LABEL[signedInProvider] ?? signedInProvider}` : ""}
              <span style={{ color: "var(--text-muted)" }}> · synced</span>
            </span>
          </p>
          {(linkableProviders.length > 0 || canLinkEmail) && (
            <button type="button"
              onClick={() => setShowLinkMore((v) => !v)}
              aria-expanded={showLinkMore}
              aria-controls={showLinkMore ? "hs-link-more" : undefined}
              className="mt-1 text-[11px] underline underline-offset-2 cursor-pointer transition-opacity hover:opacity-80"
              style={{ color: "var(--text-muted)" }}
            >
              Link another way to sign in
            </button>
          )}
          {showLinkMore && linkableProviders.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-3">
              {linkableProviders.map((l) => (
                <button key={l.key} type="button"
                  onClick={l.onClick}
                  className="flex-1 min-w-[120px] py-2 rounded-lg text-sm font-medium cursor-pointer transition-colors"
                  style={{ background: "transparent", color: "var(--text)", border: "1px solid var(--border)" }}
                >
                  Link {l.label}
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {auth.providers?.apple !== false && (
          <button type="button"
            onClick={() => signInWithApple()}
            className="w-full py-2.5 rounded-lg text-sm font-semibold cursor-pointer transition-opacity hover:opacity-90 flex items-center justify-center gap-2"
            style={{
              background: resolvedTheme === "dark" ? "#fff" : "#000",
              color: resolvedTheme === "dark" ? "#000" : "#fff",
            }}
          >
            <AppleLogo size={15} />
            Sign in with Apple
          </button>
          )}
          {auth.providers?.google && canUseGoogle && (
          <button type="button"
            onClick={() => signInWithGoogle()}
            className="w-full py-2.5 rounded-lg text-sm font-semibold cursor-pointer transition-opacity hover:opacity-90 flex items-center justify-center gap-2"
            style={{ background: "#fff", color: "#1f1f1f", border: "1px solid #dadce0" }}
          >
            <GoogleG size={15} />
            Sign in with Google
          </button>
          )}
          <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
            Sign in to sync your teams, layout, and settings across every browser and device.
          </p>
          {canLinkEmail && !signedOutEmailOpen && (
            <button type="button"
              onClick={() => setShowEmailForm(true)}
              aria-expanded={false}
              className="w-full text-[11px] underline cursor-pointer"
              style={{ color: "var(--text-muted)" }}
            >
              Use email instead
            </button>
          )}
        </div>
      )}
      {emailForm}
    </Section>
  );

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
        // tabIndex=-1 makes the drawer programmatically focusable (see the
        // focus-management effect) without adding it to the tab order; outline
        // none suppresses the ring since it's focused only to seat assistive tech.
        tabIndex={-1}
        className="absolute right-0 top-0 bottom-0 w-full sm:max-w-md flex flex-col shadow-2xl"
        style={{
          background: "var(--bg)",
          borderLeft: "1px solid var(--border)",
          paddingTop: "env(safe-area-inset-top)",
          paddingBottom: "env(safe-area-inset-bottom)",
          outline: "none",
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 py-3"
          style={{ borderBottom: "1px solid var(--border)" }}
        >
          <h2 className="text-base font-bold" style={{ color: "var(--text)" }}>Settings</h2>
          <div className="flex items-center gap-2">
          {/* The live region stays mounted so a screen reader hears each
              write; only its text comes and goes. */}
          <span
            role="status"
            aria-live="polite"
            data-testid="settings-saved"
            className={`flex items-center gap-1 text-[11px] transition-opacity duration-300 motion-reduce:transition-none ${savedMark === "show" ? "opacity-100 animate-fade-in" : "opacity-0"}`}
            style={{ color: "var(--text-muted)" }}
          >
            {savedMark && (
              <>
                <svg aria-hidden="true" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                {signedInKnown ? "Saved · synced" : "Saved"}
              </>
            )}
          </span>
          <button type="button"
            onClick={onClose}
            aria-label="Close settings"
            className="w-8 h-8 flex items-center justify-center rounded-full transition-colors cursor-pointer"
            style={{ color: "var(--text-muted)" }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-card-hover)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
          >
            <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-6">
          {/* Section order (Jacob 9/28, 10/1, 10/4): Theme, Leagues,
              Favorite teams, Default view, News, Highlight video, Account,
              Share, More settings (Links sit at its end), then the Sign out ·
              Reset · Delete row and the legal row. Signed out (or not yet known), Account goes first
              instead, so the cross-device value prop is the first thing seen. */}
          {!signedInKnown && accountSection}
          {/* Theme — first when signed in (Jacob 9/28): one row, three pills. */}
          <Section title="Theme">
            <RadioGroup
              label="Theme"
              value={prefs.theme}
              options={THEME_OPTIONS}
              onChange={(v) => {
                updatePrefs({ theme: v });
                applyThemeAttr(v);
              }}
            />
          </Section>

          {/* Leagues — second (Jacob 9/28: the switcher was the hardest thing
              in the panel to reach). Was "League columns", fifth. My leagues
              first, as chips (a tick = in the header switcher), then the
              columns as one row of pills like the board header. */}
          <Section title="Leagues">
            <div>
              <div className="flex items-center justify-between gap-3 mb-1.5">
                <span className="text-sm font-medium" style={{ color: "var(--text)" }}>My leagues</span>
                <span className="flex items-center gap-3 text-[11px]" style={{ color: "var(--text-muted)" }}>
                  {catalogAll && (offseasonRowCount > 0 || catalogHideOffseason) && (
                    <label
                      className="flex items-center gap-1.5 cursor-pointer select-none"
                      title="Leagues pinned to a column stay listed even when they are between seasons"
                    >
                      <input
                        type="checkbox"
                        checked={catalogHideOffseason}
                        onChange={(event) => {
                          setCatalogHideOverride(event.target.checked);
                          updatePrefs({ hideOffseasonInCatalog: event.target.checked ? true : undefined });
                        }}
                        className="cursor-pointer accent-[var(--accent)]"
                      />
                      <span>
                        Hide offseason
                        {catalogHideOffseason && hiddenOffseasonCount > 0 && ` · ${hiddenOffseasonCount} hidden`}
                      </span>
                    </label>
                  )}
                  <button type="button"
                    onClick={() => setEditingCatalog((v) => !v)}
                    aria-pressed={editingCatalog}
                    className="underline underline-offset-2 cursor-pointer hover:opacity-80"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {editingCatalog ? "Done" : "Edit list"}
                  </button>
                </span>
              </div>
              {/* Ticked leagues only until "More leagues" opens the whole
                  catalog, like the Favorite teams league row (Jacob 9/28). */}
              <div className="space-y-2" role="group" aria-label="Leagues in the header switcher">
                {catalogAll ? (
                  <>
                    {/* The cross-league columns and the news feed (Jacob 9/26):
                        on by default, and unticking one takes it out of every
                        switcher and off the board, like a league. No × here —
                        each is already its own on/off. */}
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[10px] font-semibold uppercase tracking-wide mr-0.5" style={{ color: "var(--text-muted)" }}>Across leagues</span>
                      {acrossChips.map((c) => c.node)}
                    </div>
                    {/* Groups as before, each heading inline at the start of
                        its own row of chips so the list stays short. */}
                    {visibleLeagueGroups.map((group, gi) => (
                      <div key={group.key} className="flex flex-wrap items-center gap-1.5">
                        <span aria-hidden="true" className="text-xs leading-none -mr-0.5">{group.emoji}</span>
                        <span className="text-[10px] font-semibold uppercase tracking-wide mr-0.5" style={{ color: "var(--text-muted)" }}>{group.label}</span>
                        {group.options.map((option) => renderSwitcherChip(option, editingCatalog))}
                        {gi === visibleLeagueGroups.length - 1 && allLeaguesChip}
                      </div>
                    ))}
                    {visibleLeagueGroups.length === 0 && allLeaguesChip}
                  </>
                ) : (
                  <div className="flex flex-wrap items-center gap-1.5">
                    {/* An unticked chip keeps its place until the drawer
                        closes (stickyOff), so a mis-tap is one tap to undo. */}
                    {acrossChips.filter((c) => c.checked || stickyOff.has(c.key)).map((c) => c.node)}
                    {visibleLeagueGroups.flatMap((group) => group.options)
                      .filter((option) => isSwitcherChecked(option) || stickyOff.has(option.sport))
                      .map((option) => renderSwitcherChip(option, editingCatalog))}
                    {allLeaguesChip}
                  </div>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-xs">
                {catalogHiddenCount > 0 && (
                  <button type="button"
                    onClick={() => updatePrefs({ catalogHiddenLeagues: undefined })}
                    className="underline underline-offset-2 cursor-pointer hover:opacity-80"
                    style={{ color: "var(--text-muted)" }}
                    aria-label={`${catalogHiddenCount} hidden from this list. Show them again`}
                  >
                    {catalogHiddenCount} hidden · Show
                  </button>
                )}
                {onRequestLeague && (
                  // Last line of the catalog, italic and quiet: the person
                  // reading it has just scanned every league we carry and not
                  // found theirs, which is the only moment the ask is useful.
                  <button
                    type="button"
                    onClick={onRequestLeague}
                    className="italic underline underline-offset-2 cursor-pointer hover:opacity-80"
                    style={{ color: "var(--text-muted)" }}
                  >
                    Request a league
                  </button>
                )}
              </div>
            </div>
            <div>
              <div className="text-sm font-medium" style={{ color: "var(--text)" }}>Columns</div>
              <div className="text-[11px] mb-1.5" style={{ color: "var(--text-muted)" }}>
                Left to right, as on the board. You can also tap a column header there.
              </div>
              {/* One pill per column, like the board header (Jacob 9/28); it
                  was a labelled full-width select per slot. Slots 4-5 only
                  when the board itself is wide enough for five columns. Their
                  saved prefs stay untouched either way. */}
              <div className="flex flex-wrap gap-1.5">
                {(isWideBoard ? [0, 1, 2, 3, 4] : [0, 1, 2]).map((idx) => {
                  const fallbackLabel = displayedLeagues[idx]?.label;
                  const saved = slotValues[idx];
                  // A "top" or "best" pin while that column is switched off reads
                  // as Auto here, which is what resolveSlot makes of it.
                  const value = (saved === "top" && !TOP_EVENTS_ENABLED) || (saved === "best" && !BEST_YESTERDAY_ENABLED) ? undefined : saved;
                  // Auto shows the mark of the league it resolves to.
                  const mark = markSport(value ?? displayedLeagues[idx]?.sport);
                  return (
                    // The pill is our own text; the real <select> lies over
                    // it, invisible, so the native picker opens on tap. A
                    // visible select would be 16px on a phone (globals.css, no
                    // iOS focus zoom) and far too wide for three in a row.
                    <span
                      key={idx}
                      className={`relative inline-flex items-center gap-1 rounded-full ${mark ? "pl-1.5" : "pl-3"} pr-2.5 py-1 text-xs font-semibold focus-within:ring-2 focus-within:ring-[var(--accent)]`}
                      style={{
                        background: value ? "var(--bg-card-hover)" : "var(--bg-card)",
                        border: "1px solid var(--border)",
                        color: value === "empty" ? "var(--text-muted)" : "var(--text)",
                      }}
                    >
                      {mark && <LeagueMark sport={mark} className="-my-0.5" />}
                      <span className="truncate max-w-[7.5rem]">{slotPillText(value, fallbackLabel)}</span>
                      <span aria-hidden="true" className="text-[10px]" style={{ color: "var(--text-muted)" }}>▾</span>
                      <select
                        value={value ?? ""}
                        onChange={(e) => {
                          const v = e.target.value;
                          setSlot(idx, v === "" ? undefined : v === "empty" ? "empty" : (v as Sport));
                        }}
                        aria-label={`Slot ${idx + 1} league`}
                        title={`Column ${idx + 1}`}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      >
                        <option value="">{fallbackLabel ? `Auto (${fallbackLabel})` : "Auto"}</option>
                        {BEST_YESTERDAY_ENABLED && <option value="best">{BEST_YESTERDAY_LABEL}</option>}
                        {TOP_EVENTS_ENABLED && <option value="top">{ESPN_FRONT_PAGE_LABEL}</option>}
                        {slotDropdownGroups(value).map((group) => (
                          <optgroup key={group.key} label={group.label}>
                            {group.options.map((option) => (
                              <option key={option.sport} value={option.sport}>{optionText(option)}</option>
                            ))}
                          </optgroup>
                        ))}
                        <option value="empty">Remove col</option>
                      </select>
                    </span>
                  );
                })}
              </div>
              {/* A pinned league between seasons keeps its pill; say what the
                  board shows meanwhile. */}
              {(isWideBoard ? [0, 1, 2, 3, 4] : [0, 1, 2]).map((idx) => {
                const saved = slotValues[idx];
                const option = saved && saved !== "empty" ? leagueOptions.find((o) => o.sport === saved) : undefined;
                if (!option?.offseason) return null;
                const showing = displayedLeagues[idx]?.label;
                return (
                  <p key={idx} className="text-[11px] mt-1" style={{ color: "var(--text-muted)" }}>
                    Column {idx + 1}: Offseason · saved for its return{showing ? `; showing ${showing}` : ""}
                  </p>
                );
              })}
            </div>
            {/* Was the only row left in its own "Board layout" section once the
                keys hint moved to More settings (Jacob 9/25). Same pref, same
                device-only storage — only where the row sits changed. Was also
                called just "Single column", same as the old News one — flipping
                the wrong one looked like a bug (Jacob 8/31). */}
            <ToggleRow
              label="One wide column"
              hint="Stack your leagues in one wide column with bigger cards, instead of side-by-side columns. This device only."
              checked={prefs.singleColumn ?? false}
              onChange={(v) => updatePrefs({ singleColumn: v })}
            />
          </Section>

          {/* Favorite teams — right under Leagues (Jacob 9/28; 9/25 it moved
              up from sixth: 12 of 29 synced accounts have picked teams). Search first, then your picks,
              then the two display options (Jacob 9/25 shape pass: the 17-chip
              records picker used to sit above the search box). */}
          <Section title="Favorite teams">
            <TeamPicker
              sports={teamLeagueOptions}
              mySports={myLeagueSports}
              favorites={prefs.favoriteTeams}
              onToggle={toggleTeamFavorite}
              teamsBySport={teamsBySportCache}
              loadingSports={loadingTeamSports}
              loadSport={loadTeamSport}
              knownTeams={knownTeams}
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
                      <button type="button"
                        onClick={() => clearTeamsForSport(sport)}
                        aria-label={`Clear ${SPORT_LABEL[sport] ?? sport} teams`}
                        className="text-[11px] underline underline-offset-2 cursor-pointer hover:opacity-80"
                        style={{ color: "var(--text-muted)" }}
                      >
                        Clear
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {teams.map((t) => (
                        <button type="button"
                          key={t.id}
                          onClick={() => removeTeam(t.id, t.displayName)}
                          className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs cursor-pointer transition-opacity hover:opacity-80"
                          style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text)" }}
                          title="Remove from favorites"
                          aria-label={`Remove ${t.displayName} from favorites`}
                        >
                          {/* The picker grid's logo: a one-letter tile when there
                              is none, or it 404s, so every chip keeps a mark. */}
                          <PickerTeamLogo logo={t.logo} name={t.displayName} />
                          <span>{t.displayName}</span>
                          <svg aria-hidden="true" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--text-muted)" }}>
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
                  <button type="button"
                    onClick={clearAllTeams}
                    className="text-xs underline underline-offset-2 cursor-pointer hover:opacity-80"
                    style={{ color: "var(--text-muted)" }}
                  >
                    Clear all
                  </button>
                </div>
              </>
            )}
            <ToggleRow
              label="Stars on game cards"
              hint="The ★ next to team names"
              checked={!prefs.hideTeamStars}
              onChange={(v) => updatePrefs({ hideTeamStars: !v })}
            />
            <ToggleRow
              label="Only my teams"
              hint="Hide games your starred teams aren't in. A league with no starred team still shows all its games until you star one."
              checked={!!prefs.favoritesOnly}
              // Off also clears the per-league ✕ list, so turning it back on
              // starts from the "star a team" banner everywhere.
              onChange={(v) => updatePrefs(v ? { favoritesOnly: true } : { favoritesOnly: undefined, favoritesOnlyStrict: undefined })}
            />
            {WATCH_QUEUE_ENABLED ? (
              <ToggleRow
                label="Show the Later pill on cards"
                hint="Tap Later on a game to pin it to a Watch queue at the top of the board"
                checked={!prefs.hideWatchLaterPill}
                onChange={(v) => updatePrefs({ hideWatchLaterPill: !v })}
              />
            ) : null}
            {/* Label, one hint line, then one on/off chip per league in My
                leagues (Jacob 10/4: the picker behind a summary was confusing).
                The first tap retires the old NFL-only switch for good. */}
            <div>
              <div className="text-sm font-medium" style={{ color: "var(--text)" }}>Records on upcoming games</div>
              <div className="text-[11px] mb-1.5" style={{ color: "var(--text-muted)" }}>
                Each team&apos;s record, in italics, on upcoming and live games
              </div>
              {recordKeys.length === 0 ? (
                <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                  No league in My leagues keeps team records.
                </p>
              ) : (
                <div role="group" aria-label="Records on upcoming games" className="flex flex-wrap gap-1.5">
                  {recordKeys.map((k) => (
                    <LeagueChip
                      key={k}
                      label={k === "soccer" ? "Soccer" : SPORT_LABEL[k]}
                      on={recordSelected.has(k)}
                      ariaPressed={recordSelected.has(k)}
                      sport={k === "soccer" ? undefined : k}
                      onClick={() => updatePrefs({ upcomingRecordLeagues: toggleRecordLeague(recordSelected, k), hideUpcomingRecords: undefined })}
                    />
                  ))}
                </div>
              )}
              {/* The spoiler warning, only while a league that plays most days
                  is on (see lib/upcomingRecords.ts). */}
              {recordKeys.some((k) => recordSelected.has(k) && FREQUENT_RECORD_LEAGUES.includes(k)) && (
                <p className="text-[11px] mt-1.5" style={{ color: "var(--text-muted)" }}>
                  Leagues that play most days can show a result you have not watched yet.
                </p>
              )}
            </div>
          </Section>

          {/* Default View */}
          <Section title="Default view">
            {/* Landing date and its switch time share one row (Jacob 9/28): the
                hour sits inline in a hint under Automatic, not in a second
                field. Falls back to "yesterday", the documented fresh-install
                default (see `defaults` in preferences.ts, moved off "smart" on
                2026-08-09) — a stale "smart" fallback made the row highlight
                Automatic for a board the app renders as yesterday. */}
            <Field label="Landing date">
              <RadioGroup
                label="Landing date"
                value={prefs.defaultDateMode ?? "yesterday"}
                options={DATE_MODE_OPTIONS}
                onChange={(v) => updatePrefs({ defaultDateMode: v })}
              />
            </Field>
            {(prefs.defaultDateMode ?? "yesterday") === "smart" && (
              <p className="text-[11px] -mt-1.5 text-right" style={{ color: "var(--text-muted)" }}>
                switches to today at{" "}
                <select
                  value={prefs.smartCutoffHour ?? 13}
                  onChange={(e) => updatePrefs({ smartCutoffHour: Number(e.target.value) })}
                  aria-label="Automatic switch time"
                  className="rounded-md px-1 py-0.5 text-[11px] cursor-pointer"
                  style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text)" }}
                >
                  {Array.from({ length: 24 }, (_, h) => (
                    <option key={h} value={h}>{hourLabel(h)}</option>
                  ))}
                </select>
              </p>
            )}
            {/* Time zone (Jacob 10/4): moved up from More settings because a
                user asked for it; it decides which day counts as today, so it
                sits with the landing date. */}
            <Field label="Time zone" hint="Used for game times AND which day counts as today">
              <div className="space-y-1.5">
              <RadioGroup
                label="Time zone"
                value={zonePill}
                options={ZONE_PILLS.map((z) => ({ value: z.value, label: z.label, hint: z.zone ? zoneCity(z.zone) : undefined }))}
                columns={6}
                onChange={(v) => {
                  if (v === "other") { setZoneOtherOpen(true); return; }
                  setZoneOtherOpen(false);
                  updatePrefs({ timezone: ZONE_PILLS.find((z) => z.value === v)?.zone });
                }}
              />
              {zonePill === "other" && (
              <select
                value={prefs.timezone ?? ""}
                onChange={(e) => {
                  const tz = e.target.value || undefined;
                  // Auto or one of the four from the list lights its pill instead.
                  if (!tz || ZONE_PILLS.some((z) => z.zone === tz)) setZoneOtherOpen(false);
                  updatePrefs({ timezone: tz });
                }}
                aria-label="All time zones"
                className="w-full px-3 py-2 rounded-lg text-sm cursor-pointer"
                style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text)" }}
              >
                <option value="">Auto — your device{deviceTimeZone ? ` (${deviceTimeZone})` : ""}</option>
                {/* A saved zone this runtime doesn't list ("UTC", "US/Eastern")
                    still applies, so show it rather than a false "Auto". */}
                {prefs.timezone && !TIME_ZONES.includes(prefs.timezone) && (
                  <option value={prefs.timezone}>{prefs.timezone.replace(/_/g, " ")}</option>
                )}
                {TIME_ZONES.map((tz) => (
                  <option key={tz} value={tz}>{tz.replace(/_/g, " ")}</option>
                ))}
              </select>
              )}
              <p aria-live="polite" className="text-[11px]" style={{ color: "var(--text-muted)" }}>{zoneLine}</p>
              </div>
            </Field>
            <Field label="Landing view" hint="Scores, ratings or news on launch">
              <RadioGroup
                label="Landing view"
                value={prefs.defaultLandingView ?? "remember"}
                options={LANDING_VIEW_OPTIONS}
                columns={4}
                onChange={(v) => updatePrefs({ defaultLandingView: v })}
              />
            </Field>
            {/* Auto's rule was only a hover tooltip on the pill. */}
            <Field label="Ratings on launch" hint="Auto = off in the morning, last state after noon">
              <RadioGroup
                label="Ratings on launch"
                value={prefs.defaultRatings ?? "auto"}
                options={DEFAULT_RATINGS_OPTIONS}
                onChange={(v) => updatePrefs({ defaultRatings: v })}
              />
            </Field>
          </Section>

          {/* News — one toggle (Jacob 9/25: "idk if 2 checkboxes needed"). It used to
              have "Also hide wrecks nobody got hurt in" nested under it; now
              turning it on hides both, and off clears both. Every account that
              had either on (2 of 29 synced, 9/12) had BOTH on, so nobody's
              filter changes. It reads as on if either pref is set, so a blob
              from the two-toggle days never hides posts behind a switch that
              shows off — and nothing is rewritten until the user taps it.
              "One wide column — news" and "3rd news column" left this section
              the same day: 0 of 29 had ever set either, and both still live on
              the news board itself (the header toggle, the column-3 switcher). */}
          <Section title="News">
            <ToggleRow
              label="Hide upsetting news"
              checked={!!(prefs.hideSensitiveNews || prefs.hideCrashNews)}
              onChange={(v) => updatePrefs({ hideSensitiveNews: v, hideCrashNews: v })}
            />
          </Section>

          {/* Player choice leads; the spoiler-safe-only controls below render
              only when that player is picked. */}
          <Section title="Highlight video player">
            {/* YouTube has been the default since 8/9 (see youtubeNativeControls
                in preferences.ts); this hint said the opposite until 9/25. */}
            <Field label="Player" hint="YouTube is the default. Spoiler-safe hides how far into the clip you are.">
              <RadioGroup
                label="Highlight video player"
                value={(prefs.youtubeNativeControls ?? true) ? "youtube" : "safe"}
                options={PLAYER_OPTIONS}
                columns={2}
                onChange={(v) => updatePrefs({ youtubeNativeControls: v === "youtube" })}
              />
            </Field>
            <ToggleRow
              label="Cover video title"
              hint="Black bar over YouTube's title so the headline can't spoil. UFC, MMA and boxing clips stay covered either way — those channels put the result in the title."
              checked={prefs.maskVideoTitle ?? false}
              onChange={(v) => updatePrefs({ maskVideoTitle: v })}
            />
            {/* These four only ever apply to the spoiler-safe player, so they
                render only when it is chosen. They used to render disabled +
                opacity-40 for everyone: four dead rows that 18 of 21 synced
                accounts could see but never touch, and that nobody had ever
                changed (Jacob 8/31). Hidden, not greyed — a control you are not
                allowed to use is not a control. */}
            {!(prefs.youtubeNativeControls ?? true) && (
            <fieldset className="space-y-3">
              <legend className="sr-only">Spoiler-safe player controls</legend>
              <Field label="Skip controls" hint="Jump around a clip — drag is capped at 90% so the ending stays hidden">
                <RadioGroup
                  label="Skip controls"
                  value={prefs.videoSeekControl ?? "both"}
                  options={SEEK_CONTROL_OPTIONS}
                  onChange={(v) => updatePrefs({ videoSeekControl: v })}
                />
              </Field>
              <Field label="Seek bar fill" hint="The bar shows no position by default so it can't spoil how far in you are">
                <RadioGroup
                  label="Seek bar fill"
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
            </fieldset>
            )}
          </Section>

          {signedInKnown && accountSection}

          {/* Share (Jacob 10/1: was "Share & reset"; Reset moved to the
              quiet bottom row). */}
          <Section title="Share">
            <div className="flex flex-col gap-2">
              {(() => {
                const nothingToShare = prefs.favoriteTeams.length === 0 && prefs.favoriteLeagues.length === 0 && !prefs.firstLeague && !prefs.secondLeague && !prefs.thirdLeague && !prefs.fourthLeague && !prefs.fifthLeague;
                return (
                  <>
                    <button type="button"
                      onClick={onShareFavorites}
                      disabled={nothingToShare}
                      className="w-full py-2 rounded-lg text-sm font-medium cursor-pointer transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                      style={{ background: "var(--accent)", color: "white" }}
                    >
                      {shareCopied ? "Copied!" : "Copy settings link"}
                    </button>
                    {nothingToShare && (
                      <p className="text-[11px] -mt-1" style={{ color: "var(--text-muted)" }}>
                        Pick a favorite team or league first — then this saves a link that restores your setup.
                      </p>
                    )}
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
                        className="hidden w-full py-2 rounded-lg text-sm cursor-grab transition-colors sm:flex items-center justify-center gap-1.5"
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
                      <p className="hidden text-[11px] -mt-1 sm:block" style={{ color: "var(--text-muted)" }}>
                        {isSafari
                          ? "Drag this onto your bookmarks bar to save this setup. Clicking copies the link instead."
                          : "The bookmark restores this exact setup. Clicking copies the link instead."}
                      </p>
                    )}
                  </>
                );
              })()}
            </div>
          </Section>

          {/* More settings (Jacob 9/25): rows almost nobody changes, behind one
              closed fold so the sections above are what you see. Of 29 synced
              accounts on 9/12: header switcher 1 changed, keys hint 0, reminder
              link 0; the two explainer rows are an undo, not a setting. Time zone
              left 9/28 (0 of 35 blobs had set it), came back 10/4, and moved
              to Default view the same day at Jacob's request; its ZIP helper
              stays out. Links (Reddit, YouTube, Reminder, TV channels) close
              the fold since 10/4: pasted personal data, rarely touched. */}
          <details className="group">
            <summary
              className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide font-semibold cursor-pointer select-none marker:content-none [&::-webkit-details-marker]:hidden"
              style={{ color: "var(--text-muted)" }}
            >
              <svg aria-hidden="true" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="transition-transform group-open:rotate-90">
                <polyline points="9 6 15 12 9 18" />
              </svg>
              More settings
            </summary>
            <div className="space-y-3 mt-3">
            <Field label="Header league switcher" hint="How tapping a column header behaves">
              <RadioGroup
                label="Header league switcher"
                value={prefs.leagueSwitcherMode ?? "dropdown"}
                options={SWITCHER_MODE_OPTIONS}
                onChange={(v) => updatePrefs({ leagueSwitcherMode: v })}
              />
            </Field>
            {/* Stored inverted (hideControlsHint) so a fresh install shows it —
                see the pref's note. The row reads the way you'd expect. */}
            <ToggleRow
              label="Keyboard shortcuts hint"
              hint="The “Keys” tag in the bottom-right corner, and the Keys button on an open post. Lists what ↓/↑, ←/→ and Space do. Desktop only."
              checked={!prefs.hideControlsHint}
              onChange={(v) => updatePrefs({ hideControlsHint: !v })}
            />
            {/* Opt-in 5 columns on phones and tablets (Android user ask 10/5).
                Device-only like One wide column, which wins. Sits here, not
                under Leagues, so the main panel keeps its height cap (Jacob
                10/5). A wide screen already shows 5, so the row is hidden there. */}
            {!isWideBoard && (
              <ToggleRow
                label="Scroll columns"
                hint="On phones and tablets, show all 5 columns and scroll sideways. This device only."
                checked={prefs.scrollColumns ?? false}
                onChange={(v) => updatePrefs({ scrollColumns: v })}
              />
            )}
            {/* Bring back a one-time explainer you dismissed. These had their own
                "Spoiler explainers" section, which read like two settings to tune
                — they are an undo, not a preference (Jacob 8/31). */}
            <div className="pt-3" style={{ borderTop: "1px solid var(--border)" }}>
              <p className="text-[11px] mb-2" style={{ color: "var(--text-muted)" }}>
                Bring back a warning you dismissed
              </p>
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
              <ToggleRow
                label="Show box score warning"
                hint="The 'shows the score' confirm before a box score"
                checked={!prefs.skipBoxscoreWarning}
                onChange={(v) => updatePrefs({ skipBoxscoreWarning: !v })}
              />
            </div>
            {/* Links (Jacob 10/4: was its own section above Account). The
                user's own front-ends (lib/frontendLinks.ts), the Reminder link
                and the TV channel list: pasted data, so Reset leaves them
                alone. Neutral copy (Jacob 10/1): no project names, the rule
                frontendLinks.ts keeps. An h4, not a Section h3, so the
                section-order tests never count it. */}
            <div className="pt-3 space-y-3" style={{ borderTop: "1px solid var(--border)" }}>
              <h4 className="text-[11px] uppercase tracking-wide font-semibold" style={{ color: "var(--text-muted)" }}>
                Links
              </h4>
              {/* Listen links (lib/radio.ts): free station players in "Where to
                  watch" and the game details. Most NFL and MLB flagships play
                  only in the home market, so those show only there unless the
                  second toggle is on (VPN users). */}
              <ToggleRow
                label="Radio links"
                hint="A Listen section in Where to watch and in game details. Links go to the station's own player."
                checked={prefs.showListenLinks ?? true}
                onChange={(v) => updatePrefs({ showListenLinks: v })}
              />
              {(prefs.showListenLinks ?? true) && (
                <ToggleRow
                  label="Show local-only radio links everywhere (for VPN users)"
                  hint="Many team stations stream games only inside their home area. Leave off unless you use a VPN."
                  checked={prefs.listenAnywhere ?? false}
                  onChange={(v) => updatePrefs({ listenAnywhere: v })}
                />
              )}
              <FrontendLinkField
                label="Reddit links open at"
                hint="Your own front-end. Leave empty for reddit.com"
                placeholder="https://your-server.example"
                value={prefs.redditFrontend}
                onSave={(v) => updatePrefs({ redditFrontend: v })}
              />
              <FrontendLinkField
                label="YouTube links open at"
                hint="Your own front-end. Leave empty for youtube.com"
                placeholder="https://your-server.example"
                value={prefs.youtubeFrontend}
                onSave={(v) => updatePrefs({ youtubeFrontend: v })}
              />
              {/* "Remind me" link template — personal, off by default. A URL with
                  placeholders that an upcoming game's detail sheet opens on tap
                  (lib/reminderLink.ts). Raycast, Shortcuts, Alfred, Things, … —
                  whatever has a URL scheme on THIS device. Blank = no button. */}
              <div>
                <Field
                  label="Reminder link"
                  hint="Opens this URL from an upcoming game's details. Placeholders: {minutes} {minutes-5} {title} {iso} {time} {date}. Leave blank to hide the button."
                >
                  <input
                    type="url"
                    inputMode="url"
                    value={prefs.reminderLinkTemplate ?? ""}
                    onChange={(e) => {
                      const v = e.target.value;
                      updatePrefs({ reminderLinkTemplate: v.trim() ? v : undefined });
                    }}
                    placeholder="raycast://… or shortcuts://…"
                    spellCheck={false}
                    autoCapitalize="off"
                    autoCorrect="off"
                    autoComplete="off"
                    className="w-full min-h-11 rounded-lg px-3 text-sm"
                    style={{ background: "var(--bg-card)", color: "var(--text)", border: "1px solid var(--border)" }}
                  />
                </Field>
                <p className="text-[11px] mt-1 break-all" style={{ color: "var(--text-muted)" }}>
                  Mac (Raycast): raycast://script-commands/game-reminder?arguments={"{minutes-5}"}&amp;arguments={"{title}"}
                </p>
                <p className="text-[11px] mt-1 break-all" style={{ color: "var(--text-muted)" }}>
                  iPhone (Shortcuts): shortcuts://run-shortcut?name=Game%20Reminder&amp;input=text&amp;text={"{minutes-5}"}%20{"{title}"}
                </p>
              </div>
              {/* TV channel links — personal, off by default (lib/tvChannelLinks.ts).
                  A listed network's chip opens the user's own stream in IINA/VLC
                  instead of the network's site. The list syncs; the player is
                  per device. Reset to defaults leaves both alone: the list is
                  pasted data, not a preference. */}
              <div>
                <Field
                  label="TV channel links"
                  hint="One line per network: ESPN = your stream link. Tapping that network then opens your own player instead of its website. Leave blank to turn off."
                >
                  <textarea
                    rows={4}
                    value={prefs.tvChannelLinks ?? ""}
                    onChange={(e) => {
                      const v = e.target.value;
                      updatePrefs({ tvChannelLinks: v.trim() ? v : undefined });
                    }}
                    placeholder={"ESPN = http://…\nFS1, FOX Sports 1 = http://…"}
                    aria-label="TV channel links"
                    spellCheck={false}
                    autoCapitalize="off"
                    autoCorrect="off"
                    autoComplete="off"
                    className="w-full rounded-lg px-3 py-2 text-xs font-mono"
                    style={{ background: "var(--bg-card)", color: "var(--text)", border: "1px solid var(--border)" }}
                  />
                </Field>
                {prefs.tvChannelLinks && (
                  <div className="mt-3">
                  <Field label="Open channels in" hint="This device only">
                    <select
                      value={prefs.tvPlayer ?? "auto"}
                      onChange={(e) => updatePrefs({ tvPlayer: e.target.value === "auto" ? undefined : (e.target.value as TvPlayer) })}
                      aria-label="Open channels in"
                      className="w-full px-3 py-2 rounded-lg text-sm cursor-pointer"
                      style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text)" }}
                    >
                      <option value="auto">Auto — IINA on a Mac, VLC on iPhone/iPad</option>
                      <option value="iina">IINA</option>
                      <option value="vlc">VLC</option>
                      <option value="raw">The link as written</option>
                    </select>
                  </Field>
                  </div>
                )}
              </div>
            </div>
            </div>
          </details>

          {/* Bottom row (Jacob 10/1): Sign out · Reset to defaults · Delete
              account, all quiet links; signed out it is Reset alone. Reset
              keeps its confirm and the Undo pill. Delete keeps both steps (a
              confirm, then typing DELETE); the "cannot be undone" caveat lives
              in the first confirm. */}
          <div className="pt-3 text-center text-[11px]" style={{ borderTop: "1px solid var(--border)", color: "var(--text-muted)" }}>
            {auth.signedIn && (
              <>
                <button type="button"
                  onClick={() => signOut()}
                  className="underline underline-offset-2 cursor-pointer transition-opacity hover:opacity-80"
                  style={{ color: "var(--text-muted)" }}
                >
                  Sign out
                </button>
                <span aria-hidden="true" className="mx-1.5" style={{ opacity: 0.65 }}>·</span>
              </>
            )}
            <button type="button"
              onClick={() => {
                if (confirm("Reset all settings to defaults? Favorites will be cleared.")) resetAll();
              }}
              className="underline underline-offset-2 cursor-pointer transition-opacity hover:opacity-80"
              style={{ color: "var(--text-muted)" }}
            >
              Reset to defaults
            </button>
            {auth.signedIn && (
              <>
                <span aria-hidden="true" className="mx-1.5" style={{ opacity: 0.65 }}>·</span>
                <button type="button"
                  onClick={async () => {
                    if (!confirm("Permanently delete your account? This removes your synced teams, layout, and settings from our servers and signs you out. It cannot be undone.")) return;
                    // Second, deliberate step: typing the word is enough friction that an
                    // accidental or half-sure tap can't wipe an account, while still being
                    // a plain in-app flow (Apple 5.1.1(v) wants it easy to FIND, not frictionless).
                    const typed = prompt("Last check — this permanently erases your synced data and cannot be undone.\n\nType DELETE to confirm.");
                    if (typed === null) return;
                    if (typed.trim().toUpperCase() !== "DELETE") {
                      alert("Account not deleted — you didn't type DELETE.");
                      return;
                    }
                    const ok = await deleteAccount();
                    if (ok) window.location.href = "/";
                    else alert("Couldn't delete your account. Please try again in a moment.");
                  }}
                  className="underline underline-offset-2 cursor-pointer transition-opacity hover:opacity-80"
                  style={{ color: "var(--text-muted)" }}
                >
                  Delete account
                </button>
              </>
            )}
          </div>

          {/* Legal row — last, and deliberately quiet: muted, small, underlined
              text, never a button. Privacy previously lived ONLY in the page
              footer, which is behind this drawer and unreachable while it's
              open — the one moment someone actually goes looking for it.
              Feedback opens the footer feedback modal with an empty message
              (the "Request a league" link above seeds a prefill instead). */}
          <div className="pt-2 text-center text-[11px]" style={{ color: "var(--text-muted)" }}>
            {onOpenFeedback && (
              <>
                <button
                  type="button"
                  onClick={onOpenFeedback}
                  className="underline underline-offset-2 cursor-pointer transition-opacity hover:opacity-80"
                  style={{ color: "var(--text-muted)" }}
                >
                  Feedback
                </button>
                <span aria-hidden="true" className="mx-1.5" style={{ opacity: 0.65 }}>·</span>
              </>
            )}
            <a
              href="/privacy"
              className="underline underline-offset-2 transition-opacity hover:opacity-80"
              style={{ color: "var(--text-muted)" }}
            >
              Privacy
            </a>
            {/* Native shells only: the web has no store to rate on. A plain anchor
                is what makes this work — hidescore.com is the server.url host and
                there is no allowNavigation list, so a foreign host leaves the
                WebView. Android: Capacitor's Bridge.launchIntent fires an
                ACTION_VIEW Intent and the Play Store app opens on the listing.
                iOS: WebViewDelegationHandler cancels the top-level navigation and
                calls UIApplication.shared.open; apps.apple.com is a universal link,
                so the App Store app opens on the listing with the write-review
                sheet. An in-app browser would only show the store's web page, which
                has no rating control. A LINK is all Apple allows here: no native
                prompt from a button, no "do you like it?" pre-filter, no reward. */}
            {appStore && (
              <>
                <span aria-hidden="true" className="mx-1.5" style={{ opacity: 0.65 }}>·</span>
                <a
                  href={storeReviewHref(appStore)}
                  className="underline underline-offset-2 transition-opacity hover:opacity-80"
                  style={{ color: "var(--text-muted)" }}
                >
                  Rate this app
                </a>
              </>
            )}
          </div>
        </div>
        {/* The undo pill, pinned to the bottom of the drawer for 15 s. With
            a mouse it sits higher: the Keys tag (ControlsHint, z 10000) owns
            the bottom-right corner and covered a long pill's Undo. */}
        {undo && (
          <div
            role="status"
            className="absolute left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-4 py-2 rounded-full text-sm shadow-lg whitespace-nowrap max-w-[calc(100%-2rem)] bottom-[calc(env(safe-area-inset-bottom)+1rem)] [@media(hover:hover)_and_(pointer:fine)]:bottom-[calc(env(safe-area-inset-bottom)+3.25rem)]"
            style={{ background: "var(--text)", color: "var(--bg)" }}
          >
            <span className="truncate">{undo.label}</span>
            <span aria-hidden="true">·</span>
            <button type="button"
              onClick={applyUndo}
              className="font-semibold underline underline-offset-2 cursor-pointer"
            >
              Undo
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// The provider mark in the signed-in Account line.
function ProviderMark({ provider }: { provider: string | null }) {
  if (provider === "apple") return <AppleLogo size={14} />;
  if (provider === "email") return <span aria-hidden="true">✉️</span>;
  if (provider === "google") {
    return <GoogleG size={14} />;
  }
  return null;
}

// Apple's mark in the text colour: the Account line and the sign-in button.
// The 🍎 emoji read as a fruit, not the company (Jacob 10/1).
function AppleLogo({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 17 17" fill="currentColor" aria-hidden="true">
      <path d="M13.79 9.06c-.02-1.86 1.52-2.75 1.59-2.79-.87-1.27-2.22-1.44-2.7-1.46-1.15-.12-2.24.68-2.82.68-.58 0-1.48-.66-2.43-.64-1.25.02-2.4.73-3.04 1.85-1.3 2.25-.33 5.58.93 7.41.62.9 1.35 1.9 2.31 1.86.93-.04 1.28-.6 2.4-.6 1.12 0 1.43.6 2.41.58 1-.02 1.63-.91 2.24-1.81.71-1.04 1-2.05 1.01-2.1-.02-.01-1.94-.74-1.96-2.95l.01-.34zM11.9 3.38c.51-.62.86-1.48.76-2.34-.74.03-1.64.49-2.17 1.11-.47.55-.89 1.43-.78 2.27.83.07 1.67-.42 2.19-1.04z"/>
    </svg>
  );
}

function GoogleG({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"/>
      <path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"/>
      <path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238A11.91 11.91 0 0 1 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"/>
      <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.087 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"/>
    </svg>
  );
}

// What we actually know about the signed-in account: which identity is linked,
// which HideScore clients it has been used on (the iPhone app is invisible to the
// server without the X-HS-Client header — see hsPlatform in lib/prefsSync.ts), and
// how long it has existed. All of it comes from the canonical users/<uid>.json
// record in R2 via /api/me.
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

// One "Links" row: saves on blur or Enter. Empty clears it; anything that is
// not an http(s) address stays in the box with a hint and is not saved. The
// header's "Saved" mark confirms a save (Jacob 10/1); only the error shows here.
function FrontendLinkField({ label, hint, placeholder, value, onSave }: {
  label: string;
  hint: string;
  placeholder: string;
  value: string | undefined;
  onSave: (value: string | undefined) => void;
}) {
  const [draft, setDraft] = useState(value ?? "");
  const [error, setError] = useState(false);
  // A pull from another device changed the saved value: show it.
  const [shown, setShown] = useState(value);
  if (shown !== value) { setShown(value); setDraft(value ?? ""); }
  const commit = () => {
    const typed = draft.trim();
    if (!typed) {
      if (value) onSave(undefined);
      setDraft("");
      return;
    }
    const clean = normalizeFrontend(typed);
    if (!clean) { setError(true); return; }
    setDraft(clean);
    if (clean !== value) onSave(clean);
  };
  return (
    <div>
      <Field label={label} hint={hint}>
        <input
          type="url"
          inputMode="url"
          value={draft}
          onChange={(e) => { setDraft(e.target.value); setError(false); }}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commit(); } }}
          placeholder={placeholder}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          autoComplete="off"
          className="w-full px-3 py-2 rounded-lg text-sm"
          style={{ background: "var(--bg-card)", color: "var(--text)", border: `1px solid ${error ? "rgb(239,68,68)" : "var(--border)"}` }}
        />
      </Field>
      {error && (
        <p role="status" aria-live="polite" className="text-[11px] mt-1" style={{ color: "rgb(239,68,68)" }}>
          Needs https://…
        </p>
      )}
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  // Associate the visible label with the control it names. The label sits in a
  // sibling row ABOVE the control (not wrapping it), so without htmlFor it was a
  // bare, unassociated <label> — a screen reader focusing the <select>/<input>
  // announced it with no name (WCAG 1.3.1/4.1.2). Only wire up intrinsic form
  // controls (child.type is a string like "select"/"input"); custom children
  // like RadioGroup carry their own accessible name (role="group" aria-label),
  // so leave those untouched — their label stays htmlFor-less exactly as before.
  const generatedId = useId();
  const child = isValidElement(children) ? (children as React.ReactElement<{ id?: string }>) : null;
  const isHostControl = child != null && typeof child.type === "string";
  const controlId = isHostControl ? (child!.props.id ?? generatedId) : undefined;
  const control = isHostControl && child!.props.id == null
    ? cloneElement(child!, { id: controlId })
    : children;
  return (
    <div>
      {/* Stack the hint UNDER the label on phones — the old side-by-side
          (label | hint) crushed long hints into a narrow right column that
          clipped and overlapped on mobile (esp. the player rows). sm+ keeps
          them on one row, hint right-aligned, to preserve the dense desktop look. */}
      <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3 mb-1">
        <label htmlFor={controlId} className="text-sm font-medium shrink-0" style={{ color: "var(--text)" }}>{label}</label>
        {hint && <span className="text-[11px] leading-snug sm:text-right" style={{ color: "var(--text-muted)" }}>{hint}</span>}
      </div>
      {control}
    </div>
  );
}

interface RadioOption<T extends string> { value: T; label: string; hint?: string }
function RadioGroup<T extends string>({
  label,
  value,
  options,
  onChange,
  columns = 3,
}: {
  // Names the set of options for assistive tech. The visual <Field> label above
  // each group is a bare, unassociated <label>, so without this a screen reader
  // read the options as free-floating toggle buttons ("Today, pressed") with no
  // hint at what they configure. role="group" + aria-label ties them together
  // and voices the setting ("Landing date"). Kept as role="group" (not
  // radiogroup) because the buttons stay aria-pressed toggles, not roving-focus
  // radios — purely additive, so tab order and behavior are unchanged.
  label: string;
  value: T;
  options: RadioOption<T>[];
  onChange: (v: T) => void;
  // 4 = one row on sm+, 2×2 on phones, so a fourth option never sits alone.
  // 6 = one row at every width (the Time zone pills, short labels).
  columns?: 2 | 3 | 4 | 6;
}) {
  const grid = columns === 6 ? "grid-cols-6" : columns === 4 ? "grid-cols-2 sm:grid-cols-4" : columns === 2 ? "grid-cols-2" : "grid-cols-3";
  return (
    <div role="group" aria-label={label} className={`grid gap-1.5 ${grid}`}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button type="button"
            key={o.value}
            onClick={() => onChange(o.value)}
            aria-pressed={active}
            className={`${columns === 6 ? "px-1 whitespace-nowrap" : "px-2"} py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-colors text-center`}
            style={{
              background: active ? "var(--accent)" : "var(--bg-card)",
              border: `1px solid ${active ? "var(--accent)" : "var(--border)"}`,
              color: active ? "white" : "var(--text)",
            }}
            // The per-option hint carries the detail that distinguishes the
            // choices — and for the Landing view / Ratings groups that detail is
            // the spoiler warning itself ("Always start on news (spoilers)"). It
            // rode ONLY on `title`, a mouse-hover tooltip that assistive tech and
            // keyboard/voice users never get, so a screen-reader user choosing a
            // landing view was never told which options reveal scores — the one
            // thing this app exists to hide. Fold the hint into the accessible
            // name so it's announced with the button; the visible `o.label` stays
            // the leading token, keeping voice-control's "Label in Name" (WCAG
            // 2.5.3) intact and the visible pill text unchanged. `title` stays for
            // the mouse tooltip. Falls back to the bare label if a hint is absent.
            aria-label={o.hint ? `${o.label} — ${o.hint}` : undefined}
            title={o.hint}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// The one league chip: TeamPicker's league filter and the Records toggles.
// `sport` puts that league's logo left of the name, the same no-plate mark
// SwitcherChip draws (Jacob 10/1: one chip look everywhere).
function LeagueChip({
  label,
  on,
  onClick,
  sport,
  ariaLabel,
  ariaPressed,
  ariaExpanded,
  title,
}: {
  label: string;
  on: boolean;
  onClick: () => void;
  sport?: Sport;
  ariaLabel?: string;
  ariaPressed?: boolean;
  ariaExpanded?: boolean;
  title?: string;
}) {
  return (
    <button type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      aria-pressed={ariaPressed}
      aria-expanded={ariaExpanded}
      className={`${sport ? "inline-flex items-center gap-1.5 pl-1.5 pr-2" : "px-2"} py-1 rounded-md text-[11px] font-semibold uppercase tracking-wide cursor-pointer transition-colors`}
      style={{
        background: on ? "var(--accent)" : "var(--bg-card)",
        border: `1px solid ${on ? "var(--accent)" : "var(--border)"}`,
        color: on ? "white" : "var(--text)",
      }}
      title={title}
    >
      {/* The negative margin keeps the chip as tall as its text-only neighbours. */}
      {sport && <LeagueMark sport={sport} tone={on ? "dark" : "auto"} className="-my-0.5" />}
      {label}
    </button>
  );
}

// A league chip in the switcher catalog: LeagueChip's look, a checkbox's
// meaning (ticked = in the header switcher). The name reads "NBA · offseason"
// the way the old checkbox row did. In Edit list mode a small × follows it.
// `sport` puts that league's logo left of the name.
function SwitcherChip({
  label,
  note,
  sport,
  checked,
  onToggle,
  onRemove,
}: {
  label: string;
  note?: string;
  sport?: Sport;
  checked: boolean;
  onToggle: (on: boolean) => void;
  onRemove?: () => void;
}) {
  const name = note ? `${label} · ${note}` : label;
  return (
    <span className="inline-flex items-center">
      <button type="button"
        role="checkbox"
        aria-checked={checked}
        aria-label={name}
        onClick={() => onToggle(!checked)}
        title={note ? name : undefined}
        className={`inline-flex items-center gap-1.5 ${sport ? "pl-1.5 pr-2" : "px-2"} py-1 rounded-md text-[11px] font-semibold uppercase tracking-wide cursor-pointer transition-colors`}
        style={{
          background: checked ? "var(--accent)" : "var(--bg-card)",
          border: `1px solid ${checked ? "var(--accent)" : "var(--border)"}`,
          color: checked ? "white" : "var(--text)",
          opacity: note === "offseason" ? 0.6 : 1,
        }}
      >
        {/* The negative margin keeps the chip as tall as its text-only neighbours. */}
        {/* A ticked chip is accent-filled, so it takes the dark-theme mark in light mode too. */}
        {sport && <LeagueMark sport={sport} tone={checked ? "dark" : "auto"} className="-my-0.5" />}
        {label}
      </button>
      {onRemove && (
        <button type="button"
          onClick={onRemove}
          aria-label={`Hide ${label} from this list`}
          title="Hide from this list"
          className="w-5 h-5 -ml-0.5 flex items-center justify-center rounded-full cursor-pointer hover:opacity-80"
          style={{ color: "var(--text-muted)" }}
        >
          <svg aria-hidden="true" width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="M5 5l14 14M19 5L5 19" /></svg>
        </button>
      )}
    </span>
  );
}

// Always-visible team picker. Sport tab pills sit directly in the Favorite
// teams section; the active tab's team list lazy-loads via fetchSportTeams
// and is cached per-sport in lib/espn.ts so re-selecting a tab is instant.
// Sports without a per-team concept (golf, tennis, UFC, racing, …) are
// filtered out — TEAM_PICKER_SKIP in lib/teamLogos.ts says why each one.
// Cache + loader are hoisted to SettingsPanel so the favorites display can
// also read team names from them (otherwise favorited teams that aren't in
// today's loaded games would show "nba-8" instead of "Atlanta Hawks").

// A team row's logo, or a one-letter tile when ESPN has none (or it 404s) —
// about 1 in 4 college baseball / softball teams, a handful of lower-division
// cup sides. The tile keeps every name in the grid on the same left edge.
function PickerTeamLogo({ logo, name }: { logo?: string; name: string }) {
  const [failed, setFailed] = useState(false);
  if (logo && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={logo} alt="" loading="lazy" decoding="async" width={16} height={16} className="w-4 h-4 shrink-0 object-contain" onError={() => setFailed(true)} />
    );
  }
  return (
    <span
      aria-hidden="true"
      className="w-4 h-4 shrink-0 rounded-sm flex items-center justify-center text-[9px] font-bold leading-none"
      style={{ background: "rgba(127,127,127,0.22)" }}
    >
      {name.match(/[A-Za-z0-9]/)?.[0]?.toUpperCase() ?? "?"}
    </span>
  );
}
function TeamPicker({
  sports,
  mySports,
  favorites,
  onToggle,
  teamsBySport,
  loadingSports,
  loadSport,
  knownTeams,
}: {
  sports: LeagueOption[];
  // The leagues ticked in My leagues. Only these show as chips until "More
  // leagues" is on.
  mySports: ReadonlySet<Sport>;
  favorites: string[];
  onToggle: (teamId: string) => void;
  teamsBySport: Map<Sport, SportTeam[]>;
  loadingSports: Set<Sport>;
  loadSport: (sport: Sport) => void;
  knownTeams: { id: string; sport: Sport; displayName: string; logo?: string }[];
}) {
  const tabSports = useMemo(
    () => sports.filter((s) => !TEAM_PICKER_SKIP.includes(s.sport)),
    [sports],
  );
  // Start with no league selected — search across all leagues until the user
  // picks one to narrow the list.
  const [selectedSport, setSelectedSport] = useState<Sport | null>(null);
  const [showAllLeagues, setShowAllLeagues] = useState(false);
  const [query, setQuery] = useState("");
  const favSet = useMemo(() => new Set(favorites), [favorites]);
  const trimmedQuery = query.trim().toLowerCase();

  // If the selected sport disappears from the active-leagues list (e.g., season
  // ended while the picker was open), treat it as "nothing selected" instead of
  // jumping to another sport. Derived during render rather than reset via an
  // effect so there's no cascading set-state-in-effect re-render.
  const activeSport =
    selectedSport && tabSports.some((s) => s.sport === selectedSport)
      ? selectedSport
      : null;
  const activeLabel = activeSport ? tabSports.find((s) => s.sport === activeSport)?.label : undefined;

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
      const merged = new Map<string, SportTeam & { sport: Sport }>();
      for (const t of list) merged.set(t.id, { ...t, sport: activeSport });
      for (const t of knownTeams) {
        if (t.sport !== activeSport || merged.has(t.id)) continue;
        merged.set(t.id, {
          id: t.id,
          rawId: t.id.slice(t.id.indexOf("-") + 1),
          displayName: t.displayName,
          shortDisplayName: t.displayName,
          abbreviation: "",
          logo: t.logo,
          sport: activeSport,
        });
      }
      return [...merged.values()].sort((a, b) => a.displayName.localeCompare(b.displayName));
    }
    const out: (SportTeam & { sport: Sport })[] = [];
    for (const s of tabSports) {
      const list = teamsBySport.get(s.sport);
      if (!list) continue;
      for (const t of list) out.push({ ...t, sport: s.sport });
    }
    return out;
  }, [activeSport, teamsBySport, tabSports, knownTeams]);

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

  // My-leagues chips only, plus a "More leagues" chip for the rest. The picked
  // league always keeps its chip so it can be tapped off. With no league
  // ticked (or nothing hidden) every chip shows and the toggle is not needed.
  const myTabs = tabSports.filter((s) => mySports.has(s.sport) || s.sport === activeSport);
  const hasHiddenTabs = myTabs.length > 0 && myTabs.length < tabSports.length;
  const visibleTabs = showAllLeagues || !hasHiddenTabs ? tabSports : myTabs;

  if (tabSports.length === 0) return null;

  return (
    <div className="space-y-2">
      {/* Search box first (Jacob 9/25) — always visible. With no league
          picked it queries every loaded sport; first keystroke triggers
          parallel lazy-loads. */}
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        // The tab's own label ("NCAA Baseball", "IPL"), not the internal key —
        // that read "Search NCAABASE teams" / "Search CRICKET teams".
        placeholder={activeLabel ? `Search ${activeLabel} teams` : "Search all teams"}
        aria-label={activeLabel ? `Search ${activeLabel} teams` : "Search all teams"}
        // Live filter over team names — filtered re-runs on every keystroke — not
        // a text field for prose. On mobile, iOS autocapitalize/autocorrect would
        // rewrite a partial team name as you type (e.g. "gia" toward "Giants" gets
        // capitalized/"corrected"), silently changing what the search matches.
        // Turn all of that off, and disable autofill so name/address suggestions
        // don't overlay the field. Matches the input hygiene already on the World
        // Cup country filter + the ZIP/feedback inputs; purely behavioral hints,
        // no visual change.
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        className="w-full px-3 py-1.5 rounded-md text-sm"
        style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text)" }}
      />

      {/* Sport tabs. Clicking the active tab again clears the filter (back
          to cross-league search). aria-pressed exposes the active filter,
          which is otherwise shown only by accent color. */}
      <div className="flex flex-wrap gap-1.5">
        {visibleTabs.map((s) => {
          const active = s.sport === activeSport;
          return (
            <LeagueChip
              key={s.sport}
              label={s.label}
              sport={s.sport}
              on={active}
              ariaPressed={active}
              onClick={() => setSelectedSport(active ? null : s.sport)}
              title={active ? "Click to clear filter" : `Show ${s.label} teams`}
            />
          );
        })}
        {/* Same chip as the My leagues "More leagues", off-fill either way.
            Its own name so the two never collide for assistive tech. */}
        {hasHiddenTabs && (
          <LeagueChip
            label={showAllLeagues ? "Fewer" : "More leagues"}
            ariaLabel={showAllLeagues ? "Fewer leagues for teams" : "More leagues for teams"}
            on={false}
            ariaExpanded={showAllLeagues}
            onClick={() => setShowAllLeagues((v) => !v)}
            title={showAllLeagues ? "Show only the leagues in My leagues" : "Show every league with teams"}
          />
        )}
      </div>

      {/* The team grid below conveys its result state purely visually — a
          pulsing skeleton, a "No matches" line, or a grid of team buttons —
          so a screen-reader user typing in the search box above gets no cue
          how many teams matched or that a query came up empty. Voice a
          concise summary through a dedicated sr-only live region (WCAG 4.1.3
          Status Messages), mirroring the same role="status" aria-live="polite"
          pattern the news feed, video strips, and FeedbackBox already use.
          Kept to a short count (not the team names, which the grid itself
          exposes) so polite announcements stay terse as the query changes. */}
      <div role="status" aria-live="polite" className="sr-only">
        {showSkeleton
          ? "Loading teams…"
          : !activeSport && !trimmedQuery
            ? ""
            : filtered.length === 0
              ? trimmedQuery
                ? loadingSports.size > 0
                  ? "Searching…"
                  : "No matching teams"
                : "No teams available"
              : `${filtered.length} team${filtered.length === 1 ? "" : "s"} found`}
      </div>

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
        ) : !activeSport && !trimmedQuery ? null : filtered.length === 0 ? (
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
                <button type="button"
                  key={t.id}
                  onClick={() => onToggle(t.id)}
                  // Favorited state is otherwise conveyed only by accent color;
                  // expose it to assistive tech so a screen-reader user hears
                  // which teams are already favorited (same aria-pressed toggle
                  // convention used elsewhere in the app).
                  aria-pressed={isFav}
                  className="flex items-center gap-1.5 px-2 py-1.5 rounded-md text-xs cursor-pointer transition-colors text-left"
                  style={{
                    background: isFav ? "var(--accent)" : "var(--bg-card)",
                    border: `1px solid ${isFav ? "var(--accent)" : "var(--border)"}`,
                    color: isFav ? "white" : "var(--text)",
                  }}
                  title={isFav ? "Remove from favorites" : `Add ${t.displayName} to favorites`}
                >
                  <PickerTeamLogo logo={t.logo} name={t.shortDisplayName} />
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
