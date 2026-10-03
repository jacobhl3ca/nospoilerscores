// Pure helpers for persistVideos in prebake-news.mjs, split out so the
// merge and the order can be unit-tested without running the bake.

// Merge today's carried-forward items with a fresh scrape. Fresh items
// overwrite (so headline/description/imageUrl edits propagate) while the
// earliest firstSeenAt we've ever recorded for that id is kept.
export function mergeVideos(carry, fresh, nowMs) {
  const byId = new Map();
  for (const item of carry) {
    byId.set(item.id, { ...item, firstSeenAt: item.firstSeenAt || nowMs });
  }
  for (const item of fresh) {
    const prior = byId.get(item.id);
    byId.set(item.id, { ...item, firstSeenAt: prior?.firstSeenAt || item.firstSeenAt || nowMs });
  }
  return byId;
}

// ESPN clip ids grow with recency, so they break firstSeenAt ties (several
// items share one firstSeenAt per bake). Non-numeric ids tie at 0.
const idNum = (i) => (/^\d+$/.test(i.id) ? Number(i.id) : 0);

// Order: newest video first, ICYMI second, the rest newest-first. Capped at 10.
export function orderVideos(all, pinnedId) {
  const pinned = pinnedId ? all.filter((i) => i.id === pinnedId) : [];
  const rest = all
    .filter((i) => i.id !== pinnedId)
    .sort((a, b) => ((b.firstSeenAt || 0) - (a.firstSeenAt || 0)) || (idNum(b) - idNum(a)));
  const ordered = rest.length > 0 ? [rest[0], ...pinned, ...rest.slice(1)] : pinned;
  return ordered.slice(0, 10);
}
