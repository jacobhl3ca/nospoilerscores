import { Sport } from "./types";
import { setServiceTimeZone } from "./etDay";

const STORAGE_KEY = "nss-preferences";

// Compact encoding for share URLs: mlb→m, nba→n, wnba→wn, ncaam→c, nhl→h, nfl→f, golf→g, tennis→t, fifa→w
// The decoder regex (`[a-z]+`) and SHORT_TO_SPORT lookup handle multi-char codes,
// so wnba doesn't need a single char — keeps fifa→w stable for existing share URLs.
// Added 2026-05-27: ncaaw→cw (women's college bb), ncaaf→cf (college football),
// ucl→uc (Champions League), uel→ue (Europa League).
const SPORT_TO_SHORT: Record<Sport, string> = { mlb: "m", nba: "n", wnba: "wn", ncaam: "c", ncaaw: "cw", ncaaf: "cf", nhl: "h", nfl: "f", golf: "g", tennis: "t", fifa: "w", epl: "e", mls: "s", ucl: "uc", uel: "ue", f1: "fo", ufc: "u" };
const SHORT_TO_SPORT: Record<string, Sport> = Object.fromEntries(
  Object.entries(SPORT_TO_SHORT).map(([k, v]) => [v, k as Sport])
) as Record<string, Sport>;

// Encode team ID "mlb-1" → "m1", decode "m1" → "mlb-1"
function encodeTeamId(id: string): string {
  const dash = id.indexOf("-");
  if (dash === -1) return id;
  const sport = id.slice(0, dash) as Sport;
  return (SPORT_TO_SHORT[sport] ?? sport) + id.slice(dash + 1);
}

function decodeTeamId(short: string): string {
  const match = short.match(/^([a-z]+)(\d+)$/);
  if (!match) return short;
  const sport = SHORT_TO_SPORT[match[1]];
  return sport ? `${sport}-${match[2]}` : short;
}

export type Theme = "dark" | "light" | "system";
export type DefaultDateMode = "smart" | "today" | "yesterday";
export type DefaultLandingView = "remember" | "scores" | "news";
// auto = current behavior (off in morning, last state after noon ET).
// off / on = explicit override.
export type DefaultRatings = "auto" | "off" | "on";

// Compact single-char codes for the four enum prefs so share URLs stay short.
const THEME_TO_SHORT: Record<Theme, string> = { system: "s", light: "l", dark: "d" };
const SHORT_TO_THEME: Record<string, Theme> = { s: "system", l: "light", d: "dark" };
const DATE_MODE_TO_SHORT: Record<DefaultDateMode, string> = { smart: "s", today: "t", yesterday: "y" };
const SHORT_TO_DATE_MODE: Record<string, DefaultDateMode> = { s: "smart", t: "today", y: "yesterday" };
const LANDING_TO_SHORT: Record<DefaultLandingView, string> = { remember: "r", scores: "s", news: "n" };
const SHORT_TO_LANDING: Record<string, DefaultLandingView> = { r: "remember", s: "scores", n: "news" };
const RATINGS_TO_SHORT: Record<DefaultRatings, string> = { auto: "a", off: "f", on: "o" };
const SHORT_TO_RATINGS: Record<string, DefaultRatings> = { a: "auto", f: "off", o: "on" };

// Encode: ["mlb-1","nba-15"] → "m1.n15"
// slotLeagues encodes per-slot overrides as `s1.s2.s3`, with "_" for unset slots.
// e.g. ["nba", undefined, "mlb"] → "n._.m"
// Optional snapshot fields (theme/dateMode/landingView/ratings/newsThirdLeague)
// are appended only when set, keeping the URL short for partial snapshots.
export function encodeFavorites(
  teams: string[],
  leagues: Sport[],
  thirdLeague?: Sport | "empty",
  slotLeagues?: (Sport | "empty" | undefined)[],
  extras?: {
    theme?: Theme;
    defaultDateMode?: DefaultDateMode;
    defaultLandingView?: DefaultLandingView;
    defaultRatings?: DefaultRatings;
    newsThirdLeague?: Sport;
  },
): URLSearchParams {
  const params = new URLSearchParams();
  if (teams.length > 0) params.set("f", teams.map(encodeTeamId).join("."));
  if (leagues.length > 0) params.set("l", leagues.map((s) => SPORT_TO_SHORT[s] ?? s).join("."));
  if (thirdLeague) params.set("t", thirdLeague === "empty" ? "0" : (SPORT_TO_SHORT[thirdLeague] ?? thirdLeague));
  // "empty" slot encoded as "0" so it round-trips through SHORT_TO_SPORT (which
  // would otherwise drop it back to undefined and lose the explicit hide).
  if (slotLeagues && slotLeagues.some(Boolean)) {
    params.set("s", slotLeagues.map((s) => (!s ? "_" : s === "empty" ? "0" : (SPORT_TO_SHORT[s] ?? s))).join("."));
  }
  if (extras?.theme) params.set("th", THEME_TO_SHORT[extras.theme]);
  if (extras?.defaultDateMode) params.set("dd", DATE_MODE_TO_SHORT[extras.defaultDateMode]);
  if (extras?.defaultLandingView) params.set("dv", LANDING_TO_SHORT[extras.defaultLandingView]);
  if (extras?.defaultRatings) params.set("dr", RATINGS_TO_SHORT[extras.defaultRatings]);
  if (extras?.newsThirdLeague) params.set("n", SPORT_TO_SHORT[extras.newsThirdLeague] ?? extras.newsThirdLeague);
  return params;
}

// Decode: "m1.n15" → ["mlb-1","nba-15"]
export function decodeFavorites(params: URLSearchParams): {
  teams?: string[];
  leagues?: Sport[];
  thirdLeague?: Sport | "empty";
  slotLeagues?: (Sport | "empty" | undefined)[];
  theme?: Theme;
  defaultDateMode?: DefaultDateMode;
  defaultLandingView?: DefaultLandingView;
  defaultRatings?: DefaultRatings;
  newsThirdLeague?: Sport;
} {
  const result: {
    teams?: string[];
    leagues?: Sport[];
    thirdLeague?: Sport | "empty";
    slotLeagues?: (Sport | "empty" | undefined)[];
    theme?: Theme;
    defaultDateMode?: DefaultDateMode;
    defaultLandingView?: DefaultLandingView;
    defaultRatings?: DefaultRatings;
    newsThirdLeague?: Sport;
  } = {};
  const f = params.get("f");
  const l = params.get("l");
  const t = params.get("t");
  const s = params.get("s");
  if (f) result.teams = f.split(".").map(decodeTeamId).filter(Boolean);
  if (l) result.leagues = l.split(".").map((s) => SHORT_TO_SPORT[s]).filter(Boolean) as Sport[];
  // Guard the unknown-code case: SHORT_TO_SPORT is typed Record<string, Sport>,
  // so an unrecognized `t` (malformed/hand-edited share URL) silently yields
  // `undefined` that the type claims can't happen, landing an out-of-type
  // `thirdLeague: undefined` on the result. Only assign a real Sport (or the
  // "empty" sentinel), matching how every sibling decode below guards its code.
  if (t === "0") result.thirdLeague = "empty";
  else if (t && SHORT_TO_SPORT[t]) result.thirdLeague = SHORT_TO_SPORT[t];
  // Same unknown-code guard as thirdLeague above: an unrecognized slot token in a
  // malformed/hand-edited share URL makes SHORT_TO_SPORT[tok] undefined, which the
  // Sport-typed index signature hides — smuggling an out-of-type value into the
  // Sport branch. Coalesce it to the same `undefined` the "_" unset-slot sentinel
  // uses, so a bad code degrades to an auto slot instead. Runtime-identical (an
  // unknown code already yielded undefined); this just makes the intent explicit.
  if (s) result.slotLeagues = s.split(".").map((tok) => (tok === "_" ? undefined : tok === "0" ? "empty" : SHORT_TO_SPORT[tok] ?? undefined));
  const th = params.get("th");
  const dd = params.get("dd");
  const dv = params.get("dv");
  const dr = params.get("dr");
  const n = params.get("n");
  if (th && SHORT_TO_THEME[th]) result.theme = SHORT_TO_THEME[th];
  if (dd && SHORT_TO_DATE_MODE[dd]) result.defaultDateMode = SHORT_TO_DATE_MODE[dd];
  if (dv && SHORT_TO_LANDING[dv]) result.defaultLandingView = SHORT_TO_LANDING[dv];
  if (dr && SHORT_TO_RATINGS[dr]) result.defaultRatings = SHORT_TO_RATINGS[dr];
  if (n && SHORT_TO_SPORT[n]) result.newsThirdLeague = SHORT_TO_SPORT[n];
  return result;
}

export interface Preferences {
  favoriteLeagues: Sport[]; // ordered by priority (first = highest)
  favoriteTeams: string[]; // team IDs, ordered by priority (first = highest)
  theme: Theme;
  showRatings: boolean;
  skipExplainer: boolean;
  skipNewsExplainer: boolean;
  showNews: boolean; // persist last view across refreshes
  // "empty" hides the slot (no league rendered for that column).
  thirdLeague?: Sport | "empty"; // user-chosen 3rd league slot override
  firstLeague?: Sport | "empty"; // user-chosen 1st league slot override
  secondLeague?: Sport | "empty"; // user-chosen 2nd league slot override
  // Slots 4-5 only render on wide viewports (the 5-column board); on narrow
  // screens the prefs persist untouched and the board falls back to 3 slots.
  fourthLeague?: Sport | "empty"; // user-chosen 4th league slot override
  fifthLeague?: Sport | "empty"; // user-chosen 5th league slot override
  // Hide the ▾ league-switcher arrows in the column headers (tap-to-switch
  // still works — the arrow is just the discoverability hint). Only relevant
  // in "dropdown" switcher mode.
  hideLeagueChevrons?: boolean;
  // Column-header league switcher style: dropdown (default), arrows (‹ › on
  // either side of the title cycle through the leagues), or off (plain
  // header — switching only via Settings).
  leagueSwitcherMode?: "dropdown" | "arrows" | "off";
  // Leagues the user removed from the homepage switcher (header dropdown /
  // arrow cycling / news swap / + button picks). Settings' slot pickers stay
  // unfiltered so a hidden league can still be pinned deliberately.
  hiddenLeagues?: Sport[];
  // Hide the favorite-star next to team names on game cards (favoriting stays
  // available via the team-schedule view + settings picker).
  hideTeamStars?: boolean;
  // "Add the World Cup column" banner dismissed (only shows during the
  // tournament when no visible column is the World Cup).
  wcBannerDismissed?: boolean;
  newsThirdLeague?: Sport; // user-chosen league for news col 3 (undefined = top headlines)
  // Default date on launch: smart (yesterday before 1 PM ET, today after),
  // always today, or always yesterday.
  defaultDateMode?: DefaultDateMode;
  // Landing view on launch: remember last (default), always scores, always news.
  defaultLandingView?: DefaultLandingView;
  // Calendar day (ET, YYYY-MM-DD) of the last app open. Lets a "remember"
  // landing view drop a remembered News view to Scores across a day boundary,
  // so the user never lands on yesterday's news (= spoilers). Jacob 6/19.
  lastOpenDay?: string;
  // Ratings on launch: auto (smart morning reset), always off, always on.
  defaultRatings?: DefaultRatings;
  // News-view column count (1, 2, or 3). Default 3 (see `defaults` below).
  newsColCount?: 1 | 2 | 3;
  // Hour-of-day (user-local) at which "smart" landing flips from yesterday
  // to today. 0-23. Default 13 (1 PM local) — covers when most morning
  // slate is final for Eastern fans; users in other zones can pick their own.
  smartCutoffHour?: number;
  // Per-sport custom news-source ordering. Keyed by sport, value is an
  // ordered list of source labels (e.g. ["NBA Top Videos", "ESPN", ...]).
  // Sources missing from the list fall back to the cascade default order
  // appended to the end. Absence of an entry = use Smart (default) order.
  newsSourceOrder?: Record<string, string[]>;
  // Source-type pill filter for the news view. "all" shows every source;
  // others restrict to one type globally across all visible leagues.
  newsTypeFilter?: "all" | "topvideos" | "espn" | "reddit" | "homepage";
  // User-chosen ordering of the source-type filter options (the values above).
  // Drag-to-reorder in the funnel popover persists here. Unknown/new values
  // fall through to the tail in default order, so added sources still show.
  newsTypeFilterOrder?: string[];
  // When set, the news view shows ONLY this entry. "espn" focuses the
  // always-present ESPN entry; otherwise a league sport. Undefined = all.
  newsFocusLeague?: Sport | "espn";
  // Source labels the user has hidden via the per-source visibility checkbox.
  // Applied alongside the type pill (independent filters).
  newsHiddenSources?: string[];
  // Spoiler mask on the highlight-video player: maskVideoTitle covers
  // YouTube's title strip (top). Defaults ON (undefined ⇒ true ⇒ covered) so
  // the player stays spoiler-safe out of the box; the user opts out in Settings.
  maskVideoTitle?: boolean;
  // Opt-in (default OFF / undefined ⇒ false): show YouTube's NATIVE control bar
  // (controls:1) on highlight clips instead of the stripped spoiler-safe player.
  // Gives back YT's own progress/seek bar + time — a spoiler the user accepts,
  // handy in fullscreen. When on, the bottom spoiler mask steps aside.
  youtubeNativeControls?: boolean;
  // Highlight-player seek control: the progress bar + the 10% jump buttons
  // ("both", default), just the bar, or just the jumps. The bar is custom and
  // spoiler-safe (no YouTube hover-thumbnails; drag-seek capped at 90% so the
  // ending can't be skipped to — same cap as the jump presets).
  videoSeekControl?: "both" | "bar" | "jumps";
  // Seek-bar fill style. Default "off" = a blank track that lets you scrub
  // without revealing how far through you are (the fill is itself a mild
  // progress spoiler). "grey" = a subtle low-contrast fill, "white" = the
  // original bright fill, for users who'd rather see position.
  videoSeekFill?: "off" | "grey" | "white";
  // When true, drop the 90% seek cap so the bar / ±5s can reach the very end of
  // the clip. Default false keeps the ending unreachable (no-spoiler default).
  videoAllowEnd?: boolean;
  // When true, a click/jump that would land past the halfway point first asks
  // for confirmation, so you don't accidentally skip into late-game action.
  // Default false (no prompt).
  videoWarnHalfway?: boolean;
  // Single-column board layout: instead of the 3–5 side-by-side league
  // columns, stack every league in one centered, wider column with bigger
  // cards (larger logos + team names). Great on phones and for reading one
  // card at a time. Default false (the multi-column board). The top-game ⭐
  // and per-slot league switching still apply.
  singleColumn?: boolean;
  // Single-column NEWS layout: same idea as singleColumn but for the news view —
  // stack every news column into one centered, wider column instead of
  // side-by-side. Available on large screens too (the news view already
  // auto-stacks on phones). Default false.
  newsSingleColumn?: boolean;
  // First-run league picker: set true once the user has seen the on-first-open
  // "pick your leagues" modal (whether they chose leagues or tapped "Use
  // defaults"). Absent/false = never shown. Gated together with a no-stored-prefs
  // check so only genuinely new installs see it; because it lives in Preferences
  // it also syncs via Sign in with Apple, so a returning signed-in user on a
  // fresh device won't re-see the picker.
  leaguesOnboarded?: boolean;
  // IANA time zone (e.g. "America/Los_Angeles") used app-wide for both the
  // "today" date boundary and every displayed time. Undefined = "Auto" = the
  // device's own zone, so the default behavior is unchanged. Applied globally
  // via setServiceTimeZone() in loadPreferences()/savePreferences().
  timezone?: string;
  // News headlines are spoilers (a highlight's title gives away the result), so
  // every headline in the news view + modal is blurred by default. The "Titles"
  // eye toggle in the news header flips this on to reveal them all at once.
  // Undefined/false = blurred (default); true = revealed.
  revealNewsTitles?: boolean;
  // Text posts (headline-only news items — no pic/video) are hidden by default
  // while headlines are blurred, since a blurred text-only headline is a useless
  // blank. This toggle exposes them (readable) without revealing the blurred
  // pic/video headlines. Undefined/false = hidden (default); true = shown.
  // Moot when revealNewsTitles is on (everything shows then).
  showTextPosts?: boolean;
}

const defaults: Preferences = {
  favoriteLeagues: [],
  favoriteTeams: [],
  theme: "system",
  showRatings: false,
  skipExplainer: false,
  skipNewsExplainer: false,
  showNews: false,
  defaultDateMode: "smart",
  defaultLandingView: "remember",
  defaultRatings: "auto",
  newsColCount: 3,
  smartCutoffHour: 13,
  newsTypeFilter: "all",
};

export function loadPreferences(): Preferences {
  if (typeof window === "undefined") return defaults;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const prefs = raw ? { ...defaults, ...JSON.parse(raw) } : defaults;
    // Push the chosen zone into the shared module so the data layer + UI agree
    // before the first fetch/render after a load.
    setServiceTimeZone(prefs.timezone);
    return prefs;
  } catch {
    return defaults;
  }
}

// Optional hook: when the user is signed in (Sign in with Apple), HomeContent
// registers a pusher here so every savePreferences() call also syncs the prefs
// to the server. Null (the default) = anonymous, localStorage only.
type RemoteSync = (prefs: Preferences) => void;
let remoteSync: RemoteSync | null = null;
export function setRemoteSync(fn: RemoteSync | null): void {
  remoteSync = fn;
}

export function savePreferences(prefs: Preferences): void {
  if (typeof window === "undefined") return;
  setServiceTimeZone(prefs.timezone);
  // localStorage.setItem can throw — quota exceeded, or storage blocked in a
  // sandboxed/private context — and savePreferences runs straight out of click
  // handlers (e.g. toggling a setting). Mirror loadPreferences' guard so a
  // failed write never bubbles up and trips the route error boundary. The
  // remote sync below is the durable store for signed-in users, so it must
  // still fire even when the local write can't land.
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    /* storage full/unavailable — in-memory prefs still apply this session */
  }
  if (remoteSync) remoteSync(prefs);
}
