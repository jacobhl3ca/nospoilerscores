// Score-spoiler detection for free text (e.g. a YouTube highlight's title).
//
// These two patterns are copied VERBATIM from the Cloudflare worker
// (public/_worker.js) where every YouTube search result's title is already
// hard-skipped if it spoils the outcome. We mirror them here so the client can
// make the same call at runtime — specifically, VideoModal reads the playing
// clip's real YouTube title (getVideoData().title) and only UN-covers the
// title bar when the title is provably spoiler-free. Keep these in sync with the
// worker; if you add a keyword in one place, add it in the other.
//
//   • SCORE_RX — a soccer-style scoreline ("Chelsea 2-1 Spurs"). The
//     lookbehind/lookahead exclude M-D-Y date hyphens and "2025-26" season
//     spans so they don't false-positive.
//   • SPOILER_RX — outcome keywords ("walk-off", "stuns", "wins", "hat-trick",
//     "red card", …). Tuned to leave "champion"/"champions" alone so
//     "Premier League"/"Champions League" don't trip it. Also catches the
//     everyday result verbs headlines lean on — "edge(s)"/"rout(s)"/"upset"/
//     "clinch"/"sweep"/"ousts"/"eliminates"/"advances" — each of which names
//     a winner or a knockout ("Warriors edge Lakers", "Spurs upset Arsenal")
//     yet slipped past the earlier beat/defeat/win set. The leading \b keeps
//     "edge" from matching inside "hedge"/"wedge"/"pledge"; "rout" is spelled
//     out (rout/routs/routed) so it can't swallow "route"/"routine".
//     "shut[- ]?outs?" catches the hockey/baseball/soccer shutout framing
//     ("Bruins shut out Canadiens", "Hellebuyck shutout") — a title that reveals
//     both a winner and a nil, yet slipped past the earlier set. The optional
//     "[- ]?" covers "shutout" / "shut out" / "shut-out" and the "s?" the plural.
//     "outlast\w*"/"prevail\w*" catch the endure-to-win framing ("Warriors
//     outlast Nuggets", "USMNT prevail on penalties") — each names the winner
//     outright, yet in ordinary English neither word means anything other than
//     winning, so they add coverage with negligible false-positive risk.
//     "toppl\w*"/"trounc\w*"/"demolish\w*" catch the overthrow/blowout framing
//     ("Warriors topple Celtics", "City trounce United", "Madrid demolish
//     Barca") — each names the winner (or a routed favorite), and none of the
//     three means anything but a defeat in ordinary English, so the
//     false-positive risk is negligible. Note the stems drop the trailing "e"
//     (toppl/trounc, not topple/trounce) so the -ing forms (toppling/trouncing)
//     still match. "demolish" keeps its full stem (all inflections retain it).
//     "thrash\w*" catches the same blowout framing so common in soccer/World Cup
//     headlines ("Spain thrash Georgia", "City thrash United") — a decisive-win
//     reveal that, like the three above, means nothing but a lopsided defeat in
//     ordinary English, so it adds coverage with negligible false-positive risk.
//     "thump\w*" is the same-family blowout verb international soccer recaps lean
//     on constantly ("Germany thump Scotland 5-1", "England thumped 4-0", "City
//     thumping United") — a decisive-defeat reveal that slipped past the
//     thrash/trounce/demolish/topple set despite being just as common. Like them
//     it means nothing but a lopsided defeat in a sports-title context (no
//     non-result English word begins with "thump"), so the trailing \w* covers
//     thump/thumps/thumped/thumping at the same negligible false-positive risk.
//     "dismantl\w*" is the same-family blowout verb soccer/NBA recaps lean on for a
//     controlled, systematic rout ("Liverpool dismantle United", "City dismantled
//     Arsenal", "Madrid dismantling Barca") — a decisive-win reveal that slipped past
//     the thrash/thump/trounce/demolish/topple set despite being just as common. Like
//     them it means nothing but a lopsided defeat in a sports-title context (the literal
//     "take-apart" sense never appears in a highlight title, and no in-scope club or
//     nation is named anything beginning with "dismantl"), so the trailing \w* covers
//     dismantle/dismantles/dismantled/dismantling at the same negligible false-positive
//     risk.
//     "destroy\w*" is the same-family blowout verb — and the single most common one in the
//     all-caps fan-channel highlight titles this filter actually sees ("Real Madrid DESTROY
//     Barcelona", "Spain destroyed Georgia 5-0", "City destroying United") — yet it slipped
//     past the demolish/dismantle/thrash/thump/trounce/topple set despite outnumbering all of
//     them on YouTube. In a per-match highlight title "destroy" means nothing but a lopsided
//     defeat; no in-scope club or nation is named anything beginning with "destroy", so the
//     trailing \w* covers destroy/destroys/destroyed/destroying/destroyer. Its one benign
//     collision — a skill-compilation "Messi destroys 3 defenders" — errs to the same
//     over-hide-is-safe side as "brace for"/"saw off a defender" above (a masked title costs a
//     tap to reveal; a leaked one breaks the whole promise). Byte-identical to the worker's copy.
//     "humiliat\w*" is the same-family blowout word — and one of the most common ones in the
//     all-caps fan-channel highlight titles this filter actually sees ("Barcelona HUMILIATED",
//     "Man United humiliated 5-0", "Spain humiliate Georgia") — yet it slipped past the
//     demolish/destroy/dismantle/thrash/thump/trounce/topple set despite naming the loser of a
//     lopsided defeat just as plainly. No English word other than these inflections begins with
//     "humiliat" (it can't reach "humble"/"humid"), and no in-scope club or nation is named
//     anything beginning with it, so the trailing \w* covers humiliate/humiliates/humiliated/
//     humiliating/humiliation at the same negligible false-positive risk as the verbs above.
//     Byte-identical to the worker's copy.
//     "obliterat\w*" is the same total-destruction blowout word this filter's all-caps
//     fan-channel highlight titles lean on right beside DESTROY/HUMILIATE ("Real Madrid
//     OBLITERATE Barcelona", "Spain obliterated Georgia 5-0", "City obliterating United") —
//     a lopsided-defeat reveal that slipped past the demolish/destroy/dismantle/humiliate/
//     thrash/thump/trounce/topple set despite naming the routed side just as plainly and
//     carrying no digits for SCORE_RX to catch. No English word other than these inflections
//     begins with "obliterat", and no in-scope club or nation is named anything beginning with
//     it, so the trailing \w* covers obliterate/obliterates/obliterated/obliterating/
//     obliteration at the same negligible false-positive risk as the verbs above.
//     Byte-identical to the worker's copy.
//     "annihilat\w*" is the same total-destruction blowout word the all-caps fan-channel
//     highlight titles lean on right beside DESTROY/OBLITERATE/HUMILIATE ("Real Madrid
//     ANNIHILATE Barcelona", "Spain annihilated Georgia 5-0", "City annihilating United") —
//     a lopsided-defeat reveal that slipped past the demolish/destroy/dismantle/humiliate/
//     obliterate/thrash/thump/trounce/topple set despite naming the routed side just as
//     plainly and carrying no digits for SCORE_RX to catch. No English word other than these
//     inflections begins with "annihilat", and no in-scope club or nation is named anything
//     beginning with it, so the trailing \w* covers annihilate/annihilates/annihilated/
//     annihilating/annihilation at the same negligible false-positive risk as the verbs above.
//     Byte-identical to the worker's copy.
//     "triumph\w*"/"romp\w*" catch the winner-side framing headlines lean on just
//     as often ("Argentina triumph on penalties", "City romp to victory",
//     "Australia romp home") — each names the victor, and neither word means
//     anything but winning in ordinary English, so the false-positive risk is the
//     same negligible level as the blowout verbs above. Both keep their full
//     stem across every inflection (triumphs/triumphed/triumphing, romps/romped/
//     romping), so a trailing \w* covers all of them.
//     "cruise\w*" catches the easy-win framing ("Real Madrid cruise past Getafe",
//     "City cruise to victory", "United cruised past Spurs") — a decisive-win reveal
//     the existing verbs miss ("edge" is the narrow win; nothing covered the
//     comfortable one). In a sports highlight title "cruise" means nothing but
//     winning comfortably, so it adds coverage with the same negligible
//     false-positive risk as the blowout verbs above. The stem keeps its trailing
//     "e" (cruise, not cruis) — cruis\w* would collide with "cruiserweight" — so it
//     covers cruise/cruises/cruised, the forms recap titles actually use, and simply
//     leaves the rarer -ing form ("cruising") alone rather than risk that collision.
//     "crush\w*" replaces the earlier bare "crushes": that lone inflection missed
//     the plural-present "Bayern crush Barca" and the past-tense "City crushed
//     United" — both decisive-win reveals — while every sibling defeat verb
//     (dominat\w*/defeat\w*/beat\w*) already used the stem+\w* form. In a sports
//     highlight title "crush" means nothing but a lopsided defeat, so widening it
//     carries the same negligible false-positive risk as the verbs above.
//     "blow[- ]?outs?" catches the lopsided-result framing headlines lean on in
//     the NBA/NFL especially ("Warriors blow out Lakers", "a blowout win",
//     "blowouts"). Structurally it mirrors the "shut[- ]?outs?" entry above —
//     the optional "[- ]?" covers "blowout"/"blow-out"/"blow out" and the "s?"
//     the plural — and in a sports recap title "blowout" reveals the decisive
//     winner/loser yet means nothing else, so the false-positive risk is the
//     same negligible level as the blowout verbs above.
//     "hat[- ]?tricks?" widens the earlier "hat[- ]trick" (which required a
//     separator and had no plural) to also catch the closed spelling "hattrick"
//     and the plural — both of which soccer/World Cup highlight titles use
//     constantly ("Mbappé hattrick", "Ronaldo hattrick vs …", "two hat tricks in
//     a week") yet slipped straight past the mandatory-separator, singular-only
//     form and leaked the goal event. The optional "[- ]?" now covers "hat trick"/
//     "hat-trick"/"hattrick" and the "s?" the plural, exactly like the sibling
//     "shut[- ]?outs?"/"own[- ]?goals?"/"clean[- ]?sheets?" entries. Purely a
//     widening: it stays anchored to "hat"+"trick" adjacency, so it adds no new
//     false-positive surface ("that trick" can't match — no \b before the "hat"
//     inside "that" — and "trickster" fails the closing \b). Byte-identical to
//     the worker's copy.
const SCORE_RX = /(?<![-/])\b\d{1,2}\s*[-–]\s*\d{1,2}\b(?![-/])/;
//     "outclass\w*" catches the superiority framing headlines lean on ("Brazil
//     outclass Chile", "Spain outclassed Georgia") — a decisive-win reveal the
//     blowout verbs above miss, and one that means nothing but winning
//     comfortably in ordinary English (no word other than these inflections
//     begins with "outclass"), so it adds coverage with the same negligible
//     false-positive risk. The trailing \w* covers outclass/outclasses/
//     outclassed/outclassing.
//     "outplay\w*" catches the on-the-day superiority framing ("Brazil outplay
//     Croatia", "Germany outplayed Spain") — the same outXXX family as
//     outlast/outclass/overpower/outgun above, naming the side that dominated
//     play, and no non-result English word begins with "outplay", so it adds
//     coverage with the same negligible false-positive risk. The trailing \w*
//     covers outplay/outplays/outplayed/outplaying.
//     "outscor\w*" catches the most literal winner-reveal of the outXXX family:
//     whoever outscores the other side won ("Warriors outscore Lakers", "Spain
//     outscored Italy"). No non-result English word begins with "outscor", so it
//     adds coverage with the same negligible false-positive risk as its siblings.
//     The trailing \w* covers outscore/outscores/outscored/outscoring.
//     "surviv\w*" catches the endure-to-advance framing this WC-heavy app sees
//     constantly ("Argentina survive on penalties", "Real Madrid survive a scare",
//     "Spain surviving late pressure to reach the final") — a distinct result reveal
//     its semantic sibling "outlast\w*"/"prevail\w*" miss, and one that in a per-match
//     highlight title means nothing but the named side getting through (won / advanced /
//     stayed up). No in-scope club or nation is named anything beginning with "surviv",
//     and even the non-verb forms are result-adjacent in sports ("relegation survival"
//     reveals a team stayed up, a "survivor" is the side still standing), so the trailing
//     \w* covers survive/survives/survived/surviving/survival/survivor at the same
//     negligible false-positive risk as the outXXX verbs above.
//     "overpower\w*"/"outgun\w*" catch two more decisive-win verbs headlines
//     lean on ("Spain overpower Italy", "Bills outgun Chiefs", "Warriors outgun
//     Suns") — each names the winner of a lopsided or high-scoring contest, and
//     no non-result English word begins with either stem, so they add coverage
//     with the same negligible false-positive risk as the blowout verbs above.
//     The trailing \w* covers every inflection (overpowers/overpowered/
//     overpowering, outguns/outgunned/outgunning).
//     "holds?[- ]?off"/"held[- ]?off" catch the protect-the-lead win framing
//     headlines lean on constantly in the NBA/NFL/soccer ("Warriors hold off
//     Lakers", "Bills held off Chiefs", "Chelsea holds off Arsenal") — a distinct
//     winner reveal the existing verbs miss ("edge" is the narrow win by margin;
//     nothing covered the late lead-protection win). Only the two-word "hold/held
//     off" phrase matches — the mandatory trailing "off" keeps it clear of
//     "household"/"threshold"/"stronghold"/"on hold", and in a highlight title the
//     phrase means nothing but the leading side surviving to win, so it adds
//     coverage with the same negligible false-positive risk as the verbs above.
//     "sees?[- ]?off"/"saw[- ]?off" are the direct semantic sibling of
//     "holds?[- ]?off"/"held[- ]?off": "see off" is the British-recap verb for
//     beating back a challenger to win, and it slipped past the whole set
//     ("Arsenal see off Spurs", "Chelsea sees off Arsenal", "Madrid saw off
//     Barca", "England saw off Serbia") — a distinct winner reveal with no digits
//     (SCORE_RX misses it) and no keyword catching bare "see"/"saw"/"off". Like
//     the hold/held-off pair, ONLY the two-word "see/saw off" phrase matches: the
//     mandatory trailing "off" keeps the hugely common "see"/"saw"/"sees" from
//     firing alone ("must-see", "saw the ball", "sees the pass"), and the trailing
//     \b keeps "sees off" clear of "oversees office" ("off" runs into "ice", so no
//     boundary follows). The two benign collisions left — the literal tool sense
//     of "saw off" (carpentry) and "sees off a defender" (a dribble) — never occur
//     in the sports-highlight titles this filter actually sees, and both err to the
//     over-hide-safe side, exactly like "hold off the defender" above. Structured
//     like the hold/held pair (sees? covers see/sees, "[- ]?off" covers "see off"/
//     "see-off"/"seeoff"); the rarer "-ing" form ("seeing off") is left alone as
//     cruise/seal are. Byte-identical to the worker's copy.
//     "fends?[- ]?off"/"fended[- ]?off" complete the beat-back-a-challenger family
//     alongside "holds?/held off" and "sees?/saw off": "fend off" is the verb NBA/NFL
//     and soccer recaps lean on for protecting a lead against a late push, and it
//     slipped past the whole set ("Arsenal fend off Spurs", "Bills fend off Chiefs",
//     "Chelsea fends off Arsenal", "City fended off United") — a distinct winner reveal
//     with no digits (SCORE_RX misses it) and no keyword catching bare "fend"/"off". Like
//     the hold/see pairs, ONLY the two-word "fend/fended off" phrase matches: the
//     mandatory trailing "off" keeps it clear of "defend"/"offend"/"fender" (the leading
//     \b sits at a non-boundary inside those, so "fend" never fires alone), and in a
//     highlight title the phrase means nothing but the leading side surviving to win. The
//     one benign collision — "fend off late pressure/a challenge" — errs to the
//     over-hide-safe side, exactly like "hold off the defender" above. The rarer "-ing"
//     form ("fending off") is left alone as the hold/see pairs leave theirs. Byte-identical
//     to the worker's copy.
//     Bare "win" joins the existing winning/winner/wins/won so the British-style
//     plural-present result framing this WC-heavy app sees constantly ("Spain win
//     Group L", "England win on penalties", "Argentina win") is caught — a team is
//     grammatically plural in that usage, so "wins" (the singular) never fired and
//     the outcome leaked. \bwin\b is boundary-safe: it can't match inside "winter"/
//     "window"/"twin"/"winger"/"Wings"/"Winnipeg", so the false-positive risk stays
//     the same negligible level as the verbs above.
//     "victory|victories|victorious" join the winning/winner/wins/won/win set:
//     "victory" is one of the most common outcome words in recap/highlight titles
//     ("Argentina's World Cup victory", "Warriors seal victory", "Spain victorious")
//     yet — despite the synonym "triumph\w*" already being covered — none of its
//     forms fired, so the result leaked. Spelled out (not "victor\w*") on purpose:
//     the stem form would also swallow "Victoria" (the state / a first name), which
//     these three can't. The one benign collision left is a club literally named
//     "Victory" — A-League's Melbourne Victory — but that league is outside this
//     app's soccer scope (MLS + UEFA + World Cup) and no in-scope club or nation is
//     named "Victory", so within the content this filter actually sees it stays on
//     the same over-hide-is-safe side as the verbs above (a masked title just costs
//     a tap to reveal; a leaked one breaks the whole promise).
//     "stun|stunned|stunning" join the existing "stuns"/"stunner" for the same
//     reason bare "win" was added: "stuns" (singular) never fires on the
//     plural-present upset framing this WC-heavy app sees constantly ("Saudi
//     Arabia stun Argentina", "England stun France") — a team is grammatically
//     plural there — and "stunned"/"stunning" ("stunning upset", "stunned by
//     defeat") slipped past too. Spelled out (not "stun\w*") on purpose: the stem
//     form would swallow "stunt"/"stunts"/"stuntman", which these forms can't
//     (\bstun\b/\bstunned\b/\bstunning\b are all whole-word). Bare "stun" is
//     boundary-safe against "stung"/"stunt". A stun is only ever an upset reveal
//     in a recap title, so this stays on the same over-hide-is-safe side.
//     "shock|shocks|shocked|shocking" join that same upset-reveal family for the
//     same reason: "shock" is the everyday synonym of "stun"/"upset" headlines
//     lean on just as hard in this WC-heavy app ("Saudi Arabia shock Argentina",
//     "Morocco shocked Portugal", "Japan shock Germany", "shock win"/"shocking
//     upset") — an upset reveal that, despite "stun*"/"upset\w*" already being
//     covered, has a different surface form, so none of its inflections fired and
//     the outcome leaked. Spelled out (not "shock\w*") on purpose: the stem form
//     would swallow "shockwave"/"shocker", which these four whole-word forms
//     can't, and it's boundary-safe against "aftershock" (no \b before "shock"
//     there). No in-scope club or nation is named "Shock" (the WNBA's Tulsa Shock
//     is defunct and out of scope), so in the titles this filter actually sees
//     "shock" means nothing but an upset result, keeping it on the same
//     over-hide-is-safe side as the verbs above.
//     "seals?|sealed" joins its semantic sibling "clinch\w*": "seal" is the other
//     verb headlines lean on for locking up a result this WC-heavy app sees
//     constantly ("Spain seal qualification", "Argentina sealed top spot", "Messi
//     seals it late") — a clinch reveal that, despite "clinch\w*" already being
//     covered, has a different surface form, so none of "seal"/"seals"/"sealed"
//     fired and the outcome leaked. Spelled out (not "seal\w*") on purpose: the
//     stem form would swallow "sealant"/"sealer"/"sealskin", which these three
//     can't, and it leaves the rarer "-ing" form alone (as "cruise" does) since
//     "sealing the win" is already caught by "win". All three are whole-word so
//     they can't match inside "unseal"/"reseal"/"concealed"/"sealskin". No
//     in-scope club or nation is named "Seal" (the Golden Seals are a defunct
//     1970s NHL club, outside current content), so in the titles this filter
//     actually sees "seal" means nothing but sealing a result, keeping it on the
//     same over-hide-is-safe side as the verbs above.
//     "losing|lose" join the existing "loses"/"lost"/"loss" for the exact same
//     reason bare "win"/"stun"/"shock" were added on the winning side: the loser
//     was only covered in the past-tense/singular forms, so the British-style
//     plural-present/infinitive framing this WC-heavy app sees constantly
//     ("Argentina lose on penalties", "Spain lose Group L", "England lose to
//     France") slipped past — a team is grammatically plural there, so "loses"
//     (the singular) never fired and the outcome leaked. This mirrors the
//     "winning|...|win" set exactly ("losing" pairs with "winning", "lose" with
//     "win"). \blose\b/\blosing\b are boundary-safe: they can't match inside
//     "close"/"closest"/"closer"/"loser"/"enclose", and in a highlight title
//     "lose" means nothing but a result reveal, so this stays on the same
//     over-hide-is-safe side as the verbs above.
//     "goalless"/"scoreless" join the nil-reveal family alongside "shut[- ]?outs?":
//     both describe a match (or an innings/half) in which nobody has scored, so a
//     title carrying either one reveals the result — a full "goalless draw" gives
//     away the whole outcome, and "scoreless through 7 innings" gives away the
//     running state — yet neither slipped through the digit-based SCORE_RX (there
//     are no digits) nor any existing keyword. Unlike the verbs above they carry
//     essentially zero false-positive risk: neither word has any meaning outside a
//     no-score result, and \b keeps them clear of "goalscorer"/"scoreline"/"scores"
//     (each of which begins the same but continues past the "less" boundary).
//     "clean[- ]?sheets?" joins that same nil-reveal family (shut[- ]?outs?/goalless/
//     scoreless): a "clean sheet" is the soccer framing for conceding no goals, so a
//     title carrying it reveals one side was kept scoreless ("Spain keep a clean sheet
//     vs Italy", "Courtois clean sheet") — the same partial-result leak as a shutout,
//     yet it has no digits (SCORE_RX misses it) and no existing keyword caught it. It's
//     one of the most common phrases in soccer recap titles, and — like goalless/
//     scoreless — carries essentially zero false-positive risk: "clean sheet" has no
//     meaning outside a no-goals-conceded result. Structured like "shut[- ]?outs?" —
//     the optional "[- ]?" covers "clean sheet"/"clean-sheet"/"cleansheet" and the "s?"
//     the plural — so it stays byte-identical to the worker's copy.
//     "equali[sz]\w*" catches the goal-reveal framing soccer recaps lean on constantly
//     ("Ramos with a late equaliser", "Spain equalize", "stunning equalizer") — a title
//     carrying it reveals that a goal was scored and the score was level at that moment,
//     the same partial-result leak as a "clean sheet"/"goalless" nil-reveal, yet it has
//     no digits (SCORE_RX misses it) and no existing keyword caught it. The "[sz]" covers
//     both the British "equalise*" and American "equalize*" spellings, and the trailing
//     \w* covers every inflection (equalise/equalised/equalising/equaliser, equalize/
//     equalized/equalizing/equalizer). Near-zero false-positive risk: the "[sz]" keeps it
//     clear of "equality"/"equalitarian" (no s/z after "equali"), and the only benign
//     collision left — the film/TV "The Equalizer" — is not an in-scope club or nation and
//     never appears in the highlight titles this filter actually sees.
//     "own[- ]?goals?" joins the goal-event reveal family alongside "hat[- ]?tricks?" and
//     "equali[sz]\w*": an "own goal" names a specific goal that was scored, so a title
//     carrying it reveals both that the match wasn't goalless and, usually, who it swung
//     ("Late own goal breaks Brazil hearts", "Comedy own-goal gifts Spain the win") — the
//     same partial-result leak as an equaliser, yet it has no digits (SCORE_RX misses it)
//     and no existing keyword caught it. The optional "[- ]?" covers "own goal"/"own-goal"/
//     "owngoal" and the "s?" the plural. Near-zero false-positive risk: the mandatory
//     trailing "goal" keeps the leading \b clear of every other word ending in "own"
//     (crown/brown/known/thrown/grown all fail — none is followed by "goal"), and the
//     closing \b keeps it clear of "own goalkeeper" (the "l" of "goal" runs into "keeper",
//     so no boundary follows) — the metaphorical "political own goal" never appears in the
//     per-match highlight titles this filter actually sees.
//     "braces?" joins the goal-event reveal family alongside "hat[- ]?tricks?", "equali[sz]\w*",
//     and "own[- ]?goals?": a "brace" is the soccer term for one player scoring two goals, so
//     a title carrying it reveals both that the match wasn't goalless and, usually, which side
//     scored ("Kane brace sinks Poland", "Mbappé with a brace") — the same partial-result leak
//     as a hat-trick, yet it has no digits (SCORE_RX misses it) and no existing keyword caught
//     it. It's one of the most common words in soccer/World Cup highlight titles, so it fills a
//     real gap in this WC-heavy app. Whole-word \bbraces?\b is boundary-safe: it can't match
//     inside "embrace"/"bracelet"/"bracket" (no \b before/after "brace" there), and the "s?"
//     covers the plural "braces" without swallowing anything else. The one benign collision — the
//     idiom "brace for" in a preview blurb — is rare in per-match titles and errs toward
//     over-hiding, the same over-hide-is-safe side as the verbs above (a masked title just costs
//     a tap to reveal; a leaked one breaks the whole promise).
//     "shoot[- ]?outs?" catches the penalty-shootout reveal this WC-heavy app sees all through
//     the knockout rounds ("Argentina edge France in a shootout", "penalty shoot-out drama",
//     "decided by a shootout") — a distinct partial-result leak the existing verbs miss: a
//     shootout only happens once a match is level after regulation/extra time, so the word alone
//     reveals the game went the distance and was settled from the spot, yet it carries no digits
//     (SCORE_RX misses it) and no existing keyword caught it. Structurally it mirrors the
//     "shut[- ]?outs?"/"blow[- ]?outs?" entries above — the optional "[- ]?" covers "shootout"/
//     "shoot-out"/"shoot out" and the "s?" the plural. Near-zero false-positive risk: the
//     leading \b needs a boundary before "shoot", so it can't match inside "troubleshoot"
//     (mid-word, no boundary), and in a per-match highlight title "shootout" means nothing but a
//     result decided from the spot (the colloquial "high-scoring shootout" is itself a result
//     reveal, still the over-hide-is-safe side). Byte-identical to the worker's copy.
//     "deadlock\w*" joins the level/draw-reveal family alongside "goalless"/"scoreless"/
//     "clean[- ]?sheets?": in a soccer highlight title "deadlock" reveals the result state
//     either way it's used — a "goalless deadlock" / "sides remain deadlocked" reveals the
//     match is (or ended) level, and "breaks the deadlock" / "deadlock broken" reveals a goal
//     was scored and one side went ahead — the same partial-result leak as a clean sheet, yet
//     it carries no digits (SCORE_RX misses it) and no existing keyword caught it. "Break the
//     deadlock" is one of the most common phrasings in soccer/World Cup recap titles, so it
//     fills a real gap in this WC-heavy app. Near-zero false-positive risk: no non-result
//     English word begins with "deadlock", no in-scope club or nation is named "Deadlock", and
//     the only other sense (a negotiation/transfer "deadlock") never appears in the per-match
//     highlight titles this filter actually sees — it is applied ONLY to YouTube highlight
//     video titles, never to news headlines. The trailing \w* covers deadlock/deadlocked/
//     deadlocks/deadlocking. Byte-identical to the worker's copy.
//     "stalemate\w*" is deadlock's direct synonym and joins the same level/draw-reveal family
//     (goalless/scoreless/clean[- ]?sheets?/deadlock\w*): in a soccer highlight title it reveals the
//     match was (or ended) level — "goalless stalemate", "settle for a stalemate", "tense stalemate at
//     the Bernabéu" — the same partial-result leak as deadlock, yet a bare "stalemate" (no digits, no
//     "goalless") slipped past both the digit-based SCORE_RX and every existing keyword. It's a staple
//     of soccer/World Cup recap titles, so it fills a real gap in this WC-heavy app. Near-zero
//     false-positive risk: "stalemate" has no meaning outside a drawn/level state, no in-scope club or
//     nation is named it, and the only other sense (a chess/negotiation stalemate) never appears in the
//     per-match highlight video titles this filter actually sees — it is applied ONLY to YouTube
//     highlight titles, never to news headlines. The trailing \w* covers the plural "stalemates".
//     Byte-identical to the worker's copy.
//     "\d{1,2}[- ]?nil" / "nil[- ]?(?:\d{1,2}|nil|all)" catch the spelled-out "nil" scoreline that
//     soccer/World Cup highlight titles use constantly — "Spain 4 nil", "beat them 3-nil", "nil-nil at
//     the break", "nil all draw", "nil 2 down". The digit-based SCORE_RX only fires on a digit-hyphen-
//     digit run ("4-0"), so a scoreline that spells zero as "nil" (with a space, or reversed) slipped
//     straight through and revealed the result. Every alternative is anchored to "nil" adjacent to a
//     digit / "nil" / "all", so the false-positive risk is negligible: bare "nil" never matches, and
//     "nil" only ever means a zero score in a per-match highlight title (words like "Nile"/"nilpotent"
//     can't match — "Nile" fails the required trailing digit and "nilpotent" fails the closing \b).
//     Byte-identical to the worker's copy.
//     "overtime"/"extra[- ]?time" extend the existing "extra[- ]?innings?" (baseball) across the
//     app's other sports: a title carrying either one reveals the game was level at the end of
//     regulation — an NHL/NBA/NFL "overtime thriller"/"OT winner" or a soccer/World Cup "extra
//     time drama"/"decided in extra time" — the same went-the-distance partial-result leak as
//     "extra innings", yet neither slipped through the digit-based SCORE_RX (no digits) nor any
//     existing keyword. Near-zero false-positive risk: no non-result English word begins with
//     "overtime" (the labor-hours sense never appears in a per-match highlight title), and
//     "extra[- ]?time" — like the sibling "extra[- ]?innings?" — is anchored to the "extra"
//     prefix, so the optional "[- ]?" covers "extra time"/"extra-time"/"extratime" while bare
//     "time" never matches. The two-letter "OT" abbreviation is deliberately NOT added — it
//     collides too easily — but titles that spell out "overtime" are caught, the
//     over-hide-is-safe side the verbs above already err to. Byte-identical to the worker's copy.
//     "sinks?"/"sank" catch the "late goal sinks X" defeat-reveal that soccer/NBA/NHL/MLB recap
//     titles lean on across every sport ("Rodri sinks Arsenal", "Late Kane goal sinks Poland",
//     "Buzzer-beater sinks Lakers", "Walk-off sank the Yankees") — a distinct winner/loser reveal
//     the existing verbs miss (nothing covered "sink"), and one that in a per-match highlight title
//     means nothing but the named side losing. Spelled out (sink/sinks/sank, not "sink\w*") on
//     purpose: the stem form would swallow the baseball pitch "sinker" ("nasty sinker from deGrom"
//     reveals no result) and "sinking feeling", which these whole-word forms can't. \bsinks?\b/\bsank\b
//     are boundary-safe — they can't match inside a longer word — and no in-scope club or nation is
//     named "Sink"/"Sank", so the only benign collision left (the idiom "throw the kitchen sink at")
//     is rare in the per-match highlight titles this filter actually sees and errs to the same
//     over-hide-is-safe side as the verbs above. Byte-identical to the worker's copy.
//     "bow(?:s|ed|ing)?[- ]?out"/"crash(?:es|ed|ing)?[- ]?out" catch the knockout-elimination
//     framing that dominates World Cup / cup-tie recap titles ("Germany bow out of the World Cup",
//     "Canada crash out on penalties", "Italy crashed out", "Spurs bowed out") — each names the
//     eliminated side, the same knockout-result reveal as the sibling "oust\w*"/"eliminat\w*"
//     verbs, yet neither carries digits (SCORE_RX misses it) and no existing keyword caught the
//     "…out" phrasing. The inflection sits on the verb, not "out", so the "(?:s|ed|ing)?" covers
//     bow/bows/bowed/bowing and crash/crashes/crashed/crashing while the required trailing "out"
//     keeps bare "bow" (bow-and-arrow) and bare "crash" (a market/plane crash) from matching, and
//     the leading \b keeps "elbow"/"rainbow" out. "knockout" itself is deliberately NOT added —
//     "knockout stage"/"knockout round" is a neutral schedule term this filter would over-hide.
//     Byte-identical to the worker's copy.
//     "pummel\w*"/"steamroll\w*" are two more same-family blowout verbs the thrash/thump/trounce/
//     demolish/topple set still missed ("City pummel United", "Chiefs steamroll the Broncos",
//     "Spain steamrolled 5-0", "Warriors pummeling the Suns") — each names the winner (or the
//     routed side) of a lopsided result, yet neither carries digits (SCORE_RX misses it) and no
//     existing keyword caught the phrasing. In a sports-title context neither means anything but a
//     one-sided defeat, and no in-scope club, nation, or league is named anything beginning with
//     "pummel"/"steamroll", so the trailing \w* covers every inflection (pummel/pummels/pummeled/
//     pummeling, steamroll/steamrolls/steamrolled/steamrolling) at negligible false-positive risk.
//     Byte-identical to the worker's copy.
//     "drub\w*" is the same-family blowout word soccer/cricket recaps lean on for a lopsided beating
//     ("Spain drub Georgia 5-0", "United drubbed 4-0", "a 6-1 drubbing", "City drubbing Arsenal") —
//     a decisive-defeat reveal that slipped past the pummel/steamroll/thrash/thump/trounce set despite
//     being just as common in the World Cup recap titles this filter now sees most. It is SAFER than
//     the destroy/demolish/smash family it joins: unlike those, "drub" never describes a single skill
//     moment ("destroys 3 defenders"), only a team-vs-team result, so it can't over-hide a highlight
//     reel. No English word other than these inflections begins with "drub", and no in-scope club or
//     nation is named anything beginning with it, so the trailing \w* covers drub/drubs/drubbed/
//     drubbing at the same negligible false-positive risk as the verbs above. Byte-identical to the
//     worker's copy.
//     "smash\w*" finally adds the blowout verb the "drub" note above already names as a member of the
//     destroy/demolish/smash family — it was described but never actually listed, an oversight, since
//     "smash" is one of the commonest blowout verbs in the all-caps fan-channel highlight titles this
//     filter sees ("Real Madrid SMASH Barcelona 5-0", "Spain smashed Georgia", "City smashing United")
//     and, like DESTROY, carries no digits for SCORE_RX to catch, so those reveals were leaking. It
//     shares the single-skill collision the drub note flags ("smashes it into the top corner") — but
//     that errs to the exact over-hide-is-safe side the family already accepts for destroy/demolish (a
//     masked title costs a tap to reveal; a leaked one breaks the whole promise), and no in-scope club
//     or nation is named anything beginning with "smash", so the trailing \w* covers smash/smashes/
//     smashed/smashing at the same negligible false-positive risk. Byte-identical to the worker's copy.
//     "wallop\w*" is the same-family blowout verb British/soccer recaps lean on for a heavy beating
//     ("Spain wallop Georgia 5-0", "United walloped 4-0", "a 6-0 walloping", "City walloping Arsenal") —
//     a decisive-defeat reveal that slipped past the drub/smash/thrash/thump/pummel/steamroll set despite
//     being just as common in the World Cup recap titles this filter now sees most. Like "drub" it is
//     SAFER than the destroy/smash family it joins: "wallop" only ever describes a team-vs-team beating,
//     never a single skill moment, so it can't over-hide a highlight reel. No English word other than
//     these inflections begins with "wallop" (it can't reach "Walloon"/"Wallonia" — those have no "p"),
//     and no in-scope club or nation is named anything beginning with it, so the trailing \w* covers
//     wallop/wallops/walloped/walloping at the same negligible false-positive risk as the verbs above.
//     Byte-identical to the worker's copy.
//     "send(?:s|ing)?[- ]?off"/"sent[- ]?off" catch the red-card reveal in its far more
//     common verb form — the noun "red card" is already blocked, but soccer/World Cup
//     highlight titles almost always phrase a dismissal as "sent off"/"sending off"
//     ("Ramos SENT OFF vs Barcelona", "Referee sends off the keeper", "Vinícius sending
//     off changes the game") — the same match-event partial-result leak as "red card"
//     (and its goal-event siblings "own goal"/"brace"/"equali[sz]\w*"), yet it carries no
//     digits (SCORE_RX misses it) and no existing keyword caught the "…off" phrasing. The
//     inflection sits on "send", not "off", so "(?:s|ing)?" covers send/sends/sending and
//     the separate "sent[- ]?off" branch covers the past tense, while the required trailing
//     "off" keeps bare "send"/"sent" from firing ("send in your questions" never matches)
//     and the leading \b keeps it clear of "present"/"absent"/"consent"/"resent" (the "sent"
//     in those sits mid-word with no boundary before it). The one benign collision — a
//     farewell "send-off" — never appears in the per-match highlight titles this filter
//     actually sees and errs to the same over-hide-is-safe side as the verbs above (a masked
//     title just costs a tap to reveal; a leaked one breaks the whole promise). It is a
//     direct sibling of the existing "sees?[- ]?off"/"saw[- ]?off" (a different verb — beat
//     back a challenger — that shares only the trailing "off"). Byte-identical to the
//     worker's copy.
//     "knock(?:s|ed|ing)[- ]?out" completes the knockout-elimination family alongside
//     "bow…out"/"crash…out"/"oust\w*"/"eliminat\w*": "knocked out" is the single most
//     common way WC / cup-tie recap titles phrase a team going out ("Germany knocked out
//     of the World Cup", "Argentina knocks out Brazil on penalties", "late goal knocking
//     out the holders") — an elimination reveal that slipped past the whole set despite
//     carrying no digits (SCORE_RX misses it). Note the inflection is REQUIRED here — it
//     is "(?:s|ed|ing)", NOT the "(?:…)?" the bow/crash siblings use — precisely to dodge
//     the collision the bow/crash note above flags: bare "knockout"/"knock-out" is the
//     neutral schedule term ("knockout stage"/"knock-out round"), and neither carries an
//     s/ed/ing, so requiring the inflection catches only the verb forms
//     (knocked/knocks/knocking out) while leaving "knockout stage" visible. The trade-off
//     is the rarer bare plural-present "Spain knock out Germany" is left uncaught rather
//     than risk over-hiding "knockout stage" — the same conservative choice the "knockout"
//     exclusion in the bow/crash note already made. No in-scope club or nation is named
//     "Knock", so the false-positive risk is otherwise negligible. Byte-identical to the
//     worker's copy.
//     "hammer(?:ed|ing)" is the same-family blowout verb soccer/football recap titles lean on
//     constantly ("Man United hammered 5-0", "City's 5-0 hammering of Arsenal", "Spain hammered
//     Georgia") — a lopsided-defeat reveal that slipped past the demolish/destroy/thrash/thump/
//     wallop/smash set despite being just as common, and it carries no digits when the score is
//     omitted (SCORE_RX misses "Barca hammered again"). Note the inflection is REQUIRED here — it
//     is "(?:ed|ing)", NOT the "\w*" the sibling blowout verbs use — precisely to dodge the one
//     real collision: bare "hammer"/"hammers" is West Ham United's in-scope nickname ("the
//     Hammers"), so a "hammer\w*" would over-hide ordinary West Ham titles. The past/gerund forms
//     "hammered"/"hammering" never name the club, so requiring the inflection catches only the
//     verb-of-defeat forms while leaving the nickname visible. The trade-off is the rarer bare
//     plural-present "City hammer United" is left uncaught rather than risk over-hiding every
//     West Ham clip — the same conservative inflection choice the "knock(?:s|ed|ing)[- ]?out" note
//     above made. Byte-identical to the worker's copy.
//     "batter(?:ed|ing)" is the same-family blowout verb British/soccer recap titles lean on for a
//     heavy defeat right beside "hammered"/"walloped" ("Spain battered Georgia", "United battered
//     again", "took a 5-0 battering", "City battering Chelsea") — a lopsided-defeat reveal that
//     slipped past the hammer/wallop/drub/smash/thrash/thump/pummel/steamroll set and carries no
//     digits when the score is omitted (SCORE_RX misses "United battered again"). Note the inflection
//     is REQUIRED here — it is "(?:ed|ing)", NOT the "\w*" the sibling blowout verbs use — precisely
//     to dodge the baseball collision: bare "batter"/"batters" is the hitter at the plate ("the
//     batter struck out" reveals no result), so a "batter\w*" would over-hide ordinary MLB clips.
//     The past/gerund forms "battered"/"battering" never name the hitter, so requiring the inflection
//     catches only the verb-of-defeat forms (and the common noun "a battering") while leaving the
//     baseball "batter" visible — the same conservative inflection choice the sibling
//     "hammer(?:ed|ing)" made above for West Ham's "Hammers" nickname. The one benign collision — the
//     target-man cliché "battering ram" — is rare in per-match highlight titles and errs to the same
//     over-hide-is-safe side as the verbs above. Byte-identical to the worker's copy.
//     "dump(?:s|ed|ing)?[- ]?out" joins the knockout-elimination family alongside
//     "bow(?:s|ed|ing)?[- ]?out"/"crash(?:es|ed|ing)?[- ]?out"/"knock(?:s|ed|ing)[- ]?out":
//     "dumped out" is one of the commonest British WC / cup-tie phrasings for a side being
//     eliminated ("Germany dumped out of the World Cup", "Messi dumps out the holders", "Italy
//     dumped out on penalties") — the same knockout-result reveal as its siblings, yet it carries
//     no digits (SCORE_RX misses it) and no existing keyword caught the "dump…out" phrasing. It's
//     structured exactly like the bow/crash siblings: the inflection sits on the verb, so the
//     optional "(?:s|ed|ing)?" covers dump/dumps/dumped/dumping while the required trailing "out"
//     keeps bare "dump" (the literal empty-a-container sense, which never appears in a per-match
//     highlight title) from firing. No English word other than these forms begins with "dump" at a
//     \b that's then followed by "out", and no in-scope club or nation is named "Dump", so it adds
//     coverage at the same negligible false-positive risk as bow/crash out — and, like them, any
//     benign collision errs to the over-hide-is-safe side (a masked title costs a tap to reveal; a
//     leaked one breaks the whole promise). Byte-identical to the worker's copy.
//     "spank\w*" is the same-family blowout verb British/soccer recap titles lean on for a
//     one-sided beating right beside "wallop"/"drub"/"thrash" ("Spain spank Georgia 5-0", "United
//     spanked 4-0", "a 4-0 spanking", "City spanking Arsenal") — a decisive-defeat reveal that
//     slipped past the wallop/drub/smash/thrash/thump/pummel/steamroll set despite being just as
//     common in the World Cup recap titles this filter now sees most, and it carries no digits when
//     the score is omitted (SCORE_RX misses "United spanked again"). Like "wallop"/"drub" it is
//     SAFER than the destroy/smash family it joins: "spank" only ever describes a team-vs-team
//     beating in a sports title, never a single skill moment, so it can't over-hide a highlight
//     reel. No English word other than these inflections begins with "spank" (it can't reach
//     "spark"/"span"/"spandex" — those diverge before the "k"), and no in-scope club or nation is
//     named anything beginning with it, so the trailing \w* covers spank/spanks/spanked/spanking at
//     the same negligible false-positive risk as the verbs above. Byte-identical to the worker's copy.
//     "maul\w*" is the same-family blowout verb British/soccer recap titles lean on for a heavy,
//     one-sided beating right beside "wallop"/"spank"/"thrash" ("Spain maul Georgia 5-0", "United
//     mauled 4-0", "a 5-0 mauling", "City mauling Arsenal") — a decisive-defeat reveal that slipped
//     past the wallop/spank/drub/smash/thrash/thump/pummel/steamroll set despite being just as common
//     in the World Cup recap titles this filter now sees most, and it carries no digits when the score
//     is omitted (SCORE_RX misses "United mauled again"). Like its siblings it means nothing but a
//     lopsided defeat in a sports-title context, so it adds coverage with negligible false-positive
//     risk: the non-result senses of "maul" (the rugby phase — not an in-scope league; the literal
//     animal-attack headline; the honorific "Maulana") never appear in the sports-highlight titles
//     this filter runs on, and any residual collision errs to the same over-hide-is-safe side as the
//     verbs above (a masked title costs a tap; a leaked one breaks the whole promise). No in-scope
//     club or nation begins with "maul", so the trailing \w* covers maul/mauls/mauled/mauling at the
//     same negligible risk. Byte-identical to the worker's copy.
//     "leaders?"/"winners?" pluralize the previously singular-only "leader"/"winner"
//     nouns — the plural is just as literal a result reveal ("crowned World Cup
//     winners", "the group leaders after 3 games") yet slipped through: "winner"
//     needed a word boundary right after it, so the trailing "s" in "winners"/
//     "leaders" failed the match, and no separate plural alternative existed (every
//     other pluralizable token here — victories/hat-tricks?/shut-outs?/own-goals? —
//     already carries the "s?"). The optional "s?" adds no false-positive class the
//     singular didn't already accept. Byte-identical to the worker's copy.
const SPOILER_RX = /\b(walk[- ]?off|comeback|come[- ]from[- ]behind|extra[- ]?innings?|overtime|extra[- ]?time|stun|stuns|stunned|stunning|stunner|shock|shocks|shocked|shocking|crush\w*|outlast\w*|outclass\w*|outplay\w*|overpower\w*|outgun\w*|outscor\w*|prevail\w*|surviv\w*|dominat\w*|defeat\w*|beat\w*|edge\w*|sinks?|sank|holds?[- ]?off|held[- ]?off|sees?[- ]?off|saw[- ]?off|fends?[- ]?off|fended[- ]?off|rout|routs|routed|toppl\w*|trounc\w*|demolish\w*|destroy\w*|dismantl\w*|humiliat\w*|obliterat\w*|annihilat\w*|thrash\w*|thump\w*|pummel\w*|steamroll\w*|drub\w*|smash\w*|wallop\w*|spank\w*|maul\w*|hammer(?:ed|ing)|batter(?:ed|ing)|cruise\w*|triumph\w*|romp\w*|upset\w*|clinch\w*|seals?|sealed|sweep\w*|swept|oust\w*|eliminat\w*|bow(?:s|ed|ing)?[- ]?out|crash(?:es|ed|ing)?[- ]?out|dump(?:s|ed|ing)?[- ]?out|knock(?:s|ed|ing)[- ]?out|advanc\w*|leads?|leaders?|winning|winners?|wins|won|win|victory|victories|victorious|losing|lose|loses|lost|loss|hat[- ]?tricks?|braces?|no[- ]hitter|shut[- ]?outs?|blow[- ]?outs?|shoot[- ]?outs?|goalless|scoreless|\d{1,2}[- ]?nil|nil[- ]?(?:\d{1,2}|nil|all)|clean[- ]?sheets?|deadlock\w*|stalemate\w*|equali[sz]\w*|own[- ]?goals?|grand slam|send(?:s|ing)?[- ]?off|sent[- ]?off|red card|all three points)\b/i;

/** True if the text contains a score or an outcome keyword (i.e. a spoiler). */
export function isScoreSpoiler(text: string | null | undefined): boolean {
  if (!text) return false;
  return SCORE_RX.test(text) || SPOILER_RX.test(text);
}
