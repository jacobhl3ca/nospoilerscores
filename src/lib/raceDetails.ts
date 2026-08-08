export type RacingSport = "f1" | "nascar" | "indycar";

export const RACE_DETAILS_URLS: Record<RacingSport, string> = {
  f1: "https://www.espn.com/f1/schedule",
  nascar: "https://www.espn.com/racing/schedule/_/series/nascar-cup",
  indycar: "https://www.espn.com/racing/schedule/_/series/indycar",
};

function isEspnUrl(candidate: string): boolean {
  try {
    const hostname = new URL(candidate).hostname.toLowerCase();
    return hostname === "espn.com" || hostname.endsWith(".espn.com")
      || hostname === "espn.in" || hostname.endsWith(".espn.in");
  } catch {
    return false;
  }
}

export function raceDetailsUrl(sport: RacingSport, candidate?: string): string {
  return candidate && isEspnUrl(candidate) ? candidate : RACE_DETAILS_URLS[sport];
}
