"use client";

import { useState, useEffect, useCallback, useMemo, useRef, useLayoutEffect } from "react";
import { LeagueData, Sport } from "@/lib/types";
import type { LeagueConfig } from "@/lib/espn";
import { Preferences, Theme, loadPreferences, savePreferences, encodeFavorites, decodeFavorites } from "@/lib/preferences";
import { fetchAllLeagues, ALL_LEAGUES, isLeagueActive } from "@/lib/espn";
import { isDemoModeActive, applyDemoMode } from "@/lib/demoMode";
import LeagueColumn from "@/components/LeagueColumn";
import NewsColumn, { NewsColumnTitle, NewsSource, PlayHandler } from "@/components/NewsColumn";
import SettingsPanel from "@/components/SettingsPanel";
import { fetchLeagueNews, fetchPrebaked, leagueSourceCascade, GENERIC_CASCADE, ColumnSource } from "@/lib/news";
import DateNav, { getDateString, CalendarDropdown, getETHour, getETMinute } from "@/components/DateNav";
import ThemeToggle from "@/components/ThemeToggle";
import VideoModal from "@/components/VideoModal";
import AlignedVideoStrip from "@/components/AlignedVideoStrip";

function getResolvedTheme(theme: Theme): "dark" | "light" {
  if (theme === "system") {
    if (typeof window === "undefined") return "dark";
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return theme;
}

function getSmartDefaultOffset(): number {
  const hour = getETHour();
  const minutes = getETMinute();
  // Before 10:30am ET → default to yesterday; after → today
  return (hour < 10 || (hour === 10 && minutes < 30)) ? -1 : 0;
}

function resolveDefaultOffset(mode: "smart" | "today" | "yesterday" | undefined): number {
  if (mode === "today") return 0;
  if (mode === "yesterday") return -1;
  return getSmartDefaultOffset();
}

export default function HomeContent({ initialOffset }: { initialOffset?: number }) {
  const [leagues, setLeagues] = useState<LeagueData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [selectedDate, setSelectedDate] = useState("");

  // Compute smart default date client-side only to avoid SSG hydration mismatch.
  // Reads the persisted defaultDateMode pref so "always today" / "always yesterday"
  // overrides win over the smart-time logic.
  useEffect(() => {
    if (selectedDate === "") {
      const stored = loadPreferences();
      setSelectedDate(getDateString(initialOffset ?? resolveDefaultOffset(stored.defaultDateMode)));
    }
  }, [initialOffset, selectedDate]);
  const [showRatingsExplainer, setShowRatingsExplainer] = useState(false);
  const [showShareCopied, setShowShareCopied] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [showFavToast, setShowFavToast] = useState(false);
  const [videoModal, setVideoModal] = useState<{ videoId: string; fallbackUrl: string; playbackUrl?: string | null; imageUrl?: string | null; poster?: string | null; sourceLabel?: string | null; headline?: string | null; byline?: string | null; published?: string | null } | null>(null);
  const [showNews, setShowNews] = useState(false);
  const [showNewsExplainer, setShowNewsExplainer] = useState(false);
  const [showScrollTop, setShowScrollTop] = useState(false);
  // sortByMatchups removed — monkey toggle now controls both ratings visibility AND sort order
  const [prefs, setPrefs] = useState<Preferences>({
    favoriteLeagues: [],
    favoriteTeams: [],
    theme: "system",
    showRatings: false,
    skipExplainer: false,
    skipNewsExplainer: false,
    showNews: false,
  });

  useEffect(() => {
    const loaded = loadPreferences();
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const sharedVideoId = params.get("v");
      if (params.has("f") || params.has("l") || params.has("fl") || params.has("t")) {
        // Support new compact format (f=m1.n15&l=m.n) and old format (f=mlb-1,mlb-2&fl=mlb,nba)
        const oldTeams = params.get("f")?.includes("-") ? params.get("f")!.split(",").filter(Boolean) : null;
        const oldLeagues = params.get("fl")?.split(",").filter(Boolean) as Sport[] | null;
        const decoded = decodeFavorites(params);
        loaded.favoriteTeams = oldTeams ?? decoded.teams ?? loaded.favoriteTeams;
        loaded.favoriteLeagues = oldLeagues ?? decoded.leagues ?? loaded.favoriteLeagues;
        if (decoded.thirdLeague) loaded.thirdLeague = decoded.thirdLeague;
        if (decoded.slotLeagues) {
          loaded.firstLeague = decoded.slotLeagues[0];
          loaded.secondLeague = decoded.slotLeagues[1];
          if (decoded.slotLeagues[2]) loaded.thirdLeague = decoded.slotLeagues[2];
        }
        savePreferences(loaded);
        const keep = new URLSearchParams();
        if (sharedVideoId) keep.set("v", sharedVideoId);
        const qs = keep.toString();
        window.history.replaceState({}, "", qs ? `${window.location.pathname}?${qs}` : window.location.pathname);
      }
      if (sharedVideoId) {
        setVideoModal({ videoId: sharedVideoId, fallbackUrl: "" });
      }
    }
    // Ratings on launch: respect defaultRatings pref.
    //   auto (default) → keep the morning-safety reset (off before noon ET)
    //   off            → always off on launch
    //   on             → always on on launch
    // News view explicitly does NOT reset — it's a viewer choice, not a
    // spoiler surface, so it persists across refresh.
    const ratingsMode = loaded.defaultRatings ?? "auto";
    if (ratingsMode === "on") {
      loaded.showRatings = true;
    } else if (ratingsMode === "off") {
      loaded.showRatings = false;
    } else {
      const hour = getETHour();
      const morningReset = hour < 12;
      if (morningReset) loaded.showRatings = false;
    }
    setPrefs(loaded);
    // Landing view: defaultLandingView pref decides whether to honor the
    // remembered showNews state, force scores, or force news on launch.
    const landing = loaded.defaultLandingView ?? "remember";
    if (landing === "news") setShowNews(true);
    else if (landing === "scores") setShowNews(false);
    else if (loaded.showNews) setShowNews(true);
    document.documentElement.setAttribute("data-theme", getResolvedTheme(loaded.theme));
  }, []);

  useEffect(() => {
    if (prefs.theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => document.documentElement.setAttribute("data-theme", mq.matches ? "dark" : "light");
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [prefs.theme]);

  const openVideoModal = useCallback((videoId: string, fallbackUrl: string) => {
    setVideoModal({ videoId, fallbackUrl });
    const params = new URLSearchParams(window.location.search);
    params.set("v", videoId);
    window.history.pushState({ videoModal: true }, "", `${window.location.pathname}?${params.toString()}`);
  }, []);

  // News video card click → open the in-app modal. The card passes either a
  // prebake-matched YouTube videoId OR a direct HLS stream URL (MLB). If the
  // stream is available we play it directly; otherwise we fall back to the
  // YouTube iframe path. Cards with no inline option skip this handler and
  // render as plain anchors to the source URL.
  const playNewsVideo = useCallback<PlayHandler>((opts) => {
    setVideoModal({
      videoId: opts.videoId || "",
      playbackUrl: opts.playbackUrl || null,
      imageUrl: opts.imageUrl || null,
      poster: opts.poster || null,
      fallbackUrl: opts.fallbackUrl,
      sourceLabel: opts.sourceLabel || null,
      headline: opts.headline || null,
      byline: opts.byline || null,
      published: opts.published || null,
    });
    if (opts.videoId) {
      const params = new URLSearchParams(window.location.search);
      params.set("v", opts.videoId);
      window.history.pushState({ videoModal: true }, "", `${window.location.pathname}?${params.toString()}`);
    }
  }, []);

  const closeVideoModal = useCallback(() => {
    setVideoModal(null);
    if (typeof window !== "undefined" && window.history.state?.videoModal) {
      window.history.back();
    }
  }, []);

  // Sync modal with browser back/forward — close if ?v disappears from URL
  useEffect(() => {
    const handler = () => {
      const params = new URLSearchParams(window.location.search);
      if (!params.has("v")) setVideoModal(null);
    };
    window.addEventListener("popstate", handler);
    return () => window.removeEventListener("popstate", handler);
  }, []);

  const fetchData = useCallback(async (
    date: string,
    thirdLeague?: Sport,
    slotOverrides?: { first?: Sport; second?: Sport; third?: Sport },
  ) => {
    setLoading(true);
    setError(false);
    try {
      let data = await fetchAllLeagues(date, thirdLeague, slotOverrides);
      if (isDemoModeActive()) data = applyDemoMode(data);
      setLeagues(data);
    } catch {
      setLeagues([]);
      setError(true);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (selectedDate) {
      fetchData(selectedDate, prefs.thirdLeague, {
        first: prefs.firstLeague,
        second: prefs.secondLeague,
        third: prefs.thirdLeague,
      });
    }
  }, [selectedDate, prefs.thirdLeague, prefs.firstLeague, prefs.secondLeague, fetchData]);

  const updatePrefs = (update: Partial<Preferences>) => {
    const next = { ...prefs, ...update };
    setPrefs(next);
    savePreferences(next);
  };

  const toggleTheme = () => {
    const resolved = getResolvedTheme(prefs.theme);
    const next: Theme = resolved === "dark" ? "light" : "dark";
    updatePrefs({ theme: next });
    document.documentElement.setAttribute("data-theme", next);
  };

  const handleMonkeyClick = () => {
    if (!prefs.showRatings) {
      if (prefs.skipExplainer) {
        updatePrefs({ showRatings: true });
      } else {
        setShowRatingsExplainer(true);
      }
    } else {
      updatePrefs({ showRatings: false });
    }
  };

  const confirmRatings = (dontShowAgain: boolean) => {
    setShowRatingsExplainer(false);
    updatePrefs({ showRatings: true, skipExplainer: dontShowAgain });
  };

  const handleNewsClick = () => {
    if (showNews) {
      setShowNews(false);
      updatePrefs({ showNews: false });
      return;
    }
    if (prefs.skipNewsExplainer) {
      setShowNews(true);
      updatePrefs({ showNews: true });
    } else {
      setShowNewsExplainer(true);
    }
  };

  const confirmNews = (dontShowAgain: boolean) => {
    setShowNewsExplainer(false);
    setShowNews(true);
    updatePrefs({ showNews: true, skipNewsExplainer: dontShowAgain || prefs.skipNewsExplainer });
  };

  const setNewsThirdLeague = (sport: Sport | undefined) => {
    updatePrefs({ newsThirdLeague: sport });
  };

  // Update favicon based on ratings toggle
  useEffect(() => {
    const emoji = prefs.showRatings ? "🙉" : "🙈";
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><text x="16" y="24" text-anchor="middle" font-size="28">${emoji}</text></svg>`;
    const blob = new Blob([svg], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    let link = document.querySelector('link[rel="icon"][type="image/svg+xml"]') as HTMLLinkElement;
    if (link) {
      link.href = url;
    } else {
      link = document.createElement("link");
      link.rel = "icon";
      link.type = "image/svg+xml";
      link.href = url;
      document.head.appendChild(link);
    }
    return () => URL.revokeObjectURL(url);
  }, [prefs.showRatings]);

  const shareFavorites = () => {
    const params = encodeFavorites(prefs.favoriteTeams, prefs.favoriteLeagues, prefs.thirdLeague, [prefs.firstLeague, prefs.secondLeague, prefs.thirdLeague]);
    const url = `${window.location.origin}?${params.toString()}`;
    navigator.clipboard.writeText(url).then(() => {
      setShowShareCopied(true);
      setTimeout(() => setShowShareCopied(false), 2000);
    });
  };

  const hasFavorites = prefs.favoriteTeams.length > 0 || prefs.favoriteLeagues.length > 0;

  // Dismiss fav toast when all favorites removed
  useEffect(() => {
    if (!hasFavorites) {
      setShowFavToast(false);
      setShowShareCopied(false);
    }
  }, [hasFavorites]);

  const [favToastCopied, setFavToastCopied] = useState(false);

  const showFavSavedToast = () => {
    setShowFavToast(true);
    setFavToastCopied(false);
  };

  const dismissFavToast = () => {
    setShowFavToast(false);
  };

  const copyFavLink = () => {
    const params = encodeFavorites(prefs.favoriteTeams, prefs.favoriteLeagues, prefs.thirdLeague, [prefs.firstLeague, prefs.secondLeague, prefs.thirdLeague]);
    const url = `${window.location.origin}?${params.toString()}`;
    navigator.clipboard.writeText(url).then(() => {
      setFavToastCopied(true);
      setTimeout(() => {
        dismissFavToast();
      }, 1200);
    });
  };

  const toggleFavoriteLeague = (sport: Sport) => {
    const current = prefs.favoriteLeagues;
    if (current.includes(sport)) {
      updatePrefs({ favoriteLeagues: current.filter((s) => s !== sport) });
    } else {
      updatePrefs({ favoriteLeagues: [...current, sport] });
      showFavSavedToast();
    }
  };

  const toggleFavoriteTeam = (teamId: string) => {
    const current = prefs.favoriteTeams;
    if (current.includes(teamId)) {
      updatePrefs({ favoriteTeams: current.filter((id) => id !== teamId) });
    } else {
      updatePrefs({ favoriteTeams: [...current, teamId] });
      showFavSavedToast();
    }
  };

  const isToday = selectedDate === getDateString(0);

  // Compute which leagues are available for the 3rd slot dropdown
  const thirdLeagueOptions = useMemo(() => {
    if (!selectedDate) return [];
    const viewDate = new Date(`${selectedDate.slice(0, 4)}-${selectedDate.slice(4, 6)}-${selectedDate.slice(6, 8)}T12:00:00`);
    // Get all active leagues for this date, deduplicated by sport
    const seen = new Set<Sport>();
    const options: { sport: Sport; label: string }[] = [];
    for (const league of ALL_LEAGUES) {
      if (seen.has(league.sport)) continue;
      if (!isLeagueActive(league, viewDate)) continue;
      seen.add(league.sport);
      options.push({ sport: league.sport, label: league.label });
    }
    return options;
  }, [selectedDate]);

  const setThirdLeague = (sport: Sport | undefined) => {
    updatePrefs({ thirdLeague: sport });
  };

  const setSlotLeague = (slotIdx: number, sport: Sport | undefined) => {
    if (slotIdx === 0) updatePrefs({ firstLeague: sport });
    else if (slotIdx === 1) updatePrefs({ secondLeague: sport });
    else if (slotIdx === 2) updatePrefs({ thirdLeague: sport });
  };

  const selectedSlotLeagues: (Sport | undefined)[] = [
    prefs.firstLeague,
    prefs.secondLeague,
    prefs.thirdLeague,
  ];

  const sortedLeagues = [...leagues].sort((a, b) => {
    const aIdx = prefs.favoriteLeagues.indexOf(a.sport);
    const bIdx = prefs.favoriteLeagues.indexOf(b.sport);
    const aFav = aIdx !== -1;
    const bFav = bIdx !== -1;

    if (aFav && !bFav) return -1;
    if (bFav && !aFav) return 1;
    if (aFav && bFav) return aIdx - bIdx;
    return 0;
  });

  const headerRef = useRef<HTMLElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const header = headerRef.current;
    const root = rootRef.current;
    if (!header || !root) return;
    const measure = () => {
      const h = header.getBoundingClientRect().height;
      root.style.setProperty("--header-h", `${h}px`);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(header);
    return () => ro.disconnect();
  }, []);

  // Measure the news-view league-title strip so per-source sticky headers
  // pin flush against its bottom edge (top: header-h + news-titlebar-h).
  // Callback ref instead of useEffect because the title row only mounts
  // after `allFirstAreVideo` flips true (which depends on async data) —
  // a deps-based effect on [showNews] fires too early and finds null.
  const newsTitleRowRoRef = useRef<ResizeObserver | null>(null);
  const newsTitleRowRef = useCallback((row: HTMLDivElement | null) => {
    const root = rootRef.current;
    if (newsTitleRowRoRef.current) {
      newsTitleRowRoRef.current.disconnect();
      newsTitleRowRoRef.current = null;
    }
    if (!root) return;
    if (!row) {
      root.style.removeProperty("--news-titlebar-h");
      return;
    }
    const measure = () => {
      const h = row.getBoundingClientRect().height;
      root.style.setProperty("--news-titlebar-h", `${h}px`);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(row);
    newsTitleRowRoRef.current = ro;
  }, []);

  useEffect(() => {
    const onScroll = () => setShowScrollTop(window.scrollY > 400);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const [isNativeApp, setIsNativeApp] = useState(false);
  useEffect(() => {
    type CapacitorGlobal = { Capacitor?: { isNativePlatform?: () => boolean } };
    const cap = (window as unknown as CapacitorGlobal).Capacitor;
    setIsNativeApp(!!cap?.isNativePlatform?.());
  }, []);

  const [settingsOpen, setSettingsOpen] = useState(false);
  // Aggregate teams seen across loaded leagues so the settings panel can map
  // favorite-team IDs to display names + logos. Teams favorited but not
  // currently in any loaded game fall through to "id-only" rendering.
  const knownTeams = useMemo(() => {
    const seen = new Map<string, { id: string; sport: Sport; displayName: string; logo?: string }>();
    for (const league of leagues) {
      for (const game of league.games) {
        for (const team of [game.homeTeam, game.awayTeam]) {
          if (!seen.has(team.id)) {
            seen.set(team.id, { id: team.id, sport: league.sport, displayName: team.displayName, logo: team.logo });
          }
        }
      }
    }
    return Array.from(seen.values());
  }, [leagues]);

  const resolvedTheme = getResolvedTheme(prefs.theme);

  return (
    <div ref={rootRef} className="min-h-screen flex flex-col" style={{ background: "var(--bg)", color: "var(--text)" }}>
      <header ref={headerRef} className="px-4 py-4 sticky top-0 z-40" style={{ borderBottom: "1px solid var(--border)", background: "var(--bg)", backdropFilter: "blur(8px)", paddingTop: "calc(env(safe-area-inset-top) + 1rem)" }}>
        <div className="max-w-6xl mx-auto relative flex items-center justify-between gap-2 sm:gap-4">
          <a
            href="/"
            onClick={(e) => {
              // In the news view, the logo acts as "back to scores" — toggle
              // news off in place instead of navigating, since "/" would
              // just rehydrate news from prefs.showNews and bounce the user
              // right back into the news view.
              if (showNews) {
                e.preventDefault();
                setShowNews(false);
                updatePrefs({ showNews: false });
                window.scrollTo({ top: 0, behavior: "auto" });
              }
            }}
            className="hover:opacity-80 transition-opacity flex items-center flex-shrink-0"
            style={{ color: "var(--text)" }}
          >
            <span className="hidden xl:inline text-lg font-bold tracking-tight">HideScore</span>
            <svg className="xl:hidden w-6 h-6 header-logo" viewBox="0 0 32 32" fill="none">
              <rect width="32" height="32" rx="6" className="header-logo-bg" />
              <text x="16" y="22" textAnchor="middle" fontSize="16" fontWeight="700" fontFamily="system-ui" className="header-logo-text">H</text>
            </svg>
          </a>
          <div className="flex-1 flex justify-center xl:absolute xl:left-1/2 xl:-translate-x-1/2">
            {!showNews && <DateNav selectedDate={selectedDate} onDateChange={setSelectedDate} />}
          </div>
          <div className="justify-self-end flex items-center gap-1 sm:gap-2 flex-shrink-0">
            {hasFavorites && (
              <button
                onClick={shareFavorites}
                className="monkey-toggle w-7 h-7 sm:w-9 sm:h-9 flex items-center justify-center rounded-full transition-all duration-200 hover:scale-110 cursor-pointer text-sm sm:text-lg"
                style={{
                  background: "var(--bg-card)",
                  border: "1px solid var(--border)",
                  color: showShareCopied ? "var(--accent)" : "var(--text-muted)",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = "var(--accent)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = "var(--border)";
                }}
                title={showShareCopied ? "Link copied!" : "Copy favorites link"}
              >
                {showShareCopied ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="sm:w-4 sm:h-4">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                ) : (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="sm:w-4 sm:h-4">
                    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                  </svg>
                )}
              </button>
            )}
            {!showNews && (
              <button
                onClick={handleMonkeyClick}
                className="monkey-toggle w-7 h-7 sm:w-9 sm:h-9 flex items-center justify-center rounded-full transition-all duration-200 hover:scale-110 cursor-pointer"
                style={{
                  background: "var(--bg-card)",
                  border: "1px solid var(--border)",
                  color: "var(--text-muted)",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = "var(--accent)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = "var(--border)";
                }}
                title={prefs.showRatings ? "Hide ratings & sort chronologically" : "Show ratings & sort by best games"}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={prefs.showRatings ? "/monkey-hear-no-evil.svg" : "/monkey-see-no-evil.svg"}
                  alt={prefs.showRatings ? "Hide ratings" : "Show ratings"}
                  width={20}
                  height={20}
                  className="w-4 h-4 sm:w-5 sm:h-5"
                  draggable={false}
                />
              </button>
            )}
            <button
              onClick={handleNewsClick}
              className="monkey-toggle w-7 h-7 sm:w-9 sm:h-9 flex items-center justify-center rounded-full transition-all duration-200 hover:scale-110 cursor-pointer"
              style={{
                background: showNews ? "var(--accent)" : "var(--bg-card)",
                border: `1px solid ${showNews ? "var(--accent)" : "var(--border)"}`,
                color: showNews ? "white" : "var(--text-muted)",
              }}
              onMouseEnter={(e) => { if (!showNews) e.currentTarget.style.borderColor = "var(--accent)"; }}
              onMouseLeave={(e) => { if (!showNews) e.currentTarget.style.borderColor = "var(--border)"; }}
              title={showNews ? "Back to scores" : "View news (contains spoilers)"}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="sm:w-4 sm:h-4">
                <path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2Zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2" />
                <path d="M18 14h-8" />
                <path d="M15 18h-5" />
                <path d="M10 6h8v4h-8V6Z" />
              </svg>
            </button>
            <div className={`relative ${showNews ? "hidden" : ""}`}>
              <button
                onClick={() => setCalendarOpen(!calendarOpen)}
                className="monkey-toggle w-7 h-7 sm:w-9 sm:h-9 flex items-center justify-center rounded-full transition-all duration-200 hover:scale-110 cursor-pointer"
                style={{
                  background: calendarOpen ? "var(--accent)" : "var(--bg-card)",
                  border: `1px solid ${calendarOpen ? "var(--accent)" : "var(--border)"}`,
                  color: calendarOpen ? "white" : "var(--text-muted)",
                }}
                onMouseEnter={(e) => {
                  if (!calendarOpen) e.currentTarget.style.borderColor = "var(--accent)";
                }}
                onMouseLeave={(e) => {
                  if (!calendarOpen) e.currentTarget.style.borderColor = "var(--border)";
                }}
                title="Pick a date"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="sm:w-4 sm:h-4">
                  <rect x="3" y="4" width="18" height="18" rx="2" />
                  <line x1="16" y1="2" x2="16" y2="6" />
                  <line x1="8" y1="2" x2="8" y2="6" />
                  <line x1="3" y1="10" x2="21" y2="10" />
                </svg>
              </button>
              {calendarOpen && (
                <CalendarDropdown
                  selectedDate={selectedDate}
                  onDateChange={(d) => { setSelectedDate(d); setCalendarOpen(false); }}
                  onClose={() => setCalendarOpen(false)}
                />
              )}
            </div>
            <ThemeToggle theme={prefs.theme} onToggle={toggleTheme} />
            <button
              onClick={() => setSettingsOpen(true)}
              className="monkey-toggle w-7 h-7 sm:w-9 sm:h-9 flex items-center justify-center rounded-full transition-all duration-200 hover:scale-110 cursor-pointer"
              style={{
                background: settingsOpen ? "var(--accent)" : "var(--bg-card)",
                border: `1px solid ${settingsOpen ? "var(--accent)" : "var(--border)"}`,
                color: settingsOpen ? "white" : "var(--text-muted)",
              }}
              onMouseEnter={(e) => { if (!settingsOpen) e.currentTarget.style.borderColor = "var(--accent)"; }}
              onMouseLeave={(e) => { if (!settingsOpen) e.currentTarget.style.borderColor = "var(--border)"; }}
              title="Settings"
              aria-label="Open settings"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="sm:w-4 sm:h-4">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 pt-0 pb-6 flex-1 w-full">
        {showNews ? (() => {
          const cascadeToSources = (cascade: ColumnSource[]): NewsSource[] =>
            cascade.map((c) => ({
              label: c.label,
              logoUrl: c.logoUrl,
              variant: c.variant,
              fetch: c.kind === "espn-league" && c.sport
                ? () => fetchLeagueNews(c.sport!, 10)
                : () => fetchPrebaked(c.key),
            }));
          const buildSources = (sport?: Sport): NewsSource[] =>
            sport ? cascadeToSources(leagueSourceCascade(sport)) : [];
          const col1All = buildSources(sortedLeagues[0]?.sport);
          const col2All = buildSources(sortedLeagues[1]?.sport);
          const col3All: NewsSource[] = prefs.newsThirdLeague
            ? buildSources(prefs.newsThirdLeague)
            : cascadeToSources(GENERIC_CASCADE);
          // When all 3 columns lead with a video source, lift those into the
          // aligned strip so video N in every column is the same vertical
          // size. Otherwise let each column render its own first card.
          const allFirstAreVideo =
            col1All[0]?.variant === "video" &&
            col2All[0]?.variant === "video" &&
            col3All[0]?.variant === "video";
          const col1Rest = allFirstAreVideo ? col1All.slice(1) : col1All;
          const col2Rest = allFirstAreVideo ? col2All.slice(1) : col2All;
          // ESPN top headlines slot into col 3's empty pad cells inside the
          // video strip (via `tailFetch`) when col 3 is generic — fills the
          // open space below espn-videos without changing the videos' heights.
          // Pull it out of col3Rest so we don't render the same card twice.
          const useEspnTopTail = allFirstAreVideo && !prefs.newsThirdLeague;
          const col3Rest = allFirstAreVideo
            ? (useEspnTopTail
                ? col3All.slice(1).filter((s) => s.label !== "ESPN")
                : col3All.slice(1))
            : col3All;
          const col3Title = prefs.newsThirdLeague
            ? (thirdLeagueOptions.find((o) => o.sport === prefs.newsThirdLeague)?.label ?? "News")
            : "News";
          // Cols 1 and 2 are already showing sortedLeagues[0] and [1]'s news,
          // so hide them from the col-3 swap dropdown — listing them is
          // redundant since they're permanently exposed.
          const newsExposedSports = new Set([
            sortedLeagues[0]?.sport,
            sortedLeagues[1]?.sport,
          ].filter((s): s is Sport => !!s));
          const newsThirdLeagueOptions = thirdLeagueOptions.filter(
            (o) => !newsExposedSports.has(o.sport),
          );
          return (
            <>
              {allFirstAreVideo && (
                <>
                  {/* League titles render above AlignedVideoStrip so MLB / NBA /
                      News sit at the top — otherwise the video strip pushes the
                      titles below it. The row itself is sticky (matching the
                      home page's per-column title pinning) so titles stay under
                      the main header as you scroll. Ref drives --news-titlebar-h
                      which positions per-source sticky headers below it. */}
                  <div
                    ref={newsTitleRowRef}
                    className="flex flex-row justify-center items-stretch gap-2 sm:gap-4 league-sticky-top sticky z-30"
                    style={{ background: "var(--bg)" }}
                  >
                    <div className="flex-1 min-w-0 max-w-[225px] xl:max-w-[280px]">
                      <NewsColumnTitle title={sortedLeagues[0]?.label ?? "News"} />
                    </div>
                    <div className="flex-1 min-w-0 max-w-[225px] xl:max-w-[280px]">
                      <NewsColumnTitle title={sortedLeagues[1]?.label ?? "News"} />
                    </div>
                    <div className="flex-1 min-w-0 max-w-[225px] xl:max-w-[280px]">
                      <NewsColumnTitle
                        title={col3Title}
                        swappableOptions={newsThirdLeagueOptions}
                        selectedThirdLeague={prefs.newsThirdLeague}
                        onSwapLeague={setNewsThirdLeague}
                      />
                    </div>
                  </div>
                  <AlignedVideoStrip
                    sources={[col1All[0], col2All[0], col3All[0]]}
                    onPlay={playNewsVideo}
                    tailFetch={useEspnTopTail ? () => fetchPrebaked("espn-top") : undefined}
                    tailColIdx={useEspnTopTail ? 2 : undefined}
                  />
                </>
              )}
              <div className="flex flex-row justify-center items-stretch gap-2 sm:gap-4">
                <NewsColumn
                  title={sortedLeagues[0]?.label ?? "News"}
                  sources={col1Rest}
                  hideTitle={allFirstAreVideo}
                  onPlayVideo={playNewsVideo}
                />
                <NewsColumn
                  title={sortedLeagues[1]?.label ?? "News"}
                  sources={col2Rest}
                  hideTitle={allFirstAreVideo}
                  onPlayVideo={playNewsVideo}
                />
                <NewsColumn
                  title={col3Title}
                  sources={col3Rest}
                  swappableOptions={newsThirdLeagueOptions}
                  selectedThirdLeague={prefs.newsThirdLeague}
                  onSwapLeague={setNewsThirdLeague}
                  hideTitle={allFirstAreVideo}
                  onPlayVideo={playNewsVideo}
                />
              </div>
            </>
          );
        })() : loading ? (
          <div className="flex flex-row justify-center items-stretch gap-2 sm:gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="min-w-0 flex-1 max-w-[225px] xl:max-w-[280px]">
                <div className="flex flex-col items-center pb-2 sm:pb-3" style={{ paddingTop: "1.75rem" }}>
                  <div className="h-6 sm:h-7 w-20 sm:w-24 rounded" style={{ background: "var(--bg-card)" }} />
                  <span className="text-[9px] sm:text-[10px] italic mt-0.5 block" style={{ color: "transparent" }}>{"\u00A0"}</span>
                </div>
                {[1, 2, 3, 4].map((j) => (
                  <div key={j} className="rounded-lg px-4 py-3 mb-2 animate-pulse" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
                    <div className="h-3 w-20 rounded mb-3" style={{ background: "var(--bg-card-hover)" }} />
                    <div className="flex items-center gap-3 py-1.5">
                      <div className="w-6 h-6 rounded-full" style={{ background: "var(--bg-card-hover)" }} />
                      <div className="h-3 w-32 rounded" style={{ background: "var(--bg-card-hover)" }} />
                    </div>
                    <div className="flex items-center gap-3 py-1.5">
                      <div className="w-6 h-6 rounded-full" style={{ background: "var(--bg-card-hover)" }} />
                      <div className="h-3 w-28 rounded" style={{ background: "var(--bg-card-hover)" }} />
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <p style={{ color: "var(--text-muted)" }}>Failed to load games</p>
            <button
              onClick={() => fetchData(selectedDate)}
              className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text)" }}
            >
              Retry
            </button>
          </div>
        ) : (
          (() => {
            const isPast = selectedDate < getDateString(0);
            const hasNonFinished = !isPast && sortedLeagues.some(l => l.games.some(g => g.state !== "post"));
            const hasFinished = !isPast && sortedLeagues.some(l => l.games.some(g => g.state === "post"));
            const showFinalSplit = hasNonFinished && hasFinished;
            const commonProps = {
              isFavoriteLeague: false as boolean,
              onToggleFavoriteLeague: toggleFavoriteLeague,
              favoriteTeams: prefs.favoriteTeams,
              onToggleFavoriteTeam: toggleFavoriteTeam,
              showRatings: prefs.showRatings,
              isPastDate: isPast,
              isToday,
              sortByMatchups: prefs.showRatings,
              onPlayHighlight: openVideoModal,
              selectedDate,
            };
            // Per-slot swap dropdowns: each column's dropdown excludes leagues
            // already shown in the OTHER slots so the user never picks a duplicate.
            const displayedSports = sortedLeagues.map(l => l.sport);
            const swapPropsForSlot = (idx: number) => {
              const others = new Set(displayedSports.filter((_, i) => i !== idx));
              const options = thirdLeagueOptions.filter(o => !others.has(o.sport));
              return {
                swappableOptions: options,
                selectedThirdLeague: selectedSlotLeagues[idx],
                onSwapLeague: (s: Sport | undefined) => setSlotLeague(idx, s),
              };
            };

            if (showFinalSplit) {
              return (
                <div className="flex flex-row justify-center items-stretch gap-2 sm:gap-4">
                  {sortedLeagues.map((league, idx) => (
                    <LeagueColumn
                      key={league.sport}
                      league={league}
                      {...commonProps}
                      isFavoriteLeague={prefs.favoriteLeagues.includes(league.sport)}
                      showFinalSeparator
                      {...swapPropsForSlot(idx)}
                    />
                  ))}
                </div>
              );
            }

            return (
              <div className="flex flex-row justify-center items-stretch gap-2 sm:gap-4">
                {sortedLeagues.map((league, idx) => (
                  <LeagueColumn
                    key={league.sport}
                    league={league}
                    {...commonProps}
                    isFavoriteLeague={prefs.favoriteLeagues.includes(league.sport)}
                    {...swapPropsForSlot(idx)}
                  />
                ))}
              </div>
            );
          })()
        )}
      </main>

      <footer className="px-4 py-3 text-center text-xs flex flex-col items-center gap-1" style={{ borderTop: "1px solid var(--border)", color: "var(--text-muted)", paddingBottom: "calc(env(safe-area-inset-bottom) + 1.25rem)" }}>
        <span>Catch up on games without spoilers.</span>
        <span className="inline-flex items-center gap-1">Select {/* eslint-disable-next-line @next/next/no-img-element */}<img src="/monkey-see-no-evil.svg" alt="see-no-evil monkey" width={14} height={14} className="inline-block align-text-bottom" draggable={false} /> to show ratings and sort by top records.</span>
        <span>
          <a href="mailto:hi@hidescore.com" className="underline underline-offset-2 transition-colors hover:opacity-70" style={{ color: "var(--text-muted)" }}>hi@hidescore.com</a>
          {" "}
          <a href="/privacy" className="underline underline-offset-2 transition-colors hover:opacity-70" style={{ color: "var(--text-muted)" }}>Privacy</a>
        </span>
        {!isNativeApp && (
          <a
            href="https://apps.apple.com/app/hidescore/id6766885311"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block mt-2 leading-none transition-opacity hover:opacity-80"
            aria-label="Download HideScore on the App Store"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/app-store-badge.svg" alt="Download on the App Store" height={40} className="block h-10 w-auto" />
          </a>
        )}
      </footer>

      {showFavToast && (
        <div
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 rounded-xl shadow-lg animate-fade-in max-w-xs w-[calc(100%-2rem)]"
          style={{ background: "linear-gradient(var(--bg-card), var(--bg-card)), var(--bg)", border: "1px solid var(--border)" }}
        >
          <div className="px-4 py-3">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-medium" style={{ color: "var(--text)" }}>
                Favorites saved to this browser
              </p>
              <button
                onClick={dismissFavToast}
                className="text-xs shrink-0 mt-0.5 cursor-pointer"
                style={{ color: "var(--text-muted)" }}
              >
                {"\u2715"}
              </button>
            </div>
            <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
              Bookmark or copy link to keep across devices
            </p>
            <button
              onClick={copyFavLink}
              className="mt-2 w-full py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer"
              style={{ background: "var(--accent)", color: "white" }}
            >
              {favToastCopied ? "Copied!" : "Copy favorites link"}
            </button>
          </div>
        </div>
      )}

      {showRatingsExplainer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setShowRatingsExplainer(false)}>
          <div className="absolute inset-0 bg-black/50" />
          <div
            className="relative rounded-xl p-5 max-w-sm w-full shadow-xl"
            style={{ background: "var(--bg)", border: "2px solid var(--accent)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-center mb-2">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-label="warning">
                <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </div>
            <h3 className="font-bold text-base mb-2 text-center" style={{ color: "var(--text)" }}>Show Game Ratings?</h3>
            {/* Previous wording (finished games only):
            <p className="text-sm mb-3" style={{ color: "var(--text-secondary)" }}>
              This will reveal how competitive each game was. Ratings are based on how close the game was —<br />not who won — but they can hint at the outcome.
            </p>
            */}
            <p className="text-sm mb-3" style={{ color: "var(--text-secondary)" }}>
              Ratings show how competitive each game is:<br />based on <strong>score closeness</strong>, not who&apos;s winning.<br />They can hint at the outcome.
            </p>
            <p className="text-sm mb-3" style={{ color: "var(--text-secondary)" }}>
              Games will also be reordered by <strong>top records and best matchups</strong>. <em>This is my preferred view!</em>
            </p>
            <div className="rounded-lg p-3 mb-4" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
              <p className="text-xs font-medium mb-2" style={{ color: "var(--text-muted)" }}>RATING SCALE</p>
              <div className="flex flex-col gap-1.5 text-sm">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-green-600 text-white w-14 text-center">GREAT</span>
                  <span style={{ color: "var(--text-secondary)" }}>Must-watch — down to the wire</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-yellow-600 text-white w-14 text-center">GOOD</span>
                  <span style={{ color: "var(--text-secondary)" }}>Competitive and entertaining</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-orange-600 text-white w-14 text-center">MEH</span>
                  <span style={{ color: "var(--text-secondary)" }}>One-sided, but watchable</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-700 text-white w-14 text-center">SKIP</span>
                  <span style={{ color: "var(--text-secondary)" }}>Blowout — skip unless your team</span>
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setShowRatingsExplainer(false)}
                className="flex-1 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer"
                style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text)" }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--accent)"; e.currentTarget.style.background = "var(--bg-card-hover)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.background = "var(--bg-card)"; }}
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const cb = document.getElementById("dont-show-explainer") as HTMLInputElement | null;
                  confirmRatings(cb?.checked ?? false);
                }}
                className="flex-1 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer"
                style={{ background: "var(--accent)", color: "white" }}
                onMouseEnter={(e) => { e.currentTarget.style.filter = "brightness(1.15)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.filter = "none"; }}
              >
                Show Ratings
              </button>
            </div>
            <label className="flex items-center gap-2 mt-3 cursor-pointer select-none justify-end">
              <input type="checkbox" id="dont-show-explainer" className="accent-[var(--accent)]" />
              <span className="text-xs" style={{ color: "var(--text-muted)" }}>Don&apos;t show this again</span>
            </label>
          </div>
        </div>
      )}

      {showNewsExplainer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setShowNewsExplainer(false)}>
          <div className="absolute inset-0 bg-black/50" />
          <div
            className="relative rounded-xl p-5 max-w-sm w-full shadow-xl"
            style={{ background: "var(--bg)", border: "2px solid var(--accent)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-center mb-2">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-label="warning">
                <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </div>
            <h3 className="font-bold text-base mb-2 text-center" style={{ color: "var(--text)" }}>
              Warning
              <br />
              FULL OF SPOILERS
            </h3>
            <p className="text-sm mb-4 text-center" style={{ color: "var(--text-secondary)" }}>
              News headlines and images give away game results, player performance, and outcomes.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setShowNewsExplainer(false)}
                className="flex-1 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer"
                style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text)" }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--accent)"; e.currentTarget.style.background = "var(--bg-card-hover)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.background = "var(--bg-card)"; }}
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const cb = document.getElementById("dont-show-news-explainer") as HTMLInputElement | null;
                  confirmNews(cb?.checked ?? false);
                }}
                className="flex-1 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer"
                style={{ background: "var(--accent)", color: "white" }}
                onMouseEnter={(e) => { e.currentTarget.style.filter = "brightness(1.15)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.filter = "none"; }}
              >
                Show News
              </button>
            </div>
            <label className="flex items-center gap-2 mt-3 cursor-pointer select-none justify-end">
              <input type="checkbox" id="dont-show-news-explainer" className="accent-[var(--accent)]" />
              <span className="text-xs" style={{ color: "var(--text-muted)" }}>Don&apos;t show this again</span>
            </label>
          </div>
        </div>
      )}

      {videoModal && (
        <VideoModal
          videoId={videoModal.videoId}
          fallbackUrl={videoModal.fallbackUrl}
          playbackUrl={videoModal.playbackUrl}
          imageUrl={videoModal.imageUrl}
          poster={videoModal.poster}
          sourceLabel={videoModal.sourceLabel}
          headline={videoModal.headline}
          byline={videoModal.byline}
          published={videoModal.published}
          onClose={closeVideoModal}
        />
      )}

      <SettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        prefs={prefs}
        updatePrefs={updatePrefs}
        resolvedTheme={resolvedTheme}
        thirdLeagueOptions={thirdLeagueOptions}
        displayedLeagues={sortedLeagues}
        knownTeams={knownTeams}
        onShareFavorites={shareFavorites}
        shareCopied={showShareCopied}
      />

      <button
        type="button"
        aria-label="Scroll to top"
        title="Scroll to top"
        onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        className={`monkey-toggle fixed z-40 w-11 h-11 rounded-full flex items-center justify-center cursor-pointer transition-all duration-200 hover:scale-110 shadow-lg ${showScrollTop ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"}`}
        style={{
          right: "2rem",
          bottom: "calc(env(safe-area-inset-bottom) + 1.5rem)",
          // var(--bg) instead of --bg-card so the button stays opaque over
          // arbitrary scrolled content — bg-card is rgba(.., .05) in dark mode
          // and would make the button nearly invisible over a Reddit thumbnail.
          background: "var(--bg)",
          border: "1px solid var(--border)",
          color: "var(--text-muted)",
        }}
        onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--accent)"; e.currentTarget.style.color = "var(--accent)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.color = "var(--text-muted)"; }}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="18 15 12 9 6 15" />
        </svg>
      </button>
    </div>
  );
}
