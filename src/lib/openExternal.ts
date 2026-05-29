// Open an external URL with the best chance of triggering a native app
// install on iOS via universal links.
//
// In the browser we use window.open(_, "_blank") — universal links handle
// app launches automatically when the destination's apple-app-site-association
// covers the path (Prime Video on /detail/, ESPN on /watch/player/, etc.).
//
// Inside the Capacitor iOS wrapper, the WebView's window.open behavior
// shells out to mobile Safari, which historically misses universal-link
// triggers (especially when the user previously chose "Open in Safari").
// SFSafariViewController via @capacitor/browser hits the universal-link
// system more reliably and stays in-app on the back-swipe, so we route
// through Browser.open when running natively.
//
// YouTube exception: SFSafariViewController renders youtube.com in-app
// instead of handing off to the YouTube app. We bypass it for youtube URLs
// by mapping them to the `youtube://` app scheme and launching via
// @capacitor/app-launcher (which calls UIApplication.openURL and respects
// registered app URL schemes). This covers both video links (/watch,
// youtu.be, /shorts) and search-results pages (/results) — the highlight
// buttons fall back to a YouTube search URL when no specific video
// resolves, and those were still landing in the in-app browser.
// Falls back to Browser.open if YouTube isn't installed.
//
// Streaming "watch" links (MLB, ESPN, NBA, Prime Video, …): the destination
// networks ship mobile apps that register their content URLs as iOS
// Universal Links / Android App Links — e.g. the MLB app claims
// mlb.com/tv/g* (its per-game page). SFSafariViewController does NOT fire
// universal links, so in the wrapper those taps were stuck in the in-app
// browser even when the app was installed. We instead hand the *unchanged
// https URL* to AppLauncher.openUrl(): on both platforms the OS opens the
// registered app deep-linked to that exact game when installed, and falls
// back to the system browser otherwise. We deliberately do NOT gate on
// canOpenUrl — an https URL always "can open" (Safari), which would mask an
// installed app — and we avoid custom app schemes so this needs no
// LSApplicationQueriesSchemes / Android <queries> entries and ships live via
// the WebView without a native rebuild. On the mobile web the same handoff
// already happens automatically when window.open hits a universal link.
//
// Note: this is only a fallback. The primary path plays highlights in
// HideScore's own embedded player (VideoModal) — see fetchFirstVideoId in
// lib/youtube.ts. openExternal only runs when no specific video resolves.

const isCapacitorNative = (): boolean => {
  if (typeof window === "undefined") return false;
  type CapacitorGlobal = { Capacitor?: { isNativePlatform?: () => boolean } };
  const cap = (window as unknown as CapacitorGlobal).Capacitor;
  return !!cap?.isNativePlatform?.();
};

// Map a youtube.com / youtu.be web URL to its `youtube://` app-scheme
// equivalent so @capacitor/app-launcher can hand off to the native app.
// Covers video links (youtube.com/watch?v=ID, youtu.be/ID, /shorts/ID,
// m.youtube.com/*) and search-results pages (youtube.com/results?
// search_query=Q). Returns null for any non-YouTube or unrecognized URL.
function youTubeAppUrl(url: string): string | null {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^(www\.|m\.)/, "");
    if (host === "youtu.be") {
      const id = u.pathname.slice(1).split("/")[0];
      return /^[a-zA-Z0-9_-]{11}$/.test(id) ? `youtube://watch?v=${id}` : null;
    }
    if (host !== "youtube.com") return null;
    if (u.pathname === "/watch") {
      const id = u.searchParams.get("v") || "";
      return /^[a-zA-Z0-9_-]{11}$/.test(id) ? `youtube://watch?v=${id}` : null;
    }
    const shortsMatch = u.pathname.match(/^\/shorts\/([a-zA-Z0-9_-]{11})/);
    if (shortsMatch) return `youtube://watch?v=${shortsMatch[1]}`;
    if (u.pathname === "/results") {
      const q = u.searchParams.get("search_query") || "";
      return q ? `youtube://results?search_query=${encodeURIComponent(q)}` : null;
    }
    return null;
  } catch {
    return null;
  }
}

async function tryOpenInYouTubeApp(appUrl: string): Promise<boolean> {
  try {
    const { AppLauncher } = await import("@capacitor/app-launcher");
    const { value: canOpen } = await AppLauncher.canOpenUrl({ url: appUrl });
    if (!canOpen) return false;
    await AppLauncher.openUrl({ url: appUrl });
    return true;
  } catch {
    return false;
  }
}

function openInBrowser(url: string): void {
  import("@capacitor/browser")
    .then(({ Browser }) => Browser.open({ url }))
    .catch(() => {
      window.open(url, "_blank", "noopener,noreferrer");
    });
}

// Streaming destinations whose mobile apps register their content URLs as
// iOS Universal Links / Android App Links. Opening these https URLs via
// AppLauncher.openUrl() deep-links straight into the installed app (the MLB
// app's /tv/g{gamePk} game page, ESPN's /watch player, etc.), falling back
// to the system browser when the app isn't installed. Matched on hostname
// suffix so "www." and regional subdomains (e.g. nbcsports.com) are covered.
const APP_LINK_HOSTS = [
  "mlb.com",           // MLB app — /tv/g* (per-game), /news/*
  "espn.com",          // ESPN app — /watch/*, gamecast
  "nba.com",           // NBA app — /watch, league-pass-stream
  "wnba.com",          // WNBA app — /watch
  "nhl.com",           // NHL app — /tv
  "nfl.com",           // NFL app — /plus
  "foxsports.com",     // FOX Sports app — /live
  "nbcsports.com",     // NBC Sports app
  "nbc.com",           // NBC app
  "peacocktv.com",     // Peacock
  "hbomax.com",        // Max — /sports
  "paramountplus.com", // Paramount+
  "primevideo.com",    // Prime Video
  "tv.apple.com",      // Apple TV
  "tv.youtube.com",    // YouTube TV
  "cbssports.com",     // CBS Sports
  "tennischannel.com", // Tennis Channel
  "pgatour.com",       // PGA Tour
  "usanetwork.com",    // USA Network
  "golfchannel.com",   // Golf Channel
];

function isAppLinkHost(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return APP_LINK_HOSTS.some((h) => host === h || host.endsWith("." + h));
  } catch {
    return false;
  }
}

// Hand an https Universal Link / App Link to the OS so it deep-links into the
// registered app when installed (else the system browser). Falls back to the
// in-app browser if the AppLauncher plugin is unavailable.
async function openViaAppLink(url: string): Promise<void> {
  try {
    const { AppLauncher } = await import("@capacitor/app-launcher");
    await AppLauncher.openUrl({ url });
  } catch {
    openInBrowser(url);
  }
}

export function openExternal(url: string): void {
  if (!url) return;
  if (isCapacitorNative()) {
    const ytApp = youTubeAppUrl(url);
    if (ytApp) {
      tryOpenInYouTubeApp(ytApp).then((opened) => {
        if (!opened) openInBrowser(url);
      });
      return;
    }
    if (isAppLinkHost(url)) {
      openViaAppLink(url);
      return;
    }
    openInBrowser(url);
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}

// Use as an `onClick` handler on `<a>` tags so the browser's default link
// behavior is short-circuited and we route through openExternal instead.
// Keeps href/target on the element for accessibility + middle-click.
export function handleExternalClick(
  url: string | null | undefined
): (e: React.MouseEvent) => void {
  return (e) => {
    e.stopPropagation();
    if (!url) return;
    // Let modifier-clicks (cmd/ctrl/middle) follow the default new-tab behavior.
    if (e.metaKey || e.ctrlKey || e.shiftKey || (e as React.MouseEvent).button === 1) return;
    e.preventDefault();
    openExternal(url);
  };
}
