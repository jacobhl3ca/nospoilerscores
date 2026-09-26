import assert from "node:assert/strict";
import test from "node:test";

import { TEAM_PICKER_SKIP, logoForTeam, logoOverride, isPlaceholderTeam, ncaaSchoolLogo } from "../src/lib/teamLogos.ts";
import { LOGO_OVERRIDES, ncaaComLogo } from "../src/lib/teamLogoOverrides.ts";

test("individual-competitor sports never get a team tab", () => {
  for (const s of ["golf", "tennis", "poker", "chess", "boxing", "ufc", "f1", "nascar", "indycar"] as const) {
    assert.ok(TEAM_PICKER_SKIP.includes(s), `${s} should be skipped`);
  }
  // Team sports that DO have lists stay in.
  for (const s of ["nfl", "cricket", "llws", "sixnations", "ncaabase", "cfl"] as const) {
    assert.ok(!TEAM_PICKER_SKIP.includes(s), `${s} should stay in the picker`);
  }
});

test("every college sport with school ids uses the school logo", () => {
  // NCAAF + NCAAW were missing here until 2026-09-25: 1,124 teams, no logos.
  for (const s of ["ncaam", "ncaaw", "ncaaf", "ncaah", "ncaawh", "ncaavb"] as const) {
    assert.equal(logoForTeam(s, "2", "AUB"), ncaaSchoolLogo("2"));
  }
  assert.equal(ncaaSchoolLogo("333"), "https://a.espncdn.com/i/teamlogos/ncaa/500/333.png");
});

test("college diamond sports use the guid, and nothing without one", () => {
  assert.equal(
    logoForTeam("ncaabase", "148", "ALA", "04c5d4b5-21f5-3580-9b69-b97224bf2ffb"),
    "https://a.espncdn.com/guid/04c5d4b5-21f5-3580-9b69-b97224bf2ffb/logos/default.png",
  );
  assert.equal(logoForTeam("ncaasoft", "114", "TEM"), undefined);
});

test("all six rugby leagues share the rugby team path", () => {
  for (const s of ["sixnations", "rugbywc", "rugbychamp", "superrugby", "rugbytest", "nationschamp"] as const) {
    assert.equal(logoForTeam(s, "3", "IRE"), "https://a.espncdn.com/i/teamlogos/rugby/teams/500/3.png");
  }
});

test("Little League gets the flag ESPN's scoreboard draws", () => {
  const flag = (code: string) => `https://a.espncdn.com/i/teamlogos/countries/500/${code}.png`;
  assert.equal(logoForTeam("llws", "1041", "AUS"), flag("AUS"));
  assert.equal(logoForTeam("llws", "1", "NCA"), flag("NCA")); // Nicaragua, not N. California
  assert.equal(logoForTeam("llws", "1", "PUR"), flag("PUR"));
  assert.equal(logoForTeam("llws", "1", "PR"), flag("PUR"));
  // US regionals: states, "N CA", "NCAL", "TXW", DC, "WS" (Kenosha WS).
  for (const us of ["MA", "N CA", "NCAL", "TXW", "DC", "WS"]) {
    assert.equal(logoForTeam("llws", "1", us), flag("usa"), us);
  }
  // Curaçao has no flag on ESPN's CDN under any code.
  for (const cw of ["CW", "CUW", "CUR", "TBD", ""]) assert.equal(logoForTeam("llws", "1", cw), undefined, cw);
});

test("major US leagues key on abbreviation, soccer + cricket on id", () => {
  assert.equal(logoForTeam("nba", "8", "DET"), "https://a.espncdn.com/i/teamlogos/nba/500/det.png");
  assert.equal(logoForTeam("nfl", "1", ""), undefined);
  assert.equal(logoForTeam("facup", "645", "TAM"), "https://a.espncdn.com/i/teamlogos/soccer/500/645.png");
  assert.equal(logoForTeam("cricket", "335978", "MI"), "https://a.espncdn.com/i/teamlogos/cricket/500/335978.png");
  assert.equal(logoForTeam("f1", "106893", "LP"), undefined);
});

test("bracket placeholders are not teams", () => {
  assert.ok(isPlaceholderTeam("-1", "TBD"));
  assert.ok(isPlaceholderTeam("131554", "TBD Away"));
  assert.ok(isPlaceholderTeam("131556", "TBD Home"));
  assert.ok(isPlaceholderTeam("999", "tbd"));
  assert.ok(!isPlaceholderTeam("610", "Seattle University"));
  assert.ok(!isPlaceholderTeam("1", "TBDs United")); // a real name that merely starts with the letters
});

test("teams ESPN has no art for get the override, keyed per sport", () => {
  // Maryville (Mo): no logo on the hockey event, and ncaa/500/132633 404s.
  assert.equal(logoForTeam("ncaah", "132633", "MAR"), ncaaComLogo("maryville-mo"));
  assert.equal(logoOverride("ncaah", "132633"), ncaaComLogo("maryville-mo"));
  // 133847 is Missouri S&T in volleyball but an amateur club in the Copa del
  // Rey — the sport in the key keeps one from taking the other's logo.
  assert.equal(logoOverride("ncaavb", "133847"), ncaaComLogo("missouri-snt"));
  assert.equal(logoOverride("copadelrey", "133847"), undefined);
  assert.equal(logoForTeam("copadelrey", "133847", "ACA"), "https://a.espncdn.com/i/teamlogos/soccer/500/133847.png");
  // Everyone else still follows the CDN convention.
  assert.equal(logoForTeam("ncaah", "2779", "USL"), ncaaSchoolLogo("2779"));
});

test("every override key is a real sport + numeric id and every value is https", () => {
  for (const [key, url] of Object.entries(LOGO_OVERRIDES)) {
    assert.match(key, /^(ncaah|ncaawh|ncaavb|ncaam|ncaaw|ncaaf|ncaabase|ncaasoft|saudi)-\d+$/, key);
    assert.match(url, /^https:\/\//, key);
  }
});
