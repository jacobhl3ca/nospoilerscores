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
//     "own[- ]?goals?" joins the goal-event reveal family alongside "hat[- ]trick" and
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
const SPOILER_RX = /\b(walk[- ]?off|comeback|come[- ]from[- ]behind|extra[- ]?innings?|stun|stuns|stunned|stunning|stunner|shock|shocks|shocked|shocking|crush\w*|outlast\w*|outclass\w*|outplay\w*|overpower\w*|outgun\w*|outscor\w*|prevail\w*|surviv\w*|dominat\w*|defeat\w*|beat\w*|edge\w*|holds?[- ]?off|held[- ]?off|rout|routs|routed|toppl\w*|trounc\w*|demolish\w*|dismantl\w*|thrash\w*|thump\w*|cruise\w*|triumph\w*|romp\w*|upset\w*|clinch\w*|seals?|sealed|sweep\w*|swept|oust\w*|eliminat\w*|advanc\w*|leads?|leader|winning|winner|wins|won|win|victory|victories|victorious|losing|lose|loses|lost|loss|hat[- ]trick|no[- ]hitter|shut[- ]?outs?|blow[- ]?outs?|goalless|scoreless|clean[- ]?sheets?|equali[sz]\w*|own[- ]?goals?|grand slam|red card|all three points)\b/i;

/** True if the text contains a score or an outcome keyword (i.e. a spoiler). */
export function isScoreSpoiler(text: string | null | undefined): boolean {
  if (!text) return false;
  return SCORE_RX.test(text) || SPOILER_RX.test(text);
}
