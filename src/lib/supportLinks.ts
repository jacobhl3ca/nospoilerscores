// "Support HideScore" footer line (built 10/8, date-gated). It renders nothing
// before SUPPORT_LIVE_FROM (ET): Jacob's no-income hold runs to Sun Dec 13 2026,
// so Dec 15 is a flip, not a build. Web only: the Capacitor iOS/Android builds
// never show it (App Store 3.1.1 treats in-app tip links as IAP).
// The check runs in the browser at view time (SupportLine), not at build time,
// so the line appears on Dec 15 without a deploy.

export const SUPPORT_LIVE_FROM = "2026-12-15";

// Fill in when Jacob creates the page. A link with an empty href is skipped.
export const PATREON_URL = "";

export type SupportLink = { id: string; label: string; href: string };

export const SUPPORT_LINKS: SupportLink[] = [
  { id: "kofi", label: "Ko-fi (one-time)", href: "https://ko-fi.com/jacobhl" },
  { id: "patreon", label: "Patreon ($3/mo)", href: PATREON_URL },
];

// Same native check the footer uses for the store badges (HomeContent) and
// the `tag=app` analytics hook in layout.tsx.
function isNativePlatform(): boolean {
  if (typeof window === "undefined") return false;
  type CapacitorGlobal = { Capacitor?: { isNativePlatform?: () => boolean } };
  const cap = (window as unknown as CapacitorGlobal).Capacitor;
  return !!cap?.isNativePlatform?.();
}

// YYYY-MM-DD of `now` in New York.
function etYmd(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function supportLinksVisible(now: Date = new Date(), native: boolean = isNativePlatform()): boolean {
  if (native) return false;
  return etYmd(now) >= SUPPORT_LIVE_FROM;
}

export function activeSupportLinks(links: SupportLink[] = SUPPORT_LINKS): SupportLink[] {
  return links.filter((l) => l.href !== "");
}
