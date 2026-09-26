// "Sensitive news" filter — the opt-in Settings toggle that keeps upsetting
// items out of the news view (Jacob 8/21).
//
// Sports feeds routinely carry deaths, fatal crashes, assault charges, cancer
// diagnoses and animal-cruelty cases alongside the box scores. The app already
// treats headlines as spoilers; this is the same idea for content someone
// simply does not want to read. Off by default — nothing changes for anyone
// who doesn't turn it on.
//
// Design notes:
// - Matching is HEADLINE + DESCRIPTION only. Reddit selftext is not scanned:
//   it is long, frequently quotes an article in full, and would drag in items
//   whose actual subject is a game.
// - Sports English is full of violent idiom ("shooting guard", "suicide
//   squeeze", "killed it", "sudden death", "buried the shot"). Those phrases
//   are stripped from the text BEFORE the patterns run, so the filter reacts
//   to a real event rather than to a figure of speech. That ordering is the
//   whole reason this is a word-list module and not a couple of inline
//   .includes() calls.
// - Injuries split in two, deliberately (Jacob 8/21, after "hit in head is what
//   I'm trying to avoid"). The IMPACT of getting hurt is matched: struck in the
//   head/face, beanballs, collisions, carted off, leaving the game hurt, and
//   anything described as gruesome. The ADMIN of being hurt is not: placed on
//   the IL, out 4-6 weeks, torn ACL ends his season, cleared to return. That
//   line keeps roster news readable while removing the wince.

import type { NewsItem } from "@/lib/news";

export type SensitiveCategory = "death" | "violence" | "injury" | "medical" | "animal" | "selfharm" | "crash";

// What the hideSensitiveNews pref covers. `crash` is deliberately absent: a
// racing wreck is the sport, so it has its own pref, hideCrashNews (Jacob 8/21
// — "fights fine if nothing terrible, crashes can have option to hide"). Since
// 9/25 one Settings toggle sets both prefs together. A crash that killed, hurt or hospitalized someone still matches
// `death` / `injury`, so it is caught by the main toggle regardless. That last
// part used to say "killed or hospitalized" and it was the gap: "injured in a
// crash" named no mechanism the injury list knew, so it fell through to
// `crash`-only. See the two wreck patterns in `injury`.
export const BASE_CATEGORIES: SensitiveCategory[] = ["death", "violence", "injury", "medical", "animal", "selfharm"];

// Sports idiom that reads as violence but isn't. Removed from the text before
// any pattern runs. Keep every entry a PHRASE — a bare word here would punch a
// hole in the real matches (stripping "shooting" would defeat "mass shooting").
const IDIOM = new RegExp(
  [
    // Shooting = the act of taking a shot, in five sports.
    "shooting (guard|forward|percentage|slump|touch|stroke|star|woes|form|night|display|clinic|range|drill|coach|motion|hand|foot)",
    "(3|three|free.?throw|jump|field.?goal|corner|long.?range|catch.?and.?shoot|point)[- ]?(point )?shooting",
    "(hot|cold|poor|great|good|clutch|efficient|elite|red.?hot|ice.?cold) shooting",
    "shooting (the|it) (ball|lights out|well|poorly)",
    "shooting (up|for) (the|a) ",
    // A team "opening fire from deep / from downtown / from three / from beyond
    // the arc / from distance" is the staple basketball (and soccer) recap idiom
    // for a barrage of long-range shots — the figurative use of the violence
    // filter's `opened fire` gun pattern, which pulled ordinary NBA shooting
    // nights and long-shot flurries under "violence, crime or abuse" for anyone
    // with the main filter on ("Warriors opened fire from deep", "he opened fire
    // from distance"). Stripped ONLY before an unambiguous long-range-shooting
    // object (deep, downtown, three, beyond the arc, distance …) — a phrasing
    // never used for a real shooting, which reads "opened fire at/on/outside a
    // <place>" or "from a car / from close range", none of which these objects
    // cover — so a genuine "gunman opened fire from a moving car" still matches.
    "open(s|ed|ing)? fire from ((way |right )?downtown|deep|(the )?three|threes|3|beyond the arc|outside the arc|the perimeter|distance)",
    // Death idiom.
    "sudden death",
    "dead (ball|puck|arm|red|last|money|zone|cap|weight|heat)",
    "death (valley|spiral|by a thousand|grip|star)",
    // The single most common late-drama phrase in soccer/basketball recaps —
    // "winner in the dying seconds", "equaliser in the dying minutes", "the
    // dying embers of the match". `dying` is a bare death pattern, so without
    // this the main "Hide upsetting news" toggle silently pulled ordinary game
    // recaps as "death or tragedy". Only the sports-timing nouns are stripped, so
    // a genuine "dying in hospice" / "his dying wish" still matches death.
    "dying (seconds|minutes|moments|embers|stages)",
    // The season-scale cousin of the late-drama strip above: "the dying days of
    // the season", "the dying weeks of the transfer window", "the dying days of
    // the title race", "the dying hours of deadline day". `days`/`weeks`/`hours`
    // are deliberately absent from the "dying <timing>" strip above — a bare
    // "his dying days" is more often the literal end-of-life sense than the
    // single-match "dying seconds" is — so this needs its own entry scoped to the
    // FOLLOWING object: a competition/period noun a real death never takes.
    // Without it the main "Hide upsetting news" toggle silently pulled ordinary
    // run-in and transfer-window features under "death or tragedy" (`dying` is a
    // bare death pattern), and the app runs many league columns whose late-season
    // and deadline-day stories produce this phrasing constantly. Stripped ONLY
    // before a season/window/race/tenure-type object (a couple of words allowed
    // in between, for "of his final campaign", "of the summer transfer window"),
    // so a genuine "his dying days at the hospice" / "the dying days of his life"
    // (object "life", never one of these nouns) still matches death — the same
    // following-object scoping the "dying breed/art" and "dying quail" strips use.
    "dying (days|weeks|hours) of (the |their |this |its |his |her |our |a |an )?([\\w'-]+ ){0,3}(seasons?|campaigns?|windows?|races?|contests?|tenures?|reigns?|eras?|regimes?|deals?|contracts?|tournaments?|competitions?|cups?|playoffs?|postseason|terms?|careers?|title race|group stage|regular season)",
    // "dying to play / dying to prove himself / dying to get back out there", and
    // "dying for a chance / for another shot / for some game time" — the everyday
    // eagerness idiom for a player or fanbase impatient for something, the stuff
    // of returning-star quotes and season previews. `dying` is a bare death
    // pattern, so without this the main "Hide upsetting news" toggle silently
    // pulled these ordinary quotes/previews under "death or tragedy". Stripped
    // ONLY in the "dying to <verb>" desire form and "dying for <a|an|another|
    // some> <thing>", so a real "dying of cancer" / "dying in hospice" (dying
    // of/in) and "he had been dying for months" ("dying for <duration>", no
    // article) all still match death.
    "dying to [a-z][\\w'-]*",
    "dying for (a|an|another|some) [\\w'-]+",
    // "a dying breed" (old-school No. 9s, one-club men, proper hard men) and
    // "a dying art" (the drop goal, the target-man header, real shot-stopping)
    // are the staple sports-feature idioms for a style or player type becoming
    // rare — never a real death, yet `dying` is a bare death pattern, so the
    // main "Hide upsetting news" toggle silently pulled these ordinary
    // features/columns under "death or tragedy". Stripped ONLY before
    // "breed"/"art", so a real "dying in hospice" / "his dying wish" (dying
    // of/in/<possessive>) still matches death — matching the "dying <timing>"
    // and "dying to <verb>" strips above.
    "dying (breeds?|arts?)",
    // Baseball's "dying quail" (also "dying seagull") — the staple name for a
    // weakly-hit bloop that drops in front of the outfielders for a cheap hit
    // ("Judge lifts a dying quail into shallow center", "a pair of dying quails
    // fall in during the rally"). `dying` is a bare death pattern, so without
    // this the main "Hide upsetting news" toggle silently pulled ordinary MLB
    // recaps under "death or tragedy". The phrase names a batted ball, never a
    // person, so — like "dying seconds" above — it is safe to strip outright: a
    // real "dying in hospice" / "his dying wish" (dying of/in/<possessive>)
    // carries none of these bird nouns and still matches death.
    "dying (quails?|seagulls?)",
    // "<game thing> died" — the pitch/surface going slow and lifeless (cricket:
    // "the pitch died after tea", "the ball died on the batsman"), a fixture
    // fizzling as a contest ("the game died as a spectacle", "the tie died after
    // the red card"), a passage of play breaking down ("the move died on the edge
    // of the box", "the attack died", "the rally died"), or the energy in the
    // ground dropping ("the atmosphere died", "momentum died", "the crowd died
    // down"). All the past/present of the bare `(dies|died|dying)` death pattern —
    // `dying` is already covered by the strips above, but the `<noun> died` form
    // was not, so the main "Hide upsetting news" toggle silently pulled ordinary
    // cricket and soccer recaps under "death or tragedy", and the app runs several
    // such columns. Stripped ONLY when one of these inanimate game nouns is the
    // immediate subject of died/dies — never a person — so a real "striker died at
    // 72", "a player died on the pitch", or "a fan died in the crowd" (the subject
    // is the person, not one of these nouns) still matches death, and a genuine
    // death also keeps its own stronger cues (died at, obituary, mourning) that
    // survive the strip. The animal list's "(horse|dog|…) died" is untouched — none
    // of those nouns is here — so an animal death still flags too.
    "(pitch|wicket|surface|track|game|match|contest|tie|fixture|spectacle|occasion|ball|delivery|rally|move|attack|run|spell|innings|passage|atmosphere|momentum|tempo|mood|buzz|energy|crowd|noise) (dies|died)",
    // "passing of the torch" (the generational handover — a veteran giving way to
    // the next star, the single most common framing of it in the NFL/NBA/tennis
    // feeds), "passing of the baton" (the relay handover and its figurative twin),
    // and "passing of the ball" (a player's distribution — "his passing of the
    // ball was the best on the pitch"). All three trip the bare `passing of` death
    // pattern (meant for "the passing of <Name/a legend>", i.e. someone who died),
    // so without this the main "Hide upsetting news" toggle silently pulled these
    // ordinary handover columns and skill notes under "death or tragedy". Stripped
    // ONLY before torch/baton/ball — a real "the passing of a legend" / "passing
    // of their former owner" names a person or role, never one of these objects,
    // so it still matches death. And a genuine obituary that happens to mention the
    // phrase keeps its own stronger death cues (died, mourn, obituary) after the
    // strip, so removing the idiom can't hide a real one.
    "passing of the (torch|baton|ball)",
    // Cricket's "death overs" — the final overs of a limited-overs innings — and
    // everything about them: "death bowling", "death bowler", "death hitting", "a
    // fine death spell", "his death-over execution", "their death-overs specialist".
    // A bare "death overs / death bowling" never tripped (no death pattern matches
    // "death <noun>"), but the possessive form "his/her/their death <phase noun>"
    // hit the bare `(his|her|their) death` death pattern and pulled ordinary cricket
    // previews/recaps under "death or tragedy" for anyone with the main "Hide
    // upsetting news" toggle on — and the app runs a cricket/IPL column. Stripped
    // ONLY before a cricket death-phase noun, so a real "his death shocked the
    // sport" / "what caused his death" (a verb or clause, never one of these nouns)
    // still matches death — the same possessive-scoping the strips above use.
    "(his|her|their|its) death[ -](overs?|bowling|bowlers?|batting|hitting|slog|spell|phase|specialist|expert|yorkers?)",
    // "the late winner / the late equaliser / the late drama / the late show" —
    // the staple soccer/basketball framing for something that happened in the
    // closing minutes — AND the scheduling sense "the late game / the late window
    // / the late slate / the late fixture", the standard label for the second,
    // evening slot of a doubleheader or a day's TV slate ("everything you need to
    // know for the late game", "Chiefs-Bills headlines the late window"). `the
    // late` is a bare death pattern (meant for "the late <Name>", i.e. the
    // deceased), so without this the main "Hide upsetting news" toggle silently
    // pulled these ordinary previews/recaps under "death or tragedy". Stripped
    // ONLY before a game-event or scheduling noun, so a genuine "the late <Name>"
    // / "the late great" / "the late owner/coach/legend" (none of these nouns)
    // still matches death — matching the "dying <timing>" strip above. The
    // on-field-incident nouns (own goal / red card / sending-off / dismissal /
    // save, plus the foul that draws the card — late tackle / challenge / foul /
    // booking) are match-report staples too — "decided by the late own goal",
    // "the late red card that swung the derby", "the late save from the keeper",
    // "sent off for the late tackle", "the late foul on the edge of the box" —
    // and carry no death sense, so they join the strip on the same reasoning.
    // The late scoring/impact nouns are the same late-drama staple — "the late
    // brace" (two goals), "the late consolation" (a consolation goal), "the late
    // cameo" (a substitute's brief appearance), "the late flourish" — each names
    // a game moment, never a person, so a genuine "the late <Name>" / "the late
    // great" / "the late owner/coach/legend" still matches death exactly as the
    // game-event and scheduling nouns above do. Cricket's own late-drama pair —
    // "the late runs" (a flurry of scoring off the last few overs) and "the late
    // wickets" (a burst of dismissals to close an innings) — belong here for the
    // same reason: "the late runs off the last over proved decisive", "England
    // grabbed the late wickets to seal victory". So does the general "the late
    // run" (a side's closing charge — "survived the late run to hold on") and
    // "the late blow" (a late setback or goal — "the late blow of a stoppage-time
    // equaliser"). None of run/runs, wicket/wickets, or blow can name a deceased
    // person, so a real "the late <Name>" / "the late great" still matches death.
    // The US-sports scoring plays belong here for the identical reason, and the
    // app runs NFL/NBA/MLB columns that produce this exact phrasing constantly:
    // "the late touchdown", "the late field goal", "the late three-pointer", "the
    // late basket/bucket/layup/jumper", "the late home run", "the late grand
    // slam". Each names a scoring play, never a person, so a genuine "the late
    // <Name>" / "the late chairman" (a role/name, none of these nouns) still
    // matches death — the same scoping every noun above uses.
    //
    // Golf, basketball and motorsport add the same late-drama shape the app's
    // own columns emit. Golf's leaderboard produces "the late birdie/eagle/
    // bogey/putt/chip-in" ("the late birdie at 17 to force a playoff");
    // basketball's late defensive/finishing plays are "the late dunk/block/
    // steal"; and the racing tiles' recaps hinge on "the late caution/restart/
    // overtake" ("the late caution shook up the finish"). Each names a game
    // moment, never a person — so a genuine "the late <Name>" / "the late great"
    // still matches death, exactly as the scoring nouns above do.
    "the late (goals?|winner|equali[sz]ers?|levell?ers?|drama|show|surge|rally|rallies|comeback|collapse|fightback|heroics|twist|scare|wobble|charge|push|flurry|burst|blitz|onslaught|strike|header|runs?|wickets?|blows?|braces?|consolations?|cameos?|flourish(?:es)?|touchdowns?|field goals?|home runs?|grand slams?|three.?pointers?|baskets?|buckets?|layups?|jumpers?|dunks?|blocks?|steals?|birdies?|eagles?|(?:double )?bogeys?|putts?|chip.?ins?|cautions?|restarts?|overtakes?|safety cars?|own[- ]?goals?|red cards?|sending[- ]?offs?|dismissals?|saves?|tackles?|challenges?|fouls?|bookings?|penalt(y|ies)|free.?kicks?|corner|chances?|stages?|innings?|minutes?|moments?|kick.?offs?|substitutions?|subs?|swap|changes?|withdrawals?|games?|windows?|slates?|fixtures?|match(?:es)?|ties?|sets?|sessions?|slots?)",
    // "the late bloomer / the late developer / the late starter" — the staple
    // profile framing for a player who came good later than usual (a career
    // narrative, a draft-sleeper feature), never a deceased person. Like the
    // "the late <game event>" strip above, this trips the bare `the late` death
    // pattern (meant for "the late <Name>", i.e. the deceased), so without it the
    // main "Hide upsetting news" toggle silently pulled these ordinary features
    // under "death or tragedy". Stripped ONLY before a late-career player-type
    // noun, so a genuine "the late <Name>" / "the late great" / "the late owner/
    // coach/legend" (none of these nouns) still matches death — the same scoping
    // the game-event strip above uses. Note "a late bloomer" (article "a") never
    // tripped `the late` to begin with; only the "the late …" form needed this.
    "the late (bloomers?|developers?|starters?)",
    // "fatal error / fatal mistake / fatal blow to their title hopes" — the
    // figurative use dwarfs the literal one, and it tripped the bare `fatal`
    // death pattern. A real fatality still reads "fatal crash" / "fatally
    // injured" / "fatal shooting", none of which these mistake-nouns cover.
    "fatal (error|mistake|blow|flaw|blunder)",
    // The ADVERB companion to the "fatal <mistake>" strip above: "fatally flawed
    // tactics", "a game plan fatally undermined by the red card", "the keeper
    // fatally misjudged the cross", "fatally exposed at the back" — the everyday
    // figurative use of `fatally` for a decisive tactical failing, the stuff of
    // match analysis. It tripped the bare `fatal(ly)?` death pattern and pulled
    // ordinary tactical recaps under "death or tragedy" for anyone with the main
    // filter on. This mirrors the existing `tragic`/`tragically` pairing below.
    // Stripped ONLY before a plan/action word that describes a strategy or an
    // on-field decision — never a person — so a real "fatally injured / fatally
    // wounded / fatally shot / fatally stabbed / fatally hurt" still matches
    // death (none of those verbs are on this list, and a genuine fatality also
    // carries its own stronger cues — died, killed — that survive the strip).
    "fatally (flawed|undermined|misjudged|misread|mistimed|exposed)",
    // "tragic own goal / tragic error / tragically sliced into his own net" —
    // the figurative use of `tragic` for a costly game-mistake, the everyday
    // stuff of match reports. It tripped the bare `tragic(ally)?` death pattern
    // and pulled ordinary recaps under "death or tragedy" for anyone with the
    // main filter on. Stripped ONLY before a game-mistake noun, or before a
    // sporting verb in the adverb form — so a real "tragic accident / tragic
    // crash / tragically died / tragically lost his life" (none of these nouns
    // or verbs) still matches. And an actual tragedy carries its own stronger
    // cues (died, killed, crash) that survive this strip regardless.
    "tragic(ally)? (own goals?|errors?|mistakes?|blunders?|misses?|slips?|gaffes?|mix.?ups?|giveaways?|howlers?)",
    "tragically (missed|misses|missing|conceded|concedes|slipped|slips|fumbled|fumbles|dropped|drops|spurned|spurns|squandered|squanders|skied|sliced|slices|shanked|blazed|blazes|wasted|wastes)",
    // "playoff hopes / season / title defense on life support" is the staple
    // sports cliché for a team on the brink of elimination — the figurative use
    // of the medical `life support` pattern, which pulled ordinary standings
    // recaps under "serious illness" for anyone who enabled the filter. Stripped
    // ONLY when a team-fortunes noun (hopes, season, bid, dynasty, …) is the
    // subject, with just linking words allowed in between, so a real "midfielder
    // on life support" / "the driver is on life support" still matches (the
    // person subject isn't one of these nouns). push/charge/challenge/hunt/chase/
    // run/quest/tilt/pursuit/reign join the noun list for the same reason — a
    // "playoff push / title charge / promotion run on life support" is the
    // identical elimination idiom, never a person.
    // The team-UNIT nouns (offense/defence, midfield, back-line, bullpen, power
    // play, penalty kill, special teams, rotation) and "comeback" join for the
    // same reason: a "defense was on life support in the fourth", "the bullpen is
    // on life support", "the comeback looked on life support" is the identical
    // brink-of-elimination idiom about a phase of play, never a person — so it
    // reads as "serious illness" for anyone with the main filter on, yet none of
    // these nouns can be the subject of a real "on life support" (that is always a
    // person: "midfielder / driver / fan on life support"). was/were and the
    // perception copulas (looks/looked, seem(s/ed), appear(s/ed), stay(s/ed)) join
    // the linking-word list so the past-tense and "looked … on life support" forms
    // strip too — a real patient's "on life support" is likewise never fronted by
    // one of these unit nouns, so extending the leak-free strip stays leak-free.
    "(hopes?|chances?|dreams?|aspirations?|bid|campaign|defen[cs]e|offen[cs]e|dynasty|title|playoffs?|postseason|season|series|push|charge|challenge|hunt|chase|run|quest|tilt|pursuit|reign|midfield|back.?line|bullpen|power.?play|penalty kill|special teams|rotation|comeback) ((is|are|was|were|now|still|all but|officially|basically|practically|barely|remains?|sits?|hangs?|hanging|left|already|essentially|firmly|clinging|but|no longer|almost|nearly|looks?|looked|seem(?:s|ed)?|appear(?:s|ed)?|stays?|stayed) )*on life[ -]support",
    // The other figurative shape, where the subject is a bare TEAM name rather
    // than a fortunes noun — "The Reds are on life support in the title race",
    // "Dodgers on life support in the NL West race", "Spurs on life support in
    // the top-four chase". No fortunes noun precedes "on life support" for the
    // strip above to key on, so it slipped straight through to the medical
    // `life support` pattern and read as "serious illness" for anyone with the
    // main filter on. Here the tell is what FOLLOWS: a standings/race context
    // (in/for the … race, hunt, chase, push, charge, contention, running …) that
    // a real patient's "on life support" is never chased by — nobody is "on life
    // support in the title race" — so stripping the whole span is leak-free. A
    // genuine "midfielder on life support after collapse" / "on life support in
    // intensive care" / "fighting for his life" carries no such trailing race
    // noun and still matches medical.
    "on life[ -]support,?( still| now| again| once more| barely| already| officially)? (in|for) (the |their |our |a )?([\\w'-]+ ){0,3}(races?|hunts?|chases?|picture|pushes?|charges?|scraps?|contention|running|standings|spots?|berths?|qualification|places?)",
    // A "heart-attack finish", "heart attack football", or a nail-biter that
    // "gave the fans a heart attack" is the staple tense-ending idiom — the
    // figurative use of the medical `heart attack` pattern, which pulled ordinary
    // stoppage-time recaps under "serious illness" for anyone with the main filter
    // on ("heart attack finish as United win it late", "that comeback nearly gave
    // the fans a heart attack"). Stripped ONLY in its two figurative forms: an
    // adjectival "heart attack <game noun>" (finish, football, ending, stuff …),
    // and "gave/give <someone> a heart attack". A real cardiac event reads
    // "suffered a heart attack", "had a heart attack", "collapsed with a heart
    // attack" or "died of a heart attack" — none of these forms — so it still
    // matches. `had` is deliberately OUT (a real one reads "had a heart attack").
    "heart[ -]attack (finish(es)?|ending|football|stuff|material|inducing|mode|territory|drama|escape|thriller|win|victory|comeback|scenes?|special)",
    "(gave|give|gives|giving|handed|hands|hand) ((me|us|us all|him|her|them|everyone)|((the|their|his|her|its|our|my) )?(fans?|supporters?|crowd|faithful|neutrals?|viewers?|players?)) (a|another) heart attack",
    // A "batting collapse", "second-half collapse" or "top-order collapse" is the
    // staple sports-performance idiom (cricket especially, but soccer/basketball
    // too) for a side throwing away a position — the figurative use of the medical
    // `collapsed? (on|during|at|mid)` pattern, which pulled ordinary match reports
    // under "serious illness" for anyone with the main filter on ("batting collapse
    // on day three", "second-half collapse at home"). Stripped ONLY when a
    // performance modifier precedes "collapse", so a real "midfielder collapsed on
    // the pitch" / "player collapsed during the warmup" (a PERSON, with no such
    // modifier) still matches — and a genuine on-field medical scene also carries
    // the feed's other medical cues (rushed to hospital, critical condition,
    // stretchered off) even if this phrase is stripped.
    "(batting|bowling|top[ -]?order|middle[ -]?order|lower[ -]?order|first[ -]?half|second[ -]?half|third[ -]?quarter|fourth[ -]?quarter|defensive|offensive|late|dramatic|stunning|spectacular|shock|shocking|epic|historic|total|complete) collapse",
    // The SUBJECT-VERB partner to the "<modifier> collapse" NOUN strip above: a
    // cricket innings/run-chase, a transfer/takeover, or a title bid "collapsing"
    // is the same fall-apart idiom in verb form — the figurative use of the medical
    // `collapsed? (on|during|at|mid)` pattern, which pulled ordinary match reports
    // and transfer news under "serious illness" for anyone with the main filter on
    // ("the innings collapsed on day four", "the run chase collapsed at the death",
    // "the deal collapsed during talks", "United's title bid collapsed at Anfield").
    // Stripped ONLY when a non-person subject is what collapsed (an innings, a
    // chase, a deal, a bid, a defence — never a player), so a real "midfielder
    // collapsed on the pitch" / "player collapsed at training" (a PERSON, none of
    // these nouns) still matches. "stand" is deliberately OUT — a literal grandstand
    // collapsing is a real disaster the feed should keep flagged.
    "(innings|run.?chase|chase|batting|bowling|top.?order|middle.?order|lower.?order|partnership|deal|move|transfer|takeover|merger|talks|negotiations|bid|campaign|challenge|defen[cs]e|resistance) collapse[sd]?",
    // The BARE-SUBJECT form of the same cricket idiom: a side named directly —
    // "Australia collapsed on day three", "England collapsed on the final day" —
    // with no innings/order/chase noun for the two strips above to catch, so it
    // slipped straight through to the bare `collapsed? (on|during|at|mid)`
    // medical pattern and read as a player collapsing. It is still the
    // batting-collapse sense. Stripped ONLY before a cricket match-day marker
    // ("day three", "the final day"), so a real "collapsed on the pitch/field/
    // court" or "collapsed during training" (a person, no match day) still trips
    // medical — a genuine on-field collapse names a place, never a day number.
    "collapse[sd]? on (day (one|two|three|four|five|\\d+)|the (final|last|opening|first|second|third|fourth|fifth) day)",
    // "collapsed at the death" — a side named directly conceding or losing wickets
    // in the closing moments ("Spurs collapse at the death again", "United
    // collapsed at the death to lose it 2-1", "England collapsed at the death
    // chasing 180"). "the death" is the sports-timing noun for the final minutes
    // (the same closing-moments sense as the "dying seconds/minutes" strip above),
    // but with a bare team subject there is no modifier or innings/chase noun for
    // the two collapse strips above to catch, so it slipped straight through to
    // the bare `collapsed? (on|during|at|mid)` medical pattern via the `at` branch
    // and read as a player collapsing. Stripped ONLY before "the death", so a real
    // "collapsed at the training ground / at the crease / at Anfield" (a person at
    // a PLACE, never a timing noun) still trips medical — a genuine on-field
    // collapse names where it happened, matching the day-marker reasoning above.
    "collapse[sd]? at the death",
    // "clubhouse cancer" / "a cancer in the locker room" / "a cancer in the
    // dressing room" / "a cancer on the roster" — the staple sports idiom for a
    // disruptive, morale-poisoning player (baseball's "clubhouse cancer" most of
    // all, but every sport uses "a cancer in the team"). `cancer` is a bare
    // medical pattern, so without this the main "Hide upsetting news" toggle
    // silently pulled ordinary locker-room-drama and roster stories under
    // "serious illness" for anyone with the filter on. Stripped ONLY in the two
    // figurative frames — a compound "<team-place> cancer", and "cancer in/on
    // <the/a/…> <team-place>" where the container is a room or whole-team noun a
    // person is never literally "inside" — so a real "diagnosed with cancer",
    // "cancer diagnosis", "cancer battle", or "prostate cancer" (which name the
    // illness directly, never as a person in a locker room) still matches
    // medical. "family"/"body" and every anatomical site are deliberately OFF
    // the noun list, so a genuine "cancer in the family" still matches.
    "(locker.?room|clubhouse|dressing.?room|dug.?out) cancer",
    "cancer (in|on) (the |their |his |her |its |a |this |that |such an? )?([\\w'-]+ ){0,2}(locker.?room|clubhouse|dressing.?room|dug.?out|team|teams|side|squad|roster|franchise)",
    // ⚠️ Do NOT add a bare letter here. "…|b)" once matched "killed b", which
    // stripped "killed by" out of every real death headline before the patterns
    // ran ("killed by an ICE agent" scored as ordinary sports talk).
    "(kill|killer|killed|killing) (instinct|the clock|it|shot|crossover|line)",
    // "destroyed BY the Lakers" is a scoreline; "killed BY an ICE agent" is not,
    // so `by` is allowed only for the verbs that are purely scoreline idiom.
    "(slaughtered|destroyed|buried|thrashed|dismantled) (them|him|her|it|the|that|by)",
    // Blowout / mic-drop hyperbole ("City killed them 5-0", "he murdered it on
    // the mic", "murdered that putt"). `killed|killing + pronoun` is safe to
    // strip wholesale — nothing flags a bare "killed them" anyway (death's
    // `killed` pattern needs a following preposition, and violence has no bare
    // `killed`). But `murder(ed)` matches the death and violence patterns
    // UNCONDITIONALLY (see both below), so stripping "murdered her/him/them"
    // deleted the only cue on a real homicide that named its victim with a bare
    // pronoun ("… murdered her before turning the gun on himself"), leaking it
    // straight past "Hide upsetting news". Strip only the non-victim objects
    // `it`/`that` for the murder verbs, so a genuine "murdered her/them" re-trips
    // (matching "murdered his wife", which already flags); a literal "we murdered
    // them 5-0" re-flagging is the tolerated over-hide, not the cardinal leak.
    "(killed|killing) (them|him|her|it|that)",
    "(murder|murdered|murdering) (it|that)",
    "drop dead",
    "over my dead body",
    // Alonzo Mourning — Hall-of-Fame center and current Miami Heat executive —
    // is a PERSON's name, not the grief word. His surname is the `-ing` form of
    // the bare `mourn(s|ing|ed)?` death pattern, so ordinary Heat news that
    // merely mentions him ("Alonzo Mourning honored at halftime", "Zo Mourning
    // on the rebuild") scored as "death or tragedy" and vanished for anyone with
    // the main "Hide upsetting news" toggle on. Stripped ONLY when his first name
    // or the "Zo" nickname precedes it, so genuine grief phrasing — "the club is
    // in mourning", "a day of mourning", "mourning the loss" — carries no such
    // qualifier and still matches death. A real death headline about him ("Alonzo
    // Mourning died at …") also keeps its own stronger cue (died) after the strip.
    "(alonzo|zo) mourning",
    // A team "on a collision course" is a standings story, not a crash. Crashing
    // the boards/net/party is basketball, hockey and playoff talk.
    "collision course",
    "crash(es|ed|ing)? (the|a) ([\\w'-]+ ){0,4}(boards|net|party|glass|crease|gate|rim|presser|press conference|event|meeting|interview|stage|wedding)",
    // A big-match PREVIEW framed as a "collision" — "a collision of styles",
    // "heavyweight collision", "a collision of titans", "when two philosophies
    // collided" — is the staple combat-sports / marquee-fixture buildup, not
    // someone getting hurt. The injury filter's bare `collision`/`collided`
    // pattern pulled these ordinary previews out of the feed for anyone with the
    // main filter on. Stripped ONLY for the figurative matchup framings: a
    // "collision of/between <abstract noun>" (styles, titans, philosophies,
    // eras…), a matchup-adjective "<stylistic|marquee|heavyweight|…> collision",
    // or one of those abstract nouns "collided". Every noun here is an
    // abstraction or a whole-team label, never a body part or a player — so a
    // real "violent collision at the plate", "collision of heads", "the two
    // players collided", or a bare "collided" (a physical event) still matches
    // injury. `course` stays with its own entry above.
    "collision (of|between) (styles?|titans|heavyweights|giants|philosoph(?:y|ies)|ideolog(?:y|ies)|cultures?|generations?|eras?|worlds?|egos?|systems?|approaches?|identities)",
    "(stylistic|tactical|philosophical|ideological|generational|cultural|marquee|blockbuster|heavyweight|title|top.?two|number.?one|east.?west) collision",
    // The verb form of the matchup framing — "when the two sides collided", "two
    // unbeaten teams collided on Sunday", "the two clubs collided again", "when
    // the two nations collided at the World Cup". Alongside the abstractions and
    // team-labels above (styles/titans/heavyweights…), these institutional
    // collective subjects — a side/team/club/nation — name a whole competitor,
    // never a physical body, so a bare "collided" they front is always the
    // fixture-clash idiom, not an on-field crash. The injury filter's bare
    // `collided` pattern otherwise pulled these ordinary previews/recaps under
    // "an on-field injury" for anyone with the main filter on. Scoped to the
    // subject noun exactly like the abstractions, so a real "the two players
    // collided", "collided with the keeper", or "collision of heads" (a player,
    // a body, or "collided with …" — none of these nouns) still matches injury.
    "(styles?|titans|heavyweights|giants|sides?|teams?|clubs?|nations?|philosoph(?:y|ies)|ideolog(?:y|ies)|cultures?|egos?|systems?|worlds?|approaches?|generations?) (have |had |finally |once )?collided",
    // "fixture collision", "scheduling collision", "calendar collision", "date
    // collision", "TV/broadcast collision" — the staple congestion idiom for two
    // games (or competitions, or broadcasts) landing on the same day/slot, the
    // schedule-clash sense and never a physical one. The injury filter's bare
    // `collision` pattern pulled these ordinary scheduling/broadcast stories out
    // of the feed for anyone with the main filter on ("Champions League and
    // Premier League fixture collision forces a reshuffle") — and the app runs
    // many league columns whose World-Cup-year reshuffles produce this phrasing.
    // Stripped ONLY when a schedule/broadcast noun frames it — none of which ever
    // precedes a real "violent collision" / "collision at the plate" / "collision
    // of heads" — so a genuine on-field collision still matches injury, matching
    // the "fixture pile-up" strip's scoping for the crash toggle.
    "(fixtures?|schedule|scheduling|calendars?|dates?|kick.?offs?|time.?slots?|tv|broadcasts?|television) collision",
    // "crashed out of the World Cup / the tournament / the Champions League /
    // the playoffs" is the universal knockout-elimination idiom (soccer, tennis,
    // cricket, darts, snooker) — it has nothing to do with a wreck, yet the bare
    // `crashed out` crash pattern pulled these ordinary elimination recaps out of
    // the feed for anyone who enabled the opt-in "hide crashes" toggle. Stripped
    // ONLY when a competition/round noun is the object, so a real racing wreck
    // ("crashed out at Eau Rouge", "crashed out on lap 3", "crashed out of the
    // race") still matches — "race" is deliberately NOT in the noun list.
    "crashed out (of|in) (the )?([\\w'-]+ ){0,3}(tournament|competition|cup|euros?|championship|champions league|europa league|conference league|playoffs?|postseason|quarter.?finals?|semi.?finals?|last (16|32|eight|four)|group stage|contention|running)",
    // A team "wiping out" an opponent's lead is the staple comeback idiom, not a
    // crash — but the opt-in "hide crashes" toggle's bare `wipe ?out` /
    // `wiped out (on|in|at)` patterns pulled these recaps under "a crash or
    // wreck" ("Chelsea wipe out a two-goal deficit", "United's lead was wiped
    // out in stoppage time"). Stripped ONLY when a lead/deficit-type noun is the
    // object (verb → object) or the subject (subject → passive), with a couple of
    // adjective/linking words allowed in between, so a real "huge wipeout at
    // Pipeline" / "rider wiped out on the final lap" (no such noun attached)
    // still matches the crash pattern.
    "wipe(s|d)? out (a|an|the|their|his|her|its|our|any|that|another) ([\\w'-]+ ){0,3}(lead|leads|deficit|deficits|advantage|advantages|gap|gaps|margin|margins|cushion|cushions|arrears)",
    "(lead|leads|deficit|deficits|advantage|advantages|gap|gaps|margin|margins|cushion|cushions|arrears|scoreline) ([\\w'-]+ ){0,3}wiped out",
    // "crash to (a) defeat/loss" is the staple result-framing headline idiom for
    // a team losing (soccer/rugby/cricket especially: "Arsenal crash to 3-0
    // defeat", "England crash to a humiliating loss") — the figurative use of the
    // bare `crash` crash pattern, which pulled ordinary match-report recaps under
    // "a crash or wreck" for anyone with the opt-in crash toggle on. Stripped ONLY
    // when a result noun (defeat/loss) is the object of "crash to …", so a real
    // wreck that reads "crashed to the ground" / "crashed to a halt" (no such noun)
    // still matches the crash pattern.
    "crash(es|ed|ing)? to ((a|an|the|their|another|yet another) )?([\\w'-]+ ){0,3}(defeat|defeats|loss|losses)",
    // "a car crash of a performance", "a car-crash first half", "car-crash
    // defending", "their season is a car crash", "the interview was an absolute
    // car crash" — the ubiquitous idiom for a shambolic showing, not a road
    // accident. `car crash` sits in the DEATH pattern (to catch a real fatal
    // crash), so the figurative use pulled ordinary match reports and columns
    // under "death or tragedy" for anyone with the main "Hide upsetting news"
    // toggle on — and under the opt-in crash toggle too. Stripped ONLY in the
    // three figurative frames — "car crash of a <noun>", a predicate "<is/was/
    // been …> a car crash", and an adjectival "car-crash <shambles noun>" — so a
    // real "killed in a car crash", "died in a car crash", "tragic car crash",
    // "car crash that killed", or "victims of a car crash" (a road accident named
    // as the circumstance, never as a performance verdict) still matches death.
    "car.?crash of (a|an|the) ",
    "(is|was|were|been|being|becomes?|becoming|remains?|looked?|looks|feels?|felt|seem(?:s|ed)?|turn(?:s|ed|ing)? into|descend(?:s|ed|ing)? into) (?:like )?(?:a |an |another |one )?(?:absolute |total |complete |utter |slow.?motion |proper |right |sheer |pure )?car.?crash\\b",
    "car.?crash (performances?|displays?|showings?|defending|defen[cs]es?|football|goalkeeping|tackling|passing|finishing|refereeing|officiating|management|interviews?|pressers?|afternoons?|evenings?|starts?|first half|second half|opening|ending|seasons?|campaigns?|sagas?)",
    // "a crash course in <X>" is the universal idiom for an intensive, learn-on-
    // the-fly introduction — a rookie's crash course in playoff hockey, a debut
    // crash course in the Premier League. It has nothing to do with a wreck, yet
    // the bare `crash` crash pattern pulled these ordinary previews/recaps out of
    // the feed for anyone with the opt-in "hide crashes" toggle on. A real racing
    // wreck never reads "crash course", so unlike the noun-scoped elimination and
    // result idioms above the phrase is safe to strip outright.
    "crash courses?",
    // A "fixture pile-up", "pile-up of fixtures/games", or "injury pile-up" is the
    // staple congestion idiom for a crowded schedule or a run of injuries — it has
    // nothing to do with a wreck, yet the opt-in "hide crashes" toggle's bare
    // `pile.?up` pattern pulled these ordinary schedule/squad stories out of the
    // feed ("fixture pile-up leaves City facing seven games in 21 days", "an
    // injury pile-up forces United into the market"). Stripped ONLY when a
    // schedule/squad noun frames it, so a real "multi-car pile-up on lap one" /
    // "huge pile-up at Turn 1" (car/vehicle/bike/lap — none of these nouns) still
    // matches the crash pattern.
    "(fixture|game|match|injury|goal|point|card|draw|defeat|win)s? pile.?up",
    "pile.?up of (fixtures|games|matches|injuries|goals|points|cards|draws|defeats|wins)",
    "(wreck|wrecked|wrecking) (them|him|her|it|the|that)",
    "trainwreck|train wreck",
    // "a nervous wreck" / "an emotional wreck" — the everyday idiom for someone
    // (a closer on the mound, a manager watching penalties, a fanbase) in a state
    // of distress, never a vehicle wreck, yet it tripped the opt-in "hide crashes"
    // toggle's bare `wreck(s|ed|age)?` pattern and pulled ordinary nerves/reaction
    // pieces under "a crash or wreck". Stripped ONLY after "nervous"/"emotional" —
    // adjectives that describe a person's state and never precede a real wreck —
    // so a genuine "huge wreck at Daytona" / "multi-car wreck on lap one" (a bare
    // or vehicle-modified wreck) still matches, matching the scoping the strips
    // above use.
    "(nervous|emotional) wrecks?",
    // Suicide as tactic / figurative doomed-or-reckless play. "suicide squeeze"
    // (baseball), "suicide pass"/"suicide sprints"/"suicide drills" (conditioning)
    // sit alongside the figurative "suicide mission" (a doomed task — "a suicide
    // mission at the Bernabeu"), "suicide pace" (going out recklessly fast, the
    // staple distance-running / cycling framing), and "suicide run" (a reckless
    // attacking run) — all sports idiom, never a real self-harm event. `suicide`
    // is a bare self-harm pattern, so without this the main "Hide upsetting news"
    // toggle silently pulled these ordinary tactics/recaps under "self-harm or
    // addiction". Stripped ONLY before these tactic/tempo nouns, so a real
    // "suicide attempt", "suicide prevention", "died by suicide", or "suicidal"
    // (none of these nouns — "suicidal" isn't even the "suicide " form) still
    // matches. The bare "suicides" conditioning drill never tripped (the pattern
    // word-boundaries "suicide"), so it needs no entry here.
    "suicide (squeeze|pass|sprints?|drills?|line|mission|pace|runs?)",
    // The ADJECTIVE cousin of the "suicide <tactic>" strip above: "suicidal
    // defending", "a suicidal back-pass", "a suicidal challenge", "suicidal
    // marking", "their suicidal high line", "a suicidal lunge" — the staple
    // (English-football especially) idiom for recklessly risky play, never a
    // real self-harm event. `suicidal` is a bare self-harm pattern, so without
    // this the main "Hide upsetting news" toggle silently pulled ordinary match
    // reports under "self-harm or addiction" — and the app runs many soccer
    // columns whose recaps produce this phrasing constantly. Stripped ONLY
    // before a tactical-play noun a real self-harm story never takes, so
    // "suicidal thoughts", "suicidal ideation", "feeling suicidal", or a bare
    // "suicidal" (none of these nouns) still matches — mirroring the "suicide
    // <tactic>" scoping above.
    "suicidal (defen[cs]e|defending|passes|pass|back.?passes|back.?pass|challenges?|tackl(?:es|e|ing)|marking|high line|clearances?|lunges?)",
    // Crime idiom.
    "(stole|steal|stealing|robbed|robbery|heist) (the|a|him|them|second|third|home|bases?)",
    "(assault|assaulting|assaulted) (on|the) (record|rim|basket|standings|leaderboard|title|field)",
    "battery (mate|of pitchers)",
    // Soccer's finishing idiom: a striker "stabbed home", "stabbed the ball in",
    // "stabbed it past the keeper", "stabbed wide", or a defender "stabbed at the
    // ball / at a cross" in a goalmouth scramble. It reads exactly like the
    // violence filter's `stabb(ed|ing)` knife pattern, so ordinary goal recaps
    // were pulled under "violence, crime or abuse" for anyone with the main
    // filter on — and the World Cup and soccer columns produce this phrasing
    // constantly. Hockey uses the identical idiom around the puck — "stabbed the
    // puck home", "stabbed the puck in", "stabbed at the (loose) puck" in a
    // crease scramble or poke-check — and the app runs NHL columns, so `puck`
    // joins each strip's object list for the same reason. Stripped ONLY before a
    // scoring direction (home, wide, goalwards, past the keeper, into the net) or
    // the "at the ball/puck" clearance sense, and "in" only with a ball/puck/
    // rebound object before it — a real "stabbed to death / stabbed in the chest /
    // stabbed over a dispute / stabbing attack" carries none of these and still
    // matches. "over" and a bare "stabbed in" are deliberately OUT (a person is
    // "stabbed over <a dispute>" and "stabbed in the <neck>"), so those keep
    // tripping violence.
    "stabb(ed|es|ing) (the ball |it |a shot |an effort |the rebound |the loose ball |the puck )?(home|wide|goalwards?|past (the |a )?(keeper|goalkeeper|goalie)|into (an|the) (empty )?net)",
    "stabb(ed|es|ing) (it|the ball|the rebound|the puck) in\\b",
    "stabb(ed|es|ing) at (the |a |the loose )?(ball|cross|rebound|delivery|puck)",
    "stabbing (finish|effort|volley|attempt)",
    // Baseball's "hit-and-run" is an offensive play (the runner breaks as the
    // batter swings to protect him), spelled exactly like the vehicular crime the
    // violence filter's `hit.and.run` pattern is meant to catch — so recaps like
    // "Astros put on the hit-and-run", "a hit-and-run single" read as a crime for
    // anyone with the main filter on. Stripped ONLY when a baseball cue frames it:
    // a play-calling verb before it, or a baseball noun after it. A real
    // "hit-and-run driver / crash / suspect" carries neither, so it still matches.
    "(put on|puts on|putting on|flashed|flashes|flashing|botched|botches|botching|executed|executes|executing|signall?ed|signals?|signall?ing) (the |a |an )?hit.?and.?run",
    "hit.?and.?run (plays?|signs?|signals?|singles?|grounders?|steals?)",
    // "arrest the slide / slump / decline / rot / skid / freefall / losing streak
    // / run of defeats / tailspin / nosedive / downturn" is the staple English-
    // football framing for a team trying to halt a bad run — the figurative use
    // of the bare `arrest` crime pattern, which pulled ordinary form recaps under
    // "violence, crime or abuse" for anyone with the main filter on ("desperate
    // to arrest the slump", "boss aims to arrest the rot", "must arrest the losing
    // streak"). Stripped ONLY when a decline noun is the object of "arrest …",
    // with a couple of article/adjective words allowed in between (so "losing
    // streak" / "run of three straight defeats" land on streak/run), and every
    // listed noun names a slump, never a person — so a real "player arrested on
    // assault charges" / "arrested after the match" (no such noun) still matches
    // the crime pattern.
    "arrest(s|ed|ing)? (the|their|its|his|her|a|an|this|that) ([\\w'-]+ ){0,2}(slide|slump|decline|rot|skid|freefall|free.?fall|spiral|rut|drop|streaks?|runs?|tailspin|nose.?dives?|downturn)",
    // "faces a trial by fire" is the staple rookie-debut framing — a young QB,
    // keeper or teenager thrown in against tough opposition. It tripped the
    // `faces? trial` crime pattern ("faces trial by fire" → "faces trial") and
    // hid ordinary previews under "violence, crime or abuse". Stripped here so
    // a real "faces trial on assault charges" / "faces trial over the scandal"
    // still matches — an actual court date never reads "trial by fire".
    "trials? by fire",
    // "Charged with <a task>" is the staple hiring/management framing — a coach
    // "charged with turning the club around", a GM "charged with rebuilding the
    // roster". It tripped the bare `charged with` crime pattern and hid ordinary
    // front-office news under "violence, crime or abuse". Stripped ONLY before a
    // management verb, so a real "charged with assault" / "charged with DUI" /
    // "charged with assaulting an official" still matches — an actual charge names
    // the crime as a noun (or a crime gerund kept off this list), never as one of
    // these turn-the-team-around verbs.
    "charged with (turning|righting|steering|guiding|leading|rebuilding|reviving|restoring|resurrecting|overhauling|transforming|reshaping|revamping|reversing|halting|ending|snapping|maintaining|defending|protecting|managing|developing|mentoring|anchoring|uniting|rallying|motivating|navigating|salvaging|steadying|stabili[sz]ing|revitali[sz]ing|moderni[sz]ing)",
    // "A derby charged with emotion", "an atmosphere charged with tension", "a
    // final charged with significance/history/drama" — the staple match-report
    // framing for a highly-charged occasion. It tripped the same bare `charged
    // with` crime pattern as the management-verb form above and hid ordinary
    // build-ups/recaps under "violence, crime or abuse" for anyone with the main
    // filter on. Stripped ONLY before an emotion/atmosphere noun, so a real
    // "charged with assault / DUI / battery / murder / possession" — which names
    // the offence, never one of these feelings — still matches. ("emotionally
    // charged" isn't touched: it never reads `charged with`, so it never tripped.)
    // The second noun group is the same idiom's energised-side sense — "a team
    // charged with confidence / belief / adrenaline / purpose", the staple
    // framing for a side coming out full of running — which read as a criminal
    // charge for the same reason. `intent` and `possession` are deliberately
    // OFF this list (both are real charge objects: "charged with intent to
    // supply", "charged with possession"), so a genuine charge still matches.
    "charged with (emotion|emotions|tension|drama|significance|meaning|history|intensity|passion|atmosphere|electricity|feeling|feelings|nostalgia|needle|spice|edge|importance|energy|expectation|expectations|symbolism|jeopardy|occasion|sentiment|anticipation|excitement|menace|romance|controversy|confidence|belief|self.?belief|adrenaline?|purpose|momentum|desire|aggression|urgency|positivity|optimism|swagger|determination|hope|hunger|verve|venom)",
    // "charged with the task of avoiding relegation", "charged with the job of
    // rebuilding", "charged with the responsibility of leading a young squad" —
    // the appointment/mandate framing for a new coach, captain or GM, the stuff
    // of every managerial-hire and captaincy story. The VERB form ("charged with
    // turning the club around") is stripped above, but the noun-object form puts
    // "the task"/"the job" between "with" and the verb, so it slipped past that
    // verb strip and tripped the bare `charged with` crime pattern, hiding
    // ordinary hiring/leadership news under "violence, crime or abuse" for anyone
    // with the main filter on. Stripped ONLY before a duty/mandate noun (with a
    // couple of adjective words allowed in between — "the unenviable task", "the
    // sole responsibility") — none of which is ever a crime — so a real "charged
    // with assault / DUI / possession / a crime" (an offence named directly)
    // still matches, matching the emotion-noun scoping above.
    // "role"/"goal" are deliberately OFF the noun list: "charged with a role in
    // the assault" / "charged with a goal to end the abuse" would otherwise strip
    // "charged with" and leave an unqualified crime word that no longer trips the
    // (qualifier-scoped) violence pattern. task/job/responsibility/mission/mandate
    // carry no such "<noun> in the <crime>" idiom, so they stay.
    "charged with (a|an|the|their|its|his|her|another|this|that) ([\\w'-]+ ){0,2}(task|tasks|job|jobs|responsibilit(?:y|ies)|dut(?:y|ies)|mission|missions|mandate|mandates|brief|briefs|remit|remits|assignment|assignments|objective|objectives|challenge|challenges|honou?r of)\\b",
    // "Sentenced to relegation / the drop / mid-table mediocrity / another season
    // in the Championship" is the staple English-football framing for a club whose
    // fate is now sealed — the figurative use of the bare `sentenced to` crime
    // pattern, which pulled ordinary relegation recaps under "violence, crime or
    // abuse" for anyone with the main filter on. Stripped ONLY before a sporting-
    // fate object (relegation, the drop, obscurity, a season/campaign in a lower
    // tier …), so a real "sentenced to 15 years" / "sentenced to a year in prison"
    // / "sentenced to prison" — which name a term or place, never these football
    // fates — still matches. `season`/`campaign` are the only "… in the" nouns
    // allowed on purpose: nobody is "sentenced to a season in jail", but "a stint
    // in jail" is a real sentence, so `stint`/`spell` stay off the list.
    "sentenced to (a |an |the |another |yet another |more )?(relegation|demotion|drop|drop zone|mid[ -]?table|mediocrity|obscurity|oblivion|irrelevance|purgatory|wilderness|(season|campaign) in the)",
    // Abuse of a rule/loophole, not a person.
    "abus(e|ed|ing) (the|a) (rule|loophole|system|clock|zone)",
    // "held hostage by penalties / by VAR / by the weather" and "hostage to
    // fortune / to their nerves" — the staple figurative complaint about a team
    // or a game held back by something out of its control, never a real captive.
    // It tripped the bare `hostage` crime pattern and pulled ordinary recaps
    // under "violence, crime or abuse" for anyone with the main filter on.
    // Stripped ONLY when the captor is an abstract game/condition noun — so a
    // real "held hostage by armed men", "taken hostage", or a "hostage
    // situation/crisis" (a person or no captor at all, never one of these nouns)
    // still matches violence, matching the scoping the strips above use.
    "hostage (by|to) (the |their |its |his |her |our |a |an )?(turnovers?|penalt(?:y|ies)|fouls?|foul trouble|injur(?:y|ies)|weather|rain|wind|conditions|VAR|video reviews?|replay reviews?|reviews?|the schedule|the fixture list|the clock|the calendar|nerves?|fear|doubt|indecision|momentum|officiating|fortune)",
    // "diagnosed with a hamstring strain / a high ankle sprain / a torn ACL / a
    // fractured metatarsal" — the routine injury-diagnosis update that fills a
    // sports feed. `diagnosed with` is the medical catch-all for an unnamed
    // illness (cancer, ALS, a heart condition etc. carry their own cues), so a
    // plain muscle/joint diagnosis tripped it and read as "serious illness" for
    // anyone with the main filter on — exactly the roster-injury news the module
    // deliberately keeps VISIBLE (see the injury note: "torn ACL ends his season"
    // stays readable). Stripped ONLY when the object is a musculoskeletal injury:
    // a body part followed by an injury noun ("hamstring strain", "knee injury"),
    // or an injury adjective followed by a body part ("torn ACL", "fractured
    // metatarsal"). Head/neck/spine/organs and every named illness are left off
    // the body-part list, so "diagnosed with a concussion" (its own injury cue),
    // "diagnosed with a heart condition" and "diagnosed with pancreatic cancer"
    // all still match. `_bp` and `_adj` are inlined into both forms below.
    "diagnosed with (a |an |his |her |their |the )?([\\w'-]+ ){0,3}(hamstrings?|quads?|quadriceps|calf|calves|groin|hips?|glutes?|obliques?|adductors?|abductors?|thighs?|shins?|hip.?flexors?|knees?|ankles?|shoulders?|wrists?|thumbs?|fingers?|hands?|foot|feet|elbows?|toes?|forearms?|biceps?|triceps?|ribs?|collar.?bones?|clavicles?|kneecaps?|patella|meniscus|acl|mcl|pcl|lcl|achilles|metatarsals?|ligaments?|tendons?|cartilage|rotator cuff|labrum) (strains?|sprains?|tears?|knocks?|niggles?|injur(?:y|ies)|problems?|issues?|complaints?|damage|tightness|soreness|fractures?|ruptures?|contusions?|bruis(?:e|es|ing)|tweaks?|pulls?|inflammation|tendin?itis)",
    "diagnosed with (a |an |his |her |their |the )?([\\w'-]+ ){0,3}(torn|ruptured|fractured|broken|sprained|strained|dislocated|bruised|pulled|tweaked|cracked|twisted|damaged|inflamed) (a |an |his |her |their |the )?(hamstrings?|quads?|quadriceps|calf|calves|groin|hips?|glutes?|obliques?|adductors?|abductors?|thighs?|shins?|hip.?flexors?|knees?|ankles?|shoulders?|wrists?|thumbs?|fingers?|hands?|foot|feet|elbows?|toes?|forearms?|biceps?|triceps?|ribs?|collar.?bones?|clavicles?|kneecaps?|patella|meniscus|acl|mcl|pcl|lcl|achilles|metatarsals?|ligaments?|tendons?|cartilage|rotator cuff|labrum)",
  ].join("|"),
  "gi",
);

// One category = a list of patterns. A pattern only fires on a phrase specific
// enough to describe an actual event.
const PATTERNS: Record<SensitiveCategory, RegExp[]> = {
  death: [
    /\b(dies|died|dying)\b/i,
    // "found lifeless" is the euphemistic sibling of "found dead" — the phrasing
    // outlets reach for on exactly these stories ("Star found lifeless in his
    // hotel room", "found lifeless by team staff") — yet only "found dead" was
    // listed, so a real death written this way slipped straight past "Hide
    // upsetting news", the module's cardinal failure. It is added as the whole
    // phrase, NOT a bare `lifeless`: on its own "lifeless" is a staple flat-
    // performance idiom ("a lifeless display", "the crowd was lifeless") that a
    // bare word would pull under "death or tragedy". "found lifeless" carries no
    // such figurative sense — it names a person discovered dead — so it is safe.
    /\bdead at\b|\bfound dead\b|\bfound lifeless\b|\bpronounced dead\b|\bshot dead\b/i,
    /\bdeath of\b|\b(his|her|their) death\b|\bcause of death\b|\bdeath (toll|investigation|certificate)\b/i,
    /\bpass(es|ed) away\b|\bpassing of\b|\buntimely (death|passing)\b/i,
    // "lost his/her/their life" (and the plural "lost their lives") — the death
    // euphemism serious reporting reaches for when someone is killed in a fall,
    // crash or disaster ("Cyclist who lost his life in the crash remembered",
    // "Two supporters lost their lives"). None of the cues above names it: a
    // tribute or anniversary piece written this way carries no died/killed/fatal/
    // obituary word, and the crash itself is opt-in `crash` (off by default), so
    // it slipped straight past "Hide upsetting news" — the module's cardinal
    // failure. Scoped to a PERSON subject (his/her/their, never "its"), so a team
    // that "lost its spark" is untouched, and a negative lookahead drops the
    // money sense ("lost his life savings/earnings/fortune betting") — a real
    // death never takes those objects — so that gambling-loss story is not
    // mislabelled "death or tragedy".
    /\blost (his|her|their) (life|lives)\b(?!\s+(savings|earnings|fortunes?|deposits?|money|insurance|policy|policies|nest egg))/i,
    // "claimed the life/lives of" — the death euphemism serious reporting reaches
    // for when a disaster or fatal incident kills someone ("The stampede claimed
    // the lives of 39", "Avalanche claims the life of a mountaineer", "the crash
    // that claimed the lives of three players"). It is the fatal-event twin of
    // "lost his life" above (there the victim is the subject; here the disaster
    // is), and none of the cues above has to name it: an anniversary or tribute
    // piece written this way can carry no died/killed/fatal/obituary word — and
    // the crash itself is opt-in `crash` (off by default) — so it slipped past
    // "Hide upsetting news", the module's cardinal failure. Safe as a bare
    // phrase: "claim the life/lives of" is only ever a real fatality (the
    // winner-reveal "claim the title/win" idiom takes a trophy noun, never
    // "the life/lives of"), so it needs no idiom carve-out.
    /\bclaim(s|ed|ing)? the (life|lives) of\b/i,
    // "succumbed to his injuries / to a long illness / to the disease" — the
    // death euphemism reporting reaches for when someone dies of what hurt or
    // sickened them ("Rider succumbed to his injuries", "Legend succumbs to
    // cancer at 71", "succumbed to injuries sustained in the crash" — the crash
    // itself being opt-in `crash`, off by default). None of the cues above names
    // it, so a story written this way slipped past "Hide upsetting news". `succumb`
    // is heavy sports idiom on its own, though — a team "succumbs to a late
    // winner / to pressure / to a 3-0 defeat" — so this is scoped to the objects a
    // real death takes and those idioms never do (injuries, wounds, an illness,
    // a disease, cancer, complications, an infection); "a late winner"/"pressure"/
    // "a defeat" carry none of them, so those recaps stay visible.
    /\bsuccumb(s|ed|ing)? to (?:his |her |their |the |a |an |long |serious |severe |lengthy |brief |brave |year.?long )*(injur(y|ies)|wounds?|illness|disease|cancer|complications|infection)\b/i,
    // "lost/loses his battle with cancer" — the obituary euphemism reporting
    // reaches for when someone dies of a long illness ("Club legend loses long
    // battle with illness", "Former striker lost his brave battle with cancer",
    // "loses her fight against leukaemia"). It is the twin of "succumbed to <a
    // long illness>" above, and the cues elsewhere miss it: without a specific
    // disease word the bare `cancer` medical pattern never fires, so a generic
    // "battle with illness/disease" carried no died/passing/obituary cue and
    // slipped past "Hide upsetting news" — the module's cardinal failure; and a
    // "battle with cancer" only landed under "serious illness" (medical), not
    // "death", though the person has died. `battle`/`fight` is heavy sports idiom
    // on its own — a "relegation battle", a "battle with injury/form/his weight",
    // "loses the battle for a starting spot" — so this is scoped tight: only the
    // death verbs (lost/loses/losing) paired with a battle/fight WITH/AGAINST/TO
    // an ILLNESS object (never "injury", which is recovery talk, and never a
    // team-place, a rival or an abstract goal), so those living-with and
    // competitive "battle" stories stay visible. "continues his brave MND battle"
    // (someone still fighting) carries no death verb and stays medical.
    /\b(?:lost|loses|losing) (?:his |her |their |the |a |an |another )*(?:brave |long |lengthy |courageous |hard[- ]?fought |tough |private |secret |brief |year.?long |two.?year |[\w-]+.?year )*(?:battle|fight) (?:with|against|to) (?:a |an |the |his |her |their |long |serious |severe |lengthy |brief |brave |rare |aggressive |terminal )*(?:cancer|illness|disease|leuk(?:ae|e)mia|tumou?rs?|dementia|alzheimer'?s?|parkinson'?s?|motor neurone disease|MND|ALS)\b/i,
    // "in loving memory" — the tribute-graphic and memorial-post phrasing a
    // club, teammate or fan reaches for on a death ("In loving memory of a club
    // legend", "In Loving Memory, 1975–2026"). It sits in the same family as the
    // obituary/in memoriam/memorial cues beside it, but none of them catches it:
    // "in memoriam" is the Latin form and "memorial service/for" needs the word
    // "memorial", so a tribute written this way — carrying no died/passing/
    // obituary/tragedy cue of its own — slipped straight past "Hide upsetting
    // news", the module's cardinal failure. Unlike a bare "memory" (staple sports
    // idiom: "muscle memory", "the best in recent memory", "a memory to cherish"),
    // the full phrase "in loving memory" is only ever a memorial, so it needs no
    // carve-out and is safe as a bare phrase — matching "rest in peace" above.
    /\bobituary\b|\bin memoriam\b|\bin loving memory\b|\bmemorial (service|for)\b|\bfuneral\b|\bposthumous(ly)?\b/i,
    // "laid to rest" — the burial euphemism a funeral story reaches for in the
    // headline ("Beloved coach laid to rest as thousands line the streets",
    // "Legend laid to rest in his hometown"). It sits in the same family as the
    // obituary/funeral/memorial cue above, but none of those words has to appear
    // for a paper to run this one, so a burial-day tribute written this way
    // slipped straight past "Hide upsetting news" — the module's cardinal
    // failure. The catch is that "lay/laid to rest" is also a staple figurative
    // idiom for settling a dispute ("laid to rest the doubts over his fitness",
    // "finally laid to rest the ghosts of last season", "laid to rest the debate",
    // "laid to rest talk of a move"), which a bare phrase would pull under "death
    // or tragedy". The negative lookahead drops exactly that sense — an
    // abstract-argument object (doubts, debate, questions, ghosts, demons, fears,
    // concerns, talk, speculation, rumours, myth, nerves), with an optional
    // determiner/qualifier in front — a real burial never takes those objects
    // (it is followed by a time, a place, "as …", or a person), so the funeral
    // sense matches while the idiom stays visible. Same negative-lookahead shape
    // as the "lost his life savings" money-sense guard above.
    /\blaid to rest\b(?!\s+(?:the |any |all |those |these |some |lingering |longstanding |long.?running |old )*(?:doubts?|debates?|questions?|ghosts?|demons?|fears?|concerns?|talk|speculation|rumou?rs?|myths?|nerves?|arguments?))/i,
    /\bfatal(ly)?\b|\bfatalit(y|ies)\b/i,
    /\bkilled (in|by|when|after|during|at)\b|\bwas killed\b|\bkills? (\d+|several|dozens)\b/i,
    /\bmurder(ed|s)?\b|\bhomicide\b|\bmanslaughter\b/i,
    /\bmourn(s|ing|ed)?\b|\bgrieving\b|\btribute to the late\b|\bthe late\b/i,
    // "condolences" — the sympathy-on-a-death word a club, league or the wider
    // sport reaches for when someone connected to it dies ("The club sends its
    // condolences to the family", "Messages of condolence pour in for the late
    // captain", "Federation offers condolences following the sudden loss"). It
    // sits in the same family as the mourn/grieving/tribute cues beside it, but
    // none of them has to appear for a statement written this way to run: a bare
    // "offers its condolences" carries no died/passing/obituary/tragedy cue of
    // its own, so a bereavement notice framed only this way slipped straight past
    // "Hide upsetting news" — the module's cardinal failure. Safe as a bare word:
    // "condolence(s)" is only ever an expression of sympathy for a death or
    // bereavement — it has no figurative sports sense the way "battle" / "the
    // late" / "memory" do — so it needs no idiom carve-out.
    /\bcondolences?\b/i,
    // `bus crash` joins the vehicle-crash cues: a team-bus crash is a recurring,
    // grievous sports tragedy (a junior/amateur squad wiped out on the road — the
    // Humboldt Broncos the best-known), yet without the word it only caught when
    // the headline also said "fatal"/"killed"/"dead", so anniversary and survivor
    // coverage ("remembers the team bus crash five years on") slipped past the
    // main "Hide upsetting news" toggle — the crash itself being opt-in `crash`,
    // off by default. Unlike its neighbour `car crash` (whose "was a car crash"
    // shambles idiom needs the strip above), "bus crash" carries no figurative
    // sports sense, so it needs no idiom carve-out and is safe as a bare phrase.
    /\bplane crash\b|\bhelicopter crash\b|\bcar crash\b|\bbus crash\b|\bfatal crash\b|\bcrash that killed\b/i,
    /\btragedy\b|\btragic(ally)?\b/i,
    /\bR\.?I\.?P\.?\b/,
    // "rest in peace" spelled OUT — the tribute a club/fan post or headline
    // reaches for on a death ("Rest in peace, legend", "Rest In Peace to a true
    // great"). The line above catches only the RIP / R.I.P. abbreviation, so a
    // tribute written in full — carrying no died/passing/obituary/tragedy cue of
    // its own — slipped past "Hide upsetting news", the module's cardinal
    // failure. Unlike its burial-euphemism neighbour "laid to rest", the full
    // phrase "rest in peace" has no settle-a-debate idiom sense (that idiom is
    // "put to rest" / "lay to rest", never "rest in peace"), so it needs no
    // carve-out and is safe as a bare phrase.
    /\brest in peace\b/i,
    // "gone too soon" — the tribute-post and headline phrasing outlets and clubs
    // reach for when a young athlete dies ("A true great, gone too soon", "The
    // football world remembers a legend gone far too soon at 24"). It sits in the
    // same family as "the late" / "in loving memory" / "rest in peace" beside it,
    // but none of those has to appear for a paper or fan account to run this one,
    // so a tribute written this way — carrying no died/passing/obituary/tragedy
    // cue of its own — slipped straight past "Hide upsetting news", the module's
    // cardinal failure. Kept a bare phrase like its tribute neighbours: the
    // 3-word "gone too soon" is overwhelmingly the death sense. Its close cousins
    // are deliberately OUT because each collides with a high-frequency sports
    // idiom a bare phrase would over-hide — "taken too soon" is draft-grade talk
    // ("taken too soon in the draft"), and "taken from us" is the officiating-
    // grievance staple ("three points taken from us by a VAR call") — so neither
    // is added here.
    /\bgone (far |much |all )?too soon\b/i,
  ],
  violence: [
    /\b(sexual(ly)? (assault|abuse|misconduct|harassment)|aggravated assault|assault charges?|assault case|assaulting|assaulted|assault and battery|domestic (violence|assault|abuse))\b/i,
    /\brape(d)?\b|\bmolest(ed|ation|ing)?\b|\bgroom(ing|ed) (a )?(minor|child)\b|\bchild abuse\b|\bsex (crime|trafficking|abuse)\b/i,
    /\b(abuse|abusive) (allegations?|claims?|scandal|case|survivors?|victims?)\b|\b(racial|verbal|physical|emotional) abuse\b/i,
    // `(?<!cardiac )` keeps the crime sense of "arrest" while letting the medical
    // one fall through. Without it a real "suffers cardiac arrest" headline tripped
    // this bare `\barrest\b` and — because violence is checked before medical in
    // BASE_CATEGORIES — was labelled "violence, crime or abuse" instead of "serious
    // illness", even though the medical list below names cardiac arrest outright.
    // The item is hidden either way (both categories are on under the main toggle),
    // so this corrects the exported CATEGORY, not visibility. Only "cardiac " is
    // carved out — the medical pattern recovers exactly that phrase (plural too) —
    // so every genuine "player arrested / arrests / arrested on …" still trips here.
    /\b(?<!cardiac )arrest(ed|s)?\b|\bindict(ed|ment)\b|\bcharged with\b|\bpleads? guilty\b|\bfound guilty\b|\bconvicted\b|\bsentenced to\b|\bfaces? (charges|trial|prison)\b/i,
    // A homicide in the GERUND form, "murdering", inside an unambiguous
    // accusation/conviction frame. The death list catches "murder"/"murdered"/
    // "murders" (checked first, with the bare noun) but NOT the gerund, and the
    // "accused of (assault|abuse|…)" list below never included homicide — so a
    // real "admits murdering his wife", "accused of murdering a rival" or
    // "jailed for murdering" slipped past "Hide upsetting news" entirely. Some
    // frames ("charged with murdering", "pleaded guilty to murdering") already
    // trip the line above; this closes the ones that don't. Scoped to a legal
    // frame + "murdering" because that phrasing is only ever a real homicide —
    // "killing" / "strangling" / "suffocating" are deliberately OUT, each having
    // a staple game-idiom sense ("killing the clock", "suffocating defense")
    // this frame can't safely disambiguate. A blowout "murdering it/them/the
    // competition" carries no such frame (and "it/that" is already idiom-
    // stripped), so it stays visible.
    /\b(accused of|admits|admitted|confess(?:es|ed)? to|jailed for|imprisoned for) murdering\b/i,
    /\bmass shooting\b|\bfatal shooting\b|\bshooting (death|suspect|victim|rampage|spree|incident|outside|at a|near)\b|\bshot and (killed|wounded)\b|\bopened fire\b|\bgunman\b|\bgun violence\b/i,
    /\bstabb(ed|ing)\b|\bbeaten (up|unconscious)\b|\bbrutal(ly)? (attack|beat)/i,
    /\bkidnap(ped|ping)?\b|\bhostage\b|\bhuman trafficking\b/i,
    /\bDUI\b|\bDWI\b|\bdrunk driving\b|\bhit.and.run\b/i,
    /\bhate crime\b|\bracist (abuse|attack|incident)\b|\bdeath threats?\b|\bgunpoint\b/i,
    // Abuse aimed at a person, in the forms sport actually produces it: crowd
    // abuse, racist DMs, pile-ons. The bare word stays out — "abused the rule".
    /\b(online|racial|racist|homophobic|sexist|misogynistic|spectator|crowd|fan) abuse\b|\babuse (directed at|aimed at|towards?)\b|\bejected for abuse\b|\babused online\b/i,
    // Someone physically going after a person, as opposed to "attacked the rim".
    /\b(fans?|players?|supporters?|coach(es)?|referees?|staff) (were |was |get |gets |got )?attacked\b|\battacked (a |an |the )?(\w+ )?(fans?|players?|supporters?|coach(es)?|referees?|woman|man|child|crowd)\b/i,
    /\bviolently (pushed|shoved|thrown|grabbed|dragged|struck)\b|\bspit(s|ting)? (on|at)\b|\bspat (on|at)\b/i,
    /\bdetained by police\b|\bpolice investigation\b|\bunder investigation for\b|\btaken into custody\b/i,
    /\blawsuit alleging\b|\baccused of (assault|abuse|rape|misconduct|violence)\b|\ballegations? of (assault|abuse|rape|misconduct)\b/i,
  ],
  // The moment someone gets hurt — what you actually flinch at. Roster-move
  // injury news ("placed on the IL", "out 4-6 weeks", "torn ACL ends his
  // season") is deliberately absent; see the module note.
  injury: [
    /\bhit (in|on) the (head|face|neck|helmet|jaw|eye|temple|skull)\b/i,
    /\bstruck (in|on) the (head|face|neck|helmet|jaw|eye)\b/i,
    // Only an OBJECT to the head — bare "to the head" also catches a soccer
    // goal scored "off the head".
    /\b(pitch|fastball|ball|puck|shot|line drive|elbow|knee|punch|kick|blow|bat|club|stick|helmet) to the (head|face|neck|jaw)\b/i,
    /\btook a (pitch|puck|ball|fastball|line drive|shot|knee|elbow|punch) (to|off)\b/i,
    /\bbean(ed|ball)\b|\bhit by a (pitch|line drive|puck|foul ball|batted ball)\b/i,
    /\bline drive off\b|\bstruck by a (pitch|puck|ball|line drive|bat|club)\b|\bfan (struck|hit) by\b/i,
    /\bconcussion\b|\bhead (injury|trauma|contusion)\b|\bhelmet.to.helmet\b|\bskull fracture\b/i,
    /\bknocked (unconscious|out cold)\b|\bwent limp\b|\blay motionless\b|\bnot moving on the (field|ice|pitch|court)\b/i,
    // A fight is only filtered when it ends badly — plain fights and KOs are the
    // sport and stay visible (Jacob 8/21).
    /\bunresponsive\b|\bnever regained consciousness\b|\bbrain bleed\b|\bflatlined\b|\bhospitali[sz]ed after the (fight|bout|match|game)\b/i,
    // "critically injured / wounded" — a life-threatening injury, the sibling of
    // the medical list's "critical condition" cue. None of the other injury cues
    // names it on its own, so a real "Driver critically injured in a crash" /
    // "Two fans critically injured when the stand collapsed" read as an ordinary
    // headline and slipped straight past "Hide upsetting news" (the crash itself
    // is opt-in `crash`, off by default). Scoped to injured/wounded because those
    // verbs only ever take a real body — you do not "critically injure a lead" —
    // whereas "hurt" freely takes an abstract object ("critically hurt his title
    // chances"), which would pull an ordinary recap under "injury"; and unlike a
    // bare "seriously injured" (routine roster news the module keeps visible)
    // "critically" marks the emergency this list exists for.
    /\bcritically (injured|wounded)\b/i,
    // "life-changing injuries" — the phrase serious reporting reaches for when a
    // fall, collision or crash leaves someone permanently harmed (a rugby, cycling
    // or motorsport spinal or limb injury): "Rider suffers life-changing injuries",
    // "Boxer left with life-changing injuries after the bout". It is exactly the
    // catastrophic-harm wince this list targets — the sibling of "critically
    // injured" above and the medical list's "paralyzed" — yet none of the other
    // cues names it, so unless the headline also said "collision"/"critically" it
    // slipped straight past "Hide upsetting news". Scoped to the object "injury"/
    // "injuries": a bare "life-changing" is a staple upside idiom ("a life-changing
    // payday", "life-changing money", "a life-changing moment"), but that sense
    // never takes "injury" as its object — "life-changing injuries" is only ever
    // the literal, permanent kind — so the phrase is safe while the idiom stays
    // visible. `.?` spans the "life changing" / "life-changing" spellings.
    /\blife.?changing injur(y|ies)\b/i,
    /\bcollision\b|\bcollided\b|\bviolent(ly)? (fall|crash|hit|tackle)\b/i,
    // Someone HURT in a wreck. `crash` is opt-in, so before this a rider
    // "injured in a crash" tripped neither toggle's default and sat in the feed
    // (Jacob 8/31 — Pogacar abandoning the Vuelta, on r/sports). Both Settings
    // hints promise the main toggle covers a crash that hurt someone; these two
    // patterns are what make that true. Deliberately requires BOTH a
    // getting-hurt word and a wreck word, so roster injury news ("on the
    // injured list", "out 4-6 weeks") still reads.
    /\b(injur(ed|y|ies)|hurt|banged up|broke|broken|fractured?|dislocated?)\b[^.]{0,60}\b(crash|wreck|collision|pile.?up|high.?side|spill|shunt)\b/i,
    /\b(crash|wreck|collision|pile.?up|shunt)\b[^.]{0,60}\b(injur(ed|y|ies)|hurt|taken to hospital)\b/i,
    /\b(gruesome|horrific|grisly|scary|sickening|ugly) (injury|scene|moment|fall|crash|collision|hit|landing)\b/i,
    // A player leaving the game HURT. The lookahead requires a genuine injury
    // cue somewhere after the departure — "hurt", "in pain", blood, a knock, a
    // limp, being stretchered/carted, a strain/tear/fracture, etc. The bare
    // words `after`, `with` and `hit` used to sit here too, but they carry no
    // injury meaning on their own and appear in the most ordinary exit lines a
    // sports feed runs — "leaves the game with a 5-run lead", "exits the game
    // with a save", "leaves the game after six shutout innings" — so every one
    // of those pitching-line recaps read as "an on-field injury" and vanished
    // for anyone with the main "Hide upsetting news" toggle on. Dropping them
    // and keeping the specific cues below matches the module rule that a pattern
    // fire only on a phrase specific enough to describe an actual event: a real
    // "leaves the game after taking a knock to the head" / "left the field with
    // a hamstring strain" still trips, while "with the win" / "after 100
    // pitches" no longer does. (A blow to the head that ends a game is caught by
    // the head-impact patterns above regardless of where "leave" sits.)
    /\b(forced to leave|leaves|left|exits|exited) the (game|match|field|ice|court|track)\b(?=[^.]*\b(hurt|injur|pain|blood|bleeding|concuss|knock|limp|hobbl|grimac|winc|clutching|holding (his|her|their)|down injured|in distress|discomfort|stretcher(ed)?|carted|dazed|woozy|winded|cramp|strains?|sprains?|tears?|torn|fractures?|dislocat|ruptur|collision|collided))/i,
    /\b(compound|orbital|facial|jaw|nose|skull) fracture\b|\bdislocat(ed|ing) (his|her|their|an?)\b|\bbloodied\b|\bopen wound\b/i,
    /\bblows? to the (back of the )?head\b|\bshots? to the back of the head\b/i,
  ],
  medical: [
    // `leuka?emia` spans the British "leukaemia" and American "leukemia"
    // spellings, the parity the `tumou?r` alternation already carries. The
    // soccer/rugby/cricket feeds use the British `ae` form ("continues his
    // brave leukaemia battle", "leukaemia research"), so those exact stories
    // slipped past "Hide upsetting news" while only the American spelling matched.
    /\bcancer\b|\btumou?r\b|\bleuka?emia\b|\blymphoma\b|\bchemotherapy\b|\bterminal(ly)? ill\b/i,
    // MND is what the UK/AU press calls ALS, and it is how rugby/cricket
    // stories are always headlined — "MND-diagnosed" also misses the
    // "diagnosed with" pattern below, so the bare acronym has to be here.
    // `multiple sclerosis` joins the named chronic-disease list alongside
    // ALS/MND: it reaches the feed through "living with"/fundraiser features
    // ("continues to live with multiple sclerosis", "multiple sclerosis
    // research") that carry no "diagnosed with"/hospital cue, so it must match
    // on the full disease name alone. Only the two-word phrase fires — a bare
    // "sclerosis" carries no sports sense but is not distinctive enough to need.
    /\bALS\b|\bMND\b|\bmotor neuron[e]? disease\b|\bmultiple sclerosis\b|\bParkinson'?s\b|\bAlzheimer'?s\b|\bdementia\b|\bCTE\b/i,
    // `(arrest|event|episode)s?` covers the plural "cardiac arrests" ("two
    // players suffered cardiac arrests this season"); the singular's `(?<!cardiac )`
    // violence carve-out already spares the plural "arrests" too, so without the
    // `s?` here the plural fell through to no flag at all. The stroke qualifier
    // group catches "suffered a possible/suspected/minor stroke" — real cardiac
    // wording — while "stroke of genius" stays clear (no "suffered a" precedes it).
    /\bcardiac (arrest|event|episode)s?\b|\bheart attack\b|\bstroke suffered\b|\bsuffered a (possible |suspected |minor |major |mild )?stroke\b|\baneurysm\b|\bblood clots?\b|\bpulmonary embolism\b/i,
    /\bcollapsed? (on|during|at|mid)/i,
    // `ventilator` joins the emergency-state cues alongside `life support` and
    // `intensive care`: someone on a ventilator is in the same critical ICU
    // situation. None of the other cues names it on its own, so a real "Coach on
    // a ventilator after collapse" / "Boxer placed on a ventilator following the
    // bout" slipped straight past "Hide upsetting news" — `collapse`/`bout` as
    // bare nouns don't trip the `collapsed? (on|during|at|mid)` cue, so the item
    // had no other flag. Safe as a bare word like its cluster-mates: sports has
    // no figurative "ventilator" (a venue's "ventilation system" is a different
    // word `\bventilator\b` never matches), so it needs no idiom carve-out.
    /\bcritical condition\b|\blife support\b|\bventilators?\b|\bintensive care\b|\bin a coma\b|\bcomatose\b|\blife.threatening\b|\bfighting for (his|her|their) life\b/i,
    // `paraly[sz](ed|ing)` spans the British "paralysed"/"paralysing" and
    // American "paralyzed"/"paralyzing" spellings, the same both-spellings
    // widening `hospitali[sz]ed` and `euthani[sz]ed` already carry. The app's
    // soccer/rugby/cricket feeds use the British `s` form ("winger left
    // paralysed from the waist down", "paralysed in a horror crash"), so those
    // exact stories slipped straight past "Hide upsetting news" while only the
    // American `z` spelling matched. The suffix requirement is what keeps
    // "Paralympics"/"Paralympic" out (no `[sz]` + ed/ing follows "paraly"), and
    // the British spelling carries no sports sense the American one doesn't
    // already, so the parity adds no new false-positive risk.
    /\bparaly[sz](ed|ing)\b|\bparalysis\b|\bspinal (injury|cord)\b|\bamputat(ed|ion)\b/i,
    /\bdiagnosed with\b|\bhospitali[sz]ed\b|\brushed to (the )?hospital\b|\bemergency surgery\b/i,
    /\bseizure\b|\bstretchered off\b|\bcarted off\b/i,
  ],
  animal: [
    /\banimal (cruelty|abuse|welfare case)\b|\bdog ?fighting\b|\bcock ?fighting\b/i,
    /\b(horse|greyhound|dog|animal)s? (died|dies|euthani[sz]ed|put down|destroyed after|collapsed)\b/i,
    /\beuthani[sz]ed\b|\bbullfight(ing)?\b|\bpoach(ing|ers)\b/i,
  ],
  // Racing wrecks and hard falls — opt-in only (see BASE_CATEGORIES). A fatal or
  // hospitalizing one is already `death`/`injury`, so this list is the ones
  // everybody walks away from.
  crash: [
    /\bcrash(es|ed|ing)?\b|\bcrashed out\b|\bwreck(s|ed|age)?\b|\bpile.?up\b/i,
    /\bhit the wall\b|\binto the (wall|barriers?|tyre wall|tire wall|catch fence)\b|\bspun (out|into)\b/i,
    /\bflip(s|ped)? (over|through the air)\b|\bwent airborne\b|\bbarrel roll\b|\brolled the car\b/i,
    /\bburst into flames\b|\bengulfed in flames\b|\bcar fire\b|\bfireball\b/i,
    /\b(nasty|huge|massive|horror|violent|scary) (crash|wreck|fall|spill|shunt)\b|\bshunt\b|\bwipe ?out\b|\bwiped out (on|in|at)\b/i,
    /\bcame off (his|her|the) bike\b|\bhigh.?side\b|\btumbl(ed|ing) down\b/i,
  ],
  selfharm: [
    /\bsuicide\b|\bsuicidal\b|\bdied by suicide\b|\bself.harm\b/i,
    // "<took|takes|take|taking> his/her/their own life" — the standard obituary
    // euphemism for a suicide. Only the PAST tense matched before, so an obit
    // written in the headline present ("Ex-player takes his own life at 38") or
    // the infinitive after an attempt verb ("tried to take his own life") — both
    // ordinary phrasings — leaked straight past "Hide upsetting news". "take one's
    // own life" carries no figurative sports sense in any tense, so broadening the
    // verb adds no false-positive risk. Mirrors the tense-coverage fixes already
    // applied elsewhere in this file (the stroke/died pattern families).
    /\b(took|takes?|taking) (his|her|their) own life\b/i,
    // "ended his/her/their own life" — the other standard suicide euphemism
    // reporting reaches for, the direct sibling of "took his own life" above
    // ("Former striker ended his own life at 34", and the infinitive after an
    // attempt verb "tried to end his own life"). None of the cues above names
    // it — "ended" is not "took", and a report written this way carries no bare
    // `suicide`/`self-harm` word of its own — so it leaked straight past "Hide
    // upsetting news", the module's cardinal failure. "end one's own life" is
    // only ever a real suicide and has no figurative sports sense in any tense:
    // the eagerness/streak idioms take a different object ("ended his own
    // drought/dry spell/wait", never "life"), so broadening the verb adds no
    // false-positive risk, exactly as the "took/takes/taking" tenses above.
    /\bend(s|ed|ing)? (his|her|their) own life\b/i,
    /\boverdose(d)?\b|\bfatal overdose\b/i,
    /\bmental health crisis\b|\bchecked into rehab\b|\beating disorder\b/i,
    // Addiction itself — the other half of this category's label ("self-harm or
    // addiction"). Until now only its endpoints matched (an `overdose`, a
    // `checked into rehab`), so an ordinary "opens up about his gambling
    // addiction", "battled alcoholism" or "reveals a drug addiction" — the exact
    // personal-struggle story the toggle exists to spare someone — leaked
    // straight past "Hide upsetting news". Three scoped forms, none of which the
    // benign uses take: a substance modifier + "addiction" (a compound never used
    // figuratively — note it is "substance addiction", not the leagues' "substance
    // ABUSE policy", which stays visible); "addiction" as the subject of a
    // battle/recovery/treatment noun or a struggle/disclosure verb (so "addicted
    // to winning" / "addictive to watch" — which never use the noun "addiction" —
    // stay visible); and bare "alcoholism", which carries no figurative sense.
    /\b(drug|alcohol|substance|gambling|opioid|opiate|cocaine|heroin|painkiller|prescription|betting) addiction\b/i,
    /\baddiction (battle|struggle|recovery|treatment|counsell?ing|problem|issues?|clinic|relapse)\b/i,
    /\b(battl(?:e|ed|es|ing)|struggl(?:e|ed|es|ing)|grappl(?:e|ed|es|ing)|wrestl(?:e|ed|es|ing)|overcome|overcame|beat|beaten|recovering from|reveal(?:s|ed)?|admits?|admitted|confess(?:es|ed)?|open(?:s|ed)? up about) (?:a |an |his |her |their |serious |severe |secret |long )*addiction\b/i,
    /\balcoholism\b|\brecovering alcoholic\b/i,
  ],
};

export const CATEGORY_LABELS: Record<SensitiveCategory, string> = {
  death: "death or tragedy",
  violence: "violence, crime or abuse",
  injury: "an on-field injury",
  medical: "serious illness",
  animal: "harm to animals",
  selfharm: "self-harm or addiction",
  crash: "a crash or wreck",
};

// The category a piece of text trips, or null. Exported for the unit tests and
// for any future per-category UI; the app itself only needs the boolean.
export function sensitiveCategoryOf(
  text: string,
  // Which categories are switched on. Defaults to everything the main toggle
  // covers; pass an explicit list to add `crash` or to narrow further.
  enabled: SensitiveCategory[] = BASE_CATEGORIES,
): SensitiveCategory | null {
  if (!text || enabled.length === 0) return null;
  // Strip idiom FIRST, then match. See the module note — this ordering is what
  // keeps "shooting guard" and "suicide squeeze" in the feed.
  const cleaned = text.replace(IDIOM, " ");
  for (const cat of enabled) {
    for (const re of PATTERNS[cat]) {
      if (re.test(cleaned)) return cat;
    }
  }
  return null;
}

// Headline + description only (see module note).
export function newsItemSensitiveCategory(
  item: NewsItem,
  enabled: SensitiveCategory[] = BASE_CATEGORIES,
): SensitiveCategory | null {
  return sensitiveCategoryOf(`${item.headline ?? ""} — ${item.description ?? ""}`, enabled);
}

// The two Settings toggles, resolved to the category list they switch on. Both
// off = an empty list, and every caller short-circuits to "nothing hidden".
export function enabledCategories(hideSensitive?: boolean, hideCrashes?: boolean): SensitiveCategory[] {
  const cats = hideSensitive ? [...BASE_CATEGORIES] : [];
  if (hideCrashes) cats.push("crash");
  return cats;
}

export function isSensitiveNews(item: NewsItem, enabled: SensitiveCategory[] = BASE_CATEGORIES): boolean {
  return newsItemSensitiveCategory(item, enabled) !== null;
}
