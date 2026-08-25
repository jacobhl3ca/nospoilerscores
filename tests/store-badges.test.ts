import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

// The footer store badges are decided by three files that have to agree, and
// nothing at build time notices when they stop agreeing:
//
//   layout.tsx    an inline pre-paint script that adds the classes
//   globals.css   the rules those classes drive
//   HomeContent   the React gate that owns the badges once it knows the answer
//
// Before 2026-08-24 the gate lived only in HomeContent and started at "no app",
// which is an answer it does not have on the first paint. A signed-in account
// with the iPhone app got the whole badge row for the ~1.5s /api/me takes, then
// watched it vanish; the Play badge additionally waited on prefsHydrated, so it
// popped in ~120ms after the App Store badge and dragged the pair sideways on
// every single load. These lock in the shape of the fix.

const read = (p: string) => fs.readFileSync(new URL(p, import.meta.url), "utf8");
const layout = read("../src/app/layout.tsx");
const css = read("../src/app/globals.css");
const home = read("../src/components/HomeContent.tsx");

const HAS_APP = "hs-has-app";
const PLAY_DISMISSED = "hs-play-dismissed";
const ROW = "hs-store-badges";
const PLAY = "hs-play-badge";

test("the pre-paint script sets both classes from storage", () => {
  // One script, running before first paint, reading the two blobs that already
  // hold the answer. If it moves after hydration the badges flash again.
  const script = layout
    .split("\n")
    .find((l) => l.includes("__html:") && l.includes(HAS_APP));
  assert.ok(script, "no pre-paint script adds " + HAS_APP);

  assert.match(script!, /localStorage\.getItem\('nss-auth'\)/, "must read prefsSync's cached /api/me answer");
  assert.match(script!, /localStorage\.getItem\('nss-preferences'\)/, "must read the prefs blob");
  assert.match(script!, /platforms\.ios/, "must count iPhone app history");
  assert.match(script!, /platforms\.android/, "must count Android app history — the Play listing is public");
  assert.match(script!, /signedIn/, "only a signed-in account has usable history");
  assert.match(script!, /playBadgeDismissed/, "must honour the dismissal pre-paint");
  assert.ok(script!.includes(PLAY_DISMISSED), "must add " + PLAY_DISMISSED);
  // A throw here would take the whole document down before anything paints.
  assert.equal((script!.match(/catch\(e\)\{\}/g) || []).length, 2, "both reads must be individually guarded");
});

test("the CSS hides exactly what the script claims", () => {
  assert.match(css, new RegExp(`html\\.${HAS_APP}\\s+\\.${ROW}`), "html." + HAS_APP + " must hide ." + ROW);
  assert.match(css, new RegExp(`html\\.${PLAY_DISMISSED}\\s+\\.${PLAY}`), "html." + PLAY_DISMISSED + " must hide ." + PLAY);
});

test("the markup carries the classes the CSS targets", () => {
  // The cross-file contract. Renaming a class in one place and not the others
  // fails silently: the badges simply flash again, with no error anywhere.
  assert.ok(home.includes(`"${ROW} `), "the badge row needs the ." + ROW + " hook");
  assert.ok(home.includes(`"${PLAY} `), "the Play badge needs the ." + PLAY + " hook");
});

test("unknown is not treated as 'no app'", () => {
  // The whole bug in one line. `!appAccountUse` is true while the answer is
  // still null, which is the assertion the footer is not entitled to make.
  assert.ok(
    home.includes("appAccountUse !== true"),
    "the row must render on `appAccountUse !== true`, never on `!appAccountUse`",
  );
  assert.ok(!/!hasIosAccountUse|!appAccountUse\b/.test(home), "no boolean-negation gate may survive");
  assert.match(
    home,
    /useState<boolean \| null>\(null\)/,
    "appAccountUse must be tri-state — null means we have not been told yet",
  );
});

test("either platform counts as already having the app", () => {
  const setters = home.match(/setAppAccountUse\([^\n]*\)/g) || [];
  assert.equal(setters.length, 2, "cold launch and resume both refresh it");
  for (const s of setters) {
    assert.match(s, /platforms\?\.ios/, "iPhone history counts: " + s);
    assert.match(s, /platforms\?\.android/, "Android history counts too: " + s);
  }
});

test("the Play badge renders before prefs hydrate", () => {
  // `prefsHydrated && !dismissed` keeps it out of the static HTML entirely, so
  // it arrives a paint late and shoves the App Store badge off centre. The
  // dismissed case is covered pre-paint by the class instead.
  assert.ok(
    !home.includes("{prefsHydrated && !prefs.playBadgeDismissed"),
    "the Play badge must not be gated on prefsHydrated alone",
  );
  assert.ok(
    home.includes("{!(prefsHydrated && prefs.playBadgeDismissed)"),
    "it renders unless prefs have hydrated AND say it was dismissed",
  );
});

test("React takes both classes back once it knows", () => {
  // A stale nss-auth blob (signed out elsewhere, app deleted) must never be
  // able to keep the badges hidden with nothing left to correct it.
  assert.match(home, new RegExp(`classList\\.remove\\("${HAS_APP}"\\)`), "must drop ." + HAS_APP);
  assert.match(home, new RegExp(`classList\\.remove\\("${PLAY_DISMISSED}"\\)`), "must drop ." + PLAY_DISMISSED);
  assert.ok(home.includes("if (appAccountUse === null) return;"), "…but not while the answer is still unknown");
  assert.ok(home.includes("if (!prefsHydrated) return;"), "…and not before prefs have landed");
});
