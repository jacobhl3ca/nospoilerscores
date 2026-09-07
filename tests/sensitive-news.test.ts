import assert from "node:assert/strict";
import test from "node:test";

import { sensitiveCategoryOf, enabledCategories } from "../src/lib/sensitiveNews.ts";

// ── Real events the filter must catch ────────────────────────────────────────

const SENSITIVE: [string, string][] = [
  ["Former NBA star dies at 58 after long illness", "death"],
  ["Racing world mourns driver killed in practice crash", "death"],
  ["Tributes pour in after tragic accident at the circuit", "death"],
  ["Club releases statement on the passing of its longtime scout", "death"],
  // The "lost his/her/their life/lives" euphemism — a tribute/anniversary piece
  // written this way carries no died/killed/fatal/obituary cue, and the crash is
  // opt-in, so it had no other flag.
  ["Cyclist who lost his life in the crash remembered a year on", "death"],
  ["Two supporters lost their lives in the stadium tragedy", "death"],
  // "claimed the life/lives of" — the fatal-event twin of "lost his life", where
  // the disaster is the subject. A tribute written this way can carry no died/
  // killed/fatal/obituary word, so it had no other flag.
  ["The stampede that claimed the lives of dozens, remembered 30 years on", "death"],
  ["Avalanche claims the life of a veteran mountaineer", "death"],
  // The "laid to rest" burial euphemism — a funeral-day story written this way
  // need not carry a funeral/died/obituary word, so it had no other flag.
  ["Beloved coach laid to rest as thousands line the streets", "death"],
  ["Club legend laid to rest in his hometown", "death"],
  // "rest in peace" spelled out — a tribute written in full carries no
  // died/passing/obituary cue of its own, so only the RIP abbreviation had
  // caught it before.
  ["Rest in peace to a true great of the game", "death"],
  // "in loving memory" — a tribute-graphic / memorial-post phrasing that carries
  // no died/passing/obituary cue of its own, and is distinct from "in memoriam"
  // (Latin) and "memorial service/for", so it had no other flag before.
  ["In loving memory of a club legend, gone but never forgotten", "death"],
  ["Fans unveil banner: In Loving Memory of their captain", "death"],
  ["Quarterback arrested on domestic violence charge", "violence"],
  ["Lawsuit alleging sexual assault filed against former coach", "violence"],
  ["Two hurt in a shooting outside the stadium", "violence"],
  ["Pitcher charged with DUI after early-morning stop", "violence"],
  ["Hall of Famer diagnosed with pancreatic cancer", "medical"],
  // The `diagnosed with` catch-all must survive the injury-diagnosis strip for
  // an illness with no dedicated keyword.
  ["Veteran keeper diagnosed with a heart condition", "medical"],
  // The noun form of the "terminally ill" cue — the phrasing an obituary-adjacent
  // story actually uses ("diagnosed with a terminal illness"). It stopped at the
  // word boundary after "ill" before the `ill(ness)?` widening.
  ["Beloved coach diagnosed with a terminal illness", "medical"],
  ["Midfielder collapsed on the pitch, taken to hospital", "medical"],
  ["Defenseman in critical condition after skate cut", "medical"],
  // A ventilator is the same critical-ICU state as `life support`/`intensive
  // care`. "after collapse" is a bare noun, so the `collapsed (on|during|at)`
  // cue doesn't fire — without the `ventilator` cue this had no other flag.
  ["Coach on a ventilator after collapse, club asks for privacy", "medical"],
  // `motor neurone disease` / `MND` is ALS by its British name — the form the
  // soccer/rugby/cricket feeds use. Like ALS it must match without a "diagnosed
  // with" cue, so a fundraiser, tribute or "battle" feature is caught too.
  ["Rugby league legend continues his brave MND battle", "medical"],
  ["Charity match raises millions for motor neurone disease research", "medical"],
  ["Former captain living with motor neuron disease honoured with statue", "medical"],
  // British "leukaemia" spelling, the form the soccer/rugby/cricket feeds use.
  // Like the MND cases, a "battle"/fundraiser feature carries no "diagnosed
  // with" cue, so only the American "leukemia" spelling matched before.
  ["Former winger continues his brave leukaemia battle", "medical"],
  ["Charity match raises millions for leukaemia research", "medical"],
  // `multiple sclerosis` joins the named-disease list like ALS/MND — a chronic
  // illness that reaches the feed through "living with"/fundraiser features
  // carrying no "diagnosed with"/hospital cue, so it must match on the disease
  // name alone.
  ["Former captain continues to live with multiple sclerosis", "medical"],
  ["Charity ride raises millions for multiple sclerosis research", "medical"],
  // British "paralysed"/"paralysing" spelling — the form the soccer/rugby/
  // cricket feeds use. Only the American "paralyzed"/"paralyzing" spelling
  // matched before, so a British-spelt injury tragedy leaked past the toggle.
  ["Winger left paralysed from the waist down after scrum collapse", "medical"],
  ["Fans rally around fly-half paralysed in a horror crash", "medical"],
  ["Two horses euthanized after breakdowns on the card", "animal"],
  ["Owner banned for life over animal cruelty conviction", "animal"],
  ["Teammates open up a year after his suicide", "selfharm"],
  // The "take one's own life" euphemism in every tense — only the past tense
  // matched before, so a present-tense obit headline and an attempt in the
  // infinitive both leaked past the toggle.
  ["Ex-player takes his own life at 38, family confirms", "selfharm"],
  ["Former captain tried to take his own life, book reveals", "selfharm"],
  // The "end one's own life" euphemism — sibling of "take one's own life"
  // above. "ended" is not "took", and a report written this way carries no bare
  // suicide/self-harm word, so it leaked past the toggle entirely.
  ["Former striker ended his own life at 34, family confirms", "selfharm"],
  ["Ex-keeper tried to end his own life last year, he reveals", "selfharm"],
  ["Wade Meckler is hit in the head by a pitch and forced to leave the game", "injury"],
  ["Catcher carted off after a violent collision at the plate", "injury"],
  // A real player collision must still trip — the matchup-subject strip
  // (sides/teams/clubs collided) never covers "players".
  ["The two players collided going for the header and both went down", "injury"],
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
  // Leaving the game HURT still trips, on a genuine injury cue after the exit.
  ["Striker left the field with a hamstring strain, in visible pain", "injury"],
  ["Winger leaves the game after taking a knock to the head", "injury"],
  ["Rookie in hospital after dislocating his ankle", "injury"],
  // A life-threatening injury reads as flinch-worthy, not roster news. The
  // crash/fall itself is opt-in `crash` (off by default), so without a
  // "critically injured" cue these leaked past the main "Hide upsetting news".
  ["Driver critically injured in a horror crash at Turn 3", "injury"],
  ["Two fans critically injured when the stand collapsed", "injury"],
  ["Boxer critically wounded, rushed straight to surgery", "injury"],
  // "life-changing injuries" — permanent, catastrophic harm, the sibling of
  // "critically injured". Without a "collision"/"critically" cue in the same
  // headline these leaked past "Hide upsetting news".
  ["Rider suffers life-changing injuries in the peloton pile-up", "injury"],
  ["Boxer left with life-changing injuries after the bout", "injury"],
  ["Winger faces a life changing injury following the fall", "injury"],
  ["Defensive tackle spits on the quarterback and is ejected", "violence"],
  ["Star pitcher opens up about his overdose", "selfharm"],
  // Addiction itself — the other half of the "self-harm or addiction" label.
  // Only its endpoints (overdose, rehab) matched before, so these ordinary
  // personal-struggle stories used to leak past "Hide upsetting news".
  ["Guard opens up about his gambling addiction", "selfharm"],
  ["Former MVP reveals a long battle with alcohol addiction", "selfharm"],
  ["Reliever enters treatment for alcoholism", "selfharm"],
  ["Prospect confronts an opioid addiction after a career-ending injury", "selfharm"],
  ["His addiction recovery is going well, the agent says", "selfharm"],
  ["Beloved former captain dying in hospice, club confirms", "death"],
  ["Club pays tribute to the late chairman ahead of kickoff", "death"],
  // A real homicide that names its victim with a bare pronoun must not have its
  // only cue stripped by the blowout-hyperbole idiom ("murdered it/that"). The
  // `murder(ed)` cue is shared by death and violence; death is checked first.
  ["Former NFL star murdered her before turning the gun on himself", "death"],
  ["Athlete found to have murdered them in cold blood, prosecutors say", "death"],
  ["Man charged after he murdered him outside the arena", "death"],
  // The gerund "murdering" in a legal frame. The death list catches the bare
  // noun/past forms but not the gerund, so these real homicides used to leak
  // past "Hide upsetting news"; a scoped violence frame now catches them.
  ["Ex-NFL star admits murdering his girlfriend", "violence"],
  ["Former athlete accused of murdering a rival, court hears", "violence"],
  ["Retired boxer jailed for murdering his neighbour", "violence"],
  ["Onetime prospect confesses to murdering two people", "violence"],
  // "found lifeless" — the euphemistic sibling of "found dead". Only the latter
  // was listed, so a real death written this way used to leak past the filter.
  ["Former player found lifeless in his hotel room, police say", "death"],
  ["Beloved coach was found lifeless at home, club confirms", "death"],
  // A stroke is usually first reported unconfirmed. "suspected"/"possible" were
  // absent from the closed severity list, so these breaking-news phrasings used
  // to leak past "Hide upsetting news".
  ["Legendary manager rushed to hospital after suffering a suspected stroke", "medical"],
  ["Club confirms coach suffered a possible stroke and is under observation", "medical"],
  // A team-bus crash is a recurring sports tragedy, but it only tripped `death`
  // when the headline also said "fatal"/"killed"/"dead". The bare `bus crash`
  // cue (a sibling of the existing car/plane/helicopter crash cues) catches the
  // anniversary/survivor framing that used to leak past "Hide upsetting news".
  ["Community remembers the team bus crash five years on", "death"],
  ["Survivors of the youth team bus crash reunite ahead of the season", "death"],
  // "gone too soon" — a tribute-graphic / memorial-post phrasing that carries no
  // died/passing/obituary cue of its own (a sibling of "in loving memory" and
  // "rest in peace"), so a tribute written this way had no other flag before.
  ["Football world remembers a club legend gone too soon", "death"],
  ["Tributes for the young star, gone far too soon at 24", "death"],
  // "condolences" — a bereavement statement whose only death cue is the sympathy
  // word itself (no died/passing/obituary), so it had no other flag before.
  ["Club sends its condolences to the family of a beloved former captain", "death"],
  ["Messages of condolence pour in across the sport", "death"],
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
  // "laid to rest" in its figurative dispute-settling sense — the death cue's
  // negative lookahead drops an abstract-argument object so these recaps stay up.
  "Late winner laid to rest the doubts over his fitness",
  "Derby win finally laid to rest the ghosts of last season",
  "Emphatic display laid to rest any questions about his form",
  // The death `in loving memory` cue is the full phrase — a bare "memory" idiom
  // ("best in recent memory", "muscle memory") must stay in the feed.
  "Best defensive display in recent memory shuts out the visitors",
  "Rookie's muscle memory takes over on the game-winning putt",
  "Shooting guard drops 40 in a road win",
  "Cold shooting night sinks the Knicks in Boston",
  // "Paralympic(s)" shares the "paraly…" stem the medical `paraly[sz](ed|ing)`
  // cue matches, but the required `[sz]` + ed/ing suffix never follows, so this
  // routine Games coverage must stay in the feed.
  "Paralympics team named for the Games",
  "Paralympic gold medallist returns to the track",
  "Career-best 3-point shooting has him in the All-Star talk",
  "Sudden death overtime decides the semifinal",
  "Suicide squeeze in the ninth wins it",
  // The medical `ventilator` cue is a whole word — a venue's "ventilation"
  // system is a different word it never matches, so arena-upgrade news stays up.
  "New ventilation system installed at the arena keeps fans cool",
  // The addiction cue reads a real personal struggle, so the leagues' "substance
  // ABUSE policy/program" and the "addicted/addictive to <sport>" metaphors —
  // none of which use the noun "addiction" in a struggle frame — stay visible.
  "Outfielder suspended under the substance abuse policy",
  "Reliever enrolled in the league's substance abuse program",
  "Fans are addicted to this team",
  "This offense is absolutely addictive to watch",
  "He is addicted to winning and it shows",
  "He killed it in his first start since the call-up",
  // Mic-drop / blowout hyperbole with a non-victim object stays visible.
  "He absolutely murdered it on the mic at media day",
  "Star player murdered that putt from 40 feet",
  // Blowout-hyperbole "murdering" (the gerund) with no legal frame stays
  // visible — the new "<accused of|admits|jailed for|…> murdering" homicide
  // pattern must not reach these.
  "Liverpool are murdering United at Anfield",
  "City murdering the competition in the title race",
  "He's absolutely murdering it off the tee today",
  "Warriors murdering them from deep in the third quarter",
  "Rookie buried the shot at the buzzer",
  "Runner steals second, then third, in the same inning",
  "Dead ball ruling costs them a run",
  "Assault on the record book continues with another 300-yard game",
  "Closer's battery mate throws out two",
  "Torn ACL ends his season",
  "Dodgers place struggling closer on the injured list",
  "Star winger out 4-6 weeks with a hamstring strain",
  // A routine injury diagnosis is roster news, not "serious illness" — the
  // `diagnosed with` medical catch-all used to hide all of these.
  "Midfielder diagnosed with a hamstring strain, out two weeks",
  "Guard diagnosed with a high ankle sprain",
  "Quarterback diagnosed with a torn ACL, season over",
  "Winger diagnosed with a grade 2 calf strain",
  "Striker diagnosed with a fractured metatarsal",
  "Rookie diagnosed with a dislocated shoulder",
  "Fullback diagnosed with a nasty groin problem",
  // "critically" hides a life-threatening injury, but "hurt" takes abstract
  // objects — the "critically injured/wounded" cue deliberately excludes it so
  // this figurative recap stays visible.
  "That double bogey critically hurt his title chances",
  // "life-changing injuries" hides catastrophic harm, but the bare "life-changing"
  // upside idiom never takes "injury" as its object, so these stay visible.
  "A life-changing payday awaits the tournament winner",
  "This trade could be life-changing for the franchise",
  "The buzzer-beater was a life-changing moment for the rookie",
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
  // Season-scale "dying days/weeks/hours of the <season|window|race|…>" idiom —
  // the run-in and deadline-day framing, scoped to its competition object so a
  // real "dying days of his life" still reads as death.
  "United fading in the dying days of the season",
  "A frantic close to the dying weeks of the transfer window",
  "Deadline drama in the dying hours of the window",
  "Klopp reflecting on the dying days of his reign at Anfield",
  "The veteran comes good in the dying days of his career",
  "City limp through the dying weeks of the title race",
  // "dying to <verb>" / "dying for <a|an|another|some> <thing>" eagerness idiom
  // — an impatient player or fanbase must not read as death.
  "New signing dying to make his debut for the club",
  "I'm dying to get back out there, says returning striker",
  "Rookie dying to prove himself in his first start",
  "Fans dying for a win after six straight defeats",
  "He's dying for another shot at the title",
  // "a dying breed" / "a dying art" rarity idiom — a style or player type
  // becoming rare must not read as death.
  "Old-fashioned target men are a dying breed in the modern game",
  "The dying art of the sweeper keeper is making a comeback",
  "One-club players are a dying breed these days",
  // Baseball's "dying quail" / "dying seagull" bloop-hit idiom — a weakly hit
  // ball, not a death.
  "Judge lifts a dying quail into shallow center for the go-ahead single",
  "A pair of dying quails fall in as the Yankees rally in the eighth",
  "Bloop single, a real dying seagull, drops in front of the outfielders",
  // "passing of the torch/baton/ball" — the generational-handover cliché, the
  // relay handover, and a player's distribution — not "the passing of <a person>".
  "The passing of the torch from Manning to Mahomes is finally complete",
  "A seamless passing of the baton to the next generation of stars",
  "His passing of the ball was the best on the pitch all afternoon",
  // Cricket's "death overs" phase in the possessive form ("his/her/their death
  // <phase noun>") — the final-overs game state, not a death.
  "Bumrah at his best as his death bowling seals a tense IPL win",
  "India need to fix their death bowling before the World Cup",
  "Her death overs went for just four runs in the final",
  "Their death-over execution let them down in the super over",
  "Russell's death hitting drags the chase over the line",
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
  // "the late <on-field incident>" — own goal / red card / sending-off / save is
  // a match-report staple, not a death.
  "Rovers snatch it with the late own goal at the Kop end",
  "The late red card to Smith changed the whole game",
  "Dramatic finish decided by the late save from Courtois",
  "The late sending-off left them a man down",
  // "the late tackle/challenge/foul/booking" — the foul that draws the card is
  // the same on-field-incident idiom, not a death.
  "Sent off for the late tackle that swung the derby",
  "The late challenge earned him a straight red",
  "Punished for the late foul on the edge of the box",
  "The late booking rules him out of the final",
  // "the late brace/consolation/cameo/flourish" — a late scoring or impact
  // moment, not a death.
  "Haaland seals it with the late brace at the Etihad",
  "United grab only the late consolation in a 3-1 defeat",
  "The late cameo off the bench turned the game around",
  "City's late flourish puts the result beyond doubt",
  // Cricket's "the late runs/wickets" late-drama pair, the general "the late run"
  // closing charge, and "the late blow" setback — game moments, not a death.
  "England grabbed the late wickets to seal victory",
  "The late wicket that changed the whole complexion of the Test",
  "Australia's late runs off the final over proved decisive",
  "The late runs from the tail frustrated the bowlers",
  "Spurs survived the late run to hold on for the win",
  "Undone by the late blow of a stoppage-time equaliser",
  // "the late <US scoring play>" — the NFL/NBA/MLB late-drama phrasing the app's
  // own columns produce, a game moment and never a death.
  "Chiefs win it with the late touchdown at Arrowhead",
  "Mahomes seals it with the late field goal as time expires",
  "Curry drills the late three-pointer to steal the game",
  "The late basket at the buzzer sends it to overtime",
  "Judge wins it with the late home run in the ninth",
  // "the late <golf/basketball/motorsport moment>" — the same late-drama shape
  // the golf leaderboard, NBA columns and racing tiles produce, a game moment
  // and never a death.
  "Scheffler's late birdie at 17 forces a playoff",
  "The late eagle stuns the field at Augusta",
  "The late double bogey drops him down the leaderboard",
  "Woods rolls in the late putt to make the cut",
  "The late chip-in sparks the comeback",
  "The late dunk brings the crowd to its feet",
  "The late block preserves the one-point lead",
  "The late steal ends it for the Celtics",
  "The late caution shook up the finish at Daytona",
  "Verstappen denied by the late restart",
  "The late overtake seals the podium at Monza",
  // "the late bloomer/developer/starter" late-career player-type idiom — a
  // player who peaked late, not a death.
  "The late bloomer finally gets his shot in the starting XI",
  "How the late bloomer became the league MVP",
  "Profile: the late developer who took the long road to the top",
  "Once the late starter, he's now the ace of the rotation",
  // Figurative "fatal <mistake>" — must not read as death.
  "Fatal error at the back gifts Arsenal the win",
  "A fatal blow to their title hopes after the derby loss",
  // Figurative "fatally <verb/adjective>" — a decisive tactical failing, not a
  // death.
  "United's high line looks fatally flawed against the counter",
  "Game plan fatally undermined by the early red card",
  "Keeper fatally misjudged the cross for the winner",
  "Defence fatally exposed on the break time and again",
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
  // Same idiom with the new fortunes nouns (push/charge/challenge/run …).
  "Their playoff push is on life support",
  "United's title charge is on life support",
  "Liverpool's title challenge on life support after the derby loss",
  "Their promotion run on life support with three games to go",
  // Same idiom with a team-UNIT subject and past-tense / perception copulas —
  // a phase of play on the brink, never a person.
  "Defense was on life support in the fourth quarter",
  "The offense is on life support after three straight three-and-outs",
  "Bullpen on life support after another blown save",
  "The power play looked on life support all night",
  "The comeback is on life support",
  "Their midfield was on life support against the press",
  // Same idiom where the subject is a bare TEAM name, told apart by the
  // standings/race context that follows — never how a real patient is described.
  "The Reds are on life support in the title race",
  "Dodgers on life support in the NL West race",
  "Spurs on life support in the top-four chase",
  "City on life support in the race for Champions League football",
  "Barca on life support in the Liga title hunt",
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
  // Figurative "charged with <a task>" in the noun-object form — the mandate of
  // a new appointment must not read as a criminal charge.
  "New manager charged with the task of avoiding relegation",
  "GM charged with the job of rebuilding a young roster",
  "New coach charged with the unenviable responsibility of following a legend",
  "Captain charged with the mission of ending the trophy drought",
  // Figurative "charged with <emotion>" — a highly-charged occasion must not
  // read as a criminal charge.
  "A derby charged with emotion ends all square",
  "A cup final charged with tension and history",
  "The atmosphere was charged with drama from the first whistle",
  "A reunion charged with significance for both managers",
  // Figurative "charged with <energy>" — a side coming out full of running must
  // not read as a criminal charge.
  "Arsenal came out charged with confidence after the restart",
  "A young side charged with belief and momentum",
  "The forwards looked charged with adrenaline from the whistle",
  "United charged with purpose in a relentless second half",
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
  // The BARE-SUBJECT "<side> collapsed at the death" late-collapse form — a team
  // conceding or losing wickets in the closing moments, with no modifier or
  // innings/chase noun the strips above catch — must not read as a player
  // medically collapsing. "the death" is the closing-minutes timing noun.
  "Spurs collapse at the death again as City snatch the win",
  "United collapsed at the death to lose it 2-1",
  "England collapsed at the death chasing 180",
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
  // The verb-form matchup framing with an institutional collective subject —
  // a side/team/club/nation names a whole competitor, never a body, so it must
  // not read as an on-field injury.
  "When the two sides collided, sparks flew",
  "Two unbeaten teams collided in a Sunday classic",
  "The two clubs collided again after last season's playoff epic",
  "When the two nations collided at the World Cup, the world watched",
  // Schedule-sense "collision" — a fixture/scheduling/calendar/date/broadcast
  // clash of two games on the same day or slot, not a physical one, must not
  // read as an on-field injury.
  "Champions League and Premier League fixture collision forces a reshuffle",
  "Scheduling collision leaves fans choosing between two games",
  "A calendar collision between the Euros and the Olympics looms in 2028",
  "A date collision forces the FA to move the replay",
  "TV collision as both title races finish in the same slot",
  "Broadcast collision means one game moves to Monday",
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
  // Hockey's identical "stabbed the puck home / in", "stabbed at the (loose)
  // puck" idiom — a goal or a poke-check, not a knife attack — must not read as
  // violence either. The app runs NHL columns.
  "McDavid stabbed the puck past the goalie for the winner",
  "Forward stabbed the puck home from the crease",
  "Defenseman stabbed the puck in off a scramble",
  "Marchand stabbed at the puck but the goalie smothered it",
  "He stabbed at the loose puck in the slot",
  // Figurative "held hostage by <penalties/VAR/…>" / "hostage to fortune" — a
  // team or game held back by something out of its control, not a real captive.
  "Offense held hostage by penalties all night",
  "The game was held hostage by VAR reviews",
  "United look hostage to fortune with that lineup gamble",
  "A season held hostage by injuries to its best players",
  "Young side looked hostage to their nerves in the second half",
  // Alonzo "Zo" Mourning — a person's surname, not the grief word — must not
  // read as "death or tragedy" when Heat news merely mentions him.
  "Alonzo Mourning honored at halftime as the Heat retire his number",
  "Zo Mourning weighs in on the Heat's rebuild",
  "Alonzo Mourning reflects on his Hall of Fame career",
  // Figurative "suicide mission / pace / run" — a doomed task, a reckless early
  // tempo, or a reckless attacking run must not read as self-harm.
  "United face a suicide mission at the Bernabeu",
  "The leaders went off at a suicide pace and paid for it late",
  "A suicide run down the wing nearly gifts a goal on the break",
  // Adjectival "suicidal <tactic>" — the staple football idiom for recklessly
  // risky play, not a real self-harm event. "suicidal" lives in the self-harm
  // pattern, so these ordinary match reports must not read as "self-harm or
  // addiction".
  "United's suicidal defending gifted City three goals",
  "A suicidal back-pass hands the striker a tap-in",
  "That was a suicidal challenge from the full-back",
  "Arsenal's suicidal high line was punished again",
  "The keeper's suicidal pass out from the back nearly cost them",
  "Their suicidal marking at set pieces is a problem",
  "A suicidal lunge earns the defender a straight red",
  // Figurative "car crash" — the ubiquitous idiom for a shambolic showing, not a
  // road accident. "car crash" lives in the DEATH pattern (to catch a real fatal
  // crash), so these must not read as "death or tragedy".
  "A car crash of a performance from United",
  "Their season is a car crash",
  "The interview was an absolute car crash",
  "A slow-motion car crash of a title defence",
  "United's campaign has been a total car crash",
  "A car crash of an afternoon at the Bridge",
  "Their defending has become a car crash",
  "A car-crash first half leaves them 3-0 down",
  "Car-crash defending gifts the winner",
  "That was car-crash football from start to finish",
  // Figurative "clubhouse cancer" / "a cancer in the locker room" — the staple
  // idiom for a disruptive player, not a real illness. "cancer" lives in the
  // medical pattern, so these must not read as "serious illness".
  "He became a clubhouse cancer and the front office moved on",
  "A cancer in the locker room, sources say",
  "Why the veteran was a cancer in the dressing room",
  "A cancer on the roster the team finally cut loose",
  "Manager calls the winger a cancer in the team",
  // Only the FULL phrase "multiple sclerosis" is a medical cue — the bare
  // acronym "MS" is deliberately left off the named-disease list (it collides
  // with the Mississippi State abbreviation, "manuscript" and the "Ms."
  // honorific), so these stay visible.
  "MS wins the SEC opener on a walk-off single",
  "Ms. Smith named the league's new commissioner",
  // A pitcher leaving the game with a lead/win/save or after a batch of innings
  // is the most ordinary recap line there is — it must not read as "an on-field
  // injury". The departure pattern's lookahead used to fire on a bare "with" or
  // "after", quietly hiding every one of these.
  "Ace leaves the game with a 5-run lead in the seventh",
  "Verlander leaves the game with the win in hand",
  "Closer exits the game with a save",
  "Starter exits the game after six shutout innings",
  "Scherzer left the game with a no-hitter intact",
  // "found lifeless" is added to the death list as the whole phrase — bare
  // "lifeless" is a staple flat-performance idiom and must stay visible.
  "A lifeless first-half display from the champions",
  "The crowd was lifeless until the late winner",
  "A lifeless attack that never threatened the goal",
  // "<game thing> died" — a slow surface, a fixture fizzling as a contest, a
  // passage of play breaking down, or the energy dropping — not a death.
  "The pitch died after tea and the run rate crawled",
  "The ball died on the batsman on a slow surface",
  "The game died as a contest once they lost early wickets",
  "The tie died as a spectacle after the red card",
  "The move died on the edge of the box",
  "United's momentum died in a scrappy second half",
  "The atmosphere died once the home side went two down",
  "The crowd died down after the equaliser",
  // "a stroke of luck/genius" — the fortunate/brilliant-turn idiom — must stay
  // visible; the `(?! of)` guard holds even with the "suspected"/"possible"
  // qualifiers now in the stroke severity list.
  "A possible stroke of genius from the manager at half-time",
  "That substitution was a suspected stroke of luck more than a plan",
  // The "gone too soon" death cue is deliberately scoped to that exact phrase —
  // its close cousins are left out because each collides with a high-frequency
  // sports idiom, so a draft-grade "taken too soon" and an officiating-grievance
  // "taken from us" must stay visible.
  "Prospect taken too soon in the draft is still finding his feet",
  "Three points taken from us by a shocking VAR call, says the boss",
  // The "claimed the life/lives of" death cue is scoped to that object — the
  // winner-reveal "claim the title/crown/trophy" idiom takes a trophy noun, never
  // "the life/lives of", so a coronation headline stays visible here.
  "City claim the title with a game to spare",
  "Verstappen claims the crown for a fourth straight year",
];

for (const headline of SAFE) {
  test(`allows: ${headline}`, () => {
    assert.equal(sensitiveCategoryOf(headline), null);
  });
}

test("the '<game thing> died' idiom strip does not swallow a real death", () => {
  // Only an inanimate game noun as the subject of died/dies is stripped — a
  // genuine death names a PERSON (or an animal), so the bare `died` survives and
  // still trips death, and a real death also keeps its own stronger cues intact.
  // (The horse case is caught by death too — checked before animal — because its
  // "horse" subject isn't on the strip list, so the bare "died" is left intact.)
  assert.equal(sensitiveCategoryOf("Former striker died at 72 after a short illness"), "death");
  assert.equal(sensitiveCategoryOf("Youth match abandoned after a player died on the pitch"), "death");
  assert.equal(sensitiveCategoryOf("Game called off after a fan died in the crowd"), "death");
  assert.equal(sensitiveCategoryOf("The horse died after a fall at Becher's Brook"), "death");
});

test("the 'lost his life' death cue flags a real death but spares the money sense", () => {
  // A person losing their life is a death; the negative lookahead keeps the
  // financial "lost his life savings/earnings/fortune" out of "death or tragedy".
  assert.equal(sensitiveCategoryOf("Fans mourn the supporter who lost his life at the ground"), "death");
  assert.equal(sensitiveCategoryOf("Marshal who lost her life at the circuit is honoured"), "death");
  assert.equal(sensitiveCategoryOf("Reliever lost his life savings betting on games"), null);
  assert.equal(sensitiveCategoryOf("Veteran lost his life earnings to a con artist"), null);
  // A team subject ("its", not a person) is never this cue.
  assert.equal(sensitiveCategoryOf("The side lost its life and lost the game"), null);
});

test("the 'succumbed to <fatal thing>' death cue fires but spares the sports idiom", () => {
  // "succumbed to his injuries / to a long illness / to cancer" is a death; the
  // pattern is scoped to the fatal objects a "team succumbed to a defeat" idiom
  // never takes, so ordinary result recaps stay visible.
  assert.equal(sensitiveCategoryOf("Rider succumbed to his injuries days after the crash"), "death");
  assert.equal(sensitiveCategoryOf("Cyclist succumbs to injuries sustained in the fall"), "death");
  assert.equal(sensitiveCategoryOf("Beloved coach succumbed to a long illness at 64"), "death");
  assert.equal(sensitiveCategoryOf("Boxer succumbed to his wounds"), "death");
  assert.equal(sensitiveCategoryOf("Star succumbed to complications from surgery"), "death");
  // The sports "succumbed to <result>" idiom is not a death and stays visible.
  assert.equal(sensitiveCategoryOf("Rangers succumbed to a late winner"), null);
  assert.equal(sensitiveCategoryOf("United succumbed to their first defeat of the season"), null);
  assert.equal(sensitiveCategoryOf("The favourites succumbed to the pressure of the occasion"), null);
});

test("the 'lost his battle with <illness>' death cue fires but spares the sports idiom", () => {
  // The obituary euphemism — "lost/loses/losing (a brave/long) battle/fight
  // with/against/to <an illness>" — is a death. Scoped to the death verbs plus
  // an illness object, so living-with and competitive "battle" stories stay put.
  assert.equal(sensitiveCategoryOf("Club legend loses long battle with illness"), "death");
  assert.equal(sensitiveCategoryOf("Former striker lost his brave battle with cancer"), "death");
  assert.equal(sensitiveCategoryOf("Legend loses her fight against leukaemia"), "death");
  assert.equal(sensitiveCategoryOf("Coach loses his battle with motor neurone disease"), "death");
  assert.equal(sensitiveCategoryOf("Icon loses battle to cancer at 62"), "death");
  // "battle"/"fight" as ordinary sports idiom — no death verb, no illness object,
  // or someone still fighting — stays visible.
  assert.equal(sensitiveCategoryOf("United's battle with relegation goes to the final day"), null);
  assert.equal(sensitiveCategoryOf("Prospect loses the battle for a starting spot"), null);
  assert.equal(sensitiveCategoryOf("Striker continues his battle with injury"), null);
  assert.equal(sensitiveCategoryOf("Rugby league legend continues his brave MND battle"), "medical");
});

test("the 'suicide <tactic>' idiom strip does not swallow a real self-harm item", () => {
  // Only the tactic/tempo nouns are stripped — a genuine self-harm item reads
  // "suicide attempt", "suicide prevention", "died by suicide" or "suicidal",
  // none of which carry these nouns, so it must still trip the self-harm (or
  // death) pattern.
  assert.equal(sensitiveCategoryOf("Player opens up about his suicide attempt"), "selfharm");
  assert.equal(sensitiveCategoryOf("Club backs a suicide prevention campaign"), "selfharm");
  assert.equal(sensitiveCategoryOf("He has battled suicidal thoughts for years"), "selfharm");
  assert.equal(sensitiveCategoryOf("Former athlete died by suicide, family says"), "death");
});

test("the 'suicidal <tactic>' idiom strip does not swallow a real self-harm item", () => {
  // Only the tactical-play nouns are stripped — a genuine self-harm item reads
  // "suicidal thoughts", "suicidal ideation" or "feeling suicidal", none of
  // which carry these nouns, so it must still trip the self-harm pattern.
  assert.equal(sensitiveCategoryOf("Star reveals his suicidal ideation during the lockdown"), "selfharm");
  assert.equal(sensitiveCategoryOf("Coach admits feeling suicidal after his lowest ebb"), "selfharm");
  assert.equal(sensitiveCategoryOf("Athlete opens up on being suicidal at his lowest point"), "selfharm");
});

test("the addiction cue flags a real struggle but spares the 'substance abuse policy' and 'addicted to' metaphors", () => {
  // Real personal-struggle stories — the other half of the "self-harm or
  // addiction" label — now flag instead of leaking past "Hide upsetting news".
  assert.equal(sensitiveCategoryOf("Reliever battled a cocaine addiction for years"), "selfharm");
  assert.equal(sensitiveCategoryOf("Veteran is a recovering alcoholic, book reveals"), "selfharm");
  assert.equal(sensitiveCategoryOf("Star discusses his addiction battle openly"), "selfharm");
  // The leagues' "substance ABUSE policy/program" is not "substance ADDICTION",
  // and "addicted/addictive to <sport>" never uses the noun in a struggle frame,
  // so ordinary suspension news and metaphors stay visible.
  assert.equal(sensitiveCategoryOf("Reliever suspended under the substance abuse policy"), null);
  assert.equal(sensitiveCategoryOf("Fans are addicted to this team's late drama"), null);
  assert.equal(sensitiveCategoryOf("This offense is absolutely addictive to watch"), null);
  // "end one's own life" is only ever a real suicide — the streak/eagerness
  // idioms take a different object ("ended his own drought/dry spell/wait",
  // never "life"), so ordinary recaps stay visible while the euphemism flags.
  assert.equal(sensitiveCategoryOf("Rookie ended his own drought with a late winner"), null);
  assert.equal(sensitiveCategoryOf("Veteran ends his own dry spell in style"), null);
});

test("the schedule-sense 'collision' strip does not swallow a real on-field collision", () => {
  // Only a schedule/broadcast noun before "collision" is stripped — a genuine
  // on-field collision reads "violent collision", "collision at the plate",
  // "collision of heads", or "two players collided", none of which carry those
  // nouns, so it must still trip the injury pattern.
  assert.equal(sensitiveCategoryOf("Violent collision at the plate leaves the catcher down"), "injury");
  assert.equal(sensitiveCategoryOf("Sickening collision of heads forces both players off"), "injury");
  assert.equal(sensitiveCategoryOf("Two players collided going for the same ball"), "injury");
  assert.equal(sensitiveCategoryOf("Nasty collision in midfield, one player stretchered off"), "injury");
});

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

test("the figurative 'hostage' idiom strip does not swallow a real hostage taking", () => {
  // Only an abstract game/condition captor is stripped — a real hostage taking
  // names a person captor or no captor at all ("held hostage by armed men",
  // "taken hostage", "hostage situation"), none of which the strip covers, so
  // it must still trip the `hostage` violence pattern.
  assert.equal(sensitiveCategoryOf("Gunmen held fans hostage inside the stadium"), "violence");
  assert.equal(sensitiveCategoryOf("Player taken hostage in an armed robbery"), "violence");
  assert.equal(sensitiveCategoryOf("Hostage situation near the arena ends peacefully"), "violence");
  assert.equal(sensitiveCategoryOf("Coach held hostage by armed men for hours"), "violence");
});

test("the 'dying <timing>' idiom strip does not swallow a real death", () => {
  // Only the sports-timing nouns are stripped — a genuine death context must
  // still trip the `dying` pattern.
  assert.equal(sensitiveCategoryOf("Beloved coach dying in hospice, family says"), "death");
  assert.equal(sensitiveCategoryOf("Legend shares his dying wish in final interview"), "death");
});

test("the 'dying days/weeks of the <season>' idiom strip does not swallow a real death", () => {
  // Only a competition/period object is stripped — a genuine "dying days" about
  // a person (object "life"/"hospice", never a season) still reads as death.
  assert.equal(sensitiveCategoryOf("A look back at the dying days of his life"), "death");
  assert.equal(sensitiveCategoryOf("Family gather in his dying days at the hospice"), "death");
});

test("the 'dying quail/seagull' bloop-hit idiom strip does not swallow a real death", () => {
  // Only the "dying <bird>" bloop-hit nouns are stripped — a genuine death
  // context still reads "dying of/in" and must trip the death pattern.
  assert.equal(sensitiveCategoryOf("Beloved coach dying in hospice, family says"), "death");
  assert.equal(sensitiveCategoryOf("Legend dying of cancer, family confirms"), "death");
});

test("the 'Alonzo/Zo Mourning' name strip does not swallow genuine grief", () => {
  // Only the first-name-qualified surname is stripped — real grief phrasing
  // ("in mourning", "a day of mourning", "mourning the loss") carries no such
  // qualifier and must still trip the death pattern, and a real death headline
  // about the man himself keeps its own stronger cue after the strip.
  assert.equal(sensitiveCategoryOf("The club is in mourning after the tragic news"), "death");
  assert.equal(sensitiveCategoryOf("A day of mourning at the stadium"), "death");
  assert.equal(sensitiveCategoryOf("The sport is mourning the loss of a legend"), "death");
  assert.equal(sensitiveCategoryOf("Alonzo Mourning died at 55, the Heat confirm"), "death");
});

test("the 'dying to/for' eagerness idiom strip does not swallow a real death", () => {
  // Only the desire forms ("dying to <verb>", "dying for <a|an|another|some>
  // <thing>") are stripped — a real death reads "dying of/in", or "dying for
  // <duration>" with no article, so it must still trip the death pattern.
  assert.equal(sensitiveCategoryOf("Legend dying of cancer, family confirms"), "death");
  assert.equal(sensitiveCategoryOf("Beloved coach dying in a hospice bed, family says"), "death");
  assert.equal(sensitiveCategoryOf("He had been dying for months before he passed"), "death");
});

test("the 'fatally <verb>' idiom strip does not swallow a real fatality", () => {
  // Only decisive-tactical-failing words are stripped — a genuine fatality reads
  // "fatally injured / wounded / shot / stabbed / hurt", none of which are on
  // the strip list, so it must still trip the death pattern.
  assert.equal(sensitiveCategoryOf("Cyclist fatally injured in a training crash"), "death");
  assert.equal(sensitiveCategoryOf("Fan fatally shot outside the stadium, police say"), "death");
  assert.equal(sensitiveCategoryOf("Driver fatally wounded in a pit-lane accident"), "death");
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
  // Likewise the on-field-incident nouns (own goal / red card / save) must not
  // shield a real death sitting next to one of them.
  assert.equal(sensitiveCategoryOf("Referee who gave the late red card has died, league says"), "death");
  // And the player-type nouns (bloomer/developer/starter) must not shield a real
  // "the late <person>" naming the deceased.
  assert.equal(sensitiveCategoryOf("Tributes for the late Gordon Banks, the goalkeeper who died today"), "death");
  assert.equal(sensitiveCategoryOf("The late developer of the club's academy has passed away"), "death");
  // And the cricket run/wicket and "the late blow" nouns must not shield a real
  // "the late <person>" or a death cue sitting next to one of them.
  assert.equal(sensitiveCategoryOf("Umpire who signalled the late wicket has died, board says"), "death");
  assert.equal(sensitiveCategoryOf("Tributes to the late Shane Warne pour in from around the world"), "death");
});

test("the 'passing of the torch' idiom strip does not swallow a real death", () => {
  // Only torch/baton/ball are stripped — "the passing of <a person/role>" names
  // the deceased and must still trip the death pattern.
  assert.equal(sensitiveCategoryOf("The passing of Pele shocked the football world"), "death");
  assert.equal(sensitiveCategoryOf("Fans mourn the passing of a legend"), "death");
  assert.equal(sensitiveCategoryOf("The club announced the passing of their former owner"), "death");
  // And a real death cue sitting beside the idiom must survive the strip.
  assert.equal(sensitiveCategoryOf("His passing of the ball was sublime; the great man has died"), "death");
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

test("a real cardiac arrest reads as medical, not a criminal arrest", () => {
  // The violence list's bare `arrest` used to fire on "cardiac arrest" and — as
  // violence is checked before medical — mislabel the emergency "violence, crime
  // or abuse". The `(?<!cardiac )` carve-out lets it fall through to the medical
  // "cardiac arrest" cue (plural included), while a genuine arrest still reads as
  // violence.
  assert.equal(sensitiveCategoryOf("Veteran midfielder suffers cardiac arrest in training"), "medical");
  assert.equal(sensitiveCategoryOf("Coach went into cardiac arrest on the touchline"), "medical");
  assert.equal(sensitiveCategoryOf("Two players suffered cardiac arrests this season"), "medical");
  assert.equal(sensitiveCategoryOf("Quarterback arrested on domestic violence charge"), "violence");
});

test("the 'tragic <mistake>' idiom strip does not swallow a real tragedy", () => {
  // Only game-mistake nouns / sporting verbs are stripped — a genuine tragedy
  // still trips the death pattern.
  assert.equal(sensitiveCategoryOf("Tragic accident at the circuit claims a driver"), "death");
  assert.equal(sensitiveCategoryOf("Young prospect tragically died in a car crash"), "death");
  assert.equal(sensitiveCategoryOf("Club mourns the tragic passing of its captain"), "death");
});

test("the figurative 'car crash' idiom strip does not swallow a real fatal crash", () => {
  // Only the three figurative frames — "car crash of a <noun>", a predicate
  // "<is/was/been …> a car crash", and an adjectival "car-crash <shambles noun>"
  // — are stripped. A real road accident names the crash as the circumstance
  // ("killed in / died in a car crash", "car crash that killed", "victims of a
  // car crash"), never as a performance verdict, so it must still trip death.
  assert.equal(sensitiveCategoryOf("Former player killed in a car crash aged 40"), "death");
  assert.equal(sensitiveCategoryOf("Two teenagers die in a car crash near the stadium"), "death");
  assert.equal(sensitiveCategoryOf("Car crash that killed the coach under investigation"), "death");
  assert.equal(sensitiveCategoryOf("Fans mourn the victims of a car crash outside the ground"), "death");
  assert.equal(sensitiveCategoryOf("Tragic car crash claims a rising star"), "death");
});

test("the 'charged with <task>' idiom strip does not swallow a real criminal charge", () => {
  // Only management verbs are stripped — an actual charge names the crime (as a
  // noun, or a crime gerund kept off the strip list) and must still match.
  assert.equal(sensitiveCategoryOf("Quarterback charged with domestic violence"), "violence");
  assert.equal(sensitiveCategoryOf("Player charged with assaulting a fan"), "violence");
  assert.equal(sensitiveCategoryOf("Defender charged with fixing matches"), "violence");
});

test("the 'charged with the <task>' noun-object strip does not swallow a real criminal charge", () => {
  // Only a duty/mandate noun as the object is stripped — a real charge names the
  // offence directly (never one of those nouns), so it must still match.
  assert.equal(sensitiveCategoryOf("Winger charged with the assault of a steward"), "violence");
  assert.equal(sensitiveCategoryOf("Owner charged with the kidnapping of a rival's son"), "violence");
});

test("the 'charged with <emotion>' idiom strip does not swallow a real criminal charge", () => {
  // Only emotion/atmosphere nouns are stripped — a real charge names the offence
  // and must still trip the `charged with` pattern.
  assert.equal(sensitiveCategoryOf("Striker charged with assault after the incident"), "violence");
  assert.equal(sensitiveCategoryOf("Player charged with DUI overnight"), "violence");
  assert.equal(sensitiveCategoryOf("Coach charged with battery following an altercation"), "violence");
  // The energised-side nouns added to the same strip must not open a hole: the
  // two real charge objects that read like them ("intent", "possession") are
  // deliberately kept off the list and must still trip.
  assert.equal(sensitiveCategoryOf("Winger charged with intent to supply a controlled drug"), "violence");
  assert.equal(sensitiveCategoryOf("Defender charged with possession of a firearm"), "violence");
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

test("the '<side> collapsed at the death' idiom strip does not swallow a real medical collapse", () => {
  // Only the "the death" closing-minutes timing noun is stripped — a person
  // collapsing at a PLACE (the crease, the training ground, a venue) names no
  // timing noun and must still trip the `medical` pattern.
  assert.equal(sensitiveCategoryOf("Batsman collapsed at the crease and was stretchered off"), "medical");
  assert.equal(sensitiveCategoryOf("Midfielder collapsed at the training ground, in critical condition"), "medical");
});

test("the 'on life support' idiom strip does not swallow a real medical event", () => {
  // Only a team-fortunes subject is stripped — a person on life support (no
  // hopes/season/bid noun as the subject) must still trip the `medical` pattern,
  // even when an abstract noun coincidentally appears elsewhere in the headline.
  assert.equal(sensitiveCategoryOf("Midfielder on life support after collapsing on the pitch"), "medical");
  assert.equal(sensitiveCategoryOf("Driver on life support following the crash"), "medical");
  assert.equal(sensitiveCategoryOf("After a strong title run, the driver is on life support"), "medical");
  // The trailing standings-race strip is scoped to a race/hunt/chase noun, which
  // a real patient's "on life support" is never followed by — a person in
  // hospital / intensive care / fighting for his life still trips medical.
  assert.equal(sensitiveCategoryOf("Boxer on life support in intensive care after the bout"), "medical");
  assert.equal(sensitiveCategoryOf("Rider remains on life support in a stable but critical condition"), "medical");
  assert.equal(sensitiveCategoryOf("Player on life support, family says he is fighting for his life"), "medical");
  // The team-unit nouns added to the strip (offense/defence, midfield, bullpen …)
  // are never a person, so a real patient's "on life support" — always a person —
  // is untouched even when a unit noun appears elsewhere in the headline.
  assert.equal(sensitiveCategoryOf("Defenseman on life support after collapsing at practice"), "medical");
  assert.equal(sensitiveCategoryOf("Reliever on life support following the incident in the bullpen"), "medical");
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

// The comment above this block claimed "a crash that hurt someone is caught
// either way" and nothing tested it — it was false. A rider injured but alive
// matched only `crash`, which is the opt-in toggle, so the main toggle showed
// it (Jacob 8/31, the real r/sports headline is the first case here).
const HURT_IN_A_WRECK = [
  "Race leader Tadej Pogacar has abandoned the Vuelta a Espana after being injured in a crash during stage eight",
  "Two riders hurt in a pile-up on the run-in",
  "Driver injured after a heavy shunt at turn one",
  "Massive crash leaves three riders injured",
  "Rider broke his collarbone in a crash on the descent",
];

for (const h of HURT_IN_A_WRECK) {
  test(`a crash that hurt someone is hidden by the main toggle alone: ${h}`, () => {
    assert.equal(sensitiveCategoryOf(h), "injury");
  });
}

test("a walk-away wreck is still crash-only, not injury", () => {
  for (const h of WRECKS) assert.equal(sensitiveCategoryOf(h), null, h);
});

test("roster injury news survives the wreck patterns", () => {
  for (const h of [
    "Dodgers place struggling closer on the injured list",
    "Casper Ruud withdraws from US Open with back injury",
    "Star winger out 4-6 weeks with a hamstring strain",
    "Two teams on a collision course for the division title",
  ]) assert.equal(sensitiveCategoryOf(h), null, h);
});

test("MND is ALS by its British name", () => {
  assert.equal(sensitiveCategoryOf("Recently MND-diagnosed Rugby League player walks out for his penultimate game"), "medical");
  assert.equal(sensitiveCategoryOf("Former prop diagnosed with motor neurone disease"), "medical");
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

test("'nervous/emotional wreck' idiom survives the crash toggle", () => {
  // A person (or fanbase) in a state of distress is a "nervous wreck" / an
  // "emotional wreck" — nothing to do with a vehicle wreck — so the opt-in
  // crash toggle must not hide it.
  for (const h of [
    "The closer was a nervous wreck on the mound in the ninth",
    "United fans are nervous wrecks after another late collapse",
    "He was an emotional wreck after the final whistle",
    "Manager admits he's a nervous wreck watching penalties",
  ]) {
    assert.equal(sensitiveCategoryOf(h, BOTH), null, h);
  }
});

test("a real wreck still matches after the nervous-wreck strip", () => {
  // Only "nervous"/"emotional wreck" is stripped — a bare or vehicle-modified
  // wreck must still trip the crash pattern.
  for (const h of [
    "Huge wreck at Daytona collects five cars",
    "Multi-car wreck on the opening lap",
    "The wreckage was strewn across the track",
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
