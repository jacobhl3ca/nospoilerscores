"use client";

import { useSyncExternalStore } from "react";

// Which store this copy of the app came from: the native shells only. The web
// has no store to rate on, so it is null there (and on the server render).
export type AppStore = "ios" | "android" | null;

export function detectAppStore(): AppStore {
  if (typeof window === "undefined") return null;
  type CapacitorGlobal = { Capacitor?: { isNativePlatform?: () => boolean; getPlatform?: () => string } };
  const cap = (window as unknown as CapacitorGlobal).Capacitor;
  if (!cap?.isNativePlatform?.()) return null;
  return cap.getPlatform?.() === "android" ? "android" : "ios";
}

// The platform never changes during a page's life, so there is nothing to
// subscribe to. useSyncExternalStore still gives the server snapshot (null) on
// hydration and the real value right after, with no mismatch.
const noSubscribe = () => () => {};

export function useAppStore(): AppStore {
  return useSyncExternalStore(noSubscribe, detectAppStore, () => null);
}

// The store listing's review page. Open it with a plain <a href> (no target):
// see the comment on Settings' "Rate this app" link for why that leaves the
// WebView and opens the store app itself.
export function storeReviewHref(appStore: "ios" | "android"): string {
  return appStore === "ios"
    ? "https://apps.apple.com/app/id6766885311?action=write-review"
    : "https://play.google.com/store/apps/details?id=com.jacobhl.hidescore";
}
