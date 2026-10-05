// Android home-screen widget bridge. The widget (android/…/HideScoreWidget*.java)
// lists upcoming games for the favorite teams; it learns them from here.
//
// The web deploy reaches every shell — web, iOS, and Android builds that
// predate the widget plugin — so this must be a silent no-op everywhere the
// plugin is missing, and must never throw into savePreferences.
import type { Preferences } from "./preferences";

type WidgetPlugin = { setPrefs?: (p: { teams: string[]; tz: string | null }) => Promise<unknown> };

let lastSent: string | null = null;

function widgetPlugin(): WidgetPlugin | null {
  if (typeof window === "undefined") return null;
  const cap = (window as unknown as {
    Capacitor?: { isNativePlatform?: () => boolean; getPlatform?: () => string; Plugins?: { HideScoreWidget?: WidgetPlugin } };
  }).Capacitor;
  if (!cap?.isNativePlatform?.() || cap.getPlatform?.() !== "android") return null;
  return cap.Plugins?.HideScoreWidget ?? null;
}

export function pushWidgetPrefs(prefs: Pick<Preferences, "favoriteTeams" | "timezone">): void {
  try {
    const plugin = widgetPlugin();
    if (!plugin?.setPrefs) return;
    const payload = { teams: prefs.favoriteTeams ?? [], tz: prefs.timezone || null };
    const key = JSON.stringify(payload);
    if (key === lastSent) return;
    lastSent = key;
    Promise.resolve(plugin.setPrefs(payload)).catch(() => {
      lastSent = null; // try again on the next save
    });
  } catch {
    /* old shell or no plugin: nothing to do */
  }
}

// Tests only.
export function resetWidgetBridgeForTests(): void {
  lastSent = null;
}
