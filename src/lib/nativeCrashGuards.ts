// Web half of the iOS crash guards (GitHub #290, #66). The site runs inside the
// iOS app's WKWebView, so a change here reaches every app build, old builds
// included. The native half (MainViewController.swift) reaches only builds made
// after it.
//
// - #290: the app stopped in WebKit's own player layer:
//   -[WebAVPlayerLayer startRedirectingVideoToLayer:forMode:] is an unrecognized
//   selector. AVKit sends it to that layer on the picture-in-picture path.
//   App 1.0.11 (build 17) turns PiP off in the web view configuration; older
//   builds still offer it. So in the iOS app every <video> gets
//   disablePictureInPicture before it plays, and an embed iframe does not ask
//   for picture-in-picture. Browsers keep PiP.
// - Breadcrumbs: a native crash report carries only native breadcrumbs. App
//   builds with the `hsBreadcrumb` message handler get one line for each video
//   presentation change (#290) and each image long-press (#66: the "Save to
//   Photos" path), so the next report shows what the reader did just before.
//   Only the fixed strings in CRUMBS are sent: no title, no URL, no page text
//   (HideScore rule: no score or result text in logs). The shell accepts only
//   these strings (BREADCRUMBS in MainViewController.swift).

type BreadcrumbHandler = { postMessage: (msg: unknown) => void };
type AppWindow = {
  Capacitor?: { isNativePlatform?: () => boolean; getPlatform?: () => string };
  webkit?: { messageHandlers?: { hsBreadcrumb?: BreadcrumbHandler } };
};

export type Crumb = { category: "video" | "image"; message: string };

export const CRUMBS = {
  play: { category: "video", message: "player started" },
  inline: { category: "video", message: "presentation inline" },
  fullscreen: { category: "video", message: "presentation fullscreen" },
  pip: { category: "video", message: "presentation picture-in-picture" },
  longPress: { category: "image", message: "image long-press" },
} as const satisfies Record<string, Crumb>;

/** True only inside the iOS app (Capacitor's native bridge, platform "ios"). */
export function isIosApp(w: unknown): boolean {
  const cap = (w as AppWindow | null | undefined)?.Capacitor;
  try {
    return !!cap?.isNativePlatform?.() && cap?.getPlatform?.() === "ios";
  } catch {
    return false;
  }
}

const IFRAME_FEATURES = ["autoplay", "encrypted-media", "fullscreen", "picture-in-picture"];

/** The `allow` list for an embed iframe: no picture-in-picture in the iOS app. */
export function iframeAllow(w: unknown): string {
  const features = isIosApp(w) ? IFRAME_FEATURES.filter((f) => f !== "picture-in-picture") : IFRAME_FEATURES;
  return features.join("; ");
}

/** The crumb for a WebKit presentation mode, or null for any other value. */
export function presentationCrumb(mode: unknown): Crumb | null {
  if (mode === "inline") return CRUMBS.inline;
  if (mode === "fullscreen") return CRUMBS.fullscreen;
  if (mode === "picture-in-picture") return CRUMBS.pip;
  return null;
}

/** Sends a crumb to the iOS shell. Builds without the handler ignore it. */
export function postBreadcrumb(w: unknown, crumb: Crumb): boolean {
  const h = (w as AppWindow | null | undefined)?.webkit?.messageHandlers?.hsBreadcrumb;
  if (!h) return false;
  try {
    h.postMessage({ category: crumb.category, message: crumb.message });
    return true;
  } catch {
    return false;
  }
}

/** Turns picture-in-picture off on one <video>. */
export function disablePip(video: HTMLVideoElement): void {
  video.setAttribute("disablepictureinpicture", "");
  try {
    (video as HTMLVideoElement & { disablePictureInPicture?: boolean }).disablePictureInPicture = true;
  } catch {
    /* an engine without the property: the attribute is there */
  }
}

// A press this long on an image is iOS's long-press. Its menu opens at about
// 0.5 s and can cancel the touch at that moment, so the bar sits a little lower.
const LONG_PRESS_MS = 450;
// A finger that moves further than this is a scroll, not a press.
const MOVE_PX = 10;

const isVideo = (t: EventTarget | null): t is HTMLVideoElement =>
  !!t && (t as Element).nodeType === 1 && (t as Element).tagName === "VIDEO";

/**
 * Installs the guards on one document. Each listener checks for the iOS app
 * when it runs, so it costs nothing in a browser. Media events do not bubble,
 * so the listeners are on the capture phase. Returns an uninstall function.
 */
export function installNativeCrashGuards(w: Window, now: () => number = () => Date.now()): () => void {
  const doc = w.document;
  const opts = { capture: true, passive: true } as const;

  // loadstart comes before any play, and play covers a <video> whose source
  // was already loaded when it entered the page.
  const onMedia = (e: Event) => {
    if (!isVideo(e.target) || !isIosApp(w)) return;
    disablePip(e.target);
    if (e.type === "play" && e.target.controls) postBreadcrumb(w, CRUMBS.play);
  };
  const onPresentation = (e: Event) => {
    if (!isVideo(e.target) || !isIosApp(w)) return;
    const mode = (e.target as HTMLVideoElement & { webkitPresentationMode?: unknown }).webkitPresentationMode;
    const crumb = e.type === "enterpictureinpicture" ? CRUMBS.pip : presentationCrumb(mode);
    if (crumb) postBreadcrumb(w, crumb);
  };

  let pressStart = 0;
  let pressX = 0;
  let pressY = 0;
  const onTouchStart = (e: Event) => {
    pressStart = 0;
    const t = e as TouchEvent;
    const target = t.target as Element | null;
    if (!target || target.nodeType !== 1 || target.tagName !== "IMG" || t.touches?.length !== 1) return;
    if (!isIosApp(w)) return;
    pressStart = now();
    pressX = t.touches[0].clientX;
    pressY = t.touches[0].clientY;
  };
  const onTouchMove = (e: Event) => {
    if (!pressStart) return;
    const p = (e as TouchEvent).touches?.[0];
    if (p && Math.hypot(p.clientX - pressX, p.clientY - pressY) > MOVE_PX) pressStart = 0;
  };
  const onTouchEnd = () => {
    if (pressStart && now() - pressStart >= LONG_PRESS_MS) postBreadcrumb(w, CRUMBS.longPress);
    pressStart = 0;
  };

  const listeners: Array<[string, (e: Event) => void]> = [
    ["loadstart", onMedia],
    ["play", onMedia],
    ["webkitpresentationmodechanged", onPresentation],
    ["enterpictureinpicture", onPresentation],
    ["touchstart", onTouchStart],
    ["touchmove", onTouchMove],
    ["touchend", onTouchEnd],
    ["touchcancel", onTouchEnd],
  ];
  for (const [type, fn] of listeners) doc.addEventListener(type, fn, opts);
  return () => {
    for (const [type, fn] of listeners) doc.removeEventListener(type, fn, opts);
  };
}
