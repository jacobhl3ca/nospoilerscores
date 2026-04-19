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

const isCapacitorNative = (): boolean => {
  if (typeof window === "undefined") return false;
  type CapacitorGlobal = { Capacitor?: { isNativePlatform?: () => boolean } };
  const cap = (window as unknown as CapacitorGlobal).Capacitor;
  return !!cap?.isNativePlatform?.();
};

export function openExternal(url: string): void {
  if (!url) return;
  if (isCapacitorNative()) {
    // Lazy import so the web bundle doesn't pull in the plugin runtime.
    import("@capacitor/browser")
      .then(({ Browser }) => Browser.open({ url }))
      .catch(() => {
        // Fallback: best-effort window.open if the plugin failed to load.
        window.open(url, "_blank", "noopener,noreferrer");
      });
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
