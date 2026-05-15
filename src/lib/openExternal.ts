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
// by extracting the video ID and attempting `youtube://watch?v=ID` through
// @capacitor/app-launcher (which calls UIApplication.openURL and respects
// registered app URL schemes). Falls back to Browser.open if YouTube isn't
// installed.

const isCapacitorNative = (): boolean => {
  if (typeof window === "undefined") return false;
  type CapacitorGlobal = { Capacitor?: { isNativePlatform?: () => boolean } };
  const cap = (window as unknown as CapacitorGlobal).Capacitor;
  return !!cap?.isNativePlatform?.();
};

// Match youtube.com/watch?v=ID, youtu.be/ID, youtube.com/shorts/ID, m.youtube.com/*.
// Returns the 11-char video ID or null.
function extractYouTubeVideoId(url: string): string | null {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^(www\.|m\.)/, "");
    if (host === "youtu.be") {
      const id = u.pathname.slice(1).split("/")[0];
      return /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : null;
    }
    if (host === "youtube.com") {
      if (u.pathname === "/watch") {
        const id = u.searchParams.get("v") || "";
        return /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : null;
      }
      const shortsMatch = u.pathname.match(/^\/shorts\/([a-zA-Z0-9_-]{11})/);
      if (shortsMatch) return shortsMatch[1];
    }
    return null;
  } catch {
    return null;
  }
}

async function tryOpenInYouTubeApp(videoId: string): Promise<boolean> {
  try {
    const { AppLauncher } = await import("@capacitor/app-launcher");
    const target = `youtube://watch?v=${videoId}`;
    const { value: canOpen } = await AppLauncher.canOpenUrl({ url: target });
    if (!canOpen) return false;
    await AppLauncher.openUrl({ url: target });
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
    const videoId = extractYouTubeVideoId(url);
    if (videoId) {
      tryOpenInYouTubeApp(videoId).then((opened) => {
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
