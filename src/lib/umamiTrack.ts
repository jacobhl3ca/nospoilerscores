// Umami custom events from client components.
//
// The tracker script loads with defer, so on a fast first paint an event can
// fire before window.umami exists. Retry for ~5 s instead of losing it. A copy
// of the first-run league picker's (#247), for the Picks tab's submit event.
// lib/track (#249) replaces both once it lands.

type Umami = { track: (event: string, data?: Record<string, string>) => void };

export function trackSoon(name: string, data?: Record<string, string>, tries = 20): void {
  if (typeof window === "undefined") return;
  const umami = (window as unknown as { umami?: Umami }).umami;
  if (umami) { umami.track(name, data); return; }
  if (tries > 0) setTimeout(() => trackSoon(name, data, tries - 1), 250);
}
