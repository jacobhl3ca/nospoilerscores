// Short network names, shared by the game cards and the Schedule view rows.
// Lifted out of GameCard (10/13) so lib/scheduleDay.ts can use it. Pure, no
// imports: `node --test` loads it directly.

// Compact network label for the inline status-bar chip (Jacob 6/10): the rating
// badge centers on the card, so the network sits small and short beside it.
// "MLB.TV" → "MLB", "MLB Network" → "MLB", "Prime Video" → "Prime", "Apple TV+"
// → "Apple TV". Codes already short (FOX/FS1/ESPN/TBS/ABC/TNT) pass through. The
// full name stays in the link title/aria, so nothing is lost.
// Explicit shortenings the generic suffix-stripping below can't derive — a long
// network name wraps to a second line and grows the card (Jacob 6/23: "ESPN
// Unlmtd" sat on its own line — "just call it ESPN"). The full name still shows
// in the "+N" expanded list and the "Watch on …" tooltips.
export const NETWORK_SHORT: Record<string, string> = {
  "ESPN Unlmtd": "ESPN",
  "ESPN Unlimited": "ESPN",
  // Identity, not a shortening — an EXEMPTION from the trailing-"+" strip
  // below, which exists for "Apple TV+" → "Apple TV" and was silently
  // collapsing "ESPN+" to "ESPN" too. Those are different products: ESPN is on
  // the TV, ESPN+ is a separate subscription in another app, and the chip is
  // the only place most people read it. ESPN's feed still returns it — every
  // one of the 240 US Open qualifying matches on 2026-08-24..28 came through
  // as "ESPN+" (the main draw is ESPN / ESPN2 / ABC / ESPN Unlmtd, no plus).
  "ESPN+": "ESPN+",
  // Same exemption: the CFL's free stream. Stripped, the chip read "CFL" —
  // the league's own name, sitting next to the league label.
  "CFL+": "CFL+",
  "Marquee Sports Net": "Marquee",
  "Space City Home Network": "Space City",
};
export function shortNetwork(name: string): string {
  if (NETWORK_SHORT[name]) return NETWORK_SHORT[name];
  // "NBC Sports Bay Area" / "NBC Sports California" / "NBC Sports Phil" → "NBCS …"
  const nbcs = name.match(/^NBC Sports (.+)$/i);
  if (nbcs) return `NBCS ${nbcs[1]}`;
  return name
    .replace(/\.tv$/i, "")
    .replace(/\s*Sports Network$/i, "")
    .replace(/\s*Network$/i, "")
    .replace(/\s*Video$/i, "")
    .replace(/\+$/, "")
    .trim() || name;
}
