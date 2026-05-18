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
