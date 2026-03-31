import { NextRequest } from "next/server";
import { fetchGames } from "@/lib/espn";
import { Sport, LeagueData } from "@/lib/types";

export const runtime = "edge";

const LEAGUES: { sport: Sport; label: string }[] = [
  { sport: "mlb", label: "MLB" },
  { sport: "nba", label: "NBA" },
  { sport: "ncaam", label: "NCAAM" },
];

export async function GET(request: NextRequest) {
  const date = request.nextUrl.searchParams.get("date") ?? undefined;

  const results: LeagueData[] = await Promise.all(
    LEAGUES.map(async ({ sport, label }) => {
      const games = await fetchGames(sport, date);
      return { sport, label, games };
    })
  );

  return Response.json(results, {
    headers: {
      "Cache-Control": "public, s-maxage=60, stale-while-revalidate=30",
    },
  });
}
