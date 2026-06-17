// Cross-device preference sync over the Sign in with Apple session.
//
// The worker (public/_worker.js) exposes:
//   GET  /api/me      -> { signedIn, email }
//   GET  /api/prefs   -> { prefs }   (the signed-in user's stored prefs, or null)
//   PUT  /api/prefs   body = prefs JSON
//   GET  /auth/apple/login?returnTo=/   -> redirects into Apple
//   GET  /auth/logout                   -> clears the session
//
// All of this is inert when signed out: getAuthState() returns signedIn:false
// and nothing else fires, so the app behaves exactly as before for anonymous
// users (prefs stay in localStorage only).

import type { Preferences } from "./preferences";

export interface AuthState {
  signedIn: boolean;
  email: string | null;
  // Which sign-in methods are live (secrets configured). Undefined when the
  // request failed — callers should treat Apple as available by default.
  providers?: { apple: boolean; google: boolean };
}

export async function getAuthState(): Promise<AuthState> {
  try {
    const r = await fetch("/api/me", { credentials: "include" });
    if (!r.ok) return { signedIn: false, email: null };
    const j = await r.json();
    return { signedIn: !!j.signedIn, email: j.email ?? null, providers: j.providers };
  } catch {
    return { signedIn: false, email: null };
  }
}

// Returns the server's stored prefs (a partial Preferences blob) or null if the
// user has none yet / the request failed.
export async function fetchRemotePrefs(): Promise<Partial<Preferences> | null> {
  try {
    const r = await fetch("/api/prefs", { credentials: "include" });
    if (!r.ok) return null;
    const { prefs } = await r.json();
    return prefs || null;
  } catch {
    return null;
  }
}

// Debounced upload — every savePreferences() call funnels here once the user is
// signed in (registered via setRemoteSync), so rapid toggles coalesce into one
// PUT.
let pushTimer: ReturnType<typeof setTimeout> | null = null;
let pendingPrefs: Preferences | null = null;
export function pushRemotePrefs(prefs: Preferences): void {
  pendingPrefs = prefs;
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    const body = JSON.stringify(pendingPrefs);
    pushTimer = null;
    pendingPrefs = null;
    fetch("/api/prefs", {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body,
    }).catch(() => {});
  }, 800);
}

export function signInWithApple(returnTo?: string): void {
  if (typeof window === "undefined") return;
  const rt = returnTo || window.location.pathname || "/";
  window.location.href = `/auth/apple/login?returnTo=${encodeURIComponent(rt)}`;
}

export function signInWithGoogle(returnTo?: string): void {
  if (typeof window === "undefined") return;
  const rt = returnTo || window.location.pathname || "/";
  window.location.href = `/auth/google/login?returnTo=${encodeURIComponent(rt)}`;
}

export function signOut(): void {
  if (typeof window === "undefined") return;
  // The worker clears the cookie and 303s back to "/".
  window.location.href = "/auth/logout";
}
