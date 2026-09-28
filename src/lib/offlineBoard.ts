// Last board on the device, for opening the app with no connection.
//
// NoSpoilerZ keeps its header and tabs when offline; HideScore showed "Failed
// to load games" (Jacob 9/27, note 7DC87928; the train, 3FAAD6CE). Each good
// board pull now keeps a copy in localStorage. With no connection the board
// paints that copy under an "Offline · updated 6:10 PM" line instead of the
// error. Device storage only: no server call, no extra Vercel/Worker request.
//
// Everything here is pure (storage is passed in) so
// tests/offline-board.test.ts can cover it; HomeContent.tsx supplies
// localStorage, the clock and navigator.onLine.

import type { LeagueData } from "./types";

export const OFFLINE_BOARD_KEY = "hs-offline-board-v1";
/** Board days kept (today, yesterday, tomorrow is the usual set). */
export const OFFLINE_BOARD_MAX_DAYS = 3;
/** The 10 s live poll must not rewrite a big JSON blob every tick. */
export const OFFLINE_SAVE_GAP_MS = 30 * 1000;
/** A copy bigger than this is skipped rather than risk the storage quota. */
export const OFFLINE_MAX_CHARS = 1_500_000;

export interface BoardSnapshot {
  date: string; // YYYYMMDD, the board day
  savedAt: number; // ms epoch of the network pull
  leagues: LeagueData[];
}

type Store = Record<string, BoardSnapshot>;
type KV = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function readStore(storage: KV): Store {
  try {
    const raw = storage.getItem(OFFLINE_BOARD_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: Store = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      const s = v as Partial<BoardSnapshot> | null;
      if (s && typeof s.savedAt === "number" && Array.isArray(s.leagues) && s.date === k) out[k] = s as BoardSnapshot;
    }
    return out;
  } catch {
    return {};
  }
}

/**
 * Keep a copy of a fresh network board. Returns true when it wrote. Skips an
 * empty board (a copy of nothing would replace a useful one), a write inside
 * the gap for the same day, and anything over the size cap.
 */
export function saveBoardSnapshot(storage: KV, date: string, leagues: LeagueData[], now: number): boolean {
  if (!date || leagues.length === 0) return false;
  if (leagues.every((l) => l.fetchFailed)) return false;
  const store = readStore(storage);
  const prev = store[date];
  if (prev && now >= prev.savedAt && now - prev.savedAt < OFFLINE_SAVE_GAP_MS) return false;
  store[date] = { date, savedAt: now, leagues };
  const keep = Object.values(store)
    .sort((a, b) => b.savedAt - a.savedAt)
    .slice(0, OFFLINE_BOARD_MAX_DAYS);
  const next: Store = {};
  for (const s of keep) next[s.date] = s;
  try {
    const json = JSON.stringify(next);
    if (json.length > OFFLINE_MAX_CHARS) return false;
    storage.setItem(OFFLINE_BOARD_KEY, json);
    return true;
  } catch {
    // Quota or private mode. The copy is a nice-to-have; never break the board.
    return false;
  }
}

/** The copy for this day, or null. */
export function loadBoardSnapshot(storage: KV, date: string): BoardSnapshot | null {
  return readStore(storage)[date] ?? null;
}

/** The newest copy of any day, or null. */
export function latestBoardSnapshot(storage: KV): BoardSnapshot | null {
  const all = Object.values(readStore(storage));
  if (all.length === 0) return null;
  return all.reduce((a, b) => (b.savedAt > a.savedAt ? b : a));
}

/**
 * True when a finished pull means "no connection" rather than a real board:
 * the browser says offline, or every column's fetch failed.
 */
export function pullLooksOffline(online: boolean, leagues: LeagueData[]): boolean {
  if (!online) return true;
  return leagues.length > 0 && leagues.every((l) => l.fetchFailed);
}

/** "6:10 PM" the same day, "Sep 26, 6:10 PM" on another. */
export function formatOfflineUpdated(savedAt: number, now: number, timeZone?: string): string {
  const opts: Intl.DateTimeFormatOptions = { timeZone };
  const day = (t: number) => new Date(t).toLocaleDateString("en-US", { ...opts, year: "numeric", month: "numeric", day: "numeric" });
  const time = new Date(savedAt).toLocaleTimeString("en-US", { ...opts, hour: "numeric", minute: "2-digit" });
  if (day(savedAt) === day(now)) return time;
  const date = new Date(savedAt).toLocaleDateString("en-US", { ...opts, month: "short", day: "numeric" });
  return `${date}, ${time}`;
}
