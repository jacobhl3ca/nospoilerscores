"use client";

import { useState, useEffect, useCallback } from "react";
import { LeagueData, Sport } from "@/lib/types";
import { Preferences, Theme, loadPreferences, savePreferences } from "@/lib/preferences";
import { fetchAllLeagues } from "@/lib/espn";
import LeagueColumn from "@/components/LeagueColumn";
import DateNav, { getDateString } from "@/components/DateNav";
import ThemeToggle from "@/components/ThemeToggle";
import VideoModal from "@/components/VideoModal";

function getResolvedTheme(theme: Theme): "dark" | "light" {
  if (theme === "system") {
    if (typeof window === "undefined") return "dark";
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return theme;
}

export default function Home() {
  const [leagues, setLeagues] = useState<LeagueData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [selectedDate, setSelectedDate] = useState(() => getDateString(-1));
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [showRatingsExplainer, setShowRatingsExplainer] = useState(false);
  const [prefs, setPrefs] = useState<Preferences>({
    favoriteLeagues: [],
    favoriteTeams: [],
    theme: "system",
    showRatings: false,
  });

  useEffect(() => {
    const loaded = loadPreferences();
    setPrefs(loaded);
    document.documentElement.setAttribute("data-theme", getResolvedTheme(loaded.theme));
  }, []);

  // Listen for system theme changes when in "system" mode
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
    fetchData(selectedDate);
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
      // First time enabling: show explainer
      setShowRatingsExplainer(true);
    } else {
      updatePrefs({ showRatings: false });
    }
  };

  const confirmRatings = () => {
    setShowRatingsExplainer(false);
    updatePrefs({ showRatings: true });
  };

  const toggleFavoriteLeague = (sport: Sport) => {
    const current = prefs.favoriteLeagues;
    if (current.includes(sport)) {
      updatePrefs({ favoriteLeagues: current.filter((s) => s !== sport) });
    } else {
      updatePrefs({ favoriteLeagues: [...current, sport] });
    }
  };

  const toggleFavoriteTeam = (teamId: string) => {
    const current = prefs.favoriteTeams;
    if (current.includes(teamId)) {
      updatePrefs({ favoriteTeams: current.filter((id) => id !== teamId) });
    } else {
      updatePrefs({ favoriteTeams: [...current, teamId] });
    }
  };

  // Sort leagues: favorites first, ordered by priority
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
      {/* Header */}
      <header className="px-4 py-4" style={{ borderBottom: "1px solid var(--border)" }}>
        <div className="max-w-6xl mx-auto grid grid-cols-3 items-center">
          <a href="/" className="text-lg font-bold tracking-tight hover:opacity-80 transition-opacity justify-self-start" style={{ color: "var(--text)" }}>
            HideScore
          </a>
          <div className="justify-self-center">
            <DateNav selectedDate={selectedDate} onDateChange={setSelectedDate} />
          </div>
          <div className="justify-self-end flex items-center gap-1.5 sm:gap-2">
            <button
              onClick={handleMonkeyClick}
              className="monkey-toggle w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center rounded-full transition-all text-base sm:text-lg"
              style={{
                background: prefs.showRatings ? "var(--bg-card-hover)" : "var(--bg-card)",
              }}
              title={prefs.showRatings ? "Hide game ratings" : "Show game ratings"}
            >
              {prefs.showRatings ? "🙊" : "🙈"}
            </button>
            <ThemeToggle theme={prefs.theme} onToggle={toggleTheme} />
          </div>
        </div>
      </header>

      {/* Content */}
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
                onNavigateToDate={setSelectedDate}
                onPlayHighlight={setVideoUrl}
                showRatings={prefs.showRatings}
                isPastDate={selectedDate < getDateString(0)}
              />
            ))}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="px-4 py-3 text-center text-xs" style={{ borderTop: "1px solid var(--border)", color: "var(--text-muted)" }}>
        Catch up on games without spoilers. Ratings tell you what&apos;s worth watching.
      </footer>

      {/* Video Modal */}
      {videoUrl && <VideoModal url={videoUrl} onClose={() => setVideoUrl(null)} />}

      {/* Ratings Explainer Modal — warning style */}
      {showRatingsExplainer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setShowRatingsExplainer(false)}>
          <div className="absolute inset-0 bg-black/50" />
          <div
            className="relative rounded-xl p-5 max-w-sm w-full shadow-xl"
            style={{ background: "var(--bg)", border: "2px solid var(--accent)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-center text-3xl mb-2">⚠️</div>
            <h3 className="font-bold text-base mb-2 text-center" style={{ color: "var(--text)" }}>Show Game Ratings?</h3>
            <p className="text-sm mb-3" style={{ color: "var(--text-secondary)" }}>
              This will reveal how competitive each game was. Ratings are based on how close the game was — not who won — but they can hint at the outcome.
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
                className="flex-1 py-2 rounded-lg text-sm font-medium transition-colors"
                style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text)" }}
              >
                Cancel
              </button>
              <button
                onClick={confirmRatings}
                className="flex-1 py-2 rounded-lg text-sm font-medium transition-colors"
                style={{ background: "var(--accent)", color: "white" }}
              >
                Show Ratings
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- COMMENTED OUT: Previous "Game Ratings" explainer (simpler version) ---
      {showRatingsExplainer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setShowRatingsExplainer(false)}>
          <div className="absolute inset-0 bg-black/50" />
          <div
            className="relative rounded-xl p-5 max-w-sm w-full shadow-xl"
            style={{ background: "var(--bg)", border: "1px solid var(--border)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-center text-3xl mb-3">🙈</div>
            <h3 className="font-bold text-base mb-3 text-center" style={{ color: "var(--text)" }}>Game Ratings</h3>
            <p className="text-sm mb-4" style={{ color: "var(--text-secondary)" }}>
              This shows how competitive each game was — without spoiling the outcome. Use it to find the best games worth watching.
            </p>
            <button onClick={confirmRatings} className="w-full py-2 rounded-lg text-sm font-medium" style={{ background: "var(--accent)", color: "white" }}>
              Show Ratings
            </button>
          </div>
        </div>
      )}
      --- */}
    </div>
  );
}
