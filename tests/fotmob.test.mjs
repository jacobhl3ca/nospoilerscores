import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

import {
  FOTMOB_LEAGUES,
  fotmobLeaguePath,
  parseFotmobNextData,
  fotmobFixtures,
  fotmobHighlightVideoId,
  teamsMatch,
  findFotmobFixture,
  gateFotmobVideo,
  titlePrintsScore,
} from "../scripts/lib/fotmob.mjs";
import { parseWatchPagePlayable } from "../scripts/lib/recaps.mjs";

// Trimmed from the live pages on 2026-09-23 (La Liga matchday 7): same script
// tag, same paths, only the fields the bake reads.
const LEAGUE_HTML = readFileSync(new URL("./fixtures/fotmob/fotmob-league-laliga.html", import.meta.url), "utf8");
const MATCH_HTML = readFileSync(new URL("./fixtures/fotmob/fotmob-match-getafe-malaga.html", import.meta.url), "utf8");

test("league page: finished fixtures only, fragment stripped from the path", () => {
  const fixtures = fotmobFixtures(parseFotmobNextData(LEAGUE_HTML));
  assert.equal(fixtures.length, 3);
  const getafe = fixtures.find((f) => f.id === "5868076");
  assert.deepEqual(
    { path: getafe.path, home: getafe.home, away: getafe.away, utcMs: getafe.utcMs },
    { path: "/matches/getafe-vs-malaga/2qa4v1", home: "Getafe", away: "Málaga", utcMs: Date.parse("2026-09-20T12:00:00Z") },
  );
});

test("match page: the YouTube id FotMob links, never the thumbnail", () => {
  assert.equal(fotmobHighlightVideoId(parseFotmobNextData(MATCH_HTML)), "VLO0aPib4SU");
});

test("a match page without highlights, a non-YouTube link or broken JSON gives null", () => {
  const page = (highlights) => ({ props: { pageProps: { content: { matchFacts: { highlights } } } } });
  assert.equal(fotmobHighlightVideoId(page(undefined)), null);
  assert.equal(fotmobHighlightVideoId(page(null)), null);
  assert.equal(fotmobHighlightVideoId(page({ url: "https://www.dailymotion.com/video/x8abc" })), null);
  assert.equal(fotmobHighlightVideoId(page({ url: "https://youtu.be/VLO0aPib4SU" })), "VLO0aPib4SU");
  assert.equal(parseFotmobNextData("<html>no data</html>"), null);
  assert.equal(parseFotmobNextData('<script id="__NEXT_DATA__" type="application/json">{broken</script>'), null);
  assert.deepEqual(fotmobFixtures(null), []);
});

test("FotMob spellings match ESPN's names", () => {
  // Nottm Forest comes through the worker's alias list, the rest by words.
  assert.ok(teamsMatch("Nottm Forest", "Nottingham Forest", ["nottm forest", "nottingham forest", "nottingham"]));
  assert.ok(teamsMatch("Brighton", "Brighton & Hove Albion"));
  assert.ok(teamsMatch("Denver Summit", "Denver Summit FC (W)"));
  assert.ok(teamsMatch("Alavés", "Deportivo Alavés"));
  assert.ok(teamsMatch("Bodo/Glimt", "Bodø/Glimt"));
  assert.ok(teamsMatch("Getafe", "Getafe CF"));
  // Missed fixtures on the 2026-09-23 dry run, now bridged by NAME_ALIASES.
  assert.ok(teamsMatch("UNAM", "Pumas"));
  assert.ok(teamsMatch("Atl. San Luis", "Atlético de San Luis"));
  assert.ok(teamsMatch("Cologne", "1. FC Köln"));
  assert.ok(teamsMatch("Boro", "Middlesbrough"));
  assert.ok(teamsMatch("Sheffield Utd", "Sheffield United"));
  assert.ok(teamsMatch("Union SG", "Union St.Gilloise"));
  assert.ok(!teamsMatch("Real Madrid", "Real Betis"));
  assert.ok(!teamsMatch("Man City", "Manchester United"));
});

test("a fixture needs both teams inside a day of the ESPN kickoff", () => {
  const fixtures = fotmobFixtures(parseFotmobNextData(LEAGUE_HTML));
  const hit = findFotmobFixture(fixtures, { away: "Málaga", home: "Getafe", dateIso: "2026-09-20T12:00Z" });
  assert.equal(hit?.id, "5868076");
  // ESPN flipped home and away: still the same match.
  assert.equal(findFotmobFixture(fixtures, { away: "Getafe", home: "Málaga", dateIso: "2026-09-20T12:00Z" })?.id, "5868076");
  // Same pair, a week off: not this fixture.
  assert.equal(findFotmobFixture(fixtures, { away: "Málaga", home: "Getafe", dateIso: "2026-09-27T12:00Z" }), null);
  // One team right, the other wrong.
  assert.equal(findFotmobFixture(fixtures, { away: "Levante", home: "Getafe", dateIso: "2026-09-20T12:00Z" }), null);
});

test("two qualifying fixtures are ambiguous, so neither is used", () => {
  const f = (id, home, away) => ({ id, path: `/matches/${id}`, home, away, utcMs: Date.parse("2026-09-20T12:00:00Z") });
  const fixtures = [f("1", "Paris Saint-Germain", "Lens"), f("2", "Paris FC", "Lens")];
  assert.equal(findFotmobFixture(fixtures, { away: "Lens", home: "Paris", dateIso: "2026-09-20T12:00Z" }), null);
});

const yes = async () => true;
const no = async () => false;

test("gate order: oEmbed 401 rejects before any other check", async () => {
  let laterChecked = false;
  const later = async () => { laterChecked = true; return true; };
  const verdict = await gateFotmobVideo("abcdefghijk", {
    oembedMeta: async () => null, // what hlOembedMeta returns on a 401 (embedding off)
    embeddable: later,
    matchesTeams: later,
    matchesDate: later,
  });
  assert.deepEqual(verdict, { ok: false, reason: "oembed" });
  assert.equal(laterChecked, false);
});

test("gate: embed-blocked but playable on youtube.com is kept for the hand-off (LALIGA EA SPORTS, 2026-09-25)", async () => {
  const meta = async () => ({ title: "RESUMEN Y GOLES | GETAFE CF 1-0 MÁLAGA CF", author: "LALIGA EA SPORTS" });
  assert.deepEqual(
    await gateFotmobVideo("VLO0aPib4SU", { oembedMeta: meta, embeddable: no, watchable: yes, matchesTeams: yes, matchesDate: yes }),
    { ok: true, channel: "LALIGA EA SPORTS", embedBlocked: true, titleScore: true },
  );
  const clean = async () => ({ title: "Highlights | Pompey v Blackburn", author: "Portsmouth FC" });
  assert.deepEqual(
    await gateFotmobVideo("x", { oembedMeta: clean, embeddable: no, watchable: yes, matchesTeams: yes, matchesDate: yes }),
    { ok: true, channel: "Portsmouth FC", embedBlocked: true },
  );
  // A blocked clip still has to pass the team and date gates.
  assert.deepEqual(await gateFotmobVideo("x", { oembedMeta: meta, embeddable: no, watchable: yes, matchesTeams: no, matchesDate: yes }), { ok: false, reason: "teams" });
});

test("gate: embed-blocked and not playable in the US either is rejected (TUDN Liga MX, 2026-09-25)", async () => {
  const meta = async () => ({ title: "RESUMEN Y GOLES I América vs Chivas | Liga MX", author: "TUDN México" });
  assert.deepEqual(await gateFotmobVideo("NxpKQ-JYkvk", { oembedMeta: meta, embeddable: no, watchable: no, matchesTeams: yes, matchesDate: yes }), { ok: false, reason: "embed" });
  assert.deepEqual(await gateFotmobVideo("NxpKQ-JYkvk", { oembedMeta: meta, embeddable: no, watchable: async () => null, matchesTeams: yes, matchesDate: yes }), { ok: false, reason: "embed" });
  assert.deepEqual(await gateFotmobVideo("NxpKQ-JYkvk", { oembedMeta: meta, embeddable: no, matchesTeams: yes, matchesDate: yes }), { ok: false, reason: "embed" });
});

test("gate: an unknown embed verdict is rejected without asking youtube.com", async () => {
  const meta = async () => ({ title: "Bolton vs Norwich City", author: "Norwich City Football Club" });
  let asked = false;
  const watchable = async () => { asked = true; return true; };
  assert.deepEqual(await gateFotmobVideo("x", { oembedMeta: meta, embeddable: async () => null, watchable, matchesTeams: yes, matchesDate: yes }), { ok: false, reason: "embed" });
  assert.equal(asked, false);
});

test("titlePrintsScore: a result between two numbers, not years or matchdays", () => {
  for (const t of ["GETAFE CF 1 - 0 MÁLAGA CF | RESUMEN LALIGA EA SPORTS", "TOULOUSE FC - HAVRE AC (2-1) | Week 5 - Ligue 1 McDonald's 26/27", "Stoke City 1–2 Sheffield United"]) {
    assert.equal(titlePrintsScore(t), true, t);
  }
  for (const t of ["ROMA-INTER | HIGHLIGHTS | Serie A 2026/27", "HAMBURGER SV - 1. FC KÖLN | Highlights | Matchday 4 – Bundesliga", "Season 2026-27 preview", "Highlights 🔵 | Pompey v Blackburn"]) {
    assert.equal(titlePrintsScore(t), false, t);
  }
});

test("parseWatchPagePlayable: OK plays, UNPLAYABLE (US geo block) does not, no status is unknown", () => {
  assert.equal(parseWatchPagePlayable('var ytInitialPlayerResponse = {"playabilityStatus":{"status":"OK","playableInEmbed":true}};'), true);
  assert.equal(parseWatchPagePlayable('{"playabilityStatus":{"status":"UNPLAYABLE","reason":"Video unavailable"}}'), false);
  assert.equal(parseWatchPagePlayable("<html>google.com/sorry</html>"), null);
});

test("gate: wrong teams and an old upload are rejected, a clean clip keeps its uploader", async () => {
  const meta = async () => ({ title: "Bolton vs Norwich City", author: "Norwich City Football Club" });
  assert.deepEqual(await gateFotmobVideo("x", { oembedMeta: meta, embeddable: yes, matchesTeams: no, matchesDate: yes }), { ok: false, reason: "teams" });
  assert.deepEqual(await gateFotmobVideo("x", { oembedMeta: meta, embeddable: yes, matchesTeams: yes, matchesDate: no }), { ok: false, reason: "date" });
  assert.deepEqual(await gateFotmobVideo("x", { oembedMeta: meta, embeddable: yes, matchesTeams: yes, matchesDate: yes }), { ok: true, channel: "Norwich City Football Club" });
});

test("every FotMob league is a baked soccer league with a page path", () => {
  const bake = readFileSync(new URL("../scripts/prebake-news.mjs", import.meta.url), "utf8");
  for (const sport of Object.keys(FOTMOB_LEAGUES)) {
    assert.ok(bake.includes(`{ sport: "${sport}",`), `${sport} is not in HL_LEAGUES`);
    assert.match(fotmobLeaguePath(sport), /^\/leagues\/\d+\/overview\/[a-z0-9-]+$/);
  }
  assert.equal(fotmobLeaguePath("nba"), null);
});
