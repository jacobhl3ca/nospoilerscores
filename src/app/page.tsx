"use client";

import { useState, useEffect, useCallback } from "react";
import { LeagueData, Sport } from "@/lib/types";
import { Preferences, loadPreferences, savePreferences } from "@/lib/preferences";
import LeagueColumn from "@/components/LeagueColumn";
import DateNav, { getDateString } from "@/components/DateNav";
import SpoilerToggle from "@/components/SpoilerToggle";

export default function Home() {
  const [leagues, setLeagues] = useState<LeagueData[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(() => getDateString(-1));
  const [spoilerFree, setSpoilerFree] = useState(true);
  const [prefs, setPrefs] = useState<Preferences>({
    favoriteLeagues: [],
    favoriteTeams: [],
  });

  useEffect(() => {
    setPrefs(loadPreferences());
  }, []);

  const fetchData = useCallback(async (date: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/scores?date=${date}`);
      const data = await res.json();
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

  const toggleFavoriteLeague = (sport: Sport) => {
    const current = prefs.favoriteLeagues;
    if (current.includes(sport)) {
      // Remove it
      updatePrefs({ favoriteLeagues: current.filter((s) => s !== sport) });
    } else {
      // Add to end — first added = highest priority (stays at index 0)
      updatePrefs({ favoriteLeagues: [...current, sport] });
    }
  };

  const toggleFavoriteTeam = (teamId: string) => {
    const current = prefs.favoriteTeams;
    if (current.includes(teamId)) {
      updatePrefs({ favoriteTeams: current.filter((id) => id !== teamId) });
    } else {
      // Add to end — first added = highest priority (stays at index 0)
      updatePrefs({ favoriteTeams: [...current, teamId] });
    }
  };

  // Sort leagues: favorites first, ordered by priority (first favorited = leftmost)
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
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      {/* Header */}
      <header className="border-b border-white/10 px-4 py-4">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
          <h1 className="text-xl font-bold tracking-tight">
            No Spoiler Scores
          </h1>
          <div className="flex items-center gap-4">
            <DateNav selectedDate={selectedDate} onDateChange={setSelectedDate} />
            <SpoilerToggle
              spoilerFree={spoilerFree}
              onToggle={() => setSpoilerFree(!spoilerFree)}
            />
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-6xl mx-auto px-4 py-6">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="text-gray-500">Loading games...</div>
          </div>
        ) : (
          <div className="flex flex-col lg:flex-row gap-6">
            {sortedLeagues.map((league) => (
              <LeagueColumn
                key={league.sport}
                league={league}
                spoilerFree={spoilerFree}
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
      <footer className="mt-auto border-t border-white/10 px-4 py-3 text-center text-xs text-gray-600">
        Scores from ESPN. Spoiler-free by default.
      </footer>
    </div>
  );
}
