import { Game, Sport, LeagueData, Team, GolfTournament, GolfPlayer, LeagueEventCard, EventFetchResult, FightBout } from "./types";
import { collegeFootballPollRank } from "./pollRank";
import { rankFromStandings, type StandingsPayload } from "./standingsRank";
import { marginCloseness, FOOTBALL_CLOSENESS, type ClosenessCurve } from "./marginCloseness";
import { parseEspnHeader, rankTopEvents, topEventsSourceSports, TOP_EVENTS_DEFAULT_COUNT, TOP_EVENTS_ENABLED, type EspnHeaderFeature, type TopEventsMode, type TopEventsCount } from "./topEvents";
import { getApiBase } from "./youtube";
import { getEtServiceDate, toYmd, fromYmd, getTimeZone, etSlateYmd, nextYmd } from "./etDay";
import { raceDetailsUrl } from "./raceDetails";
import { fetchPokerEvent } from "./poker";
import { fetchCuratedBoxingEvent } from "./boxing";
import {
  chessEventState,
  boxingChannelFor,
  buildBoxingTokens,
  boxingHighlightQuery,
  indycarTrackSubtitle,
  isStaleFinishedForBoard,
  eventTitleVariants,
  eventSubtitleVariants,
} from "./eventTiles";

// ⚠️ HOST MATTERS. This is `site.web.api.espn.com`, not `site.api.espn.com`.
// Both serve byte-identical /apis/site/v2/sports responses, but as of
// 2026-08-11 site.api rejects the request a BROWSER makes: the rejection
// carries no Access-Control-Allow-Origin, so it surfaces in the console as a
// CORS error and in the UI as "Schedule unavailable" on every column at once.
// It is not a UA rule (a real Chrome UA fails too) and not our IP (reproduced
// from two networks) — curl and undici still get 200 from site.api, which is
// why every scripts/*.mjs checker kept passing while the live site showed no
// games at all. Verified 2026-08-11 by rewriting the host at the network layer
// against production: every column went from "Schedule unavailable" to a full
// slate. If you ever move this back, load /today in a real browser and watch
// the console — the scripts will not tell you.
const BASE_URL = "https://site.web.api.espn.com/apis/site/v2/sports";

// Origin for the worker-served leagues (today: cfl). getApiBase() is "" on the
// web build, so `new URL("" + "/api/cfl")` would throw — fall through to the
// page origin there, and to production for SSR/tests. Capacitor already maps
// to https://hidescore.com inside getApiBase.
function workerOrigin(): string {
  const base = getApiBase();
  if (base) return base;
  if (typeof window !== "undefined" && /^https?:$/.test(window.location.protocol)) return window.location.origin;
  return "https://hidescore.com";
}
// Sports whose scoreboard is a worker route rather than an ESPN path.
const WORKER_SCOREBOARD_SPORTS = new Set<Sport>(["cfl"]);
function scoreboardUrl(sport: Sport): URL {
  return new URL(WORKER_SCOREBOARD_SPORTS.has(sport) ? workerOrigin() + SPORT_PATHS[sport] : BASE_URL + SPORT_PATHS[sport]);
}
// The ESPN standings/teams hosts are keyed off the scoreboard path; the
// worker leagues serve their own equivalents next to the scoreboard route.
function standingsUrl(sport: Sport): string {
  if (WORKER_SCOREBOARD_SPORTS.has(sport)) return `${workerOrigin()}${SPORT_PATHS[sport]}/standings`;
  const sportPath = SPORT_PATHS[sport].replace(/\/scoreboard$/, "");
  return `https://site.web.api.espn.com/apis/v2/sports${sportPath}/standings`;
}

// See EventFetchResult — a feed that broke is not a day with nothing on it.
const EVENT_FETCH_EMPTY: EventFetchResult = { card: null, failed: false };
const EVENT_FETCH_FAILED: EventFetchResult = { card: null, failed: true };

const SPORT_PATHS: Record<Sport, string> = {
  // Chess + boxing have NO ESPN path — they are served by worker routes
  // (/api/chess, /api/boxing). Poker comes from the curated major-events file.
  // The empty string is never fetched: all three are
  // dispatched before fetchGames in fetchLeague. Present only so this stays a
  // total Record<Sport,string>, which is what forces a new sport to be
  // considered here at all.
  chess: "",
  boxing: "",
  poker: "",
  esports: "",
  // Top events has no scoreboard of its own — fetchTopEvents pulls the real
  // leagues' boards. Present only so the Record stays total.
  top: "",
  mlb: "/baseball/mlb/scoreboard",
  // Little League World Series (added 2026-08-11). ESPN files it under
  // baseball/llb and it returns the STANDARD scoreboard shape, so parseGame
  // handles it with no new parser. Probed live 2026-08-11: 200 with a 16-date
  // calendar (Aug 10 → Aug 30) and real two-competitor events. It is one of
  // the most spoiler-sensitive slates of the summer — games run all day on
  // ESPN networks and get replayed in prime time.
  llws: "/baseball/llb/scoreboard",
  // NCAA baseball + softball (added 2026-09-14). Standard two-competitor
  // scoreboard shape, so parseGame reads both as is. Probed live 2026-09-14
  // via site.web.api: 200, abbr CBASE / CSOFT, 2026 calendars 02-13 → 06-22
  // (117 days) and 02-05 → 06-04 (108 days), 81 / 57 games on a mid-April
  // Saturday, curatedRank (Top 25 poll) on the event, team logos under
  // a.espncdn.com/guid/<guid>/ — NOT the ncaa/500/<id> school path (their
  // team ids are sport-specific). Softball plays SEVEN innings.
  ncaabase: "/baseball/college-baseball/scoreboard",
  ncaasoft: "/baseball/college-softball/scoreboard",
  nba: "/basketball/nba/scoreboard",
  wnba: "/basketball/wnba/scoreboard",
  ncaam: "/basketball/mens-college-basketball/scoreboard",
  ncaaw: "/basketball/womens-college-basketball/scoreboard",
  ncaaf: "/football/college-football/scoreboard",
  nfl: "/football/nfl/scoreboard",
  // UFL spring football (added 2026-09-14). Standard two-competitor shape, so
  // parseGame reads it as is. Probed live 2026-09-14: 200, league abbr UFL,
  // calendar is a list (Regular Season 2026-03-14 → 06-03, Postseason → 06-17);
  // actual fixtures 2026-03-27 → 06-13 (43 games, 8 teams), four quarters,
  // records "6-4", curatedRank 99 placeholders (no poll).
  ufl: "/football/ufl/scoreboard",
  nhl: "/hockey/nhl/scoreboard",
  // NCAA men's ice hockey (added 2026-09-12). Standard scoreboard shape, so
  // parseGame reads it as is. Probed live 2026-09-12: 200, league abbr NCAAH,
  // calendar 2026-10-02 → 2027-04-10 (88 game days), ~18-26 games a Saturday,
  // three regulation periods, poll rank on curatedRank. Do NOT add groups=50:
  // it returns 0 events for this sport.
  ncaah: "/hockey/mens-college-hockey/scoreboard",
  // NCAA women's ice hockey (added 2026-09-14). Same two-competitor scoreboard
  // shape as the men's feed. Probed live 2026-09-14: 200, league abbr CWHOC,
  // calendar 2026-09-18 → 2027-03-23 (81 game days), 13-15 games a Saturday,
  // three regulation periods, USCHO poll rank on curatedRank (99 = unranked).
  // No groups= param, same as ncaah.
  ncaawh: "/hockey/womens-college-hockey/scoreboard",
  // NCAA women's volleyball (added 2026-09-14). Standard two-competitor shape,
  // so parseGame reads it as is — but `score` is SETS won (0-3) and
  // linescores[].value is the points per set, so the rating and the live label
  // take a volleyball branch (volleyballRating, liveProgress.ts). Probed live
  // 2026-09-14: 200, calendar 2026-08-21 → 2026-11-29 (regular season only),
  // 159 games on a Saturday, curatedRank = AVCA Top 25, records[0] = overall.
  ncaavb: "/volleyball/womens-college-volleyball/scoreboard",
  // CFL (added 2026-09-13). ESPN stopped serving the CFL after 2023 (its
  // calendar is frozen there and every date returns 0 events), so this is NOT
  // an ESPN path: it is our own worker route (public/_worker.js), which
  // converts theScore's app API into the ESPN scoreboard shape. scoreboardUrl()
  // routes it to the site origin; the missing "/scoreboard" suffix is what
  // keeps check-season-windows and the tvOS catalog from treating it as ESPN.
  cfl: "/api/cfl",
  golf: "/golf/pga/scoreboard",
  tennis: "/tennis/atp/scoreboard",
  fifa: "/soccer/fifa.world/scoreboard",
  epl: "/soccer/eng.1/scoreboard",
  mls: "/soccer/usa.1/scoreboard",
  ucl: "/soccer/uefa.champions/scoreboard",
  uel: "/soccer/uefa.europa/scoreboard",
  // The other four "big five" domestic leagues (added 2026-08-03 on a user
  // request via the footer feedback box). Same ESPN soccer shape as eng.1 —
  // country code + tier.
  laliga: "/soccer/esp.1/scoreboard",
  seriea: "/soccer/ita.1/scoreboard",
  bundesliga: "/soccer/ger.1/scoreboard",
  ligue1: "/soccer/fra.1/scoreboard",
  // Second wave of soccer competitions (added 2026-08-03). Every path below was
  // probed live against site.api.espn.com and returned 200 with a populated
  // `events` array — they are NOT guesses. Same ESPN soccer response shape as
  // eng.1, so they need no new parser, only the config/label plumbing.
  //   mex.1  = Liga MX, the most-watched soccer league in the US
  //   usa.nwsl, eng.2, conmebol.libertadores, caf.nations, ksa.1, uefa.euro
  ligamx: "/soccer/mex.1/scoreboard",
  nwsl: "/soccer/usa.nwsl/scoreboard",
  efl: "/soccer/eng.2/scoreboard",
  libertadores: "/soccer/conmebol.libertadores/scoreboard",
  euro: "/soccer/uefa.euro/scoreboard",
  afcon: "/soccer/caf.nations/scoreboard",
  saudi: "/soccer/ksa.1/scoreboard",
  // UEFA Conference League + three domestic cups (added 2026-09-14). Probed
  // live via site.web.api the same day: 200, standard soccer event shape, so
  // the soccer parsers (up-counting clock, deriveStage, penalty handling) read
  // them as is. ESPN's `calendar` for every one of these is a single
  // year-wide "list" entry, so the windows in ALL_LEAGUES are hand-set from
  // fixture range probes, never from the calendar.
  uecl: "/soccer/uefa.europa.conf/scoreboard",
  facup: "/soccer/eng.fa/scoreboard",
  copadelrey: "/soccer/esp.copa_del_rey/scoreboard",
  dfbpokal: "/soccer/ger.dfb_pokal/scoreboard",
  // Cricket (added 2026-08-03). ESPN's cricket API is keyed by ESPNcricinfo
  // SERIES id, not by a league slug — 8048 is the IPL. Verified 2026-08-03: it
  // returns a full 62-date calendar (03-28 → 05-31) and standard two-competitor
  // events with homeAway/winner/logo, so it rides parseGame like any team sport.
  //
  // Only the IPL ships. The other ids worth knowing, and why they're NOT here:
  //   8039  "World Cup"  — responds 200 but its calendar is [] and its single
  //                        event is all-nulls. A live shell, not usable data.
  //                        Re-check when the 2027 ODI World Cup approaches.
  //   19430 ICC World Test Championship — real, but Test cricket is a five-DAY
  //                        match, which the one-row-per-day slate model cannot
  //                        represent without a dedicated multi-day card.
  //   8044  Big Bash League — real (Dec–Jan), but a small US audience.
  // Adding any of them ungated would park a permanently empty column in the
  // switcher, which is exactly the failure the big-five block warns about.
  cricket: "/cricket/8048/scoreboard",
  // Rugby union (added 2026-08-11). ESPN keys rugby by LEAGUE ID, not by a
  // slug — there is no `/sports/rugby/scoreboard` (404), the id is mandatory.
  // Each competition therefore needs its own Sport key, exactly like the
  // soccer block above; they cannot share one path the way the four golf
  // majors share /golf/pga. Every id below was probed live on 2026-08-11 and
  // returned 200 with the standard `competitions[].competitors[]` shape
  // (homeAway/score, status.type.state, venue, highlights), so parseGame
  // handles all five unchanged.
  //   180659 Six Nations                  (cal 02-05 → 03-14)
  //   164205 Rugby World Cup              (cal 10-01 → 11-13, next 2027)
  //   271937 European Champions Cup       (cal 12-05 → 05-23)
  //   242041 Super Rugby Pacific          (cal 02-13 → 06-20)
  //   289234 International Test Match     (cal 04-03 → 11-13)
  //   17567  Nations Championship         (cal 07-04 → 11-29, added 2026-08-12)
  // Deliberately NOT shipped: French Top 14 (270559) — real and verified, but
  // a 10-month domestic window for the smallest US audience of the six. Its id
  // is recorded here so nobody re-probes for it.
  //
  // ⚠️ The Nations Championship path segment is 17567, NOT the league's own id
  // (24400). ESPN's `/v2/sports/rugby/leagues` returns BOTH per league and the
  // scoreboard route keys on `slug`, which for every rugby competition is the
  // numeric path id — 24400 404s. Same shape for the other five (Six Nations is
  // id 8323, path 180659), which is why every line here is a path, not an id.
  //
  // ⚠️ The Nations Championship is not an ADDITIONAL competition — in 2026 it
  // REPLACED the July/November international windows. `The Rugby Championship`
  // (path 244293) is stuck on its 2025 season for exactly that reason, and
  // `rugbytest` (289234) returns ZERO events for every 2026 date checked on
  // 2026-08-12, so there is no duplicate-fixture overlap between the two
  // columns. Do not "fix" rugbytest's empty column by pointing it here — as of
  // 2026-08-13 there IS no empty column: rugbytest is yearCycle-gated to odd
  // years and nationschamp to even ones, so exactly one of the two is live in
  // any given year. See their ALL_LEAGUES entries.
  sixnations: "/rugby/180659/scoreboard",
  rugbywc: "/rugby/164205/scoreboard",
  rugbychamp: "/rugby/271937/scoreboard",
  superrugby: "/rugby/242041/scoreboard",
  rugbytest: "/rugby/289234/scoreboard",
  nationschamp: "/rugby/17567/scoreboard",
  f1: "/racing/f1/scoreboard",
  // NASCAR Cup + IndyCar (added 2026-08-03). Both share F1's racing shape, so
  // they render through the same single-race event tile. Two differences from
  // F1, handled in fetchLeagueEvent: neither carries a `circuit` object (NASCAR
  // has competition.venue, IndyCar has nothing), and neither tags its sessions
  // with a type.id, so the "find the race session" lookup falls through to the
  // sole competition — which is the race.
  nascar: "/racing/nascar-premier/scoreboard",
  indycar: "/racing/irl/scoreboard",
  ufc: "/mma/ufc/scoreboard",
};

// Sortable epoch-ms for a Game's ISO date, NaN-safe. A Game can carry an empty
// or missing date — a TBD future fixture, or a UFC card that resolved neither
// the event nor the main-card date (see the `|| ""` fallback in the UFC parse)
// — and `new Date("").getTime()` is NaN. A comparator that returns NaN is
// inconsistent, so V8's sort leaves the surrounding order undefined and
// SCATTERS the whole slate, not just the undated game. Coerce an unparseable
// date to a finite far-future sentinel (the max valid timestamp) so those games
// sink to the END of an ascending chronological sort — not jump to the top, the
// same intent as the TeamView undated-game fix — without reintroducing NaN: two
// sentinels subtract to 0, whereas an Infinity sentinel would give
// `Infinity - Infinity === NaN` and re-scatter the very case this guards. Same
// NaN-comparator guard the NewsFeed feed sort and news.ts formatPublished use.
function chronoMs(iso: string): number {
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? 8.64e15 : t;
}

// Seasonal league config: show/hide based on date
// endDate: inclusive last day the league is shown (= its championship date, per
//   isLeagueActive's `mmdd <= endDate`), so the league hides the day after its final game
// startDate: when the sport's season starts
export interface LeagueConfig {
  sport: Sport;
  label: string;
  startDate?: string;        // MM-DD
  endDate?: string;          // MM-DD (last day league is shown)
  championshipDate?: string; // MM-DD — day the championship game is played
  // MM-DD of the season's actual first match, when that is LATER than startDate
  // (startDate can open a few days early so the column carries the fixture
  // lookahead into the build-up). Drives the kickoff banner's copy and its
  // "starts soon" → "is underway" flip. Falls back to startDate when unset.
  kickoffDate?: string;
  // MM-DD from which this league may be AUTO-PICKED into a column, when that is
  // later than startDate. Between startDate and autoStartDate the league is in
  // season and fully selectable — it just doesn't claim a slot on its own.
  // NHL is the case this exists for: the hand-built three-column schedule only
  // surfaces it once the playoffs begin, but a hockey fan should still be able
  // to pick it in November. Without this the only way to make NHL selectable
  // was to widen its window, which would have reshuffled every winter column.
  autoStartDate?: string;
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
  // MM-DD the league drops its full schedule, when that is a real annual event
  // (NFL's May reveal show, the NBA's mid-August drop). Only used by the
  // offseason empty state, and only while the release still falls BEFORE the
  // next opener — once the schedule is out, saying when it dropped is noise.
  scheduleReleaseDate?: string;
  // Calendar year of the opener that was last checked against a real source
  // (league site / ESPN), NOT the year the line was edited. Windows are MM-DD
  // and recur forever, but the real dates drift a few days a year and sometimes
  // move wholesale (see MLS 2027), so anything past its verified year is shown
  // as approximate rather than stated as fact. Bump it when you re-check.
  verifiedFor?: number;
  // NCAAF: hold the pinned slot outright during the College Football Playoff
  // window (firstPref + precedence 0), the way marchMadnessLabel does for NCAAM.
  playoffPin?: boolean;
}

export const ALL_LEAGUES: LeagueConfig[] = [
  // ── Major team sports ──
  { sport: "ncaam", label: "NCAAM", startDate: "11-01", endDate: "04-06", championshipDate: "04-05", verifiedFor: 2026, marchMadnessLabel: true },
  { sport: "nba",   label: "NBA",   startDate: "10-20", endDate: "06-22", kickoffDate: "10-20", championshipDate: "06-20", scheduleReleaseDate: "08-14", verifiedFor: 2026, mustInclude: true, displaySlot: "left",   slotPrecedence: 1 },
  { sport: "mlb",   label: "MLB",   startDate: "03-20", endDate: "11-01", kickoffDate: "03-24", championshipDate: "10-31", scheduleReleaseDate: "07-16", verifiedFor: 2027, mustInclude: true, displaySlot: "left",   slotPrecedence: 2 },
  // NHL runs Sep 29 → mid-June (verified against ESPN 2026-08-09: first
  // 2026-27 regular-season game Tue Sep 29 2026; the 2026 Stanley Cup finished
  // Jun 15). It used to be configured as 04-07 → 06-19 — the PLAYOFF window —
  // because that is where the column schedule puts it. But isLeagueActive gates
  // selectability too, so that also made NHL impossible to pick at all from
  // October to April (Jacob 8/9). Now the window is the real season and
  // autoStartDate keeps the auto-picker's behaviour exactly as it was.
  { sport: "nhl",   label: "NHL",   startDate: "09-27", endDate: "06-24", kickoffDate: "09-29", autoStartDate: "04-07", championshipDate: "06-19", scheduleReleaseDate: "07-16", verifiedFor: 2026, mustInclude: true, displaySlot: "right",  slotPrecedence: 2 },
  // NFL 2026-27 verified against ESPN 2026-08-09: Week 1 opens Thu Sep 10 2026,
  // and Super Bowl LXI is Sun Feb 14 2027. The old 02-09 endDate hid the NFL
  // column five days BEFORE the Super Bowl — the one game of the year a
  // spoiler-free app must not be missing. Old 09-04 start was six days before
  // any regular-season game.
  { sport: "nfl",   label: "NFL",   startDate: "09-07", endDate: "02-16", kickoffDate: "09-09", championshipDate: "02-14", scheduleReleaseDate: "05-14", verifiedFor: 2026, mustInclude: true, displaySlot: "center", slotPrecedence: 1 },
  // NFL Preseason backfills the Jul 21 – Aug 15 thin window where only MLB + MLS are active.
  // Window ends Sep 3 (regular NFL takes over Sep 8) — but EPL kickoff Aug 16 already fills
  // the third slot, so backfillOnly ensures preseason only shows when slot 3 would be empty.
  { sport: "nfl",   label: "NFL Preseason", startDate: "07-21", endDate: "09-03", backfillOnly: true, displaySlot: "center", slotPrecedence: 7 },
  // ── UFL spring football (late Mar – mid Jun) ──
  // Window is ESPN's own fixture list, read live 2026-09-14: first kickoff Fri
  // 2026-03-27 (8pm ET), United Bowl Sat 2026-06-13 on ABC. Opens two days
  // early for the fixture lookahead, like EPL. Opt-in (excludeFromAuto): spring
  // already has the NBA/NHL playoffs + MLB in the auto rotation. 2027 dates are
  // unpublished; the season-window checker reports it unverified until then.
  { sport: "ufl",   label: "UFL", startDate: "03-25", endDate: "06-14", kickoffDate: "03-27", championshipDate: "06-13", verifiedFor: 2026, excludeFromAuto: true },
  // ── Golf majors ──
  // Masters takes the right slot when active (Jacob's pref) — bumps NHL during Apr 9-13.
  { sport: "golf",  label: "Masters",  startDate: "04-06", endDate: "04-13", kickoffDate: "04-08", championshipDate: "04-11", verifiedFor: 2027, firstPref: true, displaySlot: "right",  slotPrecedence: 1 },
  // PGA Champ + French Open never auto-pick (still selectable via slot-3 swap dropdown).
  { sport: "golf",  label: "PGA Champ", startDate: "05-13", endDate: "05-24", kickoffDate: "05-20", championshipDate: "05-23", verifiedFor: 2027, excludeFromAuto: true },
  { sport: "golf",  label: "US Open",   startDate: "06-15", endDate: "06-22", kickoffDate: "06-17", championshipDate: "06-20", verifiedFor: 2027, firstPref: true, displaySlot: "center", slotPrecedence: 5 },
  { sport: "golf",  label: "The Open",  startDate: "07-13", endDate: "07-20", kickoffDate: "07-15", championshipDate: "07-18", verifiedFor: 2027, displaySlot: "center", slotPrecedence: 6 },
  // ── Tennis Grand Slams ──
  { sport: "tennis", label: "Aus Open",     startDate: "01-11", endDate: "02-01", kickoffDate: "01-17", championshipDate: "01-31", verifiedFor: 2027 },
  { sport: "tennis", label: "French Open",  startDate: "05-20", endDate: "06-09", kickoffDate: "05-23", championshipDate: "06-06", verifiedFor: 2027, excludeFromAuto: true },
  { sport: "tennis", label: "Wimbledon",    startDate: "06-26", endDate: "07-14", kickoffDate: "06-28", championshipDate: "07-11", verifiedFor: 2027, firstPref: true, displaySlot: "center", slotPrecedence: 4 },
  { sport: "tennis", label: "US Open",      startDate: "08-24", endDate: "09-15", kickoffDate: "08-29", championshipDate: "09-12", verifiedFor: 2027, firstPref: true, displaySlot: "center", slotPrecedence: 3 },
  // ── FIFA World Cup (every 4 years; 2026 was the most recent anchor) ──
  // startDate opened to 06-04 (tournament opens 06-11) so the column previews
  // live NOW with the opener via the next-game-day lookahead. Revert to 06-11
  // after launch if you don't want it pinned before kickoff. NOTE: pinning the
  // World Cup to center bumps MLB out of the default 3-column layout until
  // NBA/NHL end (06-19).
  { sport: "fifa", label: "World Cup", startDate: "06-04", endDate: "07-19", championshipDate: "07-19", firstPref: true, displaySlot: "center", slotPrecedence: 2, yearCycle: { mod: 4, anchor: 2026 } },
  // ── Premier League (Aug–May) ──
  // 2026-27 dates verified against ESPN's eng.1 scoreboard on 2026-08-08: the
  // World Cup pushed kickoff a week later than a normal year — matchweek 1 is
  // Fri Aug 21 (Coventry at Arsenal) through Mon Aug 24, and the final round is
  // Sun May 30 2027. The old 08-16/05-25 window opened five days before any
  // fixture existed (bumping NFL Preseason, which DID have games, out of slot 3)
  // and closed with a full matchweek still to play. kickoffDate carries the real
  // first-match day for the countdown banner; startDate stays two days earlier so
  // the column is there with the fixture lookahead when the week's build-up starts.
  { sport: "epl", label: "Premier League", startDate: "08-19", endDate: "05-31", kickoffDate: "08-21", championshipDate: "05-30", scheduleReleaseDate: "06-19", verifiedFor: 2026 },
  // ── UEFA Champions League (Sep League phase → Jun Final) ──
  // Active across Sep 14 → Jun 5 but only ~17 matchdays in window; on
  // non-matchday days the column shows news only.
  { sport: "ucl", label: "UCL", startDate: "09-06", endDate: "06-06", kickoffDate: "09-08", championshipDate: "06-05", verifiedFor: 2026 },
  // ── UEFA Europa League (Sep group → late May Final) ──
  { sport: "uel", label: "UEL", startDate: "09-14", endDate: "05-28", kickoffDate: "09-16", championshipDate: "05-26", verifiedFor: 2026 },
  // ── The other four big-five domestic leagues (Aug–May) ──
  // All excludeFromAuto: the 3-column default layout is already tuned around
  // NBA/MLB/NHL/NFL + EPL/UCL, and four more Aug–May soccer leagues competing
  // for the leftover slot would shuffle it out from under existing users.
  // They're opt-in from the league switcher / Settings, which is what the
  // feedback actually asked for ("all-in-one spoiler free site").
  // Windows are the real 2026-27 opener and final-matchday dates, read off
  // ESPN's own fixture lists on 2026-08-03 (esp.1 Aug 15 → May 30, ita.1 Aug 22
  // → May 30, ger.1 Aug 28 → May 22, fra.1 Aug 21 → May 29). They are NOT
  // interchangeable: an early startDate puts a permanently empty column in the
  // switcher, and a late one hides the opener.
  { sport: "laliga",     label: "La Liga",    startDate: "08-15", endDate: "05-30", championshipDate: "05-30", excludeFromAuto: true },
  { sport: "seriea",     label: "Serie A",    startDate: "08-22", endDate: "05-30", championshipDate: "05-30", excludeFromAuto: true },
  { sport: "bundesliga", label: "Bundesliga", startDate: "08-28", endDate: "05-22", championshipDate: "05-22", excludeFromAuto: true },
  { sport: "ligue1",     label: "Ligue 1",    startDate: "08-21", endDate: "05-29", championshipDate: "05-29", excludeFromAuto: true },
  // ── Second wave of soccer competitions (added 2026-08-03) ──
  // All excludeFromAuto for the same reason as the big-five block above: these
  // are opt-in from the switcher and must never reshuffle the default 3-column
  // board out from under existing users.
  //
  // Liga MX is the headline add — it routinely out-rates the EPL and MLS in US
  // households. It plays TWO tournaments a year (Clausura ~Jan–May, Apertura
  // ~Jul–Dec) and LeagueConfig only models one window, so this is a single
  // 01-05 → 12-15 span with a real ~6-week hole in Jun/early-Jul. That's the
  // same tradeoff UCL already makes on non-matchdays: the column shows news
  // only. Do NOT "tighten" this to the Apertura calendar ESPN returns today —
  // that silently hides the entire Clausura half of the season.
  { sport: "ligamx", label: "Liga MX", startDate: "01-05", endDate: "12-15", championshipDate: "12-15", excludeFromAuto: true },
  // NWSL: ESPN's calendar runs 03-13 → 11-01 for the regular season; the
  // playoffs and Championship push into late November, hence 11-22.
  { sport: "nwsl", label: "NWSL", startDate: "03-13", endDate: "11-22", championshipDate: "11-22", excludeFromAuto: true },
  // EFL Championship: ESPN calendar 08-14 → 05-01, plus the promotion playoff
  // final at Wembley in late May (the single most-watched match of its season).
  { sport: "efl", label: "Championship", startDate: "08-14", endDate: "05-26", championshipDate: "05-26", excludeFromAuto: true },
  // Copa Libertadores: ESPN returns no `calendar` array for this competition,
  // so the window is the competition's real shape — qualifying from February,
  // groups in spring, knockouts Aug–Oct, final in late November.
  { sport: "libertadores", label: "Libertadores", startDate: "02-01", endDate: "11-30", championshipDate: "11-30", excludeFromAuto: true },
  // ── Quadrennial / biennial national-team tournaments ──
  // Both are gated by yearCycle so they stay COMPLETELY out of the switcher
  // until their tournament year. That matters: ESPN's uefa.euro scoreboard
  // still serves the 2024 final today, so an ungated Euro entry would sit in
  // the switcher for two years showing stale 2024 results as if they were live.
  // Euro 2028 (UK + Ireland) — anchor is the tournament year, mod 4.
  { sport: "euro", label: "Euro", startDate: "06-01", endDate: "07-15", championshipDate: "07-15", excludeFromAuto: true, yearCycle: { mod: 4, anchor: 2028 } },
  // AFCON: biennial, next edition 2027 (Kenya/Uganda/Tanzania). ⚠️ The 06-15 →
  // 07-20 window is PROVISIONAL — CAF had not published the 2027 match calendar
  // as of 2026-08-03, and the 2025 edition was itself moved to Dec–Jan for
  // weather. Re-check these dates before the 2027 cycle opens; being wrong here
  // only costs a hidden column, never a wrong score.
  { sport: "afcon", label: "AFCON", startDate: "06-17", endDate: "07-19", kickoffDate: "06-19", championshipDate: "07-17", verifiedFor: 2027, excludeFromAuto: true, yearCycle: { mod: 2, anchor: 2027 } },
  // Saudi Pro League: ESPN calendar 08-13 → 05-28.
  { sport: "saudi", label: "Saudi PL", startDate: "08-13", endDate: "05-28", championshipDate: "05-28", excludeFromAuto: true },
  // ── UEFA Conference League + domestic cups (added 2026-09-14) ──
  // ESPN's calendar for each of these is one year-wide "list" entry, so every
  // edge below was read from fixture range probes on 2026-09-14, not from the
  // calendar. Rule: open when the top-division clubs enter, close on the final.
  // Qualifying rounds (Copa del Rey Sep 26 / Oct 3: 20 clubs, no logos) stay
  // outside the window on purpose.
  // Conference League: MD1 2026-10-15 (18 fixtures, Paramount+), league phase
  // through 12-17; 2026-27 final Istanbul 2027-06-02 per UEFA (ESPN has not
  // listed the knockouts yet — far edge unverified by fixtures).
  { sport: "uecl", label: "Conference League", startDate: "10-13", kickoffDate: "10-15", endDate: "06-03", championshipDate: "06-02", verifiedFor: 2026, excludeFromAuto: true },
  // FA Cup: third round proper (PL clubs enter) 2027-01-09, final 2027-05-22
  // per the FA's published calendar; ESPN has no 2026-27 fixtures yet, so both
  // edges are checked against the 2025-26 running (01-09 → 05-16).
  { sport: "facup", label: "FA Cup", startDate: "01-07", kickoffDate: "01-09", endDate: "05-23", championshipDate: "05-22", verifiedFor: 2026, excludeFromAuto: true },
  // Copa del Rey: first round proper 2026-10-28, final at La Cartuja
  // 2027-04-24 per the RFEF calendar; ESPN lists only the qualifying round so
  // far (both edges unverified by fixtures). Lower-league hosts in the first
  // two rounds have no ESPN logo — the card degrades to the club name.
  { sport: "copadelrey", label: "Copa del Rey", startDate: "10-27", kickoffDate: "10-28", endDate: "04-25", championshipDate: "04-24", verifiedFor: 2026, excludeFromAuto: true },
  // DFB-Pokal: first round 2026-08-21 → 08-24 (+ two leftovers 09-01/02), all
  // Bundesliga clubs in; final in Berlin 2027-05-29 per the DFB (far edge
  // unverified by fixtures). Amateur hosts in round one have no ESPN logo.
  { sport: "dfbpokal", label: "DFB-Pokal", startDate: "08-21", kickoffDate: "08-21", endDate: "05-30", championshipDate: "05-29", verifiedFor: 2026, excludeFromAuto: true },
  // ── Cricket (IPL) ──
  // Window is ESPN's own calendar for the competition, first date → final:
  // 2026-03-28 → 2026-05-31. Opt-in like the rest of the second wave.
  { sport: "cricket", label: "IPL", startDate: "03-28", endDate: "05-31", championshipDate: "05-31", excludeFromAuto: true },
  // ── MLS (Feb–Dec, MLS Cup early Dec) ──
  { sport: "mls", label: "MLS", startDate: "02-21", endDate: "12-20", championshipDate: "12-18", verifiedFor: 2026 },
  // ── NCAAF (College Football, late Aug – late Jan) ──
  // Verified against ESPN 2026-08-09. The expanded playoff moved the calendar:
  // quarterfinals Jan 1, semifinals Jan 15-16, and the National Championship on
  // Jan 26 2027 — the old 01-12 endDate hid the entire playoff from the
  // semifinals onward, title game included. Week 0 is Aug 29 2026, so the old
  // 08-22 start opened a week of empty column.
  // Jacob 2026-08-09: NCAAF outranks the NHL for the right slot for its whole
  // season, and takes it outright during the playoff (playoffPin). Restoring the
  // NHL's real October start put a mustInclude league on the right pin from Sep
  // 29 on, which would otherwise have pushed college football — bowls and the
  // CFP included — off the default board for the back half of its season. The
  // NHL stays one tap away in the switcher and returns to the default board on
  // Jan 29, when NCAAF ends.
  { sport: "ncaaf", label: "NCAAF", startDate: "08-27", endDate: "01-28", kickoffDate: "08-29", championshipDate: "01-26", verifiedFor: 2026, displaySlot: "right", slotPrecedence: 1, playoffPin: true },
  // ── NCAAW (Women's College Basketball, Nov–early Apr) ──
  // Swap-only (excludeFromAuto) so it never disturbs the NBA/MLB/NHL/NFL slot
  // rotation — selectable from the slot-3 dropdown when in season.
  { sport: "ncaaw", label: "NCAAW", startDate: "11-01", endDate: "04-06", championshipDate: "04-06", excludeFromAuto: true },
  // ── NCAA men's hockey (Oct–Apr) ──
  // Window is ESPN's own calendar, read live 2026-09-12: 2026-10-02 → 2027-04-10,
  // Frozen Four 04-08, national championship 04-10. Opt-in (excludeFromAuto),
  // like NCAAW, so it never takes a column from the NHL or NCAAF.
  { sport: "ncaah", label: "NCAA Hockey", startDate: "10-02", endDate: "04-10", championshipDate: "04-10", verifiedFor: 2026, excludeFromAuto: true },
  // ── NCAA women's hockey (Sep–Mar) ──
  // Window is ESPN's own calendar, read live 2026-09-14: 2026-09-18 → 2027-03-23,
  // Frozen Four semis 03-21, national championship 03-23 (range probe
  // ?dates=20270301-20270331, season type 3). Opt-in (excludeFromAuto), like
  // the men's column. Header label is shortened by SHORT_LEAGUE_LABELS.
  { sport: "ncaawh", label: "NCAAW Hockey", startDate: "09-18", endDate: "03-23", championshipDate: "03-23", verifiedFor: 2026, excludeFromAuto: true },
  // ── NCAA women's volleyball (late Aug–Dec) ──
  // ESPN's calendar (read 2026-09-14) stops at the REGULAR season: 2026-08-21 →
  // 2026-11-29. The December edge is last year's tournament, read from
  // ?dates=20251201-20251231: first round 12-04, regionals 12-11 → 12-15,
  // semifinals 12-18, national final 12-21. Opt-in (excludeFromAuto), like
  // NCAAW and NCAA Hockey, so it never takes a column from NCAAF or the NFL.
  { sport: "ncaavb", label: "NCAA Volleyball", startDate: "08-21", endDate: "12-21", championshipDate: "12-21", verifiedFor: 2026, excludeFromAuto: true },
  // ── CFL (Jun–Nov) ──
  // 2026: regular season Thu Jun 4 → Sat Oct 24 (21 weeks), division
  // semi-finals Oct 31, division finals Nov 7, 113th Grey Cup Sun Nov 15 in
  // Calgary (cfl.ca + theScore's schedule, read 2026-09-13). Opt-in like NCAA
  // Hockey. check-season-windows skips it (non-ESPN path) — re-verify the
  // window by hand when the 2027 schedule drops (~Dec 2026).
  // endDate runs a week past the Grey Cup so the final's own day (and the
  // 2025-style Sunday Nov 16 slot) still resolves the column on a past tab.
  { sport: "cfl", label: "CFL", startDate: "06-04", endDate: "11-22", championshipDate: "11-15", verifiedFor: 2026, excludeFromAuto: true },
  // WNBA: regular season May 16 – mid-Sept, playoffs into mid-Oct. Auto-eligible
  // in season, but low priority so it only fills open summer/fall slots after
  // the core leagues and major tournament windows.
  { sport: "wnba",  label: "WNBA",  startDate: "05-16", endDate: "10-19", championshipDate: "10-19", scheduleReleaseDate: "12-01", verifiedFor: 2026 },
  // ── Little League World Series (three weeks in August) ──
  // Window is ESPN's own /baseball/llb calendar, read live 2026-08-11:
  // 2026-08-10 → 2026-08-30, 16 game days, championship on the last one.
  // opt-in (excludeFromAuto) on purpose: it overlaps MLB, the NFL preseason
  // and the start of NCAAF, and a three-week event should never evict a
  // league someone chose. It sits in the "US leagues" section of Settings,
  // next to MLB, because that is where a baseball fan looks for it.
  { sport: "llws", label: "Little League", startDate: "08-10", endDate: "08-30", championshipDate: "08-30", verifiedFor: 2026, excludeFromAuto: true },
  // ── NCAA baseball + softball (Feb–Jun, added 2026-09-14) ──
  // Windows are ESPN's own 2026 calendar edges, read live 2026-09-14:
  // baseball 02-13 → 06-22 (CWS championship final G3 on 06-22), softball
  // 02-05 → 06-04 (WCWS finals G2 on 06-04, 8 PM ET). endDate is padded one
  // day past the final like the NBA/NHL/NFL rows: the WCWS final is 00:00Z
  // on 06-05, and the season-windows check reads UTC dates, so a 06-04 close
  // reported "closes 1d before the last game". ESPN has not published 2027
  // dates yet (it does so ~December); the season-windows check (`--all`,
  // twice a month) reports them unverified until then and flags any drift.
  // Both opt-in (excludeFromAuto): they overlap MLB's spring and the NBA/NHL
  // playoffs and must never take a column from those.
  { sport: "ncaabase", label: "NCAA Baseball", startDate: "02-13", endDate: "06-23", championshipDate: "06-22", verifiedFor: 2026, excludeFromAuto: true },
  { sport: "ncaasoft", label: "NCAA Softball", startDate: "02-05", endDate: "06-05", championshipDate: "06-04", verifiedFor: 2026, excludeFromAuto: true },
  // ── Rugby union (five competitions, added 2026-08-11) ──
  // Every window below is ESPN's own published calendar for that league id,
  // read live on 2026-08-11 (see SPORT_PATHS for the ids). All five are
  // opt-in: rugby is a minority US sport and none of these should ever claim
  // a column on its own. They land in "Racing, combat & more".
  // verifiedFor is the year of the OPENER that was actually checked, which for
  // the club competitions is the season ESPN is currently publishing — the
  // MM-DD window recurs, but nobody has confirmed next season's exact dates.
  { sport: "sixnations", label: "Six Nations", startDate: "02-05", endDate: "03-14", championshipDate: "03-14", verifiedFor: 2026, excludeFromAuto: true },
  // Rugby World Cup is quadrennial; 2027 (Australia) is the next edition, so
  // the anchor is 2027 rather than the 2028 used by the Euro.
  { sport: "rugbywc", label: "Rugby World Cup", startDate: "10-01", endDate: "11-13", championshipDate: "11-13", verifiedFor: 2027, excludeFromAuto: true, yearCycle: { mod: 4, anchor: 2027 } },
  { sport: "rugbychamp", label: "Champions Cup", startDate: "12-05", endDate: "05-23", championshipDate: "05-23", verifiedFor: 2025, excludeFromAuto: true },
  { sport: "superrugby", label: "Super Rugby", startDate: "02-13", endDate: "06-20", championshipDate: "06-20", verifiedFor: 2026, excludeFromAuto: true },
  // Internationals (summer/autumn tours + one-off tests). No championship —
  // it is a run of standalone fixtures, not a competition with a final, so
  // championshipDate is deliberately absent.
  //
  // ⚠️ ODD YEARS ONLY (gated 2026-08-13). The Nations Championship REPLACED the
  // July/November test windows in the years it runs, and it runs in even years
  // (2026, 2028 — never a World Cup or Lions year). ESPN 289234 accordingly
  // returned zero events for every 2026 date checked, on 2026-08-12 and again
  // on 2026-08-13, across all three of April, July and November. Without the
  // gate the column is addable from the switcher and then sits empty for eight
  // months of a "live" season window, which reads as broken rather than as
  // offseason. With it, 2026 hides the column entirely and the season-opener
  // probe walks forward to Apr 2027. Anchor 2027 is the yearCycle complement of
  // nationschamp's anchor 2026 — the two columns alternate by construction.
  //
  // verifiedFor is deliberately ABSENT: 2026 is now known to have no fixtures,
  // and 2027's window is inherited from ESPN's generic calendar, not confirmed
  // against a published schedule. 2027 is also a Rugby World Cup year (Oct–Nov,
  // Australia), so the autumn half of this window will likely be swallowed by
  // rugbywc and the real content is the July warm-ups. RE-VERIFY the window
  // against ESPN before the 2027 season rather than trusting 04-03 → 11-13.
  { sport: "rugbytest", label: "Rugby Tests", startDate: "04-03", endDate: "11-13", excludeFromAuto: true, yearCycle: { mod: 2, anchor: 2027 } },
  // ── Nations Championship (added 2026-08-12, on request) ──
  // World Rugby's new senior international competition: the Six Nations and
  // SANZAAR sides plus Japan and Fiji, pool matches in July and the finals
  // weekend in November. Window is ESPN's own published calendar for path
  // 17567, read live on 2026-08-12 — 13 game days, 07-04 → 11-29, 36 fixtures
  // (the 18 July pool matches are complete; the November leg is scheduled and
  // the 11-27/28/29 finals are TBD until the pools settle).
  //
  // ⚠️ The window has a deliberate ~15-week HOLE in it (Jul 19 → Nov 5) that
  // the single start/end model cannot express. That is survivable only because
  // this is excludeFromAuto: an empty column can never be auto-picked onto
  // someone's board, it only appears if they chose the league themselves.
  //
  // BIENNIAL, even years — mod 2 / anchor 2026. World Rugby runs it in every
  // year that is not a Rugby World Cup (2027, 2031) or a Lions tour (2029,
  // 2033), all of which are odd, so the parity test is exact rather than an
  // approximation. Without the gate the column would sit empty all of 2027.
  //
  // Label is "Rugby Nations", not the full "Nations Championship": the column
  // header reserves a fixed width sized to the longest label in this list
  // ("Rugby World Cup"), and a 20-character name would push the ‹ › arrows out
  // from under the pointer. "Rugby Nations" also reads unambiguously next to
  // "Six Nations" in the switcher, which "Nations Champ" does not.
  // Two windows, not one: the Nations Championship plays a July round and
  // then nothing until the November finals (ESPN calendar checked 9/4/2026:
  // last July match 7/18, next 11/06). A single Jul→Nov window called it
  // in-season for 3.5 empty months. Same sport, so the catalog dedupes them.
  { sport: "nationschamp", label: "Rugby Nations", startDate: "07-04", endDate: "07-19", championshipDate: "11-29", verifiedFor: 2026, excludeFromAuto: true, yearCycle: { mod: 2, anchor: 2026 } },
  { sport: "nationschamp", label: "Rugby Nations", startDate: "11-06", endDate: "11-29", championshipDate: "11-29", verifiedFor: 2026, excludeFromAuto: true, yearCycle: { mod: 2, anchor: 2026 } },
  // ── F1 + UFC (single-event tiles) ──
  // UFC re-enabled 2026-07-17: its bout cards now match the game cards' look
  // (fighter names use the standard text-sm .team-name treatment + shared
  // border-hover), so it's back in the switcher — opt-in only (excludeFromAuto),
  // year-round. F1 re-enabled 2026-07-18: the race tile got the game-card
  // treatment (bg-card + border-hover + status bar) and the play buttons
  // already route around FOM's embed block (official-channel + search via
  // openExternal fallback), so it's back in the switcher — opt-in only,
  // like UFC. F1 = Mar–early Dec.
  { sport: "f1",  label: "F1",  startDate: "03-01", endDate: "12-14", excludeFromAuto: true },
  // NASCAR + IndyCar, opt-in like F1. Windows are ESPN's own race calendars,
  // read on 2026-08-03: Cup Series 02-05 → 11-08 (40 races), IndyCar 03-01 →
  // 09-06 (18 races). BACKLOG.md previously called these "skip unless
  // interested" — they're in now because the F1 tile does all the rendering,
  // so the marginal cost was a config block rather than a new card.
  { sport: "nascar",  label: "NASCAR",  startDate: "02-05", endDate: "11-08", excludeFromAuto: true },
  { sport: "indycar", label: "IndyCar", startDate: "03-01", endDate: "09-06", excludeFromAuto: true },
  { sport: "ufc", label: "UFC", excludeFromAuto: true },
  // Boxing + chess (added 2026-08-04). Both are year-round and event-driven —
  // no season window, same as UFC — and both are opt-in only, so they never
  // take a slot from a league someone actually follows.
  //
  // Boxing earns a column because it is close to a worst case for spoilers:
  // ~8-12 marquee cards a year, all on late-night US time, and the result is a
  // single word that every push notification carries.
  { sport: "boxing", label: "Boxing", excludeFromAuto: true },
  // Chess is the same argument in a purer form: an elite game is genuinely
  // worth watching move by move and is destroyed completely by one number.
  { sport: "chess", label: "Chess", excludeFromAuto: true },
  // Poker is a one-card major-event column, not a fake score league. It covers
  // WSOP/WPT/EPT/Triton only, remains opt-in, and disappears cleanly when the
  // curated official calendar has no nearby confirmed event.
  { sport: "poker", label: "Poker", excludeFromAuto: true },
  // Esports (PandaScore). Year-round, opt-in. Worlds and the LCK/LPL play in
  // Asian timezones, so the Western audience watches almost entirely on VOD —
  // the purest spoiler case in the app after cricket.
  //
  // HIDDEN 2026-08-09 (Jacob). One "Esports" pill spans six unrelated circuits
  // (VCT / LPL / LCK / LEC / CBLOL / LCS) and only ONE of them — LEC — has a
  // verified official uploader, so ~87% of the column's cards can never show a
  // highlight button at all (see OFFICIAL_CHANNELS + hasNoTrustedHighlightSource
  // in lib/youtube.ts: LCK leaks the series length through its per-GAME VOD
  // list, LPL and @lolesports post nothing usable, and esports is barred from
  // the unscoped search fallback because fan re-upload titles spoil the result).
  // A column that is mostly score-only cards under a label most users can't
  // decode is worse than no column. Everything below stays live and inert — the
  // PandaScore fetcher, /api/esports, the rating, the LEC channel entry — so
  // deleting this one flag brings it back if LCK/LPL ever ship a per-series cut.
  // Already-pinned slots are untouched: resolveSlot() does not check `hidden`.
  { sport: "esports", label: "Esports", excludeFromAuto: true, hidden: true },
];

// ═══════════════════════════════════════════════════════════════
// FULL YEAR SCHEDULE — Max 3 leagues, slots = [left, center, right]
//
// Slot pinning:
//   left  : NBA (precedence 1) > MLB (2)
//   center: NFL (1) > World Cup (2) > US Open Tennis (3) > Wimbledon (4)
//           > US Open Golf (5) > The Open (6) > NFL Preseason (7)
//           NCAAM dynamically pins to center during March Madness (Mar 17 – Apr 6).
//   right : Masters (1) > NHL (2, auto-picked only from Apr 7 — autoStartDate;
//           selectable from the switcher all season, Sep 29 onward)
//
// Picks: mustInclude (NBA/MLB/NHL/NFL) + firstPref always picked when active;
// regular leagues fill remaining slots by LEAGUE_PRIORITY; backfillOnly
// (NFL Preseason) only joins when fewer than 3 picks otherwise. excludeFromAuto
// (PGA Champ, French Open) never auto-picked but remain in the slot-3 swap menu.
// WNBA is auto-eligible during its season, but low priority and unpinned.
// ═══════════════════════════════════════════════════════════════
// Jan 1 – Jan 11:   NBA/NFL/NCAAM/MLS/EPL          → [NBA, NFL, NCAAM]
// Jan 12 – Jan 26:  + Aus Open                     → [NBA, NFL, Aus Open]
// Jan 27 – Feb 9:   Aus Open ends                  → [NBA, NFL, NCAAM]
// Feb 17 – Mar 16:  NFL ends                       → [NBA, NCAAM, EPL]
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
// Aug 19 – Aug 24:  + EPL (Preseason bumped)       → [MLB, EPL, MLS]
// Aug 25 – Sep 3:   + US Open Tennis               → [MLB, US Open Tennis, EPL]
// Sep 8 – Sep 14:   + NFL                           → [MLB, NFL, US Open Tennis]
// Sep 15 – Oct 19:  US Open Tennis ends            → [MLB, NFL, EPL]
// Oct 20 – Nov 1:   + NBA                           → [NBA, NFL, MLB]
// Nov 2 – Dec 31:   MLB ends; + NCAAM              → [NBA, NFL, NCAAM]
// ═══════════════════════════════════════════════════════════════
// Added 2026-05-27 — not unrolled into the day-by-day grid above:
//   • NCAAF (Aug 27 – Jan 28, priority 4) joins between NFL and tennis;
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

// ═══════════════════════════════════════════════════════════════
// SEASON KICKOFF — "starting soon" leagues
// ═══════════════════════════════════════════════════════════════
// A league that hasn't started yet is invisible everywhere: not in the auto
// columns (correct — it has no games), but also not in the switcher, so a user
// who already knows the season is coming has no way to add it and no way to
// learn the date. Two consequences we hit for the 2026-27 Premier League: people
// were asking for the column while it was still hidden, and the start date
// itself (Aug 21, a week later than a normal year because of the World Cup) is
// not something a casual fan knows.
//
// So a league becomes SELECTABLE — never auto-picked — this many days before it
// starts, and the same window drives the one-line kickoff banner. The column it
// opens is not empty: LeagueColumn's next-game-day lookahead shows the opening
// fixtures, and the league's news feed is already baking year-round.
// 14 days: long enough that the Premier League's Aug 21 opener is addable from
// the first week of August (people were already asking), short enough that the
// window doesn't sit open for a month and stop reading as news.
export const KICKOFF_SOON_DAYS = 14;
// How long after the first match the banner keeps offering the add, for anyone
// who only opens the app on weekends.
export const KICKOFF_UNDERWAY_DAYS = 4;

const DAY_MS = 86_400_000;

// Local-noon Date for the next occurrence of an MM-DD on or after viewDate.
// Noon avoids the DST edges where a midnight date arithmetic lands on the wrong
// calendar day. Returns null for a malformed MM-DD.
function nextOccurrence(mmdd: string, viewDate: Date): Date | null {
  const m = /^(\d{2})-(\d{2})$/.exec(mmdd);
  if (!m) return null;
  const month = Number(m[1]);
  const day = Number(m[2]);
  const view = new Date(viewDate.getFullYear(), viewDate.getMonth(), viewDate.getDate(), 12, 0, 0, 0);
  let d = new Date(viewDate.getFullYear(), month - 1, day, 12, 0, 0, 0);
  if (d.getTime() < view.getTime()) d = new Date(viewDate.getFullYear() + 1, month - 1, day, 12, 0, 0, 0);
  return d;
}

export type LeagueKickoff = {
  config: LeagueConfig;
  kickoff: Date;       // local noon on the season's first match day
  daysUntil: number;   // 0 = kicks off today; negative = already started
  phase: "soon" | "today" | "underway";
  // Stable per-season dismissal key ("epl-2026") so dismissing this year's
  // banner doesn't dismiss the league forever.
  seasonKey: string;
};

// Whether `league` is inside its pre-season selectable window for viewDate.
// Deliberately excludes hidden/backfill entries and anything gated out by
// yearCycle (a World Cup three years away must not surface as "starting soon").
export function isLeagueUpcoming(league: LeagueConfig, viewDate: Date, withinDays = KICKOFF_SOON_DAYS): boolean {
  // A league already in its window is "active", never "upcoming" — startDate can
  // sit a couple of days before kickoffDate, and both being true at once would
  // let a caller label a live column "starts Friday".
  if (isLeagueActive(league, viewDate)) return false;
  const k = kickoffFor(league, viewDate);
  return k !== null && k.daysUntil > 0 && k.daysUntil <= withinDays;
}

function kickoffFor(league: LeagueConfig, viewDate: Date): LeagueKickoff | null {
  if (league.hidden || league.backfillOnly) return null;
  if (!league.startDate || !league.endDate) return null;
  const kickoff = nextOccurrence(league.kickoffDate ?? league.startDate, viewDate);
  if (!kickoff) return null;
  if (league.yearCycle) {
    const { mod, anchor } = league.yearCycle;
    if ((kickoff.getFullYear() - anchor) % mod !== 0) return null;
  }
  const view = new Date(viewDate.getFullYear(), viewDate.getMonth(), viewDate.getDate(), 12, 0, 0, 0);
  const daysUntil = Math.round((kickoff.getTime() - view.getTime()) / DAY_MS);
  // nextOccurrence never looks backwards, so "underway" is detected by asking
  // whether THIS year's kickoff has just passed rather than by a negative diff.
  let phase: LeagueKickoff["phase"];
  let effective = kickoff;
  let effectiveDays = daysUntil;
  if (daysUntil > 0) {
    const lastYear = new Date(kickoff.getFullYear() - 1, kickoff.getMonth(), kickoff.getDate(), 12, 0, 0, 0);
    const sinceLast = Math.round((view.getTime() - lastYear.getTime()) / DAY_MS);
    if (sinceLast > 0 && sinceLast <= KICKOFF_UNDERWAY_DAYS && isLeagueActive(league, viewDate)) {
      effective = lastYear;
      effectiveDays = -sinceLast;
      phase = "underway";
    } else {
      phase = "soon";
    }
  } else {
    phase = "today";
  }
  // Keyed by the exact kickoff day, not just the year: golf and tennis run
  // several separate events per sport per year, and dismissing the Masters
  // banner must not silently dismiss the US Open's.
  const stamp = `${effective.getFullYear()}-${String(effective.getMonth() + 1).padStart(2, "0")}-${String(effective.getDate()).padStart(2, "0")}`;
  return { config: league, kickoff: effective, daysUntil: effectiveDays, phase, seasonKey: `${league.sport}-${stamp}` };
}

// One glyph per sport for the kickoff banner. Partial by design — anything not
// listed falls back to a neutral marker rather than getting a wrong icon.
const SPORT_GLYPH: Partial<Record<Sport, string>> = {
  mlb: "⚾", llws: "⚾", ncaabase: "⚾", ncaasoft: "🥎", nba: "🏀", wnba: "🏀", ncaam: "🏀", ncaaw: "🏀",
  nfl: "🏈", ncaaf: "🏈", ufl: "🏈", cfl: "🏈", nhl: "🏒", ncaah: "🏒", ncaawh: "🏒", ncaavb: "🏐", golf: "⛳", tennis: "🎾",
  sixnations: "🏉", rugbywc: "🏉", rugbychamp: "🏉", superrugby: "🏉", rugbytest: "🏉", nationschamp: "🏉",
  fifa: "⚽", epl: "⚽", mls: "⚽", ucl: "⚽", uel: "⚽",
  laliga: "⚽", seriea: "⚽", bundesliga: "⚽", ligue1: "⚽", ligamx: "⚽",
  nwsl: "⚽", efl: "⚽", libertadores: "⚽", euro: "⚽", afcon: "⚽", saudi: "⚽",
  uecl: "⚽", facup: "⚽", copadelrey: "⚽", dfbpokal: "⚽",
  cricket: "🏏", f1: "🏎️", nascar: "🏎️", indycar: "🏎️",
  ufc: "🥊", boxing: "🥊", chess: "♟️", poker: "🃏", esports: "🎮", top: "⭐",
};

export function sportGlyph(sport: Sport): string {
  return SPORT_GLYPH[sport] ?? "🏟️";
}

// ═══════════════════════════════════════════════════════════════
// SPORT GROUPS — how the league catalog is sectioned in Settings
// ═══════════════════════════════════════════════════════════════
//
// Every label answers "what KIND of sport is this", never "how important is
// it" (Jacob 8/11). The rejected first cut was Primary / Soccer / Additional,
// which mixes the two axes: someone who only watches F1 does not think of it
// as "additional", and a ranking has to be re-argued every season. A kind is
// stable, so a new league's group is a fact rather than a judgement call.
//
// The four groups, and why each exists:
// - "US leagues": the domestic team leagues, including the college ones. NOT
//   "college" as its own group — that is a level of play, not a league name.
// - "Soccer": 16 competitions, far and away the biggest bloc, and ESPN itself
//   lists all of it under one "Soccer" entry. It is the thing that overflows
//   the list, so it gets a section rather than being interleaved.
// - "Golf & tennis majors": these are EVENTS, not leagues — ALL_LEAGUES holds
//   four configs per sport (the Masters, Wimbledon, …) and "majors" is what
//   both sports actually call them. They belong to neither group above.
// - "Racing, combat & more": the remainder. "& more" is doing real work — it
//   is the group that absorbs anything that is not a US league, soccer, or a
//   golf/tennis major (cricket, chess, poker today; rugby, horse racing and
//   pro wrestling when they land).
export type SportGroup = "us" | "soccer" | "majors" | "other";

export const SPORT_GROUP_ORDER: { key: SportGroup; label: string }[] = [
  { key: "us", label: "US leagues" },
  { key: "soccer", label: "Soccer" },
  { key: "majors", label: "Golf & tennis majors" },
  { key: "other", label: "Racing, combat & more" },
];

// Partial on purpose: an unlisted sport falls through to "other" rather than
// disappearing from Settings. Adding a sport to `Sport` without touching this
// map degrades to a slightly-wrong section, never to an unpickable league.
const SPORT_GROUP: Partial<Record<Sport, SportGroup>> = {
  nfl: "us", ufl: "us", nba: "us", mlb: "us", nhl: "us", ncaah: "us", cfl: "us", ncaawh: "us", wnba: "us",
  ncaaf: "us", ncaam: "us", ncaaw: "us", ncaavb: "us", llws: "us", ncaabase: "us", ncaasoft: "us",
  epl: "soccer", ucl: "soccer", uel: "soccer", laliga: "soccer",
  seriea: "soccer", bundesliga: "soccer", ligue1: "soccer", mls: "soccer",
  ligamx: "soccer", nwsl: "soccer", efl: "soccer", libertadores: "soccer",
  saudi: "soccer", fifa: "soccer", euro: "soccer", afcon: "soccer",
  uecl: "soccer", facup: "soccer", copadelrey: "soccer", dfbpokal: "soccer",
  golf: "majors", tennis: "majors",
  f1: "other", nascar: "other", indycar: "other", ufc: "other",
  boxing: "other", cricket: "other", chess: "other", poker: "other",
  esports: "other",
  sixnations: "other", rugbywc: "other", rugbychamp: "other",
  superrugby: "other", rugbytest: "other", nationschamp: "other",
};

export function sportGroup(sport: Sport): SportGroup {
  return SPORT_GROUP[sport] ?? "other";
}

// Competitions that sort to the END of their Settings group no matter what the
// calendar says. The catalog otherwise sorts in-season leagues above offseason
// ones, which is right for peers but wrong here: for three weeks in August a
// kids' tournament was listed above the NBA, NHL, NCAAF and NCAAM, and the
// rugby block led "Racing, combat & more" ahead of F1, NASCAR and UFC (Jacob
// 8/11 — "little league should not be that high ranking"). Settings is the
// durable catalog you come to in order to FIND a league, so stature has to beat
// seasonality for the short-window minority events; the "· offseason" marker on
// each row still carries the seasonal signal. Every entry here is
// excludeFromAuto, so this only ever reorders a list — it can never change
// which columns you get.
const CATALOG_TAIL: ReadonlySet<Sport> = new Set<Sport>([
  "llws",
  "sixnations", "rugbywc", "rugbychamp", "superrugby", "rugbytest", "nationschamp",
]);

// Sort rank within a Settings group: minority events last, then in-season
// before offseason, then the catalog's own (season-calendar) order.
export function catalogSortRank(sport: Sport, offseason: boolean): number {
  return (CATALOG_TAIL.has(sport) ? 2 : 0) + (offseason ? 1 : 0);
}

// "8/21" — the compact form used in the league switcher's "EPL · 8/21" tail.
export function formatKickoffShort(mmdd: string | undefined, viewDate: Date): string {
  const d = mmdd ? nextOccurrence(mmdd, viewDate) : null;
  if (!d) return "soon";
  // Numeric "8/21", not "Aug 21": this rides inside a switcher row already
  // carrying a league name ("EPL · starts Aug 21"), and the spelled month
  // pushed it onto a second line in the dropdown (Jacob 8/9).
  return d.toLocaleDateString("en-US", { month: "numeric", day: "numeric" });
}

// "Friday, Aug 21" — the banner form. Weekday included because for a league
// people already follow, the day of the week is the part that makes it land.
export function formatKickoffLong(d: Date): string {
  return d.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
}

// ═══════════════════════════════════════════════════════════════
// SEASON OPENER — what an offseason column says instead of nothing
// ═══════════════════════════════════════════════════════════════
// A column with no games today, no fixture lookahead and no recent game used to
// bottom out at a bare "Upcoming Schedule TBD" — true, but useless: the one
// thing someone looking at an offseason column wants is when it comes back.
// ALL_LEAGUES already carries that date, so surface it.
//
// APPROXIMATE BY CONSTRUCTION. These are MM-DD windows re-verified against the
// leagues' own schedules once a season, and startDate can open a few days before
// the first real fixture. Only a kickoffDate inside its verifiedFor year is a
// confirmed opening day; everything else is hedged with a "~" in the UI.
export type SeasonOpener = {
  date: Date;          // local noon on the opener
  daysUntil: number;   // always >= 1
  approximate: boolean;
  // Tournaments (golf majors, Slams, World Cup/Euro/AFCON) don't have a
  // "season" — the column returns for one event — so the UI says "Returns"
  // for them and "Season starts" for the league sports.
  kind: "season" | "event";
  label: string;       // "Oct 20", or "Jun 2030" when more than a year out
  awayLabel: string;   // "9 days away" / "6 weeks away" / "3 months" / "4 years"
  // "May 14" when the full schedule is still unpublished on viewDate — the one
  // fact an offseason column can add past the start date. Undefined once the
  // schedule is out (or for leagues with no fixed release date), because
  // "schedule dropped in July" is noise in October.
  scheduleOut?: string;
};

// Sports whose columns are a single dated event rather than a season.
const EVENT_SPORTS: Partial<Record<Sport, true>> = {
  golf: true, tennis: true, fifa: true, euro: true, afcon: true,
};

// Next opener for `sport` on or after viewDate, or null when there is nothing to
// name: event-driven sports with no season window (UFC, boxing, chess), or a
// league already inside its window (an in-season gap is a schedule hole, not an
// offseason — announcing next year's opener there would be flatly wrong).
export function getSeasonOpener(sport: Sport, label: string, viewDate: Date): SeasonOpener | null {
  const candidates = ALL_LEAGUES.filter(
    (l) => l.sport === sport && !l.hidden && !l.backfillOnly && l.startDate && l.endDate,
  );
  if (candidates.length === 0) return null;
  // A sport can hold several configs (golf majors, tennis Slams, NFL + its
  // preseason). Prefer the one this column is actually labelled with; otherwise
  // take whichever comes back soonest.
  const exact = candidates.find((l) => l.label === label);
  const pool = exact ? [exact] : candidates;
  // Bail while the relevant config is in its own window — an empty column there
  // is a schedule gap, not an offseason. Scoped to the matched config so that a
  // column parked on Wimbledon during the Australian Open still answers with
  // Wimbledon's date instead of going silent.
  if (pool.some((l) => isLeagueActive(l, viewDate))) return null;

  let best: { config: LeagueConfig; kickoff: Date; daysUntil: number } | null = null;
  for (const config of pool) {
    // World Cup / Euro / AFCON are gated to their cycle year, so the next
    // occurrence of their MM-DD is usually the wrong year and kickoffFor returns
    // null. Walk forward a cycle at a time instead of giving up — "starts Jun
    // 2030" is still the answer someone opening the column wants.
    const maxYears = config.yearCycle ? config.yearCycle.mod : 1;
    for (let i = 0; i < maxYears; i++) {
      const probe = new Date(viewDate.getFullYear() + i, viewDate.getMonth(), viewDate.getDate(), 12, 0, 0, 0);
      const k = kickoffFor(config, probe);
      if (!k) continue;
      const view = new Date(viewDate.getFullYear(), viewDate.getMonth(), viewDate.getDate(), 12, 0, 0, 0);
      const daysUntil = Math.round((k.kickoff.getTime() - view.getTime()) / DAY_MS);
      if (daysUntil < 1) continue;
      if (!best || daysUntil < best.daysUntil) best = { config, kickoff: k.kickoff, daysUntil };
      break;
    }
  }
  if (!best) return null;

  const { config, kickoff, daysUntil } = best;
  // The schedule is "not out yet" when its release lands between today and the
  // opener. Past that the next occurrence rolls into the following season, which
  // is how a released schedule detects itself without any extra state.
  const release = config.scheduleReleaseDate ? nextOccurrence(config.scheduleReleaseDate, viewDate) : null;
  const scheduleOut = release && release.getTime() < kickoff.getTime()
    ? release.toLocaleDateString("en-US", { month: "short", day: "numeric" })
    : undefined;
  // Rounded whole years, hoisted so the awayLabel years branch can pluralize
  // like the days branch does — a World Cup column viewed ~1–1.5 years out
  // (daysUntil 366–547) rounds to 1 and otherwise read "1 years away".
  const years = Math.round(daysUntil / 365.25);
  return {
    date: kickoff,
    daysUntil,
    // A confirmed opening-day date only stays confirmed for the season someone
    // actually checked — either side of that, kickoffDate is a different year's
    // date recurring, so the copy goes back to hedging. See
    // LeagueConfig.verifiedFor.
    //
    // `!==`, not `<`: verifiedFor names the ONE year that was checked, not a
    // floor. Under `<`, every year BEFORE the checked one also counted as
    // confirmed — so a window verified for 2027 stated 2026's opener as fact.
    // The tennis US Open ran "kicks off Saturday, Aug 29" through August 2026
    // with no "~" while ESPN had Day 1 on Sunday Aug 30; 08-29 is right for
    // 2027, which is exactly what verifiedFor: 2027 claims and all it claims.
    approximate: !config.kickoffDate || (config.verifiedFor ?? 0) !== kickoff.getFullYear(),
    scheduleOut,
    kind: EVENT_SPORTS[sport] ? "event" : "season",
    // Past a year out the day-of-month is noise (and unknowable) — month + year
    // carries all the signal a 2030 World Cup column can honestly give.
    label: daysUntil > 365
      ? kickoff.toLocaleDateString("en-US", { month: "short", year: "numeric" })
      : kickoff.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    awayLabel: daysUntil <= 21
      ? `${daysUntil} day${daysUntil === 1 ? "" : "s"} away`
      : daysUntil <= 70
        ? `${Math.round(daysUntil / 7)} weeks away`
        : daysUntil <= 365
          ? `${Math.round(daysUntil / 30.4)} months away`
          : `${years} year${years === 1 ? "" : "s"} away`,
  };
}

// The single most imminent league worth announcing for viewDate, or null.
// One banner at a time by design — two stacked announcements is an ad unit.
// `exclude` = leagues the user unticked in Settings: a hidden league never
// takes the banner, and the NEXT opener takes it instead of a blank week —
// with UCL hidden on Sep 4 that is the NFL (9/9), not silence (Jacob 9/4).
export function getLeagueKickoff(viewDate: Date, exclude: readonly Sport[] = []): LeagueKickoff | null {
  const candidates: LeagueKickoff[] = [];
  for (const league of ALL_LEAGUES) {
    if (exclude.includes(league.sport)) continue;
    // Opt-in leagues never take the banner. Mid-August alone opens La Liga,
    // Serie A, Ligue 1 and the Saudi Pro League within nine days of each other,
    // and announcing a league the user hasn't asked for — in the one slot above
    // the board — turns a useful heads-up into an ad. They're still addable
    // early from the switcher via isLeagueUpcoming.
    if (league.excludeFromAuto) continue;
    const k = kickoffFor(league, viewDate);
    if (!k) continue;
    if (k.phase === "soon" && k.daysUntil > KICKOFF_SOON_DAYS) continue;
    candidates.push(k);
  }
  if (!candidates.length) return null;
  // Nearest to now wins: today, then the closest upcoming, then the most
  // recently started.
  candidates.sort((a, b) => Math.abs(a.daysUntil) - Math.abs(b.daysUntil));
  return candidates[0];
}

// Whether a league may claim a column ON ITS OWN for viewDate. Identical to
// isLeagueActive unless the config carries an autoStartDate, which narrows the
// auto-pick window to [autoStartDate, endDate] while leaving the full season
// selectable. Every auto-pick path must use this; selectability paths must not.
export function isLeagueAutoEligible(league: LeagueConfig, viewDate: Date): boolean {
  if (!isLeagueActive(league, viewDate)) return false;
  if (!league.autoStartDate || !league.endDate) return true;
  const mmdd = toMMDD(viewDate);
  return league.autoStartDate <= league.endDate
    ? mmdd >= league.autoStartDate && mmdd <= league.endDate
    : mmdd >= league.autoStartDate || mmdd <= league.endDate;
}

const MAX_LEAGUES = 3;

// March Madness date range — NCAAM dynamically becomes a firstPref / center pin.
const MARCH_MADNESS_START = "03-17";
const MARCH_MADNESS_END = "04-06";

// College Football Playoff — the same treatment NCAAM gets in March, for the
// same reason: the biggest games of the sport's year must not be bumped off the
// default board. Wraps New Year, so the check is an OR, not a range.
// 2026-27: bowls open mid-Dec, CFP first round Dec 18-19 (on campus),
// quarterfinals Jan 1, semifinals Jan 15-16, National Championship Jan 26.
const CFP_START = "12-15";
const CFP_END = "01-28";

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
  // The other big-five domestic leagues sort right below MLS, in the order a
  // US viewer is most likely to want them. excludeFromAuto means these never
  // actually win a slot on their own — the number only orders the switcher.
  laliga: 13,
  seriea: 14,
  bundesliga: 15,
  ligue1: 16,
  // Second-wave soccer, ordered by how likely a US viewer is to want it.
  // Liga MX leads the group — it out-draws every other league on this list in
  // US households. Like the big-five block these are excludeFromAuto, so the
  // number only orders the switcher; it never wins a slot on its own.
  ligamx: 17,
  nwsl: 18,
  efl: 19,
  libertadores: 20,
  saudi: 21,
  // National-team tournaments outrank club soccer *during their year* (they're
  // yearCycle-gated, so they're absent from the switcher entirely otherwise).
  euro: 22,
  afcon: 23,
  fifa: 24,
  ncaaw: 25,
  wnba: 26,
  cricket: 27,
  // Opt-in event leagues sort to the bottom of the switcher (like WNBA).
  f1: 28,
  nascar: 29,
  indycar: 30,
  ufc: 31,
  boxing: 32,
  chess: 33,
  poker: 34,
  esports: 35,
  cfl: 36,
};

function isMarchMadness(viewDate: Date): boolean {
  const mmdd = toMMDD(viewDate);
  return mmdd >= MARCH_MADNESS_START && mmdd <= MARCH_MADNESS_END;
}

function isCollegeFootballPlayoff(league: LeagueConfig, viewDate: Date): boolean {
  if (league.sport !== "ncaaf" || !league.playoffPin) return false;
  const mmdd = toMMDD(viewDate);
  return mmdd >= CFP_START || mmdd <= CFP_END;
}

// During March Madness, NCAAM acts as a firstPref center pin; during the CFP,
// NCAAF does the same on the right.
function effectiveFirstPref(league: LeagueConfig, viewDate: Date): boolean {
  if (league.firstPref) return true;
  if (league.sport === "ncaam" && league.marchMadnessLabel && isMarchMadness(viewDate)) return true;
  if (isCollegeFootballPlayoff(league, viewDate)) return true;
  return false;
}
function effectiveDisplaySlot(league: LeagueConfig, viewDate: Date): "left" | "center" | "right" | undefined {
  if (league.sport === "ncaam" && league.marchMadnessLabel && isMarchMadness(viewDate)) return "center";
  return league.displaySlot;
}
function effectiveSlotPrecedence(league: LeagueConfig, viewDate: Date): number {
  if (league.sport === "ncaam" && league.marchMadnessLabel && isMarchMadness(viewDate)) return 0; // beats NFL for center during MM
  if (isCollegeFootballPlayoff(league, viewDate)) return 0;                                      // beats NHL for right during the CFP
  return league.slotPrecedence ?? 99;
}

// Public for callers that just want the active set (e.g. swap dropdowns).
// Returns leagues ordered by their final slot positions (left → center → right).
export function getActiveLeagueCandidates(viewDate?: Date): {
  firstPref: LeagueConfig[];
  rest: LeagueConfig[];
} {
  const d = viewDate ?? new Date();
  const active = ALL_LEAGUES.filter((l) => isLeagueAutoEligible(l, d) && !l.excludeFromAuto && !l.backfillOnly);
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
  const eligible = ALL_LEAGUES.filter((l) => isLeagueAutoEligible(l, viewDate) && !l.excludeFromAuto);

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
// The label a card should carry for a game of `sport` on viewDate: the active
// config's label when one is in season ("US Open" during the Slam, "March
// Madness" in the tourney), else the sport's first catalog entry. The Top
// events column mixes leagues, and its highlight channels + share cards are
// keyed by this label, so each card names its own league.
export function sportDisplayLabel(sport: Sport, viewDate: Date): string {
  if (sport === "top") return TOP_EVENTS_CONFIG.label;
  const configs = ALL_LEAGUES.filter((l) => l.sport === sport);
  const config = configs.find((l) => isLeagueActive(l, viewDate)) ?? configs[0];
  return config ? effectiveLeagueLabel(config, viewDate) : sport.toUpperCase();
}

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

type RawCompetitor = {
  team?: {
    id?: string | number;
    abbreviation?: string;
    displayName?: string;
    shortDisplayName?: string;
    location?: string;
    conferenceId?: string | number;
    logo?: string;
    color?: string;
  };
  records?: { summary?: string }[];
  score?: string;
  winner?: boolean;
  // ESPN's "curated" poll rank for the team AS OF THIS EVENT — the AP Top 25
  // in the regular season, the CFP committee ranking once that starts. 1-25,
  // or 99 for unranked. Present on the college scoreboards; see parseTeam.
  curatedRank?: { current?: number };
};

// ESPN's cricket `score` is a whole sentence, not a score:
//   "161/5 (18/20 ov, target 156)"
// Two problems with rendering that verbatim in a score slot sized for "4".
// First it's simply too long. Second — and this is the one that matters for a
// no-spoiler app — the "target 156" clause states the first innings total, so a
// chasing team's score tile silently reveals the OTHER side's score. Keep only
// the "runs/wickets" head. Non-cricket scores pass through untouched.
function formatScore(raw: string, sport: Sport): string {
  if (sport !== "cricket") return raw;
  const head = raw.split("(")[0]?.trim();
  return head || raw;
}

// Sports whose W-L record can carry a third segment (ties / OTL) that the
// card strips to plain W-L. Shared by parseTeam and fetchStandingsRecords.
const THREE_SEGMENT_RECORD_SPORTS = new Set<Sport>(["mlb", "nhl", "ncaah", "ncaawh", "ncaabase", "ncaasoft"]);

function parseTeam(competitor: RawCompetitor, sport: Sport): Team {
  const rawId = competitor.team?.id ?? "";
  let record = competitor.records?.[0]?.summary ?? "";
  // MLB spring training and NHL records include a 3rd segment (ties / OTL) — strip to W-L.
  // Both college hockey feeds report "W-L-T"; college baseball/softball carry ties the same way ("54-13-1", read 2026-09-14).
  if (THREE_SEGMENT_RECORD_SPORTS.has(sport) && record.split("-").length === 3) {
    const parts = record.split("-");
    record = `${parts[0]}-${parts[1]}`;
  }
  return {
    id: rawId ? `${sport}-${rawId}` : "",
    abbreviation: competitor.team?.abbreviation ?? "",
    displayName: competitor.team?.displayName ?? "",
    shortDisplayName: competitor.team?.shortDisplayName ?? "",
    ...(competitor.team?.location ? { location: competitor.team.location } : {}),
    ...(competitor.team?.conferenceId != null ? { conferenceId: String(competitor.team.conferenceId) } : {}),
    logo: competitor.team?.logo ?? "",
    color: competitor.team?.color ?? "666666",
    score: formatScore(competitor.score ?? "0", sport),
    winner: competitor.winner ?? false,
    record,
    // Non-NCAAF: hydrated post-fetch from the standings endpoint. NCAAF fills
    // it here from the poll instead — see lib/pollRank.ts for why the standings
    // path cannot work for that one sport.
    rank: collegeFootballPollRank(competitor, sport),
  };
}

// Per-sport rating calibration
const SPORT_RATING_CONFIG: Record<Sport, {
  multiplier: number;       // how fast closeness drops per point of final differential
  overtimeBonus: number;    // extra points for OT/extras
  scoringDivisor: number;   // normalizes scoring bonus per sport
  regulationPeriods: number; // normal period count (innings for MLB)
  // Sports whose points arrive in CHUNKS replace the straight multiplier line
  // with a curve keyed off how many scores the margin is worth — see
  // marginCloseness. `multiplier` still drives the comeback bonus for them.
  closenessCurve?: ClosenessCurve;
}> = {
  // Never consulted: a Top events game keeps its real sport, so the rating
  // engine rates it as that league. Present only so the Record stays total.
  top:    { multiplier: 5,   overtimeBonus: 15, scoringDivisor: 30,  regulationPeriods: 4 },
  mlb:    { multiplier: 14,  overtimeBonus: 15, scoringDivisor: 3,   regulationPeriods: 9 },
  // Little League regulation is SIX innings, not nine — getting this wrong
  // would make `periods > regulationPeriods` false for a real extra-innings
  // game and true for none of them, the same trap NCAAW hit below. Scoring
  // runs much higher than MLB (mercy rule at 10 after 4), so the differential
  // multiplier is softened and the scoring divisor raised.
  llws:   { multiplier: 9,   overtimeBonus: 15, scoringDivisor: 5,   regulationPeriods: 6 },
  // NCAA baseball: nine innings and MLB-like scoring, so it mirrors MLB.
  ncaabase: { multiplier: 14, overtimeBonus: 15, scoringDivisor: 3,   regulationPeriods: 9 },
  // NCAA softball: SEVEN innings (status.period reads 7 at a full-length
  // final, read 2026-06-04). Run-rule finals end at period 5 or 6 and rate
  // like a rain-shortened MLB game: progress is 1 once state is post, and
  // `periods > regulationPeriods` is simply false. Scoring tracks MLB.
  ncaasoft: { multiplier: 14, overtimeBonus: 15, scoringDivisor: 3,   regulationPeriods: 7 },
  nba:    { multiplier: 4.5, overtimeBonus: 15, scoringDivisor: 40,  regulationPeriods: 4 },
  // WNBA: same quarter structure as NBA but lower totals (~80 vs ~115); divisor
  // scaled down so scoring bonus normalizes the same way.
  wnba:   { multiplier: 4.5, overtimeBonus: 15, scoringDivisor: 28,  regulationPeriods: 4 },
  ncaam:  { multiplier: 5.5, overtimeBonus: 15, scoringDivisor: 30,  regulationPeriods: 2 },
  // NCAAW: four 10-min quarters (like WNBA, not NCAAM's two 20-min halves —
  // women's college hoops moved to quarters in 2015-16), lower scoring (~70).
  // regulationPeriods MUST be 4: a finished regulation game reports period 4,
  // so a value of 2 made `periods > regulationPeriods` true for EVERY game and
  // handed out the +15 OT bonus (a full tier) to non-OT games.
  ncaaw:  { multiplier: 5.5, overtimeBonus: 15, scoringDivisor: 25,  regulationPeriods: 4 },
  // NCAAF: scoring similar to NFL, mirrors its calibration.
  ncaaf:  { multiplier: 5,   overtimeBonus: 15, scoringDivisor: 8,   regulationPeriods: 4, closenessCurve: FOOTBALL_CLOSENESS },
  nhl:    { multiplier: 18,  overtimeBonus: 20, scoringDivisor: 1.5, regulationPeriods: 3 },
  // NCAA men's hockey: three 20-min periods and NHL-like scoring, so it mirrors NHL.
  ncaah:  { multiplier: 18,  overtimeBonus: 20, scoringDivisor: 1.5, regulationPeriods: 3 },
  // NCAA women's hockey: same three 20-min periods and scoring shape as the men's.
  ncaawh: { multiplier: 18,  overtimeBonus: 20, scoringDivisor: 1.5, regulationPeriods: 3 },
  // NCAA women's volleyball never reaches the generic scorer — calculateRating
  // hands it to volleyballRating() (score = sets, not points). regulationPeriods
  // 5 is the best-of-five; only GameHighlights' buffer math mirrors it.
  ncaavb: { multiplier: 1,   overtimeBonus: 0,  scoringDivisor: 1,   regulationPeriods: 5 },
  nfl:    { multiplier: 5,   overtimeBonus: 15, scoringDivisor: 8,   regulationPeriods: 4, closenessCurve: FOOTBALL_CLOSENESS },
  // UFL: four 15-min quarters and NFL-like scoring, so it mirrors NFL.
  ufl:    { multiplier: 5,   overtimeBonus: 15, scoringDivisor: 8,   regulationPeriods: 4, closenessCurve: FOOTBALL_CLOSENESS },
  // CFL: four quarters, NFL-like scoring (rouges add the odd single point, and
  // a 1-point margin already reads as a one-score game on the curve).
  cfl:    { multiplier: 5,   overtimeBonus: 15, scoringDivisor: 8,   regulationPeriods: 4, closenessCurve: FOOTBALL_CLOSENESS },
  fifa:   { multiplier: 22,  overtimeBonus: 25, scoringDivisor: 0.5, regulationPeriods: 2 },
  epl:    { multiplier: 22,  overtimeBonus: 20, scoringDivisor: 0.5, regulationPeriods: 2 },
  mls:    { multiplier: 22,  overtimeBonus: 20, scoringDivisor: 0.5, regulationPeriods: 2 },
  // UCL / UEL: 90-min soccer, mirrors EPL.
  ucl:    { multiplier: 22,  overtimeBonus: 20, scoringDivisor: 0.5, regulationPeriods: 2 },
  uel:    { multiplier: 22,  overtimeBonus: 20, scoringDivisor: 0.5, regulationPeriods: 2 },
  // La Liga / Serie A / Bundesliga / Ligue 1: 90-min domestic soccer, same
  // rating shape as EPL.
  laliga:     { multiplier: 22, overtimeBonus: 20, scoringDivisor: 0.5, regulationPeriods: 2 },
  seriea:     { multiplier: 22, overtimeBonus: 20, scoringDivisor: 0.5, regulationPeriods: 2 },
  bundesliga: { multiplier: 22, overtimeBonus: 20, scoringDivisor: 0.5, regulationPeriods: 2 },
  ligue1:     { multiplier: 22, overtimeBonus: 20, scoringDivisor: 0.5, regulationPeriods: 2 },
  // Second-wave soccer: all 90-minute association football, so they take the
  // identical EPL calibration. The two knockout-heavy competitions (Copa
  // Libertadores, AFCON) and the Euro use fifa's slightly higher overtimeBonus
  // (25) because extra time there is a genuine drama signal, not a league-game
  // curiosity — same reasoning already applied to the World Cup.
  ligamx:       { multiplier: 22, overtimeBonus: 20, scoringDivisor: 0.5, regulationPeriods: 2 },
  nwsl:         { multiplier: 22, overtimeBonus: 20, scoringDivisor: 0.5, regulationPeriods: 2 },
  efl:          { multiplier: 22, overtimeBonus: 20, scoringDivisor: 0.5, regulationPeriods: 2 },
  saudi:        { multiplier: 22, overtimeBonus: 20, scoringDivisor: 0.5, regulationPeriods: 2 },
  libertadores: { multiplier: 22, overtimeBonus: 25, scoringDivisor: 0.5, regulationPeriods: 2 },
  // Conference League + the three domestic cups (2026-09-14): knockout ties go
  // to extra time, so they take the Libertadores/AFCON calibration.
  uecl:         { multiplier: 22, overtimeBonus: 25, scoringDivisor: 0.5, regulationPeriods: 2 },
  facup:        { multiplier: 22, overtimeBonus: 25, scoringDivisor: 0.5, regulationPeriods: 2 },
  copadelrey:   { multiplier: 22, overtimeBonus: 25, scoringDivisor: 0.5, regulationPeriods: 2 },
  dfbpokal:     { multiplier: 22, overtimeBonus: 25, scoringDivisor: 0.5, regulationPeriods: 2 },
  euro:         { multiplier: 22, overtimeBonus: 25, scoringDivisor: 0.5, regulationPeriods: 2 },
  afcon:        { multiplier: 22, overtimeBonus: 25, scoringDivisor: 0.5, regulationPeriods: 2 },
  // Cricket never reaches the generic scorer — calculateRating hands a T20
  // innings off to cricketRating() before any of this applies (runs and wickets
  // are not interchangeable with goals/points). regulationPeriods: 2 is the one
  // field that IS still read, by gameProgress: a limited-overs match is two
  // innings, so innings 1 reads as ~25% elapsed and clears the "too early" gate.
  cricket: { multiplier: 1,   overtimeBonus: 0,  scoringDivisor: 1,   regulationPeriods: 2 },
  // Rugby union: two 40-minute halves, team totals in the 20-35 range — close
  // enough to NFL's shape that it takes NFL's calibration, with two periods
  // instead of four. Extra time is rare and only happens in knockout rugby, so
  // it carries the higher 20-point bonus the cup competitions use.
  sixnations: { multiplier: 5, overtimeBonus: 20, scoringDivisor: 8, regulationPeriods: 2 },
  rugbywc:    { multiplier: 5, overtimeBonus: 20, scoringDivisor: 8, regulationPeriods: 2 },
  rugbychamp: { multiplier: 5, overtimeBonus: 20, scoringDivisor: 8, regulationPeriods: 2 },
  superrugby: { multiplier: 5, overtimeBonus: 20, scoringDivisor: 8, regulationPeriods: 2 },
  rugbytest:  { multiplier: 5, overtimeBonus: 20, scoringDivisor: 8, regulationPeriods: 2 },
  nationschamp: { multiplier: 5, overtimeBonus: 20, scoringDivisor: 8, regulationPeriods: 2 },
  golf:   { multiplier: 1,   overtimeBonus: 10, scoringDivisor: 1,   regulationPeriods: 4 },
  tennis: { multiplier: 25,  overtimeBonus: 15, scoringDivisor: 5,   regulationPeriods: 4 },
  // F1 / UFC render as single-event tiles (no Game objects), so these are
  // placeholders only — calculateRating never runs on them.
  f1:     { multiplier: 1,   overtimeBonus: 0,  scoringDivisor: 1,   regulationPeriods: 1 },
  nascar: { multiplier: 1,   overtimeBonus: 0,  scoringDivisor: 1,   regulationPeriods: 1 },
  indycar:{ multiplier: 1,   overtimeBonus: 0,  scoringDivisor: 1,   regulationPeriods: 1 },
  ufc:    { multiplier: 1,   overtimeBonus: 0,  scoringDivisor: 1,   regulationPeriods: 1 },
  // Boxing + chess are event tiles with no per-game score to rate, exactly
  // like UFC and the racing series. These values are inert — nothing calls
  // the shared scorer for an eventCard league — but the Record must be total.
  boxing: { multiplier: 1,   overtimeBonus: 0,  scoringDivisor: 1,   regulationPeriods: 1 },
  chess:  { multiplier: 1,   overtimeBonus: 0,  scoringDivisor: 1,   regulationPeriods: 1 },
  poker:  { multiplier: 1,   overtimeBonus: 0,  scoringDivisor: 1,   regulationPeriods: 1 },
  // Esports is scored as a SERIES (Bo3/Bo5), not a running total, so the
  // shared scorer does not apply — esportsRating() handles it, the same way
  // cricketRating() branches out before the shared path.
  esports:{ multiplier: 1,   overtimeBonus: 0,  scoringDivisor: 1,   regulationPeriods: 1 },
};

// Regulation period length in seconds, for count-down sports where ESPN's
// status.clock is "seconds remaining in the current period". Lets us measure
// progress *within* a period (smooth) instead of assuming a flat midpoint.
const PERIOD_SECONDS: Partial<Record<Sport, number>> = {
  nba: 720, wnba: 600,        // 12-min / 10-min quarters
  ncaaw: 600,                 // 10-min quarters (four of them, like WNBA)
  nfl: 900, ncaaf: 900, ufl: 900, cfl: 900, // 15-min quarters
  nhl: 1200,                  // 20-min periods
  ncaah: 1200,                // 20-min periods, same as NHL
  ncaawh: 1200,               // 20-min periods, same as NHL
  ncaam: 1200,                // 20-min halves
};
// Soccer is different: status.clock counts UP and equals total elapsed match
// seconds (5400 = 90'), so progress is just clock / full match.
const SOCCER_SPORTS = new Set<Sport>([
  "epl", "mls", "ucl", "uel", "fifa", "laliga", "seriea", "bundesliga", "ligue1",
  "ligamx", "nwsl", "efl", "libertadores", "euro", "afcon", "saudi",
  "uecl", "facup", "copadelrey", "dfbpokal",
]);
const FULL_MATCH_SECONDS = 5400;

// Minimal shape of an ESPN game's live status — the only fields this progress
// estimate reads: the current period/inning and the (optionally numeric) clock.
type GameStatusLike = { status?: { period?: number; clock?: number } };

// Fraction of regulation elapsed, [0,1]. Uses the live game clock for smooth
// within-period progress (so the "too early" gate trips *during* period 1, and
// every sport behaves like MLB/tennis — an honest "Too Early" at the start
// rather than a misleading low badge). Falls back to a coarse period-midpoint
// estimate when there's no usable clock (MLB innings, or missing data).
function gameProgress(game: GameStatusLike, sport: Sport, regulationPeriods: number, state: string): number {
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
// `value` is the per-period score every other sport uses. The four optional
// fields are cricket-only: ESPN gives each competitor one linescore row per
// INNINGS of the match (not per period they batted), and marks the side that
// actually batted in that innings with isBatting. The non-batting side's row
// mirrors the batting side's overs with runs/wickets zeroed, so reading a row
// without checking isBatting silently yields 0/0.
type LineScore = {
  value?: number;
  runs?: number;
  wickets?: number;
  overs?: number;
  isBatting?: boolean;
};
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
type SoccerPlay = { scoringPlay?: boolean; clock?: { displayValue?: string }; team?: { id?: string | number } };
type SoccerCompetition = { details?: SoccerPlay[] };
function soccerLateDramaBonus(competition: SoccerCompetition | null | undefined): number {
  const details: SoccerPlay[] = competition?.details ?? [];
  if (!details.length) return 0;
  // Parse a soccer clock ("67'", "45'+2'", "90'+5'") into two numbers. `min`
  // folds stoppage into the base minute for the lateness thresholds below
  // ("90'+5'" → 95). `sortKey` keeps stoppage as a fractional component
  // ("45'+2'" → 45.02) so goals sort in TRUE chronological order: folding both
  // into one value reordered goals across the half boundary — a first-half
  // stoppage goal ("45'+2'" → 47) sorted AFTER an early second-half goal
  // ("46'"), so the leader walk below saw them out of sequence.
  const parseMin = (dv: string | undefined): { min: number; sortKey: number } | null => {
    const m = dv?.match(/(\d+)'?(?:\s*\+\s*(\d+))?/);
    if (!m) return null;
    const base = parseInt(m[1], 10);
    const stop = m[2] ? parseInt(m[2], 10) : 0;
    return { min: base + stop, sortKey: base + stop / 100 };
  };
  const goals = details
    .filter((d) => d.scoringPlay)
    .map((d) => {
      const t = parseMin(d.clock?.displayValue);
      return t ? { min: t.min, sortKey: t.sortKey, team: String(d.team?.id ?? "") } : null;
    })
    .filter((g): g is { min: number; sortKey: number; team: string } => g !== null && !!g.team)
    .sort((a, b) => a.sortKey - b.sortKey);
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
    if (leader !== prevLeader) latestSwingMin = g.min;
    prevLeader = leader;
  }
  if (latestSwingMin >= 90) return 25;
  if (latestSwingMin >= 80) return 16;
  if (latestSwingMin >= 70) return 9;
  return 0;
}

// The raw ESPN event calculateRating scores, tagged with _sport by parseGame.
// Reads only the closeness signals: per-competitor score + linescores (via the
// margin helpers), the soccer scoring-play details (via soccerLateDramaBonus),
// and the live status/clock (via gameProgress, whose GameStatusLike this fits).
type RatingGame = {
  _sport?: Sport;
  status?: { type?: { state?: string }; period?: number; clock?: number };
  competitions?: Array<
    SoccerCompetition & { competitors?: (MarginCompetitor & { score?: string })[] }
  >;
};

// ── Cricket (limited-overs) closeness ────────────────────────────────────────
// Cricket cannot use the generic three-factor scorer, and the failure is not
// subtle: a chase ends the instant the target is passed, so the winning side's
// run total is ALWAYS within a few runs of the loser's. Feeding those two
// numbers to the shared margin model rates every successful chase — including
// a ten-wicket demolition with eight overs to spare — as a nail-biter.
//
// The real measure of a close limited-overs match depends on who won:
//   • Team batting FIRST won  → margin is the run gap they defended.
//   • Team batting SECOND won → margin is what they had left: wickets in hand
//     and balls to spare. One wicket standing off the final ball is the
//     tightest possible finish; ten wickets and eight overs spare is a rout.
// A tie (Super Over) is the maximum.
type CricketInnings = { runs: number; wickets: number; overs: number };

// Pull the two innings out of a cricket competition. Returns null unless BOTH
// innings have a batting side identified — a first-innings-only (live) match has
// no closeness signal yet, and neither does a rain-abandoned game.
function readCricketInnings(competitors: MarginCompetitor[]): {
  first: CricketInnings;
  second: CricketInnings;
} | null {
  const byPeriod = new Map<number, CricketInnings>();
  for (const c of competitors) {
    const rows = c.linescores ?? [];
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      // Only the row flagged isBatting carries this innings' real runs/wickets.
      if (!row?.isBatting) continue;
      byPeriod.set(i + 1, {
        runs: row.runs ?? 0,
        wickets: row.wickets ?? 0,
        overs: row.overs ?? 0,
      });
    }
  }
  const first = byPeriod.get(1);
  const second = byPeriod.get(2);
  if (!first || !second) return null;
  return { first, second };
}

// ESPN reports overs as a decimal where the fraction is BALLS, not tenths:
// 18.3 means 18 overs and 3 balls = 111 balls, NOT 18.5 overs. Converting with
// plain arithmetic overstates every partial over.
function oversToBalls(overs: number): number {
  const whole = Math.floor(overs);
  const balls = Math.round((overs - whole) * 10);
  return whole * 6 + Math.min(balls, 5);
}

// 0-100 watchability for a completed/in-progress limited-overs match.
// Returns null when there isn't enough of the match on the board to judge.
function cricketRating(competitors: MarginCompetitor[], state: string): number | null {
  const innings = readCricketInnings(competitors);
  // Only the first innings has been batted — the chase hasn't started, so there
  // is no closeness to measure yet. Matches every other sport's "Too Early".
  if (!innings) return null;
  const { first, second } = innings;

  // Total overs allotted, inferred from the first innings rather than hardcoded
  // to 20: the same parser then handles a 50-over ODI, and a rain-shortened
  // innings scores against its own real allotment instead of a phantom 20.
  const allottedBalls = Math.max(oversToBalls(first.overs), 1);

  const chaseWon = second.runs > first.runs;
  const tied = second.runs === first.runs && state === "post";

  let closeness: number;
  if (tied) {
    // Tie → Super Over. The best possible finish in the format.
    closeness = 100;
  } else if (chaseWon) {
    // Won the chase. Two independent "how much was left" signals.
    // Wickets in hand: 1 = survived by a thread, 10 = never threatened.
    const wicketsInHand = Math.max(0, 10 - second.wickets);
    const wicketCloseness = Math.max(0, 100 - (wicketsInHand - 1) * 11);
    // Balls to spare, as a share of the innings. Winning off the last ball = 100.
    const ballsSpare = Math.max(0, allottedBalls - oversToBalls(second.overs));
    const ballCloseness = Math.max(0, 100 - (ballsSpare / allottedBalls) * 100);
    // Wickets weighted slightly higher: a side can win with overs to spare and
    // still have been three balls from collapse, and that match was tense.
    closeness = wicketCloseness * 0.55 + ballCloseness * 0.45;
  } else if (state === "post") {
    // Defended the total. Margin is the run gap — a sub-10-run defence is a
    // thriller, ~45 is comfortable, 60+ is a rout.
    closeness = Math.max(0, 100 - (first.runs - second.runs) * 2.2);
  } else {
    // Chase in progress and still behind. Rate the required rate against what's
    // left — a chase needing ~9 an over with wickets standing is the good stuff.
    const ballsLeft = Math.max(0, allottedBalls - oversToBalls(second.overs));
    if (ballsLeft === 0) return null;
    const runsNeeded = first.runs + 1 - second.runs;
    const required = (runsNeeded / ballsLeft) * 6;
    // 6/over or below = cruising; 12+/over = effectively gone. Peak tension
    // sits around 9-10, so score distance from a 9.5 target rather than
    // treating "higher required rate" as monotonically better.
    closeness = Math.max(0, 100 - Math.abs(required - 9.5) * 14);
    // A chase with no wickets left isn't tense, it's over.
    if (second.wickets >= 9) closeness *= 0.5;
  }

  // High-scoring games are more watchable — same idea as the generic scoring
  // bonus, scaled to T20 totals (a 200+ chase is a genuine spectacle).
  const scoringBonus = Math.min((first.runs + second.runs) / 45, 10);
  return Math.round(Math.max(0, Math.min(100, closeness + scoringBonus)));
}


// ── Volleyball (best-of-five sets) closeness ─────────────────────────────────
// ESPN's `score` for women's college volleyball is SETS won (0-3), and
// linescores[i].value is the points in set i (25-10 / 26-24 / 15-13). The
// generic scorer would read diff ∈ {1,2,3} and total ∈ {3,4,5} and rate every
// match the same, and calcRunningMargin would sum set points cumulatively,
// which rewards blowouts backwards. So volleyball scores three things of its
// own: how many sets it went, how close the sets were, and how close the set
// that decided it was — plus bonuses for a fifth set, deuce sets and a comeback.
type VolleyballCompetitor = MarginCompetitor & { score?: string };

// A set counts once it is over: to 25 (15 in the fifth) and won by two. Keeps
// a live match's in-progress set out of the averages, and trailing empty rows
// (ESPN pads unplayed sets on some feeds) out of everything.
function volleyballSetPoints(competitors: VolleyballCompetitor[]): Array<[number, number]> {
  const ls0 = competitors[0].linescores ?? [];
  const ls1 = competitors[1].linescores ?? [];
  const sets: Array<[number, number]> = [];
  for (let i = 0; i < Math.min(ls0.length, ls1.length); i++) {
    const a = ls0[i]?.value;
    const b = ls1[i]?.value;
    if (typeof a !== "number" || typeof b !== "number" || !Number.isFinite(a) || !Number.isFinite(b)) break;
    const target = i === 4 ? 15 : 25;
    if (Math.max(a, b) < target || Math.abs(a - b) < 2) break;
    sets.push([a, b]);
  }
  return sets;
}

// Set margin → 0-100. A two-point set is the ceiling (deuce or the bare
// minimum), and a 12-point set was never in doubt.
function volleyballPointCloseness(margin: number): number {
  return Math.max(0, Math.min(100, 100 - (margin - 2) * 10));
}

// 0-100 watchability for a volleyball match, or null while it is too early to
// say (a live match before its second set — the analogue of the < 0.12 gate).
function volleyballRating(competitors: VolleyballCompetitor[], period: number, state: string): number | null {
  const sets0 = parseInt(competitors[0].score ?? "", 10);
  const sets1 = parseInt(competitors[1].score ?? "", 10);
  if (Number.isNaN(sets0) || Number.isNaN(sets1)) return null;
  const live = state === "in";
  const hi = Math.max(sets0, sets1);
  const lo = Math.min(sets0, sets1);
  if (live && (period < 2 || hi + lo < 1)) return null;

  const played = volleyballSetPoints(competitors);
  // A finished match with no sets on the board (cancelled / forfeit) has
  // nothing to rate.
  if (!live && hi < 3 && played.length === 0) return null;

  // Factor 1 — sets closeness (45%). Finished: 3-2 → 85, 3-1 → 65, 3-0 → 30.
  // 85, not 100: the fifth-set bonus below already lifts every 3-2 by 15, and
  // at 100 the whole Sep 12 slate's 23 five-setters landed on 99-100 with
  // nothing to order them — at 85 the set margins do the ordering (84 → 100).
  // Live: sets so far — level in the fifth 100, level earlier 85, one set apart
  // 70, two apart (or 1-0) 45.
  let setsCloseness: number;
  if (!live) setsCloseness = lo >= 2 ? 85 : lo === 1 ? 65 : 30;
  else if (hi === lo) setsCloseness = hi >= 2 ? 100 : 85;
  else setsCloseness = hi - lo === 1 && hi >= 2 ? 70 : 45;

  // Factor 2 — point closeness (35%): mean set margin over the sets played.
  // Factor 3 — late-set closeness (20%): the last completed set, the one that
  // decided it (or the latest one, live). Both fall back to the sets score when
  // there are no linescores, so a sets-only feed still rates.
  let pointCloseness = setsCloseness;
  let lateCloseness = setsCloseness;
  if (played.length > 0) {
    const margins = played.map(([a, b]) => Math.abs(a - b));
    pointCloseness = volleyballPointCloseness(margins.reduce((s, m) => s + m, 0) / margins.length);
    lateCloseness = volleyballPointCloseness(margins[margins.length - 1]);
  }

  let score = setsCloseness * 0.45 + pointCloseness * 0.35 + lateCloseness * 0.2;

  // Bonuses. A fifth set is the format's own overtime.
  if (period >= 5 || played.length >= 5) score += 15;
  // Each deuce set (past 25, or past 15 in the fifth) +4, capped at 12.
  let deuce = 0;
  played.forEach(([a, b], i) => {
    if (Math.max(a, b) >= (i === 4 ? 16 : 26)) deuce += 4;
  });
  score += Math.min(deuce, 12);
  // Comeback, finished matches only: the winner lost the first two sets +20,
  // lost the first set +10. Read the set winners off the linescores so a feed
  // that lists the competitors in either order still gets it right.
  if (!live && sets0 !== sets1 && played.length >= 3) {
    const winnerIdx = sets0 > sets1 ? 0 : 1;
    const lostSet = (i: number) => played[i][winnerIdx] < played[i][1 - winnerIdx];
    if (lostSet(0) && lostSet(1)) score += 20;
    else if (lostSet(0)) score += 10;
  }

  return Math.round(Math.max(0, Math.min(100, score)));
}

function calculateRating(game: RatingGame): number | null {
  const competition = game.competitions?.[0];
  if (!competition) return null;

  const state = game.status?.type?.state ?? "";
  if (state === "pre") return null;

  const competitors = competition.competitors;
  if (!competitors || competitors.length < 2) return null;

  // Cricket branches out before the shared scorer touches it — see cricketRating
  // for why runs-vs-runs is actively misleading in this sport.
  if (game._sport === "cricket") return cricketRating(competitors, state);
  // Volleyball branches out too: its `score` is sets, not points.
  if (game._sport === "ncaavb") return volleyballRating(competitors, game.status?.period ?? 0, state);

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
  // Straight multiplier line for most sports; football reads the margin as how
  // many scores it takes to tie instead (see marginCloseness).
  const closeness = (margin: number) => marginCloseness(margin, config.multiplier, config.closenessCurve);
  const finalCloseness = closeness(diff);

  // --- Factor 2: Running margin throughout game (35%) ---
  // Average margin across all periods — rewards games that were close throughout
  // even if the final margin is large
  const runningMargin = calcRunningMargin(competitors);
  let runningCloseness: number;
  if (runningMargin !== null) {
    // Same scale as the final margin — a running average margin of 5 in NBA means it was tight
    runningCloseness = closeness(runningMargin);
  } else {
    // No linescore data (live game early on) — fall back to final margin
    runningCloseness = finalCloseness;
  }

  // --- Factor 3: Close entering final period (20%) ---
  // Games within striking distance at end are more watchable
  const fpMargin = calcFinalPeriodMargin(competitors);
  let finalPeriodCloseness: number;
  if (fpMargin !== null) {
    finalPeriodCloseness = closeness(fpMargin);
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

  // Low-scoring penalty for soccer: a 0-0 draw isn't exciting regardless of "closeness".
  // Use the canonical SOCCER_SPORTS set (same set the closeness model, the late-
  // drama bonus below, and day-reconcile all key off) so every soccer league is covered.
  // A hand-listed subset silently dropped ucl/uel, letting a goalless UCL/UEL draw skip
  // the penalty and rate 100 ("GREAT") where the identical EPL/FIFA match rates ~50.
  let lowScoringPenalty = 0;
  if (SOCCER_SPORTS.has(sport) && total < 2) {
    lowScoringPenalty = (2 - total) * 25; // 0 goals: -50, 1 goal: -25
  }

  // Late-drama bonus for soccer: a result swung late (e.g. a stoppage-time
  // winner) is the most compelling soccer there is, but the closeness factors
  // are blind to goal timing. Lifts a dramatic 1-0 out of the low-scoring
  // penalty's MEH hole while leaving a dull early 1-0 where it is. Gate off the
  // canonical SOCCER_SPORTS set (same as the low-scoring penalty above) — a
  // hand-listed subset here would silently drop the bonus for any soccer league
  // added to the set later, the exact ucl/uel drift the penalty comment warns of.
  const lateDramaBonus = SOCCER_SPORTS.has(sport) ? soccerLateDramaBonus(competition) : 0;

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

// Minimal shapes of ESPN's tennis scoreboard payload — only the fields the
// parser below reads. Real matches are athlete-based competitors nested in
// event.groupings[] (see buildTennisGames), not team-based like other sports.
type TennisAthlete = { shortName?: string; displayName?: string; flag?: { href?: string } };
type TennisLineScore = { winner?: boolean };
type TennisCompetitor = {
  homeAway?: string;
  athlete?: TennisAthlete;
  linescores?: TennisLineScore[];
  winner?: boolean;
};
type TennisMatch = {
  id?: string;
  date?: string;
  competitors?: TennisCompetitor[];
  status?: {
    type?: { state?: string; shortDetail?: string; detail?: string; completed?: boolean; name?: string };
    period?: number;
    displayClock?: string;
  };
  broadcasts?: { names?: string[] }[];
  round?: { displayName?: string };
};
type TennisEvent = { id?: string; date: string; name?: string };
// The scoreboard event that wraps the draws: singles/doubles live under
// groupings[], each grouping holding the actual matches (competitions[]).
type TennisGrouping = { grouping?: { slug?: string }; competitions?: TennisMatch[] };
type TennisScoreboardEvent = TennisEvent & { major?: boolean; groupings?: TennisGrouping[] };

function parseTennisMatch(match: TennisMatch, event: TennisEvent, slug: string): Game {
  const comps = match.competitors ?? [];
  const home = comps.find((c) => c.homeAway === "home") ?? comps[0];
  const away = comps.find((c) => c.homeAway === "away") ?? comps[1];
  const mkTeam = (c: TennisCompetitor): Team => {
    const a = c?.athlete ?? {};
    const setsWon = (c?.linescores ?? []).filter((l) => l.winner).length;
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
  // Tournament + year context for the strict highlight query. Without it the
  // tournament's own channel can still return the same players' match from a
  // DIFFERENT event/year (e.g. a French Open match resolving to "Rome Open
  // 2025"). Threaded through the Game's seriesNote,
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
  // Best-of-3 (all women's draws) needs 2 sets to win; best-of-5 (men's Slam
  // singles) needs 3. The grouping slug tells us which — ESPN's `format` field
  // is unreliable (reports 5 for both). Hoisted above the rating block so the
  // "went the distance" gate can require the winner to have actually reached it.
  const setsToWin = /women/.test(slug) ? 2 : 3;
  let rating: number | null = null;
  if (state === "post") {
    // GREAT is reserved for a match that went to a deciding final set (2-1 or
    // 3-2). Require the LOSER to have won at least one set AND the WINNER to have
    // reached setsToWin — otherwise a retirement (e.g. a man retiring at 1-1,
    // 2-1 or 2-2 in sets, or a first-set retirement up 1-0) or a walkover (0-0,
    // no sets played) also passes `diff <= 1` and gets rated GREAT, sorting the
    // LEAST watchable outcome to the top of the Rated view. Retirements/walkovers
    // aren't filtered out (buildTennisGames only drops POSTPONED/CANCELED/
    // SUSPENDED), so they reach here as finished games. A normally-completed
    // match always has its winner at setsToWin (2 or 3); an incomplete retirement
    // does not, so the `max >= setsToWin` check routes those to the 65 bucket
    // below while every real 2-1 / 3-2 decider keeps its 90.
    if (diff <= 1 && Math.min(hs, as) >= 1 && Math.max(hs, as) >= setsToWin) rating = 90; // went the distance (2-1 / 3-2)
    else if (hs + as >= 4 && diff === 2) rating = 78; // long match (3-1)
    else rating = 65;                       // straight sets / retirement / walkover
  } else if (state === "in" && setNow >= 2) {
    // Rate a live match by how level it is, capped below GREAT — GREAT is
    // reserved for finished deciders. Level (e.g. 1-1) reads best.
    rating = diff === 0 ? 78 : diff === 1 ? 68 : 55;
  }
  // Deciding set: a live match level on sets and into the final set — the
  // win-or-go-home stretch. Best-of-3 (all women's draws) decides at 1-1 in
  // set 3; best-of-5 (men's Slam singles) at 2-2 in set 5 (setsToWin, hoisted
  // above the rating block).
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
    dateIsEstimate: !match.date,
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
    isPreseason: false,
    recapUrl: null,
    rating,
    decidingSet,
    streamUrl: null,
    primeStreamUrl: null,
  };
}

// `when` is either ONE ET day (YYYYMMDD — the board's single-day slate) or an
// inclusive {from, to} range of ET days. The range form feeds the endgame
// lookahead: ESPN's tennis scoreboard ignores `?dates=A-B` and always returns
// the whole tournament, so the window has to be applied here, per match.
export function buildTennisGames(events: TennisScoreboardEvent[], when?: string | { from: string; to: string }): Game[] {
  const range = typeof when === "object" ? when : null;
  // No-date fallback uses the shared service day so tennis matches the rest of
  // the app's notion of "today" (normally `when` is always passed).
  const target = range ? null : (when ?? toYmd(getEtServiceDate()));
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
        const day = tennisEtYmd(match.date ?? "");
        if (range ? (day < range.from || day > range.to) : day !== target) continue;
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
  // Cup rounds (FA Cup / Copa del Rey / DFB-Pokal / Conference League, read
  // 2026-09-14): altGameNote is "English FA Cup, Third Round", "German Cup,
  // First Round", "UEFA Conference League, League Phase" — the ordinal-round
  // and league-phase forms are cup-only and never carry a result.
  if (/^(group [a-l]|round of \d+|quarter-?finals?|semi-?finals?|final|third place(?: match)?|matchday \d+|knockout(?: round)?(?: play-?offs?)?|(?:preliminary|qualifying|first|second|third|fourth|fifth|sixth) round|league phase)$/i.test(seg)) {
    return seg;
  }
  const slug = (seasonSlug ?? "").toLowerCase().trim();
  const slugMap: Record<string, string> = {
    "group-stage": "Group Stage",
    "round-of-32": "Round of 32",
    "round-of-16": "Round of 16",
    "quarterfinals": "Quarterfinals",
    "semifinals": "Semifinals",
    // ESPN's fifa.world scoreboard tags the third-place playoff's season.slug as
    // "3rd-place-match" — that is the exact key wcBracket.ts's SLUG2ROUND routes
    // the bracket's third-place slot on, so it's the one ESPN actually sends.
    // Keep the "third-place" spelling too so the label resolves either way and
    // this fallback can't silently return null for that one match.
    "3rd-place-match": "Third Place",
    "third-place": "Third Place",
    "final": "Final",
    // Cup + Conference League season.slugs, read from live fixtures 2026-09-14
    // (eng.fa, esp.copa_del_rey, ger.dfb_pokal, uefa.europa.conf). ESPN spells
    // the play-off round "knockout-round-playoffs", no hyphen in "playoffs".
    "qualifying-round": "Qualifying Round",
    "first-round": "First Round",
    "second-round": "Second Round",
    "third-round": "Third Round",
    "fourth-round": "Fourth Round",
    "fifth-round": "Fifth Round",
    "league-phase": "League Phase",
    "knockout-round-playoffs": "Knockout Round Playoffs",
    "knockout-round-play-offs": "Knockout Round Playoffs",
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

// A team-sport competitor inside a scoreboard event's competition: the
// team-parse fields (RawCompetitor) plus the extras parseGame reads — the
// home/away side, the soccer penalty-shootout score, the MLB probable starter,
// and the linescores/score the closeness scorer needs (MarginCompetitor).
type ScoreboardCompetitor = RawCompetitor &
  MarginCompetitor & {
    homeAway?: string;
    shootoutScore?: string | number | null;
    probables?: ProbableStarter[];
  };

// The venue block on a competition — name, dome flag, and address.
type ScoreboardVenue = {
  fullName?: string;
  indoor?: boolean;
  address?: { city?: string; state?: string; country?: string };
};

// A raw ESPN scoreboard event, modelling only the fields parseGame reads before
// it (and calculateRating — see RatingGame, which this is assignable to) turn it
// into a Game. `_sport` is stamped in place here so the rating scorer reads it
// back off the same object.
type ScoreboardEvent = {
  id: string;
  date: string;
  name?: string;
  shortName?: string;
  _sport?: Sport;
  season?: { type?: number; slug?: string };
  // ESPN ships the gridiron week on the event itself (and again at the top of
  // the scoreboard payload). Regular season only in practice — postseason
  // events reuse the numbering under season.type 3, which is why
  // gridironWeekNumber refuses to read it there.
  week?: { number?: number };
  status?: {
    displayClock?: string;
    period?: number;
    clock?: number;
    type?: {
      name?: string;
      state?: "pre" | "in" | "post";
      detail?: string;
      shortDetail?: string;
      completed?: boolean;
    };
  };
  links?: { rel?: string[]; href?: string }[];
  competitions?: Array<
    SoccerCompetition & {
      competitors?: ScoreboardCompetitor[];
      broadcasts?: { names?: string[] }[];
      headlines?: { video?: { links?: { web?: { href?: string } } }[] }[];
      notes?: { headline?: string }[];
      series?: { type?: string; summary?: string };
      venue?: ScoreboardVenue;
      altGameNote?: string;
    }
  >;
};

// Gridiron regular-season week, or null. This is the highlight-lookup gate for
// NFL/NCAAF — see Game.weekNumber and the `week` param in public/_worker.js.
//
// Two deliberate refusals:
//   • Non-gridiron sports return null. Nobody else's official channel titles by
//     week, and a spurious week token would only ever subtract matches.
//   • The POSTSEASON returns null even though ESPN keeps numbering weeks there
//     (season.type 3 restarts at 1). NFL titles the playoff cuts by round
//     ("Wild Card", "Divisional Round", "Super Bowl LX") and never by week, so
//     sending week=1 for a Wild Card game would gate against a token the title
//     doesn't carry — and, worse, would match a REGULAR-season Week 1 upload.
//     Preseason (type 1) is excluded for the same reason: its own Week 1–3
//     numbering collides head-on with the regular season's.
function gridironWeekNumber(sport: Sport, event: ScoreboardEvent): number | null {
  if (sport !== "nfl" && sport !== "ncaaf" && sport !== "cfl") return null;
  if (event.season?.type !== 2) return null;
  const week = event.week?.number;
  return typeof week === "number" && week >= 1 && week <= 25 ? week : null;
}

// NCAA baseball + softball: the two leagues whose postseason ESPN files as
// season type 6 and whose notes name regionals (see parseGame).
const COLLEGE_DIAMOND_SPORTS = new Set<Sport>(["ncaabase", "ncaasoft"]);

// The two college hockey feeds: a tournament note needs a round word before
// it sets isPlayoff (see parseGame).
const COLLEGE_HOCKEY_ROUND_WORD_SPORTS = new Set<Sport>(["ncaah", "ncaawh"]);

// Regulation length for the timed sports ESPN reports as "End of 4th" etc.
const END_OF_PLAY_REGULATION: Partial<Record<Sport, number>> = {
  nfl: 4, ncaaf: 4, ufl: 4, cfl: 4, nba: 4, wnba: 4, ncaaw: 4, ncaam: 2, nhl: 3, ncaah: 3, ncaawh: 3,
};

// "End of 4th" with the score not level IS the final (Jacob 9/12): no more
// play can happen, but ESPN keeps the game `in` for a few minutes until it
// posts "Final", so the card sat in the live group reading "End of Q4". Settle
// it here, before anything reads the status, so the card, its rating and the
// Final grouping all agree. A level score stays live — overtime is next.
// Only ESPN's own "End of" detail counts, never a 0:00 clock: a football play
// can run (and a PAT follow) at 0:00, and basketball free throws after the
// buzzer shoot with 0.0 on the clock.
export function settleEndOfRegulation(event: ScoreboardEvent, sport: Sport): void {
  const regulation = END_OF_PLAY_REGULATION[sport];
  const status = event.status;
  const type = status?.type;
  if (!regulation || !status || !type || type.state !== "in") return;
  if ((status.period ?? 0) < regulation || !/^end of\b/i.test(type.shortDetail ?? "")) return;
  const scores = (event.competitions?.[0]?.competitors ?? []).map((c) => Number.parseInt(c.score ?? "", 10));
  if (scores.length !== 2 || scores.some((n) => !Number.isFinite(n)) || scores[0] === scores[1]) return;
  const detail = (status.period ?? 0) > regulation ? "Final/OT" : "Final";
  status.type = { ...type, state: "post", completed: true, name: "STATUS_FINAL", shortDetail: detail, detail };
}

export function parseGame(event: ScoreboardEvent, sport: Sport): Game {
  settleEndOfRegulation(event, sport);
  const competition = event.competitions?.[0];
  const competitors = competition?.competitors ?? [];

  const home = competitors.find((c) => c.homeAway === "home");
  const away = competitors.find((c) => c.homeAway === "away");

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

  // Extract series game number and playoff round from notes
  let seriesNote: string | null = null;
  let playoffLabel: string | null = null;
  let isPlayoff = false;
  for (const note of competition?.notes ?? []) {
    const headline = note?.headline ?? "";
    const headlineLower = headline.toLowerCase();
    // Match the original-case headline, not the lowercased copy, so seriesNote
    // keeps ESPN's "Game 3" casing (the /i flag was the giveaway — it's a no-op
    // against already-lowercased text). It only feeds the YouTube highlight
    // query today, but that's case-preserving now if it ever surfaces in the UI.
    const match = headline.match(/Game \d+/i);
    if (match) {
      seriesNote = match[0];
    }
    // Detect playoff/postseason/tournament games from notes. `round` and
    // `finals?` carry word boundaries so they match the round names as whole
    // words and DON'T fire on unrelated substrings — an unbounded `final` hit
    // "Season Finale" (a regular-season note) and mislabeled the game as a
    // playoff, and `round` hit "ground"/"around". playoffLabel is user-visible
    // (game-detail modal + league header), so a false match shows wrong text.
    if (/playoff|postseason|wild.?card|divisional|conference|championship|\bfinals?\b|\brounds?\b|semi.?finals?|quarter.?finals?|elimination|play-in|tournament|march madness|ncaa|sweet.?16|elite.?8|final.?four|stanley.?cup|world.?series|super.?bowl|grey.?cup|nlds|nlcs|alds|alcs|alwc|nlwc/i.test(headlineLower)) {
      // College hockey's in-season tournaments ("Ice Breaker Tournament",
      // "Governor's Cup") are regular-season games that keep the 5-min OT +
      // shootout format, so only a ROUND word flags them as playoff — otherwise
      // a shootout renders "2OT" instead of "SO". The label still shows. Both
      // the men's and the women's feeds share the format.
      // Women's volleyball is the same trap at scale: ~150 in-season
      // invitationals ("Paradise Invitational", "SFA Tournament", "Ocean State
      // Cup") are regular-season matches. Its conference tournaments and the
      // NCAA tournament all carry a round word ("SEC Women's Volleyball
      // Tournament - Quarterfinal", "NCAA Women's Volleyball Championship -
      // First Round" / "Lexington Regional" / "Semifinal"; the final is the bare
      // "NCAA Women's Volleyball Championship"). Read from every 2025 note.
      // ESPN also tags the whole tournament season.type 2, so the type-3 check
      // below never helps here. "quarte?r?" absorbs the CAA's "Quartefinal" typo.
      if (sport === "ncaavb"
        ? /quarte?r?.?finals?|semi.?finals?|\bfinals?\b|\brounds?\b|championship|regional/i.test(headlineLower)
        : !COLLEGE_HOCKEY_ROUND_WORD_SPORTS.has(sport) || /quarter.?finals?|semi.?finals?|\bfinals?\b|\brounds?\b|championship|regional|frozen four/i.test(headlineLower)) {
        isPlayoff = true;
      }
      if (!playoffLabel) playoffLabel = headline;
    }
    // College baseball/softball postseason notes read "… Regional", "… Super
    // Regional" and "Men's/Women's College World Series … - Game N"; only the
    // last of those hits the generic list ("world series"), so the regionals
    // get their own gate. Scoped to the two diamond sports: "regional" is a
    // regular-season word elsewhere (a Regional Final in ncaah already has its
    // own rule above).
    if (COLLEGE_DIAMOND_SPORTS.has(sport) && /\bregional\b|super regional|world series|championship/i.test(headlineLower)) {
      isPlayoff = true;
      if (!playoffLabel) playoffLabel = headline;
    }
  }
  // Also check season type from the API when the notes above didn't flag it.
  // ESPN's seasontype numbering is 1=preseason, 2=regular, 3=postseason,
  // 4=off-season (all-star / exhibition) — the same convention this file relies
  // on elsewhere, where seasontype 1 is filtered out as preseason. Only type 3
  // is the playoffs; type 4 was mislabeling all-star/exhibition games as playoff,
  // which (via game.isPlayoff → GameCard's `period >= 5 && !isPlayoff` check)
  // suppressed the shootout "SO" label on any such game that reached a 5th period.
  // playoffLabel is unaffected — it's driven only by the notes match above.
  if (event.season?.type === 3) {
    isPlayoff = true;
  }
  // College baseball/softball file the whole NCAA tournament as type 6
  // ("championship-series", read 2026-09-14 on the CWS final 2026-06-21 and the
  // WCWS final 2026-06-04; a March fixture reads 2 / "regular-season"). Scoped
  // to the two diamond sports so no other league's type 6 is reinterpreted.
  if (COLLEGE_DIAMOND_SPORTS.has(sport) && event.season?.type === 6) {
    isPlayoff = true;
  }
  // Type 1 is the exhibition slate. Only NFL games ever carry it this far (the
  // preseason filter in eventsToGames drops it for every other sport), but the
  // flag is derived generically so a future carve-out doesn't have to remember
  // to add itself here. See Game.isPreseason for why the card needs this at all.
  const isPreseason = event.season?.type === 1;

  // Playoff series summary (e.g. "BOS leads series 3-1", "Series tied 2-2").
  // Only present on playoff competitions; regular-season series has no field.
  const rawSeriesSummary: string | null =
    competition?.series?.type === "playoff"
      ? (competition.series?.summary ?? null)
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
      recapUrl = link.href ?? null;
      break;
    }
  }

  // Venue location + indoor flag (the address object sits next to fullName).
  // ESPN's address.city is usually "City"/"City, State"; state/country round it
  // out. Guard against the occasional junk where city echoes the venue name.
  const venueObj: ScoreboardVenue = competition?.venue ?? {};
  const venueName: string = venueObj.fullName ?? "";
  const addr: NonNullable<ScoreboardVenue["address"]> = venueObj.address ?? {};
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
    weekNumber: gridironWeekNumber(sport, event),
    isPlayoff,
    isPreseason,
    playoffLabel,
    seriesStatus,
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
      // Clear the cache when the authoritative schedule didn't load, so a later
      // call retries instead of freezing an empty result for the whole session
      // (same guard as loadPrimeAsins / loadEspnAirings above). Promise.allSettled
      // never rejects, so the trailing .catch can't do this — a transient
      // big-inning-schedule.json miss would otherwise permanently drop the Big
      // Inning time + MLB.TV deep-link. A rail-only failure is left cached: the
      // schedule still loaded, and that path deliberately falls through.
      if (!scheduleDoc) bigInningPromise = null;
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

function scoreboardFetchArgs(sport: Sport): [retries: number, timeoutMs: number] {
  return sport === "tennis" ? [0, 5000] : [2, 10000];
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
    // UFL has no /game/ page on espn.com (404 for the 2026 United Bowl id,
    // checked 2026-09-14); /recap/ is the per-game page that answers 200.
    case "ufl": return `https://www.espn.com/ufl/recap/_/gameId/${game.id}`;
    case "nhl": return `https://www.espn.com/nhl/game/_/gameId/${game.id}`;
    // College hockey's per-game page is the boxscore (verified 2026-09-12).
    case "ncaah": return `https://www.espn.com/mens-college-hockey/boxscore?gameId=${game.id}`;
    // Same boxscore form for the women's feed (verified 2026-09-14, event 401903932).
    case "ncaawh": return `https://www.espn.com/womens-college-hockey/boxscore?gameId=${game.id}`;
    // Both college diamond sports have the plain game page (verified 2026-09-14
    // with 2026 ids 401851045 / 401846824: 200, no redirect).
    case "ncaabase": return `https://www.espn.com/college-baseball/game/_/gameId/${game.id}`;
    case "ncaasoft": return `https://www.espn.com/college-softball/game/_/gameId/${game.id}`;
    // ⚠️ Women's college volleyball has NO per-game page on espn.com. Checked
    // 2026-09-14 in a real browser on gameId 401884323: /game/_/gameId/,
    // /boxscore?gameId= and /boxscore/_/gameId/ all 404, and the events carry
    // an empty `links` array (no recapUrl). The scoreboard is the only page
    // that exists — the same section-landing compromise as the LLWS.
    case "ncaavb": return `https://www.espn.com/womens-college-volleyball/scoreboard`;
    // ESPN has no CFL pages any more; the worker also sets recapUrl to this.
    case "cfl": return `https://www.thescore.com/cfl/event/${game.id}`;
    // ⚠️ The Little League World Series has NO per-game page on espn.com.
    // Checked every plausible pattern on 2026-08-11 with a browser UA and a
    // real event id (401889776): /llws/, /llb/, /baseball/llb/,
    // /little-league-world-series/game/_/gameId/ and /mlb/game/_/gameId/ all
    // 404. The events themselves also carry no `links` array, so there is no
    // recapUrl to prefer. The section index is the only page that exists —
    // the same section-landing compromise golf and tennis already make below.
    case "llws": return `https://www.espn.com/little-league-world-series/`;
    // ⚠️ Rugby match pages REQUIRE the /league/<id> suffix. Without it ESPN
    // returns 503, not a redirect (verified 2026-08-11 on gameId 603459), so
    // the id has to be carried per competition rather than dropped.
    case "sixnations": return `https://www.espn.com/rugby/match/_/gameId/${game.id}/league/180659`;
    case "rugbywc":    return `https://www.espn.com/rugby/match/_/gameId/${game.id}/league/164205`;
    case "rugbychamp": return `https://www.espn.com/rugby/match/_/gameId/${game.id}/league/271937`;
    case "superrugby": return `https://www.espn.com/rugby/match/_/gameId/${game.id}/league/242041`;
    case "rugbytest":  return `https://www.espn.com/rugby/match/_/gameId/${game.id}/league/289234`;
    case "nationschamp": return `https://www.espn.com/rugby/match/_/gameId/${game.id}/league/17567`;
    case "epl":
    case "mls":
    case "fifa":
    case "ucl":
    case "uel":
    case "laliga":
    case "seriea":
    case "bundesliga":
    case "ligue1":
    case "ligamx":
    case "nwsl":
    case "efl":
    case "libertadores":
    case "euro":
    case "afcon":
    case "saudi":
    case "uecl":
    case "facup":
    case "copadelrey":
    case "dfbpokal":
      return `https://www.espn.com/soccer/match/_/gameId/${game.id}`;
    // ESPN serves cricket off its India edition; 8048 is the IPL series id
    // (same id as SPORT_PATHS). The /scorecard/ path is the per-match page.
    case "cricket": return `https://www.espn.in/cricket/series/8048/scorecard/${game.id}`;
    case "golf": return `https://www.espn.com/golf/leaderboard`;
    case "tennis": return `https://www.espn.com/tennis/scoreboard`;
    // F1/UFC render as event tiles (no Game objects) — these are here only for
    // switch exhaustiveness.
    case "f1": return `https://www.espn.com/f1/`;
    case "nascar": return `https://www.espn.com/racing/`;
    case "indycar": return `https://www.espn.com/racing/indycar/`;
    case "ufc": return `https://www.espn.com/mma/`;
    // Neither sport produces `Game` rows (both are eventCard leagues), so
    // these are unreachable in practice — but the switch must be total, and
    // a sport-section landing beats falling through to a wrong league page.
    case "boxing": return `https://www.espn.com/boxing/`;
    case "chess": return `https://lichess.org/broadcast`;
    case "poker": return `https://www.wsop.com/schedule/`;
    // PandaScore supplies no public per-match page, so there is no gamecast
    // to link to; this only satisfies the exhaustive switch.
    case "esports": return `https://www.pandascore.co/`;
    // A Top events card keeps its REAL sport, so this never runs either.
    case "top": return `https://www.espn.com/`;
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
    // UFL splits between FOX/FS1 and ESPN/ABC/ESPN2 (2026: 13 of the 22 May–June
    // fixtures on FOX/FS1, the United Bowl on ABC). FOX games stream on the
    // FOX Sports app, so its live hub is the better landing.
    case "ufl": return "https://www.foxsports.com/live";
    case "nhl": return "https://www.espn.com/watch/";
    // ESPN+ carries most college hockey; the tournament finals air on ESPN.
    case "ncaah": return "https://www.espn.com/watch/";
    case "ncaawh": return "https://www.espn.com/watch/";
    // ESPN / ESPN+ / SEC Network carry nearly all college baseball and softball.
    case "ncaabase": return "https://www.espn.com/watch/";
    case "ncaasoft": return "https://www.espn.com/watch/";
    // ESPN+ / ESPN2 / ESPNU and the conference networks (B1G+, ACCNX, SECN)
    // carry college volleyball; the tournament airs on the ESPN networks.
    case "ncaavb": return "https://www.espn.com/watch/";
    // CBS Sports Network carries 34 regular-season games in 2026 (the last
    // year of that deal); everything else, playoffs included, streams free on
    // CFL+. There is no stable CFL+ landing (cfl.ca/cflplus, /watch/ and
    // /where-to-watch/ all 404), so this year-specific page is the one that
    // resolves. Re-check with the 2027 schedule.
    case "cfl": return "https://cfl.ca/where-to-watch-2026-broadcast-information/";
    case "mlb": return "https://www.mlb.com/tv";
    // The LLWS is an ESPN-network property end to end (ESPN / ESPN2 / ABC),
    // so ESPN's own watch hub is the correct and only landing.
    case "llws": return "https://www.espn.com/watch/";
    // Rugby's US rights are split and they move between cycles (CBS/Paramount+
    // has had the Six Nations, Peacock had RWC 2023, FloRugby carries Super
    // Rugby). Naming any one of them would be wrong for most fixtures, so all
    // five land on ESPN's rugby section — verified 200 on 2026-08-11 — which
    // lists where each match is actually being shown.
    case "sixnations":
    case "rugbywc":
    case "rugbychamp":
    case "superrugby":
    case "rugbytest":
    case "nationschamp":
      return "https://www.espn.com/rugby/";
    case "mls": return "https://tv.apple.com/us/mls";
    case "epl": return "https://www.peacocktv.com/";
    case "fifa": return "https://www.foxsports.com/soccer/fifa-world-cup";
    // UCL / UEL: Paramount+ holds US rights through 2030.
    case "ucl": return "https://www.paramountplus.com/shows/uefa-champions-league/";
    case "uel": return "https://www.paramountplus.com/shows/uefa-europa-league/";
    // US rights for the other big-five leagues: ESPN+ carries LaLiga and the
    // Bundesliga, Paramount+ carries Serie A (same house as UCL/UEL), beIN
    // Sports carries Ligue 1. Verified reachable 2026-08-03.
    case "laliga": return "https://plus.espn.com/";
    case "bundesliga": return "https://plus.espn.com/";
    case "seriea": return "https://www.paramountplus.com/shows/serie-a/";
    case "ligue1": return "https://www.beinsports.com/en-us/";
    // Second-wave soccer — US streaming homes. Every URL below was fetched with
    // a browser UA on 2026-08-03 and returned 200; none is a guess. As with the
    // big-five block these are last-resort landings, so a league-level watch
    // page is correct even where rights are split across several carriers.
    // Liga MX: rights are split by club — ViX (TelevisaUnivision) carries the
    // largest share and is the single best landing; TUDN/Fox Deportes hold the
    // rest.
    case "ligamx": return "https://vix.com/";
    // NWSL rights are split four ways (ESPN, Prime Video, CBS, Scripps), so the
    // league's own watch page is the only destination that covers every match.
    case "nwsl": return "https://www.nwslsoccer.com/watch";
    case "efl": return "https://plus.espn.com/";
    case "libertadores": return "https://www.beinsports.com/en-us/";
    case "afcon": return "https://www.beinsports.com/en-us/";
    case "euro": return "https://www.foxsports.com/soccer/uefa-european-championship";
    case "saudi": return "https://www.fanatiz.com/";
    // Conference League: every 2025-26 and 2026-27 fixture ESPN lists carries a
    // "Paramount+" broadcast (108/108 league-phase, 45/45 knockout, read
    // 2026-09-14) — CBS holds all three UEFA club competitions in the US.
    case "uecl": return "https://www.paramountplus.com/";
    // FA Cup / Copa del Rey / DFB-Pokal: ESPN+ on every 2025-26 fixture that
    // named a broadcaster (FA Cup 63/63 from the third round, Copa del Rey
    // 18/18 knockouts, DFB-Pokal 43/63), read 2026-09-14.
    case "facup": return "https://plus.espn.com/";
    case "copadelrey": return "https://plus.espn.com/";
    case "dfbpokal": return "https://plus.espn.com/";
    // Willow TV holds the US broadcast rights to the IPL (and to most
    // international cricket). Verified reachable 2026-08-03.
    case "cricket": return "https://www.willow.tv/";
    case "tennis": return "https://www.tennischannel.com/";
    case "golf": return "https://www.pgatour.com/live";
    case "f1": return "https://f1tv.formula1.com/";
    // NASCAR's US rights are split four ways (FOX / Prime / TNT / NBC), so the
    // league's own watch hub is the only landing that covers the whole season.
    // Heads-up for anyone reading a link-check report: nascar.com sits behind a
    // bot wall and returns 403 to every scripted request, including its own
    // homepage. check-watch-links.mjs already classifies 403 as WARN-not-FAIL
    // for exactly this case — it is not rot, do not "fix" it.
    case "nascar": return "https://www.nascar.com/watch/";
    // FOX Sports holds exclusive US IndyCar rights; indycar.com/tv is the
    // league's own where-to-watch page and returns 200.
    case "indycar": return "https://www.indycar.com/tv";
    case "ufc": return "https://www.espn.com/watch/";
    // Boxing has no single home — cards split across DAZN, ESPN and
    // Prime PPV — so send people to the schedule rather than guess a
    // streamer that is wrong most nights. Chess streams free on Lichess.
    case "boxing": return "https://www.espn.com/boxing/schedule/";
    case "chess": return "https://lichess.org/broadcast";
    // Poker cards carry a per-event official URL. This is only the exhaustive
    // last-resort landing and intentionally avoids a result/standings page.
    case "poker": return "https://www.wsop.com/schedule/";
    // Every tier-s/a match streams free on Twitch; the channel varies per
    // league, so the directory is the only destination right for all of them.
    case "esports": return "https://www.twitch.tv/directory/category/league-of-legends";
    case "top": return "https://www.espn.com/watch";
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
  // Guard an empty gameId: golf tournaments have no per-game id (GolfLeaderboard
  // passes ""), so an ESPN golf broadcast produced the malformed player URL
  // ".../id/" with a trailing empty id. That string is truthy, so the caller's
  // `?? sportStreamFallback` never fired and the user landed on a broken deep
  // link. Fall back to ESPN's generic watch page — the right home for an ESPN
  // broadcast with no airing id, and byte-identical for every caller that does
  // pass a real game.id (GameCard, GameDetailModal, the scoreboard streamUrl).
  if (b.includes("espn")) return gameId ? `https://www.espn.com/watch/player/_/id/${gameId}` : "https://www.espn.com/watch/";
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
  // CBS Sports Network (the cable channel) → the CBS Sports live page. The
  // includes() lines are the safety net: ESPN writes the cable channel as
  // "CBSSN" on NWSL but spells it "CBS Sports Network" elsewhere, and an
  // exact-match-only table sends a real CBS airing to the league's generic
  // watch page — a chip that names a network and then doesn't go there.
  if (b === "cbs") return "https://www.cbs.com/live-tv/";
  if (b === "cbssn" || b.includes("cbs sports")) return "https://www.cbssports.com/watch/live";
  if (b.includes("cbs")) return "https://www.cbs.com/live-tv/";
  // NWSL's other three carriers. Between them ION, NWSL+ and Victory+ hold 31
  // of the league's 54 matches in a six-week sample (2026-07-01 → 08-12, live
  // ESPN scoreboard) — a clear majority of the season, all of it previously
  // falling through to the generic league landing. All three verified 200 with
  // a browser UA on 2026-08-11. NWSL+ IS nwslsoccer.com's own service, so it
  // resolves to the same place the fallback would; it is listed anyway so the
  // match is deliberate rather than a coincidence that a later edit could break.
  if (b === "ion" || b === "ion television") return "https://www.iontelevision.com/";
  if (b === "ion plus" || b === "ion+") return "https://ionplustv.com/";
  if (b === "nwsl+" || b === "nwsl plus") return "https://www.nwslsoccer.com/watch";
  if (b === "victory+" || b === "victory plus") return "https://victoryplus.com/";
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

// Perfect-game confirmation, straight from MLB's own live-feed flags.
//
// The schedule+linescore hydrate CANNOT prove a perfect game. `leftOnBase`
// counts only runners stranded when an inning ends, so a baserunner who is
// erased still leaves runs+LOB at 0: Dansby Swanson walked in the 6th of
// CHC@WSH on 2026-08-13 and was doubled off, and the old runs+LOB proxy kept
// flying PERFECT GAME on a bid that had already died. Walks that score, HBP
// and errors have the same hole.
//
// The v1.1 live feed carries the authoritative flags, and a `fields` filter
// trims that ~525 KB payload to ~165 bytes — cheap enough to poll for the
// handful of games that ever clear the no-hit gate. Cached + refreshed in the
// background so the score poll never blocks on it, and a cold or failed cache
// reads as "not perfect", which degrades to the No-Hitter badge rather than
// over-claiming.
//
// Verified by replaying Domingo German's 2023-06-28 perfect game through the
// feed's `timecode` param: awayTeamPerfectGame flips true at Top 6 — the same
// threshold the gate below already uses — and stays true to the final out. So
// the flag is live, not a post-game stamp, and it does not under-report inside
// our window. (It is also non-inverted: German pitched for the AWAY team.)
interface PerfectFlags {
  awayTeamPerfectGame: boolean; // away team is THROWING the perfect game
  homeTeamPerfectGame: boolean;
}
const perfectFlagsCache = new Map<string, { ts: number; flags: PerfectFlags }>();
const perfectFlagsInFlight = new Set<string>();
const PERFECT_FLAGS_TTL = 15_000;
// Serve-while-revalidate has a ceiling: if the feed goes away entirely we must
// stop trusting a cached `true`, or a dead fetch freezes PERFECT GAME on screen
// for the rest of the game.
const PERFECT_FLAGS_MAX_AGE = 90_000;

async function refreshPerfectFlags(gamePk: string): Promise<void> {
  if (perfectFlagsInFlight.has(gamePk)) return;
  perfectFlagsInFlight.add(gamePk);
  try {
    const res = await fetchWithRetry(
      `https://statsapi.mlb.com/api/v1.1/game/${gamePk}/feed/live?fields=gameData,flags,awayTeamPerfectGame,homeTeamPerfectGame`,
      1,
      5000,
    );
    if (!res.ok) return;
    const data = await res.json();
    const f = data?.gameData?.flags;
    if (!f) return;
    perfectFlagsCache.set(gamePk, {
      ts: Date.now(),
      flags: {
        awayTeamPerfectGame: f.awayTeamPerfectGame === true,
        homeTeamPerfectGame: f.homeTeamPerfectGame === true,
      },
    });
  } catch {
    // Non-critical — the bid just stays labelled a no-hitter this round.
  } finally {
    perfectFlagsInFlight.delete(gamePk);
  }
}

// Has MLB confirmed `side` is throwing a perfect game? Kicks off a background
// refresh when the cache is cold or stale, and answers false until one lands.
function isPerfectGameConfirmed(gamePk: string, side: "away" | "home"): boolean {
  const entry = perfectFlagsCache.get(gamePk);
  const age = entry ? Date.now() - entry.ts : Infinity;
  if (age > PERFECT_FLAGS_TTL) void refreshPerfectFlags(gamePk);
  if (!entry || age > PERFECT_FLAGS_MAX_AGE) return false;
  return side === "home" ? entry.flags.homeTeamPerfectGame : entry.flags.awayTeamPerfectGame;
}

// MLB Stats API: fetch per-game metadata for a date, keyed by "away@home"
// (abbreviations). Returns the gamePk for the MLB.tv deep link plus the live
// linescore signals needed to compute the No-Hit Alert badge.
interface MlbGameMeta {
  gamePk: string;
  isLive: boolean;       // status.abstractGameState === "Live"
  awayHits?: number;
  homeHits?: number;
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
      // ET service day (matches the date-nav) — not the server's local day, which
      // reintroduced the midnight–1AM drift etDay.ts already eliminated elsewhere.
      const ymd = toYmd(getEtServiceDate());
      apiDate = `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`;
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
          currentInning: ls.currentInning,
        };
        // Key by "away@home". A doubleheader is two games with the SAME
        // away/home team on the same date, so both collide on one key — and
        // the ESPN consumer (which also keys by away@home, with no game number
        // to tell the two cards apart) can't attribute the metadata to the
        // right card. Rather than let game 2 silently overwrite game 1 and
        // stamp its stream link + No-Hit Alert onto BOTH ESPN cards (a wrong
        // deep link, and a score-revealing no-hit badge on the wrong game),
        // drop the key on collision so both games fall through the consumer's
        // `if (!meta) continue` — no deep link / no alert, the same graceful
        // degradation the fetch-failure path already yields.
        const key = `${awayAbbrev}@${homeAbbrev}`;
        if (map.has(key)) {
          map.delete(key);
          continue;
        }
        map.set(key, meta);
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
      // ET service day (matches the date-nav) — not the server's local day, which
      // reintroduced the midnight–1AM drift etDay.ts already eliminated elsewhere.
      const ymd = toYmd(getEtServiceDate());
      apiDate = `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`;
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

// NHL team abbreviation mapping: ESPN → NHL public API (api-web.nhle.com).
// Most codes match, but ESPN uses 2-char abbreviations for a few teams where
// NHL's own API uses its canonical 3-char form (ESPN "TB" vs NHL "TBL", etc.).
// The nhl.com/tv deep-link lookup below keys an ESPN abbreviation against the
// NHL-abbrev map from fetchNHLGameIds, so without translating, those teams
// silently miss and keep the generic espn.com/watch fallback — the same
// ESPN-vs-league divergence ESPN_TO_MLB_ABBREV handles for MLB, and the reason
// enrichNhlVideos matches on displayName instead of abbreviation.
const ESPN_TO_NHL_ABBREV: Record<string, string> = {
  TB: "TBL",
  SJ: "SJS",
  LA: "LAK",
  NJ: "NJD",
};

function espnToNhlAbbrev(espnAbbrev: string): string {
  return ESPN_TO_NHL_ABBREV[espnAbbrev] || espnAbbrev;
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
type BroadcastEntry = { names?: string[]; media?: { shortName?: string }; name?: string };
function eventBroadcasts(comp: { broadcasts?: BroadcastEntry[] } | null | undefined): string[] {
  const out: string[] = [];
  for (const b of comp?.broadcasts ?? []) {
    if (Array.isArray(b?.names)) out.push(...b.names);
    else if (b?.media?.shortName) out.push(b.media.shortName);
    else if (typeof b?.name === "string") out.push(b.name);
  }
  return [...new Set(out.filter(Boolean))];
}

// Minimal shapes of ESPN's F1/UFC single-event payload — only the fields
// fetchLeagueEvent reads. `competitions` are the race sessions (F1) or the
// individual bouts (UFC); each bout's competitors are the two fighters.
// fullName is the track/arena name. Only the racing tile reads it (NASCAR puts
// its track here because it has no `circuit` object); the UFC path uses the
// address alone, which is why the field wasn't needed before.
type LeagueEventVenue = { fullName?: string; address?: { city?: string; state?: string; country?: string } };
type LeagueEventCircuit = { fullName?: string; address?: { city?: string; country?: string } };
type LeagueEventCompetitor = {
  athlete?: { displayName?: string; shortName?: string; flag?: { href?: string; alt?: string } };
  records?: { summary?: string }[];
};
type LeagueEventCompetition = {
  id?: string | number;
  date?: string;
  type?: { id?: string | number; text?: string; abbreviation?: string };
  status?: { type?: { state?: string } };
  venue?: LeagueEventVenue;
  competitors?: LeagueEventCompetitor[];
  broadcasts?: BroadcastEntry[];
};
type LeagueEvent = {
  date: string;
  name?: string;
  shortName?: string;
  links?: { href?: string }[];
  status?: { type?: { state?: string } };
  circuit?: LeagueEventCircuit;
  venue?: LeagueEventVenue;
  competitions?: LeagueEventCompetition[];
};

// F1 / UFC single-event fetch → a spoiler-safe LeagueEventCard (no results).
// Tries the viewed date first; if ESPN has no event that day (most days), it
// falls back to the current/next event so an opt-in column always shows the
// upcoming race / fight card rather than going empty.
// Per-series bits for the shared race tile. `channel` is the exact YouTube
// author_name (the highlight worker matches on channel identity, not title
// text) — both were read off the canonical channel's RSS <author><name> on
// 2026-08-03, NOT guessed from the @handle. That distinction matters: the
// @NASCAR and @IndyCar landing pages surface a *different* channelId in their
// markup than their own rel=canonical, so scraping the page body yields
// "NASCAR Classics" / "INDY NXT by Firestone" — sibling channels that post no
// Cup or IndyCar race highlights at all.
const RACING_SERIES: Record<"f1" | "nascar" | "indycar", {
  label: string;
  queryPrefix: string;
  channel: string;
}> = {
  f1: { label: "F1", queryPrefix: "Formula 1", channel: "FORMULA 1" },
  nascar: { label: "NASCAR", queryPrefix: "NASCAR Cup Series", channel: "NASCAR" },
  // ⚠️ Sponsor-prefixed, the exact hazard the Ligue 1 note in youtube.ts calls
  // out: title sponsors rotate and the channel renames with them. A stale
  // string doesn't serve the wrong uploader: the strict lookup misses and the
  // tile hides its button. Re-verify if the IndyCar highlight stops resolving.
  indycar: { label: "IndyCar", queryPrefix: "INDYCAR", channel: "NTT INDYCAR SERIES" },
};

// Reduce an ESPN race name to the token(s) that identify WHICH race it is, for
// the worker's race gate (`race=` on /api/youtube — see raceTitleMatches in
// public/_worker.js). Each series has exactly one official channel that uploads
// all season, so the channel gate cannot tell two races apart; without a token
// the tile plays whatever that channel posted most recently.
//
// Verified 2026-08-03 against all 50 completed 2026 races: with these tokens
// every one of the 43 correctly-matched races still resolves, and all 7
// mismatches are rejected (button hides instead of playing the wrong race).
export function buildRaceTokens(sport: string, name: string): string[] {
  const n = name.trim();
  if (!n) return [];
  if (sport === "f1") {
    // ESPN prefixes the title sponsor, which is actively dangerous here:
    // "Qatar Airways Australian Grand Prix" is the AUSTRALIAN race, and a
    // naive token would match the Qatar GP. The identifying word is always the
    // last one before "Grand Prix" ("Australian", "Barcelona-Catalunya").
    const m = n.match(/(\S+)\s+Grand\s+Prix/i);
    return m ? [m[1]] : [n];
  }
  if (sport === "nascar") {
    // "NASCAR Cup Series at Watkins Glen" → "Watkins Glen".
    // "NASCAR Cup Series All Star Race" → "All Star Race" (channel hyphenates
    // it; the gate normalizes punctuation). "Daytona 500" passes through.
    const stripped = n
      .replace(/^NASCAR\s+[\w'’]+(?:\s+Auto\s+Parts)?\s+Series\s*/i, "")
      .replace(/^at\s+/i, "")
      .trim();
    return [stripped || n];
  }
  if (sport === "indycar") {
    // "Grand Prix of Mid-Ohio" → "Mid-Ohio". The parenthetical on
    // "Grand Prix of Indianapolis (Road Course)" is dropped — the channel
    // titles it plainly "INDYCAR at Indianapolis".
    const stripped = n
      .replace(/^Grand\s+Prix\s+of\s+/i, "")
      .replace(/\s*\([^)]*\)\s*$/, "")
      .trim();
    return [stripped || n];
  }
  return [];
}

// ── Chess + Boxing: the two Phase-D leagues that do NOT come from ESPN ──────
// ESPN has no endpoint for either (its core API literally rejects boxing:
// "Invalid sport (boxing)"), so both are served by worker routes — /api/chess
// proxies Lichess's broadcast API, /api/boxing calls boxing-data.com with a
// key that must stay server-side. See public/_worker.js.

interface ChessApiEvent {
  id: string; name: string; state: "pre" | "in" | "post"; round: string;
  startsAt: number | null; endsAt: number | null; format: string;
  timeControl: string; location: string; players: string[];
  url: string | null; website: string | null; tier: number;
}

// Chess has NO highlight package anywhere — verified 2026-08-10 across every
// organizer that broadcasts on Lichess. What the organizers do post is the
// round itself as a full VOD ("2026 Sinquefield Cup: Round 1 | #GrandChessTour",
// "FIDE World University Team Chess Championship 2026 - Almaty Diary, Day 5").
// Saint Louis last published a "Recap"-titled cut in 2019. So the chess tile
// offers a ROUND REPLAY, not highlights, and only from an organizer whose exact
// YouTube author_name is verified below — read off <link rel="canonical"> on the
// handle page → the channel RSS <author><name>, never scraped from the channel
// page body (that returns a RECOMMENDED channel; @SaintLouisChessClub and
// @FIDE both resolved to unrelated personal accounts that way).
// Anything without a mapping stays dark rather than falling through to a search.
const CHESS_ORGANIZER_CHANNELS: { rx: RegExp; channel: string }[] = [
  // Grand Chess Tour + everything hosted in Saint Louis (Sinquefield Cup,
  // Cairns Cup, Saint Louis Rapid & Blitz, American Cup, Champions Showdown).
  { rx: /\b(GCT|Sinquefield|Cairns|Saint Louis|St\.? Louis|American Cup|Champions Showdown)\b/i, channel: "Saint Louis Chess Club" },
  // FIDE's own channel (@fide_chess). ⚠️ "fidechess" (@FIDEchess) is a
  // different, unrelated account — keep this string byte-exact.
  { rx: /\bFIDE\b/i, channel: "FIDE chess" },
];

// Reduce a Lichess broadcast name to the token that identifies WHICH event it
// is, for the worker's title gate (`race=` on /api/youtube — a generic
// "title must contain one of these" filter, named for its first caller).
// One organizer channel covers a whole season of events, so without a token the
// tile plays whatever that channel uploaded most recently.
//   "GCT: Sinquefield Cup 2026 | Classical"          → "Sinquefield Cup"
//   "FIDE World University Team Chess Championship 2026 (Finals)"
//                                    → "FIDE World University Team Chess Championship"
export function buildChessTokens(name: string): string[] {
  const base = String(name || "")
    .split("|")[0]
    .replace(/^GCT:\s*/i, "")
    .replace(/\s*\([^)]*\)\s*/g, " ")
    .replace(/\b(?:19|20)\d{2}\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return base ? [base] : [];
}

// Pick the event to show for `date`: prefer one actually running, then the next
// one due, then the most recent finished. Mirrors how the F1/UFC tile behaves
// on a day with no session — an empty column is worse than a nearby event.
export async function fetchChessEvent(date?: string): Promise<EventFetchResult> {
  try {
    const res = await fetchWithRetry(`${getApiBase()}/api/chess`);
    if (!res.ok) return EVENT_FETCH_FAILED;
    const { events } = (await res.json()) as { events: ChessApiEvent[] };
    // Lichess answering with an empty list is a real (if rare) quiet day, not a
    // failure — see EventFetchResult.
    if (!Array.isArray(events)) return EVENT_FETCH_FAILED;
    if (!events.length) return EVENT_FETCH_EMPTY;
    const target = date ? fromYmd(date).getTime() : Date.now();
    const onDate = (e: ChessApiEvent) =>
      e.startsAt != null && Math.abs(e.startsAt - target) < 24 * 60 * 60 * 1000;
    const byTier = (a: ChessApiEvent, b: ChessApiEvent) => (b.tier || 0) - (a.tier || 0);
    const newestFirst = (a: ChessApiEvent, b: ChessApiEvent) => (b.startsAt ?? 0) - (a.startsAt ?? 0);
    // Same rule the race/fight tile now follows: on a PAST board date, never
    // show something that had not happened yet on that day. The live-first
    // chain below is right for Today (Lichess always has SOMETHING running, so
    // it would otherwise pin a currently-live tournament onto every past tab
    // and hide the one that was actually being played then).
    const isPastDate = !!date && date < toYmd(getEtServiceDate());
    const dayMs = 24 * 60 * 60 * 1000;
    const startedBy = (e: ChessApiEvent) => e.startsAt != null && e.startsAt <= target + dayMs / 2;
    const runningOn = (e: ChessApiEvent) =>
      startedBy(e) && (e.endsAt == null || e.endsAt >= target - dayMs / 2);
    const chosen = isPastDate
      ? events.filter(runningOn).sort(byTier)[0] ??
        events.filter(startedBy).sort(newestFirst)[0]
      : events.filter((e) => e.state === "in" && onDate(e)).sort(byTier)[0] ??
        events.filter((e) => e.state === "in").sort(byTier)[0] ??
        events.filter((e) => e.state === "pre").sort((a, b) => (a.startsAt ?? 0) - (b.startsAt ?? 0))[0] ??
        events.filter((e) => e.state === "post").sort(newestFirst)[0];
    if (!chosen) return EVENT_FETCH_EMPTY;
    // Lichess names read "GCT: Saint Louis Rapid & Blitz 2026 | Rapid" — the
    // segment after "|" duplicates what chessFormat/timeControl already say.
    const [name, ...rest] = chosen.name.split("|").map((s) => s.trim());
    // Has the round's first move actually been played? Lichess flips a tour to
    // state "in" when its WINDOW opens, which can be hours before play starts —
    // on 2026-08-10 at 09:51 ET the Sinquefield Cup read "in" while Round 1 was
    // still a 13:30 start. Ask for a round video in that gap and YouTube's own
    // search happily returns the organizer's SCHEDULED stream, so the button
    // opened a countdown instead of chess (Jacob 8/10). No start time (older
    // Lichess entries) is treated as started — the previous behaviour.
    const hasStarted = chosen.startsAt == null || chosen.startsAt <= Date.now();
    const state = chessEventState(chosen.state, chosen.endsAt);
    const card: LeagueEventCard = {
      kind: "chess",
      title: name || chosen.name,
      subtitle: [chosen.location, rest.join(" · ")].filter(Boolean).join(" · ") || undefined,
      state,
      statusDetail: state === "in" ? "Live" : state === "post" ? "Final" : "Upcoming",
      date: new Date(chosen.startsAt ?? Date.now()).toISOString(),
      broadcasts: [],
      chessRound: chosen.round || undefined,
      chessFormat: chosen.format || undefined,
      chessTimeControl: chosen.timeControl || undefined,
      chessPlayers: chosen.players?.length ? chosen.players : undefined,
      chessTier: chosen.tier,
      // The organizer's own broadcast of this round (see
      // CHESS_ORGANIZER_CHANNELS) — the whole session end to end, because no
      // chess body cuts a highlight package. Saint Louis DOES post short recaps
      // ("Important Win for Fabi…", "Champion Praggnanandhaa…") but every one
      // names the result in its title, which is the one thing this app cannot
      // show. Undefined for any event without a verified organizer, and until
      // the round has actually begun — EventCard hides the button when
      // officialChannel is missing.
      officialChannel: hasStarted
        ? CHESS_ORGANIZER_CHANNELS.find((o) => o.rx.test(chosen.name))?.channel
        : undefined,
      // "Round" read as a mystery button (Jacob 8/10). Say what it opens: the
      // full round, not a highlight reel.
      officialLabel: "Full round",
      highlightQuery: `${name || chosen.name}${chosen.round ? ` ${chosen.round}` : ""}`,
      raceTokens: buildChessTokens(chosen.name),
      // Lichess's own board is the watch destination — it is live, free, and
      // (unlike a results page) shows the game rather than the outcome.
      eventUrl: chosen.url ?? chosen.website ?? undefined,
    };
    return { card, failed: false };
  } catch {
    return EVENT_FETCH_FAILED;
  }
}

interface EsportsApiGame {
  id: string; date: string | null; state: "pre" | "in" | "post";
  bestOf: number | null; league: string; serie: string; tier: string; title: string;
  away: { id: string; name: string; acronym: string; image: string; score: string };
  home: { id: string; name: string; acronym: string; image: string; score: string };
  winnerId: string | null;
}

// Esports rating. The shared scorer cannot be used: an esports "score" is a
// SERIES tally (2-1 in a Bo3), not points, so a 1-point margin is the widest
// possible gap in a Bo3 and the narrowest in a Bo5 — the exact inversion that
// broke cricket. What makes a series worth watching is whether it went the
// distance: a Bo5 that reached game five is the best thing in the sport, a 3-0
// sweep is not. So rate on games played against games needed, never on who won.
function esportsRating(g: EsportsApiGame): number | null {
  if (g.state !== "post") return null;
  const a = parseInt(g.away.score, 10);
  const h = parseInt(g.home.score, 10);
  if (!Number.isFinite(a) || !Number.isFinite(h)) return null;
  const needed = Math.ceil((g.bestOf ?? 1) / 2);   // Bo3 → 2, Bo5 → 3, Bo1 → 1
  const loserGames = Math.min(a, h);
  // A Bo1 has no series shape at all — rate it mid rather than pretending.
  if (needed <= 1) return 55;
  // 0 → sweep, needed-1 → full distance. Maps 40..95 for a well-formed tally.
  // Clamp to 0..100 like every sibling rater (cricket/team/tennis): a malformed
  // PandaScore row where loserGames >= needed (e.g. a "3-3" Bo5) would otherwise
  // exceed 95 and top 100 (3/2 * 55 + 40 = 122), mis-sorting and mis-badging it.
  return Math.round(Math.max(0, Math.min(100, 40 + (loserGames / (needed - 1)) * 55)));
}

export async function fetchEsportsGames(date?: string): Promise<Game[]> {
  try {
    const url = `${getApiBase()}/api/esports${date ? `?date=${encodeURIComponent(date)}` : ""}`;
    const res = await fetchWithRetry(url);
    if (!res.ok) return [];
    const { games } = (await res.json()) as { games: EsportsApiGame[] };
    if (!games?.length) return [];
    const toTeam = (t: EsportsApiGame["away"], winnerId: string | null): Team => ({
      id: t.id,
      abbreviation: t.acronym || t.name.slice(0, 4).toUpperCase(),
      displayName: t.name,
      shortDisplayName: t.acronym || t.name,
      logo: t.image || "",
      color: "",
      score: t.score,
      winner: !!winnerId && winnerId === t.id,
      record: "",
      rank: null,
    });
    return games.map((g): Game => {
      const away = toTeam(g.away, g.winnerId);
      const home = toTeam(g.home, g.winnerId);
      return {
        id: g.id,
        sport: "esports",
        date: g.date ?? new Date().toISOString(),
        name: `${away.displayName} vs ${home.displayName}`,
        shortName: `${away.abbreviation} vs ${home.abbreviation}`,
        state: g.state,
        statusDetail: g.state === "post" ? "Final" : g.state === "in" ? "Live" : "Scheduled",
        clock: "",
        period: 0,
        completed: g.state === "post",
        homeTeam: home,
        awayTeam: away,
        broadcasts: [],
        // The league is the venue-equivalent here ("LCK", "LPL", "Worlds") —
        // it's what tells you the stakes, which is what a neutral-site bracket
        // has instead of a home ground.
        venue: [g.league, g.serie].filter(Boolean).join(" "),
        // The bare league, kept separate from `venue` — `venue` is display text
        // ("LCK Summer"), this is the highlight-channel lookup key ("LCK").
        esportsLeague: g.league || null,
        rating: esportsRating(g),
        seriesNote: g.bestOf && g.bestOf > 1 ? `Bo${g.bestOf}` : null,
        // Tier s is a major (Worlds, MSI, an EWC final); tier a is a top
        // domestic league. Both read as "this one matters".
        isPlayoff: g.tier === "s",
        // PandaScore has no exhibition concept — every match it returns counts.
        isPreseason: false,
        playoffLabel: null,
        seriesStatus: null,
        recapUrl: null,
        // Twitch is where every tier-s/a match actually streams, free. Sent
        // through the shared per-sport fallback so the link stays in one place.
        streamUrl: sportStreamFallback("esports"),
        primeStreamUrl: null,
      };
    });
  } catch {
    return [];
  }
}

interface BoxingApiEvent {
  id: string; title: string; date: string; venue: string | null;
  location: string | null; broadcasts: string[]; poster: string | null;
}

// The live feed, with failure kept distinct from an empty calendar: `null`
// events means the request errored or returned something we couldn't parse,
// `[]` means boxing-data.com answered and has no cards.
async function fetchBoxingApiEvents(): Promise<BoxingApiEvent[] | null> {
  try {
    const res = await fetchWithRetry(`${getApiBase()}/api/boxing`);
    if (!res.ok) return null;
    const { events } = (await res.json()) as { events: BoxingApiEvent[] };
    return Array.isArray(events) ? events : null;
  } catch {
    return null;
  }
}

export async function fetchBoxingEvent(date?: string): Promise<EventFetchResult> {
  const [curated, events] = await Promise.all([
    fetchCuratedBoxingEvent(date),
    fetchBoxingApiEvents(),
  ]);
  // No card to show. Only call it a failure if a source actually broke —
  // otherwise both feeds are healthy and the day is genuinely empty, and the
  // column should say "No event" rather than cry wolf.
  const nothing = (): EventFetchResult => ({
    card: curated.card,
    failed: !curated.card && (curated.failed || events === null),
  });
  if (events === null || !events.length) return nothing();
  try {
    const target = date ? fromYmd(date).getTime() : Date.now();
    const ts = (e: BoxingApiEvent) => new Date(e.date).getTime();
    // The API behind /api/boxing is boxing-data.com's `/v2/events/schedule` —
    // UPCOMING cards only, never a finished one. So the nearest-by-|date diff|
    // sort below always had a FUTURE fight within reach and every past tab
    // rendered a card that hadn't happened yet, in state "pre", with no replay.
    // Same rule fetchLeagueEvent walks back for and fetchChessEvent applies to
    // Lichess: on a past board date an event is only eligible if it had already
    // taken place by then. Nothing left ⇒ fall through to the curated file,
    // which is the only source here that carries finished cards at all.
    const isPastDate = !!date && date < toYmd(getEtServiceDate());
    const pool = isPastDate
      ? events.filter((event) => ts(event) <= target + 24 * 60 * 60 * 1000)
      : events;
    if (!pool.length) return nothing();
    const exactDate = date
      ? pool.filter((event) => event.date.slice(0, 10).replace(/-/g, "") === date)
      : [];
    // Prefer a card the user can actually WATCH. Nearest-by-date alone picks
    // badly here: the feed carries every sanctioned card worldwide, so on
    // 2026-08-04 it surfaced "Nyika vs. Masson" at a stadium in North Shore, NZ
    // with no listed broadcaster, ahead of an ESPN/Sky card in Orlando five
    // days later. Rank on a US/UK broadcast first, then by nearness — this is
    // the boxing analogue of the chess `tier` filter, which the API gives us
    // for free but boxing-data.com does not.
    const watchable = (e: BoxingApiEvent) => (e.broadcasts?.length ? 0 : 1);
    const chosen = [...(exactDate.length ? exactDate : pool)].sort(
      (a, b) =>
        watchable(a) - watchable(b) ||
        Math.abs(ts(a) - target) - Math.abs(ts(b) - target),
    )[0];
    if (!exactDate.length && curated.card) return curated;
    if (!chosen) return nothing();
    const now = Date.now();
    const t = ts(chosen);
    // Boxing cards run ~4h from first bell. No live API state is available, so
    // derive it from the clock rather than claiming a status we cannot know.
    const state: "pre" | "in" | "post" =
      now < t ? "pre" : now < t + 4 * 60 * 60 * 1000 ? "in" : "post";
    // Until now the ONLY boxing card that could ever show a highlight button was
    // one hand-written into public/boxing-events.json — `officialChannel` is what
    // gates the button (showBoxingBtn in EventCard) and the API branch never set
    // it. That file holds a single entry, from Aug 1, so in practice a finished
    // API card rendered with a permanently blank highlight row: no replay, and
    // the oversized tile that blank row leaves behind (see the Liga MX note in
    // the deploy memo — a dead channel reads as "the box is huge", not as a
    // missing button). Derive the promoter's channel from the broadcasters
    // instead; curation still wins when the file covers the date, because a
    // hand-written query with both fighters' FULL names resolves better than
    // surnames.
    const promoter = boxingChannelFor(chosen.broadcasts);
    const names = buildBoxingTokens(chosen.title);
    return {
      card: {
        kind: "boxing",
        title: chosen.title,
        subtitle: [chosen.venue, chosen.location].filter(Boolean).join(" · ") || undefined,
        state,
        statusDetail: state === "in" ? "Live" : state === "post" ? "Final" : "Fight Night",
        date: new Date(t).toISOString(),
        broadcasts: chosen.broadcasts ?? [],
        posterUrl: chosen.poster ?? undefined,
        officialChannel: promoter?.channel,
        officialLabel: promoter?.label,
        highlightQuery: boxingHighlightQuery(chosen.title),
        raceTokens: names,
      },
      failed: false,
    };
  } catch {
    // The feed answered but we couldn't make a card out of it — a bad payload,
    // not an empty day.
    return { card: curated.card, failed: !curated.card };
  }
}

// How far back a PAST board date looks for the most recent finished event.
// Sized for the longest IN-SEASON gap on these calendars: F1's summer break is
// 26 days (Hungary Jul 26 → Zandvoort Aug 21 in 2026). Deliberately not longer
// — an out-of-season past date must still fall through to the upcoming event
// rather than dredging up last season's finale.
const EVENT_LOOKBACK_DAYS = 45;

// …and how far FORWARD today/future looks for the next scheduled event, when
// the undated fallback handed back a race that already ran (see the walk-
// forward in fetchLeagueEvent). Same 45 days for the same reason: it clears
// F1's 26-day summer break, and staying short means a truly finished season
// finds nothing and keeps showing its finale rather than blanking the column.
const EVENT_LOOKAHEAD_DAYS = 45;

// YYYYMMDD ± days, in plain calendar arithmetic. Built and read back in UTC so
// the host zone can never shift the result by a day; these are date keys for an
// ESPN query, not instants.
function shiftYmd(ymd: string, days: number): string {
  const d = new Date(Date.UTC(+ymd.slice(0, 4), +ymd.slice(4, 6) - 1, +ymd.slice(6, 8)));
  d.setUTCDate(d.getUTCDate() + days);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`;
}

async function fetchLeagueEvent(
  sport: "f1" | "ufc" | "nascar" | "indycar",
  date?: string,
): Promise<LeagueEventCard | null> {
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

  // Every event in a YYYYMMDD-YYYYMMDD window. ESPN accepts a range on the
  // scoreboard and returns the events in chronological order (verified
  // 2026-08-10 against racing/f1 and mma/ufc).
  const loadRange = async (from: string, to: string): Promise<LeagueEvent[]> => {
    const url = new URL(BASE_URL + SPORT_PATHS[sport]);
    url.searchParams.set("dates", `${from}-${to}`);
    try {
      const res = await fetchWithRetry(url.toString());
      if (!res.ok) return [];
      const data = await res.json();
      return (data.events ?? []) as LeagueEvent[];
    } catch {
      return [];
    }
  };

  let event: LeagueEvent | null = date ? await load(date) : null;
  // A PAST board date must never surface an event that has not happened yet.
  // The undated fallback below returns ESPN's CURRENT-OR-NEXT event, so during
  // any calendar gap — F1's summer break, a UFC off-weekend — every past tab
  // rendered the UPCOMING race/card in state "pre". The highlight button only
  // renders on a finished tile (showRaceBtn in EventCard), so the last race's
  // recap was unreachable from Yesterday or any earlier day, even though the
  // reel exists. Walk BACK instead: the most recent event at or before the
  // viewed day. This is the event-tile version of the isPastView rule the game
  // columns already follow ("on a PAST tab … not surface a future game").
  if (!event && date && date < toYmd(getEtServiceDate())) {
    const past = await loadRange(shiftYmd(date, -EVENT_LOOKBACK_DAYS), date);
    event = past.length ? past[past.length - 1] : null;
  }
  event = event ?? (await load());
  if (!event) return null;

  // …and the mirror image on TODAY or a FUTURE tab. The undated fallback above
  // is documented everywhere as ESPN's "current or next" event, and for F1 it
  // is — but NOT for the US series: on 2026-08-10 the undated NASCAR and
  // IndyCar scoreboards both returned SUNDAY'S FINISHED race (state "post")
  // while F1 returned the Aug 21 Dutch GP (state "pre"). So today's board grew
  // a finished race tile with its highlight button attached, on a day no race
  // ran (Jacob 8/10). Walk FORWARD instead — the next scheduled event — which
  // is what the F1 column was already showing and what "today" means here.
  //
  // Nothing ahead (the season is genuinely over) keeps the finished event: an
  // offseason board showing the last race of the year is the pre-existing
  // behaviour, and blanking the column outright would be the larger regression.
  {
    const todayYmd = toYmd(getEtServiceDate());
    const boardYmd = date || todayYmd;
    const evState = (event.status?.type?.state
      ?? event.competitions?.[event.competitions.length - 1]?.status?.type?.state
      ?? "pre") as "pre" | "in" | "post";
    if (isStaleFinishedForBoard(boardYmd, todayYmd, etSlateYmd(event.date ?? ""), evState)) {
      const ahead = await loadRange(boardYmd, shiftYmd(boardYmd, EVENT_LOOKAHEAD_DAYS));
      const next = ahead.find((e) => etSlateYmd(e.date ?? "") >= boardYmd);
      if (next) event = next;
    }
  }
  const comps: LeagueEventCompetition[] = event.competitions ?? [];
  const eventUrl: string | undefined = event.links?.find((l) => l?.href)?.href;

  if (sport === "f1" || sport === "nascar" || sport === "indycar") {
    const series = RACING_SERIES[sport];
    // F1 tags the race session competition.type.id === "3". NASCAR and IndyCar
    // ship a single untyped competition, so the find() misses and the fallback
    // to the last (only) competition is the race — which is what we want.
    const race = comps.find((c) => String(c?.type?.id) === "3") ?? comps[comps.length - 1] ?? null;
    const state = (race?.status?.type?.state ?? event.status?.type?.state ?? "pre") as "pre" | "in" | "post";
    // Location: F1 carries a `circuit`; the US series don't. NASCAR puts the
    // track on competition.venue instead, and IndyCar supplies neither — see
    // INDYCAR_TRACKS, which fills that in from the series' own schedule.
    const mappedTrack = sport === "indycar"
      ? indycarTrackSubtitle(event.name || event.shortName || "")
      : undefined;
    // Longest-first renderings of the venue line, so a narrow column drops the
    // country and then the city rather than clipping the TRACK — see
    // eventSubtitleVariants. subtitle stays the full string (variants[0]), so
    // anything reading `subtitle` is unaffected.
    let subtitleVariants: string[] = [];
    let subtitle: string | undefined;
    if (sport === "f1") {
      const circuit: LeagueEventCircuit = event.circuit ?? {};
      subtitleVariants = eventSubtitleVariants(
        circuit.fullName ?? "",
        (circuit.address?.city ?? "").trim(),
        (circuit.address?.country ?? "").trim(),
      );
      subtitle = subtitleVariants[0] || undefined;
    } else if (mappedTrack) {
      // INDYCAR_TRACKS is hand-written "<track> · <city, state>" — split on the
      // separator it was built with rather than re-deriving it.
      const [track, ...rest] = mappedTrack.split(" · ");
      const [city, region] = (rest.join(" · ") || "").split(/,\s*/);
      subtitleVariants = eventSubtitleVariants(track ?? "", city ?? "", region ?? "");
      subtitle = subtitleVariants[0] || mappedTrack;
    } else {
      const venue: LeagueEventVenue = race?.venue ?? event.venue ?? {};
      // ESPN pads some track cities with a trailing space ("Newton ").
      const city = (venue.address?.city ?? "").trim();
      const region = (venue.address?.state || venue.address?.country || "").trim();
      subtitleVariants = eventSubtitleVariants(venue.fullName ?? "", city, region);
      subtitle = subtitleVariants[0] || undefined;
    }
    const raceDate = race?.date ?? event.date;
    const year = new Date(raceDate).getFullYear() || new Date().getFullYear();
    const cleanName = (event.shortName || event.name || "Grand Prix").replace(/\bGP\b/i, "Grand Prix");
    const fullTitle = event.name || event.shortName || "Grand Prix";
    return {
      kind: "f1",
      title: fullTitle,
      // "Heineken Dutch Grand Prix" → "Heineken Dutch GP" → "Dutch GP"; the
      // tile picks the longest that fits its one line. `title` is unchanged, so
      // the highlight query, race tokens and aria-label all still use the full
      // name — only what's PAINTED gets shortened.
      titleVariants: eventTitleVariants(fullTitle, event.shortName, sport),
      subtitle,
      subtitleVariants,
      state,
      statusDetail: state === "post" ? "Final" : state === "in" ? "Live" : "Race",
      date: raceDate,
      broadcasts: eventBroadcasts(race),
      // Skip the series prefix when ESPN's own event name already carries it —
      // NASCAR names every race "NASCAR Cup Series at <track>", which otherwise
      // produced "NASCAR Cup Series 2026 NASCAR Cup Series at Iowa race
      // highlights" and buried the actual track name in duplicate tokens.
      highlightQuery: cleanName.toLowerCase().startsWith(series.queryPrefix.toLowerCase())
        ? `${year} ${cleanName} race highlights`
        : `${series.queryPrefix} ${year} ${cleanName} race highlights`,
      officialChannel: series.channel,
      officialLabel: series.label,
      raceTokens: buildRaceTokens(sport, event.name || event.shortName || ""),
      // ESPN's NASCAR/IndyCar event links often point only at VividSeats. Never
      // send a details click to a ticket reseller: use an ESPN event link when
      // available, otherwise the verified ESPN series schedule. This keeps
      // every upcoming race tile informative and clickable without exposing a
      // finished-race result page.
      eventUrl: raceDetailsUrl(sport, eventUrl),
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
  const venue: LeagueEventVenue = main?.venue ?? event.venue ?? {};
  const subtitle = [venue.address?.city, venue.address?.state || venue.address?.country].filter(Boolean).join(", ") || undefined;
  const fighter = (x: LeagueEventCompetitor | undefined) => ({
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
    // Show the bout time in the app's effective zone (Settings → Time zone;
    // defaults to the device zone). Every other absolute-instant time label
    // — the golf tee time, the game-detail modal, the F1 event card — already
    // passes getTimeZone(); this UFC bout label was the lone omission, so a
    // user with a zone override saw fight times in their device zone instead.
    return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: getTimeZone() });
  };
  const fights: FightBout[] = comps.slice().reverse().map((c: LeagueEventCompetition) => {
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
    date: event.date || main?.date || "",
    broadcasts: eventBroadcasts(main),
    boutCount: comps.length,
    fights,
    highlightQuery: `${name} highlights`,
    officialChannel: "UFC",
    eventUrl,
  };
}

// Shape of the ESPN golf scoreboard competitor/linescore data this parser reads.
// linescores nests two levels: per-round scores, each with per-hole scores.
type GolfHoleScore = { value?: number | null };
type GolfRoundScore = { value?: number | null; linescores?: GolfHoleScore[] };
type GolfAthlete = {
  displayName?: string;
  shortName?: string;
  flag?: { href?: string; alt?: string };
};
type GolfCompetitor = {
  order?: number;
  score?: string;
  athlete?: GolfAthlete;
  linescores?: GolfRoundScore[];
};

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
    ? (competitors[0].linescores ?? []).filter((r: GolfRoundScore) => r.value !== null && r.value !== undefined).length
    : 0;

  let statusDetail = "Upcoming";
  if (state === "post") {
    statusDetail = "Final";
  } else if (state === "in") {
    // Check if any player is mid-round (has holes played in current round but round not complete)
    const anyMidRound = competitors.some((c: GolfCompetitor) => {
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

  const players: GolfPlayer[] = competitors.map((c: GolfCompetitor) => {
    const athlete: GolfAthlete = c.athlete ?? {};
    const linescores: GolfRoundScore[] = c.linescores ?? [];

    // Completed rounds
    const rounds = linescores
      .filter((r): r is GolfRoundScore & { value: number } => r.value !== null && r.value !== undefined)
      .map((r) => String(Math.round(r.value)));

    // Thru: check if currently mid-round
    let thru = "";
    const inProgressRound = linescores[rounds.length]; // next round after completed ones
    if (inProgressRound) {
      const holes = (inProgressRound.linescores ?? []).filter((h: GolfHoleScore) => h.value !== null && h.value !== undefined);
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
    // Parse numeric scores for top players. Non-numeric statuses ("CUT", "WD",
    // "DQ", "MC") and not-yet-posted scores ("-") return null so they're dropped
    // from the tightness sample — otherwise parseInt(...)||0 would collapse them
    // to even par and falsely count them as tied with the leader.
    const parseScore = (s: string): number | null => {
      if (s === "E") return 0;
      return /^[+-]?\d+$/.test(s) ? parseInt(s, 10) : null;
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
      const topScores = players
        .slice(0, 10)
        .map(p => parseScore(p.score))
        .filter((n): n is number => n !== null);
      // Need a real top-5 sample before rating. With <5 numeric scores the
      // `topScores[4] ?? leader` fallbacks below collapse the spread to 0 →
      // spreadScore 100 → a maximal "GREAT" badge on almost no data. That's the
      // same opening-holes artifact the gate above guards against: e.g. an R1
      // weather suspension where the leader is thru ≥6 (so the gate opens) but
      // most of the field still shows "-"/"CUT"/"WD" (parseScore → null). Every
      // normally-populated leaderboard has 10 numeric top-10 scores, so this is
      // a no-op there; it only withholds the badge when the sample is too thin.
      if (topScores.length >= 5) {
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
  }

  // Look up the tournament's start date (MM-DD) from the league config so the
  // client can do date-aware round labeling (yesterday=R1, today=R2, etc).
  // Match punctuation-insensitively: ESPN names the US Open golf major
  // "U.S. Open", which the bare label used as a regex (/US Open/i) never
  // matched — the periods break the "US Open" substring — so startDate came
  // back undefined and golf.ts silently dropped that major's round subtitle,
  // recap highlights, and rating for the whole week. Folding out non-
  // alphanumerics maps both "U.S. Open" and "US Open" to "usopen"; the four
  // golf labels stay mutually distinct under this key, so no false matches.
  const golfKey = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const tournamentLabel = ALL_LEAGUES.find(
    (l) => l.sport === "golf" && golfKey(event.name ?? "").includes(golfKey(l.label))
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
      // startDate is a year-less "MM-DD", so reconstruct its year from the
      // viewed date. A 4-day window can straddle New Year (starts "12-30",
      // viewed date lands in January): reusing selYear then puts the start in
      // the wrong calendar year and dayIndex falls outside [0,3], dropping the
      // event before golf.ts's labeling runs. Mirror the identical year-wrap
      // shift getGolfDateState already applies (see golf.ts) so this window
      // drop and the round labeling agree — a true wrap is the only case the
      // months sit more than 6 apart. Every mid-year major is unchanged.
      let startYear = selYear;
      if (startMo - selMonth > 6) startYear = selYear - 1;
      else if (selMonth - startMo > 6) startYear = selYear + 1;
      const startDateObj = new Date(startYear, startMo - 1, startDay);
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
    // Pass "" as the gameId: a golf tournament has no per-airing ESPN watch id,
    // so an ESPN/ESPN+ broadcast must route to ESPN's generic watch page, not a
    // "/watch/player/_/id/{eventId}" deep link keyed by the tournament event id
    // (which is not a valid airing id and lands on a broken player). networkStreamUrl
    // only consumes gameId in its ESPN branch, so this matches GolfLeaderboard's own
    // per-network chip (which already passes "") and leaves every other golf network
    // byte-identical.
    const url = networkStreamUrl(broadcast, "");
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

// Sports whose REGULAR slate is tagged season.type 1, so the preseason filter
// in eventsToGames must not touch them.
//
// NFL: the type-1 slate is genuinely preseason, but LEAGUES carries a dedicated
// "NFL Preseason" column (07-21 → 09-03) whose entire run is it, so the blanket
// filter emptied that column for its whole run — every day rendered "Upcoming
// Schedule TBD" while ESPN had 49 games on the board. The regular NFL config
// doesn't start until 09-04, so no type-1 event can leak into it.
//
// Rugby: ESPN tags EVERY rugby fixture type 1 — verified 2026-08-21 against the
// scoreboard endpoint across all six competitions (Six Nations 15/15, Super
// Rugby 79/79, Nations Championship 36/36, Rugby World Cup 48/48, Rugby Tests
// 6/6 in the current window; Rugby Championship returns nothing out of season).
// There is no type-2 rugby event anywhere in ESPN's feed, so the blanket type-1
// drop emptied all six columns from the day rugby shipped (2026-08-11) until
// this was found — silently, because the fetch 200s and the parser is fine:
// eventsToGames simply filtered every match out and the column rendered
// "Upcoming Schedule TBD".
const SEASON_TYPE_1_IS_REGULAR = new Set<Sport>([
  "nfl",
  "sixnations", "rugbywc", "rugbychamp", "superrugby", "rugbytest", "nationschamp",
]);

// Map raw ESPN scoreboard events into Game[] (team-based sports). Shared by
// the single-day fetch and the soccer range-lookahead so both apply the same
// postponed/preseason/0-competitor filtering + per-event failure isolation.
export function eventsToGames(events: ScoreboardEvent[], sport: Sport): Game[] {
  return events
    .filter((e) => {
      // Filter out postponed/canceled/suspended games
      const statusName = e.status?.type?.name ?? "";
      if (statusName.includes("POSTPONED") || statusName.includes("CANCELED") || statusName.includes("SUSPENDED")) return false;
      // Filter out preseason/spring training — bad highlights, ties in records,
      // low-quality games. EXCEPT the sports in SEASON_TYPE_1_IS_REGULAR above,
      // whose real slate is tagged type 1.
      const seasonType = e.season?.type ?? 0;
      if (seasonType === 1 && !SEASON_TYPE_1_IS_REGULAR.has(sport)) return false;
      // Tournament-wrapper events with no competitors aren't real matches.
      const competitors = e.competitions?.[0]?.competitors ?? [];
      if (competitors.length < 2) return false;
      return true;
    })
    // A single malformed event must not take down the whole league.
    .map((e) => {
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
// ESPN's team-sport scoreboards stopped honouring a `dates=YYYYMMDD-YYYYMMDD`
// range on or before 2026-09-16: NFL/MLB/NBA/EPL all answer a range with ZERO
// events (no error) while the same single day still returns the slate. Verified
// from two hosts (laptop + mini) and both site.api / site.web.api. The event
// scoreboards (racing/f1, mma/ufc) still take a range, so fetchLeagueEvent is
// untouched. Every ranged lookback/lookahead below now fans out one request
// per day instead, in parallel chunks, stopping at the first chunk that has
// what the caller wants — so an in-season league costs ~7 requests, not the
// whole window. Symptom this fixes: the Yesterday tab's NFL column read
// "Starts Tomorrow" the day after Monday Night Football, because the empty
// lookback made the column think the season had not begun (Jacob 9/16).
const RANGE_FANOUT_CHUNK_DAYS = 7;

async function fetchScoreboardEventsForDay(sport: Sport, ymd: string): Promise<ScoreboardEvent[]> {
  const url = scoreboardUrl(sport);
  url.searchParams.set("dates", ymd);
  try {
    const res = await fetchWithRetry(url.toString(), ...scoreboardFetchArgs(sport));
    if (!res.ok) return [];
    const data = await res.json();
    return (data?.events ?? []) as ScoreboardEvent[];
  } catch {
    return [];
  }
}

// Fetch `days` (already ordered in the direction the caller walks) in chunks
// of RANGE_FANOUT_CHUNK_DAYS, each chunk in parallel. `enough(games)` is asked
// after every chunk with the games gathered so far; the walk stops as soon as
// it says yes. Returns every game gathered (the caller filters/groups).
async function fetchGamesAcrossDays(
  sport: Sport,
  days: string[],
  enough: (gamesSoFar: Game[]) => boolean,
): Promise<Game[]> {
  const gathered: Game[] = [];
  for (let i = 0; i < days.length; i += RANGE_FANOUT_CHUNK_DAYS) {
    const chunk = days.slice(i, i + RANGE_FANOUT_CHUNK_DAYS);
    const perDay = await Promise.all(chunk.map((d) => fetchScoreboardEventsForDay(sport, d)));
    // A single-day query can bleed a late-ET game into the neighbouring UTC
    // day, so the same event can arrive twice across a chunk — dedupe by id.
    const seen = new Set(gathered.map((g) => g.id));
    for (const g of eventsToGames(perDay.flat(), sport)) {
      if (seen.has(g.id)) continue;
      seen.add(g.id);
      gathered.push(g);
    }
    if (enough(gathered)) break;
  }
  return gathered;
}

// How far ahead fetchNextGameDayRange reads in ONE request. Shared with the
// offseason-opener gate in fetchAllLeagues so the gate can never green-light a
// league whose opener sits outside the span the fetch would actually cover.
const RANGE_LOOKAHEAD_DAYS = 80;

// Endgame slate: a league with at most this many scheduled games in the next
// ENDGAME_WINDOW_DAYS shows all of them under today's cards (see fetchLeague).
export const ENDGAME_MAX = 5;
export const ENDGAME_WINDOW_DAYS = 7;

async function fetchNextGameDayRange(
  sport: Sport,
  fromDate?: string,
  windowDays = RANGE_LOOKAHEAD_DAYS,
  // allDays: every upcoming fixture in the window, reduced to ONE NBA/NHL
  // series. allGames: every upcoming fixture in the window, chronological, no
  // series grouping (the endgame slate). maxDays: every fixture from the first
  // N distinct ET match-days. Default (none): the earliest day only.
  opts?: { allDays?: boolean; allGames?: boolean; maxDays?: number },
): Promise<{ date: string; games: Game[] } | null> {
  const base = fromDate
    ? new Date(`${fromDate.slice(0, 4)}-${fromDate.slice(4, 6)}-${fromDate.slice(6, 8)}T12:00:00`)
    : new Date();
  const ymd = (d: Date) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const start = new Date(base); start.setDate(start.getDate() + 1);
  const end = new Date(base); end.setDate(end.getDate() + windowDays);
  // Tennis still takes a `dates=A-B` range (checked 2026-09-16, HTTP 200) and
  // returns the whole Slam regardless, so it keeps the single ranged request:
  // its matches nest inside a 0-competitor tournament wrapper that
  // eventsToGames drops, and go through their own parser with the window
  // applied per match. Every other sport fans out per day — see
  // RANGE_FANOUT_CHUNK_DAYS — because ESPN now answers their ranges with 400.
  let rangedTennis: Game[] | null = null;
  if (sport === "tennis") {
    const url = scoreboardUrl(sport);
    url.searchParams.set("dates", `${ymd(start)}-${ymd(end)}`);
    try {
      // ESPN's tennis scoreboard payload is large during Slams. Do not let a
      // ranged tennis lookahead retry for ~30s before admitting there is no slate.
      const res = await fetchWithRetry(url.toString(), ...scoreboardFetchArgs(sport));
      if (!res.ok) return null;
      const data = await res.json();
      const events: ScoreboardEvent[] = data?.events ?? [];
      rangedTennis = buildTennisGames(events as unknown as TennisScoreboardEvent[], { from: ymd(start), to: ymd(end) });
    } catch {
      return null;
    }
  }
  // Group by the fixture's ET calendar day, return the earliest day's slate.
  const dayOf = (iso: string) => {
    try {
      return new Intl.DateTimeFormat("en-CA", { timeZone: getTimeZone(), year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso)).replace(/-/g, "");
    } catch {
      return "";
    }
  };
  // Day-by-day fan-out (see RANGE_FANOUT_CHUNK_DAYS): date+1 … date+windowDays.
  const days = Array.from({ length: windowDays }, (_, i) => {
    const d = new Date(base); d.setDate(d.getDate() + i + 1); return ymd(d);
  });
  const upcoming = (gs: Game[]) => gs.filter((g) => g.state === "pre" || g.state === "in");
  const distinctDays = (gs: Game[]) => new Set(gs.map((g) => dayOf(g.date)).filter(Boolean)).size;
  // allDays wants the whole window; maxDays wants N distinct match-days; the
  // default wants just the first day — stop as soon as that much is in hand.
  const wanted = opts?.allDays ? Infinity : (opts?.maxDays ?? 1);
  const games = upcoming(rangedTennis ?? await fetchGamesAcrossDays(sport, days, (gs) => distinctDays(upcoming(gs)) >= wanted));
  if (!games.length) return null;
  const chrono = (gs: Game[]) => [...gs].sort((a, b) => chronoMs(a.date) - chronoMs(b.date));
  const leadDay = (gs: Game[]) => { let f = ""; for (const g of gs) { const d = dayOf(g.date); if (d && (!f || d < f)) f = d; } return f; };
  // allGames: the whole window, chronological, each game on its own day. The
  // endgame slate (fetchLeague) reads this to count what is left in a league
  // and, when it is a handful, show all of it.
  if (opts?.allGames) {
    const sorted = chrono(games);
    const first = leadDay(sorted);
    if (!first) return null;
    return { date: first, games: sorted };
  }
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
  // Day-by-day fan-out (see RANGE_FANOUT_CHUNK_DAYS), walking BACK from the
  // day before the viewed date so the first chunk with a finished game is the
  // most recent one and the walk can stop there.
  const days = Array.from({ length: windowDays }, (_, i) => {
    const d = new Date(base); d.setDate(d.getDate() - (i + 1)); return ymd(d);
  });
  const finished = (gs: Game[]) => gs.filter((g) => g.state === "post");
  const games = finished(await fetchGamesAcrossDays(sport, days, (gs) => finished(gs).length > 0));
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
  const url = scoreboardUrl(sport);
  // Soccer fixtures can kick off in the local midnight hour (a western-US World
  // Cup night game is 12 AM ET). ESPN buckets those under their raw calendar
  // day, but etSlateYmd counts them as the PREVIOUS day's slate so they line up
  // with the date nav's 1 AM rollover. To reconcile, fetch a 2-day window
  // [date, date+1] and keep only fixtures whose slate day is the viewed date —
  // this pulls a midnight kickoff back onto yesterday and off today (Jacob 6/17).
  // ⚠️ Since 2026-09-16 ESPN answers a `dates=A-B` range on team-sport
  // scoreboards with HTTP 400 (see RANGE_FANOUT_CHUNK_DAYS) — which made every
  // soccer column fail outright. The 2-day window is now two single-day
  // requests merged below; the day+1 fetch is best-effort so a blip on it
  // cannot blank the viewed day.
  const reconcileSoccerDay = !!date && SOCCER_SPORTS.has(sport);
  if (date) {
    url.searchParams.set("dates", date);
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
    // ESPN's tennis scoreboard payload is large during Slams and has been the
    // slowest selected column. Keep it from holding the whole board skeleton;
    // a miss still falls back to the last good per-date cache below.
    const res = await fetchWithRetry(url.toString(), ...scoreboardFetchArgs(sport));
    if (!res.ok) return failWithCacheFallback();
    data = await res.json();
  } catch {
    return failWithCacheFallback();
  }
  if (reconcileSoccerDay && date) {
    const spill = await fetchScoreboardEventsForDay(sport, nextYmd(date));
    if (spill.length) data = { events: [...(data?.events ?? []), ...spill] };
  }

  const events = data?.events ?? [];

  // Tennis nests its real matches in event.groupings[].competitions[] with
  // athlete-based competitors — flattened by a dedicated parser, not the
  // team-based path below (which would drop the 0-competitor tournament wrapper).
  if (sport === "tennis") {
    return { games: buildTennisGames(events as TennisScoreboardEvent[], date), failed: false };
  }

  let games: Game[] = eventsToGames(events as ScoreboardEvent[], sport);
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
      // threshold. Cleared on next refresh as soon as a hit drops.
      //
      // The upgrade to PERFECT GAME is MLB's call alone (see
      // isPerfectGameConfirmed). Nothing in the linescore can stand in for it:
      // this is the `hits === 0` gate deciding WHICH game to ask about, and
      // MLB's flag deciding the answer.
      //
      // Rating override: a no-hit bid is always interesting regardless of
      // score margin, so floor the rating at 95 (always GREAT). A perfect
      // game gets 110 — above the natural 0–100 cap so the live-cluster
      // sort always puts it at the top.
      if (meta.isLive && game.state === "in" && (meta.currentInning ?? 0) >= 6) {
        if (meta.awayHits === 0) {
          game.noHitterPitchingTeam = game.homeTeam.abbreviation;
          if (isPerfectGameConfirmed(meta.gamePk, "home")) game.isPerfectGame = true;
        } else if (meta.homeHits === 0) {
          game.noHitterPitchingTeam = game.awayTeam.abbreviation;
          if (isPerfectGameConfirmed(meta.gamePk, "away")) game.isPerfectGame = true;
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
      // Try the raw ESPN abbreviations first (most teams' codes match NHL's),
      // then the ESPN→NHL translation for the handful that diverge (TB→TBL, …).
      // A matchup key is unique per date, so the fallback can only ADD a match,
      // never replace a correct one — teams already resolving stay unchanged.
      const nhlId =
        nhlIds.get(`${game.awayTeam.abbreviation}@${game.homeTeam.abbreviation}`) ??
        nhlIds.get(`${espnToNhlAbbrev(game.awayTeam.abbreviation)}@${espnToNhlAbbrev(game.homeTeam.abbreviation)}`);
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
    const url = scoreboardUrl(sport);
    url.searchParams.set("dates", day);
    try {
      const res = await fetchWithRetry(url.toString());
      if (!res.ok) return [];
      const data: { events?: unknown[] } | null = await res.json();
      return eventsToGames((data?.events ?? []) as ScoreboardEvent[], sport);
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
// the `logos` array — we synthesize logo URLs from ESPN's CDN conventions
// (or from the item's `guid`, for the college diamond sports).
export interface SportTeam {
  id: string;           // "${sport}-${rawId}" — same shape as Team.id elsewhere
  rawId: string;        // ESPN's numeric id, useful for schedule fetches
  displayName: string;
  shortDisplayName: string;
  abbreviation: string;
  logo?: string;
}

function logoForTeam(sport: Sport, rawId: string, abbreviation: string, guid?: string): string | undefined {
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
    // UFL follows the abbreviation convention (lou.png / bham.png answer 200,
    // checked 2026-09-14).
    case "ufl":
      return abbr ? `https://a.espncdn.com/i/teamlogos/${sport}/500/${abbr}.png` : undefined;
    case "ncaam":
    case "ncaah":
    case "ncaawh":
    case "ncaavb":
      return `https://a.espncdn.com/i/teamlogos/ncaa/500/${rawId}.png`;
    // College baseball/softball team ids are sport-specific (softball OU is 524,
    // baseball UCLA is 66), NOT the ncaa/500 school ids — that path 404s for
    // most of them (checked 2026-09-14: 5 of 6 softball ids, 2 of 8 baseball).
    // The scoreboard event and the core teams payload both carry a `guid`, and
    // a.espncdn.com/guid/<guid>/logos/default.png is the logo ESPN itself uses
    // on the event (342 of 400 baseball teams have one). No guid → no logo,
    // never a broken image.
    case "ncaabase":
    case "ncaasoft":
      return guid ? `https://a.espncdn.com/guid/${guid}/logos/default.png` : undefined;
    // Cricket follows the soccer convention (team id under its own sport path).
    case "cricket":
      return `https://a.espncdn.com/i/teamlogos/cricket/500/${rawId}.png`;
    case "epl":
    case "mls":
    case "fifa":
    case "ucl":
    case "uel":
    case "laliga":
    case "seriea":
    case "bundesliga":
    case "ligue1":
    case "ligamx":
    case "nwsl":
    case "efl":
    case "libertadores":
    case "euro":
    case "afcon":
    case "saudi":
    case "uecl":
    case "facup":
    case "copadelrey":
    case "dfbpokal":
      return `https://a.espncdn.com/i/teamlogos/soccer/500/${rawId}.png`;
    default:
      return undefined;
  }
}

const sportTeamsCache = new Map<Sport, Promise<SportTeam[]>>();
export function fetchSportTeams(sport: Sport): Promise<SportTeam[]> {
  const cached = sportTeamsCache.get(sport);
  if (cached) return cached;
  const url = WORKER_SCOREBOARD_SPORTS.has(sport)
    ? `${workerOrigin()}${SPORT_PATHS[sport]}/teams`
    // 500, not 400: college baseball lists 437 teams and softball 446 (read
    // 2026-09-14), so the old cap silently dropped the tail of the alphabet.
    : `https://sports.core.api.espn.com/v3/sports${SPORT_PATHS[sport].replace(/\/scoreboard$/, "")}/teams?limit=500`;
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
          // The worker leagues ship the logo on the item (theScore's CDN);
          // ESPN's core items don't, hence the CDN-convention synthesis.
          logo: t.logos?.[0]?.href || logoForTeam(sport, rawId, abbreviation, typeof t.guid === "string" ? t.guid : undefined),
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

// Attach MLB.com Recap + Condensed Game videos to finished MLB games. The
// worker normalizes StatsAPI's per-game highlight payload into page URL,
// playback URL, and poster so GameHighlights can render official MLB buttons
// without relying on noisy YouTube search results.
export type MlbClip = { url: string | null; playback: string | null; poster: string | null };
type MlbVideoEntry = { date: string | null; away: string; home: string; recap: MlbClip | null; condensed: MlbClip | null };

// The MLB Recap (3m) button is populated ONLY by /api/mlb-videos, so one slow or
// failed call drops it — while the Condensed (10m) button survives via its
// baked/live YouTube fallback. That asymmetry is why so many past MLB games
// showed just the 10m button (Jacob 7/16). Retry + a per-date cache (in-memory,
// mirrored to localStorage so it also survives reloads) keeps the recap sticky:
// once a date's videos load, the 3m button stays put across the app's periodic
// score refreshes and on the next visit, instead of blinking out on any single
// flaky fetch. StatsAPI URLs are stable CDN links, so a cached entry stays valid.
const mlbVideosMem = new Map<string, MlbVideoEntry[]>();
const MLB_VIDS_LS_PREFIX = "hs_mlbvids_";
const MLB_VIDS_TTL_MS = 14 * 24 * 60 * 60 * 1000;

function readMlbVideosCache(date: string): MlbVideoEntry[] | null {
  const mem = mlbVideosMem.get(date);
  if (mem) return mem;
  try {
    if (typeof localStorage === "undefined") return null;
    const raw = localStorage.getItem(MLB_VIDS_LS_PREFIX + date);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { entries?: MlbVideoEntry[] };
    const entries = parsed?.entries;
    if (!Array.isArray(entries) || !entries.length) return null;
    mlbVideosMem.set(date, entries);
    return entries;
  } catch {
    return null;
  }
}

function writeMlbVideosCache(date: string, entries: MlbVideoEntry[]): void {
  mlbVideosMem.set(date, entries);
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(MLB_VIDS_LS_PREFIX + date, JSON.stringify({ entries, ts: Date.now() }));
    // Prune stale dates so the mirror can't grow without bound.
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(MLB_VIDS_LS_PREFIX)) continue;
      try {
        const ts = (JSON.parse(localStorage.getItem(k) || "{}") as { ts?: number }).ts;
        if (!ts || Date.now() - ts > MLB_VIDS_TTL_MS) localStorage.removeItem(k);
      } catch {
        localStorage.removeItem(k);
      }
    }
  } catch {
    // Private mode / quota — the in-memory cache still applies for this session.
  }
}

async function fetchMlbVideos(date: string): Promise<MlbVideoEntry[]> {
  const cached = readMlbVideosCache(date);
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 8000);
      const res = await fetch(`${getApiBase()}/api/mlb-videos?date=${date}`, { signal: ctrl.signal });
      clearTimeout(timer);
      if (!res.ok) continue;
      const data = (await res.json()) as { games?: MlbVideoEntry[] };
      const entries = data?.games ?? [];
        if (entries.length) {
        writeMlbVideosCache(date, entries);
        return entries;
      }
      // Empty response: a real off-day returns [], but so does the worker's own
      // error path. Never regress a known-good date to empty — prefer the cache.
      if (cached?.length) return cached;
    } catch {
      // Timeout / network error — retry, then fall back to the cache below.
    }
  }
  return cached ?? [];
}

// Pick the video entry for one game out of a date's list — team-name match
// (ESPN displayName ends with StatsAPI team.name, either home/away order) then
// the closest kickoff time to disambiguate doubleheaders. Shared by the dated
// board enrich and the on-demand single-game resolver so both match identically.
function matchMlbVideoEntry(game: Game, entries: MlbVideoEntry[]): MlbVideoEntry | null {
  const norm = (s: string) =>
    s.toLowerCase()
      .replace(/\bthe\b/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  const home = norm(game.homeTeam.displayName);
  const away = norm(game.awayTeam.displayName);
  const candidates = entries.filter((e) => {
    const eh = norm(e.home || "");
    const ea = norm(e.away || "");
    return !!eh && !!ea && home.endsWith(eh) && away.endsWith(ea);
  });
  if (!candidates.length) return null;
  const gameTime = new Date(game.date).getTime();
  return candidates.sort((a, b) => {
    const at = a.date ? Math.abs(new Date(a.date).getTime() - gameTime) : Number.MAX_SAFE_INTEGER;
    const bt = b.date ? Math.abs(new Date(b.date).getTime() - gameTime) : Number.MAX_SAFE_INTEGER;
    return at - bt;
  })[0];
}

function applyMlbVideos(game: Game, match: MlbVideoEntry): void {
  game.mlbRecapUrl = match.recap?.url ?? null;
  game.mlbRecapPlaybackUrl = match.recap?.playback ?? null;
  game.mlbRecapPoster = match.recap?.poster ?? null;
  game.mlbCondensedUrl = match.condensed?.url ?? null;
  game.mlbCondensedPlaybackUrl = match.condensed?.playback ?? null;
  game.mlbCondensedPoster = match.condensed?.poster ?? null;
}

async function enrichMlbVideos(games: Game[], date: string): Promise<void> {
  if (!date || !games.some((g) => g.state === "post")) return;
  try {
    const entries = await fetchMlbVideos(date);
    if (!entries.length) return;
    for (const game of games) {
      if (game.state !== "post") continue;
      const match = matchMlbVideoEntry(game, entries);
      if (match) applyMlbVideos(game, match);
    }
  } catch {
    // Best-effort enrichment — leave games unchanged on any failure.
  }
}

// On-demand Recap + Condensed for ONE finished MLB game, for surfaces that don't
// run the dated board enrich: the team timeline (fetchTeamSchedule) and the
// "Last played" / lookahead fallback slates. Buckets the game to its ET slate
// day and reuses fetchMlbVideos' per-date cache, so several cards on the same
// day share ONE request. Null when the game isn't found (e.g. recap not up yet).
export type MlbGameVideos = { recap: MlbClip | null; condensed: MlbClip | null };
export async function resolveMlbGameVideos(game: Game): Promise<MlbGameVideos | null> {
  if (game.sport !== "mlb" || game.state !== "post") return null;
  const ymd = etSlateYmd(game.date);
  if (!ymd) return null;
  try {
    const entries = await fetchMlbVideos(ymd);
    if (!entries.length) return null;
    const match = matchMlbVideoEntry(game, entries);
    return match ? { recap: match.recap ?? null, condensed: match.condensed ?? null } : null;
  } catch {
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════
// TOP EVENTS — the cross-league column (Jacob 9/4)
// ═══════════════════════════════════════════════════════════════
// Not in ALL_LEAGUES on purpose: it has no season, no news feed and no
// scoreboard, and every loop over the catalog would otherwise have to special-
// case it. resolveSlot hands this config back for a "top" slot pref, and
// fetchAllLeagues fills it AFTER the real columns so their games are reused
// instead of fetched twice.
export const TOP_EVENTS_CONFIG: LeagueConfig = { sport: "top", label: "Top events", excludeFromAuto: true };

export interface TopEventsOptions {
  favoriteTeams?: string[];
  mode?: TopEventsMode;
  leagues?: Sport[];
  count?: TopEventsCount;
}

// ESPN's homepage "Top Events" strip. Same CDN family as the scoreboards,
// CORS-open, 10 s edge cache. Editorial rather than exhaustive: on a Friday
// in September it carries ~5 sports and 1-16 events each — exactly the
// "what is espn.com leading with" signal the ranking anchors on.
const ESPN_HEADER_URL = "https://site.web.api.espn.com/apis/v2/scoreboard/header?region=us&lang=en&contentorigin=espn&tz=America%2FNew_York";

async function fetchEspnHeader(): Promise<EspnHeaderFeature[]> {
  try {
    const res = await fetchWithRetry(ESPN_HEADER_URL, 1, 6000);
    if (!res.ok) return [];
    return parseEspnHeader(await res.json());
  } catch {
    return [];
  }
}

// Sports the auto pool falls back to when ESPN's strip is empty (fetch failed,
// or a quiet morning) and the user has no starred teams: the board's own
// in-season ranking, trimmed to game-card sports.
function fallbackTopSports(viewDate: Date): Sport[] {
  const { firstPref, rest } = getActiveLeagueCandidates(viewDate);
  const out: Sport[] = [];
  for (const cfg of [...firstPref, ...rest]) {
    if (!out.includes(cfg.sport)) out.push(cfg.sport);
  }
  return out;
}

export async function fetchTopEvents(
  date: string | undefined,
  viewDate: Date,
  opts: TopEventsOptions | undefined,
  // Games the board already fetched for this date, by sport — a league that is
  // also a column costs nothing extra.
  prefetched: Map<Sport, Game[]>,
): Promise<LeagueData> {
  const mode: TopEventsMode = opts?.mode ?? "auto";
  const favoriteTeams = opts?.favoriteTeams ?? [];
  const features = await fetchEspnHeader();
  let sports = topEventsSourceSports(mode, opts?.leagues, features, favoriteTeams);
  if (mode === "auto" && sports.length < 3) {
    sports = topEventsSourceSports("manual", [...sports, ...fallbackTopSports(viewDate)], features, favoriteTeams);
  }
  const pools = await Promise.all(sports.map(async (sport) => {
    const pre = prefetched.get(sport);
    if (pre) return pre;
    try {
      return (await fetchGames(sport, date)).games;
    } catch {
      return [] as Game[];
    }
  }));
  const games = rankTopEvents(pools.flat(), {
    favoriteTeams,
    features,
    nowMs: Date.now(),
    count: opts?.count ?? TOP_EVENTS_DEFAULT_COUNT,
  });
  return { sport: "top", label: TOP_EVENTS_CONFIG.label, games, fetchFailed: false };
}

export async function fetchAllLeagues(
  date?: string,
  thirdLeagueSport?: Sport | "empty",
  slotOverrides?: { first?: Sport | "empty"; second?: Sport | "empty"; third?: Sport | "empty"; fourth?: Sport | "empty"; fifth?: Sport | "empty" },
  // 3 on phones/laptops, 5 on wide viewports (the caller measures). Slots 4-5
  // exist only in the 5-column board; their prefs are ignored at count 3.
  slotCount: number = MAX_LEAGUES,
  // Only read when a slot is "top" — see fetchTopEvents.
  topOpts?: TopEventsOptions,
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
    // A "top" pin saved while the column was on reads as Auto while it is off.
    if (sport === "top") return TOP_EVENTS_ENABLED ? TOP_EVENTS_CONFIG : null;
    const configs = ALL_LEAGUES.filter((l) => l.sport === sport);
    if (!configs.length) return null;
    // Several sports have more than one seasonal config (NFL regular season +
    // preseason, four golf majors, four tennis Slams). Looking up only the
    // first config made an August `nfl` selection inspect the inactive regular
    // season entry, reject the click, and silently auto-fill the slot with MLS.
    // Resolve the active config for the viewed date instead.
    const activeConfig = configs.find((l) => isLeagueActive(l, viewDate));
    if (activeConfig) return activeConfig;
    // A league inside its pre-season window is pinnable too — otherwise the
    // switcher offers "Prem · starts Aug 21", the click writes the preference,
    // and this resolver rejects it and silently auto-fills the slot with
    // whatever was there before. (Same failure the NFL-preseason note above
    // describes; the fix has to be here as well as in the options list.)
    const upcomingConfig = configs.find((l) => isLeagueUpcoming(l, viewDate));
    if (upcomingConfig) return upcomingConfig;
    // NBA is the deliberate offseason exception: it stays manually pinnable
    // for league news and the trade board, but the auto-picker above still
    // uses isLeagueActive() and therefore never forces an empty NBA column on
    // people between the Finals and opening night.
    return sport === "nba" ? configs[0] : null;
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
    // its position default in auto). Explicit duplicates are intentional: the
    // switcher greys an already-shown league but promises that selecting it adds
    // a second column.
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
    // Legacy slot-3 swap path: replace the rightmost auto slot with the chosen
    // league. Slice at slotCount, NOT MAX_LEAGUES: `auto` holds up to slotCount
    // configs, so on a wide (5-column) board MAX_LEAGUES-1 (2) kept only the
    // first two auto columns and dropped slots 4-5 — the same shrink the dedupe
    // backfill below already fixed by switching off MAX_LEAGUES. When slotCount
    // is the default 3 this is byte-identical (slotCount-1 === MAX_LEAGUES-1).
    final = [...auto.slice(0, slotCount - 1), slot3Cfg];
  } else {
    final = auto;
  }

  // Keep duplicate manual slots. Replacing one of them with an unrelated auto
  // league made the grey "already shown" option misleading: the UI said a
  // second column would be added, then rendered a different default instead.

  const fetchLeague = async (cfg: LeagueConfig): Promise<LeagueData | null> => {
    const label = effectiveLeagueLabel(cfg, viewDate);
    if (cfg.sport === "golf") {
      const golfTournament = await fetchGolfTournament(date);
      if (!golfTournament) return null;
      return { sport: cfg.sport, label, games: [], golfTournament };
    }
    if (cfg.sport === "f1" || cfg.sport === "ufc" || cfg.sport === "nascar" || cfg.sport === "indycar") {
      const eventCard = await fetchLeagueEvent(cfg.sport, date);
      if (!eventCard) return null;
      return { sport: cfg.sport, label, games: [], eventCard };
    }
    // Chess + boxing come from worker routes, not ESPN — see fetchChessEvent /
    // fetchBoxingEvent. Poker reads the curated official major calendar.
    // Esports comes from PandaScore via the worker and produces real two-team
    // GAMES (not an event tile), so it returns through the normal games path.
    if (cfg.sport === "esports") {
      const games = await fetchEsportsGames(date);
      if (!games.length) return null;
      return { sport: cfg.sport, label, games };
    }
    if (cfg.sport === "chess" || cfg.sport === "boxing" || cfg.sport === "poker") {
      const { card, failed } = cfg.sport === "chess"
        ? await fetchChessEvent(date)
        : cfg.sport === "boxing"
          ? await fetchBoxingEvent(date)
          : await fetchPokerEvent(date);
      // A day with no card still renders the column. These three are
      // excludeFromAuto, so a column only exists here because the user pinned
      // it or picked it in the switcher — dropping it on a quiet date made the
      // choice look like it never registered (Jacob 8/10: "can't even select
      // the chess column"). Returning null here also silently re-flowed every
      // column to its left. With no eventCard, LeagueColumn falls through to
      // the same empty state every other league shows — or, when `failed` says
      // the feed itself broke rather than the calendar being quiet, to the
      // retry state instead of a "No event" the data doesn't support.
      return { sport: cfg.sport, label, games: [], eventCard: card, fetchFailed: failed };
    }
    const { games, failed } = await fetchGames(cfg.sport, date);
    // Standings rank (#N next to the team name). Kicked off here so it overlaps
    // with the lookahead/lookback fetches below; stamped onto every team once
    // all the game lists are assembled, just before returning.
    const ranksPromise = RANK_LEAGUES.has(cfg.sport) ? fetchStandingsRanks(cfg.sport) : null;
    if (cfg.sport === "nhl" && date) await enrichNhlVideos(games, date);
    if (cfg.sport === "mlb" && date) await enrichMlbVideos(games, date);
    // OFFSEASON column whose opener already falls inside the range window. The
    // day-by-day lookahead is 7 days, so a league whose schedule is published
    // but whose opener is weeks out (the NBA's mid-August drop against an Oct 20
    // opening night) rendered a bare countdown while ESPN had the fixtures. One
    // ranged request returns the opening-night slate instead.
    //
    // Gated on daysUntil, NOT on "is it offseason": a league that is MONTHS out
    // (WNBA in November, NCAAM in July) must keep the "last game played +
    // highlights" lookback card rather than swap it for a fixture list half a
    // year early — setting nextGameDay suppresses that fallback. getSeasonOpener
    // returns null for a league inside its own window, so this can never fire
    // mid-season. kind === "season" holds golf/tennis out: their ESPN endpoint is
    // the whole tour, not one event, and the tennis payload is big enough to have
    // its own retry carve-out.
    //
    // Hoisted above the current-view branch because the PAST tab needs it too:
    // defaultDateMode is "yesterday", so the landing view for most users is the
    // past tab, and it was the last one still rendering a bare countdown.
    const opener = getSeasonOpener(cfg.sport, label, viewDate);
    const openerInRange = !!opener && opener.kind === "season"
      && opener.daysUntil <= RANGE_LOOKAHEAD_DAYS;

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
    // Endgame slate (Jacob 9/11–9/12): once a league has ≤ ENDGAME_MAX games
    // left in the next ENDGAME_WINDOW_DAYS, show every one of them with its
    // day/time — a Slam from the semis, the NFL from the divisional round, the
    // World Series, a UCL final. Above that count the column keeps its normal
    // today-only slate so regular weeks never stack (the 6/19 World Cup call):
    // the domestic soccer leagues run 9–10 fixtures a week, so ≤5 fires only
    // at the very end of a bracket. NBA/NHL keep their own series rule below
    // (it already shows the whole remaining series). Event-tile and non-ESPN
    // sports returned before this point. ONE ranged request per column.
    let endgame = false;
    if (!failed && !isPastView && !nbaNhlPlayoff) {
      const ahead = await fetchNextGameDayRange(cfg.sport, date, ENDGAME_WINDOW_DAYS, { allGames: true });
      if (ahead && ahead.games.length <= ENDGAME_MAX) {
        nextGameDay = ahead;
        endgame = true;
      }
    }
    if (!endgame && !failed && !isPastView && (games.length === 0 || alwaysShowUpcoming)) {
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
        // Derived from the canonical SOCCER_SPORTS set rather than a second
        // hand-maintained list — the old duplicate array silently excluded any
        // newly added league from the widened lookahead. SOCCER_SPORTS also
        // contains fifa, but this branch is unreachable for it: the World Cup
        // is handled above with its own 80-day maxDays:1 window.
        // Second case for the same widening: an OFFSEASON column whose opener
        // already falls inside the range window — see openerInRange above.
        if (!nextGameDay && (SOCCER_SPORTS.has(cfg.sport) || openerInRange)) {
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
          // Offseason opener already inside the window: the 14-day day-by-day
          // walk can't reach an Oct 20 opening night from an August past tab, so
          // the column fell through to a bare countdown. Same ranged request the
          // current view uses, under the same daysUntil gate.
          : openerInRange
            ? await fetchNextGameDayRange(cfg.sport, date)
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
      // ⚠️ The standings endpoint keeps serving the FINISHED season's table all
      // offseason (in Aug 2026 it still returns DET 60-22 from 2025-26), so
      // stamping it onto an opening-night fixture printed "Celtics #4 / Pistons
      // #3" — last season's finish, on a game from a season with no standings
      // yet. Those cards get no rank; `games` and the lookback slate are real
      // games from the season the table describes, so they keep theirs.
      const rankTargets = openerInRange
        ? [games, previousGameDay?.games]
        : [games, nextGameDay?.games, previousGameDay?.games];
      applyTeamRanks(cfg.sport, await ranksPromise, rankTargets);
    }
    return { sport: cfg.sport, label, games, nextGameDay, previousGameDay, fetchFailed: failed };
  };

  // allSettled, not all: a single league throwing must not blank the whole
  // board. fetchLeague's helpers are already failure-tolerant (fetchGames
  // returns [] on any error), so this is defense-in-depth against a future
  // enrichment step reintroducing a throw — one bad column drops out, the
  // rest still render.
  // Top events runs AFTER the real columns so it can reuse their games —
  // then slots back into its own position(s), duplicates included.
  const regular = final.filter((cfg) => cfg.sport !== "top");
  const settled = await Promise.allSettled(regular.map(fetchLeague));
  const results: (LeagueData | null)[] = settled.map((r) => (r.status === "fulfilled" ? r.value : null));
  if (final.some((cfg) => cfg.sport === "top")) {
    const prefetched = new Map<Sport, Game[]>();
    for (const r of results) if (r && r.games.length) prefetched.set(r.sport, r.games);
    const top = await fetchTopEvents(date, viewDate, topOpts, prefetched).catch(
      (): LeagueData => ({ sport: "top", label: TOP_EVENTS_CONFIG.label, games: [], fetchFailed: true }),
    );
    final.forEach((cfg, idx) => { if (cfg.sport === "top") results.splice(idx, 0, top); });
  }
  return results.filter((r): r is LeagueData => r !== null);
}

// ESPN standings: { teamId -> "W-L" }. Cached per-sport so one team-view
// fetch doesn't re-pull for each game. Used to fill records on upcoming
// games, which the team-schedule endpoint omits.
const standingsCache = new Map<Sport, Promise<Map<string, string>>>();
export function fetchStandingsRecords(sport: Sport): Promise<Map<string, string>> {
  const cached = standingsCache.get(sport);
  if (cached) return cached;
  const url = standingsUrl(sport);
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
        // College hockey's overall displayValue carries a points tail ("24-0-0, 0 PTS",
        // read 2026-09-12; summary is the bare "24-0-0"). Drop it before the W-L
        // trim in case summary is ever absent and the fallback is used.
        if (sport === "ncaah" || sport === "ncaawh") rec = rec.split(",")[0].trim();
        if (THREE_SEGMENT_RECORD_SPORTS.has(sport) && rec.split("-").length === 3) {
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
// ⛔ NCAAF is NOT here on purpose: college football's rank comes from the poll
// on the event (parseTeam), not from standings — the standings feed has no
// `winPercent` stat, so this path returned an empty map for it. Listing it
// would also re-open the door to applyTeamRanks clobbering the poll rank.
// ⛔ NCAAH is NOT here either, for the same reason: its rank is the USCHO poll
// on the event, and its standings feed held one junk entry on 2026-09-12.
// ⛔ NCAAWH likewise (no standings feed; USCHO Top 15 rides the event).
const RANK_LEAGUES = new Set<Sport>([
  "mlb", "nba", "wnba", "ncaam", "ncaaw", "nfl", "nhl", "epl", "mls", "ucl", "uel",
  // UFL: one flat 8-team table with a real `winPercent` stat and no per-row
  // `rank` (read 2026-09-14), so the win% sort gives a league-wide position.
  "ufl",
  // Single-table domestic leagues — ESPN's standings carry a real league-wide
  // `rank`, so they need no RANK_METRIC entry (same as EPL).
  "laliga", "seriea", "bundesliga", "ligue1",
  // Second-wave single-table leagues. Liga MX qualifies because each tournament
  // (Apertura / Clausura) is its own single table.
  "ligamx", "nwsl", "efl", "saudi",
  // CFL: the worker's standings route is one table with `rank` = theScore's
  // league-wide playoff_seed (crossover rule applied), so no RANK_METRIC.
  "cfl",
  // Deliberately NOT here: libertadores, euro, afcon. All three are group-stage
  // tournaments with no league-wide rank, and — exactly like the World Cup
  // exclusion above — a live group position is itself a spoiler.
]);

// ESPN standings → { teamId -> overall league rank (1 = best) }. Cached per
// sport. The ranking rule itself (single-table `rank` vs metric sort, the
// early-season gate, tiebreaks) lives in lib/standingsRank.ts so it is
// unit-testable; this is only the fetch + cache.
const standingsRankCache = new Map<Sport, Promise<Map<string, number>>>();
export function fetchStandingsRanks(sport: Sport): Promise<Map<string, number>> {
  const cached = standingsRankCache.get(sport);
  if (cached) return cached;
  const url = standingsUrl(sport);
  const p = (async () => {
    try {
      const res = await fetchWithRetry(url, 1, 6000);
      if (!res.ok) return new Map<string, number>();
      return rankFromStandings(sport, (await res.json()) as StandingsPayload);
    } catch { /* swallow — ranks just won't show */ }
    return new Map<string, number>();
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
  if (WORKER_SCOREBOARD_SPORTS.has(sport)) return fetchWorkerTeamSchedule(sport, espnTeamId, years);
  const asinMap = await loadPrimeAsins();
  const standingsPromise = fetchStandingsRecords(sport);
  const all: Game[] = [];
  const seen = new Set<string>();
  await Promise.all(
    years.map(async (year) => {
      const sportPath = SPORT_PATHS[sport].replace(/\/scoreboard$/, "");
      // ⚠️ This endpoint returns ONE season type per call and picks the default
      // itself — not the union. Between the last preseason game and Week 1
      // (measured 2026-09-04) it answered `requestedSeason: {type: 1}`, so a
      // Lions schedule was THREE August exhibitions and not one of the 17 real
      // games. Asking explicitly for 1/2/3 returns 3 / 17 / 0 for that same
      // team, and `seen` already dedups the overlap.
      // Gridiron only: it is the sport whose preseason the app deliberately
      // keeps (LEAGUES carries an "NFL Preseason" column), and the sport whose
      // default flipped underneath us. Every other sport still makes the single
      // call it always made — no extra requests, no new behaviour to re-verify.
      const seasonTypes = sport === "nfl" || sport === "ncaaf" ? [1, 2, 3] : [undefined];
      const pages = await Promise.all(seasonTypes.map(async (seasonType) => {
        const url = new URL(
          `${BASE_URL}${sportPath}/teams/${espnTeamId}/schedule`
        );
        url.searchParams.set("season", String(year));
        if (seasonType != null) url.searchParams.set("seasontype", String(seasonType));
        try {
          const r = await fetchWithRetry(url.toString());
          if (!r.ok) return [];
          const d = await r.json();
          return d.events ?? d.team?.events ?? [];
        } catch {
          // One season type failing must not lose the others — a 500 on the
          // (empty) postseason call should never blank out the regular season.
          return [];
        }
      }));
      const events = pages.flat();
      for (const e of events) {
        // Team-schedule events nest status inside competitions[0] and use
        // different shapes for broadcasts / records / logos vs scoreboard.
        // Reshape to match the scoreboard shape so parseGame works uniformly.
        // ⚠️ SEASON TYPE LIVES SOMEWHERE ELSE HERE. The scoreboard puts it at
        // `event.season.type`; this endpoint's `season` is only
        // {year, displayName} and the type sits on a sibling `seasonType`
        // object ({id, type, name, abbreviation}). So the pre-existing
        // `e.season?.type ?? 0` below read 0 for EVERY team-schedule event —
        // which silently disabled both the preseason carve-out (other sports'
        // exhibitions were never filtered out of a team schedule the way they
        // are on the board) and parseGame's `season.type === 3` playoff flag
        // (a postseason game was only ever caught by the notes regex).
        // Copy it across before parseGame runs, same as the reshapes below.
        const resolvedSeasonType = e.seasonType?.type ?? e.season?.type;
        if (typeof resolvedSeasonType === "number") {
          e.season = { ...(e.season ?? {}), type: resolvedSeasonType };
        }
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
        const seasonType = resolvedSeasonType ?? 0;
        // Same NFL-preseason carve-out as eventsToGames — a team's schedule
        // should list its preseason games while the Preseason column is live.
        if (seasonType === 1 && sport !== "nfl") continue;
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
  all.sort((a, b) => chronoMs(a.date) - chronoMs(b.date));
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

// Team schedule for the worker-served leagues: there is no per-team endpoint,
// so pull the season's slate through the scoreboard route in one ranged call
// and keep the games this team is in. CFL seasons are single calendar year
// (May preseason → mid-November Grey Cup), so one window per year covers it.
async function fetchWorkerTeamSchedule(sport: Sport, rawTeamId: string, years: number[]): Promise<Game[]> {
  const teamId = `${sport}-${rawTeamId}`;
  const standingsPromise = fetchStandingsRecords(sport);
  const seen = new Set<string>();
  const all: Game[] = [];
  await Promise.all(years.map(async (year) => {
    const url = scoreboardUrl(sport);
    url.searchParams.set("dates", `${year}0501-${year}1201`);
    try {
      const res = await fetchWithRetry(url.toString());
      if (!res.ok) return;
      const data: { events?: unknown[] } | null = await res.json();
      for (const g of eventsToGames((data?.events ?? []) as ScoreboardEvent[], sport)) {
        if (g.homeTeam.id !== teamId && g.awayTeam.id !== teamId) continue;
        if (seen.has(g.id)) continue;
        seen.add(g.id);
        g.streamUrl = buildStreamUrl(g);
        all.push(g);
      }
    } catch {
      // One year failing must not lose the others.
    }
  }));
  all.sort((a, b) => chronoMs(a.date) - chronoMs(b.date));
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
