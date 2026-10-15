import assert from "node:assert/strict";
import test from "node:test";

import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { LOGO_REPLACE, TEAM_PICKER_SKIP, darkTeamLogo, fixTeamLogo, logoForTeam, logoOverride, isPlaceholderTeam, ncaaSchoolLogo, sizedTeamLogo } from "../src/lib/teamLogos.ts";
import { LOGO_OVERRIDES, ncaaComLogo } from "../src/lib/teamLogoOverrides.ts";

const PUBLIC = join(dirname(fileURLToPath(import.meta.url)), "..", "public");

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

test("every override key is a real sport + numeric id and every value is https or a shipped file", () => {
  for (const [key, url] of Object.entries(LOGO_OVERRIDES)) {
    assert.match(key, /^(ncaah|ncaawh|ncaavb|ncaam|ncaaw|ncaaf|ncaabase|ncaasoft|ncaamsoc|ncaawsoc|saudi|top14|challengecup|premrugby|rugbychamp)-\d+$/, key);
    if (url.startsWith("/")) assert.ok(existsSync(join(PUBLIC, url)), `${key}: public${url} missing`);
    else assert.match(url, /^https:\/\//, key);
  }
});

test("fixTeamLogo swaps every ESPN copy of the blue-only Rams mark", () => {
  for (const url of [
    "https://a.espncdn.com/i/teamlogos/nfl/500/lar.png",
    "https://a.espncdn.com/i/teamlogos/nfl/500/scoreboard/lar.png",
    "https://a.espncdn.com/i/teamlogos/nfl/500-dark/lar.png",
    "https://a.espncdn.com/i/teamlogos/nfl/500-dark/scoreboard/lar.png",
    "https://a.espncdn.com/combiner/i?img=/i/teamlogos/nfl/500/lar.png&w=48&h=48",
  ]) {
    assert.equal(fixTeamLogo(url), "/logos/nfl-lar.svg", url);
  }
  assert.equal(fixTeamLogo("https://a.espncdn.com/i/teamlogos/rugby/teams/500/25906.png"), "/logos/rugby-newcastle-red-bulls.png");
});

test("fixTeamLogo leaves every other logo alone", () => {
  for (const url of [
    "https://a.espncdn.com/i/teamlogos/nfl/500/lac.png", // Chargers, same stadium
    "https://a.espncdn.com/i/teamlogos/nba/500/lal.png",
    "https://a.espncdn.com/i/teamlogos/rugby/teams/500/25907.png",
    ncaaComLogo("spalding"),
    "/logos/rugby-bayonne.svg",
  ]) {
    assert.equal(fixTeamLogo(url), url);
  }
  assert.equal(fixTeamLogo(""), "");
  assert.equal(fixTeamLogo(null), null);
  assert.equal(fixTeamLogo(undefined), undefined);
});

test("every LOGO_REPLACE target ships in public/", () => {
  for (const [key, path] of Object.entries(LOGO_REPLACE)) {
    assert.ok(path.startsWith("/logos/"), key);
    assert.ok(existsSync(join(PUBLIC, path)), `public${path} missing`);
  }
});

test("dark theme loads ESPN's 500-dark copy, and nothing for art with none", () => {
  const espn = "https://a.espncdn.com/i/teamlogos";
  assert.equal(darkTeamLogo(`${espn}/ncaa/500/2294.png`), `${espn}/ncaa/500-dark/2294.png`); // Iowa
  assert.equal(darkTeamLogo(`${espn}/mlb/500/scoreboard/nyy.png`), `${espn}/mlb/500-dark/scoreboard/nyy.png`);
  assert.equal(darkTeamLogo(`${espn}/soccer/500/111.png`), `${espn}/soccer/500-dark/111.png`); // Juventus
  assert.equal(darkTeamLogo(`${espn}/rugby/teams/500/25906.png`), `${espn}/rugby/teams/500-dark/25906.png`);
  // ESPN has no dark copy for cricket or AFL (404, 2026-10-14).
  assert.equal(darkTeamLogo(`${espn}/cricket/500/335978.png`), undefined);
  assert.equal(darkTeamLogo(`${espn}/afl/500/coll.png`), undefined);
  // Self-hosted, NCAA.com, guid, already-dark and FotMob art load as they are.
  for (const url of [
    "/logos/nfl-lar.svg",
    ncaaComLogo("spalding"),
    "https://a.espncdn.com/guid/04c5d4b5-21f5-3580-9b69-b97224bf2ffb/logos/default.png",
    `${espn}/nfl/500-dark/buf.png`,
    "https://images.fotmob.com/image_resources/logo/teamlogo/205687.png",
    "https://www.mlbstatic.com/team-logos/147.svg",
  ]) {
    assert.equal(darkTeamLogo(url), undefined, url);
  }
  // The fixed Rams never gets ESPN's blue-only dark copy back.
  assert.equal(darkTeamLogo(fixTeamLogo(`${espn}/nfl/500/lar.png`)), undefined);
});

test("an ESPN team logo loads through the combiner at 2× its drawn size", () => {
  const espn = "https://a.espncdn.com/i/teamlogos";
  const combiner = (path: string, side: number) =>
    `https://a.espncdn.com/combiner/i?img=/i/teamlogos/${path}&w=${side}&h=${side}&transparent=true`;
  assert.equal(sizedTeamLogo(`${espn}/ncaa/500/2294.png`, 24), combiner("ncaa/500/2294.png", 48));
  // The dark copy keeps its path, so dark mode stays dark.
  assert.equal(sizedTeamLogo(`${espn}/ncaa/500-dark/2294.png`, 16), combiner("ncaa/500-dark/2294.png", 32));
  assert.equal(sizedTeamLogo(`${espn}/nfl/500/scoreboard/buf.png`, 22), combiner("nfl/500/scoreboard/buf.png", 44));
  // Other hosts, self-hosted art, an unknown size and an already-sized URL pass through.
  for (const url of [
    "/logos/nfl-lar.svg",
    ncaaComLogo("spalding"),
    "https://a.espncdn.com/guid/04c5d4b5-21f5-3580-9b69-b97224bf2ffb/logos/default.png",
    "https://images.fotmob.com/image_resources/logo/teamlogo/205687.png",
    "https://www.mlbstatic.com/team-logos/147.svg",
    combiner("mlb/500/nyy.png", 48),
  ]) {
    assert.equal(sizedTeamLogo(url, 24), url, url);
  }
  assert.equal(sizedTeamLogo(`${espn}/mlb/500/nyy.png`, 0), `${espn}/mlb/500/nyy.png`);
});
