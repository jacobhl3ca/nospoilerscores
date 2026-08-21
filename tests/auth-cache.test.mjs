// The Settings drawer used to paint the SIGNED-OUT account UI for the ~2s
// /api/me takes to answer for a signed-in user. prefsSync now caches the last
// known state and dedupes concurrent asks; these are the behaviours that flash
// depends on, so they get held down here.
import test from "node:test";
import assert from "node:assert/strict";

let bust = 0;

// Fresh module instance per test — the memo and in-flight promise are
// module-level state.
async function loadPrefsSync({ localStorageStore = new Map(), fetchImpl } = {}) {
  const store = localStorageStore;
  globalThis.window = {
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
    },
    location: { pathname: "/", href: "/" },
  };
  globalThis.document = { addEventListener() {} };
  globalThis.fetch = fetchImpl ?? (async () => { throw new Error("no fetch stub"); });
  bust += 1;
  const mod = await import(`../src/lib/prefsSync.ts?authcache=${bust}`);
  return { mod, store };
}

const SIGNED_IN = {
  signedIn: true,
  email: "someone@privaterelay.appleid.com",
  providers: { apple: true, google: true, email: true },
  uid: "abc123",
  provider: "apple",
  linkedProviders: ["apple"],
};

function jsonOnce(body, { ok = true, status = 200 } = {}) {
  const calls = { count: 0 };
  const impl = async () => {
    calls.count += 1;
    return { ok, status, json: async () => body };
  };
  return { impl, calls };
}

test("concurrent callers share ONE /api/me request", async () => {
  const { impl, calls } = jsonOnce(SIGNED_IN);
  const { mod } = await loadPrefsSync({ fetchImpl: impl });
  const [a, b, c] = await Promise.all([mod.getAuthState(), mod.getAuthState(), mod.getAuthState()]);
  assert.equal(calls.count, 1, "three callers must collapse into one request");
  assert.equal(a.signedIn, true);
  assert.equal(b.email, SIGNED_IN.email);
  assert.equal(c.provider, "apple");
});

test("a recent answer is reused instead of re-asked", async () => {
  const { impl, calls } = jsonOnce(SIGNED_IN);
  const { mod } = await loadPrefsSync({ fetchImpl: impl });
  await mod.getAuthState();
  await mod.getAuthState();
  assert.equal(calls.count, 1, "the second ask is inside the freshness window");
  await mod.getAuthState(true);
  assert.equal(calls.count, 2, "force must bypass the memo");
});

test("a signed-in answer is snapshotted for the next page load", async () => {
  const { impl } = jsonOnce(SIGNED_IN);
  const store = new Map();
  const { mod } = await loadPrefsSync({ fetchImpl: impl, localStorageStore: store });
  await mod.getAuthState();
  assert.ok(store.has("nss-auth"), "the snapshot must survive this page");

  // A brand new page load with the same localStorage: the panel can paint the
  // signed-in state on its first frame, before any network.
  const { mod: fresh } = await loadPrefsSync({ localStorageStore: store });
  const cached = fresh.cachedAuthState();
  assert.equal(cached?.signedIn, true);
  assert.equal(cached?.email, SIGNED_IN.email);
});

test("a network failure does NOT look like a sign-out", async () => {
  const { impl } = jsonOnce(SIGNED_IN);
  const store = new Map();
  const { mod } = await loadPrefsSync({ fetchImpl: impl, localStorageStore: store });
  await mod.getAuthState();

  let attempts = 0;
  const { mod: offline } = await loadPrefsSync({
    localStorageStore: store,
    fetchImpl: async () => { attempts += 1; throw new Error("offline"); },
  });
  const state = await offline.getAuthState();
  assert.equal(state.signedIn, true, "fall back to the last known state, don't assert signed-out");
  assert.ok(store.has("nss-auth"), "a blip must not wipe the snapshot");
  await offline.getAuthState();
  assert.equal(attempts, 2, "a failure must not be memoized — the next caller retries");
});

test("a real signed-out answer clears the snapshot", async () => {
  const { impl } = jsonOnce(SIGNED_IN);
  const store = new Map();
  const { mod } = await loadPrefsSync({ fetchImpl: impl, localStorageStore: store });
  await mod.getAuthState();

  const { impl: outImpl } = jsonOnce({ signedIn: false, email: null, providers: { apple: true, google: true, email: true } });
  const { mod: after } = await loadPrefsSync({ fetchImpl: outImpl, localStorageStore: store });
  const state = await after.getAuthState();
  assert.equal(state.signedIn, false);
  assert.equal(store.has("nss-auth"), false, "the session really is gone");
  // Still non-null: we now KNOW they're signed out, which is a real answer and
  // should paint the sign-in buttons at once. null is reserved for "no idea".
  assert.equal(after.cachedAuthState()?.signedIn, false);
});

test("signOut clears the snapshot before it navigates away", async () => {
  const { impl } = jsonOnce(SIGNED_IN);
  const store = new Map();
  const { mod } = await loadPrefsSync({ fetchImpl: impl, localStorageStore: store });
  await mod.getAuthState();
  assert.ok(store.has("nss-auth"));
  mod.signOut();
  assert.equal(store.has("nss-auth"), false, "otherwise the next load paints a dead session as signed in");
  assert.equal(globalThis.window.location.href, "/auth/logout");
});
