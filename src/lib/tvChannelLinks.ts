// "TV channel links" — a personal list, off by default (Settings → More
// settings). One line per network: `ESPN = http://…`. A network chip whose name
// is on the list opens that link in the device's own player instead of the
// network's website. Built for a home IPTV tuner (Dispatcharr, an HDHomeRun):
// its per-channel stream URLs play in IINA on a Mac and VLC on an iPhone.
//
// Why not UHF: its uhf:// links only launch the app — tested on the Mac (9/9,
// 9/20) and on Jacob's iPhone (9/24, "just opened app"). None tuned a channel.
//
// Per-game links (9/29): a link that holds `{game}` is for a service with no
// fixed channel (Peacock). The chip fills it with net/home/away/start and the
// user's own resolver finds that game's stream. When the chip is clicked, the
// same link + `&check=1` is fetched once: a 404 there (no stream for this
// game) sends the chip to the network's website instead of an error in the
// player. A chip with no game (golf, the RedZone header) keeps the website for
// a `{game}` line.
//
// The check runs on click, never on render (10/17): a fetch to the tuner on
// page load made Firefox ask "allow this site to reach your local network?"
// on every visit.
//
// Pure, and imports only the import-free abort.ts, so
// `node --experimental-strip-types` can test it.

import { ownTimeoutSignal } from "./abort.ts";

export type TvPlayer = "auto" | "iina" | "vlc" | "raw";

// Case, spaces and punctuation don't matter ("ESPN 2" = "ESPN2", "USA Net." =
// "USA Net"), but + and & do: "ESPN+" is a different service from "ESPN".
export function normNetwork(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9+&]/g, "");
}

// Script-capable schemes never become a link — openAppScheme() assigns
// window.location, so a javascript: line would run in the page.
const BLOCKED_SCHEME = /^(javascript|data|vbscript|file|blob):/i;
const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:/i;

/**
 * Parse the Settings text. Each line is `Name[, Other name …] = link`; the
 * first `=` splits it, so query strings in the link are kept whole. Blank
 * lines and `#` comments are skipped. The first line that names a network
 * wins.
 */
export function parseChannelLinks(text: string | undefined | null): Map<string, string> {
  const map = new Map<string, string>();
  for (const raw of (text || "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 1) continue;
    const url = line.slice(eq + 1).trim();
    if (!HAS_SCHEME.test(url) || BLOCKED_SCHEME.test(url)) continue;
    for (const name of line.slice(0, eq).split(",")) {
      const key = normNetwork(name);
      if (key && !map.has(key)) map.set(key, url);
    }
  }
  return map;
}

/** "auto" → IINA on a Mac, VLC on iPhone/iPad, the link as written elsewhere. */
export function resolvePlayer(player: TvPlayer | undefined, ua: string, maxTouchPoints: number): Exclude<TvPlayer, "auto"> {
  if (player && player !== "auto") return player;
  // iPadOS Safari reports a Mac user agent; touch points tell them apart.
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && maxTouchPoints > 1)) return "vlc";
  if (/Macintosh|Mac OS X/.test(ua)) return "iina";
  return "raw";
}

/**
 * Wrap a plain http(s) stream link in the player's documented URL scheme. A
 * line that is already an app link (channels://…, vlc://…) is used as is.
 */
export function playerUrl(url: string, player: Exclude<TvPlayer, "auto">): string {
  if (player === "raw" || !/^https?:\/\//i.test(url)) return url;
  const u = encodeURIComponent(url);
  return player === "iina"
    ? `iina://weblink?url=${u}`
    : `vlc-x-callback://x-callback-url/stream?url=${u}`;
}

export const GAME_TOKEN = "{game}";

/** The game a per-game link asks for. Each team goes as every name the board
 *  knows (full, short, abbreviation): the provider writes "Red Sox" or "BOS". */
export interface GameRef {
  home: string[];
  away: string[];
  start: string; // ISO
}

interface TeamNames {
  displayName?: string;
  shortDisplayName?: string;
  abbreviation?: string;
}

export function gameRef(game: { homeTeam?: TeamNames; awayTeam?: TeamNames; date?: string }): GameRef | undefined {
  const names = (t?: TeamNames) =>
    [...new Set([t?.displayName, t?.shortDisplayName, t?.abbreviation].map((n) => (n || "").trim()).filter(Boolean))];
  const home = names(game.homeTeam);
  const away = names(game.awayTeam);
  if (!home.length || !away.length || !game.date) return undefined;
  return { home, away, start: game.date };
}

/** `{game}` → `net=…&home=…&home=…&away=…&start=…` (URL-encoded). */
export function gameQuery(network: string, game: GameRef): string {
  const q = new URLSearchParams({ net: network });
  for (const n of game.home) q.append("home", n);
  for (const n of game.away) q.append("away", n);
  q.set("start", game.start);
  return q.toString();
}

/** The link with `{game}` filled, the link as is when it has none, or null
 *  when it needs a game and this chip has none. */
export function fillGameLink(url: string, network: string, game?: GameRef): string | null {
  if (!url.includes(GAME_TOKEN)) return url;
  if (!game) return null;
  return url.split(GAME_TOKEN).join(gameQuery(network, game));
}

// Pre-check results per filled link. Only a 404 counts as "no stream": a
// check that fails to connect (Tailscale off, a browser that blocks it) keeps
// the player link, the same as a fixed channel link today.
type CheckState = "ok" | "miss" | "unknown";
const CHECK_TTL: Record<CheckState, number> = { ok: 10 * 60_000, miss: 2 * 60_000, unknown: 60_000 };
const checks = new Map<string, { state: CheckState; at: number }>();
const inflight = new Map<string, Promise<CheckState>>();
type Fetcher = (url: string) => Promise<{ status: number }>;
let checkFetch: Fetcher | null =
  typeof window !== "undefined" && typeof fetch === "function"
    ? (u) => fetch(u, { mode: "cors", cache: "no-store", credentials: "omit", signal: ownTimeoutSignal(5000) })
    : null;

/** Tests swap the network out; null turns the pre-check off. */
export function setGameCheckFetch(f: Fetcher | null): void {
  checkFetch = f;
  checks.clear();
  inflight.clear();
}

export function gameCheckState(url: string): CheckState | "pending" | undefined {
  return inflight.has(url) ? "pending" : checks.get(url)?.state;
}

// A fresh answer from an earlier click. Never starts a fetch.
function cachedCheck(url: string): CheckState | undefined {
  const hit = checks.get(url);
  return hit && Date.now() - hit.at < CHECK_TTL[hit.state] ? hit.state : undefined;
}

function runGameCheck(url: string): Promise<CheckState | undefined> {
  const hit = cachedCheck(url);
  if (hit) return Promise.resolve(hit);
  const running = inflight.get(url);
  if (running) return running;
  if (!checkFetch || !/^https?:\/\//i.test(url)) return Promise.resolve(undefined);
  const p = checkFetch(url + (url.includes("?") ? "&" : "?") + "check=1")
    .then(
      (r): CheckState => (r.status === 404 ? "miss" : r.status >= 200 && r.status < 300 ? "ok" : "unknown"),
      (): CheckState => "unknown",
    )
    .then((state) => {
      checks.set(url, { state, at: Date.now() });
      inflight.delete(url);
      return state;
    });
  inflight.set(url, p);
  return p;
}

// Module state, set from the prefs on every load/save (like the time zone), so
// every chip reads the same list without threading props through the board.
let links = new Map<string, string>();
let chosen: TvPlayer = "auto";

export function setTvChannelLinks(text: string | undefined, player: TvPlayer | undefined): void {
  links = parseChannelLinks(text);
  chosen = player ?? "auto";
}

/** The player link for a network chip, or null to keep the network's site.
 *  `game` fills a per-game (`{game}`) line; without it such a line is skipped.
 *  Safe on render: it reads an earlier click's check, never starts one. */
export function tvChannelLink(network: string, game?: GameRef): string | null {
  const raw = links.get(normNetwork(network));
  if (!raw) return null;
  const url = fillGameLink(raw, network, game);
  if (!url) return null;
  if (url !== raw && cachedCheck(url) === "miss") return null;
  return wrapForPlayer(url);
}

/** On click: the same link, after the per-game pre-check answers. A check
 *  slower than `waitMs` keeps the player link (like a failed one), so the
 *  website fallback still opens inside the click's popup window. */
export async function tvChannelLinkOnClick(network: string, game?: GameRef, waitMs = 1500): Promise<string | null> {
  const raw = links.get(normNetwork(network));
  if (!raw) return null;
  const url = fillGameLink(raw, network, game);
  if (!url) return null;
  if (url !== raw) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const state = await Promise.race([
      runGameCheck(url),
      new Promise<undefined>((r) => { timer = setTimeout(() => r(undefined), waitMs); }),
    ]);
    clearTimeout(timer);
    if (state === "miss") return null;
  }
  return wrapForPlayer(url);
}

function wrapForPlayer(url: string): string {
  const nav = typeof navigator !== "undefined" ? navigator : null;
  return playerUrl(url, resolvePlayer(chosen, nav?.userAgent ?? "", nav?.maxTouchPoints ?? 0));
}
