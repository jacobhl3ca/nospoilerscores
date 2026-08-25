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

// What the main "Hide upsetting news" toggle covers. `crash` is deliberately
// absent: a racing wreck is the sport, so it gets its own opt-in toggle
// (Jacob 8/21 — "fights fine if nothing terrible, crashes can have option to
// hide"). A crash that killed or hospitalized someone still matches `death` /
// `injury`, so it is caught by the main toggle regardless.
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
    // save) are match-report staples too — "decided by the late own goal", "the
    // late red card that swung the derby", "the late save from the keeper" — and
    // carry no death sense, so they join the strip on the same reasoning.
    "the late (goals?|winner|equali[sz]ers?|levell?ers?|drama|show|surge|rally|rallies|comeback|collapse|fightback|heroics|twist|scare|wobble|charge|push|flurry|burst|blitz|onslaught|strike|header|own[- ]?goals?|red cards?|sending[- ]?offs?|dismissals?|saves?|penalt(y|ies)|free.?kicks?|corner|chances?|stages?|innings?|minutes?|moments?|kick.?offs?|substitutions?|subs?|swap|changes?|withdrawals?|games?|windows?|slates?|fixtures?|match(?:es)?|ties?|sets?|sessions?|slots?)",
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
    // person subject isn't one of these nouns).
    "(hopes?|chances?|dreams?|aspirations?|bid|campaign|defen[cs]e|dynasty|title|playoffs?|postseason|season|series) ((is|are|now|still|all but|officially|basically|practically|barely|remains?|sits?|hangs?|hanging|left|already|essentially|firmly|clinging|but|no longer|almost|nearly) )*on life[ -]support",
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
    // ⚠️ Do NOT add a bare letter here. "…|b)" once matched "killed b", which
    // stripped "killed by" out of every real death headline before the patterns
    // ran ("killed by an ICE agent" scored as ordinary sports talk).
    "(kill|killer|killed|killing) (instinct|the clock|it|shot|crossover|line)",
    // "destroyed BY the Lakers" is a scoreline; "killed BY an ICE agent" is not,
    // so `by` is allowed only for the verbs that are purely scoreline idiom.
    "(slaughtered|destroyed|buried|thrashed|dismantled) (them|him|her|it|the|that|by)",
    "(murder|murdered|murdering|killed|killing) (them|him|her|it|that)",
    "drop dead",
    "over my dead body",
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
    "(styles?|titans|heavyweights|giants|philosoph(?:y|ies)|ideolog(?:y|ies)|cultures?|egos?|systems?|worlds?|approaches?|generations?) (have |had |finally |once )?collided",
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
    // Suicide as tactic.
    "suicide (squeeze|pass|sprints?|drills?|line)",
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
    // constantly. Stripped ONLY before a scoring direction (home, wide,
    // goalwards, past the keeper, into the net) or the "at the ball" clearance
    // sense, and "in" only with a ball/rebound object before it — a real
    // "stabbed to death / stabbed in the chest / stabbed over a dispute /
    // stabbing attack" carries none of these and still matches. "over" and a
    // bare "stabbed in" are deliberately OUT (a person is "stabbed over <a
    // dispute>" and "stabbed in the <neck>"), so those keep tripping violence.
    "stabb(ed|es|ing) (the ball |it |a shot |an effort |the rebound |the loose ball )?(home|wide|goalwards?|past (the |a )?(keeper|goalkeeper|goalie)|into (an|the) (empty )?net)",
    "stabb(ed|es|ing) (it|the ball|the rebound) in\\b",
    "stabb(ed|es|ing) at (the |a |the loose )?(ball|cross|rebound|delivery)",
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
    // "arrest the slide / slump / decline / rot / skid / freefall" is the staple
    // English-football framing for a team trying to halt a bad run — the
    // figurative use of the bare `arrest` crime pattern, which pulled ordinary
    // form recaps under "violence, crime or abuse" for anyone with the main
    // filter on ("desperate to arrest the slump", "boss aims to arrest the
    // rot"). Stripped ONLY when a decline noun is the object of "arrest …", with
    // a couple of article/adjective words allowed in between, so a real "player
    // arrested on assault charges" / "arrested after the match" (no such noun)
    // still matches the crime pattern.
    "arrest(s|ed|ing)? (the|their|its|his|her|a|an|this|that) ([\\w'-]+ ){0,2}(slide|slump|decline|rot|skid|freefall|free.?fall|spiral|rut|drop)",
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
    "charged with (emotion|emotions|tension|drama|significance|meaning|history|intensity|passion|atmosphere|electricity|feeling|feelings|nostalgia|needle|spice|edge|importance|energy|expectation|expectations|symbolism|jeopardy|occasion|sentiment|anticipation|excitement|menace|romance|controversy)",
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
  ].join("|"),
  "gi",
);

// One category = a list of patterns. A pattern only fires on a phrase specific
// enough to describe an actual event.
const PATTERNS: Record<SensitiveCategory, RegExp[]> = {
  death: [
    /\b(dies|died|dying)\b/i,
    /\bdead at\b|\bfound dead\b|\bpronounced dead\b|\bshot dead\b/i,
    /\bdeath of\b|\b(his|her|their) death\b|\bcause of death\b|\bdeath (toll|investigation|certificate)\b/i,
    /\bpass(es|ed) away\b|\bpassing of\b|\buntimely (death|passing)\b/i,
    /\bobituary\b|\bin memoriam\b|\bmemorial (service|for)\b|\bfuneral\b|\bposthumous(ly)?\b/i,
    /\bfatal(ly)?\b|\bfatalit(y|ies)\b/i,
    /\bkilled (in|by|when|after|during|at)\b|\bwas killed\b|\bkills? (\d+|several|dozens)\b/i,
    /\bmurder(ed|s)?\b|\bhomicide\b|\bmanslaughter\b/i,
    /\bmourn(s|ing|ed)?\b|\bgrieving\b|\btribute to the late\b|\bthe late\b/i,
    /\bplane crash\b|\bhelicopter crash\b|\bcar crash\b|\bfatal crash\b|\bcrash that killed\b/i,
    /\btragedy\b|\btragic(ally)?\b/i,
    /\bR\.?I\.?P\.?\b/,
  ],
  violence: [
    /\b(sexual(ly)? (assault|abuse|misconduct|harassment)|aggravated assault|assault charges?|assault case|assaulting|assaulted|assault and battery|domestic (violence|assault|abuse))\b/i,
    /\brape(d)?\b|\bmolest(ed|ation|ing)?\b|\bgroom(ing|ed) (a )?(minor|child)\b|\bchild abuse\b|\bsex (crime|trafficking|abuse)\b/i,
    /\b(abuse|abusive) (allegations?|claims?|scandal|case|survivors?|victims?)\b|\b(racial|verbal|physical|emotional) abuse\b/i,
    /\barrest(ed|s)?\b|\bindict(ed|ment)\b|\bcharged with\b|\bpleads? guilty\b|\bfound guilty\b|\bconvicted\b|\bsentenced to\b|\bfaces? (charges|trial|prison)\b/i,
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
    /\bcollision\b|\bcollided\b|\bviolent(ly)? (fall|crash|hit|tackle)\b/i,
    /\b(gruesome|horrific|grisly|scary|sickening|ugly) (injury|scene|moment|fall|crash|collision|hit|landing)\b/i,
    /\b(forced to leave|leaves|left|exits|exited) the (game|match|field|ice|court|track)\b(?=[^.]*\b(after|with|hurt|injur|hit|pain|blood))/i,
    /\b(compound|orbital|facial|jaw|nose|skull) fracture\b|\bdislocat(ed|ing) (his|her|their|an?)\b|\bbloodied\b|\bopen wound\b/i,
    /\bblows? to the (back of the )?head\b|\bshots? to the back of the head\b/i,
  ],
  medical: [
    /\bcancer\b|\btumou?r\b|\bleukemia\b|\blymphoma\b|\bchemotherapy\b|\bterminal(ly)? ill\b/i,
    /\bALS\b|\bParkinson'?s\b|\bAlzheimer'?s\b|\bdementia\b|\bCTE\b/i,
    /\bcardiac (arrest|event|episode)\b|\bheart attack\b|\bstroke suffered\b|\bsuffered a stroke\b|\baneurysm\b|\bblood clots?\b|\bpulmonary embolism\b/i,
    /\bcollapsed? (on|during|at|mid)/i,
    /\bcritical condition\b|\blife support\b|\bintensive care\b|\bin a coma\b|\bcomatose\b|\blife.threatening\b|\bfighting for (his|her|their) life\b/i,
    /\bparalyz(ed|ing)\b|\bparalysis\b|\bspinal (injury|cord)\b|\bamputat(ed|ion)\b/i,
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
    /\btook (his|her|their) own life\b/i,
    /\boverdose(d)?\b|\bfatal overdose\b/i,
    /\bmental health crisis\b|\bchecked into rehab\b|\beating disorder\b/i,
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
