// A player's bracket on this device, and how it follows a signed-in account.
//
// Each device keeps its draft, its submitted picks and a random token in
// localStorage (components/BracketPicks). The leaderboard gives a name to the
// token that took it, so a second device with its own token cannot edit that
// name. Signed in, the account holds the token and the submitted picks
// (/api/picks/account in public/_worker.js): every device adopts the account's
// token and shows the newest submitted bracket. Signed out, nothing here runs.
//
// reconcilePicks is pure so `node --experimental-strip-types` can test it.

import type { Picks } from "./bracketPicks";
// .ts extension: see the note in prefsSync.ts.
import { getAuthState } from "./prefsSync.ts";

export interface Sent { name: string; picks: Picks; at: string }
export interface Saved { name: string; draft: Picks; sent: Sent | null; posted: boolean }
export interface AccountPicks { token: string; boards: Record<string, Sent> }

export const STORE_KEY = (id: string) => `picks-${id}`;
export const SEEN_KEY = (id: string) => `picks-results-seen-${id}`;
export const DEVICE_KEY = "hidescore-picks-device";
/** Fired on window after a sync changed this device's saved picks. */
export const PICKS_SYNC_EVENT = "hs-picks-sync";

const NAME_MAX = 20; // lib/bracketPicks NAME_MAX; kept import-free for the tests
const TOKEN_RE = /^[A-Za-z0-9_-]{16,64}$/;
const BOARD_RE = /^mlb-\d{4}$/;

export const EMPTY: Saved = { name: "", draft: {}, sent: null, posted: false };

export const isPicks = (v: unknown): v is Picks =>
  !!v && typeof v === "object" && !Array.isArray(v) && Object.values(v as object).every((x) => typeof x === "string");

const isSent = (v: unknown): v is Sent => {
  const s = v as Partial<Sent> | null;
  return !!s && typeof s === "object" && typeof s.name === "string" && isPicks(s.picks) && typeof s.at === "string";
};

export function parseSaved(raw: string | null): Saved {
  if (!raw) return EMPTY;
  try {
    const v = JSON.parse(raw) as Partial<Saved>;
    return {
      name: typeof v.name === "string" ? v.name.slice(0, NAME_MAX) : "",
      draft: isPicks(v.draft) ? v.draft : {},
      sent: isSent(v.sent) ? v.sent : null,
      posted: v.posted === true,
    };
  } catch {
    return EMPTY;
  }
}

export function parseAccount(v: unknown): AccountPicks | null {
  const a = v as Partial<AccountPicks> | null;
  if (!a || typeof a !== "object" || typeof a.token !== "string" || !TOKEN_RE.test(a.token)) return null;
  const boards: Record<string, Sent> = {};
  for (const [k, e] of Object.entries(a.boards && typeof a.boards === "object" ? a.boards : {})) {
    if (BOARD_RE.test(k) && isSent(e)) boards[k] = e;
  }
  return { token: a.token, boards };
}

const newer = (a: Sent, b: Sent) => Date.parse(a.at) > Date.parse(b.at);

/**
 * Decide what this device and the account should hold.
 *
 * - The account has a token: this device uses it. A board the account holds
 *   replaces this device's copy when the account's is newer, or when this
 *   device is only now adopting the token (its own entries belong to a token
 *   it is giving up). A board this device submitted more recently, under the
 *   same token, goes up to the account.
 * - The account has none: this device's token and submitted boards go up.
 *   A device that never submitted has nothing to send.
 *
 * Returns only what changed: `local` holds the boards to rewrite here, `push`
 * the record to PUT (null = nothing to send).
 */
export function reconcilePicks(
  account: AccountPicks | null,
  localToken: string | null,
  local: Record<string, Saved>,
): { token: string | null; local: Record<string, Saved>; push: AccountPicks | null } {
  const posted = Object.entries(local).filter(([, s]) => s.posted && s.sent) as [string, Saved & { sent: Sent }][];
  if (!account) {
    if (!localToken || !posted.length) return { token: localToken, local: {}, push: null };
    return { token: localToken, local: {}, push: { token: localToken, boards: Object.fromEntries(posted.map(([k, s]) => [k, s.sent])) } };
  }
  const adopting = localToken !== account.token;
  const outLocal: Record<string, Saved> = {};
  for (const [board, a] of Object.entries(account.boards)) {
    const l = local[board];
    const same = !!l?.posted && !!l.sent && l.sent.at === a.at && l.sent.name === a.name;
    if (same) continue;
    if (adopting || !l?.posted || !l.sent || newer(a, l.sent)) {
      outLocal[board] = { name: a.name, draft: a.picks, sent: a, posted: true };
    }
  }
  const up: Record<string, Sent> = {};
  if (!adopting) {
    for (const [board, s] of posted) {
      const a = account.boards[board];
      if (!a || newer(s.sent, a)) up[board] = s.sent;
    }
  }
  return {
    token: account.token,
    local: outLocal,
    push: Object.keys(up).length ? { token: account.token, boards: up } : null,
  };
}

// ── Browser glue ─────────────────────────────────────────────────────────────

function readLocal(): { token: string | null; boards: Record<string, Saved> } {
  const ls = window.localStorage;
  const tok = ls.getItem(DEVICE_KEY);
  const boards: Record<string, Saved> = {};
  for (let i = 0; i < ls.length; i++) {
    const k = ls.key(i);
    const m = k && /^picks-(mlb-\d{4})$/.exec(k);
    if (m) boards[m[1]] = parseSaved(ls.getItem(k!));
  }
  return { token: tok && TOKEN_RE.test(tok) ? tok : null, boards };
}

async function putAccount(body: AccountPicks): Promise<Response | null> {
  try {
    return await fetch("/api/picks/account", {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    return null;
  }
}

async function runSync(): Promise<void> {
  const auth = await getAuthState();
  if (!auth.signedIn) return;
  const r = await fetch("/api/picks/account", { credentials: "include" });
  if (!r.ok) return;
  let account = parseAccount(((await r.json()) as { picks?: unknown }).picks);
  // Two passes at most: a 409 means another device set the token first, so
  // adopt what the server sent back and settle on that.
  for (let pass = 0; pass < 2; pass++) {
    const here = readLocal();
    const out = reconcilePicks(account, here.token, here.boards);
    try {
      if (out.token && out.token !== here.token) window.localStorage.setItem(DEVICE_KEY, out.token);
      for (const [board, s] of Object.entries(out.local)) window.localStorage.setItem(STORE_KEY(board), JSON.stringify(s));
    } catch { return; }
    if (Object.keys(out.local).length) window.dispatchEvent(new Event(PICKS_SYNC_EVENT));
    if (!out.push) return;
    const p = await putAccount(out.push);
    if (!p || p.status !== 409) return;
    account = parseAccount(((await p.json()) as { picks?: unknown }).picks);
    if (!account) return;
  }
}

let running: Promise<void> | null = null;
let rerun = false;

/** Match this device's bracket with the signed-in account. Safe to call often:
 *  a call made during a run queues ONE more run (so a submit that lands mid-run
 *  still goes up), and it is a no-op when signed out. */
export function syncPicksWithAccount(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (running) { rerun = true; return running; }
  running = (async () => {
    do { rerun = false; await runSync().catch(() => {}); } while (rerun);
  })().finally(() => { running = null; });
  return running;
}
