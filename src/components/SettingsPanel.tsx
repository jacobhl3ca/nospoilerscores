"use client";

import { cloneElement, isValidElement, useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { LeagueData, Sport } from "@/lib/types";
import { fetchSportTeams, SportTeam, SPORT_GROUP_ORDER, sportGroup, catalogSortRank } from "@/lib/espn";
import { isTopEventsGameSport, TOP_EVENTS_DEFAULT_COUNT, TOP_EVENTS_ENABLED, type TopEventsMode, type TopEventsCount } from "@/lib/topEvents";
import {
  Preferences,
  Theme,
  DefaultDateMode,
  DefaultLandingView,
  DefaultRatings,
} from "@/lib/preferences";
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
  { value: "smart", label: "Automatic", hint: "Yesterday before the switch time, today after" },
  { value: "yesterday", label: "Yesterday", hint: "Always start on yesterday" },
  { value: "today", label: "Today", hint: "Always start on today" },
];

const LANDING_VIEW_OPTIONS: { value: DefaultLandingView; label: string; hint: string }[] = [
  { value: "remember", label: "Last opened", hint: "Pick up where you left off" },
  { value: "scores", label: "Scores", hint: "Always start on scores" },
  { value: "ratings", label: "Ratings", hint: "Always start on scores with ratings on (spoilers)" },
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

const TOP_MODE_OPTIONS: { value: TopEventsMode; label: string; hint: string }[] = [
  { value: "auto", label: "Auto", hint: "What espn.com is featuring right now, plus your starred teams" },
  { value: "manual", label: "Manual", hint: "Only the leagues you tick below" },
];
const TOP_COUNT_OPTIONS: { value: "5" | "8" | "12"; label: string; hint: string }[] = [
  { value: "5", label: "5", hint: "Just the headliners" },
  { value: "8", label: "8", hint: "Default" },
  { value: "12", label: "12", hint: "A full column" },
];

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
  { value: "safe", label: "Spoiler-safe", hint: "Hide progress and the ending with HideScore controls" },
  { value: "youtube", label: "YouTube", hint: "Use the familiar YouTube controls; progress may reveal how far you are" },
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
  cricket: "IPL",
  sixnations: "Six Nations",
  rugbywc: "Rugby World Cup",
  rugbychamp: "Champions Cup",
  superrugby: "Super Rugby",
  rugbytest: "Rugby Tests",
  nationschamp: "Rugby Nations",
  f1: "F1",
  nascar: "NASCAR",
  indycar: "IndyCar",
  ufc: "UFC",
  boxing: "Boxing",
  chess: "Chess",
  poker: "Poker",
  esports: "Esports",
  top: "Top events",
};

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
  updatePrefs,
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
  // Android shell only — see the Rate link in the legal row below.
  const [isAndroidApp, setIsAndroidApp] = useState(false);
  useEffect(() => {
    if (!open) return;
    const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean; getPlatform?: () => string } }).Capacitor;
    setCanUseGoogle(!cap?.isNativePlatform?.() || hasNativeGoogleBridge());
    setShowLinkMore(false);
    setIsAndroidApp(!!cap?.isNativePlatform?.() && cap?.getPlatform?.() === "android");
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

  // Esc to close
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

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

  // Each slot dropdown offers every supported league year-round. Duplicates
  // are allowed —
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

  // Whether a catalog row is currently ticked. Same rule the checkbox itself
  // renders from — pulled out so the offseason filter below can ask the
  // question without duplicating (and drifting from) the logic.
  const isSwitcherChecked = (option: LeagueOption) => {
    const hidden = prefs.hiddenLeagues?.includes(option.sport) ?? false;
    const shown = prefs.shownLeagues?.includes(option.sport) ?? false;
    const pinned = slotValues.includes(option.sport);
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
    return SPORT_GROUP_ORDER.flatMap(({ key, label }) => {
      const options = byGroup.get(key);
      if (!options?.length) return [];
      // Stable within a group: in-season first, then the catalog's own order
      // (ALL_LEAGUES, which is arranged by season calendar) — except that the
      // short-window minority events sort to the tail regardless of season, so
      // Little League cannot outrank the NBA for three weeks in August. See
      // catalogSortRank / CATALOG_TAIL. Array.prototype.sort is stable in every
      // engine we ship to, so equal keys keep the catalog order.
      const sorted = [...options].sort(
        (a, b) => catalogSortRank(a.sport, !!a.offseason) - catalogSortRank(b.sport, !!b.offseason),
      );
      return [{ key, label, options: sorted }];
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
  const offseasonRowCount = leagueOptions.filter((option) => option.offseason).length;
  const keepOffseasonRow = (option: LeagueOption) => slotValues.includes(option.sport);
  const hiddenOffseasonCount = leagueOptions.filter(
    (option) => option.offseason && !keepOffseasonRow(option),
  ).length;
  const visibleLeagueGroups = hideOffseason
    ? groupedLeagueOptions.flatMap((group) => {
        const options = group.options.filter((option) => !option.offseason || keepOffseasonRow(option));
        return options.length ? [{ ...group, options }] : [];
      })
    : groupedLeagueOptions;
  const slotDropdownGroups = (current: Sport | "empty" | undefined) => hideOffseason
    ? groupedLeagueOptions.flatMap((group) => {
        const options = group.options.filter((option) => !option.offseason || option.sport === current || keepOffseasonRow(option));
        return options.length ? [{ ...group, options }] : [];
      })
    : groupedLeagueOptions;
  // Manual pool for the Top events column: every game-card league, catalog
  // order, offseason ones marked (they contribute nothing until they return).
  const topEventsLeagueRows = groupedLeagueOptions.flatMap((group) => group.options.filter((option) => isTopEventsGameSport(option.sport)));

  const optionText = (option: LeagueOption) =>
    `${SPORT_LABEL[option.sport] ?? option.label}${option.offseason ? " · offseason" : option.upcomingLabel ? ` · starts ${option.upcomingLabel}` : ""}`;

  const renderSwitcherToggle = (option: LeagueOption) => {
    const pinned = slotValues.includes(option.sport);
    const preferred = option.defaultInSwitcher !== false || pinned || prefs.favoriteLeagues.includes(option.sport);
    const checked = isSwitcherChecked(option);
    return (
      <label key={option.sport} className="flex items-center gap-2 text-sm cursor-pointer select-none" style={{ color: "var(--text)" }}>
        <input
          type="checkbox"
          checked={checked}
          onChange={(event) => {
            const hiddenLeagues = new Set(prefs.hiddenLeagues ?? []);
            const shownLeagues = new Set(prefs.shownLeagues ?? []);
            hiddenLeagues.delete(option.sport);
            shownLeagues.delete(option.sport);
            if (event.target.checked && !preferred) {
              shownLeagues.add(option.sport);
            } else if (!event.target.checked && preferred) {
              hiddenLeagues.add(option.sport);
            }
            updatePrefs({
              hiddenLeagues: hiddenLeagues.size ? [...hiddenLeagues] : undefined,
              shownLeagues: shownLeagues.size ? [...shownLeagues] : undefined,
            });
          }}
          className="cursor-pointer accent-[var(--accent)]"
        />
        <span>
          {SPORT_LABEL[option.sport] ?? option.label}
          {option.offseason && <em style={{ color: "var(--text-muted)" }}> · offseason</em>}
          {!option.offseason && option.upcomingLabel && <em style={{ color: "var(--text-muted)" }}> · starts {option.upcomingLabel}</em>}
        </span>
      </label>
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
      newsGenericHidden: undefined,
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
      topEventsMode: undefined,
      topEventsLeagues: undefined,
      topEventsCount: undefined,
      leagueSwitcherMode: undefined,
      hiddenLeagues: undefined,
      shownLeagues: undefined,
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
      newsFeedView: undefined,
      newsVideosOnly: undefined,
      newsTypeFilterOrder: undefined,
      newsHiddenSources: undefined,
      singleColumn: undefined,
      newsSingleColumn: undefined,
      hideSensitiveNews: undefined,
      hideCrashNews: undefined,
      timezone: undefined,
      reminderLinkTemplate: undefined,
      smartCutoffHour: 13,
      newsColCount: 3,
      newsTypeFilter: "reddit",
      newsTypeFilters: undefined,
    });
  };

  // News is useful between seasons, so its optional third column uses the same
  // year-round catalog as Settings' score-slot pickers.
  const newsCol3Options = leagueOptions;

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

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-6">
          {/* Account — Sign in with Apple syncs prefs across browsers/devices.
              First so the cross-device value prop is the first thing seen. */}
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
              <div className="space-y-2">
                <p className="text-sm" style={{ color: "var(--text)" }}>
                  Signed in{auth.email ? <> as <span className="font-medium">{auth.email}</span></> : ""}.
                </p>
                <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                  Your teams, layout, and settings sync automatically across all your browsers and devices.
                </p>
                <button type="button"
                  onClick={() => signOut()}
                  className="w-full py-2 rounded-lg text-sm font-medium cursor-pointer transition-colors"
                  style={{ background: "transparent", color: "var(--text)", border: "1px solid var(--border)" }}
                >
                  Sign out
                </button>
                {/* Adding a second way into the same account is a once-ever
                    chore, so it is a grey link under Sign out rather than a
                    stack of buttons and an email form held permanently open
                    (Jacob 8/31). Nothing left to link = no link at all. */}
                {(linkableProviders.length > 0 || canLinkEmail) && !showLinkMore && (
                  <button type="button"
                    onClick={() => setShowLinkMore(true)}
                    aria-expanded={false}
                    aria-controls={canLinkEmail ? "hs-link-more" : undefined}
                    className="w-full text-[11px] underline cursor-pointer"
                    style={{ color: "var(--text-muted)" }}
                  >
                    Link another way to sign in
                  </button>
                )}
                {showLinkMore && linkableProviders.length > 0 && (
                  <div className="flex flex-wrap gap-2">
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
                  <svg width="15" height="15" viewBox="0 0 17 17" fill="currentColor" aria-hidden="true">
                    <path d="M13.79 9.06c-.02-1.86 1.52-2.75 1.59-2.79-.87-1.27-2.22-1.44-2.7-1.46-1.15-.12-2.24.68-2.82.68-.58 0-1.48-.66-2.43-.64-1.25.02-2.4.73-3.04 1.85-1.3 2.25-.33 5.58.93 7.41.62.9 1.35 1.9 2.31 1.86.93-.04 1.28-.6 2.4-.6 1.12 0 1.43.6 2.41.58 1-.02 1.63-.91 2.24-1.81.71-1.04 1-2.05 1.01-2.1-.02-.01-1.94-.74-1.96-2.95l.01-.34zM11.9 3.38c.51-.62.86-1.48.76-2.34-.74.03-1.64.49-2.17 1.11-.47.55-.89 1.43-.78 2.27.83.07 1.67-.42 2.19-1.04z"/>
                  </svg>
                  Sign in with Apple
                </button>
                )}
                {auth.providers?.google && canUseGoogle && (
                <button type="button"
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
            {canLinkEmail && (!auth.signedIn || showLinkMore) && (
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
            )}
          </Section>

          {/* Theme — first because the old standalone header toggle moved
              in here, and dark/light is the most-frequently-flipped setting. */}
          <Section title="Theme">
            <RadioGroup
              label="Theme"
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
              {/* Fall back to "yesterday", the documented fresh-install default
                  (see `defaults` in preferences.ts, moved off "smart" on
                  2026-08-09), not "smart". loadPreferences() always merges that
                  default in, so `prefs.defaultDateMode` is normally set and this
                  fallback rarely fires — but when it does (a partial prefs blob),
                  a stale "smart" fallback made the radio highlight "Automatic"
                  and reveal the cutoff-hour field below, misrepresenting a board
                  the app actually renders as "yesterday". Matches the reset value
                  in this file's clearAll and the default in preferences.ts. */}
              <RadioGroup
                label="Landing date"
                value={prefs.defaultDateMode ?? "yesterday"}
                options={DATE_MODE_OPTIONS}
                onChange={(v) => updatePrefs({ defaultDateMode: v })}
              />
            </Field>
            {(prefs.defaultDateMode ?? "yesterday") === "smart" && (
            <Field label="Automatic switch time" hint="Hour (your local time) when the landing date flips from yesterday to today">
                <select
                  value={prefs.smartCutoffHour ?? 13}
                  onChange={(e) => updatePrefs({ smartCutoffHour: Number(e.target.value) })}
                  aria-label="Automatic switch time"
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
            <Field label="Landing view" hint="Scores, ratings or news on launch">
              <RadioGroup
                label="Landing view"
                value={prefs.defaultLandingView ?? "remember"}
                options={LANDING_VIEW_OPTIONS}
                onChange={(v) => updatePrefs({ defaultLandingView: v })}
              />
            </Field>
            <Field label="Ratings on launch" hint="Show or hide game ratings + best-games sort">
              <RadioGroup
                label="Ratings on launch"
                value={prefs.defaultRatings ?? "auto"}
                options={DEFAULT_RATINGS_OPTIONS}
                onChange={(v) => updatePrefs({ defaultRatings: v })}
              />
            </Field>
            <Field label="Time zone" hint="Used for game times AND which day counts as today">
              <select
                value={prefs.timezone ?? ""}
                onChange={(e) => updatePrefs({ timezone: e.target.value || undefined })}
                aria-label="Time zone"
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
                  autoComplete="postal-code"
                  maxLength={5}
                  value={zip}
                  onChange={(e) => { setZip(e.target.value.replace(/\D/g, "").slice(0, 5)); setZipMsg(""); }}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); resolveZip(); } }}
                  placeholder="or enter ZIP"
                  aria-label="US ZIP code for time zone"
                  className="w-28 px-3 py-2 rounded-lg text-sm"
                  style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text)" }}
                />
                <button type="button"
                  onClick={resolveZip}
                  disabled={zip.length !== 5 || zipBusy}
                  // Pin a stable, descriptive accessible name. The visible text
                  // is a terse "Set" (ambiguous out of context next to a ZIP
                  // field) and flips to a bare "…" while resolving — a meaningless
                  // accessible name for that transient state. An aria-label
                  // overrides the text content, so the button reads the same in
                  // both states, matching the descriptive labels the app already
                  // gives its other short buttons (the feedback "+", the golf
                  // highlight buttons). Purely additive — no visual change.
                  aria-label="Set time zone from ZIP code"
                  className="px-3 py-2 rounded-lg text-sm font-medium cursor-pointer transition-opacity disabled:opacity-40 disabled:cursor-default"
                  style={{ background: "var(--accent)", color: "white" }}
                >
                  {zipBusy ? "…" : "Set"}
                </button>
              </div>
              {zipMsg && (
                <p role="status" aria-live="polite" className="text-[11px] mt-1" style={{ color: zipErr ? "rgb(239,68,68)" : "var(--text-muted)" }}>
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
              Offseason picks stay saved and return automatically.
              Slots 4&ndash;5 only appear when the window is wide enough for five columns.
            </p>
            {[0, 1, 2, 3, 4].map((idx) => {
              const fallbackLabel = displayedLeagues[idx]?.label ?? "—";
              const saved = slotValues[idx];
              // A "top" pin from before the column was switched off reads as
              // Auto here, which is what resolveSlot makes of it on the board.
              const value = saved === "top" && !TOP_EVENTS_ENABLED ? undefined : saved;
              const selectedOption = value && value !== "empty"
                ? leagueOptions.find((option) => option.sport === value)
                : undefined;
              const hint = value === "empty"
                ? "Hidden"
                : selectedOption?.offseason
                  ? `Offseason · saved for its return${fallbackLabel !== "—" ? `; showing ${fallbackLabel}` : ""}`
                  : value
                    ? undefined
                    : `Auto · currently ${fallbackLabel}`;
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
                    aria-label={`Slot ${idx + 1} league`}
                    className="w-full px-3 py-2 rounded-lg text-sm cursor-pointer"
                    style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text)" }}
                  >
                    <option value="">Auto</option>
                    {TOP_EVENTS_ENABLED && <option value="top">⭐ Top events</option>}
                    {slotDropdownGroups(value).map((group) => (
                      <optgroup key={group.key} label={group.label}>
                        {group.options.map((option) => (
                          <option key={option.sport} value={option.sport}>{optionText(option)}</option>
                        ))}
                      </optgroup>
                    ))}
                    <option value="empty">Remove col</option>
                  </select>
                </Field>
              );
            })}
            <Field label="Header league switcher" hint="How tapping a column header behaves">
              <RadioGroup
                label="Header league switcher"
                value={prefs.leagueSwitcherMode ?? "dropdown"}
                options={SWITCHER_MODE_OPTIONS}
                onChange={(v) => updatePrefs({ leagueSwitcherMode: v })}
              />
            </Field>
            <Field label="Leagues in the switcher" hint="Core leagues start checked; choose any others you want in the header switcher">
              <div className="space-y-3">
                {(offseasonRowCount > 0 || hideOffseason) && (
                  <label
                    className="flex items-center justify-end gap-2 text-[11px] cursor-pointer select-none"
                    style={{ color: "var(--text-muted)" }}
                    title="Leagues you have checked stay listed even when they are between seasons"
                  >
                    <input
                      type="checkbox"
                      checked={hideOffseason}
                      onChange={(event) =>
                        updatePrefs({ hideOffseasonInCatalog: event.target.checked ? true : undefined })
                      }
                      className="cursor-pointer accent-[var(--accent)]"
                    />
                    <span>
                      Hide offseason
                      {hideOffseason && hiddenOffseasonCount > 0 && ` · ${hiddenOffseasonCount} hidden`}
                    </span>
                  </label>
                )}
                {visibleLeagueGroups.map((group) => (
                  <div key={group.key}>
                    <p className="text-[11px] font-semibold uppercase tracking-wide mb-1.5" style={{ color: "var(--text-muted)" }}>{group.label}</p>
                    <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                      {group.options.map(renderSwitcherToggle)}
                    </div>
                  </div>
                ))}
                {onRequestLeague && (
                  // Last line of the catalog, italic and quiet: the person
                  // reading it has just scanned every league we carry and not
                  // found theirs, which is the only moment the ask is useful.
                  <button
                    type="button"
                    onClick={onRequestLeague}
                    className="text-xs italic underline underline-offset-2 cursor-pointer hover:opacity-80"
                    style={{ color: "var(--text-muted)" }}
                  >
                    Request a league
                  </button>
                )}
              </div>
            </Field>
          </Section>

          {/* Top events (Jacob 9/4): the cross-league column's knobs. The pill
              itself lives in the column switcher, the slot dropdowns above and
              the first-run picker; this is where "set it manually" happens.
              Hidden while the column is off (TOP_EVENTS_ENABLED, 9/5). */}
          {TOP_EVENTS_ENABLED && (
          <Section title="Top events column">
            <p className="text-xs mb-2" style={{ color: "var(--text-muted)" }}>
              Pick <em>⭐ Top events</em> for any column (tap a column header, or a slot above) to get the biggest games across every league in one column.
              Auto ranks your starred teams first, then what espn.com is featuring on its homepage right now, live games, playoffs, ranked matchups and national TV.
              Scores stay hidden, same as everywhere else.
            </p>
            <Field label="Which leagues" hint="Auto follows ESPN's homepage plus your teams; Manual uses only the leagues you tick">
              <RadioGroup
                label="Which leagues"
                value={prefs.topEventsMode ?? "auto"}
                options={TOP_MODE_OPTIONS}
                onChange={(v) => updatePrefs({ topEventsMode: v === "auto" ? undefined : v })}
              />
            </Field>
            {(prefs.topEventsMode ?? "auto") === "manual" && (
              <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 mb-3">
                {topEventsLeagueRows.map((option) => {
                  const checked = (prefs.topEventsLeagues ?? []).includes(option.sport);
                  return (
                    <label key={option.sport} className="flex items-center gap-2 text-sm cursor-pointer select-none" style={{ color: "var(--text)" }}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(event) => {
                          const next = new Set(prefs.topEventsLeagues ?? []);
                          if (event.target.checked) next.add(option.sport);
                          else next.delete(option.sport);
                          updatePrefs({ topEventsLeagues: next.size ? [...next] : undefined });
                        }}
                        className="cursor-pointer accent-[var(--accent)]"
                      />
                      <span>
                        {SPORT_LABEL[option.sport] ?? option.label}
                        {option.offseason && <em style={{ color: "var(--text-muted)" }}> · offseason</em>}
                      </span>
                    </label>
                  );
                })}
              </div>
            )}
            <Field label="How many games" hint="Across all leagues, at most three per league unless one of your teams is playing">
              <RadioGroup
                label="How many games"
                value={String(prefs.topEventsCount ?? TOP_EVENTS_DEFAULT_COUNT) as "5" | "8" | "12"}
                options={TOP_COUNT_OPTIONS}
                onChange={(v) => {
                  const n = Number(v) as TopEventsCount;
                  updatePrefs({ topEventsCount: n === TOP_EVENTS_DEFAULT_COUNT ? undefined : n });
                }}
              />
            </Field>
          </Section>
          )}

          {/* Board layout */}
          <Section title="Board layout">
            {/* Was also called just "Single column", same as the News one two
                sections down — identical labels, different jobs, and flipping
                the wrong one looked like a bug (Jacob 8/31). */}
            <ToggleRow
              label="One wide column — scores"
              hint="Stack your leagues in one wide column with bigger cards, instead of side-by-side columns. (The matching setting for news is under News.)"
              checked={prefs.singleColumn ?? false}
              onChange={(v) => updatePrefs({ singleColumn: v })}
            />
            {/* Stored inverted (hideControlsHint) so a fresh install shows it —
                see the pref's note. The row reads the way you'd expect. */}
            <ToggleRow
              label="Keyboard shortcuts hint"
              hint="A small “Keys” tag in the bottom-right corner listing what ↓/↑, ←/→ and Space do. Desktop only."
              checked={!prefs.hideControlsHint}
              onChange={(v) => updatePrefs({ hideControlsHint: !v })}
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
              sports={teamLeagueOptions}
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
                          onClick={() => removeTeam(t.id)}
                          className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs cursor-pointer transition-opacity hover:opacity-80"
                          style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text)" }}
                          title="Remove from favorites"
                          aria-label={`Remove ${t.displayName} from favorites`}
                        >
                          {t.logo && (
                            // onError hides a 404'd/blocked ESPN logo so the chip
                            // degrades to the team name instead of the browser's
                            // broken-image glyph — matches the onError guard on
                            // every other remote team logo (GameCard, GameDetailModal,
                            // WorldCupGroupsModal, …).
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={t.logo} alt="" loading="lazy" decoding="async" width={14} height={14} className="w-3.5 h-3.5" onError={(e) => { e.currentTarget.style.display = "none"; }} />
                          )}
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
          </Section>

          {/* News */}
          <Section title="News">
            <ToggleRow
              label="One wide column — news"
              hint="Stack all news columns into one wide column instead of side-by-side. (The matching setting for scores is under Board layout.)"
              checked={prefs.newsSingleColumn ?? false}
              onChange={(v) => updatePrefs({ newsSingleColumn: v })}
            />
            {/* One setting, with the racing carve-out nested under it. These
                were two peer toggles whose hints each had to explain the other,
                and that seam is where "injured in a crash" fell through — it
                read as a crash story, so only the second toggle saw it, and the
                second toggle is the one nobody turns on (Jacob 8/31). */}
            <ToggleRow
              label="Hide upsetting news"
              hint="Filters out deaths, assault and abuse cases, getting hurt (a batter hit in the head, a collision, someone injured in a crash, carted off), serious illness, harm to animals and self-harm. Anything hidden is counted at the bottom of the feed, so you can still show it in one tap. Roster injury news — IL moves, return timelines — still shows."
              checked={prefs.hideSensitiveNews ?? false}
              // Turning the parent off also clears the child: the crash filter
              // has no control of its own any more, so leaving it armed would
              // keep hiding posts with nothing on screen to explain why.
              onChange={(v) => updatePrefs(v ? { hideSensitiveNews: true } : { hideSensitiveNews: false, hideCrashNews: false })}
            />
            {/* Shown when the parent is on — or when the crash filter is already
                armed, so an account that set it under the old two-toggle UI can
                always still see and reach it. */}
            {(prefs.hideSensitiveNews || prefs.hideCrashNews) && (
              <div className="pl-3.5 ml-1" style={{ borderLeft: "2px solid var(--border)" }}>
                <ToggleRow
                  label="Also hide wrecks nobody got hurt in"
                  hint="Racing crashes, pile-ups, hard falls and bike spills where everyone walked away — those are the sport, so they stay visible unless you ask. A crash that hurt or killed someone is already hidden by the setting above."
                  checked={prefs.hideCrashNews ?? false}
                  onChange={(v) => updatePrefs({ hideCrashNews: v })}
                />
              </div>
            )}
            <Field label="3rd news column" hint="Default league for the third news column">
              <select
                value={prefs.newsThirdLeague ?? ""}
                onChange={(e) => updatePrefs({ newsThirdLeague: e.target.value ? (e.target.value as Sport) : undefined })}
                aria-label="3rd news column league"
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

          {/* Player choice leads; the custom-only controls below stay visible
              but disabled in YouTube mode so the relationship is obvious. */}
          <Section title="Highlight video player">
            <Field label="Player" hint="Spoiler-safe is the default; YouTube trades protection for familiar controls">
              <RadioGroup
                label="Highlight video player"
                value={(prefs.youtubeNativeControls ?? true) ? "youtube" : "safe"}
                options={PLAYER_OPTIONS}
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

          {/* Share & Reset */}
          <Section title="Share & reset">
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
              <button type="button"
                onClick={() => {
                  if (confirm("Reset all settings to defaults? Favorites will be cleared.")) resetAll();
                }}
                className="w-full py-2 rounded-lg text-sm font-medium cursor-pointer transition-colors"
                style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text)" }}
              >
                Reset to defaults
              </button>
            </div>
            {/* Bring back a one-time explainer you dismissed. These had their own
                "Spoiler explainers" section, which read like two settings to tune
                — they are an undo, so they live with the other undos now
                (Jacob 8/31). */}
            <div className="mt-3 pt-3" style={{ borderTop: "1px solid var(--border)" }}>
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
            </div>
            {/* "Remind me" link template — personal, off by default. A URL with
                placeholders that an upcoming game's detail sheet opens on tap
                (lib/reminderLink.ts). Raycast, Shortcuts, Alfred, Things, … —
                whatever has a URL scheme on THIS device. Blank = no button. */}
            <div className="mt-3 pt-3" style={{ borderTop: "1px solid var(--border)" }}>
              <Field
                label="Reminder link"
                hint="Opens this URL from an upcoming game's details. Placeholders: {minutes} {title} {iso} {time} {date}. Leave blank to hide the button."
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
                Example: raycast://script-commands/timer?arguments={"{minutes}"}m%20{"{title}"}
              </p>
            </div>
          </Section>

          {/* Bottom-most, and deliberately quiet. Only rendered when signed in
              — there is no account to delete otherwise. */}
          {auth.signedIn && (
            <div className="pt-2 text-center" style={{ borderTop: "1px solid var(--border)" }}>
              <button type="button"
                onClick={async () => {
                  if (!confirm("Permanently delete your account? This erases your synced teams, layout, and settings from our servers and signs you out. This cannot be undone.")) return;
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
                className="text-[11px] underline underline-offset-2 cursor-pointer transition-opacity hover:opacity-80"
                style={{ color: "var(--text-muted)" }}
              >
                Delete account
              </button>
              <p className="text-[10px] mt-1" style={{ color: "var(--text-muted)", opacity: 0.8 }}>
                Removes your synced data from our servers. This cannot be undone.
              </p>
            </div>
          )}

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
            {/* Android shell only: the web has no store to rate on and iOS has a
                different one. A plain anchor is what makes this work — hidescore.com
                is the server.url host, so a foreign host falls through Capacitor's
                Bridge.launchIntent to an ACTION_VIEW Intent and the Play Store app
                opens on the listing. An in-app browser would only show the store's
                web page, which has no rating control. */}
            {isAndroidApp && (
              <>
                <span aria-hidden="true" className="mx-1.5" style={{ opacity: 0.65 }}>·</span>
                <a
                  href="https://play.google.com/store/apps/details?id=com.jacobhl.hidescore"
                  className="underline underline-offset-2 transition-opacity hover:opacity-80"
                  style={{ color: "var(--text-muted)" }}
                >
                  Rate this app
                </a>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
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
}) {
  return (
    <div role="group" aria-label={label} className="grid grid-cols-3 gap-1.5">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button type="button"
            key={o.value}
            onClick={() => onChange(o.value)}
            aria-pressed={active}
            className="px-2 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-colors text-center"
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

// Always-visible team picker. Sport tab pills sit directly in the Favorite
// teams section; the active tab's team list lazy-loads via fetchSportTeams
// and is cached per-sport in lib/espn.ts so re-selecting a tab is instant.
// Sports without a per-team concept (golf, tennis) are filtered out.
// Cache + loader are hoisted to SettingsPanel so the favorites display can
// also read team names from them (otherwise favorited teams that aren't in
// today's loaded games would show "nba-8" instead of "Atlanta Hawks").
const TEAM_PICKER_SKIP: Sport[] = ["golf", "tennis", "poker"];
function TeamPicker({
  sports,
  favorites,
  onToggle,
  teamsBySport,
  loadingSports,
  loadSport,
  knownTeams,
}: {
  sports: LeagueOption[];
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
            <button type="button"
              key={s.sport}
              onClick={() => setSelectedSport(active ? null : s.sport)}
              // State is otherwise conveyed only by accent color; expose the
              // active filter to assistive tech (matches the aria-pressed toggle
              // convention used by RadioGroup and the HomeContent tab buttons).
              aria-pressed={active}
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
        aria-label={activeSport ? `Search ${activeSport.toUpperCase()} teams` : "Search all teams"}
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
                  {t.logo && (
                    /* onError hides a 404'd/blocked ESPN logo so the row degrades
                       to the team name instead of the browser's broken-image glyph
                       — matches the onError guard on every other remote team logo. */
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={t.logo} alt="" loading="lazy" decoding="async" width={16} height={16} className="w-4 h-4 shrink-0 object-contain" onError={(e) => { e.currentTarget.style.display = "none"; }} />
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
