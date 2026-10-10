import { isDemoModeActive } from "./demoMode.ts";

// One way to send a custom Umami event (2026-10-01). Fire-and-forget: it
// returns at once, never throws, and never blocks a tap. Call it from a user
// action only, never during render, on scroll, or in a loop or poll.
//
// - The tracker script loads with defer, so on a fast first paint
//   window.umami can be missing for a few seconds. Retry for ~5 s instead of
//   losing the event.
// - Nothing goes out for ?demo=1 screenshot sessions or when the "Don't count
//   my visits" toggle (localStorage umami.disabled) is on. The real tracker
//   checks umami.disabled too; checking here as well keeps a stubbed or
//   future tracker honest.
// - Event names are fixed strings. Variable parts go in `data`, each value cut
//   to 40 chars (maxLen), so Umami's event list never grows a name per team
//   or league. Only the first-run picker's league list asks for more (100).
// - Never put a user id, email, name, post text or a setting VALUE in `data`.

type Tracker = { track: (event: string, data?: Record<string, string>) => void };

function tracker(): Tracker | undefined {
  return (window as unknown as { umami?: Tracker }).umami;
}

function trackingOff(): boolean {
  try {
    if (window.localStorage.getItem("umami.disabled") === "1") return true;
  } catch { /* storage blocked: fall through to the demo check */ }
  return isDemoModeActive();
}

function send(name: string, data: Record<string, string> | undefined, tries: number): void {
  try {
    const t = tracker();
    if (t) { t.track(name, data); return; }
    if (tries > 0) setTimeout(() => send(name, data, tries - 1), 250);
  } catch { /* a blocked or broken tracker must never break the page */ }
}

export function trackEvent(name: string, data?: Record<string, string>, maxLen = 40): void {
  try {
    if (typeof window === "undefined" || trackingOff()) return;
    let clean: Record<string, string> | undefined;
    if (data) {
      clean = {};
      for (const [k, v] of Object.entries(data)) clean[k] = String(v ?? "").slice(0, maxLen);
    }
    send(name, clean, 20);
  } catch { /* analytics must never break the app */ }
}
