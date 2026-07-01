import { Game, Sport, LeagueData, Team, GolfTournament, GolfPlayer, LeagueEventCard, FightBout } from "./types";
import { getApiBase } from "./youtube";
import { getEtServiceDate, toYmd, getTimeZone, etSlateYmd, nextYmd } from "./etDay";

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
  f1: "/racing/f1/scoreboard",
  ufc: "/mma/ufc/scoreboard",
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
  hidden?: boolean;          // BACKLOG — fully hidden from the UI (not in the switcher) until the card design is finished; data kept here
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
  // startDate opened to 06-04 (tournament opens 06-11) so the column previews
  // live NOW with the opener via the next-game-day lookahead. Revert to 06-11
  // after launch if you don't want it pinned before kickoff. NOTE: pinning the
  // World Cup to center bumps MLB out of the default 3-column layout until
  // NBA/NHL end (06-19).
  { sport: "fifa", label: "World Cup", startDate: "06-04", endDate: "07-19", championshipDate: "07-19", firstPref: true, displaySlot: "center", slotPrecedence: 2, yearCycle: { mod: 4, anchor: 2026 } },
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
  // ── F1 + UFC (single-event tiles) ──
  // BACKLOG (hidden 2026-06-29): the EventCard tiles don't yet match the look of
  // the rest of the cards, so they're hidden from the switcher for now. Kept here
  // (data + endpoints intact) so re-enabling is a one-line flag flip once the
  // card design is reworked. F1 = Mar–early Dec season; UFC = year-round.
  { sport: "f1",  label: "F1",  startDate: "03-01", endDate: "12-14", excludeFromAuto: true, hidden: true },
  { sport: "ufc", label: "UFC", excludeFromAuto: true, hidden: true },
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
  // Opt-in event leagues sort to the bottom of the switcher (like WNBA).
  f1: 16,
  ufc: 17,
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

// Pick the `count` active leagues + assign slot positions according to the
// documented rules. Returns leagues in slot order — the first three follow the
// [left, center, right] pin rules; slots beyond 3 (the wide-viewport 5-column
// board) fill from the remaining pool by LEAGUE_PRIORITY.
export function pickAndAssignLeagues(viewDate: Date, count: number = MAX_LEAGUES): LeagueConfig[] {
  const eligible = ALL_LEAGUES.filter((l) => isLeagueActive(l, viewDate) && !l.excludeFromAuto);

  const mustInclude = eligible.filter((l) => l.mustInclude && !l.backfillOnly);
  const firstPref   = eligible.filter((l) => effectiveFirstPref(l, viewDate) && !l.mustInclude && !l.backfillOnly);
  const regular     = eligible.filter((l) => !l.mustInclude && !effectiveFirstPref(l, viewDate) && !l.backfillOnly);
  const backfill    = eligible.filter((l) => l.backfillOnly);

  // Build the candidate pool: hard-required leagues first, then top regulars to reach `count`.
  const candidates: LeagueConfig[] = [...mustInclude, ...firstPref];
  const sortedRegular = regular.sort(
    (a, b) => (LEAGUE_PRIORITY[a.sport] ?? 99) - (LEAGUE_PRIORITY[b.sport] ?? 99)
  );
  for (const l of sortedRegular) {
    if (candidates.length >= count) break;
    candidates.push(l);
  }
  // Backfill (NFL Preseason) only joins if we still have an empty slot.
  if (candidates.length < count) {
    for (const l of backfill) {
      if (candidates.length >= count) break;
      candidates.push(l);
    }
  }

  // Assign pinned slots first; losers fall back into a generic pool to fill empty slots.
  const slots: (LeagueConfig | null)[] = Array.from({ length: count }, () => null);
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
    rank: null, // hydrated post-fetch from the standings endpoint
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
  // F1 / UFC render as single-event tiles (no Game objects), so these are
  // placeholders only — calculateRating never runs on them.
  f1:     { multiplier: 1,   overtimeBonus: 0,  scoringDivisor: 1,   regulationPeriods: 1 },
  ufc:    { multiplier: 1,   overtimeBonus: 0,  scoringDivisor: 1,   regulationPeriods: 1 },
};

// Regulation period length in seconds, for count-down sports where ESPN's
// status.clock is "seconds remaining in the current period". Lets us measure
// progress *within* a period (smooth) instead of assuming a flat midpoint.
const PERIOD_SECONDS: Partial<Record<Sport, number>> = {
  nba: 720, wnba: 600,        // 12-min / 10-min quarters
  nfl: 900, ncaaf: 900,       // 15-min quarters
  nhl: 1200,                  // 20-min periods
  ncaam: 1200, ncaaw: 1200,   // 20-min halves
};
// Soccer is different: status.clock counts UP and equals total elapsed match
// seconds (5400 = 90'), so progress is just clock / full match.
const SOCCER_SPORTS = new Set<Sport>(["epl", "mls", "ucl", "uel", "fifa"]);
const FULL_MATCH_SECONDS = 5400;

// Fraction of regulation elapsed, [0,1]. Uses the live game clock for smooth
// within-period progress (so the "too early" gate trips *during* period 1, and
// every sport behaves like MLB/tennis — an honest "Too Early" at the start
// rather than a misleading low badge). Falls back to a coarse period-midpoint
// estimate when there's no usable clock (MLB innings, or missing data).
function gameProgress(game: any, sport: Sport, regulationPeriods: number, state: string): number {
  if (state === "post") return 1;
  const clamp = (x: number) => Math.max(0, Math.min(1, x));
  const period = game.status?.period ?? 0;
  const clock = typeof game.status?.clock === "number" ? game.status.clock : null;
  const coarse = clamp((period - 1 + 0.5) / regulationPeriods);

  // Soccer: clock counts up as total elapsed match seconds.
  if (SOCCER_SPORTS.has(sport)) {
    return clock && clock > 0 ? clamp(clock / FULL_MATCH_SECONDS) : coarse;
  }
  // Count-down timed sports: clock = seconds left in the current period.
  const periodLen = PERIOD_SECONDS[sport];
  if (periodLen && period >= 1 && clock !== null) {
    const periodFraction = clamp(1 - clock / periodLen);
    return clamp((period - 1 + periodFraction) / regulationPeriods);
  }
  // MLB (no clock) and any gap: coarse midpoint of the current period.
  return coarse;
}

// Minimal shape of an ESPN competitor's per-period linescores — the only field
// the margin helpers below read off the raw scoreboard payload.
type LineScore = { value?: number };
type MarginCompetitor = { linescores?: LineScore[] };

// Calculate running margin from linescores: average absolute margin across all periods
// Returns null if linescore data is insufficient
function calcRunningMargin(competitors: MarginCompetitor[]): number | null {
  const ls0: LineScore[] = competitors[0].linescores ?? [];
  const ls1: LineScore[] = competitors[1].linescores ?? [];
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
function calcFinalPeriodMargin(competitors: MarginCompetitor[]): number | null {
  const ls0: LineScore[] = competitors[0].linescores ?? [];
  const ls1: LineScore[] = competitors[1].linescores ?? [];
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

// Soccer late-drama bonus. The closeness model can't tell a stoppage-time
// game-winner from a 1st-half one — both read as the same 1-goal final — so a
// 90'+ winner (Panama 0-0 Ghana → 1-0 at 90'+5') wrongly landed MEH. ESPN's
// scoreboard carries goal-by-goal timing in competition.details (scoringPlay +
// clock like "90'+5'"), so reward the LATEST goal that swung the result (broke
// a tie, flipped the lead, or equalized), scaled by how late it fell. Returns 0
// when details are absent (e.g. the team-schedule API) or the last swing was
// before ~70'. Minutes fold stoppage time in ("90'+5'" → 95).
function soccerLateDramaBonus(competition: any): number {
  const details: any[] = competition?.details ?? [];
  if (!details.length) return 0;
  const parseMin = (dv: string | undefined): number | null => {
    const m = dv?.match(/(\d+)'?(?:\s*\+\s*(\d+))?/);
    return m ? parseInt(m[1], 10) + (m[2] ? parseInt(m[2], 10) : 0) : null;
  };
  const goals = details
    .filter((d) => d.scoringPlay)
    .map((d) => ({ min: parseMin(d.clock?.displayValue), team: String(d.team?.id ?? "") }))
    .filter((g) => g.min !== null && g.team)
    .sort((a, b) => (a.min as number) - (b.min as number));
  if (!goals.length) return 0;
  // Walk goals chronologically, tracking the leader; capture the minute of the
  // latest goal that CHANGED who's ahead (tie→lead, lead→tie, or a lead flip).
  const tally: Record<string, number> = {};
  const ids = [...new Set(goals.map((g) => g.team))];
  const leaderOf = (): string => {
    if (ids.length < 2) return (tally[ids[0]] ?? 0) > 0 ? ids[0] : "tie";
    const da = (tally[ids[0]] ?? 0) - (tally[ids[1]] ?? 0);
    return da === 0 ? "tie" : da > 0 ? ids[0] : ids[1];
  };
  let prevLeader = "tie";
  let latestSwingMin = -1;
  for (const g of goals) {
    tally[g.team] = (tally[g.team] ?? 0) + 1;
    const leader = leaderOf();
    if (leader !== prevLeader) latestSwingMin = g.min as number;
    prevLeader = leader;
  }
  if (latestSwingMin >= 90) return 25;
  if (latestSwingMin >= 80) return 16;
  if (latestSwingMin >= 70) return 9;
  return 0;
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
  // The team-schedule API returns score as an object ({value, displayValue})
  // rather than a string, so parseInt yields NaN. Bail to null (unrated)
  // instead of computing a garbage rating that mislabels every game "SKIP".
  if (Number.isNaN(score1) || Number.isNaN(score2)) return null;
  const diff = Math.abs(score1 - score2);
  const total = score1 + score2;

  const sport = game._sport as Sport;
  const config = SPORT_RATING_CONFIG[sport] ?? SPORT_RATING_CONFIG.nba;

  // Game progress as a fraction of regulation [0,1] — clock-aware (see
  // gameProgress). OT pushes progress to 1 (uncapped); finished games are 1.
  const progress = gameProgress(game, sport, config.regulationPeriods, state);

  // Insufficient-signal gate (time-based, ~first 12% of the game): a barely-
  // started game has no closeness signal — a 0-0 start scores a perfect 100
  // (zero margin = maximally "close") because the running-margin and final-
  // period factors both fall back to that same 100 with no linescore data.
  // That rockets just-started games to the top of the live cluster and
  // monopolizes the Rated view. Withholding until ~12% elapsed means every
  // sport shows an honest "Too Early" for its opening minutes (1st inning,
  // first ~7 min of an NBA Q1 / NHL P1, first ~10 min of a soccer half)
  // instead of a misleading early badge. Finished games always rate.
  if (state === "in" && progress < 0.12) return null;

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

  // Late-drama bonus for soccer: a result swung late (e.g. a stoppage-time
  // winner) is the most compelling soccer there is, but the closeness factors
  // are blind to goal timing. Lifts a dramatic 1-0 out of the low-scoring
  // penalty's MEH hole while leaving a dull early 1-0 where it is.
  const isSoccer = sport === "epl" || sport === "mls" || sport === "fifa" || sport === "ucl" || sport === "uel";
  const lateDramaBonus = isSoccer ? soccerLateDramaBonus(competition) : 0;

  const raw = Math.max(0, Math.min(100, Math.round(baseScore + overtimeBonus + scoringBonus + comebackBonus + lateDramaBonus - lowScoringPenalty)));

  // Confidence cap: a tied/scoreless game legitimately reads as "close," but
  // early on that closeness carries little signal — it hasn't *held up* yet.
  // Cap the max reachable rating by game progress so an early tie can't hit
  // the top tiers no matter how close: GREAT (~85) only unlocks past ~62%
  // elapsed, GOOD opens up around the midpoint. A blowout already rates low
  // via the closeness factors, so the cap only bites genuinely-close games.
  // Finished games (progress=1) are uncapped → cap = 100.
  const cap = Math.round(60 + 40 * progress);
  return Math.min(raw, cap);
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
    return new Intl.DateTimeFormat("en-CA", { timeZone: getTimeZone(), year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso)).replace(/-/g, "");
  } catch {
    return "";
  }
}

function parseTennisMatch(match: any, event: any, slug: string): Game {
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
  // most compelling, straight sets the least. Same insufficient-signal handling
  // as the team sports — a live match in its 1st set has no signal yet, so it's
  // withheld ("Too Early") and rated by set-level once the 2nd set is underway.
  const hs = Number(homeTeam.score) || 0;
  const as = Number(awayTeam.score) || 0;
  const diff = Math.abs(hs - as);
  const setNow = match.status?.period ?? 0; // current set number
  let rating: number | null = null;
  if (state === "post") {
    if (diff <= 1) rating = 90;             // went the distance (2-1 / 3-2)
    else if (hs + as >= 4 && diff === 2) rating = 78; // long match (3-1)
    else rating = 65;                       // straight sets
  } else if (state === "in" && setNow >= 2) {
    // Rate a live match by how level it is, capped below GREAT — GREAT is
    // reserved for finished deciders. Level (e.g. 1-1) reads best.
    rating = diff === 0 ? 78 : diff === 1 ? 68 : 55;
  }
  // Deciding set: a live match level on sets and into the final set — the
  // win-or-go-home stretch. Best-of-3 (all women's draws) decides at 1-1 in
  // set 3; best-of-5 (men's Slam singles) at 2-2 in set 5. The grouping slug
  // tells us which — ESPN's `format` field is unreliable (reports 5 for both).
  const setsToWin = /women/.test(slug) ? 2 : 3;
  const decidingSet = state === "in" && hs === as && hs === setsToWin - 1;
  // 1st set (or pre) → rating stays null (Too Early / unrated)
  // Gather broadcasts — tennis nests these on the match (competition) object
  // with the same broadcasts[].names[] shape as team sports (see parseGame).
  const broadcasts: string[] = [];
  for (const b of match.broadcasts ?? []) {
    for (const bn of b.names ?? []) {
      if (!broadcasts.includes(bn)) broadcasts.push(bn);
    }
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
    broadcasts,
    venue: "",
    highlightUrl: null,
    // Not a playoff "Game N" — repurposed to carry tournament+year into the
    // highlight search so it can't drift to the wrong event (see above).
    seriesNote: tourneyTag || null,
    seriesStatus: null,
    // Tournament round ("Quarterfinal", "Round 4", "Final", …). Surfaced in the
    // italic league-header subtitle (see getPlayoffSubtitle's tennis branch),
    // the same slot golf uses for "Round N of 4" and team sports use for the
    // playoff round. isPlayoff stays false — tennis isn't a playoff "series".
    playoffLabel: match.round?.displayName ?? null,
    isPlayoff: false,
    recapUrl: null,
    rating,
    decidingSet,
    streamUrl: null,
    primeStreamUrl: null,
  };
}

function buildTennisGames(events: any[], date?: string): Game[] {
  // No-date fallback uses the shared service day so tennis matches the rest of
  // the app's notion of "today" (normally `date` is always passed).
  const target = date ?? toYmd(getEtServiceDate());
  const games: Game[] = [];
  for (const event of events) {
    // Grand Slam only. The ATP scoreboard also returns the week's tune-up
    // tournaments — e.g. during Roland Garros the grass-court Boss Open and
    // Libéma Open appear too, with their qualifying matches. Without this gate
    // those non-Slam matches leak into the "French Open" column (Jacob 6/7).
    // All four Slams carry major:true; the tune-ups are major:false.
    if (!event.major) continue;
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
          games.push(parseTennisMatch(match, event, slug));
        } catch {
          // A single malformed match must not blank the whole draw.
        }
      }
    }
  }
  return games;
}

// Spoiler-free cup stage/round for the detail modal. altGameNote is the
// reliable source: "FIFA World Cup, Group H" → "Group H" (the group letter is
// safe — it's the bracket, not the result). For knockouts the last segment is
// the round itself ("…, Round of 16"); if altGameNote lacks one, fall back to a
// small whitelist of season.slug knockout rounds. We deliberately ignore
// competition.notes — for finished cup ties ESPN puts the RESULT there
// ("Paris Saint-Germain win 4-3 on penalties"). Returns null for league play
// so regular-season games show no stage line.
function deriveStage(altGameNote?: string, seasonSlug?: string): string | null {
  const seg = (altGameNote ?? "").split(",").map((s) => s.trim()).filter(Boolean).pop() ?? "";
  if (/^(group [a-l]|round of \d+|quarter-?finals?|semi-?finals?|final|third place(?: match)?|matchday \d+|knockout(?: round)?(?: play-?offs?)?)$/i.test(seg)) {
    return seg;
  }
  const slug = (seasonSlug ?? "").toLowerCase().trim();
  const slugMap: Record<string, string> = {
    "group-stage": "Group Stage",
    "round-of-32": "Round of 32",
    "round-of-16": "Round of 16",
    "quarterfinals": "Quarterfinals",
    "semifinals": "Semifinals",
    "third-place": "Third Place",
    "final": "Final",
  };
  return slugMap[slug] ?? null;
}

// A single ESPN "probables[]" entry — the starting pitcher (MLB) plus their
// season record. Only the fields this helper reads are modeled.
interface ProbableStarter {
  athlete?: { shortName?: string; fullName?: string };
  record?: string;
}

// "Z. Wheeler (5-1, 2.22)" from an ESPN competitor's probables[]. The record
// string already arrives parenthesized; name prefers the short form. Null when
// no probable is listed (most non-MLB sports, or before ESPN posts starters).
function probablePitcher(competitor: { probables?: ProbableStarter[] } | null | undefined): string | null {
  const p = (competitor?.probables ?? [])[0];
  const ath = p?.athlete;
  const name = ath?.shortName || ath?.fullName;
  if (!name) return null;
  const record = (p?.record ?? "").trim();
  return record ? `${name} ${record}` : name;
}

// World Cup 2026 venues whose ROOF covers the field (retractable or fixed
// canopy), so rain can't reach play. ESPN reports indoor=null for all soccer
// venues (unlike MLB, where it correctly flags retractable parks as indoor), so
// we annotate these by name to avoid showing an alarming rain timeline for a
// covered match. Normalized key = lowercased, non-alphanumerics stripped.
const ROOFED_VENUES = new Set([
  "attstadium",            // AT&T Stadium (Arlington) — retractable
  "nrgstadium",            // NRG Stadium (Houston) — retractable
  "mercedesbenzstadium",   // Mercedes-Benz Stadium (Atlanta) — retractable
  "bcplace",               // BC Place (Vancouver) — retractable
  "sofistadium",           // SoFi Stadium (Inglewood) — fixed canopy over field
]);
const normalizeVenue = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

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
  // Drop MLB.TV on nationally-exclusive MLB games. ESPN/FOX/FS1/TBS/Apple/Roku
  // black out the out-of-market MLB.TV stream, but ESPN's feed still tags MLB.TV
  // on every game — so listing it here just hands the user a "not available"
  // wall. When a national carrier is present, MLB.TV won't work, so strip it.
  // Only this case is safe to filter: in-market RSN blackouts depend on the
  // viewer's location, which we don't know. RSN entries are left as-is.
  if (sport === "mlb" && broadcasts.some((b) => /\b(espn|fox|fs1|tbs|apple tv|roku|amazon|prime|peacock)\b/i.test(b))) {
    for (let i = broadcasts.length - 1; i >= 0; i--) {
      if (/^mlb\.?tv$/i.test(broadcasts[i].trim())) broadcasts.splice(i, 1);
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

  // Venue location + indoor flag (the address object sits next to fullName).
  // ESPN's address.city is usually "City"/"City, State"; state/country round it
  // out. Guard against the occasional junk where city echoes the venue name.
  const venueObj = competition?.venue ?? {};
  const venueName: string = venueObj.fullName ?? "";
  const addr = venueObj.address ?? {};
  let venueLocation = "";
  {
    const city: string = (addr.city ?? "").trim();
    const state: string = (addr.state ?? "").trim();
    const country: string = (addr.country ?? "").trim();
    // Prefer state; fall back to country but only when it's foreign — the
    // audience is US, so a domestic ", USA" is noise while ", Mexico" /
    // ", Canada" on a World Cup venue is the useful bit.
    const region = state || (country && !/^(usa|united states)$/i.test(country) ? country : "");
    if (city && city !== venueName) {
      venueLocation = region && !city.includes(region) ? `${city}, ${region}` : city;
    }
  }
  // "indoor" = fully enclosed dome (ESPN's flag — also true for MLB retractable
  // parks); "roof" = a roofed WC venue ESPN leaves unflagged; null = open-air.
  // Either covered value means weather/rain doesn't reach play.
  const venueRoof: "indoor" | "roof" | null =
    venueObj.indoor === true ? "indoor" : ROOFED_VENUES.has(normalizeVenue(venueName)) ? "roof" : null;

  // MLB probable starters (other sports don't carry them; gate to keep it cheap
  // + intentional). Spoiler-safe pre-game info — the modal only shows them for
  // upcoming games.
  const homeProbable = sport === "mlb" ? probablePitcher(home) : null;
  const awayProbable = sport === "mlb" ? probablePitcher(away) : null;

  const stage = deriveStage(competition?.altGameNote, event.season?.slug);

  // Penalty shootout: a soccer knockout decided (or being decided) by spot
  // kicks — level after extra time, the pure tune-in moment. ESPN tags it via a
  // STATUS_*_PEN status name and a per-competitor `shootoutScore` that populates
  // live as kicks are taken. Reveals only that it went to penalties (a draw
  // through ET), never the winner; the card gates it behind the ratings toggle.
  const shootoutStatus = event.status?.type?.name ?? "";
  const penaltyShootout =
    SOCCER_SPORTS.has(sport) &&
    (event.status?.type?.state ?? "pre") !== "pre" &&
    ((home?.shootoutScore != null && home.shootoutScore !== "") ||
      (away?.shootoutScore != null && away.shootoutScore !== "") ||
      /SHOOTOUT|_PEN\b|FINAL_PEN/i.test(shootoutStatus));

  return {
    id: event.id,
    sport,
    penaltyShootout,
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
    venue: venueName,
    venueLocation,
    venueRoof,
    homeProbable,
    awayProbable,
    stage,
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
    primeAsinsPromise = (async () => {
      const res = await fetchTimed(`${getApiBase()}/prime-asins.json`);
      const data = res?.ok ? await res.json().catch(() => null) : null;
      // On a miss (timeout/network/parse), clear the cache so the next
      // fetchGames retries rather than caching the empty result for the whole
      // page lifetime — a single transient stall shouldn't permanently drop
      // Prime deep-links for the session.
      if (!data) primeAsinsPromise = null;
      return (data?.matchups ?? {}) as Record<string, string>;
    })();
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
    espnAiringsPromise = (async () => {
      const res = await fetchTimed(`${getApiBase()}/espn-airings.json`);
      const data = res?.ok ? await res.json().catch(() => null) : null;
      // Clear the cache on a miss so a later load retries (see loadPrimeAsins).
      if (!data) espnAiringsPromise = null;
      return {
        airings: data?.airings ?? {},
        nbaGameIds: data?.nbaGameIds ?? {},
      };
    })();
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
// The MLB.TV featured-rail slug encodes the day's start time, e.g.
// "8-00pm-et-today-mlb-big-inning-212882" → "8:00 PM". Returns null unless the
// slug is a same-day ("-et-today") item with a leading time, in which case it
// is the authoritative start time (see loadBigInningSchedule).
function parseRailSlugTime(slug: string): string | null {
  const m = slug.match(/^(\d{1,2})-(\d{2})(am|pm)-et-today/i);
  if (!m) return null;
  return `${parseInt(m[1], 10)}:${m[2]} ${m[3].toUpperCase()}`;
}

let bigInningPromise: Promise<BigInningSchedule> | null = null;
export function loadBigInningSchedule(): Promise<BigInningSchedule> {
  if (!bigInningPromise) {
    bigInningPromise = (async () => {
      // The static schedule (per-night start times) and the "Featured on MLB.TV"
      // rail (per-night selection slug) are independent — fetch in parallel and
      // merge. Rail failures fall through to the /network/live href.
      const [scheduleRes, railRes] = await Promise.allSettled([
        fetchTimed(`${getApiBase()}/big-inning-schedule.json`).then((r) => (r?.ok ? r.json() : null)),
        fetchTimed(
          "https://dapi.cms.mlbinfra.com/v2/content/en-us/sel-mlbtv-featured-svod-video-list"
        ).then((r) => (r?.ok ? r.json() : null)),
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
          timeZone: getTimeZone(),
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(new Date());
        const selectionUrl = `https://www.mlb.com/tv/shows/selection/${match.slug}`;
        // The rail slug carries the authoritative same-day start time. Prefer it
        // over the scraped schedule: MLB rolls today's row off the upcoming-
        // shows page once it starts airing, so the scraper freezes today's time
        // and never catches a later same-day change (a 9:30 PM scrape stayed put
        // when the show actually moved to 8:00 PM). Backfill the row entirely if
        // the schedule is missing today.
        const slugTime = parseRailSlugTime(match.slug);
        const todayEntry = schedule[isoToday];
        if (todayEntry) {
          todayEntry.selectionUrl = selectionUrl;
          if (slugTime) todayEntry.timeET = slugTime;
        } else if (slugTime) {
          schedule[isoToday] = { timeET: slugTime, selectionUrl };
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

// Single-shot fetch with a hard timeout. A plain fetch() has no timeout — a
// stalled connection (one that opens but whose body never arrives, common on
// flaky cell networks or a transient CDN hiccup) never rejects, so a .catch()
// can't rescue it and any `await` on it hangs forever. Returns null on
// timeout/error rather than throwing, so callers fall back to empty data.
async function fetchTimed(url: string, timeoutMs = 8000): Promise<Response | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { cache: "no-store", signal: controller.signal });
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
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
    // F1/UFC render as event tiles (no Game objects) — these are here only for
    // switch exhaustiveness.
    case "f1": return `https://www.espn.com/f1/`;
    case "ufc": return `https://www.espn.com/mma/`;
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
    case "fifa": return "https://www.foxsports.com/soccer/fifa-world-cup";
    // UCL / UEL: Paramount+ holds US rights through 2030.
    case "ucl": return "https://www.paramountplus.com/shows/uefa-champions-league/";
    case "uel": return "https://www.paramountplus.com/shows/uefa-europa-league/";
    case "tennis": return "https://www.tennischannel.com/";
    case "golf": return "https://www.pgatour.com/live";
    case "f1": return "https://f1tv.formula1.com/";
    case "ufc": return "https://www.espn.com/watch/";
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
  // FIFA World Cup (2026): FOX/FS1 hold US English rights to all 104 matches —
  // route the FOX family to the World Cup hub rather than the generic live page.
  // Telemundo/Peacock (Spanish) keep their own destinations via the rules below.
  if (sport === "fifa" && (b === "fox" || b === "fs1" || b === "fs2")) {
    return "https://www.foxsports.com/soccer/fifa-world-cup";
  }
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
  // Plain "CBS" = the broadcast network → CBS's own live-TV stream. "CBSSN" =
  // CBS Sports Network (the cable channel) → the CBS Sports live page.
  if (b === "cbs") return "https://www.cbs.com/live-tv/";
  if (b === "cbssn") return "https://www.cbssports.com/watch/live";
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

// ---------------------------------------------------------------------------
// MLB Cycle Watch
// A batter hits for the cycle with a single, double, triple, and home run in
// one game. The most watchable moment is the *bid*: a batter sitting on three
// of the four hit types, needing one more — so we surface a spoiler-safe
// "Cycle watch" badge (gated behind the ratings toggle, like the No-Hit Alert)
// to tell you to tune in (the Pete Crow-Armstrong Cubs/Rockies game, Jacob 6/15).
//
// Per-batter hit types live only in the boxscore (the schedule+linescore
// hydrate is team-level), and that payload is ~170 KB/game — far too heavy for
// the 10s score poll. So we cache per gamePk with CYCLE_TTL and refresh in the
// background: the enrich pass reads whatever the cache holds and never blocks
// the score fetch on a boxscore round-trip (a bid surfaces within a poll or two
// of arising). Gated to live games in the 4th inning or later — you can't own
// three different hit types any sooner.
//
// DISABLED for now (Jacob 6/17): the machinery below is kept intact but the
// badge is suppressed and the rating is no longer floored. Flip this to true
// to bring Cycle Watch back.
const CYCLE_WATCH_ENABLED = false;
interface CycleBid {
  side: "away" | "home";
  player: string;
  needs: "single" | "double" | "triple" | "home run";
}
const CYCLE_HIT_TYPES = [
  { key: "singles", label: "single" as const },
  { key: "doubles", label: "double" as const },
  { key: "triples", label: "triple" as const },
  { key: "homeRuns", label: "home run" as const },
];
// Rarity of the hit still needed — a batter chasing a triple is the marquee
// case, so when several are on a bid we surface the rarest chase.
const CYCLE_NEED_RANK: Record<string, number> = { triple: 0, "home run": 1, double: 2, single: 3 };
const cycleCache = new Map<string, { ts: number; bid: CycleBid | null }>();
const cycleInFlight = new Set<string>();
const CYCLE_TTL = 45_000;

function findCycleBid(side: "away" | "home", players: Record<string, unknown>): CycleBid | null {
  let best: CycleBid | null = null;
  for (const p of Object.values(players ?? {})) {
    const b = (p as { stats?: { batting?: Record<string, number> } }).stats?.batting;
    if (!b || !b.atBats) continue;
    const counts: Record<string, number> = {
      singles: (b.hits ?? 0) - (b.doubles ?? 0) - (b.triples ?? 0) - (b.homeRuns ?? 0),
      doubles: b.doubles ?? 0,
      triples: b.triples ?? 0,
      homeRuns: b.homeRuns ?? 0,
    };
    const have = CYCLE_HIT_TYPES.filter((t) => counts[t.key] > 0);
    if (have.length !== 3) continue; // <3 = not close; 4 = already cycled
    const missing = CYCLE_HIT_TYPES.find((t) => counts[t.key] === 0)!;
    const name = (p as { person?: { fullName?: string } }).person?.fullName ?? "A batter";
    const bid: CycleBid = { side, player: name, needs: missing.label };
    if (!best || CYCLE_NEED_RANK[bid.needs] < CYCLE_NEED_RANK[best.needs]) best = bid;
  }
  return best;
}

async function refreshCycleWatch(gamePk: string): Promise<void> {
  if (cycleInFlight.has(gamePk)) return;
  cycleInFlight.add(gamePk);
  try {
    const res = await fetchWithRetry(`https://statsapi.mlb.com/api/v1/game/${gamePk}/boxscore`, 1, 5000);
    if (!res.ok) return;
    const data = await res.json();
    const bids = [
      findCycleBid("away", data.teams?.away?.players ?? {}),
      findCycleBid("home", data.teams?.home?.players ?? {}),
    ].filter((x): x is CycleBid => x !== null);
    bids.sort((a, b) => CYCLE_NEED_RANK[a.needs] - CYCLE_NEED_RANK[b.needs]);
    cycleCache.set(gamePk, { ts: Date.now(), bid: bids[0] ?? null });
  } catch {
    // Non-critical — no badge this round.
  } finally {
    cycleInFlight.delete(gamePk);
  }
}

// Cached cycle bid for a game; kicks off a background boxscore refresh when the
// cache is cold or stale. Returns null until the first boxscore lands.
function getCycleWatch(gamePk: string): CycleBid | null {
  const entry = cycleCache.get(gamePk);
  if (!entry || Date.now() - entry.ts > CYCLE_TTL) void refreshCycleWatch(gamePk);
  return entry?.bid ?? null;
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

// Pull broadcast network names off an ESPN competition (handles the
// names[]/media.shortName/name shapes the racing + mma feeds use).
function eventBroadcasts(comp: any): string[] {
  const out: string[] = [];
  for (const b of comp?.broadcasts ?? []) {
    if (Array.isArray(b?.names)) out.push(...b.names);
    else if (b?.media?.shortName) out.push(b.media.shortName);
    else if (typeof b?.name === "string") out.push(b.name);
  }
  return [...new Set(out.filter(Boolean))];
}

// F1 / UFC single-event fetch → a spoiler-safe LeagueEventCard (no results).
// Tries the viewed date first; if ESPN has no event that day (most days), it
// falls back to the current/next event so an opt-in column always shows the
// upcoming race / fight card rather than going empty.
async function fetchLeagueEvent(sport: "f1" | "ufc", date?: string): Promise<LeagueEventCard | null> {
  const load = async (d?: string) => {
    const url = new URL(BASE_URL + SPORT_PATHS[sport]);
    if (d) url.searchParams.set("dates", d);
    try {
      const res = await fetchWithRetry(url.toString());
      if (!res.ok) return null;
      const data = await res.json();
      return data.events?.[0] ?? null;
    } catch {
      return null;
    }
  };

  const event = (date ? await load(date) : null) ?? await load();
  if (!event) return null;
  const comps: any[] = event.competitions ?? [];
  const eventUrl: string | undefined = event.links?.find((l: any) => l?.href)?.href;

  if (sport === "f1") {
    // The race is competition.type.id === "3"; fall back to the last session.
    const race = comps.find((c) => String(c?.type?.id) === "3") ?? comps[comps.length - 1] ?? null;
    const state = (race?.status?.type?.state ?? event.status?.type?.state ?? "pre") as "pre" | "in" | "post";
    const circuit = event.circuit ?? {};
    const loc = [circuit.address?.city, circuit.address?.country].filter(Boolean).join(", ");
    const subtitle = [circuit.fullName, loc].filter(Boolean).join(" · ") || undefined;
    const raceDate = race?.date ?? event.date;
    const year = new Date(raceDate).getFullYear() || new Date().getFullYear();
    const cleanName = (event.shortName || event.name || "Grand Prix").replace(/\bGP\b/i, "Grand Prix");
    return {
      kind: "f1",
      title: event.name || event.shortName || "Grand Prix",
      subtitle,
      state,
      statusDetail: state === "post" ? "Final" : state === "in" ? "Live" : "Race",
      date: raceDate,
      broadcasts: eventBroadcasts(race),
      highlightQuery: `Formula 1 ${year} ${cleanName} race highlights`,
      officialChannel: "FORMULA 1",
      eventUrl,
    };
  }

  // UFC — every bout becomes its own card. ESPN orders the competitions
  // prelims-first, so REVERSE to put the main event on top. The marquee fight
  // also lives in the event name ("UFC 312: Jones vs. Aspinall") → split on ":"
  // for the series title vs the headline.
  const main = comps[comps.length - 1] ?? comps[0] ?? null; // main event = last comp
  const state = (event.status?.type?.state ?? main?.status?.type?.state ?? "pre") as "pre" | "in" | "post";
  const name = String(event.name || event.shortName || "UFC");
  const colon = name.indexOf(":");
  const headline = colon > -1 ? name.slice(colon + 1).trim() : undefined;
  const title = event.shortName || (colon > -1 ? name.slice(0, colon).trim() : name) || "UFC";
  const venue = main?.venue ?? event.venue ?? {};
  const subtitle = [venue.address?.city, venue.address?.state || venue.address?.country].filter(Boolean).join(", ") || undefined;
  const fighter = (x: any) => ({
    name: x?.athlete?.displayName ?? "TBD",
    shortName: x?.athlete?.shortName ?? x?.athlete?.displayName ?? "TBD",
    record: x?.records?.[0]?.summary ?? "",
    flag: x?.athlete?.flag?.href as string | undefined,
    country: x?.athlete?.flag?.alt as string | undefined,
  });
  const fmtFightTime = (iso?: string) => {
    if (!iso) return "Fight Night";
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "Fight Night";
    return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  };
  const fights: FightBout[] = comps.slice().reverse().map((c: any) => {
    const cs = c.competitors ?? [];
    const fState = (c.status?.type?.state ?? state ?? "pre") as "pre" | "in" | "post";
    const red = fighter(cs[0]);
    const blue = fighter(cs[1]);
    return {
      id: String(c.id),
      weightClass: c.type?.text || c.type?.abbreviation || "",
      state: fState,
      statusDetail: fState === "post" ? "Final" : fState === "in" ? "Live" : fmtFightTime(c.date || event.date),
      date: c.date || event.date,
      red,
      blue,
      highlightQuery: `${red.name} vs ${blue.name} UFC highlights`,
    };
  });
  return {
    kind: "ufc",
    title,
    subtitle,
    headline,
    state,
    statusDetail: state === "post" ? "Final" : state === "in" ? "Live" : "Fight Night",
    date: event.date || main?.date,
    broadcasts: eventBroadcasts(main),
    boutCount: comps.length,
    fights,
    highlightQuery: `${name} highlights`,
    officialChannel: "UFC",
    eventUrl,
  };
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
    // "Rate from Round 1", minus the opening-holes artifact: at the very start
    // of R1 the whole field is bunched at even par, which reads as a maximally-
    // tight leaderboard (→ GREAT) on zero real signal — golf's version of the
    // 0-0 bug. Withhold the rating until the field is past the opening holes
    // (any round completed, or a top player ≥6 holes into R1). After that, a
    // genuinely tight leaderboard rates normally.
    const parseThru = (t: string): number => (t === "F" ? 18 : parseInt(t, 10) || 0);
    const topPlayers = players.slice(0, 10);
    const anyRoundDone = topPlayers.some(p => p.rounds.length > 0);
    const deepestThru = Math.max(0, ...topPlayers.filter(p => p.rounds.length === 0).map(p => parseThru(p.thru)));
    // Past the opening holes — compute the real leaderboard-tightness rating.
    // While still in the opening holes, rating stays null (no badge shown).
    if (anyRoundDone || deepestThru >= 6) {
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
  // allDays: every upcoming fixture in the window. maxDays: every fixture from
  // the first N distinct ET match-days. Default (neither): the earliest day only.
  opts?: { allDays?: boolean; maxDays?: number },
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
      return new Intl.DateTimeFormat("en-CA", { timeZone: getTimeZone(), year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso)).replace(/-/g, "");
    } catch {
      return "";
    }
  };
  const chrono = (gs: Game[]) => [...gs].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const leadDay = (gs: Game[]) => { let f = ""; for (const g of gs) { const d = dayOf(g.date); if (d && (!f || d < f)) f = d; } return f; };
  // allDays: every upcoming fixture in the window, chronological. Used for
  // NBA/NHL in the playoffs. We want exactly ONE series — the most imminent —
  // so a column never interleaves two simultaneous series (both conference
  // finals run at once). Group by the unordered team pair, keep the series whose
  // next game is soonest, and return just those games, capped at the best-of-7
  // length. In the actual Finals there's only one pair so this is a no-op there;
  // it's the conference round that would otherwise jumble two series (Jacob 6/5).
  if (opts?.allDays) {
    const sorted = chrono(games);
    const seriesKey = (g: Game) => [g.homeTeam.abbreviation, g.awayTeam.abbreviation].sort().join("|");
    const bySeries = new Map<string, Game[]>();
    for (const g of sorted) {
      const k = seriesKey(g);
      (bySeries.get(k) ?? bySeries.set(k, []).get(k)!).push(g);
    }
    // `sorted` is chronological, so the first game belongs to the most imminent
    // series — keep only that pair's games (a series is best-of-7, so ≤7).
    const series = bySeries.get(seriesKey(sorted[0]))!;
    const first = leadDay(series);
    if (!first) return null;
    return { date: first, games: series.slice(0, 7) };
  }
  // maxDays: every fixture from the first N distinct ET match-days. The World
  // Cup runs a few matches per day with multi-day gaps (and a pre-tournament
  // gap now), so "next 3 days" = the next 3 days that actually HAVE matches.
  if (opts?.maxDays) {
    const byDay = new Map<string, Game[]>();
    for (const g of games) {
      const d = dayOf(g.date);
      if (!d) continue;
      (byDay.get(d) ?? byDay.set(d, []).get(d)!).push(g);
    }
    const days = [...byDay.keys()].sort().slice(0, opts.maxDays);
    if (!days.length) return null;
    const picked = chrono(days.flatMap((d) => byDay.get(d)!));
    return { date: days[0], games: picked };
  }
  let earliest = "";
  for (const g of games) {
    const d = dayOf(g.date);
    if (d && (!earliest || d < earliest)) earliest = d;
  }
  if (!earliest) return null;
  return { date: earliest, games: games.filter((g) => dayOf(g.date) === earliest) };
}

// Backward mirror of fetchNextGameDayRange: the most recent PAST day with
// FINISHED games, in a single ranged request. Used to fill an empty past-date
// column ("Yesterday" with no game) with the last game played instead of "No
// games". Returns null when nothing finished in the window (e.g. the World Cup
// before kickoff), so those columns correctly stay "No games".
async function fetchPreviousGameDayRange(
  sport: Sport,
  fromDate?: string,
  windowDays = 14,
): Promise<{ date: string; games: Game[] } | null> {
  const base = fromDate
    ? new Date(`${fromDate.slice(0, 4)}-${fromDate.slice(4, 6)}-${fromDate.slice(6, 8)}T12:00:00`)
    : new Date();
  const ymd = (d: Date) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const end = new Date(base); end.setDate(end.getDate() - 1);            // the day BEFORE the viewed date
  const start = new Date(base); start.setDate(start.getDate() - windowDays);
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
  const games = eventsToGames(events, sport).filter((g) => g.state === "post");
  if (!games.length) return null;
  const dayOf = (iso: string) => {
    try {
      return new Intl.DateTimeFormat("en-CA", { timeZone: getTimeZone(), year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso)).replace(/-/g, "");
    } catch {
      return "";
    }
  };
  // Most RECENT day with finished games — the "last game day".
  let latest = "";
  for (const g of games) {
    const d = dayOf(g.date);
    if (d && (!latest || d > latest)) latest = d;
  }
  if (!latest) return null;
  return { date: latest, games: games.filter((g) => dayOf(g.date) === latest) };
}

export async function fetchGames(
  sport: Sport,
  date?: string
): Promise<{ games: Game[]; failed: boolean }> {
  const url = new URL(BASE_URL + SPORT_PATHS[sport]);
  // Soccer fixtures can kick off in the local midnight hour (a western-US World
  // Cup night game is 12 AM ET). ESPN buckets those under their raw calendar
  // day, but etSlateYmd counts them as the PREVIOUS day's slate so they line up
  // with the date nav's 1 AM rollover. To reconcile, fetch a 2-day window
  // [date, date+1] and keep only fixtures whose slate day is the viewed date —
  // this pulls a midnight kickoff back onto yesterday and off today (Jacob 6/17).
  const reconcileSoccerDay = !!date && SOCCER_SPORTS.has(sport);
  if (date) {
    url.searchParams.set("dates", reconcileSoccerDay ? `${date}-${nextYmd(date)}` : date);
  }

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

  let games: Game[] = eventsToGames(events, sport);
  // Drop the adjacent-day fixtures the 2-day soccer window pulled in, keeping
  // only the ones whose slate day is the viewed date.
  if (reconcileSoccerDay && date) {
    games = games.filter((g) => etSlateYmd(g.date) === date);
  }

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
      // Cycle watch: a live batter sitting on three of the four hit types,
      // needing the fourth. Boxscore-backed (cached + background-refreshed via
      // getCycleWatch) so it never blocks the score fetch. Floor the rating at
      // 75 (GOOD) — enough to nudge the chase up the live cluster without
      // claiming GREAT, since a cycle rarely completes; gated to the 4th+ inning.
      if (CYCLE_WATCH_ENABLED && meta.isLive && game.state === "in" && (meta.currentInning ?? 0) >= 4) {
        const bid = getCycleWatch(meta.gamePk);
        if (bid) {
          game.cycleWatch = {
            team: bid.side === "home" ? game.homeTeam.abbreviation : game.awayTeam.abbreviation,
            player: bid.player,
            needs: bid.needs,
          };
          game.rating = Math.max(75, game.rating ?? 0);
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

// Reconcile team-schedule ratings with the dated/live-final view.
//
// The team-schedule endpoint (fetchTeamSchedule) returns only the final score —
// no per-period linescores. calculateRating therefore sees nothing but the final
// margin: the running-margin (35%), close-entering-final-period (20%), and
// comeback factors all silently collapse onto that one number, so the SAME
// finished game can land a full tier off (e.g. GREAT vs MEH) from the rating it
// shows on its actual date or at final. This backfills the correct, linescore-
// aware rating by re-reading each game's day from the scoreboard endpoint (which
// DOES carry linescores) and running the identical parseGame -> calculateRating
// path the dated view uses — so the Schedule view and the dated/live-final view
// agree by construction.
//
// Cheap and best-effort: games are grouped by ET calendar day so one request
// covers a doubleheader, the warm per-date localStorage cache short-circuits the
// network, requests are concurrency-capped, and any day that fails to fetch
// simply leaves those games' ratings untouched. Returns id -> rating for every
// requested game we could resolve (callers diff against the game's own rating).
export async function fetchScheduleRatings(
  sport: Sport,
  games: Array<{ id: string; date: string }>,
): Promise<Map<string, number | null>> {
  const result = new Map<string, number | null>();
  // Tennis/golf rate off bespoke (non-linescore) signals and have no per-team
  // schedule view — there's nothing to reconcile.
  if (sport === "tennis" || sport === "golf") return result;

  // ESPN buckets a game under its START day in ET; the cache + dated view key on
  // the same YYYYMMDD, so this both matches ESPN and reuses any warm cache.
  const etDay = (iso: string): string | null => {
    try {
      return new Intl.DateTimeFormat("en-CA", {
        timeZone: getTimeZone(),
        year: "numeric", month: "2-digit", day: "2-digit",
      }).format(new Date(iso)).replace(/-/g, "");
    } catch {
      return null;
    }
  };

  const idsByDay = new Map<string, string[]>();
  for (const g of games) {
    const day = etDay(g.date);
    if (!day) continue;
    const arr = idsByDay.get(day) ?? [];
    arr.push(g.id);
    idsByDay.set(day, arr);
  }
  if (!idsByDay.size) return result;

  // One scoreboard request per distinct day. eventsToGames runs the same
  // parseGame -> calculateRating path as the dated view, so the linescore-aware
  // rating is identical by construction.
  //
  // The warm per-date cache is only trusted when every game we need from it is
  // FINAL: fetchGames writes that cache with whatever it last fetched, so a date
  // viewed while a game was in progress holds that game's provisional, progress-
  // capped rating (or an MLB no-hit/perfect-game override) — freezing that onto
  // the now-finished schedule card would display the exact mis-tiering this
  // backfill exists to remove. Any non-final or missing id falls through to a
  // fresh scoreboard fetch, which returns the completed box.
  const gamesForDay = async (day: string, wantIds: string[]): Promise<Game[]> => {
    const cached = readScoreboardCache(sport, day);
    if (cached && cached.length) {
      const byId = new Map(cached.map((g) => [g.id, g] as const));
      if (wantIds.every((id) => byId.get(id)?.state === "post")) return cached;
    }
    const url = new URL(BASE_URL + SPORT_PATHS[sport]);
    url.searchParams.set("dates", day);
    try {
      const res = await fetchWithRetry(url.toString());
      if (!res.ok) return [];
      const data: { events?: unknown[] } | null = await res.json();
      return eventsToGames(data?.events ?? [], sport);
    } catch {
      return [];
    }
  };

  const days = [...idsByDay.keys()];
  const CONCURRENCY = 6;
  for (let i = 0; i < days.length; i += CONCURRENCY) {
    await Promise.all(
      days.slice(i, i + CONCURRENCY).map(async (day) => {
        const wantIds = idsByDay.get(day) ?? [];
        const dayGames = await gamesForDay(day, wantIds);
        const byId = new Map(dayGames.map((g) => [g.id, g] as const));
        for (const id of wantIds) {
          const match = byId.get(id);
          // Only adopt a FINAL game's rating. If the fresh fetch still shows the
          // game live (e.g. a late game ESPN hasn't closed yet, or a suspended
          // game), leave the schedule card's own rating rather than swapping in
          // a provisional one — keeps live and final ratings from disagreeing.
          if (match && match.state === "post") result.set(id, match.rating);
        }
      })
    );
  }
  return result;
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
    case "ucl":
    case "uel":
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
  slotOverrides?: { first?: Sport | "empty"; second?: Sport | "empty"; third?: Sport | "empty"; fourth?: Sport | "empty"; fifth?: Sport | "empty" },
  // 3 on phones/laptops, 5 on wide viewports (the caller measures). Slots 4-5
  // exist only in the 5-column board; their prefs are ignored at count 3.
  slotCount: number = MAX_LEAGUES,
): Promise<LeagueData[]> {
  // Parse viewed date so league visibility matches the day being viewed, not today
  const viewDate = date
    ? new Date(`${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}T12:00:00`)
    : new Date();
  // Today in ET as YYYYMMDD, so the "next game day" lookahead only fires on
  // today/future tabs — on a PAST tab (e.g. Yesterday) a league with no game
  // should read "No games", not surface a future game (Jacob 5/29). MUST use
  // the same shifted service-day as the date-nav UI (getNowET) — see etDay.ts:
  // a plain ET calendar day here would, between midnight and 1 AM ET, mark the
  // UI's "today" as past, skip the lookahead, and yield "Upcoming Schedule TBD".
  const todayYmd = toYmd(getEtServiceDate());
  const isPastView = !!date && date < todayYmd;

  // Resolved slot order from the layout rules. The first three follow
  // [left, center, right] order — see the "FULL YEAR SCHEDULE" comment up top;
  // slots 4-5 (wide viewports) fill from the remaining pool by priority.
  const auto = pickAndAssignLeagues(viewDate, slotCount);

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
  const slot4Cfg = resolveSlot(slotOverrides?.fourth);
  const slot5Cfg = resolveSlot(slotOverrides?.fifth);

  let final: LeagueConfig[];
  if (slot1Cfg || slot2Cfg || slot4Cfg || slot5Cfg || (slotOverrides?.third && slot3Cfg)) {
    // Any per-slot override → user is in full manual control. Build slot-by-slot:
    // each set slot uses its override; each unset slot falls back to its position
    // default in auto.
    // Auto = the slot's position default, always (each unset slot falls back to
    // its position default in auto). This can transiently put a league in two
    // slots — e.g. World Cup pinned to the left column while the center slot's
    // auto default is ALSO World Cup — which rendered two identical "World Cup"
    // columns (Jacob 6/15). The dedupe-by-sport pass below removes that, so a
    // league never appears in more than one column.
    const nextAutoForSlot = (slotIdx: number): LeagueConfig | null => auto[slotIdx] ?? null;
    // Each slot resolves to one of: explicit league (incl. "empty" → skip),
    // unset (null) → fall back to that slot's auto pick.
    const resolveFinal = (cfg: LeagueConfig | "empty" | null, slotIdx: number): LeagueConfig | null =>
      cfg === "empty" ? null : (cfg ?? nextAutoForSlot(slotIdx));
    const slots: (LeagueConfig | null)[] = [slot1Cfg, slot2Cfg, slot3Cfg, slot4Cfg, slot5Cfg]
      .slice(0, slotCount)
      .map((cfg, slotIdx) => resolveFinal(cfg, slotIdx));
    // Drop both empty slots and any null auto-fallback misses.
    final = slots.filter((cfg): cfg is LeagueConfig => cfg !== null);
  } else if (slot3Cfg && slot3Cfg !== "empty" && !auto.some((l) => l.sport === slot3Cfg.sport && l.label === slot3Cfg.label)) {
    // Legacy slot-3 swap path: replace the rightmost auto slot with the chosen league.
    final = [...auto.slice(0, MAX_LEAGUES - 1), slot3Cfg];
  } else {
    final = auto;
  }

  // Never render the same league in two columns. The date nav is global, so two
  // columns of the same league show identical games — always redundant. A league
  // pinned to a non-default slot can collide with another slot's auto default
  // (World Cup pinned left + center auto-defaulting to World Cup → two "World
  // Cup" columns, Jacob 6/15). Dedupe by sport keeping the first (left-most)
  // occurrence, so the pinned position wins and the board shrinks to the
  // distinct leagues. Then BACKFILL each freed slot with the next distinct
  // active league (by priority) so removing the duplicate doesn't shrink the
  // board — the user keeps a full set of columns, just without the repeat
  // (Jacob 6/15 #2: a deduped board collapsed to one column → "should show all").
  const targetCount = final.length;
  const seenSport = new Set<Sport>();
  final = final.filter((cfg) => {
    if (seenSport.has(cfg.sport)) return false;
    seenSport.add(cfg.sport);
    return true;
  });
  if (final.length < targetCount) {
    const backfill = pickAndAssignLeagues(viewDate, MAX_LEAGUES).filter(
      (l) => !seenSport.has(l.sport),
    );
    for (const l of backfill) {
      if (final.length >= targetCount) break;
      seenSport.add(l.sport);
      final.push(l);
    }
  }

  const fetchLeague = async (cfg: LeagueConfig): Promise<LeagueData | null> => {
    const label = effectiveLeagueLabel(cfg, viewDate);
    if (cfg.sport === "golf") {
      const golfTournament = await fetchGolfTournament(date);
      if (!golfTournament) return null;
      return { sport: cfg.sport, label, games: [], golfTournament };
    }
    if (cfg.sport === "f1" || cfg.sport === "ufc") {
      const eventCard = await fetchLeagueEvent(cfg.sport, date);
      if (!eventCard) return null;
      return { sport: cfg.sport, label, games: [], eventCard };
    }
    const { games, failed } = await fetchGames(cfg.sport, date);
    // Standings rank (#N next to the team name). Kicked off here so it overlaps
    // with the lookahead/lookback fetches below; stamped onto every team once
    // all the game lists are assembled, just before returning.
    const ranksPromise = RANK_LEAGUES.has(cfg.sport) ? fetchStandingsRanks(cfg.sport) : null;
    if (cfg.sport === "nhl" && date) await enrichNhlVideos(games, date);
    let nextGameDay: { date: string; games: Game[] } | null = null;
    // Only surface the "next game day" fallback when ESPN genuinely returned
    // an empty schedule. On a fetch failure games is also [] — falling back
    // there would render tomorrow's slate labeled "Tomorrow" on the Today
    // tab, which reads as a bug. A failed league carries fetchFailed instead.
    // NBA/NHL in the playoffs surface their upcoming slate even when there ARE
    // games today, so the column shows TODAY'S games AND what's coming
    // (Jacob 6/4). Every other league — including the World Cup (Jacob 6/19) —
    // only falls back to the lookahead when today's slate is empty, so games
    // stay on their real days instead of stacking tomorrow's slate under today.
    const isPlayoffMonth = viewDate.getMonth() === 4 /* May */ || viewDate.getMonth() === 5 /* Jun */;
    const nbaNhlPlayoff = (cfg.sport === "nba" || cfg.sport === "nhl") && isPlayoffMonth;
    const alwaysShowUpcoming = nbaNhlPlayoff;
    if (!failed && !isPastView && (games.length === 0 || alwaysShowUpcoming)) {
      if (cfg.sport === "fifa") {
        // World Cup, empty slate only: surface just the NEXT match day so a
        // rest day (or the pre-tournament gap) shows the upcoming real day
        // instead of a bare "No games" — not several days stacked onto today.
        // 80-day window covers the long pre-kickoff gap; maxDays:1 = one day.
        nextGameDay = await fetchNextGameDayRange(cfg.sport, date, 80, { maxDays: 1 });
      } else if (nbaNhlPlayoff) {
        // NBA/NHL playoffs: only a handful of games remain (Conf Finals →
        // Cup/Finals) — surface EVERY one in a single ranged request, not just
        // the next game day. 30-day window covers a full series from Game 1.
        nextGameDay = await fetchNextGameDayRange(cfg.sport, date, 30, { allDays: true });
      } else {
        // Default (other leagues, empty slate only): the next game day.
        nextGameDay = await fetchNextGameDay(cfg.sport, 7, date);
        // Other soccer leagues take multi-week breaks (intl windows, summer
        // gaps) longer than the day-by-day lookahead. When that finds nothing,
        // widen with a single range query so the column shows the real next
        // match day instead of "Schedule TBD".
        const SOCCER: Sport[] = ["mls", "epl", "ucl", "uel"];
        if (!nextGameDay && SOCCER.includes(cfg.sport)) {
          nextGameDay = await fetchNextGameDayRange(cfg.sport, date);
        }
      }
    }
    // The ranged lookahead starts at date+1, but ESPN's date filter is UTC-ish,
    // so a late-ET game already in today's slate can slip into the window. Drop
    // any upcoming game that's already shown in `games` so it can't render twice.
    if (nextGameDay && games.length) {
      const todayIds = new Set(games.map((g) => g.id));
      const deduped = nextGameDay.games.filter((g) => !todayIds.has(g.id));
      nextGameDay = deduped.length ? { ...nextGameDay, games: deduped } : null;
    }
    // Lookback (mirror of the lookahead, which is suppressed on past tabs):
    // when a PAST tab's slate is empty, surface the last game day so the column
    // shows the most recent game played instead of a bare "No games". WC before
    // kickoff has no finished games → stays null → "No games" (Jacob 6/10).
    let previousGameDay: { date: string; games: Game[] } | null = null;
    if (!failed && isPastView && games.length === 0) {
      previousGameDay = await fetchPreviousGameDayRange(cfg.sport, date);
      // No recent finished games on a past tab → the league likely hasn't
      // started yet (e.g. the World Cup before kickoff). Find the next game so
      // the column can read "Starts {date}" instead of a bare "No games". This
      // is the only case the (otherwise past-suppressed) lookahead fires on a
      // past tab, and it surfaces just a date hint — not a misleading slate.
      if (!previousGameDay && !nextGameDay) {
        nextGameDay = cfg.sport === "fifa"
          ? await fetchNextGameDayRange(cfg.sport, date, 80, { maxDays: 1 })
          : await fetchNextGameDay(cfg.sport, 14, date);
      }
    }
    // Offseason fallback (current view): no games today AND no upcoming game in
    // the whole lookahead window means the season is over (or on a long break).
    // Surface the last game played — score-hidden, with highlights — so the
    // column reads "still here, just quiet" instead of "Upcoming Schedule TBD",
    // which announces the season ended (itself a spoiler). Only fires when there
    // is genuinely nothing ahead, so mid-season off-days (nextGameDay set) are
    // untouched.
    if (!failed && !isPastView && games.length === 0 && !nextGameDay && !previousGameDay) {
      previousGameDay = await fetchPreviousGameDayRange(cfg.sport, date);
    }
    if (ranksPromise) {
      applyTeamRanks(cfg.sport, await ranksPromise, [games, nextGameDay?.games, previousGameDay?.games]);
    }
    return { sport: cfg.sport, label, games, nextGameDay, previousGameDay, fetchFailed: failed };
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

// Team-sport leagues that get a "#N" standings rank on the card. World Cup is
// excluded on purpose: it uses the static FIFA world ranking (fifaRankings.ts),
// since its live group standing would be a spoiler. Golf/tennis/F1/UFC aren't
// team standings and never reach this path.
const RANK_LEAGUES = new Set<Sport>([
  "mlb", "nba", "wnba", "ncaam", "ncaaw", "ncaaf", "nfl", "nhl", "epl", "mls", "ucl", "uel",
]);

// When ESPN groups standings by conference/division (no single league-wide
// rank), we compute an overall rank by sorting every team on the sport's
// primary standings metric, higher = better. Point-table sports use points;
// the rest use win%. Single-table soccer leagues skip this — their own `rank`
// stat is the real position.
const RANK_METRIC: Partial<Record<Sport, "points" | "winPercent">> = {
  nhl: "points", mls: "points",
  nba: "winPercent", wnba: "winPercent", mlb: "winPercent", nfl: "winPercent",
  ncaam: "winPercent", ncaaw: "winPercent", ncaaf: "winPercent",
};

type StandingEntry = {
  team?: { id?: string };
  stats?: Array<{ name?: string; value?: number; displayValue?: string }>;
};

// ESPN standings → { teamId -> overall league rank (1 = best) }. Cached per
// sport. Mirrors fetchStandingsRecords' grouping handling, but resolves a
// single league-wide position: trusts ESPN's `rank` for a single combined
// table, otherwise sorts the whole league on its primary metric.
const standingsRankCache = new Map<Sport, Promise<Map<string, number>>>();
export function fetchStandingsRanks(sport: Sport): Promise<Map<string, number>> {
  const cached = standingsRankCache.get(sport);
  if (cached) return cached;
  const sportPath = SPORT_PATHS[sport].replace(/\/scoreboard$/, "");
  const url = `https://site.web.api.espn.com/apis/v2/sports${sportPath}/standings`;
  const p = (async () => {
    const map = new Map<string, number>();
    try {
      const res = await fetchWithRetry(url, 1, 6000);
      if (!res.ok) return map;
      const data = await res.json();
      const groups = (data.children ?? []) as Array<{ standings?: { entries?: StandingEntry[] } }>;
      const groupLists = groups
        .map((g) => g.standings?.entries ?? [])
        .filter((e) => e.length);
      const flat = (data.standings?.entries ?? []) as StandingEntry[];
      const all = groupLists.length ? groupLists.flat() : flat;
      if (!all.length) return map;

      const statVal = (e: StandingEntry, name: string): number | null => {
        const s = e.stats?.find((x) => x.name === name);
        if (!s) return null;
        const v = s.value ?? (s.displayValue != null ? parseFloat(s.displayValue) : NaN);
        return Number.isFinite(v) ? (v as number) : null;
      };

      // One combined table (most soccer leagues, UCL/UEL league phase): ESPN's
      // `rank` is the real position (with goal-difference tiebreakers baked in).
      const oneTable = groupLists.length <= 1;
      if (oneTable && all.every((e) => statVal(e, "rank") != null)) {
        for (const e of all) {
          const id = e.team?.id;
          const r = statVal(e, "rank");
          if (id && r != null) map.set(id, Math.round(r));
        }
        return map;
      }

      // Conference/division split (or no per-row rank): rank the whole league
      // on its primary metric so "#N" means total-league position, not seed.
      const metric = RANK_METRIC[sport] ?? "winPercent";
      all
        .map((e) => ({ id: e.team?.id, v: statVal(e, metric) }))
        .filter((x): x is { id: string; v: number } => !!x.id && x.v != null)
        .sort((a, b) => b.v - a.v)
        .forEach((x, i) => map.set(x.id, i + 1));
    } catch { /* swallow — ranks just won't show */ }
    return map;
  })();
  standingsRankCache.set(sport, p);
  return p;
}

// Stamp each team's overall standings rank from a precomputed map. team.id is
// `${sport}-${rawId}`; the standings map is keyed by the raw ESPN id.
function applyTeamRanks(
  sport: Sport,
  ranks: Map<string, number>,
  lists: Array<Game[] | undefined | null>,
): void {
  if (!ranks.size) return;
  const apply = (t: Team) => {
    if (!t.id) return;
    const rawId = t.id.startsWith(`${sport}-`) ? t.id.slice(sport.length + 1) : t.id;
    const r = ranks.get(rawId);
    if (r != null) t.rank = r;
  };
  for (const list of lists) for (const g of list ?? []) { apply(g.homeTeam); apply(g.awayTeam); }
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
          // Score: scoreboard uses a string ("4"); schedule returns an object
          // ({ value, displayValue }). Flatten to the string form so parseGame
          // and calculateRating read the final score — otherwise parseInt gives
          // NaN and every finished game rates as "SKIP".
          if (c.score && typeof c.score === "object") {
            c.score = String(c.score.displayValue ?? c.score.value ?? "");
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
  // Standings rank (#N) — same data the dated board hydrates onto each team.
  if (RANK_LEAGUES.has(sport)) {
    applyTeamRanks(sport, await fetchStandingsRanks(sport), [all]);
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
