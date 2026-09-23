import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import worker from "../public/_worker.js";

// A `returnTo` / OAuth-state `r` value only ever has to be safe to put in a
// same-site redirect Location. "//evil.com" and "/\evil.com" both pass a bare
// `startsWith("/")` check but browsers treat them as scheme-relative and will
// navigate off-site — that was the open redirect. All six call sites now
// route through one shared `_safeReturnTo` helper instead of a bespoke check.

const src = readFileSync(new URL("../public/_worker.js", import.meta.url), "utf8");

function loadSafeReturnTo() {
  const m = src.match(/function _safeReturnTo\([\s\S]*?\n\}/);
  assert.ok(m, "_safeReturnTo helper not found in public/_worker.js");
  const fn = new Function(`${m[0]}\nreturn _safeReturnTo;`)();
  return fn;
}

test("_safeReturnTo rejects protocol-relative and backslash payloads", () => {
  const safeReturnTo = loadSafeReturnTo();
  assert.equal(safeReturnTo("//evil.com"), "/");
  assert.equal(safeReturnTo("/\\evil.com"), "/");
  // still rejects the plain non-"/"-prefixed cases the old check also caught
  assert.equal(safeReturnTo("https://evil.com"), "/");
  assert.equal(safeReturnTo("evil.com"), "/");
  assert.equal(safeReturnTo(""), "/");
  assert.equal(safeReturnTo(null), "/");
  // legitimate same-site paths still pass through untouched
  assert.equal(safeReturnTo("/"), "/");
  assert.equal(safeReturnTo("/settings?tab=account"), "/settings?tab=account");
});

// Decode the same way `url.searchParams.get(...)` decodes a query value, so
// these tests exercise the exact string _safeReturnTo receives at runtime.
function decodeLikeSearchParams(rawQueryValue) {
  return new URL(`https://hidescore.com/?returnTo=${rawQueryValue}`).searchParams.get("returnTo");
}

test("_safeReturnTo rejects control characters (tab/newline) and embedded backslashes", () => {
  const safeReturnTo = loadSafeReturnTo();

  // /%09/evil.com -> "/" + TAB + "/evil.com" -- browsers strip the TAB and
  // land on //evil.com, i.e. https://evil.com/.
  assert.equal(decodeLikeSearchParams("%2F%09%2Fevil.com"), "/\t/evil.com");
  assert.equal(safeReturnTo("/\t/evil.com"), "/");

  // /%0a/evil.com -- the raw LF used to reach `new Headers()` and throw a 500.
  assert.equal(decodeLikeSearchParams("%2F%0A%2Fevil.com"), "/\n/evil.com");
  assert.equal(safeReturnTo("/\n/evil.com"), "/");

  // /%09%5Cevil.com -- TAB immediately followed by a backslash.
  assert.equal(decodeLikeSearchParams("%2F%09%5Cevil.com"), "/\t\\evil.com");
  assert.equal(safeReturnTo("/\t\\evil.com"), "/");
});

test("_safeReturnTo requires the resolved origin to stay same-site", () => {
  const safeReturnTo = loadSafeReturnTo();
  assert.equal(safeReturnTo("/\t/evil.com"), "/");
  assert.equal(safeReturnTo("/settings"), "/settings");
});

test("all 6 returnTo/st.r call sites route through _safeReturnTo, not a bare startsWith(\"/\")", () => {
  const codeLines = src.split("\n").filter((l) => !l.trim().startsWith("//"));
  const code = codeLines.join("\n");
  // only the check inside _safeReturnTo's own definition should remain
  const guardSites = code.match(/startsWith\("\/"\)/g) || [];
  assert.equal(guardSites.length, 1);
  // 6 call sites: siwaLogin, siwaCallback Location, googleLogin,
  // googleCallback native-handoff returnTo, googleCallback Location,
  // googleNativeComplete JSON echo.
  const callLines = codeLines.filter((l) => l.includes("_safeReturnTo(") && !l.includes("function _safeReturnTo"));
  assert.equal(callLines.length, 6);
});

const stubEnv = () => ({
  APPLE_SERVICES_ID: "com.example.services",
  APPLE_TEAM_ID: "TEAM123456",
  APPLE_KEY_ID: "KEY1234567",
  APPLE_PRIVATE_KEY: "dummy",
  GOOGLE_CLIENT_ID: "dummy-client-id",
  GOOGLE_CLIENT_SECRET: "dummy-secret",
  SESSION_SECRET: "test-session-secret",
  ASSETS: { async fetch() { return new Response("STATIC", { status: 404 }); } },
});

function decodeStateReturnTo(location) {
  const state = new URL(location).searchParams.get("state");
  const stateBody = state.slice(0, state.lastIndexOf("."));
  const padded = stateBody.replace(/-/g, "+").replace(/_/g, "/");
  const json = Buffer.from(padded, "base64").toString("utf8");
  return JSON.parse(json).r;
}

for (const [label, path] of [["Apple", "/auth/apple/login"], ["Google", "/auth/google/login"]]) {
  test(`${label} login never signs a protocol-relative returnTo into the OAuth state`, async () => {
    const evil = await worker.fetch(
      new Request(`https://hidescore.com${path}?returnTo=${encodeURIComponent("//evil.com")}`),
      stubEnv(),
    );
    assert.equal(evil.status, 302);
    assert.equal(decodeStateReturnTo(evil.headers.get("Location")), "/");

    const evilBackslash = await worker.fetch(
      new Request(`https://hidescore.com${path}?returnTo=${encodeURIComponent("/\\evil.com")}`),
      stubEnv(),
    );
    assert.equal(evilBackslash.status, 302);
    assert.equal(decodeStateReturnTo(evilBackslash.headers.get("Location")), "/");

    const legit = await worker.fetch(
      new Request(`https://hidescore.com${path}?returnTo=${encodeURIComponent("/settings")}`),
      stubEnv(),
    );
    assert.equal(decodeStateReturnTo(legit.headers.get("Location")), "/settings");
  });

  test(`${label} login: control-char returnTo payloads neither bypass the guard nor 500`, async () => {
    for (const encodedPayload of ["%2F%09%2Fevil.com", "%2F%0A%2Fevil.com", "%2F%09%5Cevil.com"]) {
      const res = await worker.fetch(
        new Request(`https://hidescore.com${path}?returnTo=${encodedPayload}`),
        stubEnv(),
      );
      assert.equal(res.status, 302);
      assert.equal(decodeStateReturnTo(res.headers.get("Location")), "/");
    }
  });
}
