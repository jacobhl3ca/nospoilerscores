import { Sport } from "./types";
import type { TopEventsMode, TopEventsCount } from "./topEvents";
import { setServiceTimeZone } from "./etDay";

const STORAGE_KEY = "nss-preferences";

// Compact encoding for share URLs: mlb→m, nba→n, wnba→wn, ncaam→c, nhl→h, nfl→f, golf→g, tennis→t, fifa→w
// The decoder regex (`[a-z]+`) and SHORT_TO_SPORT lookup handle multi-char codes,
// so wnba doesn't need a single char — keeps fifa→w stable for existing share URLs.
// Added 2026-05-27: ncaaw→cw (women's college bb), ncaaf→cf (college football),
// ucl→uc (Champions League), uel→ue (Europa League).
// Added 2026-08-03: laliga→ll, seriea→sa, bundesliga→bl, ligue1→lg. Codes must
// stay collision-free against every existing value (mls is already "s", so
// Serie A takes "sa", not "s") and must be LETTERS ONLY — decodeTeamId splits
// on /^([a-z]+)(\d+)$/, so a digit in the code (ligue1→"l1") gets swallowed
// into the team-id group and the whole id fails to decode. That's the same
// reason f1 is encoded "fo".
// Added 2026-08-03 (second wave): ligamx→mx, nwsl→nw, efl→ec, libertadores→lb,
// euro→eu, afcon→af, saudi→sp. Same two rules as above — letters only, and
// collision-free against every code already in this map (note nwsl is "nw", NOT
// a reversal risk with wnba's existing "wn"; they are distinct keys and both
// must stay, since changing either would break already-shared URLs).
// Added 2026-08-11: llws→lw, and the five rugby competitions sn/rw/rc/sr/rt.
// Same two rules again — letters only, and checked collision-free against
// every code already in this map before being added.
// Added 2026-09-12: ncaah→hc (men's college hockey). "ch" is chess and c/cw/cf
// are the other college keys, so hockey leads with its own letter.
// Added 2026-09-14: ufl→uf (UFL spring football). "u" is ufc and "ue" is uel,
// so the league takes its second letter.
// Added 2026-09-14: ncaabase→cb, ncaasoft→cs (college baseball / softball);
// both checked free against every code in the map.
// Added 2026-09-14: ncaawh→hw (women's college hockey), collision-free.
const SPORT_TO_SHORT: Record<Sport, string> = { mlb: "m", nba: "n", wnba: "wn", ncaam: "c", ncaaw: "cw", ncaaf: "cf", nhl: "h", ncaah: "hc", ncaawh: "hw", nfl: "f", ufl: "uf", llws: "lw", ncaabase: "cb", ncaasoft: "cs", golf: "g", tennis: "t", fifa: "w", epl: "e", mls: "s", ucl: "uc", uel: "ue", laliga: "ll", seriea: "sa", bundesliga: "bl", ligue1: "lg", ligamx: "mx", nwsl: "nw", efl: "ec", libertadores: "lb", euro: "eu", afcon: "af", saudi: "sp", cricket: "ck", sixnations: "sn", rugbywc: "rw", rugbychamp: "rc", superrugby: "sr", rugbytest: "rt", nationschamp: "nc", f1: "fo", nascar: "ns", indycar: "ic", ufc: "u", boxing: "bx", chess: "ch", poker: "pk", esports: "es", top: "tp" };
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

// Returns the full team id ("mlb-1") or null when the token isn't a decodable
// `<shortcode><digits>` pair whose prefix is a known sport. Previously an
// unrecognized token (a truncated/hand-edited share URL, e.g. "zz9") fell
// through both `return short` branches unchanged; because that's a non-empty
// string it survived the caller's `.filter(Boolean)` and landed a bogus,
// team-matching-nothing id in `favoriteTeams` — which then persists to
// localStorage AND (for signed-in users) syncs to the server. Return null so
// the caller drops it, matching how the sibling thirdLeague/slotLeagues decodes
// in decodeFavorites already reject unknown codes.
function decodeTeamId(short: string): string | null {
  const match = short.match(/^([a-z]+)(\d+)$/);
  if (!match) return null;
  const sport = SHORT_TO_SPORT[match[1]];
  return sport ? `${sport}-${match[2]}` : null;
}

export type Theme = "dark" | "light" | "system";
export type DefaultDateMode = "smart" | "today" | "yesterday";
// "ratings" is the third segment of the header control (🙉), not a fourth
// screen: it lands on Scores with ratings already showing.
export type DefaultLandingView = "remember" | "scores" | "news" | "ratings";
// auto = current behavior (off in morning, last state after noon ET).
// off / on = explicit override.
export type DefaultRatings = "auto" | "off" | "on";

// Compact single-char codes for the four enum prefs so share URLs stay short.
const THEME_TO_SHORT: Record<Theme, string> = { system: "s", light: "l", dark: "d" };
const SHORT_TO_THEME: Record<string, Theme> = { s: "system", l: "light", d: "dark" };
const DATE_MODE_TO_SHORT: Record<DefaultDateMode, string> = { smart: "s", today: "t", yesterday: "y" };
const SHORT_TO_DATE_MODE: Record<string, DefaultDateMode> = { s: "smart", t: "today", y: "yesterday" };
const LANDING_TO_SHORT: Record<DefaultLandingView, string> = { remember: "r", scores: "s", news: "n", ratings: "g" };
const SHORT_TO_LANDING: Record<string, DefaultLandingView> = { r: "remember", s: "scores", n: "news", g: "ratings" };
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
  if (f) result.teams = f.split(".").map(decodeTeamId).filter((id): id is string => id !== null);
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
  /** @deprecated 8/11 — the ▾ is now implied by leagueSwitcherMode
   *  ("dropdown"/"both" draw it, "arrows"/"off" never did). Kept only so
   *  stored preferences from before the change still parse. Nothing reads it. */
  hideLeagueChevrons?: boolean;
  // Column-header league switcher style: dropdown (default), arrows (‹ › on
  // either side of the title cycle through the leagues), or off (plain
  // header — switching only via Settings).
  leagueSwitcherMode?: "dropdown" | "arrows" | "both" | "off";
  // Leagues the user removed from the homepage switcher (header dropdown /
  // arrow cycling / news swap / + button picks). Settings' slot pickers stay
  // unfiltered so a hidden league can still be pinned deliberately.
  hiddenLeagues?: Sport[];
  // Opt-in leagues the user explicitly added to the homepage switcher. Leagues
  // marked excludeFromAuto start unchecked, so this separate allowlist lets a
  // user enable one durably without making every future opt-in league visible.
  shownLeagues?: Sport[];
  // Settings-only view filter for the "Leagues in the switcher" catalog: hide
  // the rows currently marked "· offseason". Purely cosmetic — it changes which
  // rows that one list DRAWS, never which leagues are in the switcher, so a
  // checked offseason league (NBA in August) stays listed and stays uncheckable
  // by hand. Off by default: Settings is the durable catalog and a first-time
  // visitor should see everything HideScore carries.
  hideOffseasonInCatalog?: boolean;
  // v2 changed opt-in leagues from implicitly checked to default-off. A saved
  // version means this prefs blob has either received the one-time legacy
  // preservation migration or was created after the new defaults launched.
  switcherDefaultsVersion?: 2;
  // Hide the favorite-star next to team names on game cards (favoriting stays
  // available via the team-schedule view + settings picker).
  //
  // Undefined means the user has never touched the toggle, and that is load-
  // bearing: on their THIRD session the app sets this to true by itself (Jacob
  // 8/31). The star's job is to teach a new user which cards are theirs; by the
  // third visit they know, and it is just noise. Anyone who has already set the
  // toggle either way is left alone, and turning stars back on afterwards
  // sticks — session counting has stopped by then. See STARS_AUTO_HIDE_SESSION
  // in lib/sessionVisits.ts.
  hideTeamStars?: boolean;
  // `showTeamRecords` (W-L records on game cards) was REMOVED 2026-09-05. It was
  // opt-in from 8/4 and not one of the 21 accounts ever turned it on, and the
  // record is a second-order spoiler by nature — today's 63-49 encodes whether
  // the team won last night. Old synced prefs may still carry the key; it is
  // ignored, and it should not come back as a toggle.
  // "Add the World Cup column" banner dismissed (only shows during the
  // tournament when no visible column is the World Cup).
  wcBannerDismissed?: boolean;
  // Season-kickoff banners the user dismissed, keyed by sport + kickoff day
  // ("epl-2026-08-21"), capped to the last dozen keys so this can't grow
  // without bound in a synced prefs blob. Since 9/5 ANY entry retires the
  // banner for good — it is a one-time heads-up, not a reminder that returns
  // with the next opener (Jacob: "only popup once total"). The keys still
  // record which opener the user saw. Merged as a union across devices — see
  // lib/dismissals.ts. (A `kickoffBannerSnoozedUntil` date lived here 9/4-9/5;
  // old blobs may still carry it, nothing reads it.)
  kickoffBannersDismissed?: string[];
  // Top events column (lib/topEvents.ts). All three undefined = Auto (ESPN's
  // homepage strip + your starred teams), 8 games.
  topEventsMode?: TopEventsMode;
  topEventsLeagues?: Sport[];
  topEventsCount?: TopEventsCount;
  // The footer's Google Play badge, hidden by its own dismiss control. Only
  // signed-in users are given that control, because the dismissal rides this
  // prefs blob and only a signed-in account pushes the blob to the server — a
  // signed-out dismissal would be silently device-only, which is not what
  // "stays removed on their account" is supposed to mean.
  playBadgeDismissed?: boolean;
  newsThirdLeague?: Sport; // user-chosen league for news col 3 (undefined = top headlines)
  // The generic "News" column is independent of scores slot 3. It appears by
  // default; true means the user explicitly removed it from the news board.
  newsGenericHidden?: boolean;
  // Which POSITION the generic "Top news" column occupies on the news board
  // (0-2, default 2 = last). Picking "Top news (ESPN)" from any column's
  // switcher moves the column here rather than doing nothing — before this,
  // the action only ever targeted col 3, so choosing it from a league column
  // silently no-op'd (Jacob 8/9). The two league columns close ranks around
  // it, so the board still shows the same three feeds.
  newsGenericSlot?: 0 | 1 | 2;
  // Date shown on launch: smart (yesterday before 1 PM ET, today after),
  // always today, or always yesterday (default — see the `defaults` object below).
  defaultDateMode?: DefaultDateMode;
  // Landing view on launch: remember last (default), always scores, always news.
  defaultLandingView?: DefaultLandingView;
  // Calendar day (ET, YYYY-MM-DD) of the last app open. Lets a "remember"
  // landing view drop a remembered News view to Scores across a day boundary,
  // so the user never lands on yesterday's news (= spoilers). Jacob 6/19.
  lastOpenDay?: string;
  // Visit counter behind the stars auto-hide above. A "session" is an app open
  // more than 30 minutes after the last one, so a reload or a tab revisit does
  // not inflate it. Counting STOPS once it reaches STARS_AUTO_HIDE_SESSION —
  // otherwise this pair would change on every single visit and turn a
  // once-a-day prefs sync into a once-a-visit one, forever, for a number
  // nothing reads any more. Logic + tests: lib/sessionVisits.ts.
  sessionCount?: number;
  // Epoch ms of the last app open. Only maintained while sessionCount is still
  // counting; see above.
  lastSessionAt?: number;
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
  // others restrict to one type globally across all visible leagues. Retained
  // as the legacy/single-select fallback for preferences saved before the
  // multi-select source controls shipped.
  newsTypeFilter?: "all" | "topvideos" | "espn" | "reddit" | "homepage";
  // Independently enabled news source types. Once present this is authoritative
  // over newsTypeFilter, so a user can combine (for example) Reddit + ESPN while
  // leaving homepage feeds unchecked. At least one stays enabled in the UI.
  newsTypeFilters?: ("topvideos" | "espn" | "reddit" | "homepage")[];
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
  // The bottom-right keyboard-shortcuts hint (ControlsHint). Default ON
  // (undefined ⇒ shown) — the modal keyboard is invisible otherwise, which is
  // how Shift+←/→ went unnoticed until it broke. `true` here means HIDDEN, so
  // the ✕ only ever has to write one value and a fresh install shows the hint.
  hideControlsHint?: boolean;
  // Spoiler mask on the highlight-video player: maskVideoTitle covers
  // YouTube's title strip (top).
  // Default OFF as of 2026-09-08 (undefined ⇒ false ⇒ not covered), flipped from
  // ON at Jacob's request: "everyone who hasnt manually turned on the cover title
  // in hidescore please turn that off for them". undefined is exactly the set of
  // people who never touched the toggle, so reading it as false turns it off for
  // them and leaves an explicit `true` alone — nobody who chose the mask loses it.
  // What it was protecting has narrowed anyway: the mask only ever mattered while
  // YouTube's own title bar was on screen (a pause, or a desktop mouse-move), the
  // post's real headline sits under the player already with the app's own blur on
  // it, and covering the top ~50px of every clip costs real footage on a phone.
  maskVideoTitle?: boolean;
  // Default ON (undefined ⇒ true, matching the `?? true` at every read site —
  // HomeContent, SettingsPanel — and the `youtubeNativeControls: true` default
  // below): show YouTube's NATIVE control bar (controls:1) on highlight clips
  // instead of the stripped spoiler-safe player. Gives back YT's own progress/
  // seek bar + time — a spoiler the user accepts, handy in fullscreen. When on,
  // the bottom spoiler mask steps aside. Default TRUE as of 2026-08-09 (Jacob:
  // "our player is good but a little overkill and not worth the trade off of
  // usage"). The safe player still exists behind this toggle; what it buys — a
  // blank seek track, no elapsed/duration readout — is real, but it costs the
  // familiarity of the player everyone already knows, and its click-catcher was
  // the thing swallowing the first tap. The headline spoiler mask over
  // YouTube's title bar stays on in BOTH modes.
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
  // "Remind me" link template (Settings → Reminder link). A URL with
  // placeholders — {minutes} {title} {iso} {time} {date} — that an upcoming
  // game's detail sheet opens on tap (see lib/reminderLink.ts). Undefined/blank
  // = no button anywhere. Personal by design: it only does something on a
  // device with the target app (Raycast, Shortcuts, …). Syncs with the rest of
  // the blob.
  reminderLinkTemplate?: string;
  // News headlines are spoilers (a highlight's title gives away the result), so
  // every headline in the news view + modal is blurred by default. The "Titles"
  // eye toggle in the news header flips this on to reveal them all at once.
  // Undefined/false = blurred (default); true = revealed.
  revealNewsTitles?: boolean;
  // Text posts (headline-only news items — no pic/video) are independently
  // hidden by default. Undefined/false = hidden; true = shown. Headline reveal
  // never changes this filter, so both toolbar controls remain predictable.
  showTextPosts?: boolean;
  // News image/video previews can spoil a result (a thumbnail or embedded clip
  // gives the game away), so every preview surface is blurred by default, while
  // leaving source/league icons alone. The "Media" eye toggle in the news header
  // flips this on to reveal them all at once. Undefined/false = blurred
  // (default); true = revealed. (Jacob 7/16 — blur on by default; the pre-paint
  // guard in layout.tsx applies it before hydration to avoid a spoiler flash.)
  revealNewsMedia?: boolean;
  // News layout: false/undefined = the default multi-column "Cards" board (click
  // a post → lightbox); true = a single vertical "Feed" (Reddit-style scroll with
  // inline images + blurred top comments). Toggled by the Cards/Feed pill in the
  // news header.
  newsFeedView?: boolean;
  // News "Videos" quick filter: true = show only video posts/highlights. In Cards
  // it narrows to the video sources; in Feed it filters to posts that carry a
  // video. Toggled by the 🎥 Videos pill in the news header. Overrides the funnel
  // type filter while on.
  newsVideosOnly?: boolean;
  // Read a source bottom-to-top: true reverses every news list so the OLDEST
  // item in the feed sits first (Jacob 8/9). Deliberately a reversal of the
  // rendered order, not a re-sort on `published` — plenty of Reddit/prebaked
  // items carry no timestamp, and a sort would scatter those to one end while
  // the feed's own ordering (which is what the eye is following) is exactly
  // what "start from the bottom" means. Lives next to the funnel in the news
  // header rather than in Settings, since it's a per-session reading choice.
  newsOldestFirst?: boolean;
  // Hide upsetting news items — deaths, fatal crashes, assault/abuse cases,
  // on-field injuries (hit in the head, collisions, carted off), serious
  // illness, harm to animals, self-harm (Jacob 8/21). Matching lives in
  // lib/sensitiveNews.ts and reads headline + description only. Opt-in:
  // undefined/false = show everything (unchanged default); true = filter, with a
  // "N hidden — Show" line in the news view so a false positive is one tap from
  // being visible again. Roster injury news (IL moves, return timelines) is
  // deliberately NOT matched — only the moment of getting hurt.
  hideSensitiveNews?: boolean;
  // Separate opt-in for racing wrecks and hard falls (Jacob 8/21: "fights fine
  // if nothing terrible, crashes can have option to hide"). Independent of
  // hideSensitiveNews — either toggle works on its own — because a crash
  // everyone walks away from is the sport, while a fatal one is already covered
  // by the death/injury categories of the main toggle.
  hideCrashNews?: boolean;
}

const defaults: Preferences = {
  favoriteLeagues: [],
  favoriteTeams: [],
  theme: "system",
  showRatings: false,
  skipExplainer: false,
  skipNewsExplainer: false,
  showNews: false,
  // Yesterday, not "smart" (2026-08-09, Jacob). A brand-new visitor — most of
  // them arriving from the no-spoiler-scores landing pages — is here to catch
  // up on games that are already OVER. "smart" flipped them to Today after
  // 1 PM local, which on a weekday afternoon is a board of games that have not
  // started: no highlights, nothing to reveal, and a first impression of an
  // empty product. Yesterday always has a full, finished slate.
  // Existing users are unaffected — a saved defaultDateMode always wins, and
  // Settings → "Automatic" restores the old behaviour.
  defaultDateMode: "yesterday",
  defaultLandingView: "remember",
  defaultRatings: "auto",
  // YouTube's own player controls by default (2026-08-09) — see the field doc.
  youtubeNativeControls: true,
  // Text posts ON by default (2026-08-09, Jacob). The news board is Reddit-first
  // (see newsTypeFilter below) and most of what a subreddit produces IS a text
  // post — hiding them by default emptied out whole columns for a brand-new
  // user with no hint that a toolbar chip was responsible. Headlines stay
  // blurred either way, so showing them leaks nothing. There is a matching
  // pre-paint script in layout.tsx (the CSS hides them until <html> gets
  // .show-text-posts) — change both together.
  showTextPosts: true,
  newsColCount: 3,
  smartCutoffHour: 13,
  switcherDefaultsVersion: 2,
  // Reddit-only by default (2026-08-03, ahead of the Product Hunt launch).
  // Reddit is where the game-worth-watching discussion actually lives, and it
  // is the feed a first-time visitor should land on; ESPN/homepage/top-videos
  // are still one tap away in the source filter, and the "Clear filter" link
  // is visible by default now precisely because the filter is no longer "all".
  // Existing users are unaffected — a saved newsTypeFilter always wins.
  newsTypeFilter: "reddit",
};

export function loadPreferences(): Preferences {
  if (typeof window === "undefined") return defaults;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const stored = raw ? JSON.parse(raw) : null;
    const prefs = stored ? { ...defaults, ...stored } : { ...defaults };
    // Do not let the v2 value from defaults disguise a legacy stored blob.
    // HomeContent needs this missing marker to preserve every old checkmark
    // before the first post-deploy save overwrites the blob.
    if (stored && !Object.prototype.hasOwnProperty.call(stored, "switcherDefaultsVersion")) {
      delete prefs.switcherDefaultsVersion;
    }
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
