// "Open Reddit / YouTube links through my own frontend" (Settings → More settings → Links).
// The user types the address of a Redlib instance (for reddit.com) and/or an
// Invidious or Piped instance (for youtube.com). Every outbound Reddit / YouTube
// link then goes to that host instead. HideScore never hosts or names an
// instance: the address lives only in the user's own prefs.
//
// Media and embed hosts (i.redd.it, v.redd.it, img.youtube.com, the iframe API,
// YouTube TV) are never rewritten — only pages a person opens.
//
// Pure + import-free so `node --experimental-strip-types` can test it.

export type FrontendConfig = { reddit?: string; youtube?: string };

// HideScore's own watch-URL params (nss_strict, nss_channels, nss_race, … —
// EventCard → VideoModal). They mean nothing to another frontend, so they never
// leave on a rewritten link.
const PRIVATE_PARAM = /^nss_/;

const YOUTUBE_HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com"]);
const REDDIT_HOSTS = new Set(["reddit.com", "www.reddit.com", "old.reddit.com", "new.reddit.com", "m.reddit.com"]);
const YT_ID = /^[A-Za-z0-9_-]{11}$/;

/**
 * A typed instance address → `http(s)://host[:port][/path]` with no trailing
 * slash, or null when it is not a usable address (blank, another scheme, a
 * query or hash, credentials).
 */
export function normalizeFrontend(value: string | null | undefined): string | null {
  const s = (value || "").trim();
  if (!s || !/^https?:\/\//i.test(s)) return null;
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    return null;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  if (!u.hostname || u.username || u.password || u.search || u.hash) return null;
  return `${u.protocol}//${u.host}${u.pathname.replace(/\/+$/, "")}`;
}

function stripPrivate(params: URLSearchParams): string {
  for (const k of [...params.keys()]) if (PRIVATE_PARAM.test(k)) params.delete(k);
  const q = params.toString();
  return q ? `?${q}` : "";
}

function rewriteYouTube(u: URL, base: string): string {
  const host = u.hostname.toLowerCase();
  let id: string | null = null;
  if (host === "youtu.be") {
    const seg = u.pathname.split("/")[1] || "";
    if (YT_ID.test(seg)) id = seg;
  } else if (u.pathname === "/watch") {
    const v = u.searchParams.get("v") || "";
    if (YT_ID.test(v)) id = v;
  } else {
    const m = u.pathname.match(/^\/(?:shorts|live)\/([A-Za-z0-9_-]{11})\/?$/);
    if (m) id = m[1];
  }
  if (id) {
    const out = new URLSearchParams({ v: id });
    for (const k of ["t", "list"]) {
      const val = u.searchParams.get(k);
      if (val) out.set(k, val);
    }
    return `${base}/watch?${out.toString()}${u.hash}`;
  }
  // Search, channels (/@name, /channel/ID), playlists: same path on Invidious.
  return `${base}${u.pathname}${stripPrivate(new URLSearchParams(u.search))}${u.hash}`;
}

/**
 * The link the user should land on: a Reddit / YouTube page moved to their own
 * frontend, anything else unchanged. Never throws; a bad URL or instance
 * returns the input as is.
 */
export function rewriteExternalUrl(url: string, cfg: FrontendConfig | null | undefined): string {
  if (!url || !cfg || (!cfg.reddit && !cfg.youtube)) return url;
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return url;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return url;
  const host = u.hostname.toLowerCase();

  if (host === "youtu.be" || YOUTUBE_HOSTS.has(host)) {
    const base = normalizeFrontend(cfg.youtube);
    if (!base || u.pathname === "/iframe_api" || u.pathname.startsWith("/embed/")) return url;
    return rewriteYouTube(u, base);
  }

  if (host === "redd.it" || REDDIT_HOSTS.has(host)) {
    const base = normalizeFrontend(cfg.reddit);
    if (!base) return url;
    // redd.it/ID is a short post link; Redlib resolves /ID the same way.
    return `${base}${u.pathname}${u.search}${u.hash}`;
  }

  return url;
}

// Module state, set from the prefs on every load/save (like the TV channel
// list), so every link reads the same config without threading props. Before
// the first load (a page that never loads prefs) it reads the stored blob once.
const PREFS_KEY = "nss-preferences";
let current: FrontendConfig | null = null;
let listening = false;

export function setFrontendLinks(reddit: string | undefined, youtube: string | undefined): void {
  current = { reddit: reddit || undefined, youtube: youtube || undefined };
}

export function frontendConfig(): FrontendConfig {
  if (typeof window === "undefined") return current ?? {};
  if (!listening) {
    listening = true;
    // Another tab saved new prefs: re-read on the next link.
    window.addEventListener("storage", (e) => {
      if (e.key === PREFS_KEY || e.key === null) current = null;
    });
  }
  if (current) return current;
  try {
    const stored = JSON.parse(localStorage.getItem(PREFS_KEY) || "null") as
      { redditFrontend?: string; youtubeFrontend?: string } | null;
    setFrontendLinks(stored?.redditFrontend, stored?.youtubeFrontend);
  } catch {
    setFrontendLinks(undefined, undefined);
  }
  return current ?? {};
}

/**
 * Shorthand for an `href`: the rewritten link under the current settings.
 * Blank → undefined, so an empty URL drops the attribute (as `url || undefined`
 * did) instead of rendering href="" that links back to the page.
 */
export function frontendHref(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  return rewriteExternalUrl(url, frontendConfig());
}
