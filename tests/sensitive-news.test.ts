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
  // "dying to <verb>" / "dying for <a|an|another|some> <thing>" eagerness idiom
  // — an impatient player or fanbase must not read as death.
  "New signing dying to make his debut for the club",
  "I'm dying to get back out there, says returning striker",
  "Rookie dying to prove himself in his first start",
  "Fans dying for a win after six straight defeats",
  "He's dying for another shot at the title",
  // "the late <game event>" late-drama idiom — must not read as death.
  "Liverpool snatch the late winner at Anfield",
  "Arsenal rescue a point with the late equaliser",
  "Man United and the late show strike again",
  "Drama in the late stages as City hold on",
  // "the late <game/window/slate/…>" scheduling sense — the evening slot of a
  // doubleheader or TV slate must not read as death.
  "Everything you need to know for the late game",
  "Chiefs-Bills headlines the late window on Sunday",
  "How to watch the late slate of Week 12",
  "Lakers and Warriors clash in the late fixture tonight",
  // Figurative "fatal <mistake>" — must not read as death.
  "Fatal error at the back gifts Arsenal the win",
  "A fatal blow to their title hopes after the derby loss",
  // Figurative "tragic <game mistake>" / "tragically <verb>" — a costly on-field
  // error must not read as death.
  "Tragic own goal hands rivals the derby",
  "A tragic error in stoppage time costs them the title",
  "Keeper's tragic blunder gifts the equaliser",
  "Striker tragically missed a sitter with the goal gaping",
  "Full-back tragically sliced into his own net",
  // Figurative "<team fortunes> on life support" — must not read as medical.
  "Playoff hopes on life support after another loss",
  "Season on life support as the skid hits six",
  "Their title defense is on life support",
  "Championship dreams all but on life support after Game 5",
  "The dynasty is on life support",
  // Figurative "heart attack finish / football" and "gave the fans a heart
  // attack" — a tense finish must not read as a medical emergency.
  "Heart attack finish as United win it in stoppage time",
  "Pure heart attack football from Sunderland again",
  "A heart attack ending sees City hold on at the death",
  "That comeback nearly gave the fans a heart attack",
  "City give their supporters a heart attack before holding on",
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
  // Figurative "<performance> collapse" — a team throwing away a position must
  // not read as a medical collapse.
  "Batting collapse on day three hands India the win",
  "Second-half collapse at home costs United the game",
  "Stunning top-order collapse leaves the chase in tatters",
  "Late collapse during the run-in sinks their playoff hopes",
  "Dramatic middle-order collapse as they lose six for twelve",
  "Defensive collapse at the death gifts City the title",
  // The subject-verb "<innings/deal/bid> collapsed" form of the same idiom — a
  // side, a transfer, or a title bid falling apart must not read as a medical
  // collapse.
  "The innings collapsed on day four as India romp home",
  "The run chase collapsed at the death and Australia sneak it",
  "United's title bid collapsed at Anfield with a late defeat",
  "The deal collapsed during negotiations, agent confirms",
  "Striker's transfer collapsed at the eleventh hour",
  "Their defence collapsed in the second half at the Emirates",
  // The BARE-SUBJECT "<side> collapsed on day N / the final day" cricket form —
  // a team named directly, with no innings/order/chase noun the strips above
  // catch — must not read as a player medically collapsing.
  "Australia collapsed on day three to hand England the win",
  "England collapsed on the final day at Lord's",
  "India collapsed on day 4 chasing a modest 250",
  "South Africa collapsed on the last day to lose the series",
  // Figurative "arrest the <slide/slump/…>" — a team halting a bad run must not
  // read as a criminal arrest.
  "Boss desperate to arrest the slide after four straight defeats",
  "New manager aims to arrest the slump at the bottom of the table",
  "Can anyone arrest their alarming decline?",
  "Skipper vows to arrest the rot before the derby",
  "United arrest a worrying skid with a win at home",
  "Rookie keeper helps arrest the freefall down the standings",
  // Figurative "sentenced to <relegation/the drop/…>" — a club whose fate is
  // sealed must not read as a criminal sentence.
  "Burnley sentenced to relegation after final-day defeat",
  "Leeds sentenced to the drop as their rivals survive",
  "Rooney's side sentenced to another season in the Championship",
  "Struggling giants sentenced to mid-table mediocrity",
  "Once-proud club sentenced to obscurity in the lower leagues",
  // Baseball's "hit-and-run" play — must not read as the vehicular crime.
  "Astros put on the hit-and-run and it works to perfection",
  "A perfectly executed hit-and-run scores the go-ahead run",
  "Altuve laces a hit-and-run single to right",
  "Manager flashed the hit-and-run sign in the ninth",
  "The hit-and-run play catches the defense napping",
  "Botched hit-and-run leads to an inning-ending double play",
  // Figurative "collision" matchup previews — a big-match buildup framed as a
  // clash of styles/titans must not read as an on-field injury.
  "A collision of styles in Saturday's title fight",
  "Heavyweight collision headlines the card in Riyadh",
  "A collision of titans as the top two meet at the Emirates",
  "Marquee collision between two of the league's best offenses",
  "Tactical collision between two very different coaches",
  "When two philosophies collided at Wembley",
  // Basketball/soccer "opened fire from deep/downtown/three/distance" — a
  // long-range shooting barrage must not read as violence.
  "Warriors opened fire from deep and never looked back",
  "Curry opened fire from downtown, hitting six threes in the third",
  "The visitors opened fire from beyond the arc to blow it open",
  "Bench unit opens fire from three to swing the momentum",
  "Midfielder opened fire from distance to level it at Anfield",
  // Soccer's "stabbed home / stabbed it in / stabbed past the keeper" finishing
  // idiom — a goal, not a knife attack — must not read as violence.
  "Kane stabbed home the winner at the death",
  "Rashford stabbed the ball past the keeper from six yards",
  "Substitute stabbed home an equaliser in stoppage time",
  "Defender stabbed it in from close range after a scramble",
  "Keeper stabbed the loose ball home under pressure",
  "He stabbed at the ball but could only find the side netting",
  "Winger stabbed it wide from a promising position",
  "A clever stabbing finish settles a tight derby",
];

for (const headline of SAFE) {
  test(`allows: ${headline}`, () => {
    assert.equal(sensitiveCategoryOf(headline), null);
  });
}

test("empty text is never sensitive", () => {
  assert.equal(sensitiveCategoryOf(""), null);
});

test("the 'opened fire from <long range>' idiom strip does not swallow a real shooting", () => {
  // Only the long-range-shooting objects are stripped — a real shooting reads
  // "opened fire at/on/outside <place>" or "from a car / close range", none of
  // which those objects cover, so it must still trip the `opened fire` pattern.
  assert.equal(sensitiveCategoryOf("Gunman opened fire outside the arena, police say"), "violence");
  assert.equal(sensitiveCategoryOf("Suspect opened fire at a crowd near the stadium"), "violence");
  assert.equal(sensitiveCategoryOf("Shooter opened fire from a moving car"), "violence");
  assert.equal(sensitiveCategoryOf("Attacker opened fire from close range"), "violence");
});

test("the 'dying <timing>' idiom strip does not swallow a real death", () => {
  // Only the sports-timing nouns are stripped — a genuine death context must
  // still trip the `dying` pattern.
  assert.equal(sensitiveCategoryOf("Beloved coach dying in hospice, family says"), "death");
  assert.equal(sensitiveCategoryOf("Legend shares his dying wish in final interview"), "death");
});

test("the 'dying to/for' eagerness idiom strip does not swallow a real death", () => {
  // Only the desire forms ("dying to <verb>", "dying for <a|an|another|some>
  // <thing>") are stripped — a real death reads "dying of/in", or "dying for
  // <duration>" with no article, so it must still trip the death pattern.
  assert.equal(sensitiveCategoryOf("Legend dying of cancer, family confirms"), "death");
  assert.equal(sensitiveCategoryOf("Beloved coach dying in a hospice bed, family says"), "death");
  assert.equal(sensitiveCategoryOf("He had been dying for months before he passed"), "death");
});

test("the 'the late <game event>' idiom strip does not swallow a real death", () => {
  // Only game-event nouns are stripped — "the late <person>" still names the
  // deceased and must trip the death pattern.
  assert.equal(sensitiveCategoryOf("Fenway pays tribute to the late Bill Buckner"), "death");
  assert.equal(sensitiveCategoryOf("The late great Diego Maradona remembered"), "death");
  assert.equal(sensitiveCategoryOf("Club statement on the passing of the late owner"), "death");
  // The scheduling nouns added to the strip ("the late game/window/…") must not
  // punch a hole in a real death that happens to sit beside one of them.
  assert.equal(sensitiveCategoryOf("Legendary broadcaster dies before the late game"), "death");
});

test("the 'heart attack <finish>' idiom strip does not swallow a real cardiac event", () => {
  // Only the figurative forms are stripped — a real cardiac event reads
  // "suffered/had a heart attack", "collapsed with a heart attack" or "died of a
  // heart attack", so it must still trip the medical (or death) pattern.
  assert.equal(sensitiveCategoryOf("Midfielder suffered a heart attack during the warmup"), "medical");
  assert.equal(sensitiveCategoryOf("Player collapsed with a heart attack in training"), "medical");
  assert.equal(sensitiveCategoryOf("Legend had a heart attack on the touchline, in hospital"), "medical");
  assert.equal(sensitiveCategoryOf("Former striker died of a heart attack aged 59"), "death");
});

test("the 'tragic <mistake>' idiom strip does not swallow a real tragedy", () => {
  // Only game-mistake nouns / sporting verbs are stripped — a genuine tragedy
  // still trips the death pattern.
  assert.equal(sensitiveCategoryOf("Tragic accident at the circuit claims a driver"), "death");
  assert.equal(sensitiveCategoryOf("Young prospect tragically died in a car crash"), "death");
  assert.equal(sensitiveCategoryOf("Club mourns the tragic passing of its captain"), "death");
});

test("the 'charged with <task>' idiom strip does not swallow a real criminal charge", () => {
  // Only management verbs are stripped — an actual charge names the crime (as a
  // noun, or a crime gerund kept off the strip list) and must still match.
  assert.equal(sensitiveCategoryOf("Quarterback charged with domestic violence"), "violence");
  assert.equal(sensitiveCategoryOf("Player charged with assaulting a fan"), "violence");
  assert.equal(sensitiveCategoryOf("Defender charged with fixing matches"), "violence");
});

test("the 'arrest the <slide>' idiom strip does not swallow a real arrest", () => {
  // Only a decline noun as the object is stripped — a real arrest names what the
  // person was arrested for / when, so it must still trip the `arrest` pattern.
  assert.equal(sensitiveCategoryOf("Quarterback arrested on domestic violence charge"), "violence");
  assert.equal(sensitiveCategoryOf("Winger arrested after an altercation outside the stadium"), "violence");
  assert.equal(sensitiveCategoryOf("Two arrested over the assault on a referee"), "violence");
});

test("the 'sentenced to <relegation>' idiom strip does not swallow a real sentence", () => {
  // Only sporting-fate objects are stripped — a real sentence names a term or a
  // place ("years", "a year in prison", "prison"), never these football fates,
  // so it must still trip the `sentenced to` pattern.
  assert.equal(sensitiveCategoryOf("Former player sentenced to 15 years in prison"), "violence");
  assert.equal(sensitiveCategoryOf("Ex-agent sentenced to a year in prison for fraud"), "violence");
  assert.equal(sensitiveCategoryOf("Coach sentenced to prison after the trial"), "violence");
});

test("the 'trial by fire' idiom strip does not swallow a real criminal trial", () => {
  // Only the "trial by fire" idiom is stripped — a genuine court date names the
  // charge (or the offence it is over) and must still trip the `faces? trial`
  // pattern.
  assert.equal(sensitiveCategoryOf("Star forward faces trial on assault charges next month"), "violence");
  assert.equal(sensitiveCategoryOf("Coach faces trial over the betting scandal"), "violence");
});

test("the '<performance> collapse' idiom strip does not swallow a real medical collapse", () => {
  // Only a performance-modifier form is stripped — a PERSON collapsing (no such
  // modifier before "collapse") must still trip the `medical` pattern.
  assert.equal(sensitiveCategoryOf("Midfielder collapsed on the pitch, taken to hospital"), "medical");
  assert.equal(sensitiveCategoryOf("Player collapsed during the warmup and was rushed to hospital"), "medical");
  assert.equal(sensitiveCategoryOf("Coach collapsed at the training ground, in critical condition"), "medical");
});

test("the '<innings/deal> collapsed' idiom strip does not swallow a real medical collapse", () => {
  // The subject-verb strip removes only a non-person subject collapsing (an
  // innings, a deal, a bid). A PERSON collapsing (a batsman, a keeper — none of
  // the stripped nouns) must still trip the `medical` pattern, even when a
  // collapse-idiom noun sits elsewhere in the same headline.
  assert.equal(sensitiveCategoryOf("Batsman collapsed at the crease and was stretchered off"), "medical");
  assert.equal(sensitiveCategoryOf("Keeper collapsed on the pitch as the run chase reached its climax"), "medical");
});

test("the '<side> collapsed on day N' idiom strip does not swallow a real medical collapse", () => {
  // Only a cricket match-day marker ("day three", "the final day") is stripped —
  // a person collapsing on a place (the pitch, the field), or during a session,
  // names no match day and must still trip the `medical` pattern.
  assert.equal(sensitiveCategoryOf("Bowler collapsed on the pitch on day three, taken to hospital"), "medical");
  assert.equal(sensitiveCategoryOf("Umpire collapsed during play and was rushed to hospital"), "medical");
});

test("the 'on life support' idiom strip does not swallow a real medical event", () => {
  // Only a team-fortunes subject is stripped — a person on life support (no
  // hopes/season/bid noun as the subject) must still trip the `medical` pattern,
  // even when an abstract noun coincidentally appears elsewhere in the headline.
  assert.equal(sensitiveCategoryOf("Midfielder on life support after collapsing on the pitch"), "medical");
  assert.equal(sensitiveCategoryOf("Driver on life support following the crash"), "medical");
  assert.equal(sensitiveCategoryOf("After a strong title run, the driver is on life support"), "medical");
});

test("the baseball 'hit-and-run' idiom strip does not swallow a real hit-and-run", () => {
  // Only a play-calling verb before or a baseball noun after is stripped — a
  // real vehicular hit-and-run carries neither and must still match violence
  // (or death, when it killed someone).
  assert.equal(sensitiveCategoryOf("Star arrested after a hit-and-run outside the arena"), "violence");
  assert.equal(sensitiveCategoryOf("Coach involved in a hit-and-run, police say"), "violence");
  assert.equal(sensitiveCategoryOf("Cyclist killed in a hit-and-run near the stadium"), "death");
});

test("the soccer 'stabbed home' idiom strip does not swallow a real stabbing", () => {
  // Only a scoring direction / ball object is stripped — a real stabbing reads
  // "stabbed to death", "stabbed in the <body part>", "stabbed over <a
  // dispute>", or "stabbing attack/incident", none of which the strip covers,
  // so it must still trip the `stabb(ed|ing)` violence pattern.
  assert.equal(sensitiveCategoryOf("Player stabbed in the chest outside a nightclub"), "violence");
  assert.equal(sensitiveCategoryOf("Suspect stabbed a fan over a parking dispute"), "violence");
  assert.equal(sensitiveCategoryOf("Stabbing attack near the stadium leaves three hurt"), "violence");
  assert.equal(sensitiveCategoryOf("Former captain stabbed to death, police confirm"), "violence");
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

test("'fixture/injury pile-up' idiom survives the crash toggle", () => {
  // A crowded schedule or a run of injuries is a "pile-up" in ordinary usage —
  // nothing to do with a wreck — so the opt-in crash toggle must not hide it.
  for (const h of [
    "Fixture pile-up leaves City facing seven games in 21 days",
    "A pile-up of fixtures over the festive period worries managers",
    "Injury pile-up forces United into the transfer market",
    "Guardiola bemoans the fixture pileup in December",
    "A pile-up of games has stretched the squad thin",
  ]) {
    assert.equal(sensitiveCategoryOf(h, BOTH), null, h);
  }
});

test("a real pile-up still matches after the fixture-pile-up strip", () => {
  // Only a schedule/squad-noun pile-up is stripped — a genuine multi-car or
  // peloton pile-up must still trip the crash pattern.
  for (const h of [
    "Huge pile-up on lap one takes out five cars",
    "Massive pile-up at Turn 1 red-flags the race",
    "Nasty pile up in the peloton on the final climb",
  ]) {
    assert.equal(sensitiveCategoryOf(h, BOTH), "crash", h);
  }
});

test("the figurative 'collision' idiom strip does not swallow a real collision", () => {
  // Only the matchup framings (a collision of/between an abstract noun, a
  // matchup-adjective collision) are stripped — a physical collision, one of
  // heads, or a bare "collided" between people must still trip the `injury`
  // pattern.
  assert.equal(sensitiveCategoryOf("Catcher carted off after a violent collision at the plate"), "injury");
  assert.equal(sensitiveCategoryOf("Sickening collision of heads forces both players off"), "injury");
  assert.equal(sensitiveCategoryOf("The two players collided going for the header"), "injury");
  assert.equal(sensitiveCategoryOf("Outfielders collided and one stayed down on the warning track"), "injury");
});

test("plain fights and KOs stay visible, a fight that goes bad does not", () => {
  assert.equal(sensitiveCategoryOf("GOALIE FIGHT: Nedeljkovic vs Bobrovsky"), null);
  assert.equal(sensitiveCategoryOf("The moment Joshua knocked out Jake Paul"), null);
  assert.equal(sensitiveCategoryOf("Fighter unresponsive in the cage, stretchered out"), "injury");
});

test("both toggles off = nothing is ever hidden", () => {
  assert.equal(sensitiveCategoryOf("Former NBA star dies at 58", enabledCategories(false, false)), null);
});
