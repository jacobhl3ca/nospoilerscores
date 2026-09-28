// "Watch later" queue (Jacob 9/27): tap Later on a game card tonight, and the
// board opens tomorrow with that game in a Watch queue strip above the league
// columns, Highlights / Recap / Condensed buttons and all.
//
// The queue rides the prefs blob (`watchQueue`), so it persists per device and
// syncs with Apple ID the same way favorite teams do. These helpers keep it
// small and clean: at most WATCH_QUEUE_CAP entries, newest last, and anything
// older than WATCH_QUEUE_MAX_AGE_DAYS is dropped on load so a forgotten queue
// does not pile up.
//
// Pure + import-free so `node --experimental-strip-types` can test it.

export interface WatchQueueEntry {
  id: string; // the game's id
  league: string; // the game's sport key ("mlb", "epl", …)
  date: string; // the game's slate day, YYYYMMDD — the scoreboard to refetch
  addedAt: number; // epoch ms
  // "NYY @ BOS" — shown only when the game itself cannot be loaded. Team names
  // are never a spoiler.
  title?: string;
}

// Master switch. Off 9/28 (Jacob): the "+" / "Later" pill on every card reads
// as jarring, and the way to queue a game needs a new, more natural design.
// Off = no pill, no strip, no Settings row, no queue fetches. A queue already
// saved stays in prefs, untouched, for when the feature comes back.
export const WATCH_QUEUE_ENABLED = false;

export const WATCH_QUEUE_CAP = 20;
export const WATCH_QUEUE_MAX_AGE_DAYS = 3;

function ymdToDayNumber(ymd: string): number {
  return Date.UTC(+ymd.slice(0, 4), +ymd.slice(4, 6) - 1, +ymd.slice(6, 8)) / 86_400_000;
}

function isEntry(e: unknown): e is WatchQueueEntry {
  if (!e || typeof e !== "object") return false;
  const r = e as Record<string, unknown>;
  return typeof r.id === "string" && r.id !== ""
    && typeof r.league === "string" && r.league !== ""
    && typeof r.date === "string" && /^\d{8}$/.test(r.date)
    && typeof r.addedAt === "number";
}

/** Same game = same league + id (ids are only unique inside one feed). */
export function sameQueuedGame(a: { id: string; league: string }, b: { id: string; league: string }): boolean {
  return a.id === b.id && a.league === b.league;
}

export function isQueued(queue: readonly WatchQueueEntry[] | undefined, id: string, league: string): boolean {
  return !!queue?.some((e) => e.id === id && e.league === league);
}

/**
 * Drop malformed entries (the synced blob has no schema check), duplicates,
 * and any game whose slate day is more than `maxAgeDays` before `todayYmd`.
 * Keeps the newest `cap`. Returns undefined for an empty queue so the key
 * leaves the blob.
 */
export function pruneWatchQueue(
  queue: unknown,
  todayYmd: string,
  maxAgeDays = WATCH_QUEUE_MAX_AGE_DAYS,
  cap = WATCH_QUEUE_CAP,
): WatchQueueEntry[] | undefined {
  if (!Array.isArray(queue)) return undefined;
  const oldest = ymdToDayNumber(todayYmd) - maxAgeDays;
  const out: WatchQueueEntry[] = [];
  for (const e of queue) {
    if (!isEntry(e)) continue;
    if (ymdToDayNumber(e.date) < oldest) continue;
    if (out.some((x) => sameQueuedGame(x, e))) continue;
    out.push(e);
  }
  const capped = out.slice(-cap);
  return capped.length ? capped : undefined;
}

/** Add the game if absent (newest last, capped), remove it if present. */
export function toggleWatchQueue(
  queue: readonly WatchQueueEntry[] | undefined,
  entry: WatchQueueEntry,
  cap = WATCH_QUEUE_CAP,
): WatchQueueEntry[] | undefined {
  const current = queue ?? [];
  if (current.some((e) => sameQueuedGame(e, entry))) {
    const rest = current.filter((e) => !sameQueuedGame(e, entry));
    return rest.length ? rest : undefined;
  }
  return [...current, entry].slice(-cap);
}

export function removeFromWatchQueue(
  queue: readonly WatchQueueEntry[] | undefined,
  game: { id: string; league: string },
): WatchQueueEntry[] | undefined {
  const rest = (queue ?? []).filter((e) => !sameQueuedGame(e, game));
  return rest.length ? rest : undefined;
}
