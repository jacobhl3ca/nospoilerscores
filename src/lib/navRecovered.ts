// Field count for footer taps that never reached their page (2026-10-05).
//
// In the iOS app a failed page load shows the bundled "No connection" screen,
// and its Try again opens the board. The footer links are soft navigations now,
// which should end that, but the simulator never reproduced the failure, so
// this counts what is left: a board footer tap leaves a note in sessionStorage,
// every doc page removes it when it mounts, and a board that mounts with the
// note still there sends one `nav-recovered` Umami event.
// Props: `sw` = a service worker controlled the board at tap time (yes/no),
// `secs` = seconds from that board's page load to the tap.

const KEY = "hs-footer-tap";

// A modified click opens a new tab and this one stays on the board: no note.
export function noteFooterTap(e?: { metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean }) {
  if (e && (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey)) return;
  try {
    sessionStorage.setItem(KEY, JSON.stringify({
      sw: !!navigator.serviceWorker?.controller,
      secs: Math.round(performance.now() / 1000),
    }));
  } catch { /* storage off: nothing to count */ }
}

export function clearFooterTap() {
  try { sessionStorage.removeItem(KEY); } catch { /* storage off */ }
}

// The tracker script loads with defer, so retry for ~5 s like LeaguePickerModal.
function trackSoon(name: string, data: Record<string, string>, tries = 20) {
  if (window.umami) { window.umami.track(name, data); return; }
  if (tries > 0) setTimeout(() => trackSoon(name, data, tries - 1), 250);
}

export function reportNavRecovered() {
  let raw: string | null = null;
  try {
    raw = sessionStorage.getItem(KEY);
    if (raw) sessionStorage.removeItem(KEY);
  } catch { return; }
  if (!raw) return;
  try {
    const d = JSON.parse(raw) as { sw?: boolean; secs?: number };
    trackSoon("nav-recovered", { sw: d.sw ? "yes" : "no", secs: String(Number(d.secs) || 0) });
  } catch { /* a bad note: drop it */ }
}
