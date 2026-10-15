// Sentry events that are a crawler's fault, not HideScore's. Each rule is as
// narrow as the evidence: one error shape AND a crawler user agent. The same
// error from a person's browser still reports.
//
// GitHub #390: "Cannot read properties of null (reading 'removeChild')" on
// /teams/nhl/toronto-maple-leafs, browser SEBot. Mapped with a local build of
// the event's release, every frame is React's commitDeletionEffectsOnFiber,
// case HostHoistable: React removing a <title>/<meta>/<link> it rendered into
// <head> when a navigation swaps the page metadata. The node's parentNode was
// null, so something outside React had already taken it out of <head>. No
// HideScore code removes or replaces a <head> node, and a clean Chromium run
// of the same navigation does not throw. Removing one metadata node from
// <head> before the navigation gives this exact TypeError
// (tests/visual/sentry-web-errors.spec.ts). The crawler's renderer strips
// head tags; React cannot recover from that and the page is a bot's copy.

/** A crawler, headless renderer or audit tool, by user agent. */
export const CRAWLER_UA = /(?<!cu)bot\b|crawler|spider|slurp|HeadlessChrome|Lighthouse/i;

// React's removeChild on a node whose parentNode is null, in Chrome, Safari and
// Firefox wording.
const NULL_REMOVE_CHILD = /reading 'removeChild'|evaluating '[\w$.]*parentNode\.removeChild'|"removeChild"[^]*is null/;

type EventLike = {
  message?: string;
  exception?: { values?: Array<{ type?: string; value?: string }> };
};

function texts(event: EventLike): string[] {
  const out: string[] = [];
  if (event.message) out.push(event.message);
  for (const v of event.exception?.values ?? []) {
    out.push(`${v.type ?? ""}: ${v.value ?? ""}`);
  }
  return out;
}

/** True only for the #390 shape (React removeChild on null) from a crawler. */
export function isCrawlerHeadRemoval(event: EventLike, userAgent: string | undefined): boolean {
  if (!userAgent || !CRAWLER_UA.test(userAgent)) return false;
  return texts(event).some((t) => NULL_REMOVE_CHILD.test(t));
}
