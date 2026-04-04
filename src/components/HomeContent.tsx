"use client";

import { useState, useEffect, useCallback } from "react";
import { LeagueData, Sport } from "@/lib/types";
import { Preferences, Theme, loadPreferences, savePreferences, encodeFavorites, decodeFavorites } from "@/lib/preferences";
import { fetchAllLeagues } from "@/lib/espn";
import LeagueColumn from "@/components/LeagueColumn";
import DateNav, { getDateString, CalendarDropdown, getETHour, getETMinute } from "@/components/DateNav";
import ThemeToggle from "@/components/ThemeToggle";
import VideoModal from "@/components/VideoModal";

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

export default function HomeContent({ initialOffset }: { initialOffset?: number }) {
  const [leagues, setLeagues] = useState<LeagueData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [selectedDate, setSelectedDate] = useState("");

  // Compute smart default date client-side only to avoid SSG hydration mismatch
  useEffect(() => {
    if (selectedDate === "") {
      setSelectedDate(getDateString(initialOffset ?? getSmartDefaultOffset()));
    }
  }, [initialOffset, selectedDate]);
  const [showRatingsExplainer, setShowRatingsExplainer] = useState(false);
  const [showShareCopied, setShowShareCopied] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [showFavToast, setShowFavToast] = useState(false);
  const [videoModal, setVideoModal] = useState<{ videoId: string; fallbackUrl: string } | null>(null);
  // sortByMatchups removed — monkey toggle now controls both ratings visibility AND sort order
  const [prefs, setPrefs] = useState<Preferences>({
    favoriteLeagues: [],
    favoriteTeams: [],
    theme: "system",
    showRatings: false,
    skipExplainer: false,
  });

  useEffect(() => {
    const loaded = loadPreferences();
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.has("f") || params.has("l") || params.has("fl")) {
        // Support new compact format (f=m1.n15&l=m.n) and old format (f=mlb-1,mlb-2&fl=mlb,nba)
        const oldTeams = params.get("f")?.includes("-") ? params.get("f")!.split(",").filter(Boolean) : null;
        const oldLeagues = params.get("fl")?.split(",").filter(Boolean) as Sport[] | null;
        const decoded = decodeFavorites(params);
        loaded.favoriteTeams = oldTeams ?? decoded.teams ?? loaded.favoriteTeams;
        loaded.favoriteLeagues = oldLeagues ?? decoded.leagues ?? loaded.favoriteLeagues;
        savePreferences(loaded);
        window.history.replaceState({}, "", window.location.pathname);
      }
    }
    setPrefs(loaded);
    document.documentElement.setAttribute("data-theme", getResolvedTheme(loaded.theme));
  }, []);

  useEffect(() => {
    if (prefs.theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => document.documentElement.setAttribute("data-theme", mq.matches ? "dark" : "light");
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [prefs.theme]);

  const fetchData = useCallback(async (date: string) => {
    setLoading(true);
    setError(false);
    try {
      const data = await fetchAllLeagues(date);
      setLeagues(data);
    } catch {
      setLeagues([]);
      setError(true);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (selectedDate) fetchData(selectedDate);
  }, [selectedDate, fetchData]);

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
    const params = encodeFavorites(prefs.favoriteTeams, prefs.favoriteLeagues);
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
    const params = encodeFavorites(prefs.favoriteTeams, prefs.favoriteLeagues);
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

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "var(--bg)", color: "var(--text)" }}>
      <header className="px-4 py-4 sticky top-0 z-40" style={{ borderBottom: "1px solid var(--border)", background: "var(--bg)", backdropFilter: "blur(8px)" }}>
        <div className="max-w-6xl mx-auto relative flex items-center justify-between gap-2 sm:gap-4">
          <a href="/" className="hover:opacity-80 transition-opacity flex items-center flex-shrink-0" style={{ color: "var(--text)" }}>
            <span className="hidden sm:inline text-lg font-bold tracking-tight">HideScore</span>
            <svg className="sm:hidden w-6 h-6 header-logo" viewBox="0 0 32 32" fill="none">
              <rect width="32" height="32" rx="6" className="header-logo-bg" />
              <text x="16" y="22" textAnchor="middle" fontSize="16" fontWeight="700" fontFamily="system-ui" className="header-logo-text">H</text>
            </svg>
          </a>
          <div className="absolute left-1/2 -translate-x-1/2">
            <DateNav selectedDate={selectedDate} onDateChange={setSelectedDate} />
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
                {showShareCopied ? "\u2713" : (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="sm:w-4 sm:h-4">
                    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                  </svg>
                )}
              </button>
            )}
            <button
              onClick={handleMonkeyClick}
              className="monkey-toggle w-7 h-7 sm:w-9 sm:h-9 flex items-center justify-center rounded-full transition-all duration-200 hover:scale-110 cursor-pointer text-sm sm:text-lg"
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
              {prefs.showRatings ? "\u{1F649}" : "\u{1F648}"}
            </button>
            {/* Funnel/sort button removed — monkey now controls both ratings + sort */}
            <div className="relative">
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
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6 flex-1 w-full">
        {loading ? (
          <div className="grid grid-cols-3 gap-2 sm:gap-4 lg:gap-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="min-w-0">
                <div className="h-6 w-16 mx-auto mb-3 rounded" style={{ background: "var(--bg-card)" }} />
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
          <div className="grid grid-cols-3 gap-2 sm:gap-4 lg:gap-6">
            {sortedLeagues.map((league) => (
              <LeagueColumn
                key={league.sport}
                league={league}
                isFavoriteLeague={prefs.favoriteLeagues.includes(league.sport)}
                onToggleFavoriteLeague={toggleFavoriteLeague}
                favoriteTeams={prefs.favoriteTeams}
                onToggleFavoriteTeam={toggleFavoriteTeam}
                showRatings={prefs.showRatings}
                isPastDate={selectedDate < getDateString(0)}
                isToday={isToday}
                sortByMatchups={prefs.showRatings}
                onPlayHighlight={(videoId, fallbackUrl) => setVideoModal({ videoId, fallbackUrl })}
              />
            ))}
          </div>
        )}
      </main>

      <footer className="px-4 py-3 text-center text-xs flex flex-col items-center gap-1" style={{ borderTop: "1px solid var(--border)", color: "var(--text-muted)" }}>
        <span>Catch up on games without spoilers.</span>
        {/* <span>Select {"\u{1F648}"} to rank by closest games.</span> */}
        <span>Select {"\u{1F648}"} to show ratings and sort by top records/matchups.</span>
        {/* <span>Live and future games ranked by competitiveness and top teams.</span> */}
        {/* BACKUP — expanded footer copy to revisit later:
        <span style={{ fontSize: "0.8rem", fontWeight: 500 }}>Watch games like they&apos;re live — even when they&apos;re not.</span>
        <span style={{ maxWidth: "26rem", lineHeight: 1.5 }}>Scores hidden by default. Competitiveness ratings tell you what&apos;s worth watching without giving anything away. Pick any date, filter by your teams, and hit play — spoiler-free.</span>
        */}
        <a href="mailto:hi@hidescore.com" className="underline underline-offset-2 transition-colors hover:opacity-70" style={{ color: "var(--text-muted)" }}>hi@hidescore.com</a>
      </footer>

      {showFavToast && (
        <div
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 rounded-xl shadow-lg animate-fade-in max-w-xs w-[calc(100%-2rem)]"
          style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
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
            <div className="text-center text-3xl mb-2">{"\u26A0\uFE0F"}</div>
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

      {videoModal && (
        <VideoModal
          videoId={videoModal.videoId}
          fallbackUrl={videoModal.fallbackUrl}
          onClose={() => setVideoModal(null)}
        />
      )}
    </div>
  );
}
