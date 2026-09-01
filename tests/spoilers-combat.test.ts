import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { isScoreSpoiler } from "../src/lib/spoilers.ts";

// The words a fight card is actually titled with. Each of these leaked through
// before 2026-08-10 — the filter only knew "TKO", "submission" and the spelled-
// out "knocked out", none of which is how the UFC or DAZN channels write it.
test("a fight result never reads as a clean title", () => {
  for (const title of [
    "Jon Jones def. Stipe Miocic | UFC 309 Highlights",
    "Islam Makhachev stops Volkanovski in Round 1",
    "Alex Pereira KOs Jiri Prochazka",
    "Topuria KO'd Holloway | Full Fight Highlights",
    "Usyk retains undisputed crown",
    "Merab finishes O'Malley at UFC 306",
    "Ngannou starched Gane in 60 seconds",
  ]) {
    assert.equal(isScoreSpoiler(title), true, `leaked: ${title}`);
  }
});

// The combat words are broad on purpose, but they must not swallow the ordinary
// house-style titles the mask is supposed to lift for.
test("the combat words do not swallow ordinary highlight titles", () => {
  for (const title of [
    "Mets vs Braves | Game Highlights",
    "UFC 309: Jones vs Miocic | Official Weigh-in",
    "Full Fight Preview | UFC 310",
    "Bears Press Conference: Week 15",
    "Heineken Dutch Grand Prix | Race Highlights",
    "PGA Championship Round 2 Highlights",
  ]) {
    assert.equal(isScoreSpoiler(title), false, `over-hidden: ${title}`);
  }
});

// "squeak past/by/through" is the just-scraped-a-result idiom — the narrow-win
// sibling of the sneak/slip/squeeze family, which only knew "past". Each of
// these named a winner (or an advancing side) yet leaked before it was added.
test("a squeaked-out result never reads as a clean title", () => {
  for (const title of [
    "France squeak past Belgium in extra time",
    "Chiefs squeak by the Broncos",
    "Real Madrid squeaked through to the semis",
    "USA squeaks past Canada",
    "Warriors squeaking by the Nuggets",
  ]) {
    assert.equal(isScoreSpoiler(title), true, `leaked: ${title}`);
  }
});

// The mandatory past/by/through connector is what keeps the bare word safe:
// "squeak" alone must never fire on the everyday non-result uses.
test("bare 'squeak' does not swallow ordinary titles", () => {
  for (const title of [
    "Squeaky clean defense keeps it tidy",
    "Not a squeak out of the visiting bench",
    "The floorboards squeak under the sneakers",
  ]) {
    assert.equal(isScoreSpoiler(title), false, `over-hidden: ${title}`);
  }
});

// "scrape past/by/through" is the literal narrow-win idiom the squeak/sneak/
// slip/squeeze family paraphrases — the plainest way a recap title says a side
// just barely got the result. Each named a winner or an advancing side yet
// leaked before it was added.
test("a scraped-out result never reads as a clean title", () => {
  for (const title of [
    "Arsenal scrape past Palace",
    "Napoli scrape by Roma",
    "Inter scraped through to the final",
    "USA scrapes past Canada",
    "Warriors scraping by the Nuggets",
  ]) {
    assert.equal(isScoreSpoiler(title), true, `leaked: ${title}`);
  }
});

// The mandatory past/by/through connector keeps the bare word safe: "scrape" /
// "scrap" alone must never fire on the everyday non-result uses.
test("bare 'scrape' does not swallow ordinary titles", () => {
  for (const title of [
    "Scraping the barrel: worst lineups of the week",
    "How they scraped together a starting XI",
    "A scrappy first half with plenty of fouls",
  ]) {
    assert.equal(isScoreSpoiler(title), false, `over-hidden: ${title}`);
  }
});

// "claim the title/crown/trophy/…" is the coronation reveal the crowned/lift/
// hoist cluster missed — "claim" is one of the commonest title-winning verbs,
// yet each of these named the champion and leaked before it was added.
test("a claimed title never reads as a clean title", () => {
  for (const title of [
    "Spain claim the title",
    "City claim the crown",
    "Verstappen claims the championship",
    "Nadal claimed the trophy",
    "Liverpool claim silverware",
    "Yankees claim the pennant",
  ]) {
    assert.equal(isScoreSpoiler(title), true, `leaked: ${title}`);
  }
});

// The mandatory silverware object is what keeps "claim" safe: a bare "claim" is
// far too common in non-result headlines to fire on its own.
test("'claim' does not swallow non-result titles", () => {
  for (const title of [
    "Referee claims a foul in the box",
    "Club claims responsibility for the delay",
    "Star player claims he was fit to play",
    "He lays claim to the title of best ever",
  ]) {
    assert.equal(isScoreSpoiler(title), false, `over-hidden: ${title}`);
  }
});

// "golden goal" is the specific sudden-death term "sudden[- ]?death" missed: a
// golden goal ends the match the instant it's scored, so naming it reveals the
// game went the distance AND is over with a winner. Each of these leaked before
// it was added.
test("a golden goal never reads as a clean title", () => {
  for (const title of [
    "Iniesta golden goal wins it for Spain",
    "Golden goal sends France through",
    "The golden-goal that decided the final",
    "Top 10 Golden Goals in World Cup History",
  ]) {
    assert.equal(isScoreSpoiler(title), true, `leaked: ${title}`);
  }
});

// The mandatory trailing "goal" is what keeps it safe: the in-scope "Golden
// State" (Warriors/Valkyries) and "golden boot" are never followed by "goal",
// so a spoiler-free highlight naming them stays clean.
test("'golden' does not swallow non-result titles", () => {
  for (const title of [
    "Golden State Valkyries vs Aces | Full Game",
    "Golden State Warriors Full Highlights",
    "Golden Boot contenders ahead of the tournament",
  ]) {
    assert.equal(isScoreSpoiler(title), false, `over-hidden: ${title}`);
  }
});

// "overrun/overran" is the overwhelmed-in-open-play blowout verb the clobber/
// shellac/thrash/smash family missed: a side that is overrun has been swamped,
// so the word names the loser of a lopsided game. The past tense breaks the
// stem (over+ran), so it needs its own alternate. Each of these leaked before.
test("an overrun side never reads as a clean title", () => {
  for (const title of [
    "City overrun United in midfield",
    "Arsenal overran 4-1 at the Etihad",
    "Barca overran again at the Bernabeu",
    "Bayern overrunning Dortmund in the second half",
  ]) {
    assert.equal(isScoreSpoiler(title), true, `leaked: ${title}`);
  }
});

// The verb only ever describes a team being swamped in a match title; the
// non-result "overrun budget/schedule" sense never appears in a highlight
// title, and no in-scope club or nation begins with "overr".
test("'overrun' does not swallow non-result titles", () => {
  for (const title of [
    "Chiefs vs Bills | Full Game Highlights",
    "Real Madrid Training Session | Matchday -1",
  ]) {
    assert.equal(isScoreSpoiler(title), false, `over-hidden: ${title}`);
  }
});

// "pull away" is the pull-away idiom the comfortable-win family (cruise/canter/
// coast/…) missed: a side that pulls away has opened a decisive lead, so the
// phrase names the winner. Each of these leaked before it was added.
test("a pull-away lead never reads as a clean title", () => {
  for (const title of [
    "Celtics pull away late",
    "Warriors pulled away in the fourth quarter",
    "Verstappen pulls away from the field",
    "City are pulling away at the top",
    "Chiefs pull-away in the second half",
  ]) {
    assert.equal(isScoreSpoiler(title), true, `leaked: ${title}`);
  }
});

// The mandatory trailing "away" keeps the bare word safe: the everyday
// non-result "pull" uses must never fire on their own.
test("'pull' does not swallow non-result titles", () => {
  for (const title of [
    "Pull quote from the coach's presser",
    "How the Chiefs could pull off a trade",
    "Fans pull up to the stadium early",
  ]) {
    assert.equal(isScoreSpoiler(title), false, `over-hidden: ${title}`);
  }
});

// "walk it off" is the idiom form of the already-covered "walk-off": MLB and
// softball highlight titles overwhelmingly phrase a game-ending hit this way,
// and the intervening "it" slips past the bare "walk[- ]?off" entry (which needs
// walk and off adjacent). Each names the winner outright yet leaked before it
// was added.
test("a walk-it-off win never reads as a clean title", () => {
  for (const title of [
    "Yankees walk it off in the 9th",
    "Aaron Judge walks it off",
    "Astros walked it off against the Rangers",
    "WALK IT OFF! Braves stun the Mets",
    "Dodgers walking it off in extras",
  ]) {
    assert.equal(isScoreSpoiler(title), true, `leaked: ${title}`);
  }
});

// The mandatory "it off" tail keeps the bare word safe: the everyday non-result
// "walk" uses must never fire on their own.
test("'walk' does not swallow non-result titles", () => {
  for (const title of [
    "A walk in the park for the coaching staff",
    "He drew a leadoff walk to start the inning",
    "Fans walk up to the stadium early",
  ]) {
    assert.equal(isScoreSpoiler(title), false, `over-hidden: ${title}`);
  }
});

// "run rampant" is the sibling of the already-covered "run riot": the same
// one-sided-win idiom soccer/World Cup recaps lean on for a side scoring freely,
// carrying no digits when the score is dropped. Each names the dominant side yet
// leaked before "rampant" was added beside "riot" on the shared "run" anchor.
test("a run-rampant blowout never reads as a clean title", () => {
  for (const title of [
    "Liverpool run rampant at Anfield",
    "Man City ran rampant in a 5-0 win",
    "Mbappé runs rampant against Marseille",
    "Spain running rampant | World Cup Highlights",
  ]) {
    assert.equal(isScoreSpoiler(title), true, `leaked: ${title}`);
  }
});

// The mandatory trailing "rampant" keeps the bare word safe: the everyday
// non-result "run" uses must never fire on their own.
test("'run' does not swallow non-result titles", () => {
  for (const title of [
    "A great run of form heading into the playoffs",
    "Running the channels: a tactical breakdown",
    "He ran at the defence all night | Player Preview",
  ]) {
    assert.equal(isScoreSpoiler(title), false, `over-hidden: ${title}`);
  }
});

// The Cloudflare worker carries its own copy of this pattern because it masks
// titles before the page ever loads. A copy that drifts is a copy that leaks on
// exactly one of the two paths, silently — so pin them together.
test("the worker's copy of the pattern is byte-identical", () => {
  const read = (path: string) =>
    fs.readFileSync(new URL(path, import.meta.url), "utf8");
  const lib = read("../src/lib/spoilers.ts");
  const worker = read("../public/_worker.js");
  const grab = (src: string, re: RegExp) => src.match(re)?.[1] ?? null;

  // SPOILER_RX — the outcome-keyword pattern.
  const spoilerRe = /const SPOILER_RX = (\/\\b\(walk[\s\S]*?\/i);/;
  const libSpoiler = grab(lib, spoilerRe);
  const workerSpoiler = grab(worker, spoilerRe);
  assert.ok(libSpoiler, "could not find SPOILER_RX in src/lib/spoilers.ts");
  assert.ok(workerSpoiler, "could not find SPOILER_RX in public/_worker.js");
  assert.equal(workerSpoiler, libSpoiler);

  // SCORE_RX — the digit-scoreline pattern, the mask's OTHER copy. It once
  // drifted (the worker escaped the slash, `[-\/]`, where the lib did not, so
  // the "byte-identical" claim both files carry was quietly false) — pin it too
  // so the sibling copy can't diverge the way SPOILER_RX is already guarded.
  const scoreRe = /const SCORE_RX = (\/.+\/);/;
  const libScore = grab(lib, scoreRe);
  const workerScore = grab(worker, scoreRe);
  assert.ok(libScore, "could not find SCORE_RX in src/lib/spoilers.ts");
  assert.ok(workerScore, "could not find SCORE_RX in public/_worker.js");
  assert.equal(workerScore, libScore);
});
