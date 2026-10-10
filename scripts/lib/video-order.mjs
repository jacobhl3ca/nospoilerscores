// Pure helpers for persistVideos in prebake-news.mjs, split out so the
// merge and the order can be unit-tested without running the bake.

// A real ESPN clip has a long numeric id (6+ digits). The homepage's
// live-stream module carries placeholder id "1" with a "Watch live:" headline,
// no still, and a clip URL that 404s, so it must never reach the card.
export function isRealEspnClip(item) {
  return /^\d{6,}$/.test(String(item?.id ?? "")) && !/^\s*watch live/i.test(item?.headline || "");
}

// Merge today's carried-forward items with a fresh scrape. Fresh items
// overwrite (so headline/description/imageUrl/clips edits propagate) while the
// earliest firstSeenAt we've ever recorded for that id is kept.
//
// A game's clip set (gameId) is one card for the whole day, but its id is its
// first clip's, which changes when ESPN adds a recap. So a fresh set replaces
// every carried item of the same game, and keeps the earliest firstSeenAt any
// of them had.
export function mergeVideos(carry, fresh, nowMs) {
  const byId = new Map();
  for (const item of carry) {
    byId.set(item.id, { ...item, firstSeenAt: item.firstSeenAt || nowMs });
  }
  for (const item of fresh) {
    let seen = byId.get(item.id)?.firstSeenAt || 0;
    if (item.gameId) {
      for (const [id, old] of byId) {
        if (old.gameId !== item.gameId || id === item.id) continue;
        if (old.firstSeenAt && (!seen || old.firstSeenAt < seen)) seen = old.firstSeenAt;
        byId.delete(id);
      }
    }
    byId.set(item.id, { ...item, firstSeenAt: seen || item.firstSeenAt || nowMs });
  }
  return byId;
}

// ESPN clip ids grow with recency, so they break firstSeenAt ties (several
// items share one firstSeenAt per bake). Non-numeric ids tie at 0.
const idNum = (i) => (/^\d+$/.test(i.id) ? Number(i.id) : 0);

// Order: newest video first, ICYMI second, the rest newest-first. Capped at
// `limit` (20; the ESPN feed caps later, after talk clips drop out). Slot 1
// is the newest BIG clip — the homepage hero scrape — so a oneFeed game set
// or module clip (feedClip) only leads when the scrape found nothing.
export function orderVideos(all, pinnedId, limit = 20) {
  const pinned = pinnedId ? all.filter((i) => i.id === pinnedId) : [];
  const rest = all
    .filter((i) => i.id !== pinnedId)
    .sort((a, b) => ((b.firstSeenAt || 0) - (a.firstSeenAt || 0)) || (idNum(b) - idNum(a)));
  const leadAt = Math.max(0, rest.findIndex((i) => !i.feedClip));
  const lead = rest.splice(leadAt, 1);
  const ordered = [...lead, ...pinned, ...rest];
  return ordered.slice(0, limit);
}
