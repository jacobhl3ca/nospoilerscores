"use client";

import { useState, useEffect, useCallback } from "react";
import { LeagueData, Sport } from "@/lib/types";
import { Preferences, Theme, loadPreferences, savePreferences } from "@/lib/preferences";
import { fetchAllLeagues } from "@/lib/espn";
import LeagueColumn from "@/components/LeagueColumn";
import DateNav, { getDateString } from "@/components/DateNav";
import ThemeToggle from "@/components/ThemeToggle";

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
  const [selectedDate, setSelectedDate] = useState(() => getDateString(-1));
  const [prefs, setPrefs] = useState<Preferences>({
    favoriteLeagues: [],
    favoriteTeams: [],
    theme: "system",
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
    try {
      const data = await fetchAllLeagues(date);
      setLeagues(data);
    } catch {
      setLeagues([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData(selectedDate);
    const interval = setInterval(() => fetchData(selectedDate), 60000);
    return () => clearInterval(interval);
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
    <div className="min-h-screen" style={{ background: "var(--bg)", color: "var(--text)" }}>
      {/* Header */}
      <header className="px-4 py-4" style={{ borderBottom: "1px solid var(--border)" }}>
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
          <h1 className="text-xl font-bold tracking-tight">
            No Spoiler Scores
          </h1>
          <div className="flex items-center gap-3">
            <DateNav selectedDate={selectedDate} onDateChange={setSelectedDate} />
            <ThemeToggle theme={prefs.theme} onToggle={toggleTheme} />
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-6xl mx-auto px-4 py-6">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div style={{ color: "var(--text-muted)" }}>Loading games...</div>
          </div>
        ) : (
          <div className="flex flex-col lg:flex-row gap-6">
            {sortedLeagues.map((league) => (
              <LeagueColumn
                key={league.sport}
                league={league}
                isFavoriteLeague={prefs.favoriteLeagues.includes(league.sport)}
                onToggleFavoriteLeague={toggleFavoriteLeague}
                favoriteTeams={prefs.favoriteTeams}
                onToggleFavoriteTeam={toggleFavoriteTeam}
                onNavigateToDate={setSelectedDate}
              />
            ))}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="mt-auto px-4 py-3 text-center text-xs" style={{ borderTop: "1px solid var(--border)", color: "var(--text-muted)" }}>
        Catch up on games without spoilers. Star your teams to track them.
      </footer>
    </div>
  );
}
