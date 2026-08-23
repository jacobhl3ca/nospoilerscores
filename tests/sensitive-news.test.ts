import assert from "node:assert/strict";
import test from "node:test";

import { sensitiveCategoryOf, enabledCategories } from "../src/lib/sensitiveNews.ts";

// ── Real events the filter must catch ────────────────────────────────────────

const SENSITIVE: [string, string][] = [
  ["Former NBA star dies at 58 after long illness", "death"],
  ["Racing world mourns driver killed in practice crash", "death"],
  ["Tributes pour in after tragic accident at the circuit", "death"],
  ["Club releases statement on the passing of its longtime scout", "death"],
  ["Quarterback arrested on domestic violence charge", "violence"],
  ["Lawsuit alleging sexual assault filed against former coach", "violence"],
  ["Two hurt in a shooting outside the stadium", "violence"],
  ["Pitcher charged with DUI after early-morning stop", "violence"],
  ["Hall of Famer diagnosed with pancreatic cancer", "medical"],
  ["Midfielder collapsed on the pitch, taken to hospital", "medical"],
  ["Defenseman in critical condition after skate cut", "medical"],
  ["Two horses euthanized after breakdowns on the card", "animal"],
  ["Owner banned for life over animal cruelty conviction", "animal"],
  ["Teammates open up a year after his suicide", "selfharm"],
  ["Wade Meckler is hit in the head by a pitch and forced to leave the game", "injury"],
  ["Catcher carted off after a violent collision at the plate", "injury"],
  ["Pitcher struck by a line drive, bloodied on the mound", "injury"],
  ["Winger placed in concussion protocol after a helmet-to-helmet hit", "injury"],
  ["Fan struck by a foul ball taken to hospital", "injury"],
  ["Moment of silence for a fan who was killed by an ICE agent", "death"],
  ["Statement from the family on what caused his death", "death"],
  ["Knicks fans who attacked a Spurs fan get lifetime bans", "violence"],
  ["Team statement regarding online abuse directed at the rookie", "violence"],
  ["Star was held at gunpoint outside the arena", "violence"],
  ["Ex-coach detained by police, turned over for investigation", "violence"],
  ["Fighter talks about the illegal blows to the back of the head", "injury"],
  ["Rookie in hospital after dislocating his ankle", "injury"],
  ["Defensive tackle spits on the quarterback and is ejected", "violence"],
  ["Star pitcher opens up about his overdose", "selfharm"],
];

for (const [headline, category] of SENSITIVE) {
  test(`flags: ${headline}`, () => {
    assert.equal(sensitiveCategoryOf(headline), category);
  });
}

// ── Sports idiom the filter must NOT catch ──────────────────────────────────
// These are the whole reason for the idiom strip: every one of them would trip
// a naive keyword list and quietly gut the feed.

const SAFE = [
  "Shooting guard drops 40 in a road win",
  "Cold shooting night sinks the Knicks in Boston",
  "Career-best 3-point shooting has him in the All-Star talk",
  "Sudden death overtime decides the semifinal",
  "Suicide squeeze in the ninth wins it",
  "He killed it in his first start since the call-up",
  "Rookie buried the shot at the buzzer",
  "Runner steals second, then third, in the same inning",
  "Dead ball ruling costs them a run",
  "Assault on the record book continues with another 300-yard game",
  "Closer's battery mate throws out two",
  "Torn ACL ends his season",
  "Dodgers place struggling closer on the injured list",
  "Star winger out 4-6 weeks with a hamstring strain",
  "Two teams on a collision course for the division title",
  "Header off the head of the captain wins it at the death",
  "Team fires head coach after 2-9 start",
  "Defense destroyed them in the second half",
  "Lakers destroyed by the Nuggets in a 30-point rout",
  "Curry buries the dagger with killer instinct",
  "The moment Anthony Joshua knocked out Jake Paul",
  "Rory thins bunker shot into the grandstands, still makes birdie",
  // Late-drama "dying <timing>" idiom — must not read as death.
  "Winner in the dying seconds sends them top of the table",
  "Equaliser in the dying minutes rescues a point at Anfield",
  "United score twice in the dying embers to steal it",
  // "the late <game event>" late-drama idiom — must not read as death.
  "Liverpool snatch the late winner at Anfield",
  "Arsenal rescue a point with the late equaliser",
  "Man United and the late show strike again",
  "Drama in the late stages as City hold on",
  // Figurative "fatal <mistake>" — must not read as death.
  "Fatal error at the back gifts Arsenal the win",
  "A fatal blow to their title hopes after the derby loss",
  // Figurative "<team fortunes> on life support" — must not read as medical.
  "Playoff hopes on life support after another loss",
  "Season on life support as the skid hits six",
  "Their title defense is on life support",
  "Championship dreams all but on life support after Game 5",
  "The dynasty is on life support",
  // Figurative "charged with <a task>" — the hiring/management framing must not
  // read as a criminal charge.
  "New coach charged with turning the franchise around",
  "GM charged with rebuilding the roster this offseason",
  "Interim boss charged with reviving a stalling season",
  "Skipper charged with restoring the club's fortunes",
  // Figurative "trial by fire" — the rookie-debut framing must not read as a
  // criminal trial.
  "Rookie QB faces trial by fire in his first start",
  "Teenage keeper faces trial by fire on his Champions League debut",
  "A trial by fire awaits the young side in the group of death",
];

for (const headline of SAFE) {
  test(`allows: ${headline}`, () => {
    assert.equal(sensitiveCategoryOf(headline), null);
  });
}

test("empty text is never sensitive", () => {
  assert.equal(sensitiveCategoryOf(""), null);
});

test("the 'dying <timing>' idiom strip does not swallow a real death", () => {
  // Only the sports-timing nouns are stripped — a genuine death context must
  // still trip the `dying` pattern.
  assert.equal(sensitiveCategoryOf("Beloved coach dying in hospice, family says"), "death");
  assert.equal(sensitiveCategoryOf("Legend shares his dying wish in final interview"), "death");
});

test("the 'the late <game event>' idiom strip does not swallow a real death", () => {
  // Only game-event nouns are stripped — "the late <person>" still names the
  // deceased and must trip the death pattern.
  assert.equal(sensitiveCategoryOf("Fenway pays tribute to the late Bill Buckner"), "death");
  assert.equal(sensitiveCategoryOf("The late great Diego Maradona remembered"), "death");
  assert.equal(sensitiveCategoryOf("Club statement on the passing of the late owner"), "death");
});

test("the 'charged with <task>' idiom strip does not swallow a real criminal charge", () => {
  // Only management verbs are stripped — an actual charge names the crime (as a
  // noun, or a crime gerund kept off the strip list) and must still match.
  assert.equal(sensitiveCategoryOf("Quarterback charged with domestic violence"), "violence");
  assert.equal(sensitiveCategoryOf("Player charged with assaulting a fan"), "violence");
  assert.equal(sensitiveCategoryOf("Defender charged with fixing matches"), "violence");
});

test("the 'trial by fire' idiom strip does not swallow a real criminal trial", () => {
  // Only the "trial by fire" idiom is stripped — a genuine court date names the
  // charge (or the offence it is over) and must still trip the `faces? trial`
  // pattern.
  assert.equal(sensitiveCategoryOf("Star forward faces trial on assault charges next month"), "violence");
  assert.equal(sensitiveCategoryOf("Coach faces trial over the betting scandal"), "violence");
});

test("the 'on life support' idiom strip does not swallow a real medical event", () => {
  // Only a team-fortunes subject is stripped — a person on life support (no
  // hopes/season/bid noun as the subject) must still trip the `medical` pattern,
  // even when an abstract noun coincidentally appears elsewhere in the headline.
  assert.equal(sensitiveCategoryOf("Midfielder on life support after collapsing on the pitch"), "medical");
  assert.equal(sensitiveCategoryOf("Driver on life support following the crash"), "medical");
  assert.equal(sensitiveCategoryOf("After a strong title run, the driver is on life support"), "medical");
});

// ── Crashes: their own opt-in toggle ────────────────────────────────────────
// Default (main toggle only) leaves a walk-away wreck in the feed; the crash
// toggle takes it out. A crash that hurt someone is caught either way.

const CRASH_ONLY = enabledCategories(false, true);
const BOTH = enabledCategories(true, true);

const WRECKS = [
  "Huge crash on the opening lap collects five cars",
  "Verstappen crashed out at Eau Rouge",
  "Rider came off his bike at turn four",
  "Nasty spill in the peloton with 10km to go",
];

for (const h of WRECKS) {
  test(`crash toggle off keeps: ${h}`, () => {
    assert.equal(sensitiveCategoryOf(h), null);
  });
  test(`crash toggle on hides: ${h}`, () => {
    assert.equal(sensitiveCategoryOf(h, BOTH), "crash");
  });
}

test("a fatal crash is hidden by the main toggle alone", () => {
  assert.equal(sensitiveCategoryOf("Driver killed in a crash during practice"), "death");
});

test("crash-only leaves ordinary upsetting news alone", () => {
  assert.equal(sensitiveCategoryOf("Former NBA star dies at 58", CRASH_ONLY), null);
});

test("basketball and hockey idiom survive the crash toggle", () => {
  for (const h of ["Wemby crashes the boards for the putback", "Marchand crashing the net all night", "Cinderella crashes the party"]) {
    assert.equal(sensitiveCategoryOf(h, BOTH), null, h);
  }
});

test("knockout-elimination idiom survives the crash toggle", () => {
  for (const h of [
    "England crashed out of the World Cup on penalties",
    "Spurs crashed out of the Champions League",
    "Djokovic crashed out in the quarter-finals",
    "City crashed out of the cup to a League Two side",
  ]) {
    assert.equal(sensitiveCategoryOf(h, BOTH), null, h);
  }
});

test("a real racing wreck still matches after the elimination-idiom strip", () => {
  for (const h of [
    "Verstappen crashed out at Eau Rouge",
    "Leclerc crashed out of the race while leading",
  ]) {
    assert.equal(sensitiveCategoryOf(h, BOTH), "crash", h);
  }
});

test("comeback idiom (wiping out a lead/deficit) survives the crash toggle", () => {
  for (const h of [
    "Chelsea wipe out a two-goal deficit in stoppage time",
    "United's two-goal lead was wiped out in the final minutes",
    "Warriors wiped out the Nuggets' 20-point advantage",
    "Late equaliser wipes out their advantage",
  ]) {
    assert.equal(sensitiveCategoryOf(h, BOTH), null, h);
  }
});

test("a real wipeout still matches after the comeback-idiom strip", () => {
  for (const h of [
    "Huge wipeout at Pipeline",
    "Rider wiped out on the final lap",
  ]) {
    assert.equal(sensitiveCategoryOf(h, BOTH), "crash", h);
  }
});

test("result-framing idiom (crashing to a defeat/loss) survives the crash toggle", () => {
  for (const h of [
    "Arsenal crash to 3-0 defeat at Manchester City",
    "Liverpool crash to defeat at Anfield",
    "England crash to a humiliating loss",
    "Spurs crashed to a shock 4-0 defeat",
    "Villa crash to yet another defeat",
  ]) {
    assert.equal(sensitiveCategoryOf(h, BOTH), null, h);
  }
});

test("a real wreck still matches after the crash-to-defeat strip", () => {
  // Only "crash to <defeat/loss>" is stripped — a wreck described as crashing to
  // the ground / to a halt (no result noun) must still trip the crash pattern.
  for (const h of [
    "Rider crashed to the ground at turn four",
    "Car crashed to a halt against the barrier",
  ]) {
    assert.equal(sensitiveCategoryOf(h, BOTH), "crash", h);
  }
});

test("'crash course' idiom survives the crash toggle", () => {
  for (const h of [
    "Rookie QB gets a crash course in playoff football",
    "A crash course in the Premier League for the promoted side",
    "Teenage keeper handed a crash course on his debut",
    "Front office takes a crash course in salary-cap gymnastics",
  ]) {
    assert.equal(sensitiveCategoryOf(h, BOTH), null, h);
  }
});

test("a real wreck still matches after the crash-course strip", () => {
  // Only the "crash course" idiom is stripped — a genuine wreck must still trip
  // the crash pattern.
  assert.equal(sensitiveCategoryOf("Huge crash on the opening lap collects five cars", BOTH), "crash");
  assert.equal(sensitiveCategoryOf("Rider came off his bike at turn four", BOTH), "crash");
});

test("plain fights and KOs stay visible, a fight that goes bad does not", () => {
  assert.equal(sensitiveCategoryOf("GOALIE FIGHT: Nedeljkovic vs Bobrovsky"), null);
  assert.equal(sensitiveCategoryOf("The moment Joshua knocked out Jake Paul"), null);
  assert.equal(sensitiveCategoryOf("Fighter unresponsive in the cage, stretchered out"), "injury");
});

test("both toggles off = nothing is ever hidden", () => {
  assert.equal(sensitiveCategoryOf("Former NBA star dies at 58", enabledCategories(false, false)), null);
});
