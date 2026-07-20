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
  const cap = (window as unknown as {
    Capacitor?: { isNativePlatform?: () => boolean };
  }).Capacitor;
  if (cap?.isNativePlatform?.()) {
    void nativeAppleSignIn(rt);
    return;
  }
  appleWebSignIn(rt);
}

function appleWebSignIn(rt: string): void {
  window.location.href = `/auth/apple/login?returnTo=${encodeURIComponent(rt)}`;
}

// In the iOS app the web OAuth redirect logs in inside Safari — not the app's
// WebView — so the app stays signed out. Use the native Apple sheet instead
// (@capacitor-community/apple-sign-in) and hand the identity token to the worker
// (/auth/apple/native), which sets the hs_session cookie on hidescore.com — what
// the WebView is showing, so the app becomes signed in. The plugin is imported
// dynamically so the web bundle never runs native-only code. If the plugin isn't
// present (an older app build without it) or the native call fails, fall back to
// the web flow so nothing regresses versus today.
async function nativeAppleSignIn(rt: string): Promise<void> {
  try {
    const nonce =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2);
    const { SignInWithApple } = await import("@capacitor-community/apple-sign-in");
    const res = await SignInWithApple.authorize({
      // clientId + redirectURI are ignored by the iOS native flow (it uses the
      // app's Sign in with Apple entitlement) but are required by the plugin type.
      clientId: "com.hidescore.web",
      redirectURI: "https://hidescore.com/auth/apple/callback",
      scopes: "name email",
      nonce,
    });
    const idToken = res?.response?.identityToken;
    if (!idToken) throw new Error("no identityToken from Apple");
    const r = await fetch("/auth/apple/native", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        identityToken: idToken,
        nonce,
        email: res.response.email ?? null,
      }),
    });
    if (!r.ok) throw new Error(`native auth failed: ${r.status}`);
    window.location.reload();
  } catch (e) {
    console.error("[siwa native] sign-in failed, falling back to web flow", e);
    appleWebSignIn(rt);
  }
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

// Permanently delete the signed-in user's server-stored data, then sign out.
// Backs Apple's in-app account-deletion requirement (guideline 5.1.1(v)); the
// worker (DELETE /api/account) removes the user's prefs object from R2 and clears
// the session cookie. Returns true on success so the caller can reload to "/".
export async function deleteAccount(): Promise<boolean> {
  try {
    const r = await fetch("/api/account", { method: "DELETE", credentials: "include" });
    return r.ok;
  } catch {
    return false;
  }
}
