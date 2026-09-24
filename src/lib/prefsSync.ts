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
// .ts extension: tests/auth-cache.test.mjs loads this file under plain
// node --experimental-strip-types, which needs the extension on relative imports.
import { withoutDeviceLocalPrefs } from "./devicePrefs.ts";

export interface AuthState {
  signedIn: boolean;
  email: string | null;
  // Which sign-in methods are live (secrets configured). Undefined when the
  // request failed — callers should treat Apple as available by default.
  providers?: { apple: boolean; google: boolean; email: boolean };
  /** Pseudonymous, stable account id (HMAC of the provider sub) — safe to send
   *  to analytics; never the raw Apple/Google sub or the email. */
  uid?: string | null;
  /** "apple" | "google" — which identity is linked to this account. */
  provider?: string | null;
  /** Every provider attached to the same canonical preferences account. */
  linkedProviders?: string[];
  /** The client this request came from. */
  platform?: "ios" | "android" | "web";
  /** Last time this account was seen on each client, ISO strings. */
  platforms?: Partial<Record<"ios" | "android" | "web", string>>;
  firstSeen?: string | null;
  lastSeen?: string | null;
}

// The Capacitor WebView loads hidescore.com over https and its User-Agent is
// indistinguishable from mobile Safari, so the SERVER cannot tell an app user
// from a browser user on its own. Every authed request carries this header and
// the worker records it on the account (see _hsTouchUser in public/_worker.js).
export function hsPlatform(): "ios" | "android" | "web" {
  if (typeof window === "undefined") return "web";
  const cap = (window as unknown as {
    Capacitor?: { isNativePlatform?: () => boolean; getPlatform?: () => string };
  }).Capacitor;
  if (!cap?.isNativePlatform?.()) return "web";
  return cap.getPlatform?.() === "android" ? "android" : "ios";
}

function hsClientHeaders(extra?: Record<string, string>): Record<string, string> {
  return { "X-HS-Client": hsPlatform(), ...(extra || {}) };
}

// Attach the signed-in account to the Umami session so analytics can answer
// "how many real accounts use the iPhone app" instead of just counting devices.
// Sends the pseudonymous uid + platform only — no email, no provider sub. Umami
// respects localStorage["umami.disabled"], so the site's no-track toggle still
// wins. Fails silently when the script is blocked or hasn't loaded yet.
// /api/me has been observed returning a raw Apple `sub` in `provider`, which put a real
// account identifier into analytics. Only ever forward a known label.
const PROVIDER_LABELS = new Set(["apple", "google", "email"]);

let identified = "";
function identifyToUmami(a: AuthState): void {
  if (typeof window === "undefined") return;
  if (!a.signedIn || !a.uid) return;
  const key = `${a.uid}:${a.platform}`;
  if (identified === key) return;
  const umami = (window as unknown as {
    umami?: { identify?: (data: Record<string, unknown>) => void };
  }).umami;
  if (!umami?.identify) return;
  identified = key;
  try {
    umami.identify({
      id: a.uid,
      signedIn: true,
      provider: PROVIDER_LABELS.has(a.provider ?? "") ? a.provider : "unknown",
      platform: a.platform || "web",
      nativeApp: a.platform === "ios" || a.platform === "android",
    });
  } catch { /* analytics must never break the app */ }
}

// ---------------------------------------------------------------------------
// Auth-state cache.
//
// /api/me is not cheap: for a signed-in user the worker walks identity ->
// account -> usage-record in R2 before it can answer, so the round trip runs
// into the seconds. SettingsPanel used to start from { signedIn: false } and
// only ask once the drawer opened, so an already signed-in user watched the
// Account section paint the SIGNED-OUT UI ("Sign in with Apple") and then flip
// to their email a couple of seconds later. Two layers remove that:
//
//   1. A localStorage snapshot of the last known state, so a caller can paint
//      the right thing on the first frame and revalidate behind it.
//   2. A module-level memo plus in-flight dedupe, so the callers that all ask
//      on load (HomeContent twice, SettingsPanel once) share ONE request.
//
// The snapshot is written only from a real 200 answer and cleared only by a
// real 200 that says signedIn:false, or by signOut/deleteAccount. A network
// blip must never look like a sign-out.
// ---------------------------------------------------------------------------
const AUTH_CACHE_KEY = "nss-auth";
// The session cookie lives 90 days (SIWA_SESSION_TTL in public/_worker.js), so
// a snapshot older than that cannot still be valid.
const AUTH_CACHE_TTL_MS = 90 * 24 * 60 * 60 * 1000;
// How long an in-memory answer counts as fresh enough to hand back without
// re-asking: long enough to collapse the burst of calls at load, short enough
// that opening Settings minutes later still revalidates.
const AUTH_FRESH_MS = 30_000;

let authMemo: { at: number; state: AuthState } | null = null;
let authInFlight: Promise<AuthState> | null = null;

function readAuthCache(): AuthState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(AUTH_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { at?: number; state?: AuthState } | null;
    if (!parsed || typeof parsed.at !== "number" || !parsed.state) return null;
    if (Date.now() - parsed.at > AUTH_CACHE_TTL_MS) return null;
    return parsed.state;
  } catch {
    return null;
  }
}

function writeAuthCache(state: AuthState | null): void {
  if (typeof window === "undefined") return;
  try {
    if (!state || !state.signedIn) window.localStorage.removeItem(AUTH_CACHE_KEY);
    else window.localStorage.setItem(AUTH_CACHE_KEY, JSON.stringify({ at: Date.now(), state }));
  } catch {
    /* private mode / quota — the cache is an optimisation, never a requirement */
  }
}

/** Last known auth state, synchronously, or null when we have never had one.
 *  null means UNKNOWN, not signed out: render a placeholder rather than a
 *  sign-in button, or you reintroduce the flash this exists to remove. */
export function cachedAuthState(): AuthState | null {
  return authMemo?.state ?? readAuthCache();
}

/** Drop everything we remember about the session. */
export function clearAuthCache(): void {
  authMemo = null;
  authInFlight = null;
  writeAuthCache(null);
}

async function fetchAuthState(): Promise<AuthState> {
  let j: Record<string, unknown>;
  try {
    const r = await fetch("/api/me", { credentials: "include", headers: hsClientHeaders() });
    if (!r.ok) throw new Error(`/api/me ${r.status}`);
    j = await r.json();
  } catch {
    // We still do not know. Hand back the last known state instead of asserting
    // signed-out, and do NOT memoize, so the next caller retries.
    return cachedAuthState() ?? { signedIn: false, email: null };
  }
  const state: AuthState = {
    signedIn: !!j.signedIn,
    email: (j.email as string | null) ?? null,
    providers: j.providers as AuthState["providers"],
    uid: (j.uid as string | null) ?? null,
    provider: (j.provider as string | null) ?? null,
    linkedProviders: Array.isArray(j.linkedProviders) ? (j.linkedProviders as string[]) : [],
    platform: (j.platform as AuthState["platform"]) ?? hsPlatform(),
    platforms: (j.platforms as AuthState["platforms"]) || {},
    firstSeen: (j.firstSeen as string | null) ?? null,
    lastSeen: (j.lastSeen as string | null) ?? null,
  };
  identifyToUmami(state);
  authMemo = { at: Date.now(), state };
  writeAuthCache(state);
  return state;
}

/** Current auth state. Shares one request across concurrent callers and reuses
 *  a very recent answer; pass force to bypass the memo (not the dedupe). */
export async function getAuthState(force = false): Promise<AuthState> {
  if (!force && authMemo && Date.now() - authMemo.at < AUTH_FRESH_MS) return authMemo.state;
  if (authInFlight) return authInFlight;
  const req = fetchAuthState().finally(() => {
    if (authInFlight === req) authInFlight = null;
  });
  authInFlight = req;
  return req;
}

// Returns the server's stored prefs (a partial Preferences blob) or null if the
// user has none yet / the request failed.
export async function fetchRemotePrefs(): Promise<Partial<Preferences> | null> {
  try {
    const r = await fetch("/api/prefs", { credentials: "include", headers: hsClientHeaders() });
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
let pendingPrefs: Partial<Preferences> | null = null;
let flushHookAttached = false;

function putPrefs(body: string, keepalive: boolean): void {
  fetch("/api/prefs", {
    method: "PUT",
    credentials: "include",
    headers: hsClientHeaders({ "Content-Type": "application/json" }),
    body,
    // keepalive lets the request outlive a page teardown — see flushPendingPrefs.
    keepalive,
  }).catch(() => {});
}

// Fire any queued PUT immediately, bypassing the 800ms debounce. Without this a
// toggle made inside the debounce window and immediately followed by a tab close
// or background is silently dropped — the pending timer never fires — so the
// change lands in localStorage but never reaches the server, and the user's other
// devices lose it. keepalive:true lets the in-flight PUT survive the page being
// torn down. Idempotent (PUT replaces the whole blob), so a stray double-send is
// harmless.
function flushPendingPrefs(): void {
  if (pushTimer) {
    clearTimeout(pushTimer);
    pushTimer = null;
  }
  if (pendingPrefs === null) return;
  const body = JSON.stringify(pendingPrefs);
  pendingPrefs = null;
  putPrefs(body, true);
}

export function pushRemotePrefs(prefs: Preferences): void {
  // Device-only keys (single-column view) never reach the account copy — see
  // lib/devicePrefs.ts.
  pendingPrefs = withoutDeviceLocalPrefs(prefs);
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    const body = JSON.stringify(pendingPrefs);
    pushTimer = null;
    pendingPrefs = null;
    putPrefs(body, false);
  }, 800);
  // Attach the flush-on-hide hook lazily and once. Only signed-in users reach
  // pushRemotePrefs (setRemoteSync is wired after auth), so anonymous users never
  // register a listener — the module stays inert when signed out (see header).
  if (!flushHookAttached && typeof window !== "undefined") {
    flushHookAttached = true;
    // pagehide covers tab close / navigation / bfcache; visibilitychange→hidden
    // covers the mobile "switch app / lock screen" case where pagehide can be
    // skipped. Both just flush what's queued, so firing both is harmless (the
    // second sees pendingPrefs === null and no-ops).
    window.addEventListener("pagehide", flushPendingPrefs);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") flushPendingPrefs();
    });
  }
}

export function signInWithApple(returnTo?: string, link = false): void {
  if (typeof window === "undefined") return;
  const rt = returnTo || window.location.pathname || "/";
  const cap = (window as unknown as {
    Capacitor?: { isNativePlatform?: () => boolean };
  }).Capacitor;
  if (cap?.isNativePlatform?.()) {
    void nativeAppleSignIn(rt, link);
    return;
  }
  appleWebSignIn(rt, link);
}

function appleWebSignIn(rt: string, link = false): void {
  window.location.href = `/auth/apple/login?returnTo=${encodeURIComponent(rt)}${link ? "&link=1" : ""}`;
}

// In the iOS app the web OAuth redirect logs in inside Safari — not the app's
// WebView — so the app stays signed out. Use the native Apple sheet instead
// (@capacitor-community/apple-sign-in) and hand the identity token to the worker
// (/auth/apple/native), which sets the hs_session cookie on hidescore.com — what
// the WebView is showing, so the app becomes signed in. The plugin is imported
// dynamically so the web bundle never runs native-only code. If the plugin isn't
// present (an older app build without it) or the native call fails, fall back to
// the web flow so nothing regresses versus today.
async function nativeAppleSignIn(rt: string, link = false): Promise<void> {
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
        link,
      }),
    });
    if (!r.ok) throw new Error(`native auth failed: ${r.status}`);
    window.location.reload();
  } catch (e) {
    console.error("[siwa native] sign-in failed, falling back to web flow", e);
    appleWebSignIn(rt, link);
  }
}

type NativeGooglePlugin = {
  authorize(options: { url: string; callbackScheme: string }): Promise<{ callbackUrl?: string; launched?: boolean }>;
  consumeCallback?(): Promise<{ callbackUrl?: string }>;
};

function nativeGooglePlugin(): NativeGooglePlugin | null {
  const cap = (window as unknown as {
    Capacitor?: { isNativePlatform?: () => boolean; Plugins?: { HideScoreGoogleAuth?: NativeGooglePlugin } };
  }).Capacitor;
  return cap?.isNativePlatform?.() ? cap.Plugins?.HideScoreGoogleAuth || null : null;
}

function base64url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function googleVerifier() {
  const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)));
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return { verifier, challenge: base64url(new Uint8Array(digest)) };
}

async function waitForGoogleCallback(plugin: NativeGooglePlugin) {
  for (let attempt = 0; attempt < 240; attempt += 1) {
    const result = await plugin.consumeCallback?.();
    if (result?.callbackUrl) return result.callbackUrl;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("Google sign-in timed out");
}

async function nativeGoogleSignIn(rt: string, link: boolean) {
  const plugin = nativeGooglePlugin();
  if (!plugin) return;
  const { verifier, challenge } = await googleVerifier();
  const start = new URL("/auth/google/login", window.location.origin);
  start.searchParams.set("returnTo", rt);
  start.searchParams.set("nativeChallenge", challenge);
  if (link) {
    const proofResponse = await fetch("/auth/google/native", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "link_token" }),
    });
    if (!proofResponse.ok) throw new Error("could not authorize account linking");
    const proof = await proofResponse.json() as { linkToken?: string };
    if (!proof.linkToken) throw new Error("server returned no link token");
    start.searchParams.set("nativeLinkToken", proof.linkToken);
  }
  const launched = await plugin.authorize({ url: start.toString(), callbackScheme: "hidescore-auth" });
  const callbackUrl = launched.callbackUrl || await waitForGoogleCallback(plugin);
  const callback = new URL(callbackUrl);
  const code = callback.searchParams.get("code");
  const returnTo = callback.searchParams.get("returnTo") || rt;
  if (!code) throw new Error("Google returned no handoff code");
  const response = await fetch("/auth/google/native", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, verifier, returnTo }),
  });
  if (!response.ok) throw new Error(`native Google sign-in failed: ${response.status}`);
  window.location.href = returnTo;
}

export function signInWithGoogle(returnTo?: string, link = false): void {
  if (typeof window === "undefined") return;
  const rt = returnTo || window.location.pathname || "/";
  const plugin = nativeGooglePlugin();
  if (plugin) {
    void nativeGoogleSignIn(rt, link).catch((error) => console.error("[google native] sign-in failed", error));
    return;
  }
  window.location.href = `/auth/google/login?returnTo=${encodeURIComponent(rt)}${link ? "&link=1" : ""}`;
}

export function hasNativeGoogleBridge(): boolean {
  return typeof window !== "undefined" && !!nativeGooglePlugin();
}

export async function requestEmailCode(email: string): Promise<{ ok: boolean; status: number }> {
  try {
    const response = await fetch("/auth/email/request", {
      method: "POST",
      credentials: "include",
      headers: hsClientHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ email }),
    });
    return { ok: response.ok, status: response.status };
  } catch { return { ok: false, status: 0 }; }
}

export async function verifyEmailCode(email: string, code: string): Promise<{ ok: boolean; status: number }> {
  try {
    const response = await fetch("/auth/email/verify", {
      method: "POST",
      credentials: "include",
      headers: hsClientHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ email, code }),
    });
    return { ok: response.ok, status: response.status };
  } catch { return { ok: false, status: 0 }; }
}

export function signOut(): void {
  if (typeof window === "undefined") return;
  // Drop the cached snapshot BEFORE navigating: the redirect tears this page
  // down, and a snapshot left behind would paint "signed in" on the next load
  // from a session that no longer exists.
  clearAuthCache();
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
    // The account is gone server-side; never let a stale snapshot outlive it.
    if (r.ok) clearAuthCache();
    return r.ok;
  } catch {
    return false;
  }
}
