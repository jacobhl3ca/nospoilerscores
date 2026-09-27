// "TV channel links" — a personal list, off by default (Settings → More
// settings). One line per network: `ESPN = http://…`. A network chip whose name
// is on the list opens that link in the device's own player instead of the
// network's website. Built for a home IPTV tuner (Dispatcharr, an HDHomeRun):
// its per-channel stream URLs play in IINA on a Mac and VLC on an iPhone.
//
// Why not UHF: its uhf:// links only launch the app — tested on the Mac (9/9,
// 9/20) and on Jacob's iPhone (9/24, "just opened app"). None tuned a channel.
//
// Pure + import-free so `node --experimental-strip-types` can test it.

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

// Module state, set from the prefs on every load/save (like the time zone), so
// every chip reads the same list without threading props through the board.
let links = new Map<string, string>();
let chosen: TvPlayer = "auto";

export function setTvChannelLinks(text: string | undefined, player: TvPlayer | undefined): void {
  links = parseChannelLinks(text);
  chosen = player ?? "auto";
}

/** The player link for a network chip, or null to keep the network's site. */
export function tvChannelLink(network: string): string | null {
  const url = links.get(normNetwork(network));
  if (!url) return null;
  const nav = typeof navigator !== "undefined" ? navigator : null;
  return playerUrl(url, resolvePlayer(chosen, nav?.userAgent ?? "", nav?.maxTouchPoints ?? 0));
}
