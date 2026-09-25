import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { buildCollegeFallbackChain, type CollegeHighlightConfig } from "../src/lib/collegeHighlights.ts";

const CONFIG = JSON.parse(
  readFileSync(new URL("../src/lib/collegeHighlightChannels.json", import.meta.url), "utf8"),
) as Record<string, CollegeHighlightConfig>;
const NCAAF = CONFIG.ncaaf;
const PRIMARY = "ESPN College Football";

test("home conference first, then away, then the network", () => {
  // Ohio State (Big Ten, 5) at Texas (SEC, 8) on FOX.
  const chain = buildCollegeFallbackChain(NCAAF, PRIMARY, { conferenceId: "8" }, { conferenceId: "5" }, ["FOX"]);
  assert.deepEqual(chain.map((f) => f.channel), ["SEC", "Big Ten Football", "CFB ON FOX"]);
});

test("every fallback requires a football title token", () => {
  // The ESPN channel served an "ESPN CBB" basketball cut for ETSU–North
  // Carolina; the conference channels post basketball between the same schools.
  for (const f of buildCollegeFallbackChain(NCAAF, PRIMARY, { conferenceId: "8" }, { conferenceId: "12" }, ["CBS", "CW"])) {
    assert.ok(f.titleTokens.includes("football"), `${f.channel} has no football token`);
  }
});

test("duplicates and the primary channel drop out", () => {
  // Same conference on both sides, two FOX feeds.
  const chain = buildCollegeFallbackChain(NCAAF, PRIMARY, { conferenceId: "4" }, { conferenceId: "4" }, ["FOX", "FS1"]);
  assert.deepEqual(chain.map((f) => f.channel), ["Big 12 Conference", "CFB ON FOX"]);
});

test("unknown conferences and networks give an empty chain, not a broken one", () => {
  assert.deepEqual(buildCollegeFallbackChain(NCAAF, PRIMARY, { conferenceId: "999" }, undefined, ["ESPN+"]), []);
  assert.deepEqual(buildCollegeFallbackChain(undefined, PRIMARY, { conferenceId: "8" }, { conferenceId: "5" }, ["FOX"]), []);
});

test("volleyball finds the conference from the ESPN team id and gates on volleyball", () => {
  const NCAAVB = CONFIG.ncaavb;
  assert.equal(NCAAVB.primaryFromChain, true);
  // Nebraska (158, Big Ten) hosts Baylor (239, Big 12). ESPN's volleyball feed
  // has no conferenceId, and the app prefixes ids with the sport.
  const chain = buildCollegeFallbackChain(NCAAVB, null, { id: "ncaavb-158" }, { id: "ncaavb-239" }, []);
  assert.deepEqual(chain.map((f) => f.channel), ["Big Ten Volleyball", "Big 12 Conference"]);
  assert.ok(chain.every((f) => f.titleTokens.includes("volleyball")));
  // Two schools outside the four channel conferences: no chain, so no lookups.
  assert.deepEqual(buildCollegeFallbackChain(NCAAVB, null, { id: "ncaavb-2335" }, { id: "ncaavb-2226" }, []), []);
});

test("women's hockey lights ECAC games only, behind the women token", () => {
  const NCAAWH = CONFIG.ncaawh;
  assert.equal(NCAAWH.primaryFromChain, true);
  // Rensselaer (2528, ECAC) at Mercyhurst (2385, Atlantic Hockey America): the
  // ECAC school alone puts the game on the ECAC Hockey channel.
  const chain = buildCollegeFallbackChain(NCAAWH, null, { id: "ncaawh-2385" }, { id: "ncaawh-2528" }, []);
  assert.deepEqual(chain, [{ channel: "ECAC Hockey", titleTokens: ["women"] }]);
  // Lindenwood at Post: no lit conference, no lookups.
  assert.deepEqual(buildCollegeFallbackChain(NCAAWH, null, { id: "ncaawh-430" }, { id: "ncaawh-2815" }, []), []);
  // All twelve ECAC schools are mapped, and nothing else is.
  assert.equal(Object.keys(NCAAWH.teamConferences ?? {}).length, 12);
  assert.deepEqual(Object.values(NCAAWH.conferences), ["ECAC Hockey"]);
});

test("the women token cannot match a men's cut, and plain men would match a women's one", () => {
  // Same fold as compTitleMatches in public/_worker.js: lowercase, every
  // non-alphanumeric run becomes one space.
  const fold = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const women = fold("RPI at Mercyhurst | NCAA Women's Ice Hockey | Highlights - September 18, 2026 | #ECACHockey");
  const men = fold("Harvard at Yale | NCAA Men's Ice Hockey | Highlights - February 14, 2026 | #ECACHockey");
  assert.ok(women.includes("women"));
  assert.ok(!men.includes("women"));
  assert.ok(women.includes("men"), "why ncaah can never use a bare men token");
  assert.ok(men.includes("ncaa men") && !women.includes("ncaa men"));
});

test("efl: CBS for every game, then the home club, then the away club, all search-only", () => {
  const EFL = CONFIG.efl;
  // Bolton (358) at Norwich (381) — the 9/20 game only Norwich's channel cut.
  const chain = buildCollegeFallbackChain(EFL, "EFL", { id: "381" }, { id: "358" }, []);
  assert.deepEqual(chain.map((f) => f.channel), [
    "CBS Sports Golazo - Europe", "CBS Sports Golazo", "Norwich City Football Club", "Bolton Wanderers FC",
  ]);
  assert.ok(chain.every((f) => f.searchOnly === true));
  assert.deepEqual(chain[0].titleTokens, ["efl championship"]);
  assert.deepEqual(chain[2].titleTokens, []);
  // The app prefixes team ids with the sport; only the ESPN id is used.
  assert.equal(buildCollegeFallbackChain(EFL, "EFL", { id: "efl-385" }, undefined, [])[2].channel, "Portsmouth FC");
});

test("efl: every club channel is title-masked and has a search page; every ESPN id maps to a club", async () => {
  const HANDLES: Record<string, string> = (await import("../scripts/lib/channel-search.mjs")).CHANNEL_SEARCH_HANDLES;
  const EFL = CONFIG.efl;
  const clubs = Object.values(EFL.conferences);
  assert.equal(clubs.length, 24);
  for (const club of clubs) {
    assert.ok(EFL.maskTitle?.includes(club), `${club} not masked`);
    assert.ok(HANDLES[club], `${club} has no search handle`);
  }
  for (const key of Object.values(EFL.teamConferences ?? {})) assert.ok(EFL.conferences[key], key);
  for (const ch of EFL.always ?? []) assert.ok(HANDLES[ch], ch);
});

test("ligamx: LIGA BBVA MX behind TUDN USA, search-only and title-masked", () => {
  const chain = buildCollegeFallbackChain(CONFIG.ligamx, "TUDN USA", { id: "219" }, { id: "227" }, []);
  assert.deepEqual(chain, [{ channel: "LIGA BBVA MX", titleTokens: [], searchOnly: true }]);
  assert.deepEqual(CONFIG.ligamx.maskTitle, ["LIGA BBVA MX"]);
});

test("college chains are unchanged: no searchOnly flag", () => {
  const chain = buildCollegeFallbackChain(NCAAF, PRIMARY, { conferenceId: "8" }, { conferenceId: "5" }, ["FOX"]);
  assert.ok(chain.every((f) => !("searchOnly" in f)));
});
