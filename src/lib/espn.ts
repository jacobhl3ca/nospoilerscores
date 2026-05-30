import { Game, Sport, LeagueData, Team, GolfTournament, GolfPlayer } from "./types";
import { getApiBase } from "./youtube";

const BASE_URL = "https://site.api.espn.com/apis/site/v2/sports";

const SPORT_PATHS: Record<Sport, string> = {
  mlb: "/baseball/mlb/scoreboard",
  nba: "/basketball/nba/scoreboard",
  wnba: "/basketball/wnba/scoreboard",
  ncaam: "/basketball/mens-college-basketball/scoreboard",
  ncaaw: "/basketball/womens-college-basketball/scoreboard",
  ncaaf: "/football/college-football/scoreboard",
  nfl: "/football/nfl/scoreboard",
  nhl: "/hockey/nhl/scoreboard",
  golf: "/golf/pga/scoreboard",
  tennis: "/tennis/atp/scoreboard",
  fifa: "/soccer/fifa.world/scoreboard",
  epl: "/soccer/eng.1/scoreboard",
  mls: "/soccer/usa.1/scoreboard",
  ucl: "/soccer/uefa.champions/scoreboard",
  uel: "/soccer/uefa.europa/scoreboard",
};

// Seasonal league config: show/hide based on date
// endDate: day after championship — league hides the day after its final game
// startDate: when the sport's season starts
export interface LeagueConfig {
  sport: Sport;
  label: string;
  startDate?: string;        // MM-DD
  endDate?: string;          // MM-DD (last day league is shown)
  championshipDate?: string; // MM-DD — day the championship game is played
  firstPref?: boolean;       // Tier 1: always gets a slot when active (bumps lower leagues)
  mustInclude?: boolean;     // NBA/MLB/NHL/NFL — always picked when active
  excludeFromAuto?: boolean; // Skipped from auto-pick; still selectable via slot-3 dropdown
  backfillOnly?: boolean;    // NFL Preseason — only added when fewer than 3 active picks
  displaySlot?: "left" | "center" | "right"; // pinned slot preference
  slotPrecedence?: number;   // tiebreak within a pinned slot — lower wins
  // World Cup is every 4 years. yearCycle.anchor matches the championship year.
  yearCycle?: { mod: number; anchor: number };
  marchMadnessLabel?: boolean; // NCAAM swaps to "March Madness" during the tourney window
}

export const ALL_LEAGUES: LeagueConfig[] = [
  // ── Major team sports ──
  { sport: "ncaam", label: "NCAAM", startDate: "11-01", endDate: "04-06", championshipDate: "04-06", marchMadnessLabel: true },
  { sport: "nba",   label: "NBA",   startDate: "10-20", endDate: "06-19", championshipDate: "06-19", mustInclude: true, displaySlot: "left",   slotPrecedence: 1 },
  { sport: "mlb",   label: "MLB",   startDate: "03-20", endDate: "11-01", championshipDate: "11-01", mustInclude: true, displaySlot: "left",   slotPrecedence: 2 },
  { sport: "nhl",   label: "NHL",   startDate: "04-07", endDate: "06-19", championshipDate: "06-19", mustInclude: true, displaySlot: "right",  slotPrecedence: 2 },
  { sport: "nfl",   label: "NFL",   startDate: "09-04", endDate: "02-09", championshipDate: "02-09", mustInclude: true, displaySlot: "center", slotPrecedence: 1 },
  // NFL Preseason backfills the Jul 21 – Aug 15 thin window where only MLB + MLS are active.
  // Window ends Sep 3 (regular NFL takes over Sep 4) — but EPL kickoff Aug 16 already fills
  // the third slot, so backfillOnly ensures preseason only shows when slot 3 would be empty.
  { sport: "nfl",   label: "NFL Preseason", startDate: "07-21", endDate: "09-03", backfillOnly: true, displaySlot: "center", slotPrecedence: 7 },
  // ── Golf majors ──
  // Masters takes the right slot when active (Jacob's pref) — bumps NHL during Apr 9-13.
  { sport: "golf",  label: "Masters",  startDate: "04-09", endDate: "04-13", championshipDate: "04-13", firstPref: true, displaySlot: "right",  slotPrecedence: 1 },
  // PGA Champ + French Open never auto-pick (still selectable via slot-3 swap dropdown).
  { sport: "golf",  label: "PGA Champ", startDate: "05-14", endDate: "05-18", championshipDate: "05-18", excludeFromAuto: true },
  { sport: "golf",  label: "US Open",   startDate: "06-18", endDate: "06-22", championshipDate: "06-22", firstPref: true, displaySlot: "center", slotPrecedence: 5 },
  { sport: "golf",  label: "The Open",  startDate: "07-16", endDate: "07-20", championshipDate: "07-20", displaySlot: "center", slotPrecedence: 6 },
  // ── Tennis Grand Slams ──
  { sport: "tennis", label: "Aus Open",     startDate: "01-12", endDate: "01-26", championshipDate: "01-26" },
  { sport: "tennis", label: "French Open",  startDate: "05-24", endDate: "06-08", championshipDate: "06-08", excludeFromAuto: true },
  { sport: "tennis", label: "Wimbledon",    startDate: "06-29", endDate: "07-13", championshipDate: "07-13", firstPref: true, displaySlot: "center", slotPrecedence: 4 },
  { sport: "tennis", label: "US Open",      startDate: "08-25", endDate: "09-14", championshipDate: "09-14", firstPref: true, displaySlot: "center", slotPrecedence: 3 },
  // ── FIFA World Cup (every 4 years; 2026 was the most recent anchor) ──
  { sport: "fifa", label: "World Cup", startDate: "06-11", endDate: "07-19", championshipDate: "07-19", firstPref: true, displaySlot: "center", slotPrecedence: 2, yearCycle: { mod: 4, anchor: 2026 } },
  // ── Premier League (Aug–May) ──
  { sport: "epl", label: "Prem", startDate: "08-16", endDate: "05-25", championshipDate: "05-25" },
  // ── UEFA Champions League (Sep League phase → Jun Final) ──
  // Active across Sep 14 → Jun 5 but only ~17 matchdays in window; on
  // non-matchday days the column shows news only.
  { sport: "ucl", label: "UCL", startDate: "09-14", endDate: "06-05", championshipDate: "06-05" },
  // ── UEFA Europa League (Sep group → late May Final) ──
  { sport: "uel", label: "UEL", startDate: "09-24", endDate: "05-22", championshipDate: "05-22" },
  // ── MLS (Feb–Dec, MLS Cup early Dec) ──
  { sport: "mls", label: "MLS", startDate: "02-21", endDate: "12-07", championshipDate: "12-07" },
  // ── NCAAF (College Football, Aug–early Jan, CFB Championship ~Jan 11) ──
  // Starts 08-22 to catch Week 0 (late-August opener weekend).
  { sport: "ncaaf", label: "NCAAF", startDate: "08-22", endDate: "01-12", championshipDate: "01-12" },
  // ── NCAAW (Women's College Basketball, Nov–early Apr) ──
  // Swap-only (excludeFromAuto) so it never disturbs the NBA/MLB/NHL/NFL slot
  // rotation — selectable from the slot-3 dropdown when in season. Mirrors WNBA.
  { sport: "ncaaw", label: "NCAAW", startDate: "11-01", endDate: "04-06", championshipDate: "04-06", excludeFromAuto: true },
  // WNBA: regular season May 16 – mid-Sept, playoffs into mid-Oct. Swap-only
  // (excludeFromAuto) so it never disturbs the NBA/MLB/NHL/NFL slot rotation —
  // selectable from the slot-3 dropdown when in season. Listed last so it
  // sorts to the bottom of the league-header swap dropdown.
  { sport: "wnba",  label: "WNBA",  startDate: "05-16", endDate: "10-19", championshipDate: "10-19", excludeFromAuto: true },
];

// ═══════════════════════════════════════════════════════════════
// FULL YEAR SCHEDULE — Max 3 leagues, slots = [left, center, right]
//
// Slot pinning:
//   left  : NBA (precedence 1) > MLB (2)
//   center: NFL (1) > World Cup (2) > US Open Tennis (3) > Wimbledon (4)
//           > US Open Golf (5) > The Open (6) > NFL Preseason (7)
//           NCAAM dynamically pins to center during March Madness (Mar 17 – Apr 6).
//   right : Masters (1) > NHL (2)
//
// Picks: mustInclude (NBA/MLB/NHL/NFL) + firstPref always picked when active;
// regular leagues fill remaining slots by LEAGUE_PRIORITY; backfillOnly
// (NFL Preseason) only joins when fewer than 3 picks otherwise. excludeFromAuto
// (PGA Champ, French Open) never auto-picked but remain in the slot-3 swap menu.
// ═══════════════════════════════════════════════════════════════
// Jan 1 – Jan 11:   NBA/NFL/NCAAM/MLS/EPL          → [NBA, NFL, NCAAM]
// Jan 12 – Jan 26:  + Aus Open                     → [NBA, NFL, Aus Open]
// Jan 27 – Feb 9:   Aus Open ends                  → [NBA, NFL, NCAAM]
// Feb 10 – Mar 16:  NFL ends                       → [NBA, NCAAM, EPL]
// Mar 17 – Mar 19:  NCAAM → March Madness          → [NBA, March Madness, EPL]
// Mar 20 – Apr 6:   + MLB                           → [NBA, March Madness, MLB]
// Apr 7 – Apr 8:    NCAAM done; + NHL              → [NBA, MLB, NHL]
// Apr 9 – Apr 13:   + Masters (right pin)          → [NBA, MLB, Masters]    ← NHL bumped
// Apr 14 – May 13:                                  → [NBA, MLB, NHL]
// May 14 – May 18:  PGA Champ excluded             → [NBA, MLB, NHL]
// May 19 – May 23:                                  → [NBA, MLB, NHL]
// May 24 – Jun 8:   French Open excluded            → [NBA, MLB, NHL]
// Jun 9 – Jun 10:                                   → [NBA, MLB, NHL]
// Jun 11 – Jun 19:  + World Cup (yearCycle)         → [NBA, World Cup, NHL]  ← MLB bumped (NHL pin wins)
// Jun 20 – Jun 22:  NBA + NHL end; + US Open Golf  → [MLB, World Cup, US Open Golf]
// Jun 23 – Jun 28:  US Open Golf ends              → [MLB, World Cup, MLS]
// Jun 29 – Jul 13:  + Wimbledon                    → [MLB, World Cup, Wimbledon]
// Jul 14 – Jul 15:  Wimbledon ends                 → [MLB, World Cup, MLS]
// Jul 16 – Jul 19:  + The Open                     → [MLB, World Cup, The Open]
// Jul 20:           World Cup ends                 → [MLB, The Open, MLS]
// Jul 21 – Aug 15:  NFL Preseason backfill         → [MLB, NFL Preseason, MLS]
// Aug 16 – Aug 24:  + EPL (Preseason bumped)       → [MLB, EPL, MLS]
// Aug 25 – Sep 3:   + US Open Tennis               → [MLB, US Open Tennis, EPL]
// Sep 4 – Sep 14:   + NFL                           → [MLB, NFL, US Open Tennis]
// Sep 15 – Oct 19:  US Open Tennis ends            → [MLB, NFL, EPL]
// Oct 20 – Nov 1:   + NBA                           → [NBA, NFL, MLB]
// Nov 2 – Dec 31:   MLB ends; + NCAAM              → [NBA, NFL, NCAAM]
// ═══════════════════════════════════════════════════════════════
// Added 2026-05-27 — not unrolled into the day-by-day grid above:
//   • NCAAF (Aug 29 – Jan 12, priority 4) joins between NFL and tennis;
//     overlaps NFL Sundays and NCAAM/NBA in fall.
//   • UCL (Sep 14 – Jun 5, priority 10) and UEL (Sep 24 – May 22, priority 11)
//     compete for the soccer slot — UCL > UEL > MLS, EPL still beats both.
//     Matchdays are sparse (~17 active days/season) — column shows news only
//     on non-matchday days within the window.
//   • NCAAW (Nov 1 – Apr 6, excludeFromAuto) — swap-only via dropdown,
//     mirrors WNBA.
// ═══════════════════════════════════════════════════════════════

function toMMDD(d: Date): string {
  return `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function isLeagueActive(league: LeagueConfig, viewDate: Date): boolean {
  // World Cup runs every 4 years — gate on viewDate's year before the date window check.
  // For wrap-around windows (Aug → May), the championship anchor is the year the
  // window ends, so use the year that matches the championshipDate side of the window.
  if (league.yearCycle) {
    const { mod, anchor } = league.yearCycle;
    if ((viewDate.getFullYear() - anchor) % mod !== 0) return false;
  }
  if (!league.startDate || !league.endDate) return true;
  const mmdd = toMMDD(viewDate);

  if (league.startDate <= league.endDate) {
    return mmdd >= league.startDate && mmdd <= league.endDate;
  } else {
    return mmdd >= league.startDate || mmdd <= league.endDate;
  }
}

const MAX_LEAGUES = 3;

// March Madness date range — NCAAM dynamically becomes a firstPref / center pin.
const MARCH_MADNESS_START = "03-17";
const MARCH_MADNESS_END = "04-06";

// Tiebreak when a regular (non-pinned, non-firstPref) league fills a leftover slot.
// Lower number = picked first. Used only after pin assignment has consumed mustIncludes
// and firstPrefs; everyone else competes by this priority.
const LEAGUE_PRIORITY: Record<string, number> = {
  nba: 1,
  mlb: 2,
  nfl: 3,
  ncaaf: 4,
  tennis: 5,
  golf: 6,
  ncaam: 7,
  nhl: 8,
  epl: 9,
  // UCL sits between EPL (9) and MLS (12) so on UCL matchdays it auto-picks
  // for the soccer slot over MLS, while still yielding to EPL when both have
  // games. UEL one notch below — Europa nights pair with UCL but UCL wins.
  ucl: 10,
  uel: 11,
  mls: 12,
  fifa: 13,
  ncaaw: 14,
  wnba: 15,
};

function isMarchMadness(viewDate: Date): boolean {
  const mmdd = toMMDD(viewDate);
  return mmdd >= MARCH_MADNESS_START && mmdd <= MARCH_MADNESS_END;
}

// During March Madness, NCAAM acts as a firstPref center pin.
function effectiveFirstPref(league: LeagueConfig, viewDate: Date): boolean {
  if (league.firstPref) return true;
  if (league.sport === "ncaam" && league.marchMadnessLabel && isMarchMadness(viewDate)) return true;
  return false;
}
function effectiveDisplaySlot(league: LeagueConfig, viewDate: Date): "left" | "center" | "right" | undefined {
  if (league.sport === "ncaam" && league.marchMadnessLabel && isMarchMadness(viewDate)) return "center";
  return league.displaySlot;
}
function effectiveSlotPrecedence(league: LeagueConfig, viewDate: Date): number {
  if (league.sport === "ncaam" && league.marchMadnessLabel && isMarchMadness(viewDate)) return 0; // beats NFL for center during MM
  return league.slotPrecedence ?? 99;
}

// Public for callers that just want the active set (e.g. swap dropdowns).
// Returns leagues ordered by their final slot positions (left → center → right).
export function getActiveLeagueCandidates(viewDate?: Date): {
  firstPref: LeagueConfig[];
  rest: LeagueConfig[];
} {
  const d = viewDate ?? new Date();
  const active = ALL_LEAGUES.filter((l) => isLeagueActive(l, d) && !l.excludeFromAuto && !l.backfillOnly);
  const firstPref = active.filter((l) => effectiveFirstPref(l, d));
  const rest = active
    .filter((l) => !effectiveFirstPref(l, d))
    .sort((a, b) => (LEAGUE_PRIORITY[a.sport] ?? 99) - (LEAGUE_PRIORITY[b.sport] ?? 99));
  return { firstPref, rest };
}

// Pick the 3 active leagues + assign slot positions according to the documented rules.
// Returns leagues in slot order [left, center, right] (length 1-3).
export function pickAndAssignLeagues(viewDate: Date): LeagueConfig[] {
  const eligible = ALL_LEAGUES.filter((l) => isLeagueActive(l, viewDate) && !l.excludeFromAuto);

  const mustInclude = eligible.filter((l) => l.mustInclude && !l.backfillOnly);
  const firstPref   = eligible.filter((l) => effectiveFirstPref(l, viewDate) && !l.mustInclude && !l.backfillOnly);
  const regular     = eligible.filter((l) => !l.mustInclude && !effectiveFirstPref(l, viewDate) && !l.backfillOnly);
  const backfill    = eligible.filter((l) => l.backfillOnly);

  // Build the candidate pool: hard-required leagues first, then top regulars to reach 3.
  const candidates: LeagueConfig[] = [...mustInclude, ...firstPref];
  const sortedRegular = regular.sort(
    (a, b) => (LEAGUE_PRIORITY[a.sport] ?? 99) - (LEAGUE_PRIORITY[b.sport] ?? 99)
  );
  for (const l of sortedRegular) {
    if (candidates.length >= MAX_LEAGUES) break;
    candidates.push(l);
  }
  // Backfill (NFL Preseason) only joins if we still have an empty slot.
  if (candidates.length < MAX_LEAGUES) {
    for (const l of backfill) {
      if (candidates.length >= MAX_LEAGUES) break;
      candidates.push(l);
    }
  }

  // Assign pinned slots first; losers fall back into a generic pool to fill empty slots.
  const slots: (LeagueConfig | null)[] = [null, null, null];
  const slotIndex: Record<"left" | "center" | "right", 0 | 1 | 2> = { left: 0, center: 1, right: 2 };

  for (const slotName of ["left", "center", "right"] as const) {
    const contenders = candidates.filter((c) => effectiveDisplaySlot(c, viewDate) === slotName);
    if (contenders.length === 0) continue;
    contenders.sort((a, b) => effectiveSlotPrecedence(a, viewDate) - effectiveSlotPrecedence(b, viewDate));
    slots[slotIndex[slotName]] = contenders[0];
  }

  const placed = new Set(slots.filter(Boolean) as LeagueConfig[]);
  const fallbackPool = candidates
    .filter((c) => !placed.has(c))
    .sort((a, b) => (LEAGUE_PRIORITY[a.sport] ?? 99) - (LEAGUE_PRIORITY[b.sport] ?? 99));

  for (let i = 0; i < slots.length; i++) {
    if (slots[i] !== null) continue;
    const next = fallbackPool.shift();
    if (next) slots[i] = next;
  }

  return slots.filter((l): l is LeagueConfig => l !== null);
}

// Resolves the display label for a league at a given date — NCAAM swaps to
// "March Madness" during the tournament window; everything else passes through.
export function effectiveLeagueLabel(league: LeagueConfig, viewDate: Date): string {
  if (league.sport === "ncaam" && league.marchMadnessLabel && isMarchMadness(viewDate)) {
    return "March Madness";
  }
  return league.label;
}

// ESPN's `shortDisplayName` is usually compact ("Yankees", "Celtics"), but a
// few outliers ("Diamondbacks" at 12 chars, "Timberwolves" at 12) blow out the
// 3-column layout and force the whole league column to fall back to 3-letter
// abbreviations even though every other team would have fit. Override those
// specific names with the broadcast-standard compact form so column-fit
// measurement only sees reasonable widths. Untouched team data still uses
// `shortDisplayName` for YouTube searches and Prime ASIN lookups.
const DISPLAY_SHORT_NAME_OVERRIDES: Record<string, string> = {
  Diamondbacks: "D-backs",
  Timberwolves: "T-Wolves",
  "Golden Knights": "Knights",
  "Maple Leafs": "Leafs",
  "Blue Jackets": "Jackets",
};
export function displayShortName(team: Team): string {
  return DISPLAY_SHORT_NAME_OVERRIDES[team.shortDisplayName] ?? team.shortDisplayName;
}

function parseTeam(competitor: any, sport: Sport): Team {
  const rawId = competitor.team?.id ?? "";
  let record = competitor.records?.[0]?.summary ?? "";
  // MLB spring training and NHL records include a 3rd segment (ties / OTL) — strip to W-L
  if ((sport === "mlb" || sport === "nhl") && record.split("-").length === 3) {
    const parts = record.split("-");
    record = `${parts[0]}-${parts[1]}`;
  }
  return {
    id: rawId ? `${sport}-${rawId}` : "",
    abbreviation: competitor.team?.abbreviation ?? "",
    displayName: competitor.team?.displayName ?? "",
    shortDisplayName: competitor.team?.shortDisplayName ?? "",
    logo: competitor.team?.logo ?? "",
    color: competitor.team?.color ?? "666666",
    score: competitor.score ?? "0",
    winner: competitor.winner ?? false,
    record,
  };
}

// Per-sport rating calibration
const SPORT_RATING_CONFIG: Record<Sport, {
  multiplier: number;       // how fast closeness drops per point of final differential
  overtimeBonus: number;    // extra points for OT/extras
  scoringDivisor: number;   // normalizes scoring bonus per sport
  regulationPeriods: number; // normal period count (innings for MLB)
}> = {
  mlb:    { multiplier: 14,  overtimeBonus: 15, scoringDivisor: 3,   regulationPeriods: 9 },
  nba:    { multiplier: 4.5, overtimeBonus: 15, scoringDivisor: 40,  regulationPeriods: 4 },
  // WNBA: same quarter structure as NBA but lower totals (~80 vs ~115); divisor
  // scaled down so scoring bonus normalizes the same way.
  wnba:   { multiplier: 4.5, overtimeBonus: 15, scoringDivisor: 28,  regulationPeriods: 4 },
  ncaam:  { multiplier: 5.5, overtimeBonus: 15, scoringDivisor: 30,  regulationPeriods: 2 },
  // NCAAW: similar quarter/half structure as NCAAM, lower scoring (~70 vs ~75).
  ncaaw:  { multiplier: 5.5, overtimeBonus: 15, scoringDivisor: 25,  regulationPeriods: 2 },
  // NCAAF: scoring similar to NFL, mirrors its calibration.
  ncaaf:  { multiplier: 5,   overtimeBonus: 15, scoringDivisor: 8,   regulationPeriods: 4 },
  nhl:    { multiplier: 18,  overtimeBonus: 20, scoringDivisor: 1.5, regulationPeriods: 3 },
  nfl:    { multiplier: 5,   overtimeBonus: 15, scoringDivisor: 8,   regulationPeriods: 4 },
  fifa:   { multiplier: 22,  overtimeBonus: 25, scoringDivisor: 0.5, regulationPeriods: 2 },
  epl:    { multiplier: 22,  overtimeBonus: 20, scoringDivisor: 0.5, regulationPeriods: 2 },
  mls:    { multiplier: 22,  overtimeBonus: 20, scoringDivisor: 0.5, regulationPeriods: 2 },
  // UCL / UEL: 90-min soccer, mirrors EPL.
  ucl:    { multiplier: 22,  overtimeBonus: 20, scoringDivisor: 0.5, regulationPeriods: 2 },
  uel:    { multiplier: 22,  overtimeBonus: 20, scoringDivisor: 0.5, regulationPeriods: 2 },
  golf:   { multiplier: 1,   overtimeBonus: 10, scoringDivisor: 1,   regulationPeriods: 4 },
  tennis: { multiplier: 25,  overtimeBonus: 15, scoringDivisor: 5,   regulationPeriods: 4 },
};

// Calculate running margin from linescores: average absolute margin across all periods
// Returns null if linescore data is insufficient
function calcRunningMargin(competitors: any[]): number | null {
  const ls0: any[] = competitors[0].linescores ?? [];
  const ls1: any[] = competitors[1].linescores ?? [];
  const periods = Math.min(ls0.length, ls1.length);
  if (periods < 2) return null; // need at least 2 periods for this to be meaningful

  let cum0 = 0;
  let cum1 = 0;
  let totalMargin = 0;
  for (let i = 0; i < periods; i++) {
    cum0 += ls0[i]?.value ?? 0;
    cum1 += ls1[i]?.value ?? 0;
    totalMargin += Math.abs(cum0 - cum1);
  }
  return totalMargin / periods;
}

// Was the game close entering the final period?
function calcFinalPeriodMargin(competitors: any[]): number | null {
  const ls0: any[] = competitors[0].linescores ?? [];
  const ls1: any[] = competitors[1].linescores ?? [];
  const periods = Math.min(ls0.length, ls1.length);
  if (periods < 2) return null;

  // Sum scores through second-to-last period
  let cum0 = 0;
  let cum1 = 0;
  for (let i = 0; i < periods - 1; i++) {
    cum0 += ls0[i]?.value ?? 0;
    cum1 += ls1[i]?.value ?? 0;
  }
  return Math.abs(cum0 - cum1);
}

function calculateRating(game: any): number | null {
  const competition = game.competitions?.[0];
  if (!competition) return null;

  const state = game.status?.type?.state;
  if (state === "pre") return null;

  const competitors = competition.competitors;
  if (!competitors || competitors.length < 2) return null;

  const score1 = parseInt(competitors[0].score ?? "0", 10);
  const score2 = parseInt(competitors[1].score ?? "0", 10);
  const diff = Math.abs(score1 - score2);
  const total = score1 + score2;

  const sport = game._sport as Sport;
  const config = SPORT_RATING_CONFIG[sport] ?? SPORT_RATING_CONFIG.nba;

  // --- Factor 1: Final margin closeness (45%) ---
  const finalCloseness = Math.max(0, 100 - diff * config.multiplier);

  // --- Factor 2: Running margin throughout game (35%) ---
  // Average margin across all periods — rewards games that were close throughout
  // even if the final margin is large
  const runningMargin = calcRunningMargin(competitors);
  let runningCloseness: number;
  if (runningMargin !== null) {
    // Use same multiplier — a running average margin of 5 in NBA means it was tight
    runningCloseness = Math.max(0, 100 - runningMargin * config.multiplier);
  } else {
    // No linescore data (live game early on) — fall back to final margin
    runningCloseness = finalCloseness;
  }

  // --- Factor 3: Close entering final period (20%) ---
  // Games within striking distance at end are more watchable
  const fpMargin = calcFinalPeriodMargin(competitors);
  let finalPeriodCloseness: number;
  if (fpMargin !== null) {
    finalPeriodCloseness = Math.max(0, 100 - fpMargin * config.multiplier);
  } else {
    finalPeriodCloseness = finalCloseness;
  }

  // Base score: weighted blend of three closeness factors
  // Weights sum to 1.0 so a perfectly close game = 100 before bonuses
  const baseScore =
    finalCloseness * 0.45 +
    runningCloseness * 0.35 +
    finalPeriodCloseness * 0.20;

  // Additive bonuses (on top, not weighted in) — these reward extras, never penalize
  const periods = game.status?.period ?? 0;
  const overtimeBonus = periods > config.regulationPeriods ? config.overtimeBonus : 0;
  const scoringBonus = Math.min(total / config.scoringDivisor, 10);

  // Comeback bonus: reward games where a big deficit was erased late
  // The bigger the deficit overcome and the closer the final, the bigger the bonus
  let comebackBonus = 0;
  if (fpMargin !== null && fpMargin > diff) {
    const deficitErased = fpMargin - diff;
    comebackBonus = Math.min(deficitErased * config.multiplier * 0.4, 30);
  }

  // Low-scoring penalty for soccer: a 0-0 draw isn't exciting regardless of "closeness"
  let lowScoringPenalty = 0;
  if ((sport === "epl" || sport === "mls" || sport === "fifa") && total < 2) {
    lowScoringPenalty = (2 - total) * 25; // 0 goals: -50, 1 goal: -25
  }

  return Math.max(0, Math.min(100, Math.round(baseScore + overtimeBonus + scoringBonus + comebackBonus - lowScoringPenalty)));
}

// Tennis returns ONE event per tournament (e.g. "Roland Garros") with 0
// top-level competitors; the real matches live in event.groupings[] (one per
// draw: Men's/Women's Singles, Doubles, etc.), each with athlete-based
// competitors instead of teams. Flatten the singles matches for the viewed
// day into individual Game cards. Doubles are skipped (4 athletes / different
// layout). parseTennisMatch maps an athlete pair into the team-shaped Game the
// cards already render — country flag as the "logo", set count as the score.
function tennisEtYmd(iso: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso)).replace(/-/g, "");
  } catch {
    return "";
  }
}

function parseTennisMatch(match: any, event: any): Game {
  const comps = match.competitors ?? [];
  const home = comps.find((c: any) => c.homeAway === "home") ?? comps[0];
  const away = comps.find((c: any) => c.homeAway === "away") ?? comps[1];
  const mkTeam = (c: any): Team => {
    const a = c?.athlete ?? {};
    const setsWon = (c?.linescores ?? []).filter((l: any) => l.winner).length;
    return {
      // Empty id → GameCard renders the name as plain text (no team-schedule
      // view, which doesn't exist for individual players).
      id: "",
      abbreviation: a.shortName ?? a.displayName ?? "",
      displayName: a.displayName ?? "",
      shortDisplayName: a.displayName ?? "",
      logo: a.flag?.href ?? "",
      color: "666666",
      score: String(setsWon),
      winner: c?.winner ?? false,
      record: "",
    };
  };
  const state = (match.status?.type?.state ?? "pre") as "pre" | "in" | "post";
  const homeTeam = mkTeam(home);
  const awayTeam = mkTeam(away);
  // Tournament + year context for the highlight search. Without it the
  // unscoped fallback query ("A vs B highlights") can land on the same
  // players' match from a DIFFERENT event/year (e.g. a French Open match
  // resolving to "Rome Open 2025"). Threaded through the Game's seriesNote,
  // which is only ever used to build the YouTube query (never rendered).
  const matchYear = (match.date ?? event.date ?? "").slice(0, 4);
  const tourneyTag = [event.name, matchYear].filter(Boolean).join(" ");
  // Closeness rating (drives the Rated-view sort): a deciding final set is the
  // most compelling, straight sets the least. Pre/in matches get a neutral mid.
  const hs = Number(homeTeam.score) || 0;
  const as = Number(awayTeam.score) || 0;
  const diff = Math.abs(hs - as);
  let rating = 55;
  if (state === "post") {
    if (diff <= 1) rating = 90;             // went the distance (2-1 / 3-2)
    else if (hs + as >= 4 && diff === 2) rating = 78; // long match (3-1)
    else rating = 65;                       // straight sets
  }
  const name = `${awayTeam.displayName} vs ${homeTeam.displayName}`;
  return {
    id: match.id ?? `${event.id}-${awayTeam.abbreviation}-${homeTeam.abbreviation}`,
    sport: "tennis",
    date: match.date ?? event.date,
    name,
    shortName: name,
    state,
    statusDetail: match.status?.type?.shortDetail ?? match.status?.type?.detail ?? "",
    clock: match.status?.displayClock ?? "",
    period: match.status?.period ?? 0,
    completed: match.status?.type?.completed ?? false,
    homeTeam,
    awayTeam,
    broadcasts: [],
    venue: "",
    highlightUrl: null,
    // Not a playoff "Game N" — repurposed to carry tournament+year into the
    // highlight search so it can't drift to the wrong event (see above).
    seriesNote: tourneyTag || null,
    seriesStatus: null,
    playoffLabel: null,
    isPlayoff: false,
    recapUrl: null,
    rating,
    streamUrl: null,
    primeStreamUrl: null,
  };
}

function buildTennisGames(events: any[], date?: string): Game[] {
  const todayYmd = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()).replace(/-/g, "");
  const target = date ?? todayYmd;
  const games: Game[] = [];
  for (const event of events) {
    for (const grouping of event.groupings ?? []) {
      const slug = (grouping.grouping?.slug ?? "").toLowerCase();
      // Singles draws only.
      if (!slug.includes("singles") || slug.includes("doubles")) continue;
      for (const match of grouping.competitions ?? []) {
        if ((match.competitors?.length ?? 0) < 2) continue;
        if (tennisEtYmd(match.date) !== target) continue;
        const sn = match.status?.type?.name ?? "";
        if (sn.includes("POSTPONED") || sn.includes("CANCELED") || sn.includes("SUSPENDED")) continue;
        try {
          games.push(parseTennisMatch(match, event));
        } catch {
          // A single malformed match must not blank the whole draw.
        }
      }
    }
  }
  return games;
}

function parseGame(event: any, sport: Sport): Game {
  const competition = event.competitions?.[0];
  const competitors = competition?.competitors ?? [];

  const home = competitors.find((c: any) => c.homeAway === "home");
  const away = competitors.find((c: any) => c.homeAway === "away");

  // Gather broadcasts
  const broadcasts: string[] = [];
  for (const b of competition?.broadcasts ?? []) {
    for (const name of b.names ?? []) {
      if (!broadcasts.includes(name)) broadcasts.push(name);
    }
  }

  // Tag sport for rating calculation
  event._sport = sport;

  // Extract highlight video URL from headlines
  let highlightUrl: string | null = null;
  for (const headline of competition?.headlines ?? []) {
    for (const video of headline?.video ?? []) {
      const webHref = video?.links?.web?.href;
      if (webHref) {
        highlightUrl = webHref;
        break;
      }
    }
    if (highlightUrl) break;
  }

  // Extract series game number and playoff round from notes
  let seriesNote: string | null = null;
  let playoffLabel: string | null = null;
  let isPlayoff = false;
  for (const note of competition?.notes ?? []) {
    const headline = note?.headline ?? "";
    const headlineLower = headline.toLowerCase();
    const match = headlineLower.match(/Game \d+/i);
    if (match) {
      seriesNote = match[0];
    }
    // Detect playoff/postseason/tournament games from notes
    if (/playoff|postseason|wild.?card|divisional|conference|championship|finals?|round|semi.?finals?|quarter.?finals?|elimination|play-in|tournament|march madness|ncaa|sweet.?16|elite.?8|final.?four|stanley.?cup|world.?series|super.?bowl|nlds|nlcs|alds|alcs|alwc|nlwc/i.test(headlineLower)) {
      isPlayoff = true;
      if (!playoffLabel) playoffLabel = headline;
    }
  }
  // Also check season type from the API if available
  if (event.season?.type === 3 || event.season?.type === 4) {
    isPlayoff = true; // type 3 = postseason, type 4 = off-season/all-star but sometimes playoff
  }

  // Playoff series summary (e.g. "BOS leads series 3-1", "Series tied 2-2").
  // Only present on playoff competitions; regular-season series has no field.
  const rawSeriesSummary: string | null =
    competition?.series?.type === "playoff"
      ? (competition.series.summary ?? null)
      : null;
  // Before Game 1 ESPN sets series.summary to a schedule note like
  // "Series starts 5/19" — not an actual series score. Rendered as-is it
  // showed up as a stray "Starts 5/19" in the card's status bar. Drop it;
  // only keep summaries that describe a real series state (leads/tied).
  const seriesStatus: string | null =
    rawSeriesSummary && /\bstarts?\b/i.test(rawSeriesSummary) ? null : rawSeriesSummary;

  // Extract gamecast/recap URL from event links
  let recapUrl: string | null = null;
  for (const link of event.links ?? []) {
    if (link.rel?.includes("summary") || link.rel?.includes("event")) {
      recapUrl = link.href;
      break;
    }
  }

  return {
    id: event.id,
    sport,
    date: event.date,
    name: event.name ?? "",
    shortName: event.shortName ?? "",
    state: event.status?.type?.state ?? "pre",
    statusDetail: event.status?.type?.shortDetail ?? event.status?.type?.detail ?? "",
    clock: event.status?.displayClock ?? "",
    period: event.status?.period ?? 0,
    completed: event.status?.type?.completed ?? false,
    homeTeam: parseTeam(home ?? {}, sport),
    awayTeam: parseTeam(away ?? {}, sport),
    broadcasts,
    venue: competition?.venue?.fullName ?? "",
    rating: calculateRating(event),
    seriesNote,
    isPlayoff,
    playoffLabel,
    seriesStatus,
    highlightUrl,
    recapUrl,
    streamUrl: null, // populated after fetch for supported sports
    primeStreamUrl: null, // populated from /prime-asins.json when matchup matches
    noHitterPitchingTeam: null, // MLB only — populated from MLB Stats API linescore
  };
}

// Lazily load the Prime Video ASIN map scraped by the nightly GH Action.
// Cached module-wide so multiple fetchGames() calls share one request.
let primeAsinsPromise: Promise<Record<string, string>> | null = null;
export function loadPrimeAsins(): Promise<Record<string, string>> {
  if (!primeAsinsPromise) {
    primeAsinsPromise = fetch(`${getApiBase()}/prime-asins.json`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => (d?.matchups ?? {}) as Record<string, string>)
      .catch(() => ({} as Record<string, string>));
  }
  return primeAsinsPromise;
}

// ESPN airing UUIDs + NBA gameIds resolved by scripts/scrape-espn-airings.mjs.
// Keyed by ESPN numeric event id. Same cached-promise pattern as Prime.
type EspnAiringsData = {
  airings: Record<string, { uuid: string; network?: string }>;
  nbaGameIds: Record<string, string>;
};
let espnAiringsPromise: Promise<EspnAiringsData> | null = null;
export function loadEspnAirings(): Promise<EspnAiringsData> {
  if (!espnAiringsPromise) {
    espnAiringsPromise = fetch(`${getApiBase()}/espn-airings.json`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => ({
        airings: d?.airings ?? {},
        nbaGameIds: d?.nbaGameIds ?? {},
      }))
      .catch(() => ({ airings: {}, nbaGameIds: {} }));
  }
  return espnAiringsPromise;
}

// Big Inning schedule scraped daily by scripts/scrape-big-inning.mjs from
// mlb.com/network/modules/shows/mlbn-big-inning. Keyed by ISO date.
// `selectionUrl` is the deep link to tonight's airing on MLB.TV; merged in
// at runtime from the "Featured on MLB.TV" rail (see below).
export type BigInningSchedule = Record<
  string,
  { timeET: string; selectionUrl?: string }
>;
let bigInningPromise: Promise<BigInningSchedule> | null = null;
export function loadBigInningSchedule(): Promise<BigInningSchedule> {
  if (!bigInningPromise) {
    bigInningPromise = (async () => {
      // The static schedule (per-night start times) and the "Featured on MLB.TV"
      // rail (per-night selection slug) are independent — fetch in parallel and
      // merge. Rail failures fall through to the /network/live href.
      const [scheduleRes, railRes] = await Promise.allSettled([
        fetch(`${getApiBase()}/big-inning-schedule.json`, { cache: "no-store" })
          .then((r) => (r.ok ? r.json() : null)),
        fetch(
          "https://dapi.cms.mlbinfra.com/v2/content/en-us/sel-mlbtv-featured-svod-video-list",
          { cache: "no-store" }
        ).then((r) => (r.ok ? r.json() : null)),
      ]);
      const scheduleDoc = scheduleRes.status === "fulfilled" ? scheduleRes.value : null;
      const railDoc = railRes.status === "fulfilled" ? railRes.value : null;
      const schedule = (scheduleDoc?.schedule ?? {}) as BigInningSchedule;
      const items: Array<{ slug?: string }> = railDoc?.items ?? [];
      const match = items.find(
        (it) => typeof it?.slug === "string" && it.slug.toLowerCase().includes("big-inning")
      );
      if (match?.slug) {
        // en-CA locale formats as YYYY-MM-DD, matching the schedule's ISO key.
        const isoToday = new Intl.DateTimeFormat("en-CA", {
          timeZone: "America/New_York",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(new Date());
        const todayEntry = schedule[isoToday];
        if (todayEntry) {
          todayEntry.selectionUrl = `https://www.mlb.com/tv/shows/selection/${match.slug}`;
        }
      }
      return schedule;
    })().catch(() => ({} as BigInningSchedule));
  }
  return bigInningPromise;
}

function buildPrimeDeepLink(
  game: Game,
  asinMap: Record<string, string>
): string | null {
  const key = `${game.awayTeam.shortDisplayName} vs. ${game.homeTeam.shortDisplayName}`.toLowerCase();
  const asin = asinMap[key];
  // primevideo.com/detail/{id} accepts both traditional ASINs (B0XXXXXXXX)
  // and the longer GTI ids that Prime uses for newer live events. amazon.com
  // rejects the GTI format, so we standardize on primevideo.com.
  return asin ? `https://www.primevideo.com/detail/${asin}` : null;
}

function hasPrimeBroadcast(game: Game): boolean {
  return game.broadcasts.some((b) => /\b(amazon|prime)\b/i.test(b));
}

async function fetchWithRetry(url: string, retries = 2, timeoutMs = 10000): Promise<Response> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);
      if (res.ok || attempt === retries) return res;
    } catch (e) {
      clearTimeout(timer);
      if (attempt === retries) throw e;
    }
    // Linear backoff before the next attempt — an immediate retry usually
    // lands inside the same ESPN blip/rate-limit window, so wait it out.
    await new Promise((r) => setTimeout(r, 300 * (attempt + 1)));
  }
  throw new Error("Fetch failed");
}

// ESPN gamecast / match URL for a game. Prefers the API-provided recapUrl,
// falls back to the sport-specific /game/_/gameId/ or /match/_/gameId/ path.
export function espnGameUrl(game: Game): string {
  if (game.recapUrl) return game.recapUrl;
  switch (game.sport) {
    case "mlb": return `https://www.espn.com/mlb/game/_/gameId/${game.id}`;
    case "nba": return `https://www.espn.com/nba/game/_/gameId/${game.id}`;
    case "wnba": return `https://www.espn.com/wnba/game/_/gameId/${game.id}`;
    case "ncaam": return `https://www.espn.com/mens-college-basketball/game/_/gameId/${game.id}`;
    case "ncaaw": return `https://www.espn.com/womens-college-basketball/game/_/gameId/${game.id}`;
    case "ncaaf": return `https://www.espn.com/college-football/game/_/gameId/${game.id}`;
    case "nfl": return `https://www.espn.com/nfl/game/_/gameId/${game.id}`;
    case "nhl": return `https://www.espn.com/nhl/game/_/gameId/${game.id}`;
    case "epl":
    case "mls":
    case "fifa":
    case "ucl":
    case "uel":
      return `https://www.espn.com/soccer/match/_/gameId/${game.id}`;
    case "golf": return `https://www.espn.com/golf/leaderboard`;
    case "tennis": return `https://www.espn.com/tennis/scoreboard`;
  }
}

// Per-sport streamer landing — last-resort destination so the live link
// always lands on a place to *watch*, never on a score-revealing gamecast.
export function sportStreamFallback(sport: Sport): string {
  switch (sport) {
    case "nba": return "https://www.nba.com/watch";
    case "wnba": return "https://www.wnba.com/watch";
    case "ncaam": return "https://www.espn.com/watch/";
    case "ncaaw": return "https://www.espn.com/watch/";
    case "ncaaf": return "https://www.espn.com/watch/";
    case "nfl": return "https://www.nfl.com/plus/";
    case "nhl": return "https://www.espn.com/watch/";
    case "mlb": return "https://www.mlb.com/tv";
    case "mls": return "https://tv.apple.com/us/mls";
    case "epl": return "https://www.peacocktv.com/";
    case "fifa": return "https://www.foxsports.com/live";
    // UCL / UEL: Paramount+ holds US rights through 2030.
    case "ucl": return "https://www.paramountplus.com/sports/uefa-champions-league/";
    case "uel": return "https://www.paramountplus.com/sports/uefa-europa-league/";
    case "tennis": return "https://www.tennischannel.com/";
    case "golf": return "https://www.pgatour.com/live";
  }
}

// Map a single broadcast/network name to its streaming destination.
// Returns null if unknown so caller can try the next broadcast or fall back.
// Sport is optional but lets us route multi-sport streamers (e.g., Amazon
// Prime carries NFL TNF, NBA, MLB Yankees) to the right Prime sport page.
export function networkStreamUrl(broadcast: string, gameId: string, sport?: Sport): string | null {
  const b = broadcast.toLowerCase().trim();
  if (!b) return null;
  // ESPN family deep-links via gameId. ABC is ESPN-owned but its own broadcast
  // network has a dedicated live page, so route it there instead of the ESPN
  // player — the user picked ABC, send them to ABC.
  if (b.includes("espn")) return `https://www.espn.com/watch/player/_/id/${gameId}`;
  if (b === "abc") return "https://abc.com/watch-live";
  // FOX family
  if (b === "fox" || b === "fs1" || b === "fs2" || b === "fox deportes") return "https://www.foxsports.com/live";
  // WBD networks. TNT/TBS/TruTV each have their own TV Everywhere portal —
  // routing them all to HBO Max strips the network branding the user just
  // clicked. Generic "Max"/"HBO Max" broadcasts still go to hbomax.com/sports
  // (play.max.com/live and play.hbomax.com/sports both 302 to marketing).
  if (b === "tnt") return "https://www.tntdrama.com/watchtnt";
  if (b === "tbs") return "https://www.tbs.com/watchtbs";
  if (b === "trutv") return "https://www.trutv.com/watchtrutv";
  if (b.includes("max")) return "https://www.hbomax.com/sports";
  // Plain "NBC" = the broadcast network → nbc.com/live. "NBCS"/"NBC Sports" =
  // the cable channel → NBCSports live page.
  if (b === "nbc") return "https://www.nbc.com/live";
  if (b.includes("nbc")) return "https://www.nbcsports.com/watch";
  // Other NBCU networks each have their own live/TVE page distinct from the
  // Peacock homepage — only fall back to peacocktv.com when the broadcast is
  // literally Peacock.
  if (b.includes("usa")) return "https://www.usanetwork.com/live";
  if (b === "golf channel") return "https://www.golfchannel.com/watch";
  if (b.startsWith("tele")) return "https://www.telemundo.com/deportes";
  if (b === "peacock") return "https://www.peacocktv.com/";
  // CBS-branded broadcasts → CBS Sports (a real CBS-branded live page)
  if (b === "cbs" || b === "cbssn") return "https://www.cbssports.com/watch/live";
  // Paramount+ broadcasts (rare; carries some CBS Sports content) → Paramount+
  if (b === "paramount+" || b === "paramount plus") return "https://www.paramountplus.com/live-tv/";
  // Amazon Prime Video — fall back to the Prime sports hub. Sport-specific
  // paths (/sports/nfl etc.) return 404, so we use the generic hub. Per-game
  // deep links are handled upstream via the scraped ASIN map.
  if (b === "amazon prime" || b === "prime video" || b === "amazon") {
    return "https://www.primevideo.com/sports";
  }
  // Apple TV+ — MLS Season Pass is the only Apple-branded sports landing with
  // a stable public URL. For other sports (notably MLB Friday Night Baseball)
  // every tv.apple.com sport/channel/show path 404s, so send to the Apple TV
  // homepage where the user can navigate or sign in.
  if (b === "apple tv+" || b === "apple tv") {
    if (sport === "mls") return "https://tv.apple.com/us/mls";
    return "https://tv.apple.com/us";
  }
  // YouTube TV / NFL Sunday Ticket
  if (b === "youtube tv" || b === "nfl sunday ticket" || b === "youtube") return "https://tv.youtube.com/";
  // League-specific networks
  if (b === "nfl network" || b === "nfl+") return "https://www.nfl.com/plus/";
  if (b === "nba tv") return "https://www.nba.com/watch";
  if (b === "wnba league pass" || b === "wnba tv") return "https://www.wnba.com/watch";
  // NHL Network has its own page (redirects to nhl.com/nhl-network). The old
  // espn.com/watch fallback was a generic ESPN landing with no NHL context.
  if (b === "nhl network") return "https://www.nhlnetwork.com/";
  if (b === "mlb.tv" || b === "mlb network") return "https://www.mlb.com/tv";
  if (b === "tennis channel") return "https://www.tennischannel.com/";
  // Masters-only streamer — already added during golf broadcast enrichment
  if (b === "masters.com") return "https://www.masters.com/en_US/watch/index.html";
  // MLB RSN routing. When the broadcast names a specific RSN with its own
  // portal, send the user there (matches what they clicked). Generic "*.tv"
  // team feeds and RSNs without a known live page fall through to mlb.com/tv.
  if (sport === "mlb") {
    if (b === "yes") return "https://www.yesnetwork.com/";
    if (b === "sny") return "https://sny.tv/";
    if (b === "nesn") return "https://nesn.com/";
    if (b === "masn") return "https://www.masnsports.com/";
    if (b === "chsn") return "https://chsn.tv/";
    if (b.includes("marquee")) return "https://www.marqueesportsnetwork.com/";
    if (b.includes("fanduel")) return "https://fanduelsportsnetwork.com/";
    if (b.includes("space city")) return "https://www.spacecityhomenetwork.com/";
    // Canadian Sportsnet feeds (Blue Jays — SNE/SNW/SN1/SN360/SNO/SNP, plus
    // any "Sportsnet"-branded variant). The live product sportsnetplus.ca is
    // geo-locked to Canada; sportsnet.ca is the public, US-accessible brand
    // landing.
    if (/^(sne|snw|sn1|sn360|sno|snp)$/.test(b)) return "https://www.sportsnet.ca/";
    if (b.includes("sportsnet")) return "https://www.sportsnet.ca/";
    // Generic team feed ("Brewers.TV" etc.) — no per-team portal worth
    // deep-linking; mlb.com/tv is the safe streaming home.
    if (/\.tv$/i.test(b)) return "https://www.mlb.com/tv";
    // ("NBC Sports Bay Area/Philly/Boston/California") is caught upstream by
    // the b.includes("nbc") rule and routed to nbcsports.com/watch — no MLB
    // override needed here.
  }
  return null;
}

// Build stream link for a game. Prefers a known broadcast → streamer mapping,
// falling back to the per-sport streamer landing so the result is never null.
function buildStreamUrl(game: Game): string {
  for (const broadcast of game.broadcasts) {
    const url = networkStreamUrl(broadcast, game.id, game.sport);
    if (url) return url;
  }
  return sportStreamFallback(game.sport);
}

// MLB Stats API: fetch per-game metadata for a date, keyed by "away@home"
// (abbreviations). Returns the gamePk for the MLB.tv deep link plus the live
// linescore signals needed to compute the No-Hit Alert badge.
interface MlbGameMeta {
  gamePk: string;
  isLive: boolean;       // status.abstractGameState === "Live"
  awayHits?: number;
  homeHits?: number;
  awayRuns?: number;
  homeRuns?: number;
  awayLeftOnBase?: number;
  homeLeftOnBase?: number;
  currentInning?: number; // 1-9+
}
async function fetchMLBGameMeta(date?: string): Promise<Map<string, MlbGameMeta>> {
  const map = new Map<string, MlbGameMeta>();
  try {
    // Convert YYYYMMDD to YYYY-MM-DD
    let apiDate: string;
    if (date && date.length === 8) {
      apiDate = `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`;
    } else {
      const now = new Date();
      apiDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    }
    const res = await fetchWithRetry(`https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${apiDate}&hydrate=team,linescore`, 1, 5000);
    if (!res.ok) return map;
    const data = await res.json();
    for (const dateEntry of data.dates ?? []) {
      for (const game of dateEntry.games ?? []) {
        const gamePk = String(game.gamePk);
        const homeAbbrev = game.teams?.home?.team?.abbreviation ?? "";
        const awayAbbrev = game.teams?.away?.team?.abbreviation ?? "";
        if (!homeAbbrev || !awayAbbrev) continue;
        const ls = game.linescore ?? {};
        const meta: MlbGameMeta = {
          gamePk,
          isLive: game.status?.abstractGameState === "Live",
          awayHits: ls.teams?.away?.hits,
          homeHits: ls.teams?.home?.hits,
          awayRuns: ls.teams?.away?.runs,
          homeRuns: ls.teams?.home?.runs,
          awayLeftOnBase: ls.teams?.away?.leftOnBase,
          homeLeftOnBase: ls.teams?.home?.leftOnBase,
          currentInning: ls.currentInning,
        };
        // Key by "away@home" to handle doubleheaders
        map.set(`${awayAbbrev}@${homeAbbrev}`, meta);
      }
    }
  } catch {
    // Non-critical — games just won't have deep links / no-hit alerts
  }
  return map;
}

// NHL public API: fetch the league's own game IDs keyed by "away@home".
// ESPN's gameId diverges from NHL's, so this lets us deep-link into
// nhl.com/tv for the specific game when the broadcast isn't ESPN (ESPN
// games already get a deep link via espn.com/watch).
async function fetchNHLGameIds(date?: string): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  try {
    let apiDate: string;
    if (date && date.length === 8) {
      apiDate = `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`;
    } else {
      const now = new Date();
      apiDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    }
    const res = await fetchWithRetry(`https://api-web.nhle.com/v1/score/${apiDate}`, 1, 5000);
    if (!res.ok) return map;
    const data = await res.json();
    for (const game of data.games ?? []) {
      const gameId = String(game.id);
      const homeAbbrev = game.homeTeam?.abbrev ?? "";
      const awayAbbrev = game.awayTeam?.abbrev ?? "";
      if (homeAbbrev && awayAbbrev) {
        map.set(`${awayAbbrev}@${homeAbbrev}`, gameId);
      }
    }
  } catch {
    // Non-critical — falls back to generic NHL landing
  }
  return map;
}

// MLB team abbreviation mapping: ESPN → MLB Stats API
// Most match, but a few differ
const ESPN_TO_MLB_ABBREV: Record<string, string> = {
  ARI: "AZ",
  CHW: "CWS",
};

function espnToMlbAbbrev(espnAbbrev: string): string {
  return ESPN_TO_MLB_ABBREV[espnAbbrev] || espnAbbrev;
}

// Map ESPN country codes (from flag URLs) to display names
const COUNTRY_NAMES: Record<string, string> = {
  usa: "United States", can: "Canada", mex: "Mexico",
  gbr: "Great Britain", eng: "England", sco: "Scotland", wal: "Wales",
  irl: "Ireland", nir: "Northern Ireland",
  esp: "Spain", fra: "France", ger: "Germany", ita: "Italy",
  swe: "Sweden", nor: "Norway", den: "Denmark", fin: "Finland",
  aus: "Australia", nzl: "New Zealand",
  jpn: "Japan", kor: "South Korea", chn: "China", tha: "Thailand",
  ind: "India", phi: "Philippines", twn: "Chinese Taipei",
  zaf: "South Africa", arg: "Argentina", bra: "Brazil", col: "Colombia",
  chl: "Chile", ven: "Venezuela", per: "Peru",
  aut: "Austria", bel: "Belgium", ned: "Netherlands", por: "Portugal",
  pol: "Poland", sui: "Switzerland", cze: "Czech Republic",
};

function countryNameFromFlagUrl(url: string): string {
  const match = url.match(/\/countries\/\d+\/(\w+)\.\w+$/);
  if (!match) return "";
  const code = match[1].toLowerCase();
  return COUNTRY_NAMES[code] ?? code.toUpperCase();
}

async function fetchGolfTournament(date?: string): Promise<GolfTournament | null> {
  const url = new URL(BASE_URL + SPORT_PATHS.golf);
  if (date) url.searchParams.set("dates", date);

  let res: Response;
  try {
    res = await fetchWithRetry(url.toString());
  } catch {
    return null;
  }
  if (!res.ok) return null;

  const data = await res.json();
  const event = data.events?.[0];
  if (!event) return null;

  const competition = event.competitions?.[0];
  if (!competition) return null;

  const state = (event.status?.type?.state ?? "pre") as "pre" | "in" | "post";
  // Round-level state: competition.status tracks the *current* round's
  // state ("in" while players are on course, "post" once play for the round
  // is complete, even though the tournament itself may still have rounds
  // left). This is the signal the card uses to decide whether to show the
  // green live indicator and whether to hide the recap highlights.
  const roundStatus = (competition.status?.type?.state ?? "pre") as "pre" | "in" | "post";
  const competitors = competition.competitors ?? [];

  // Determine current round from linescores
  const currentRound = competitors.length > 0
    ? (competitors[0].linescores ?? []).filter((r: any) => r.value !== null && r.value !== undefined).length
    : 0;

  let statusDetail = "Upcoming";
  if (state === "post") {
    statusDetail = "Final";
  } else if (state === "in") {
    // Check if any player is mid-round (has holes played in current round but round not complete)
    const anyMidRound = competitors.some((c: any) => {
      const rounds = c.linescores ?? [];
      const nextRound = rounds[currentRound]; // 0-indexed: currentRound is the in-progress one
      if (!nextRound) return false;
      const holes = nextRound.linescores ?? [];
      return holes.length > 0 && holes.length < 18;
    });
    if (anyMidRound) {
      statusDetail = `Round ${currentRound + 1}`;
    } else if (currentRound > 0) {
      statusDetail = `After Round ${currentRound}`;
    } else {
      statusDetail = "Round 1";
    }
  }

  const players: GolfPlayer[] = competitors.map((c: any) => {
    const athlete = c.athlete ?? {};
    const linescores: any[] = c.linescores ?? [];

    // Completed rounds
    const rounds = linescores
      .filter((r: any) => r.value !== null && r.value !== undefined)
      .map((r: any) => String(Math.round(r.value)));

    // Thru: check if currently mid-round
    let thru = "";
    const inProgressRound = linescores[rounds.length]; // next round after completed ones
    if (inProgressRound) {
      const holes = (inProgressRound.linescores ?? []).filter((h: any) => h.value !== null && h.value !== undefined);
      if (holes.length > 0 && holes.length < 18) {
        thru = String(holes.length);
      } else if (holes.length === 18) {
        thru = "F";
      }
    }
    if (!thru && rounds.length > 0) {
      thru = "F";
    }

    const flagUrl = athlete.flag?.href ?? "";
    const flagCountry = athlete.flag?.alt ?? countryNameFromFlagUrl(flagUrl);

    return {
      position: c.order ?? 0,
      name: athlete.displayName ?? "",
      shortName: athlete.shortName ?? "",
      score: c.score ?? "E",
      flag: flagUrl,
      flagCountry,
      rounds,
      thru,
    };
  });

  // Gather broadcasts
  const broadcasts: string[] = [];
  for (const b of competition?.broadcasts ?? []) {
    for (const name of b.names ?? []) {
      if (!broadcasts.includes(name)) broadcasts.push(name);
    }
  }

  // Masters broadcast enrichment — ESPN's scoreboard only lists the rights holder
  // for the current window. The actual coverage is split across networks/streamers.
  // 2026 Masters: Thu/Fri ESPN + Amazon Prime, Sat/Sun CBS + Paramount+
  // (Masters.com / Masters app stream all four days)
  if (/masters/i.test(event.name ?? "")) {
    const dayDate = date
      ? new Date(`${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}T12:00:00`)
      : new Date();
    const dow = dayDate.getDay(); // 0=Sun..6=Sat
    const add = (n: string) => { if (!broadcasts.includes(n)) broadcasts.push(n); };
    if (dow === 4 || dow === 5) {
      // Thursday/Friday — Rounds 1-2
      add("ESPN");
      add("Amazon Prime");
    } else if (dow === 6 || dow === 0) {
      // Saturday/Sunday — Rounds 3-4
      add("CBS");
      add("Paramount+");
    }
    add("Masters.com");
  }

  // Calculate leaderboard competitiveness rating
  // Based on how tight the top of the leaderboard is
  let rating: number | null = null;
  if (state !== "pre" && players.length >= 5) {
    // Parse numeric scores for top players
    const parseScore = (s: string): number => {
      if (s === "E") return 0;
      return parseInt(s, 10) || 0;
    };
    const topScores = players.slice(0, 10).map(p => parseScore(p.score));
    const leader = topScores[0];
    // Spread between 1st and 5th
    const top5spread = Math.abs((topScores[4] ?? leader) - leader);
    // Spread between 1st and 10th
    const top10spread = Math.abs((topScores[9] ?? leader) - leader);
    // Number of players within 2 strokes of lead
    const within2 = topScores.filter(s => Math.abs(s - leader) <= 2).length;

    // Tight leaderboard = high rating
    // 0 spread = 100, each stroke of spread reduces by ~12
    const spreadScore = Math.max(0, 100 - top5spread * 12);
    // Depth bonus: more players bunched = more exciting
    const depthBonus = Math.min(15, within2 * 2);
    // Top 10 tightness (secondary factor)
    const top10Score = Math.max(0, 50 - top10spread * 5);

    rating = Math.min(100, Math.round(spreadScore * 0.6 + top10Score * 0.2 + depthBonus));
  }

  // Look up the tournament's start date (MM-DD) from the league config so the
  // client can do date-aware round labeling (yesterday=R1, today=R2, etc).
  const tournamentLabel = ALL_LEAGUES.find(
    (l) => l.sport === "golf" && new RegExp(l.label, "i").test(event.name ?? "")
  );

  // Drop tournament if the viewed date falls outside its 4-day window.
  // ESPN's scoreboard will happily return the nearest tournament even when
  // querying a date after the final round, which leaks a wrapped event into
  // e.g. tomorrow's view. Rounds run startDate..startDate+3.
  if (date && tournamentLabel?.startDate) {
    const selYear = parseInt(date.slice(0, 4), 10);
    const selMonth = parseInt(date.slice(4, 6), 10);
    const selDay = parseInt(date.slice(6, 8), 10);
    const [startMo, startDay] = tournamentLabel.startDate.split("-").map((s) => parseInt(s, 10));
    if (Number.isFinite(startMo) && Number.isFinite(startDay)) {
      const selDateObj = new Date(selYear, selMonth - 1, selDay);
      const startDateObj = new Date(selYear, startMo - 1, startDay);
      const dayIndex = Math.round(
        (selDateObj.getTime() - startDateObj.getTime()) / (24 * 3600 * 1000)
      );
      if (dayIndex < 0 || dayIndex > 3) return null;
    }
  }

  // Live-link destination — pick the first known broadcast's streamer, or
  // fall back to PGA Tour Live. Never link to the ESPN leaderboard, which
  // would defeat the no-spoiler experience by exposing live scores.
  let streamUrl: string | undefined;
  for (const broadcast of broadcasts) {
    const url = networkStreamUrl(broadcast, event.id ?? "");
    if (url) { streamUrl = url; break; }
  }
  if (!streamUrl) streamUrl = sportStreamFallback("golf");

  return {
    name: event.name ?? "",
    state,
    statusDetail,
    players,
    broadcasts,
    rating,
    currentRound,
    roundStatus,
    startDate: tournamentLabel?.startDate,
    eventDate: event.date ?? competition.date ?? undefined,
    streamUrl,
  };
}

// localStorage-backed stale-while-revalidate cache for fetchGames. On a fetch
// failure we transparently return the last successful payload — the user sees
// slightly stale data rather than the "Schedule unavailable" empty state.
// Per-sport+date key; entries replaced on every successful fetch, no TTL since
// the next successful refresh overwrites them. Failures during private-mode
// or quota-full just degrade to the no-cache path.
const SCOREBOARD_CACHE_PREFIX = "hidescore.scoreboard.";
function scoreboardCacheKey(sport: Sport, date?: string): string {
  return `${SCOREBOARD_CACHE_PREFIX}${sport}.${date ?? "today"}`;
}
function readScoreboardCache(sport: Sport, date?: string): Game[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(scoreboardCacheKey(sport, date));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Game[];
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
function writeScoreboardCache(sport: Sport, date: string | undefined, games: Game[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(scoreboardCacheKey(sport, date), JSON.stringify(games));
  } catch {
    // Quota exceeded / private mode / disabled storage — silent.
  }
}

// Map raw ESPN scoreboard events into Game[] (team-based sports). Shared by
// the single-day fetch and the soccer range-lookahead so both apply the same
// postponed/preseason/0-competitor filtering + per-event failure isolation.
function eventsToGames(events: any[], sport: Sport): Game[] {
  return events
    .filter((e: any) => {
      // Filter out postponed/canceled/suspended games
      const statusName = e.status?.type?.name ?? "";
      if (statusName.includes("POSTPONED") || statusName.includes("CANCELED") || statusName.includes("SUSPENDED")) return false;
      // Filter out preseason/spring training — bad highlights, ties in records, low-quality games
      const seasonType = e.season?.type ?? 0;
      if (seasonType === 1) return false;
      // Tournament-wrapper events with no competitors aren't real matches.
      const competitors = e.competitions?.[0]?.competitors ?? [];
      if (competitors.length < 2) return false;
      return true;
    })
    // A single malformed event must not take down the whole league.
    .map((e: any) => {
      try {
        return parseGame(e, sport);
      } catch {
        return null;
      }
    })
    .filter((g: Game | null): g is Game => g !== null);
}

// Soccer leagues have multi-week gaps (international windows, the 2026 World
// Cup summer break, etc.) that blow past the 7-day next-game lookahead → the
// column shows "Schedule TBD" even though games resume weeks out. ESPN's
// scoreboard accepts a DATE RANGE (`?dates=YYYYMMDD-YYYYMMDD`) returning every
// fixture in the window in ONE request, so we can find the true next match day
// without dozens of separate fetches. Returns the earliest future day's slate.
async function fetchNextGameDayRange(
  sport: Sport,
  fromDate?: string,
  windowDays = 80,
): Promise<{ date: string; games: Game[] } | null> {
  const base = fromDate
    ? new Date(`${fromDate.slice(0, 4)}-${fromDate.slice(4, 6)}-${fromDate.slice(6, 8)}T12:00:00`)
    : new Date();
  const ymd = (d: Date) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const start = new Date(base); start.setDate(start.getDate() + 1);
  const end = new Date(base); end.setDate(end.getDate() + windowDays);
  const url = new URL(BASE_URL + SPORT_PATHS[sport]);
  url.searchParams.set("dates", `${ymd(start)}-${ymd(end)}`);
  let events: any[];
  try {
    const res = await fetchWithRetry(url.toString());
    if (!res.ok) return null;
    const data = await res.json();
    events = data?.events ?? [];
  } catch {
    return null;
  }
  const games = eventsToGames(events, sport).filter((g) => g.state === "pre" || g.state === "in");
  if (!games.length) return null;
  // Group by the fixture's ET calendar day, return the earliest day's slate.
  const dayOf = (iso: string) => {
    try {
      return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso)).replace(/-/g, "");
    } catch {
      return "";
    }
  };
  let earliest = "";
  for (const g of games) {
    const d = dayOf(g.date);
    if (d && (!earliest || d < earliest)) earliest = d;
  }
  if (!earliest) return null;
  return { date: earliest, games: games.filter((g) => dayOf(g.date) === earliest) };
}

export async function fetchGames(
  sport: Sport,
  date?: string
): Promise<{ games: Game[]; failed: boolean }> {
  const url = new URL(BASE_URL + SPORT_PATHS[sport]);
  if (date) url.searchParams.set("dates", date);

  // For MLB, fetch game metadata (gamePk + live linescore) in parallel with ESPN data
  const mlbMetaPromise = sport === "mlb" ? fetchMLBGameMeta(date) : null;
  // Same pattern for NHL — fetch NHL's own game IDs so we can deep-link
  // non-ESPN broadcasts into nhl.com/tv/{id} instead of the generic landing.
  const nhlIdsPromise = sport === "nhl" ? fetchNHLGameIds(date) : null;
  // Prime ASIN map lookup runs for every sport since Prime carries NFL TNF,
  // NBA, MLB, and some soccer. The map is cached across fetchGames() calls.
  const primeAsinsPromise = loadPrimeAsins();
  // ESPN airings + NBA League Pass ids — resolved by a nightly cron into
  // /public/espn-airings.json. Used to upgrade the ESPN watch URL from the
  // numeric event id (hit-or-miss) to the airing UUID (canonical).
  const espnAiringsPromise = loadEspnAirings();

  // A failed/non-OK fetch OR a non-JSON body (ESPN's CDN occasionally serves
  // a 200 HTML interstitial during incidents) falls back to the localStorage
  // cache from the last successful fetch — stale-while-revalidate so the
  // user keeps seeing games through transient ESPN blips. Only when the
  // cache is also empty does failed:true bubble up to the empty-state UI.
  const failWithCacheFallback = (): { games: Game[]; failed: boolean } => {
    const cached = readScoreboardCache(sport, date);
    if (cached && cached.length) return { games: cached, failed: false };
    return { games: [], failed: true };
  };
  let data: { events?: unknown[] } | null;
  try {
    const res = await fetchWithRetry(url.toString());
    if (!res.ok) return failWithCacheFallback();
    data = await res.json();
  } catch {
    return failWithCacheFallback();
  }

  const events = data?.events ?? [];

  // Tennis nests its real matches in event.groupings[].competitions[] with
  // athlete-based competitors — flattened by a dedicated parser, not the
  // team-based path below (which would drop the 0-competitor tournament wrapper).
  if (sport === "tennis") {
    return { games: buildTennisGames(events, date), failed: false };
  }

  const games: Game[] = eventsToGames(events, sport);

  // Enrich MLB games with direct MLB.tv stream links + No-Hit Alert flag
  if (sport === "mlb" && mlbMetaPromise) {
    const mlbMeta = await mlbMetaPromise;
    for (const game of games) {
      const awayAbbrev = espnToMlbAbbrev(game.awayTeam.abbreviation);
      const homeAbbrev = espnToMlbAbbrev(game.homeTeam.abbreviation);
      const meta = mlbMeta.get(`${awayAbbrev}@${homeAbbrev}`);
      if (!meta) continue;
      game.streamUrl = `https://www.mlb.com/tv/g${meta.gamePk}`;
      // No-Hit / Perfect Game Alert: live game, opposing batting team has 0
      // hits, pitcher has carried the bid into at least the 6th inning (5
      // complete innings of no-hit ball). Matches the MLB.com Gameday alert
      // threshold. The opposing team's runs+leftOnBase=0 upgrades it to a
      // perfect game (catches walks/HBP/errors via aggregate runners-on
      // without needing the boxscore hydrate). Cleared on next refresh as
      // soon as a hit drops or a runner reaches.
      //
      // Rating override: a no-hit bid is always interesting regardless of
      // score margin, so floor the rating at 95 (always GREAT). A perfect
      // game gets 110 — above the natural 0–100 cap so the live-cluster
      // sort always puts it at the top.
      if (meta.isLive && game.state === "in" && (meta.currentInning ?? 0) >= 6) {
        if (meta.awayHits === 0) {
          game.noHitterPitchingTeam = game.homeTeam.abbreviation;
          if ((meta.awayRuns ?? 0) === 0 && (meta.awayLeftOnBase ?? 0) === 0) {
            game.isPerfectGame = true;
          }
        } else if (meta.homeHits === 0) {
          game.noHitterPitchingTeam = game.awayTeam.abbreviation;
          if ((meta.homeRuns ?? 0) === 0 && (meta.homeLeftOnBase ?? 0) === 0) {
            game.isPerfectGame = true;
          }
        }
        if (game.isPerfectGame) {
          game.rating = 110;
        } else if (game.noHitterPitchingTeam) {
          game.rating = Math.max(95, game.rating ?? 0);
        }
      }
    }
  }

  // Set fallback stream URLs from broadcast info
  for (const game of games) {
    if (!game.streamUrl) {
      game.streamUrl = buildStreamUrl(game);
    }
  }

  // Deepen the NHL fallback to a per-game nhl.com/tv path when we can
  // resolve NHL's own game ID. ESPN-broadcast NHL games keep their
  // espn.com/watch deep link — only the generic ESPN-watch fallback is
  // replaced, so we never clobber a closer streamer URL.
  if (sport === "nhl" && nhlIdsPromise) {
    const nhlIds = await nhlIdsPromise;
    for (const game of games) {
      if (game.streamUrl !== "https://www.espn.com/watch/") continue;
      const nhlId = nhlIds.get(`${game.awayTeam.abbreviation}@${game.homeTeam.abbreviation}`);
      if (nhlId) game.streamUrl = `https://www.nhl.com/tv/${nhlId}`;
    }
  }

  // Prime Video deep link: when we have an ASIN for the matchup, store it
  // on the game so the Prime chip always routes there. Also upgrade the
  // main streamUrl if Prime was the winning broadcast (i.e., streamUrl is
  // currently a generic Prime sports page).
  const asinMap = await primeAsinsPromise;
  for (const game of games) {
    if (!hasPrimeBroadcast(game)) continue;
    const url = buildPrimeDeepLink(game, asinMap);
    if (!url) continue;
    game.primeStreamUrl = url;
    if (game.streamUrl && /primevideo\.com\/sports/.test(game.streamUrl)) {
      game.streamUrl = url;
    }
  }

  // ESPN airing UUIDs: swap the numeric-event-id watch URL for the airing
  // UUID (the canonical id ESPN's watch player expects). Also upgrade the
  // generic nba.com/watch landing into nba.com/watch/league-pass-stream/{id}
  // when we have an NBA gameId — score-safe for both auth'd and anon users
  // (anon redirects to the League Pass purchase page, no score leaks).
  const espnData = await espnAiringsPromise;
  for (const game of games) {
    const airing = espnData.airings[game.id];
    if (airing && game.streamUrl) {
      game.streamUrl = game.streamUrl.replace(
        /\/watch\/player\/_\/id\/[^/?#]+/,
        `/watch/player/_/id/${airing.uuid}`
      );
    }
    if (sport === "nba" && game.streamUrl === "https://www.nba.com/watch") {
      const nbaId = espnData.nbaGameIds[game.id];
      if (nbaId) game.streamUrl = `https://www.nba.com/watch/league-pass-stream/${nbaId}`;
    }
  }

  writeScoreboardCache(sport, date, games);
  return { games, failed: false };
}

// Full team list for a league — used by the Settings team picker so users can
// browse all teams without having to find their team in a game card first.
// Caches per-sport since the team list is effectively static within a season.
//
// Endpoint note: the obvious choice `site.api.espn.com/.../teams` returns 200
// for curl but does NOT send `Access-Control-Allow-Origin: *`, so the browser
// CORS check blocks it (the scoreboard endpoint on the same host DOES send
// CORS — undocumented per-endpoint policy). We use `sports.core.api.espn.com`
// which is fully CORS-open. Its response shape is flat (`items[]`) instead of
// the nested `sports[0].leagues[0].teams[]` of the site host, and items lack
// the `logos` array — we synthesize logo URLs from ESPN's CDN conventions.
export interface SportTeam {
  id: string;           // "${sport}-${rawId}" — same shape as Team.id elsewhere
  rawId: string;        // ESPN's numeric id, useful for schedule fetches
  displayName: string;
  shortDisplayName: string;
  abbreviation: string;
  logo?: string;
}

function logoForTeam(sport: Sport, rawId: string, abbreviation: string): string | undefined {
  const abbr = abbreviation.toLowerCase();
  // ESPN CDN team-logo path conventions, verified empirically. The major US
  // leagues use abbreviation; NCAAM uses team id; soccer uses team id under
  // a shared /soccer/ path.
  switch (sport) {
    case "mlb":
    case "nba":
    case "wnba":
    case "nhl":
    case "nfl":
      return abbr ? `https://a.espncdn.com/i/teamlogos/${sport}/500/${abbr}.png` : undefined;
    case "ncaam":
      return `https://a.espncdn.com/i/teamlogos/ncaa/500/${rawId}.png`;
    case "epl":
    case "mls":
    case "fifa":
      return `https://a.espncdn.com/i/teamlogos/soccer/500/${rawId}.png`;
    default:
      return undefined;
  }
}

const sportTeamsCache = new Map<Sport, Promise<SportTeam[]>>();
export function fetchSportTeams(sport: Sport): Promise<SportTeam[]> {
  const cached = sportTeamsCache.get(sport);
  if (cached) return cached;
  const sportPath = SPORT_PATHS[sport].replace(/\/scoreboard$/, "");
  const url = `https://sports.core.api.espn.com/v3/sports${sportPath}/teams?limit=400`;
  const p = (async (): Promise<SportTeam[]> => {
    try {
      const res = await fetchWithRetry(url, 1, 8000);
      if (!res.ok) return [];
      const data = await res.json();
      const items = Array.isArray(data?.items) ? data.items : [];
      const out: SportTeam[] = [];
      for (const t of items) {
        if (!t?.id || !t?.displayName) continue;
        if (t.active === false) continue;
        const rawId = String(t.id);
        const abbreviation = String(t.abbreviation || "");
        out.push({
          id: `${sport}-${rawId}`,
          rawId,
          displayName: t.displayName,
          shortDisplayName: t.shortDisplayName || t.displayName,
          abbreviation,
          logo: logoForTeam(sport, rawId, abbreviation),
        });
      }
      out.sort((a, b) => a.displayName.localeCompare(b.displayName));
      return out;
    } catch {
      return [];
    }
  })();
  // Don't cache empty results — first-fetch CORS or network blips would
  // otherwise stick "No teams available" forever.
  p.then((r) => { if (r.length === 0) sportTeamsCache.delete(sport); });
  sportTeamsCache.set(sport, p);
  return p;
}

// NHL.com videos play through Brightcove (account 6415718365001, player
// EXtG1xJ7H_default). Every nhl.com/video/ path ends in "-{brightcoveId}";
// turn that into an iframe embed src so recaps play inside the app's modal.
function nhlBrightcoveEmbed(pageUrl: string | null): string | null {
  if (!pageUrl) return null;
  const m = pageUrl.match(/-(\d+)\/?$/);
  // autoplay+muted so the recap starts on its own when the modal opens —
  // muted is required for browsers to honor autoplay (matches the YouTube
  // highlight modal, which also autoplays muted).
  return m
    ? `https://players.brightcove.net/6415718365001/EXtG1xJ7H_default/index.html?videoId=${m[1]}&autoplay&muted`
    : null;
}

// Attach NHL.com Recap + Condensed-Game videos to finished NHL games. Pulls
// from the /api/nhl-videos worker proxy (the NHL API itself sends no CORS
// headers, so it can't be hit directly from the browser/WebView) and matches
// NHL's common team names ("Canadiens") against ESPN's full displayName
// ("Montreal Canadiens") — the two sources' abbreviations differ.
async function enrichNhlVideos(games: Game[], date: string): Promise<void> {
  if (!date || !games.some((g) => g.state === "post")) return;
  try {
    const res = await fetch(`${getApiBase()}/api/nhl-videos?date=${date}`);
    if (!res.ok) return;
    const data = (await res.json()) as {
      games?: { away: string; home: string; recap: string | null; condensed: string | null }[];
    };
    const entries = data.games ?? [];
    if (!entries.length) return;
    for (const game of games) {
      if (game.state !== "post") continue;
      const home = game.homeTeam.displayName.toLowerCase();
      const away = game.awayTeam.displayName.toLowerCase();
      const match = entries.find(
        (e) =>
          !!e.home && !!e.away &&
          home.endsWith(e.home.toLowerCase()) &&
          away.endsWith(e.away.toLowerCase()),
      );
      if (match) {
        game.nhlRecapUrl = match.recap;
        game.nhlRecapEmbed = nhlBrightcoveEmbed(match.recap);
        game.nhlCondensedUrl = match.condensed;
        game.nhlCondensedEmbed = nhlBrightcoveEmbed(match.condensed);
      }
    }
  } catch {
    // Best-effort enrichment — leave games unchanged on any failure.
  }
}

export async function fetchAllLeagues(
  date?: string,
  thirdLeagueSport?: Sport | "empty",
  slotOverrides?: { first?: Sport | "empty"; second?: Sport | "empty"; third?: Sport | "empty" },
): Promise<LeagueData[]> {
  // Parse viewed date so league visibility matches the day being viewed, not today
  const viewDate = date
    ? new Date(`${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}T12:00:00`)
    : new Date();
  // Today in ET as YYYYMMDD, so the "next game day" lookahead only fires on
  // today/future tabs — on a PAST tab (e.g. Yesterday) a league with no game
  // should read "No games", not surface a future game (Jacob 5/29).
  const todayYmd = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()).replace(/-/g, "");
  const isPastView = !!date && date < todayYmd;

  // Resolved slot order from the layout rules. Returns 1-3 LeagueConfigs in
  // [left, center, right] order — see the "FULL YEAR SCHEDULE" comment up top.
  const auto = pickAndAssignLeagues(viewDate);

  // Per-slot overrides: each slot independently swappable to any active league.
  // "empty" hides the slot entirely (no auto fallback). Falls back to legacy
  // thirdLeagueSport when slotOverrides.third is unset to preserve old share URLs.
  // Returns LeagueConfig for a sport, "empty" to keep the slot explicitly hidden,
  // or null when unset (which then triggers the auto fallback downstream).
  const resolveSlot = (sport: Sport | "empty" | undefined): LeagueConfig | "empty" | null => {
    if (sport === "empty") return "empty";
    if (!sport) return null;
    return ALL_LEAGUES.find((l) => l.sport === sport && isLeagueActive(l, viewDate)) ?? null;
  };
  const slot1Cfg = resolveSlot(slotOverrides?.first);
  const slot2Cfg = resolveSlot(slotOverrides?.second);
  const slot3Cfg = resolveSlot(slotOverrides?.third) ?? resolveSlot(thirdLeagueSport);

  let final: LeagueConfig[];
  if (slot1Cfg || slot2Cfg || (slotOverrides?.third && slot3Cfg)) {
    // Any per-slot override → user is in full manual control. Build slot-by-slot:
    // each set slot uses its override; each unset slot falls back to its position
    // default in auto.
    // Auto = the slot's position default, always. No fallback when auto[N]'s
    // sport is already pinned in another slot — duplicates are allowed (Jacob's
    // rule: Auto on column N must equal that column's normal league regardless
    // of what's pinned elsewhere, even if it duplicates). Explicit duplicates
    // are already a supported intentional layout via the swap dropdown.
    const nextAutoForSlot = (slotIdx: number): LeagueConfig | null => auto[slotIdx] ?? null;
    // Each slot resolves to one of: explicit league (incl. "empty" → skip),
    // unset (null) → fall back to that slot's auto pick.
    const resolveFinal = (cfg: LeagueConfig | "empty" | null, slotIdx: number): LeagueConfig | null =>
      cfg === "empty" ? null : (cfg ?? nextAutoForSlot(slotIdx));
    const slots: (LeagueConfig | null)[] = [
      resolveFinal(slot1Cfg, 0),
      resolveFinal(slot2Cfg, 1),
      resolveFinal(slot3Cfg, 2),
    ];
    // Drop both empty slots and any null auto-fallback misses.
    final = slots.filter((cfg): cfg is LeagueConfig => cfg !== null);
  } else if (slot3Cfg && slot3Cfg !== "empty" && !auto.some((l) => l.sport === slot3Cfg.sport && l.label === slot3Cfg.label)) {
    // Legacy slot-3 swap path: replace the rightmost auto slot with the chosen league.
    final = [...auto.slice(0, MAX_LEAGUES - 1), slot3Cfg];
  } else {
    final = auto;
  }

  const fetchLeague = async (cfg: LeagueConfig): Promise<LeagueData | null> => {
    const label = effectiveLeagueLabel(cfg, viewDate);
    if (cfg.sport === "golf") {
      const golfTournament = await fetchGolfTournament(date);
      if (!golfTournament) return null;
      return { sport: cfg.sport, label, games: [], golfTournament };
    }
    const { games, failed } = await fetchGames(cfg.sport, date);
    if (cfg.sport === "nhl" && date) await enrichNhlVideos(games, date);
    let nextGameDay: { date: string; games: Game[] } | null = null;
    // Only surface the "next game day" fallback when ESPN genuinely returned
    // an empty schedule. On a fetch failure games is also [] — falling back
    // there would render tomorrow's slate labeled "Tomorrow" on the Today
    // tab, which reads as a bug. A failed league carries fetchFailed instead.
    if (!failed && games.length === 0 && !isPastView) {
      // NBA + NHL publish playoff games only as the prior round wraps. During
      // their playoff months (May/Jun) ESPN's "next 7 days" can be a flat zero
      // even though Conf Finals / Cup Final games will be added soon. Look 21
      // days out for those leagues so once a series posts, we surface it.
      const isPlayoffMonth = viewDate.getMonth() === 4 /* May */ || viewDate.getMonth() === 5 /* Jun */;
      const lookahead = (cfg.sport === "nba" || cfg.sport === "nhl") && isPlayoffMonth ? 21 : 7;
      nextGameDay = await fetchNextGameDay(cfg.sport, lookahead, date);
      // Soccer leagues take multi-week breaks (intl windows / 2026 World Cup
      // summer gap) longer than the day-by-day lookahead. When that finds
      // nothing, widen with a single range query so the column shows the real
      // next match day instead of "Schedule TBD".
      const SOCCER: Sport[] = ["mls", "epl", "ucl", "uel", "fifa"];
      if (!nextGameDay && SOCCER.includes(cfg.sport)) {
        nextGameDay = await fetchNextGameDayRange(cfg.sport, date);
      }
    }
    return { sport: cfg.sport, label, games, nextGameDay, fetchFailed: failed };
  };

  // allSettled, not all: a single league throwing must not blank the whole
  // board. fetchLeague's helpers are already failure-tolerant (fetchGames
  // returns [] on any error), so this is defense-in-depth against a future
  // enrichment step reintroducing a throw — one bad column drops out, the
  // rest still render.
  const settled = await Promise.allSettled(final.map(fetchLeague));
  return settled
    .map((r) => (r.status === "fulfilled" ? r.value : null))
    .filter((r): r is LeagueData => r !== null);
}

// ESPN standings: { teamId -> "W-L" }. Cached per-sport so one team-view
// fetch doesn't re-pull for each game. Used to fill records on upcoming
// games, which the team-schedule endpoint omits.
const standingsCache = new Map<Sport, Promise<Map<string, string>>>();
export function fetchStandingsRecords(sport: Sport): Promise<Map<string, string>> {
  const cached = standingsCache.get(sport);
  if (cached) return cached;
  const sportPath = SPORT_PATHS[sport].replace(/\/scoreboard$/, "");
  const url = `https://site.web.api.espn.com/apis/v2/sports${sportPath}/standings`;
  const p = (async () => {
    const map = new Map<string, string>();
    try {
      const res = await fetchWithRetry(url, 1, 6000);
      if (!res.ok) return map;
      const data = await res.json();
      const children = data.children ?? [];
      const entries: Array<{ team?: { id?: string }; stats?: Array<{ name?: string; summary?: string; displayValue?: string }> }> = [];
      for (const child of children) {
        for (const entry of child.standings?.entries ?? []) entries.push(entry);
      }
      // Some sports return a flat standings.entries without children grouping
      for (const entry of data.standings?.entries ?? []) entries.push(entry);
      for (const entry of entries) {
        const id = entry.team?.id;
        if (!id) continue;
        const overall = entry.stats?.find((s) => s.name === "overall") ?? entry.stats?.find((s) => s.name === "record");
        let rec = overall?.summary ?? overall?.displayValue ?? "";
        if ((sport === "mlb" || sport === "nhl") && rec.split("-").length === 3) {
          const [w, l] = rec.split("-");
          rec = `${w}-${l}`;
        }
        if (rec) map.set(id, rec);
      }
    } catch { /* swallow — records just won't show */ }
    return map;
  })();
  standingsCache.set(sport, p);
  return p;
}

// Fetch a team's full season schedule from ESPN. team.id on our Game model is
// `${sport}-${rawId}` — caller passes the raw ESPN team id here.
// Returns games parsed via the shared parser, sorted oldest → newest.
// Pulls requested season(s); for current season defaults to current year.
export async function fetchTeamSchedule(
  sport: Sport,
  espnTeamId: string,
  seasons?: number[]
): Promise<Game[]> {
  const years = seasons && seasons.length > 0 ? seasons : [new Date().getFullYear()];
  const asinMap = await loadPrimeAsins();
  const standingsPromise = fetchStandingsRecords(sport);
  const all: Game[] = [];
  const seen = new Set<string>();
  await Promise.all(
    years.map(async (year) => {
      const sportPath = SPORT_PATHS[sport].replace(/\/scoreboard$/, "");
      const url = new URL(
        `${BASE_URL}${sportPath}/teams/${espnTeamId}/schedule`
      );
      url.searchParams.set("season", String(year));
      let res: Response;
      try {
        res = await fetchWithRetry(url.toString());
      } catch {
        return;
      }
      if (!res.ok) return;
      const data = await res.json();
      const events = data.events ?? data.team?.events ?? [];
      for (const e of events) {
        // Team-schedule events nest status inside competitions[0] and use
        // different shapes for broadcasts / records / logos vs scoreboard.
        // Reshape to match the scoreboard shape so parseGame works uniformly.
        const comp = (e.competitions ?? [])[0] ?? {};
        if (!e.status || !e.status.type) e.status = comp.status ?? {};
        // Broadcasts: scoreboard uses { names: [] }; schedule uses { media: { shortName } }
        if (Array.isArray(comp.broadcasts)) {
          comp.broadcasts = comp.broadcasts.map((b: { names?: string[]; media?: { shortName?: string } }) => {
            if (b.names && b.names.length) return b;
            const name = b.media?.shortName;
            return name ? { names: [name] } : b;
          });
        }
        for (const c of comp.competitors ?? []) {
          const t = c.team;
          if (t && !t.logo && Array.isArray(t.logos)) {
            const primary = t.logos.find((l: { rel?: string[] }) => l.rel?.includes("default")) ?? t.logos[0];
            if (primary?.href) t.logo = primary.href;
          }
          // Records: scoreboard uses records:[{summary}]; schedule uses record:[{type,displayValue}]
          // Prefer type==='total' — that's the season overall record.
          if (!c.records && Array.isArray(c.record)) {
            const total = c.record.find((r: { type?: string }) => r?.type === "total") ?? c.record[0];
            if (total?.displayValue) c.records = [{ summary: total.displayValue }];
          }
        }
        const statusName = e.status?.type?.name ?? "";
        if (statusName.includes("POSTPONED") || statusName.includes("CANCELED") || statusName.includes("SUSPENDED")) continue;
        const seasonType = e.season?.type ?? 0;
        if (seasonType === 1) continue;
        if (!e.id || seen.has(e.id)) continue;
        seen.add(e.id);
        const game = parseGame(e, sport);
        game.streamUrl = buildStreamUrl(game);
        if (hasPrimeBroadcast(game)) {
          const primeUrl = buildPrimeDeepLink(game, asinMap);
          if (primeUrl) {
            game.primeStreamUrl = primeUrl;
            if (game.streamUrl && /primevideo\.com\/sports/.test(game.streamUrl)) {
              game.streamUrl = primeUrl;
            }
          }
        }
        all.push(game);
      }
    })
  );
  all.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  // Fill missing records (mostly future games) from standings lookup.
  const standings = await standingsPromise;
  if (standings.size > 0) {
    const fill = (t: Team) => {
      if (t.record || !t.id) return;
      const rawId = t.id.startsWith(`${sport}-`) ? t.id.slice(sport.length + 1) : t.id;
      const rec = standings.get(rawId);
      if (rec) t.record = rec;
    };
    for (const g of all) { fill(g.homeTeam); fill(g.awayTeam); }
  }
  return all;
}

export async function fetchNextGameDay(
  sport: Sport,
  daysToCheck = 7,
  fromDate?: string // YYYYMMDD — search from this date instead of today
): Promise<{ date: string; games: Game[] } | null> {
  const base = fromDate
    ? new Date(`${fromDate.slice(0, 4)}-${fromDate.slice(4, 6)}-${fromDate.slice(6, 8)}T12:00:00`)
    : new Date();

  // Fetch all days in parallel for speed
  const dates = Array.from({ length: daysToCheck }, (_, i) => {
    const d = new Date(base);
    d.setDate(d.getDate() + i + 1);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}${m}${day}`;
  });

  const results = await Promise.all(
    dates.map(async (dateStr) => {
      const { games } = await fetchGames(sport, dateStr);
      const futureGames = games.filter((g) => g.state === "pre" || g.state === "in");
      return { date: dateStr, games: futureGames };
    })
  );

  return results.find((r) => r.games.length > 0) ?? null;
}
