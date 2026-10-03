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
//
// The footer's ♥ Rate link (9/29) reads the same state. Neither store tells
// the app whether a user rated (requestReview() resolves void, and there is no
// per-user review lookup), so a tap on the link stands in for "rated": one tap
// hides it for good and stops the in-app sheet too. A link shown for 30 days
// with no tap rests for 180 days, then shows again for 30. Settings' "Rate
// this app" stays as the always-there manual path.

import { useEffect, useSyncExternalStore } from "react";
import { detectAppStore } from "./useAppStore.ts";

const STORAGE_KEY = "nss-rate-prompt";
const SESSION_GAP_MS = 30 * 60 * 1000; // 30 minutes: what counts as a new session
const REASK_MS = 120 * 24 * 60 * 60 * 1000; // 120 days between local asks
const SESSION_TRIGGER_COUNT = 3; // ask on the 3rd distinct session at the latest
const DAY_MS = 24 * 60 * 60 * 1000;
const LINK_AFTER_ASK_MS = 7 * DAY_MS; // no footer link within a week of the OS sheet
const LINK_SHOW_MS = 30 * DAY_MS; // a footer-link window lasts 30 days...
const LINK_REST_MS = 180 * DAY_MS; // ...then, if never tapped, it rests 180 days

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
  // When the footer's ♥ Rate link was tapped (null = never). Set = hidden for
  // good, and the in-app sheet stops too.
  ratedTapMs: number | null;
  // Start of the current 30-day footer-link window (null = never shown).
  linkShownMs: number | null;
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
        ratedTapMs: typeof parsed.ratedTapMs === "number" ? parsed.ratedTapMs : null,
        linkShownMs: typeof parsed.linkShownMs === "number" ? parsed.linkShownMs : null,
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
  // RatePromptBeacon's noteAppOpen() runs after the board has read the link's
  // state (parent effects run last), so every write tells the link to re-read.
  for (const cb of listeners) cb();
}

// Any nss-* key other than ours means the app has been used on this device
// before. RatePromptBeacon runs ahead of the board's own effects in the root
// layout, so a first open has not written any prefs yet at this point.
function hasOtherPrefs(): boolean {
  try {
    const ls = window.localStorage;
    for (let i = 0; i < ls.length; i++) {
      const k = ls.key(i);
      if (k && k !== STORAGE_KEY && k.startsWith("nss-")) return true;
    }
  } catch {
    /* blocked storage — treat as a fresh install */
  }
  return false;
}

function isNativePlatform(): boolean {
  if (typeof window === "undefined") return false;
  type CapacitorGlobal = { Capacitor?: { isNativePlatform?: () => boolean } };
  const cap = (window as unknown as CapacitorGlobal).Capacitor;
  return !!cap?.isNativePlatform?.();
}

// True once 120 days have passed since the last ask (or we've never asked),
// and never once the footer's ♥ Rate link was tapped: they went to the store.
function canAskAgain(state: RatePromptState, now: number): boolean {
  if (state.ratedTapMs !== null) return false;
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
// 120-day window. Never fires on the very first open, even when seeded at 2.
export function noteAppOpen(): void {
  if (!isNativePlatform()) return;
  const now = Date.now();
  const existing = readState();

  if (!existing) {
    // No rating state yet: just start tracking. Never prompts here. A user who
    // had the app before this code shipped (pre-1.0.6) already has other nss-*
    // prefs, so they start at session 2 — the next distinct session, or one
    // finished highlight, can prompt. A true first open stays at 1 (9/29).
    const sessionCount = hasOtherPrefs() ? 2 : 1;
    writeState({ firstOpenMs: now, lastSessionMs: now, sessionCount, lastAskedMs: null, ratedTapMs: null, linkShownMs: null });
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

// ── Footer ♥ Rate link ──────────────────────────────────────────────────────

const listeners = new Set<() => void>();

export function subscribeRateLink(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

// A window is open while it is under 30 days old. Once it is 30 + 180 days
// old, a new one may open (noteRateLinkShown restarts it).
function linkWindowOpen(linkShownMs: number | null, now: number): boolean {
  if (linkShownMs === null) return true;
  const age = now - linkShownMs;
  return age < LINK_SHOW_MS || age >= LINK_SHOW_MS + LINK_REST_MS;
}

// Native shells only, from the 2nd session on, never after a tap, not within
// 7 days of the OS review sheet, and only inside a 30-day window.
export function shouldShowRateLink(now: number = Date.now()): boolean {
  if (!detectAppStore()) return false;
  const state = readState();
  if (!state) return false;
  if (state.sessionCount < 2) return false;
  if (state.ratedTapMs !== null) return false;
  if (state.lastAskedMs !== null && now - state.lastAskedMs < LINK_AFTER_ASK_MS) return false;
  return linkWindowOpen(state.linkShownMs, now);
}

// Called once the link is on screen: starts the 30-day window the first time,
// and again when a rest has run out.
export function noteRateLinkShown(now: number = Date.now()): void {
  const state = readState();
  if (!state) return;
  if (state.linkShownMs !== null && now - state.linkShownMs < LINK_SHOW_MS + LINK_REST_MS) return;
  writeState({ ...state, linkShownMs: now });
}

// The ♥ Rate link was tapped: hide it for good and stop the in-app sheet.
export function noteRateTapped(): void {
  const state = readState();
  if (!state) return;
  writeState({ ...state, ratedTapMs: Date.now() });
}

export function useRateLinkVisible(): boolean {
  const visible = useSyncExternalStore(subscribeRateLink, () => shouldShowRateLink(), () => false);
  useEffect(() => {
    if (visible) noteRateLinkShown();
  }, [visible]);
  return visible;
}
