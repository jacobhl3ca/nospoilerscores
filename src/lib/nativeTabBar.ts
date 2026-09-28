// Bridge to the native iOS tab bar (UITabBar in MainViewController.swift).
//
// Long-press on the web bar's icons popped iOS's image menu (Share / Save to
// Photos), and Jacob wanted the stock translucent iOS bar instead (9/27 shot
// review, 5EBB8E2E). So the iOS shell now draws a real UITabBar and
// the web bar stands down — but ONLY when that shell says so:
//
// - The shell injects `data-native-tabbar` on <html> at document start and a
//   `hsTabBar` script message handler. Older app builds have neither, so they
//   keep the web bar; so do Android and every browser.
// - The page tells the bar which tab is selected, whether it should show
//   (phone width, no modal open — the web bar sits under every modal, the
//   native one would sit on top of it), and the site theme (the bar follows
//   the site's dark/light pick, not the phone's).
// - A tap on a native tab arrives as a `hs-native-tab` window event.

type Handler = { postMessage: (msg: unknown) => void };

function handler(): Handler | null {
  if (typeof window === "undefined") return null;
  if (!document.documentElement.hasAttribute("data-native-tabbar")) return null;
  const w = window as unknown as { webkit?: { messageHandlers?: { hsTabBar?: Handler } } };
  return w.webkit?.messageHandlers?.hsTabBar ?? null;
}

export type NativeTabBar = {
  setView: (view: string) => void;
  disconnect: () => void;
};

export function connectNativeTabBar(onSelect: (view: string) => void): NativeTabBar | null {
  const h = handler();
  if (!h) return null;
  // Same breakpoint as the web bar's `sm:hidden` wrapper (Tailwind sm = 40rem):
  // wider than that, the tabs live inline in the header instead.
  const narrow = window.matchMedia("(max-width: 39.99rem)");
  let view = "";
  let last = "";
  let raf = 0;
  const post = (force?: { visible: boolean }) => {
    const msg = {
      view,
      visible: force ? force.visible : narrow.matches && !document.querySelector('[aria-modal="true"]'),
      theme: document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light",
    };
    const key = JSON.stringify(msg);
    if (key === last) return;
    last = key;
    try { h.postMessage(msg); } catch { /* shell went away mid-teardown */ }
  };
  const schedule = () => {
    if (raf) return;
    raf = requestAnimationFrame(() => { raf = 0; post(); });
  };
  // Modals mount and unmount anywhere under <body>; one rAF-throttled
  // querySelector per frame of mutations is cheap next to the render itself.
  const bodyObserver = new MutationObserver(schedule);
  bodyObserver.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["aria-modal"] });
  const themeObserver = new MutationObserver(schedule);
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  narrow.addEventListener("change", schedule);
  const onTab = (e: Event) => {
    const v = (e as CustomEvent<unknown>).detail;
    if (typeof v === "string") onSelect(v);
  };
  window.addEventListener("hs-native-tab", onTab);
  return {
    setView(v: string) {
      view = v;
      post();
    },
    disconnect() {
      bodyObserver.disconnect();
      themeObserver.disconnect();
      narrow.removeEventListener("change", schedule);
      window.removeEventListener("hs-native-tab", onTab);
      if (raf) cancelAnimationFrame(raf);
      // Off the board (client-side nav to /teams, an article…) there are no
      // view tabs to drive, so the native bar goes away with the web one.
      post({ visible: false });
    },
  };
}
