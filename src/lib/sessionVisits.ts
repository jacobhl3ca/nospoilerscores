// Visit counting, and the one thing it exists for: turning the favorite-stars
// off by themselves on a user's third visit (Jacob 8/31).
//
// The ★ next to a team name teaches a brand-new user which cards are theirs.
// By the third visit that lesson has landed and it is just noise, so the app
// drops it without being asked. An automatic change to someone's UI is only
// acceptable with guard rails, so: it fires once, only on a genuinely new
// session, and never against a choice the user made themselves.
//
// Deliberately its own module with NO imports — preferences.ts pulls in the
// league/type graph, which the unit runner's TypeScript stripping cannot
// resolve, and this logic is exactly the part worth testing.

// Which visit turns the stars off, and what counts as a separate visit.
// 30 minutes is the ordinary analytics session gap — long enough that a reload,
// a tab revisit, or a trip to the news view and back is still the same sitting.
export const STARS_AUTO_HIDE_SESSION = 3;
export const SESSION_GAP_MS = 30 * 60 * 1000;

// Only the fields this cares about, so it stays testable without a Preferences
// blob and stays structurally compatible with one.
export type VisitState = {
  sessionCount?: number;
  lastSessionAt?: number;
  hideTeamStars?: boolean;
};

// What launch should write for the visit counter, given the stored prefs and
// the current clock. Returns {} once counting is done — nothing to write, and
// nothing to sync. That matters: without the stop, this pair would change on
// every single visit and turn a once-a-day prefs sync into a once-a-visit one,
// forever, for a number nothing reads any more.
export function sessionLaunchPatch(prefs: VisitState, nowMs: number): VisitState {
  const seen = prefs.sessionCount ?? 0;
  if (seen >= STARS_AUTO_HIDE_SESSION) return {};
  const newSession = !prefs.lastSessionAt || nowMs - prefs.lastSessionAt > SESSION_GAP_MS;
  const count = seen + (newSession ? 1 : 0);
  const patch: VisitState = { sessionCount: count, lastSessionAt: nowMs };
  // Only on a genuinely new session, only on the Nth, and only when
  // hideTeamStars is still undefined — i.e. the user has never touched the
  // toggle. An explicit choice either way is never overridden, and because
  // counting stops here, turning stars back on afterwards sticks for good.
  if (newSession && count >= STARS_AUTO_HIDE_SESSION && prefs.hideTeamStars === undefined) {
    patch.hideTeamStars = true;
  }
  return patch;
}
