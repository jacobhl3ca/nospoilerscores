// In-app "rate this app" prompt: Apple's SKStoreReviewController / Google
// Play's in-app review sheet, asked directly through
// @capacitor-community/in-app-review — never a custom "enjoying the app?"
// pre-dialog. Apple rejects a pre-prompt that gates the real sheet, and both
// platforms already run their own frequency caps underneath ours.
//
// Native shells only. The web has no store to review on, and
// Capacitor.isNativePlatform() is false there.
//
// Trigger (whichever comes first, never on the first open):
//   - the 3rd distinct app session, where a session is an app open at least
//     30 minutes after the previous one, or
//   - right after the user finishes watching a highlight in the in-app
//     player (VideoModal), starting from the 2nd session onward.
// At most once every 120 days locally — the OS caps it further (Apple limits
// SKStoreReviewController to ~3 prompts per 365 days app-wide; Play applies
// its own undisclosed quota).
//
// State lives in localStorage under the app's existing nss-* key style.

const STORAGE_KEY = "nss-rate-prompt";
const SESSION_GAP_MS = 30 * 60 * 1000; // 30 minutes: what counts as a new session
const REASK_MS = 120 * 24 * 60 * 60 * 1000; // 120 days between local asks
const SESSION_TRIGGER_COUNT = 3; // ask on the 3rd distinct session at the latest

interface RatePromptState {
  // First time the app was ever opened. Kept for reference/debugging; not
  // currently part of the eligibility check (the session count already
  // encodes "how much use").
  firstOpenMs: number;
  // The most recent session's start time, used to decide whether *this* open
  // is a new distinct session or a continuation of the last one.
  lastSessionMs: number;
  // How many distinct sessions have been recorded, including this one.
  sessionCount: number;
  // When we last actually asked for a review (null = never).
  lastAskedMs: number | null;
}

function readState(): RatePromptState | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      typeof parsed?.firstOpenMs === "number" &&
      typeof parsed?.lastSessionMs === "number" &&
      typeof parsed?.sessionCount === "number"
    ) {
      return {
        firstOpenMs: parsed.firstOpenMs,
        lastSessionMs: parsed.lastSessionMs,
        sessionCount: parsed.sessionCount,
        lastAskedMs: typeof parsed.lastAskedMs === "number" ? parsed.lastAskedMs : null,
      };
    }
  } catch {
    /* corrupt/blocked storage — treat as no state */
  }
  return null;
}

function writeState(state: RatePromptState): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* storage unavailable — the prompt simply won't fire this run */
  }
}

function isNativePlatform(): boolean {
  if (typeof window === "undefined") return false;
  type CapacitorGlobal = { Capacitor?: { isNativePlatform?: () => boolean } };
  const cap = (window as unknown as CapacitorGlobal).Capacitor;
  return !!cap?.isNativePlatform?.();
}

// True once 120 days have passed since the last ask (or we've never asked).
function canAskAgain(state: RatePromptState, now: number): boolean {
  return state.lastAskedMs === null || now - state.lastAskedMs >= REASK_MS;
}

// One request per app load, regardless of how many times a caller checks —
// requestReview() itself is fire-and-forget with no result to gate on, so
// this is what stops the highlight-finished path and the session path from
// both firing in the same run.
let askedThisLoad = false;

// The native shell loads hidescore.com live, so this code also reaches app
// builds that predate the plugin (iOS 1.0.5, Android versionCode 8). There
// the call can only fail, and advancing lastAskedMs would lock the user out
// of the prompt for 120 days after they update. Skip without touching state.
function reviewPluginAvailable(): boolean {
  if (typeof window === "undefined") return false;
  type CapacitorGlobal = { Capacitor?: { isPluginAvailable?: (name: string) => boolean } };
  return !!(window as unknown as CapacitorGlobal).Capacitor?.isPluginAvailable?.("InAppReview");
}

async function fireReview(state: RatePromptState, now: number): Promise<void> {
  if (askedThisLoad) return;
  if (!reviewPluginAvailable()) return;
  askedThisLoad = true;
  writeState({ ...state, lastAskedMs: now });
  try {
    const { InAppReview } = await import("@capacitor-community/in-app-review");
    await InAppReview.requestReview();
  } catch {
    // No Play Store / TestFlight review quota / plugin unavailable — fine,
    // lastAskedMs still advances so we don't hammer it every launch.
  }
}

// Call once per app load (native only). Records this as a new distinct
// session when the gap since the last one is at least 30 minutes, then asks
// for a review if this is the 3rd+ distinct session and we're outside the
// 120-day window. Never fires on the very first open (sessionCount stays 1).
export function noteAppOpen(): void {
  if (!isNativePlatform()) return;
  const now = Date.now();
  const existing = readState();

  if (!existing) {
    // First open ever: just start tracking. Never prompts here.
    writeState({ firstOpenMs: now, lastSessionMs: now, sessionCount: 1, lastAskedMs: null });
    return;
  }

  const isNewSession = now - existing.lastSessionMs >= SESSION_GAP_MS;
  const state: RatePromptState = isNewSession
    ? { ...existing, lastSessionMs: now, sessionCount: existing.sessionCount + 1 }
    : existing;
  if (isNewSession) writeState(state);

  if (state.sessionCount >= SESSION_TRIGGER_COUNT && canAskAgain(state, now)) {
    void fireReview(state, now);
  }
}

// Call right after a highlight finishes playing in VideoModal (YouTube ENDED
// or the native <video> element's `ended` event). Only eligible from the 2nd
// session onward, so a highlight watched during the very first open never
// prompts.
export function noteHighlightWatched(): void {
  if (!isNativePlatform()) return;
  const now = Date.now();
  const state = readState();
  if (!state || state.sessionCount < 2) return;
  if (!canAskAgain(state, now)) return;
  void fireReview(state, now);
}
