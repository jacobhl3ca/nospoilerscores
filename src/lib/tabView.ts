// Per-tab view memory: the view (News or Scores) THIS tab was last on.
//
// prefs.showNews is one key in localStorage, shared by every tab and synced
// across devices, and a new ET day drops it to Scores (Jacob 6/19). So a tab
// that sat on News overnight, or whose News view another tab or device
// overwrote, reloaded to Scores (Jacob 10/4). sessionStorage lives only as
// long as the tab, survives its reloads, and is never shared, so a tab on
// News stays on News while a NEW tab on a new day still opens on Scores.

export type TabView = "news" | "scores";

export const TAB_VIEW_KEY = "hs-tab-view";

export function readTabView(): TabView | null {
  try {
    const v = sessionStorage.getItem(TAB_VIEW_KEY);
    return v === "news" || v === "scores" ? v : null;
  } catch {
    return null;
  }
}

export function writeTabView(view: TabView): void {
  try {
    sessionStorage.setItem(TAB_VIEW_KEY, view);
  } catch {
    /* private mode / storage off: the shared prefs rule still applies */
  }
}
