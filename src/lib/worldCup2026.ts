import { fromYmd, getEtServiceDate, toYmd } from "@/lib/etDay";
import { WORLD_CUP_2026_LAST_MATCH } from "@/lib/worldcup2026-last-match";

// The 2026 World Cup's first and last match days (ET). The fifa league window
// in espn.ts opens a week earlier for the build-up; these are the match days.
export const WORLD_CUP_2026_OPENER = "20260611";
export const WORLD_CUP_2026_FINAL = "20260719";

// True from the day after the final. Keyed off TODAY (the same ET service day
// getDateString(0) uses), never the viewed board date, so the hub copy flips
// once and stays flipped however far back the reader steps.
export function worldCup2026Ended(): boolean {
  return toYmd(getEtServiceDate()) > WORLD_CUP_2026_FINAL;
}

// `?d=YYYYMMDD` on the /worldcup routes: only a real match day of the 2026
// tournament is honoured, anything else is ignored.
export function parseWorldCupDateParam(raw: string | null | undefined): string | null {
  if (!raw || !/^\d{8}$/.test(raw)) return null;
  if (raw < WORLD_CUP_2026_OPENER || raw > WORLD_CUP_2026_FINAL) return null;
  // Rejects 20260631 and the like, which the range check alone lets through.
  if (toYmd(fromYmd(raw)) !== raw) return null;
  return raw;
}

// Date of a team's last 2026 match, keyed by /worldcup/teams/<slug>.
export function worldCupLastMatchYmd(slug: string): string | null {
  return WORLD_CUP_2026_LAST_MATCH[slug]?.ymd ?? null;
}

// "July 19" — month and day only; the year is implied by every page it sits on.
export function formatWorldCupDay(ymd: string): string {
  return fromYmd(ymd).toLocaleDateString("en-US", { month: "long", day: "numeric" });
}
