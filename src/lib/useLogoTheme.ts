"use client";

import { useCallback, useState, useSyncExternalStore } from "react";

// Shared by LeagueMark (league logos) and TeamLogo (team logos): both swap to
// ESPN's dark-theme copy in dark mode and fall back when a copy fails to load.

// <html data-theme> is the resolved theme: the pre-paint script, the Theme
// pills and the OS listener all write it, so it follows a manual Light/Dark
// pick and not only the OS setting.
function subscribeTheme(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => observer.disconnect();
}
const readTheme = () => document.documentElement.getAttribute("data-theme") === "dark";

export function useDarkTheme(): boolean {
  return useSyncExternalStore(subscribeTheme, readTheme, () => false);
}

// The image URLs that failed to load. Keyed to the URL, not the component, so a
// new src (another team, another league) gets a fresh try.
export function useFailedUrls(): { failed: readonly string[]; markFailed: (url: string) => void } {
  const [failed, setFailed] = useState<string[]>([]);
  const markFailed = useCallback((url: string) => setFailed((f) => (f.includes(url) ? f : [...f, url])), []);
  return { failed, markFailed };
}
