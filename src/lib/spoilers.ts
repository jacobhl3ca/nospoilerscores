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
//   • SCORE_RX — a hyphenated scoreline. Each side is \d{1,3}, so it catches
//     both the low soccer/hockey/NFL form ("Chelsea 2-1 Spurs", "Chiefs
//     31-28 Bills") AND the three-digit basketball form ("Celtics 112-108
//     Knicks") — NBA/WNBA finals are almost always 3 digits a side, so the
//     old \d{1,2} cap leaked a bare box-score headline with no result verb
//     for SPOILER_RX to catch. Capped at 3 digits (not 4+) precisely so it
//     still excludes 4-digit years; the lookbehind/lookahead exclude M-D-Y
//     date hyphens and "2025-26" season spans so they don't false-positive.
//     The separator class is [-–—:] (hyphen, en-dash, em-dash, colon) so it
//     ALSO catches the colon scoreline European soccer titles lean on
//     ("Real Madrid 3:1 Barcelona") and the em-dash form ("3—2") — both
//     slipped past the hyphen/en-dash-only class and, since isScoreSpoiler is
//     used ONLY to UN-mask a played video's title (VideoModal), any over-match
//     merely keeps a title covered (the app's safe default — a masked title
//     costs a tap to reveal; a leaked one breaks the whole promise). A colon
//     between two 1-3 digit runs is a score in a per-match title; the 4-digit
//     cap still drops "3: 2026" (2026 fails \d{1,3}\b). Byte-identical to the
//     worker's copy.
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
//     "perfect[- ]?games?" catches the rarest, biggest pitching-feat reveal in the
//     baseball highlight stream ("Germán throws a PERFECT GAME!", "a perfect-game
//     for the ages") — a perfect game means the opponent reached base zero times,
//     so the phrase alone reveals that the pitcher's side won and shut the other
//     out without a baserunner, yet it carries no digits (SCORE_RX misses it) and
//     — unlike the streak group's "perfect", which is anchored to run/streak/start/
//     record — no existing keyword caught the "perfect game" wording. The "[- ]?"
//     covers "perfect game"/"perfect-game" and the "s?" the plural. Boundary-safe:
//     \bperfect can't fire inside "imperfect", and the trailing "game" keeps it
//     clear of "gameplay"/"gameplan" (no boundary after "game" there). The lone
//     benign collision — a preview blurb's "perfect game plan" — errs toward
//     over-hiding, the same over-hide-is-safe side as every entry above (a masked
//     title costs one tap; a leaked one breaks the whole promise). Byte-identical
//     to the worker's copy.
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
//     still match. "demolish" is written "demoli(?:sh\w*|tions?)" so it keeps every
//     verb inflection (demolish/demolishes/demolished/demolishing) AND adds the
//     noun "demolition"/"demolitions" — the blowout-reveal wording headlines use
//     without the verb ("City complete demolition of Everton", "a demolition job")
//     that carries no digit for SCORE_RX and matched none of the win-family
//     keywords, so it leaked. No derby guard: "demolition derby" (the motorsport)
//     is out of scope for this feed and over-hiding it is the safe side anyway,
//     whereas an in-scope "demolition [of] Derby" must stay caught.
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
//     "embarrass\w*" sits right beside "humiliat" in the all-caps fan-channel highlight titles this
//     filter actually sees ("Barcelona EMBARRASSED 5-0", "Man United embarrassed at home", "City
//     embarrass United") — a lopsided-defeat reveal that named the routed side just as plainly yet
//     slipped past the humiliate/destroy/obliterate/annihilate set and carries no digits for SCORE_RX
//     to catch. No English word other than these inflections begins with "embarrass", and no in-scope
//     club or nation is named anything beginning with it, so the trailing \w* covers embarrass/
//     embarrasses/embarrassed/embarrassing/embarrassment. Its one benign collision — an "embarrassing
//     miss" in a blooper/skills compilation — errs to the same over-hide-is-safe side as "destroy"
//     above (a masked title costs a tap to reveal; a leaked one breaks the whole promise).
//     Byte-identical to the worker's copy.
//     "capitulat\w*" is the loser-naming collapse word football recaps lean on constantly in this
//     WC-heavy app ("Spurs capitulate again", "Barcelona capitulated", "another United capitulation")
//     — a blew-it/surrendered-the-result reveal that names the losing side just as plainly as
//     "humiliat"/"embarrass" beside it, yet slipped past the whole blowout set and carries no digits
//     for SCORE_RX to catch. It is one of the CLEANEST members of the family: no English word other
//     than these inflections begins with "capitulat" (it can't reach any other stem), and no in-scope
//     club or nation is named anything beginning with it, so the trailing \w* covers capitulate/
//     capitulates/capitulated/capitulating/capitulation at negligible false-positive risk.
//     Byte-identical to the worker's copy.
//     "collaps\w*" is the direct sibling of "capitulat\w*" — the blew-it/surrendered-the-result
//     word recap and highlight titles lean on just as constantly in this WC-heavy app ("Barcelona
//     collapse again", "Spurs' stunning collapse", "United collapsed to defeat", "City collapsing
//     under pressure", "late collapse costs City") — a loser-naming reveal that names the side that
//     threw the result away just as plainly, yet slipped past the capitulate/humiliate/embarrass
//     set and carries no digits for SCORE_RX to catch. Note the stem drops the trailing "e"
//     (collaps, not collapse) so the -ing form (collapsing) still matches — the same e-drop the
//     toppl/trounc stems use above; a "collapse\w*" stem would miss it, since "collapsing" is
//     "collaps"+"ing" with no "e". No in-scope club or nation is named anything beginning with
//     "collaps", so the trailing \w* covers collapse/collapses/collapsed/collapsing (and the rare
//     "collapsible", which never appears in a per-match highlight title). Its one benign collision
//     — the literal medical "player collapses on the pitch" — is a news clip, not a per-match
//     highlight video title (the only content this filter sees), and errs to the same
//     over-hide-is-safe side as the verbs above (a masked title costs a tap to reveal; a leaked one
//     breaks the whole promise). Byte-identical to the worker's copy.
//     "choke\w*" is the American-English direct sibling of "capitulat\w*"/"collaps\w*" — the
//     blew-a-winning-position word US recap and fan-channel titles lean on constantly ("Falcons
//     CHOKE away 28-3", "the Warriors choked", "biggest choke in playoff history", "choker" tag) —
//     a loser-naming reveal that slipped past the capitulate/collapse pair despite naming the side
//     that threw the result away just as plainly, and carries no digits for SCORE_RX to catch. The
//     leading \b means it can't fire inside "artichoke" (there is no word boundary before the
//     "choke" there), and its one in-domain neighbour — the combat-sports "won by rear-naked
//     choke"/"chokehold" finish — is itself a method-of-victory reveal this filter WANTS masked
//     (same family as the TKO/submission/tap-out entries below), so that match is correct, not a
//     collision. The trailing \w* covers choke/chokes/choked/choking/choker at negligible
//     false-positive risk in a per-match title. Byte-identical to the worker's copy.
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
//     "pulveri[sz]\w*" is the same total-destruction blowout word the all-caps fan-channel highlight
//     titles lean on right beside DESTROY/OBLITERATE/ANNIHILATE ("Real Madrid PULVERIZE Barcelona",
//     "Spain pulverised Georgia 5-0", "City pulverizing United") — a lopsided-defeat reveal that
//     slipped past the demolish/destroy/dismantle/humiliate/obliterate/annihilate/thrash/thump/
//     trounce/topple set despite naming the routed side just as plainly and carrying no digits for
//     SCORE_RX to catch. It is one of the CLEANEST members of the family: absolutely no English word
//     other than these inflections begins with "pulveri" (it can't reach any other stem), and no
//     in-scope club or nation is named anything beginning with it. The "[sz]" covers both the American
//     "pulverize*" and British "pulverise*" spellings — mirroring the existing "equali[sz]\w*" entry —
//     and the trailing \w* covers pulverize/pulverizes/pulverized/pulverizing, pulverise/pulverises/
//     pulverised/pulverising at the same negligible false-positive risk as the verbs above.
//     Byte-identical to the worker's copy.
//     "vanquish\w*" is the same decisive-defeat verb match reports and tennis/boxing recaps
//     reach for ("Nadal vanquishes Djokovic", "Spain vanquish their rivals", "United
//     vanquished") — it names the beaten side outright yet slipped past the
//     defeat/beat/dispatch/see-off set, and carries no digits for SCORE_RX to catch. Like
//     obliterate/annihilate/pulverise it is one of the CLEANEST members of the family: no
//     English word other than these inflections begins with "vanquish", and no in-scope club
//     or nation is named anything beginning with it, so the trailing \w* covers
//     vanquish/vanquishes/vanquished/vanquishing/vanquisher at the same negligible
//     false-positive risk as the verbs above. Byte-identical to the worker's copy.
//     "triumph\w*"/"romp\w*" catch the winner-side framing headlines lean on just
//     as often ("Argentina triumph on penalties", "City romp to victory",
//     "Australia romp home") — each names the victor, and neither word means
//     anything but winning in ordinary English, so the false-positive risk is the
//     same negligible level as the blowout verbs above. Both keep their full
//     stem across every inflection (triumphs/triumphed/triumphing, romps/romped/
//     romping), so a trailing \w* covers all of them.
//     "conquer\w*" is the same winner-side framing verb sitting right beside
//     "triumph\w*"/"romp\w*": recap titles reach for it constantly for a side that
//     won the whole thing ("Argentina conquer the world", "City conquer Europe",
//     "Real Madrid conquered LaLiga", "conquering champions"), yet — despite the
//     synonym cluster around it (dominat/overpower/vanquish) — none of its forms
//     fired and the result leaked. It carries no digits (SCORE_RX misses it) and no
//     existing keyword caught it. The stem keeps its full spelling across every
//     inflection (conquer/conquers/conquered/conquering/conqueror(s)/conquest), so a
//     trailing \w* covers all of them, and in ordinary English "conquer" means
//     nothing but winning/subduing — the one out-of-scope collision ("conquest of
//     space") never occurs in the sports-highlight titles this filter sees and errs
//     to the over-hide-safe side regardless. Byte-identical to the worker's copy.
//     "dethron\w*" catches the flip side of the crown framing — the reigning
//     champion BEATEN, a storyline this filter sees across the events the app
//     covers ("Alcaraz dethrones Djokovic", "France dethroned as world champions",
//     "the holders dethroned"). The "crowned/world champions" and "lift the trophy"
//     keywords below name the side that WON a title; nothing named the side that
//     LOST its crown, yet that title carries no digits (SCORE_RX misses it) and no
//     beat/defeat/upset word need appear. No English word other than these
//     inflections begins with "dethron" (dethrone/dethrones/dethroned/dethroning/
//     dethronement), and in every sense it means removing a champion — a result
//     reveal — so the trailing \w* adds coverage at the same negligible
//     false-positive risk as its siblings. Byte-identical to the worker's copy.
//     "reign(?:s|ed|ing)?[- ]supreme" is the crown framing's other winner idiom, sitting
//     beside "triumph"/"conquer" above and the "crowned/world champions" + "lift the
//     trophy" keywords below: a title saying a side "reign supreme" names the dominant
//     victor/champion ("City reign supreme in the Premier League", "Verstappen reigns
//     supreme at Silverstone", "Real Madrid reigned supreme in Europe"), yet the phrase
//     carries no digits (SCORE_RX misses it) and no beat/win word need appear. Anchored
//     to the two-word "reign … supreme" collocation ON PURPOSE — a bare "reign" would
//     swallow the everyday "reigning champions" preview framing (a side that currently
//     HOLDS a title, no result revealed), whereas "reign supreme" means nothing but being
//     on top in ordinary sports English, so it adds coverage at the same negligible
//     false-positive risk as its siblings. The [- ] before "supreme" matches the space
//     (the only real form) and the inflections cover reign/reigns/reigned/reigning.
//     Byte-identical to the worker's copy.
//     "(?:go|goes|going|went|gone)[- ]back[- ]?to[- ]?back" catches the repeat-champion
//     idiom that sits beside the crown framing above: a side that "goes back-to-back"
//     has just won a second consecutive title ("Real Madrid go back-to-back in La Liga",
//     "Chiefs go back-to-back", "Warriors going back-to-back after Game 5"). The bare form
//     carries no digits (SCORE_RX misses it) and slipped past every title branch — those
//     need a take/claim/lift verb on an explicit title/crown/trophy object, and "back-to-
//     back titles/wins" is caught only when that object survives, not on the standalone
//     "go back-to-back". Anchored to the VERB form "go … back-to-back" and guarded by a
//     negative lookahead against the everyday schedule sense — "back-to-back games / nights
//     / road games / fixtures / sets / wins / defeats / clean sheets" is a two-in-a-row
//     SCHEDULE or tally, not a title, so a side that plays or racks up "back-to-back <noun>"
//     stays untouched (and the win/defeat tallies are caught, when they are, by their own
//     keywords). What remains is the outcome-free repeat-title reveal. The lone residual
//     over-hide — a "Can they go back-to-back?" title-defence preview — errs to the
//     over-hide-is-safe side, matching the "reigning champions" guard above. Byte-identical
//     to the worker's copy.
//     The "end/halt <possessive> reign" group catches the OTHER dethroning phrasing —
//     the one "dethron\w*" above misses. Recap titles routinely announce a beaten
//     champion as their "reign" being ENDED rather than a "dethrone" ("Nadal ends
//     Federer's reign", "City end United's title reign", "Leicester finally end City's
//     reign"), yet those carry no digits (SCORE_RX misses them) and need no beat/upset
//     word. Anchored to a POSSESSIVE before "reign" (their/its/his/her or a genitive
//     "<name>'s") ON PURPOSE — the very guard the "reign supreme" note above describes:
//     a bare "end … reign" would swallow the everyday preview question ("Can anyone end
//     the reign of the champions?", "Who will end the reign?"), which names no result,
//     whereas "end Federer's reign"/"end United's reign" names the champion just beaten.
//     Up to two filler words sit between the verb and the possessive ("finally end",
//     "end at last") and one optional word between possessive and "reign" ("United's
//     TITLE reign"), so the common variants are covered at the same negligible
//     false-positive risk as its siblings. Byte-identical to the worker's copy.
//     The revenge-verb group ("get/gain/exact/take … revenge") is the rivalry-result
//     sibling of the beat/avenge family: a title saying a side "gain revenge over",
//     "exact revenge on", or "get their revenge" names the winner of a rematch ("City
//     gain sweet revenge over United", "Dodgers exact revenge on the Padres", "Rovers
//     got their revenge in the derby"), yet it carries no digits (SCORE_RX misses it)
//     and no existing beat/win keyword need appear. The verb group takes up to three
//     filler words before "revenge" so "gain a measure of revenge" and "get some
//     revenge" are covered, and it is anchored to the "revenge" noun ON PURPOSE. The
//     one deliberate guard is the (?<!\bto ) lookbehind: it drops the infinitive
//     preview framing "looking/out/hoping to <verb> revenge" (no result revealed),
//     which the inflected result forms — "gets/got/gained/exacted/took revenge" — can
//     never take. Bare present-tense headlines ("Chiefs get revenge") are still caught
//     because they are not preceded by "to". A question preview ("Can they get their
//     revenge?") does match, but that is the exact accepted false-positive class the
//     unconditional "beat"/"win" keywords already carry, so it adds coverage at the
//     same negligible risk as its siblings. Byte-identical to the worker's copy.
//     "aveng(?:e|es|ed|ing)" is the verb the revenge-noun group above could not reach:
//     a rematch-result headline that puts the win in the verb itself and names no score
//     ("Fury avenges Wilder", "Alcaraz avenges Sinner", "Canada avenge USA", "Rovers
//     avenged the derby") slips SCORE_RX and, unless a beat/loss keyword happens to sit
//     alongside it, every existing SPOILER_RX branch too. It carries the SAME (?<!\bto )
//     lookbehind the revenge group uses, and for the same reason: only the infinitive
//     preview framing "out/looking/hoping to avenge" (no result revealed) is preceded by
//     "to", while the result forms a recap actually uses — bare present "Canada avenge",
//     "avenges", "avenged" — never are, so those stay caught while the preview drops.
//     "Avengers" is safe: the (?:e|es|ed|ing)\b tail needs a word boundary after the
//     inflection, and "aveng" + "ers" has none. Byte-identical to the worker's copy.
//     "cruise(?:s|d)?" catches the easy-win framing ("Real Madrid cruise past Getafe",
//     "City cruise to victory", "United cruised past Spurs") — a decisive-win reveal
//     the existing verbs miss ("edge" is the narrow win; nothing covered the
//     comfortable one). In a sports highlight title "cruise" means nothing but
//     winning comfortably, so it adds coverage with the same negligible
//     false-positive risk as the blowout verbs above. Spelled out (not "cruise\w*")
//     on purpose — same reason "seal" spells out "seals?|sealed" below: a trailing
//     \w* matches "cruise" as a prefix and, because the whole alternation carries a
//     closing \b, swallows "cruiser"/"cruiserweight" (cruise + "rweight" + word-end
//     boundary). Enumerating cruise/cruises/cruised covers the forms recap titles
//     actually use while the group's trailing \b, landing between the "e" and the
//     "r", keeps "cruiser"/"cruiserweight" out; the rarer -ing form ("cruising")
//     is left alone as before.
//     "canter(?:s|ed|ing)?" is the one clean member of that same comfortable-win family
//     (cruise/coast/stroll/waltz/breeze) still missing: British soccer recaps reach for it
//     constantly for an easy win ("Man City canter to the title", "Arsenal cantered to
//     victory", "United cantering to a 4-0 win") — a decisive-win reveal that carries no
//     digits (SCORE_RX misses it) and matched no existing keyword. In a per-match highlight
//     title "canter" means nothing but winning at ease (the horse-gait sense never appears
//     there), and no in-scope club or nation is named anything beginning with it. Inflections
//     are spelled out (canter/canters/cantered/cantering) rather than "canter\w*" for the
//     same reason "cruise" is: the required closing \b then lands between the "r" and the "b"
//     of "Canterbury", so the place name (and "decanter", guarded by the leading \b) can't
//     match. Byte-identical to the worker's copy.
//     "pull(?:s|ed|ing)?[- ]?away" is the pull-away idiom the same comfortable-win family
//     missed: a side that "pulls away" (or "pulled/pulling away", "pull-away") has opened a
//     decisive lead, the plainest way an NBA/soccer recap says one team ran off with it
//     ("Celtics pull away late", "City are pulling away at the top", "Verstappen pulls away
//     from the field") — a winner reveal carrying no digits (SCORE_RX misses it) that matched
//     no existing keyword. The mandatory trailing "away" is what keeps it safe: the everyday
//     non-result "pull" uses ("pull up", "pull quote", "pull off a trade") never read "away",
//     so a spoiler-free title survives. Byte-identical to the worker's copy.
//     "pull(?:s|ed|ing)?[- ]?clear" is the direct sibling of the pull-away idiom above, the phrasing
//     the racing/cycling and league-table framing leans on: a car, rider, or side that "pulls clear"
//     (or "pulled/pulling clear", "pull-clear") has opened a decisive gap on the field or the table
//     ("Verstappen pulls clear at the front", "Pogačar pulls clear on the final climb", "Arsenal pull
//     clear at the top") — a winner/lead reveal carrying no digits (SCORE_RX misses it) that "pull away"
//     did not cover. The mandatory trailing "clear" is what keeps it safe: the everyday non-result "pull"
//     uses never read "clear", and the closing \b lands between the "r" and the "a" of "clearance", so a
//     spoiler-free title survives; the lone benign collision (a preview's "Can X pull clear this weekend?")
//     errs to the same over-hide-is-safe side as "pull away". Byte-identical to the worker's copy.
//     "(?:makes?|made|making) (?:light|hard|short) work of" is the comfortable-/scrappy-win idiom the
//     same family missed: a side that "makes light work of" (or "short work of") an opponent won it
//     easily, and one that "made hard work of" it still won (the phrase only ever precedes the beaten
//     side) — the plainest way a soccer/WC recap frames the margin without a scoreline ("Barcelona make
//     light work of Getafe", "City made light work of it", "USA make hard work of Panama", "Newcastle
//     make short work of Leeds") — a
//     result reveal carrying no digits (SCORE_RX misses it) that matched no existing keyword.
//     The mandatory "work of" tail is what keeps it safe: the everyday non-result uses of the
//     bare words ("make the playoffs", "hard work in training", "a light-hearted look",
//     "the workload") never read "light/hard work of", so a spoiler-free title survives, and the
//     one benign collision (the "many hands make light work" proverb) errs to the same
//     over-hide-is-safe side as the verbs above. Byte-identical to the worker's copy.
//     "prov(?:e|es|ed|ing) too (?:strong|good|much)" is the superiority idiom that same family
//     still missed: "X prove too strong/good/much for Y" names X the winner and Y the beaten side
//     every time — a staple recap frame across soccer, tennis and the NFL ("Chiefs prove too
//     strong for Bills", "Djokovic proves too good for Alcaraz", "City proved too strong") that
//     carries no digits (SCORE_RX misses it) and matched no existing keyword. The mandatory
//     "too strong/good/much" tail is what keeps it safe: the leading \b pins it to "prove" so the
//     ubiquitous "improve"/"improved" never fire, and the everyday non-result "prove" uses ("prove
//     doubters wrong", "prove himself", "prove popular") never read "too strong/good/much", so a
//     spoiler-free title survives. Byte-identical to the worker's copy.
//     "(?:ha(?:ve|s|d)|having) too much (?:class |quality |firepower |pace |power |strength )?for" is
//     the direct sibling of "prove too strong/good/much": "X have too much for Y" (and the noun
//     variants "too much class/quality/firepower/pace/power/strength for") names X the winner and Y the
//     beaten side every time — a staple recap frame across soccer, tennis and the NBA ("City have too
//     much for United", "Spain had too much quality for Georgia", "Warriors have too much firepower for
//     the Suns") that carries no digits (SCORE_RX misses it) and matched no existing keyword. The
//     leading have/has/had/having verb plus the mandatory trailing "for" is what keeps it safe: the
//     everyday non-result "too much for" uses that lack a have-verb ("asking too much for a defender",
//     "fans pay too much for tickets", "too much pressure for the young keeper") never fire, and the
//     noun slot is a fixed result-margin set (class/quality/firepower/pace/power/strength) so the
//     have-verb collisions with a benign noun ("have too much respect/time/money for") pass through
//     untouched. Byte-identical to the worker's copy.
//     "too (?:good|strong) for(?! (?:words|comfort)\b)" is the verb-less superiority frame the two
//     siblings above still missed: recap titles routinely drop the "prove"/"have" verb entirely and
//     name the winner in a bare "X too good/strong for Y" ("Bayern too strong for Dortmund", "Liverpool
//     simply too good for Leeds", "City far too good for United") — X is the winner and Y the beaten side
//     every time, yet it carries no digits (SCORE_RX misses it) and matched no existing keyword. Only
//     "good" and "strong" get the verb-less treatment, deliberately NOT "much": bare "too much for"
//     collides with the everyday non-result uses the have-verb sibling above already documents ("pay too
//     much for tickets", "too much for the young keeper"), so it stays gated behind the have-verb. The
//     mandatory trailing "for" plus the (?! (?:words|comfort)\b) lookahead is what keeps the pair safe:
//     the one common benign collision, "too good for words", is excluded outright, and "too good to
//     miss"/"too good to be true" read "to" not "for" so they never fire. Byte-identical to the worker's copy.
//     "(?:(?:gets?|getting|got) the )?job done" is the workmanlike-win idiom recap titles reach for
//     when the named side won without drama — "get the job done" in a match title always means that
//     team came away with the win/result, yet it carries no digits (SCORE_RX misses it) and matched no
//     existing keyword. A staple across soccer, the NBA and the NFL ("Napoli get the job done",
//     "Man City gets the job done at the Etihad", "Chiefs got the job done in Denver"). The "get the"
//     prefix is now OPTIONAL so the bare declarative "Job done" — the title-style sibling recap channels
//     lead with ("Arsenal: Job done", "JOB DONE ✅", "Job done for the Gunners") — is caught too; it
//     read as a clean title before because the pattern required the verb prefix. The fixed "job done"
//     TAIL is still what keeps it safe: bare "get"/"got"/"job" have countless everyday senses, but the
//     two adjacent words "job done" read as a result the moment a club is named, and the nearest benign
//     collisions ("a job well done" has "well" between the words; "Jobe … done deal" is "Jobe", not the
//     word "job") don't match. The only real over-match — a preview asking "Can X get the job done?" —
//     errs to the over-hide-is-safe side (a masked preview costs a tap; a leaked result breaks the
//     promise). Byte-identical to the worker's copy.
//     "(?:gets?|getting|got) over the line" is the direct sibling of "the job done": "get over the
//     line" is the British win idiom for a side that saw the job through to the result, and it slipped
//     past the whole set ("Spurs got over the line at Chelsea", "England get over the line", "Ireland
//     getting over the line late on") — a winner reveal with no digits (SCORE_RX misses it) and no
//     existing keyword catching it. The fixed "over the line" tail keeps it safe exactly as "the job
//     done" does: the everyday "get over" senses ("get over here", "get over the disappointment")
//     don't carry it, and "get the ball over the line" (a goal-line replay) puts "the ball" between
//     "get" and "over" so it can't match. The only benign collision — a preview asking "Can X get
//     over the line?" — errs to the over-hide-is-safe side, like "the job done" above. Structured
//     like its sibling (gets?/getting/got, then the literal tail); the rarer racing "cross the line
//     first" is already covered separately. Byte-identical to the worker's copy.
//     "(?:grind(?:s|ing)?|ground)[- ]?out (?:a |an |the )?(?:win|victory|result|draw|points?)" is the
//     gritty-win idiom recap titles reach for when a favourite (or a struggling side) got the job done
//     without flair: "grind out a win/result" always means the named side came away with the points.
//     A staple across soccer and the NFL ("Chelsea grind out a win at Anfield", "Spurs ground out a
//     draw", "City grind out the points", "Cowboys grinding out a result") that carries no digits
//     (SCORE_RX misses it) and matched no existing keyword. The mandatory result-noun tail is what
//     keeps it safe: bare "grind"/"ground out" have everyday non-result senses ("the daily grind",
//     "grind out another season", "grind out a living", "grind out reps") that never read
//     "win/victory/result/draw/points", so those pass through untouched. The stem lists only the
//     forms titles use (grind/grinds/grinding/ground); "grounds out" — the baseball out — cannot
//     fire because the "s" breaks the "ground out" stem, and even its rare past form carries no
//     result-noun tail. Byte-identical to the worker's copy.
//     "ek(?:e|es|ed|ing)[- ]?out (?:a |an |the )?(?:win|victory|result|draw|points?)" is the narrow-margin
//     cousin of "grind out a win": "eke out a win/victory/draw" always means the named side just barely
//     came away with it — a staple of tight-result recap titles ("Arsenal eke out a win at Turf Moor",
//     "USMNT eked out a draw", "City eke out the points") that carries no digits (SCORE_RX misses it) and
//     matched no existing keyword. The mandatory result-noun tail is what keeps it safe: bare "eke out"
//     has an everyday non-result sense ("eke out a living", "eke out an existence") that never reads
//     "win/victory/result/draw/points", so it passes through untouched. Byte-identical to the worker's copy.
//     "(?:eas(?:e|es|ed)|power(?:s|ed)?|breez(?:e|es|ed)|coast(?:s|ed)?|sail(?:s|ed)?|stroll(?:s|ed)?|glid(?:e|es|ed)|
//     waltz(?:es|ed)?|roll(?:s|ed)?)[- ]?past" catches the SAME comfortable-win framing "cruise(?:s|d)?" covers
//     but in its other everyday verbs — the "X past Y" idiom soccer/NBA recap titles lean on
//     constantly ("Spain ease past Georgia", "City power past United", "Madrid breeze past
//     Getafe", "Real Madrid coast past Alaves", "United powered past City", "Celtics roll past
//     Nets") — each of which names the side that was beaten comfortably yet slipped past every
//     existing verb and carries no digits for SCORE_RX. "roll past" is the American-sports
//     ("Chiefs roll past Broncos", "Lakers rolled past the Suns") member of the family, the lone
//     one still missing. It is anchored to the mandatory trailing "past" exactly
//     like the "brush …aside"/"hold …off"/"see …off" idioms below/above, and that anchor is
//     what makes the otherwise-common bare verbs safe: "power"/"ease"/"coast"/"roll" cannot fire alone,
//     so "power ranking", "star power", "at ease", "West Coast", "coast to coast", "on a roll",
//     "roll call" and "years past" all pass through untouched. Each verb lists only the forms recap titles use
//     (ease/eases/eased, power/powers/powered, breeze/breezes/breezed, coast/coasts/coasted,
//     sail/sails/sailed, stroll/strolls/strolled, glide/glides/glided, waltz/waltzes/waltzed, roll/rolls/rolled); the rarer -ing forms are left alone like
//     cruise's. The one benign collision — "ease past the keeper" describing a dribble — reveals
//     a goal, not a result, and errs to the same over-hide-is-safe side as the verbs above.
//     "grind(?:s|ing)?|ground" is the family's newest member — the "X past Y" cousin of the
//     "grind …out a win" idiom above, for the hard-fought narrow win recap titles frame as grinding
//     ("Rangers grind past the Devils", "City grind past stubborn Palace", "United ground past Everton").
//     "glid(?:e|es|ed)" is the family's newest member — the smooth-motion cousin of breeze/coast/waltz
//     that tennis, motorsport and NBA recap titles reach for ("Alcaraz glides past Sinner", "Verstappen
//     glided past Hamilton for the lead", "Celtics glide past the Nets") — a beaten opponent named
//     without digits, missed by every existing verb. Anchored to the same trailing "past", so the bare
//     "glide" senses ("glide path", "hang gliding") never fire; forms are spelled out (glide/glides/glided)
//     to match the family, leaving the rare "gliding past" alone like breeze's.
//     "sail(?:s|ed)?" is the family's newest member — the effortless-win cousin of breeze/coast/cruise
//     that tennis, soccer and American-sports recaps reach for ("Nadal sails past Kyrgios", "City sail
//     past Burnley", "Chiefs sailed past the Broncos") — a beaten opponent named without digits, missed
//     by every existing verb. Anchored to the same trailing "past", so the bare "sail" senses ("plain
//     sailing", "trim the sails") and the sailing sport ("America's Cup sailing", "sailing past the buoy")
//     never fire; forms are spelled out (sail/sails/sailed) to match the family, leaving "sailing past"
//     alone like breeze's — which also keeps the sport's present-participle out of range.
//     The mandatory trailing "past" keeps the bare verb safe exactly as it does the rest: "the daily
//     grind", "grind to a halt" and "grind on" never reach a "past", and baseball's "grounds past the
//     shortstop" cannot fire because its "s" falls outside the "ground" form listed here.
//     Byte-identical to the worker's copy.
//     "blow(?:s|n)?|blew" joins that same "X past Y" comfortable-win group as its going-away/
//     blowout-tempo member: "blow past" is the staple American-sports idiom for running clean
//     away from an opponent ("Mavericks blow past the Suns", "Cowboys blew past the Eagles",
//     "the Bills were blown past"), and — exactly like "roll past" before it — every form slipped
//     past the ease/power/breeze/coast/stroll/waltz/roll set and carries no digits for SCORE_RX.
//     It is anchored to the mandatory trailing "past" like its siblings, which is what keeps the
//     hugely common bare "blow" safe: it cannot fire alone, so "blow the lead", "blow a save",
//     "blow the whistle", "blow-by-blow" and "don't blow it" all pass through untouched (and the
//     separate "blow[- ]?outs?" entry still owns "blowout"). Lists only the forms recap titles use
//     (blow/blows/blown/blew); the -ing form ("blowing past") is left alone like cruise's/roll's.
//     Its one benign collision — "blow past expectations/estimates" (the exceed sense) — never
//     appears in a per-match highlight title and errs to the same over-hide-is-safe side as the
//     verbs above. Byte-identical to the worker's copy.
//     "get(?:s|ting)?|got" is the plainest member of that same "X past Y" group — the neutral
//     "get past" idiom every sport reaches for when one side simply beats another ("Arsenal get
//     past Spurs", "Alcaraz gets past Zverev in four sets", "Bayern got past Dortmund", "Chiefs
//     getting past the Bills") — a bare winner reveal that names the beaten side yet slipped past
//     every ease/power/breeze/coast/stroll/waltz/roll/blow verb and carries no digits for SCORE_RX.
//     It is anchored to the mandatory trailing "past" exactly like its siblings, which is what
//     keeps the hugely common bare "get"/"got" safe: they cannot fire alone, so "get well soon",
//     "got injured", "getting fit", "get the start" and "got the nod" all pass through untouched,
//     and the existing "(?:gets?|getting|got) the better of" / "the job done" clauses (which need
//     their own trailing phrase) are unaffected. Lists only the forms recap titles use
//     (get/gets/getting/got). Byte-identical to the worker's copy.
//     "(?:sneak(?:s|ed)?|snuck|slip(?:s|ped)?|squeez(?:e|es|ed))[- ]?past" is the NARROW-win
//     twin of the comfortable-win "X past Y" group directly above: same "verb + past" idiom, but
//     for a side that only just got through ("Real Madrid sneak past Getafe", "Chelsea slip past
//     Fulham", "Spain squeeze past Georgia to reach the last 16", "United snuck past City") — each
//     names the beaten side just as plainly, yet all slipped past the ease/power/breeze/coast/
//     stroll/waltz set and carry no digits for SCORE_RX. Like that group it is anchored to the
//     mandatory trailing "past", which is what keeps the otherwise-common bare verbs safe: "slip",
//     "sneak", and "squeeze" cannot fire alone, so "slippery pitch", "sneak peek", and "squeeze
//     play" all pass through untouched. Each verb lists only the forms recap titles use
//     (sneak/sneaks/sneaked plus the irregular past "snuck"; slip/slips/slipped; squeeze/squeezes/
//     squeezed); the rarer -ing forms are left alone like cruise's. The one benign collision —
//     "slip past the defender"/"sneak past the keeper" describing a dribble — reveals a goal, not a
//     result, and errs to the same over-hide-is-safe side as "ease past the keeper" above.
//     Byte-identical to the worker's copy.
//     "squeak(?:s|ed|ing)?[- ]?(?:past|by|through)" is the same narrow-win idiom one word wider
//     than its sneak/slip/squeeze siblings just above: "squeak past/by/through" is the staple
//     just-scraped-a-result phrasing across every league ("France squeak past Belgium", "Chiefs
//     squeak by the Broncos", "Real Madrid squeaked through to the semis") — each names a winner
//     or an advancing side, yet all slipped past the sneak/slip/squeeze set (which lists only
//     "past") and carry no digits for SCORE_RX. It gets the extra "by"/"through" connectors
//     because "squeak" pairs with all three where its siblings mostly take "past", and it is the
//     mandatory connector — not the verb — that keeps it safe: bare "squeak" cannot fire, so
//     "squeaky clean", a floorboard "squeak", and "not a squeak from the bench" all pass through
//     untouched. "through" doubles up with the "through to the finals" advance pattern below on
//     tournament titles, which is fine — a second match on a real spoiler changes nothing.
//     Byte-identical to the worker's copy.
//     "scrap(?:e|es|ed|ing)[- ]?(?:past|by|through)" is the literal narrow-win idiom the
//     squeak/sneak/slip/squeeze family paraphrases — "scrape past/by/through" is how recap
//     titles most plainly say a side just barely got the result ("Arsenal scrape past Palace",
//     "Napoli scrape by Roma", "Inter scraped through to the final") — each names the winner or
//     the advancing side, yet none carries a digit for SCORE_RX and all slipped past the squeak
//     set. Like that set it is anchored to the mandatory past/by/through connector, which is what
//     keeps the bare verb safe: "scrap(?:e|es|ed|ing)" cannot fire without it, so "scrape the
//     barrel", "scrape together a squad", a "scrap" for the ball, and "scrappy" all pass through
//     untouched. The required suffix (no trailing "?") also blocks bare "scrap" itself. "through"
//     doubles up with the "through to the finals" advance pattern below on tournament titles, which
//     is fine — a second match on a real spoiler changes nothing. Byte-identical to the worker's copy.
//     "(?:put|stick|stuck|slam|bang|slot|rifle|fire|bury) (?:\d{1,2}|one…ten) past" catches the
//     goals-scored idiom soccer recap titles lean on constantly ("Arsenal put five past Chelsea",
//     "City stick four past United", "Bayern slam five past Werder", "Haaland buries three past
//     Spurs") — the count IS the reveal (the tally, and with it the comfortable winner), yet it
//     carries no hyphenated scoreline for SCORE_RX and slipped past the whole verb set. "put" was
//     the first member; "stick/slam/bang/slot/rifle/fire/bury" are its exact synonyms in this
//     construction — every one means "score N goals against" here and nothing else — added because
//     "City stick four past United" leaked while "City put four past United" was already hidden.
//     Unlike the bare-verb "X past Y" idioms above the whole group is gated on a MANDATORY number
//     between the verb and "past", which is what keeps these ubiquitous verbs safe: "put the past
//     behind", "stick to the plan", "fire on all cylinders", "bang the drum", "puts pen to paper",
//     and "the past five games" all lack a number in that exact slot and pass through untouched.
//     Only one…ten and 1–2-digit counts are listed (the range a single side ever scores), so no
//     bare verb can fire, and the same number gate keeps clearance senses ("bundle it out for a
//     corner", "hacks it clear") clear too since none carries a number before "past". The one
//     benign collision — "slots one past the keeper" describing a single goal — reveals a score,
//     not a full result, and errs to the same over-hide-is-safe side as "ease past the keeper"
//     above. Byte-identical to the worker's copy.
//     "brush(?:es|ed|ing)?[- ]?aside" catches the beat-easily framing soccer/World Cup
//     headlines lean on constantly ("Spain brush aside Georgia", "France brushed aside
//     the hosts", "City brushing aside United") — a decisive-win reveal that slipped past
//     the cruise/dispatch/dominate set: it names the side that was swept away, yet in a
//     sports-title context "brush aside X" means nothing but beating X comfortably. It is
//     anchored to the two-word "brush …aside" idiom (the "aside" is mandatory) so the bare
//     "brush" senses ("brush with controversy") can't trip it, keeping the false-positive
//     risk negligible. The "(?:es|ed|ing)?" covers brush/brushes/brushed/brushing and the
//     "[- ]?" the rare hyphenated form. Byte-identical to the worker's copy.
//     "swat(?:s|ted|ting)?[- ]?aside" is the direct sibling of "brush …aside" above — the
//     same beat-easily framing in its other everyday verb ("City swat aside Palace", "Bayern
//     swatted aside the challengers", "Arsenal swatting aside Fulham"). It names the side that
//     was dismissed comfortably, carries no digits for SCORE_RX, and slipped past both the
//     brush/cruise/dispatch set and the "X past Y" group. The mandatory two-word "swat …aside"
//     tail keeps it as safe as its sibling: the bare "swat" senses ("swat a fly", the SWAT
//     team) never carry the "aside", so they pass through untouched. "(?:s|ted|ting)?" covers
//     swat/swats/swatted/swatting and "[- ]?" the rare hyphenated form. The one benign
//     collision — a keeper "swats aside" a shot (a save, not a result) — errs to the same
//     over-hide-is-safe side as "brush aside the shot". Byte-identical to the worker's copy.
//     "crush\w*" replaces the earlier bare "crushes": that lone inflection missed
//     the plural-present "Bayern crush Barca" and the past-tense "City crushed
//     United" — both decisive-win reveals — while every sibling defeat verb
//     (dominat\w*/defeat\w*/beat\w*) already used the stem+\w* form. In a sports
//     highlight title "crush" means nothing but a lopsided defeat, so widening it
//     carries the same negligible false-positive risk as the verbs above.
//     "dominant(?:ly)?" closes the one gap "dominat\w*" leaves in its own family:
//     the stem+\w* form catches dominate/dominated/dominating/domination but the
//     adjective "dominant" spells its seventh letter n-not-t, so it slips through —
//     yet "dominant" is the form recap titles reach for most ("Dominant City",
//     "a dominant display"). In a per-game highlight title it names a lopsided
//     winning performance exactly as the verb forms do; the leading \b( on the
//     whole pattern keeps it from matching inside "predominant(ly)".
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
//     "snatch\w*" catches the grab-a-late-result reveal soccer/hockey recaps lean
//     on constantly ("Rodri snatches a late winner", "Spain snatch a draw", "United
//     snatched all three points", "Bellingham snatches it at the death") — several of
//     which name only a late decider ("snatch a draw"/"snatch the lead"/"snatch a
//     point") that slipped past the win/draw set entirely. In a sports-title context
//     "snatch" means nothing but grabbing a win/lead/point/draw late (no in-scope team
//     is named anything beginning with "snatch", and the literal grab/theft sense never
//     appears in a highlight title), so the trailing \w* covers snatch/snatches/snatched/
//     snatching at the same negligible false-positive risk as the sibling verbs. Kept
//     byte-identical to the worker's copy.
//     "nick …" is the British sibling of "snatch": the narrow/late-win idiom match
//     reports reach for constantly ("Spurs nick it late on", "Rangers nick the points
//     at Ibrox", "Barcelona nick a point at the death", "United nick a late winner").
//     Bare "nick it"/"nick a point"/"nick the points" name only who took the result yet
//     carry no digits (SCORE_RX misses them) and matched no existing token, so a plain
//     narrow-win recap written this way leaked. Unlike "snatch", "nick" is common as a
//     name (Nick) and in "in the nick of time", so it is NOT a bare-word match: it is
//     pinned to a trailing result object (it | the win/points/lead/victory/title/tie | a
//     win/winner/point/victory/late winner/goal | all three points), which is what keeps
//     "Nick Foles", "in the nick of time" and "nickel package" out. Kept byte-identical
//     to the worker's copy.
//     "steal …"/"stole …" is the American (and general) sibling of "nick"/"snatch": the
//     narrow/late-win idiom recaps reach for across the NBA, NFL, MLB and soccer ("Chiefs
//     stole it in overtime", "Rangers steal a point at the death", "Celtics stole the win
//     in Boston", "United steal all three points at Anfield"). It names only who took the
//     result yet carries no digits (SCORE_RX misses it) and matched no existing token, so
//     a plain narrow-win recap written this way leaked. Like "nick", it is NOT a bare-word
//     match — bare "steal(s)" is a basketball/soccer defensive stat ("5 steals"), a
//     bargain ("the steal of the draft", "steal a march") or a standout turn ("steal the
//     show"/"steal the ball") — so it is pinned to the same trailing result object as
//     "nick" (it | the win/points/lead/victory/title/tie | a win/winner/point/victory/
//     late winner/goal | all three points), which keeps those benign senses out. Kept
//     byte-identical to the worker's copy.
//     "shade …" is the tennis/boxing/darts/snooker sibling of "nick"/"steal": the
//     narrow-win idiom those recaps reach for constantly for a tight-margin result
//     ("Djokovic shades it in five sets", "Fury shaded the early rounds", "Alcaraz shades
//     the opener", "Selby shades the deciding frame"). To "shade it"/"shade the set"
//     always means the named side edged it, yet the phrase carries no digits (SCORE_RX
//     misses it) and matched no existing token, so a bare "… shades it" recap leaked. Like
//     "nick"/"steal" it is NOT a bare-word match — bare "shade(s)" is a look ("shades of
//     Messi"), a taunt ("throwing shade"), a dribble ("shade the defender") or literal
//     shadow ("in the shade") — so it is pinned to a trailing result object: either "it"
//     or "the/this/that <result noun>" (set/game/frame/leg/round/opener/decider/contest/
//     match/tie/fight/bout/series/final), with one optional adjective slot so "shaded the
//     EARLY rounds"/"shades the FIRST set" are caught. The one benign collision — the
//     literal "the shade it provides", which never appears in a per-match highlight title —
//     errs to the same over-hide-is-safe side as its siblings (a masked title costs a tap
//     to reveal; a leaked one breaks the whole promise). Byte-identical to the worker's copy.
const SCORE_RX = /(?<![-/])\b\d{1,3}\s*[-–—:]\s*\d{1,3}\b(?![-/])/;
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
//     "outpoint\w*" is the combat-sports member of the same outXXX family: to
//     outpoint an opponent is to win a fight on the judges' scorecards (a points
//     decision), so boxing/MMA and amateur recap titles name the winner outright
//     with it ("Crawford outpoints Madrimov", "Taylor outpointed Serrano", "Canelo
//     outpointing Charlo") — a decision-win reveal that carries no digits for
//     SCORE_RX and sat beside the already-covered combat verbs (TKO/KO/stops/
//     submission/decision) yet slipped through. No non-result English word begins
//     with "outpoint" (its only sense is to score more points than / outdo; the
//     rare sailing sense never appears in a highlight title), and no in-scope
//     fighter/team is named anything beginning with it, so the trailing \w* covers
//     outpoint/outpoints/outpointed/outpointing at the same negligible
//     false-positive risk as its siblings. Byte-identical to the worker's copy.
//     "outbox\w*" sits right beside "outpoint\w*" as the other combat-sports member
//     of the outXXX family: to outbox an opponent is to beat them on skill over the
//     distance, so boxing recaps name the winner outright with it ("Canelo outboxes
//     Charlo", "Crawford outboxed Madrimov", "Lomachenko outboxing Lopez") — a
//     win reveal that carries no digits for SCORE_RX and slipped past the already-
//     covered combat verbs (TKO/KO/stops/outpoint/decision) just like outpoint had.
//     Its only same-spelled non-sport sense is the email "outbox", which never
//     appears in a per-match highlight title, and no in-scope fighter/team is named
//     anything beginning with "outbox", so the trailing \w* covers outbox/outboxes/
//     outboxed/outboxing at the same negligible false-positive risk as its siblings.
//     Byte-identical to the worker's copy.
//     "flat[- ]?lin(?:e|es|ed|ing)" catches the most emphatic knockout reveal in the
//     combat-sports highlight stream ("Makhachev flatlines his opponent", "brutal
//     flatline finish", "he got FLATLINED"): to flatline an opponent is to knock them
//     cold, so the phrase names the winner and a finish outright, yet it carries no
//     digits (SCORE_RX misses it) and slipped past the already-covered combat verbs
//     (TKO/KO/stops/starch/submission/decision). The "[- ]?" covers flatline/flat-line/
//     flat line and the (?:e|es|ed|ing) the inflections; the leading \b keeps it clear
//     of other "flat…" words ("flat back four", "a flat first half") and the trailing
//     "lin…" boundary keeps it off "flatly"/"flatten". Its only non-combat sense — a
//     metaphor for stalled momentum ("the offense flatlined") — still names a result
//     collapse and, either way, errs toward the safe over-hide side every entry above
//     shares (a masked title costs one tap; a leaked one breaks the whole promise).
//     Byte-identical to the worker's copy.
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
//     "relegat\w*" catches the flip side of that survival framing — the definitive
//     season-outcome reveal for the promotion/relegation leagues the app covers
//     (EPL/UCL/UEL et al.): "Leeds relegated to the Championship", "Sheffield United
//     relegation confirmed", "Everton relegating themselves with a loss" each name
//     the team AND its fate (dropped a division), yet carry no digits (SCORE_RX
//     misses them) and matched none of the beat/defeat/lose set, so the result leaked.
//     In a per-match highlight or news title "relegated"/"relegation" essentially
//     always means the drop; the only benign sense ("relegated to the bench") is
//     itself result-adjacent and rare, so the trailing \w* covers relegate/relegated/
//     relegating/relegation at the same negligible false-positive risk as its
//     siblings. Promotion is that same season-outcome reveal, mirrored — but a bare
//     "promot\w*" over-hides ("promotional video"/"promoted content"/"coach promoted
//     to a role"), so instead it is caught in two anchored forms only. First, a result
//     verb bound to the noun: "secure/earn/gain/confirm/achieve/complete/celebrate/
//     seal/clinch/win promotion" (secure/earn/gain/confirm/achieve/complete/celebrate
//     are not standalone win-verbs above, so "Leeds secure promotion"/"Wrexham earn
//     promotion" had leaked; the {0,3}? lets a modifier sit between, e.g. "seal their
//     long-awaited promotion"). Second, "promoted/promotion to <division>" gated on a
//     league/tier word (league, division, flight, tier, premier, championship, Serie A,
//     Bundesliga, La Liga, Eredivisie), so "Sunderland promoted to the Premier League"
//     is caught while "promoted to captain"/"promotional video" stay visible. The
//     "promotion" of a boxing/MMA org ("Matchroom promotion") matches neither branch.
//     "overpower\w*"/"outgun\w*" catch two more decisive-win verbs headlines
//     lean on ("Spain overpower Italy", "Bills outgun Chiefs", "Warriors outgun
//     Suns") — each names the winner of a lopsided or high-scoring contest, and
//     no non-result English word begins with either stem, so they add coverage
//     with the same negligible false-positive risk as the blowout verbs above.
//     The trailing \w* covers every inflection (overpowers/overpowered/
//     overpowering, outguns/outgunned/outgunning).
//     "overwhelm\w*" is the same decisive-win verb sitting right beside
//     "overpower\w*"/"dominat\w*" — recap titles reach for it constantly for a side
//     that took a lopsided contest ("Spain overwhelm Georgia", "City overwhelmed
//     United", "an overwhelming display") — yet, despite the synonym cluster around
//     it, none of its forms fired and the result leaked. It carries no digits (SCORE_RX
//     misses it) and no existing keyword caught it. No non-result English word begins
//     with "overwhelm", and no in-scope club or nation is named anything beginning with
//     it, so the trailing \w* covers overwhelm/overwhelms/overwhelmed/overwhelming/
//     overwhelmingly at the same negligible false-positive risk as the verbs above.
//     Byte-identical to the worker's copy.
//     "outmuscl\w*" is the physical-dominance member of the same outXXX family
//     sitting beside "overpower\w*"/"outgun\w*" — the staple verb for winning the
//     bodies-and-battle framing this WC/soccer-heavy app sees constantly, and the
//     one the NFL/rugby recaps reach for too ("Liverpool outmuscle Everton at
//     Anfield", "Chiefs outmuscled the Broncos in the trenches", "Spain
//     outmuscling Germany"). It names the side that won the physical contest yet
//     carries no digits (SCORE_RX misses it) and matched no existing keyword, so
//     the result leaked. No non-result English word begins with "outmuscl" (its
//     only sense is to overpower physically), and no in-scope club or nation is
//     named anything beginning with it, so — like "outscor\w*" above, whose "-ing"
//     form likewise drops the silent "e" — the truncated stem's trailing \w* covers
//     outmuscle/outmuscles/outmuscled/outmuscling at the same negligible
//     false-positive risk as its siblings. Byte-identical to the worker's copy.
//     "outduel\w*" is the same outXXX family — and the staple of the QB-vs-QB and
//     star-vs-star matchup recaps this filter sees in the NFL/NBA ("Mahomes outduels
//     Allen", "Curry outduels Doncic", "Brady outdueled Rodgers") — a winner reveal
//     the siblings above miss (it's neither a blowout nor an out-score margin, but a
//     head-to-head "the named side won the duel" framing). No non-result English word
//     begins with "outduel", and no in-scope team is named anything beginning with it,
//     so the trailing \w* covers outduel/outduels/outdueled/outduelled/outdueling/
//     outduelling at the same negligible false-positive risk as its siblings.
//     Byte-identical to the worker's copy.
//     "outfight\w*|outfought" completes the same outXXX family — the grind-it-out,
//     won-the-physical-battle framing headlines reach for across soccer/NFL/combat
//     ("Real Madrid outfought Barcelona for a point", "Chelsea outfight Arsenal in a
//     scrappy affair", "Warriors outfighting Celtics down the stretch") — a winner
//     reveal that carries no digits for SCORE_RX and, unlike every sibling above,
//     slipped through because "fight/fought" is the one irregular past tense a bare
//     \w* stem can't reach (outfought needs its own alternative). No non-result
//     English sense begins with "outfight"/"outfought" — both mean only to beat in a
//     contest — so they add coverage at the same negligible false-positive risk. The
//     \w* on "outfight" covers outfight/outfights/outfighting; "outfought" is listed
//     literally. Byte-identical to the worker's copy.
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
//     The scoring-verb-plus-count group ("scores/nets/slots/fires/converts twice|thrice|three
//     times|four times") joins the same goal-event reveal family as "braces?" and
//     "hat[- ]?tricks?": a title naming a player's multi-goal haul in a match ("Haaland scores
//     twice", "Ronaldo nets twice", "Kane slots twice", "Bruno converts twice") reveals both
//     that the match wasn't goalless and, usually, which side scored — the same partial-result
//     leak as a brace — yet the count is spelled out rather than hyphenated so SCORE_RX misses
//     it and none of the win-family verbs caught the bare "twice"/"thrice" wording. The count
//     word must sit directly after the scoring verb, so a lone "scores" in a preview question
//     ("Can he score tonight?") is untouched, and no bare "N goals" tally is matched precisely
//     because "top 10 goals of the season"-style compilation titles are benign and must stay
//     clean (see tests/spoilers-close-out-series.test.ts). Byte-identical to the worker's copy.
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
//     "on penalt(?:ies|y kicks)" is the same penalty-shootout reveal as "shoot[- ]?outs?", in the
//     surface form this WC-heavy app sees most through the knockout rounds — the idiom "on
//     penalties" ("Croatia go through on penalties", "Spain beaten on penalties", "decided on
//     penalty kicks", "heartbreak for the Dutch on penalties"). A shootout only happens once a
//     match is level after extra time, so the phrase alone reveals the game went the distance and
//     was settled from the spot, yet it carries no digits (SCORE_RX misses it) and — unless it
//     happened to also carry a covered verb like "win"/"beat" — no existing keyword caught the
//     bare phrase, so a "… on penalties" recap leaked. The mandatory leading "on " keeps a single
//     in-game spot-kick safe: "Messi penalty", "two penalties awarded", "converts a penalty" and
//     "misses from the spot" all lack the "on " and pass straight through, and the leading \b sits
//     before "on" so it can't fire inside "iron"/"bacon"/"Lyon" (no boundary before that "on").
//     The one benign collision — a rare training/preview blurb "working on penalties" — errs
//     toward over-hiding, the same safe side as every entry above (a masked title costs one tap;
//     a leaked one breaks the whole promise). Byte-identical to the worker's copy.
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
//     "sudden[- ]?death" is the direct sibling of "overtime"/"extra[- ]?time"/"shoot[- ]?outs?" in the
//     went-the-distance family: sudden-death only happens once a game is level at the end of regulation,
//     so the phrase alone reveals the result state — an NHL "sudden death OT winner", an NFL "sudden
//     death" finish, or a golf "sudden-death playoff" (players tied) — yet it carries no digits (SCORE_RX
//     misses it) and slipped past "overtime"/"extra[- ]?time", which don't cover the golf/NHL phrasing.
//     Near-zero false-positive risk: no in-scope team, nation, or league is named "sudden death", and in
//     the per-match highlight titles this filter actually sees the phrase means nothing but a tied game
//     settled in sudden death (the lone benign collision — the "Sudden Death" film — is not a sports
//     highlight and errs to the same over-hide-is-safe side as the verbs above). The optional "[- ]?"
//     covers "sudden death"/"sudden-death"/"suddendeath". Byte-identical to the worker's copy.
//     "golden[- ]?(?:goals?|points?)" is the specific went-the-distance term sitting right beside
//     "sudden[- ]?death": a golden goal (soccer/hockey) IS the sudden-death goal that ends the match the
//     instant it's scored, and a golden point (rugby league / NRL) is its exact analogue — the first
//     score in golden-point extra time wins on the spot. Either phrase alone reveals both that the game
//     went past regulation AND that it's over with a winner ("Iniesta golden goal wins it", "Panthers
//     take it in golden point") — a result reveal that carries no digits (SCORE_RX misses it) and slipped
//     past "sudden[- ]?death" (which doesn't cover the "golden goal"/"golden point" phrasing) and every
//     existing keyword. The mandatory trailing "goal"/"point" is what keeps it clear of the in-scope team
//     name "Golden State" (Warriors / Valkyries) and of "golden boot"/"golden generation": none is
//     followed by "goal"/"point", so the leading \b + "golden" + "[- ]?" + "(?:goals?|points?)" can only
//     fire on the actual terms. No in-scope club or nation is named "Golden Goal"/"Golden Point", and in
//     the per-match highlight titles this filter actually sees the phrase means nothing but a sudden-death
//     result, so the "[- ]?" (golden goal / golden-goal / goldengoal) and "s?" (plural) add coverage at
//     near-zero false-positive risk. Byte-identical to the worker's copy.
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
//     "sunk" joins "sinks?"/"sank" as the past participle those two forms miss: the passive
//     defeat-reveal British recap titles lean on constantly ("Arsenal sunk by a late Rodri goal",
//     "Liverpool sunk at the death", "United sunk without a fight") never reads "sank" (the active
//     past), so it slipped past the sink/sinks/sank set and carries no digits for SCORE_RX. Like
//     its siblings it is spelled out (not "sunk\w*") and whole-word (\bsunk\b), so it can't match
//     inside "sunken", and no in-scope club or nation is named "Sunk"; the only benign senses
//     ("sunk cost", a literal "the ship sunk") never appear in the per-match highlight titles this
//     filter actually sees and err to the same over-hide-is-safe side. Byte-identical to the worker's copy.
//     "downs"/"downed" join the sink/sank/sunk defeat family with the transitive "X downs Y" verb
//     that tennis, combat-sports and single-name-team recap titles reach for constantly ("Alcaraz
//     downs Sinner in the final", "Kansas City downs Denver", "Swiatek downed Gauff") — a plain
//     winner reveal that carries no scoreline for SCORE_RX and matched no existing keyword, so it
//     leaked. Only the "s"/"ed" inflections are listed, NOT bare "down": "down" is one of the most
//     overloaded words in sports copy ("4th down", "down the stretch", "break down", "a down year",
//     "shut down the run") and would over-hide wholesale. "downs"/"downed" are far narrower, and the
//     one everyday collision — the idiom "ups and downs" — is excluded by the (?<!ups and ) lookbehind
//     (the same guarded-alternative technique the "deficit" clauses above use). "shut down"/"countdown"/
//     "sit-down" stay clean (bare "down", or no word boundary before "down"). Byte-identical to the worker's copy.
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
//     carrying no digits (SCORE_RX misses it). The inflected form uses "(?:s|ed|ing)" +
//     optional "[- ]?" — NOT the fully-optional "(?:…)?" the bow/crash siblings use — to
//     dodge the collision the bow/crash note above flags: bare one-word "knockout" and
//     hyphenated "knock-out" are the neutral schedule term ("knockout stage"/"knock-out
//     round"), so they must stay visible. The separate "knock out" alternative then adds
//     the bare plural-present verb ("Spain knock out Germany", "Morocco knock out the
//     holders") — the everyday British recap phrasing — WITHOUT reopening that collision,
//     because it requires a literal SPACE: "knockout" (no space) and "knock-out" (hyphen)
//     still don't match, only the space-separated verb does. No in-scope club or nation is
//     named "Knock", so the false-positive risk is otherwise negligible. Byte-identical to
//     the worker's copy.
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
//     "bundl(?:e|es|ed|ing)?[- ]?out" joins that same knockout-elimination family beside
//     "bow…out"/"crash…out"/"dump…out"/"knock…out": "bundled out" is another stock British WC/cup
//     phrasing for a side being eliminated ("Germany bundled out of the World Cup", "holders bundled
//     out on penalties", "Italy bundling out the favourites") — the same knockout-result reveal as
//     its siblings, yet it carries no digits (SCORE_RX misses it) and slipped past every one of them.
//     It's structured exactly like the bow/crash/dump siblings: the inflection sits on the verb, so
//     the optional "(?:e|es|ed|ing)?" covers bundle/bundles/bundled/bundling while the required
//     trailing "out" keeps the scrappy goal-mouth senses "bundled home"/"bundled in" (no "out") from
//     firing, so those scoring clips stay visible. No English word other than these forms begins with
//     "bundl" at a \b then followed by "out", and no in-scope club or nation is named "Bundle", so it
//     adds coverage at the same negligible false-positive risk as bow/crash/dump out — and, like them,
//     any benign collision errs to the over-hide-is-safe side (a masked title costs a tap to reveal; a
//     leaked one breaks the whole promise). Byte-identical to the worker's copy.
//     "(?:knock|dump|bundl|boot)\w* … out of … <competition>" adds the TRANSITIVE form of that same
//     knockout-elimination family. The bow/crash/dump/bundle/knock siblings above all sit right beside
//     "out" ("dumped out", "knock out Germany"), so they miss the everyday active phrasing that names
//     the eliminated side between the verb and "out": "Arsenal knock Chelsea out of the Cup", "Alcaraz
//     dumps Sinner out of the tournament", "Real Madrid boot City out of the Champions League". It is a
//     clean result reveal (it names the loser, and so the winner) yet carries no digits for SCORE_RX and
//     matched none of the adjacent-"out" siblings. Deliberately gated on a following "out of <named
//     competition/round>" (cup/tournament/play-offs/semis/quarters/World Cup/Champions League/Europe/
//     last 16…) so the everyday physical "knock X out of …" senses — "out of play", "out of the park",
//     "the wind out of their sails", "out of their stride" — never trip it (a false positive here drops
//     a legit highlight from the worker's search results, not merely masks a title). The bare-"running"/
//     "contention" idioms are deliberately left out: "out of the running for MVP" is preview talk, not a
//     result. Byte-identical to the worker's copy.
//     "(?:sends?|sent)(?:[- ][\w'’-]+){0,3}?[- ]packing\b" completes the knockout-elimination family
//     beside "bow…out"/"crash…out"/"dump…out"/"knock…out": "send X packing" is a stock cup-tie phrasing
//     for a side being beaten out of a tournament ("Germany sent packing", "Spain send Germany packing",
//     "holders sent packing", "Italy sent packing on penalties") — the same knockout-result reveal as its
//     siblings, yet it carries no digits (SCORE_RX misses it) and no existing keyword caught the phrasing.
//     The optional "(?:[- ][\w'’-]+){0,3}?" spans the object that the ACTIVE form puts BETWEEN the two
//     words ("send Germany packing", "sent the holders packing"), which the earlier adjacent-only
//     "sent[- ]?packing" missed — the active/present form is just as common in the per-match titles this
//     filter sees as the passive/headline "sent packing". "sending" is left out on purpose: the finite
//     "send"/"sends"/"sent" report a settled result, while the -ing form skews to preview/ongoing copy.
//     "packing" only ever completes this eliminate-a-rival idiom in a sports title — the literal
//     luggage sense never appears — so no English word and no in-scope club or nation collides, adding
//     coverage at the same negligible false-positive risk as the knockout siblings; any benign
//     collision errs to the over-hide-is-safe side (a masked title costs a tap to reveal; a leaked one
//     breaks the whole promise). Especially timely as the tournament reaches its win-or-go-home
//     knockout rounds. Byte-identical to the worker's copy.
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
//     "clobber\w*" is the same-family blowout verb NBA/NFL and soccer recap titles lean on for a
//     one-sided beating right beside "wallop"/"maul"/"spank" ("Warriors clobber Suns", "United
//     clobbered 5-0", "a 4-0 clobbering", "City clobbering Arsenal") — a decisive-defeat reveal that
//     slipped past the wallop/maul/spank/drub/smash/thrash/thump/pummel/steamroll set despite being
//     just as common, and it carries no digits when the score is omitted (SCORE_RX misses "United
//     clobbered again"). Like "wallop"/"maul" it is SAFER than the destroy/smash family it joins:
//     "clobber" only ever describes a team-vs-team beating in a sports title, never a single skill
//     moment, so it can't over-hide a highlight reel. No English word other than these inflections
//     begins with "clobber", and no in-scope club or nation is named anything beginning with it, so
//     the trailing \w* covers clobber/clobbers/clobbered/clobbering at the same negligible
//     false-positive risk as the verbs above. Byte-identical to the worker's copy.
//     "leaders?"/"winners?" pluralize the previously singular-only "leader"/"winner"
//     nouns — the plural is just as literal a result reveal ("crowned World Cup
//     winners", "the group leaders after 3 games") yet slipped through: "winner"
//     needed a word boundary right after it, so the trailing "s" in "winners"/
//     "leaders" failed the match, and no separate plural alternative existed (every
//     other pluralizable token here — victories/hat-tricks?/shut-outs?/own-goals? —
//     already carries the "s?"). The optional "s?" adds no false-positive class the
//     singular didn't already accept. Byte-identical to the worker's copy.
//     "dispatch\w*" is the dismiss-an-opponent result verb tennis and soccer recaps lean on for a
//     comprehensive win ("Alcaraz dispatches Zverev in straight sets", "City dispatch Brentford 3-0",
//     "Spain dispatched Georgia") — a winner-naming reveal that slipped past the beat/defeat/edge/
//     oust/eliminate dismissal set despite being just as common in the article-style news titles this
//     filter also covers, and it carries no digits when the score is omitted (SCORE_RX misses "United
//     dispatched again"). In a sports-title context "dispatch" only ever means to beat/see off an
//     opponent — its non-result senses (a news dispatch, a dispatch rider) never appear in a highlight
//     or match-recap title — and no in-scope club or nation begins with "dispatch", so the trailing
//     \w* covers dispatch/dispatches/dispatched/dispatching at the same negligible false-positive risk
//     as the verbs above. Byte-identical to the worker's copy.
//     "shellac\w*" is the same-family blowout verb American NBA/NFL recap titles lean on for a one-sided
//     beating right beside "clobber"/"wallop"/"maul" ("Broncos shellacked 45-10", "Chiefs shellac the
//     Raiders", "Lakers took a shellacking", "City shellacking United") — a decisive-defeat reveal that
//     slipped past the clobber/wallop/maul/spank/drub/smash/thrash/thump/pummel/steamroll set despite
//     being just as common in American recaps, and it carries no digits when the score is omitted
//     (SCORE_RX misses "Broncos shellacked again"). Like "clobber"/"wallop" it is SAFER than the
//     destroy/smash family it joins: "shellac" only ever describes a team-vs-team beating in a sports
//     title, never a single skill moment, so it can't over-hide a highlight reel. Its one non-result
//     sense — the varnish "shellac" — never appears in a per-match highlight or recap title, and no
//     in-scope club or nation is named anything beginning with "shellac", so the trailing \w* covers
//     shellac/shellacs/shellacked/shellacking at the same negligible false-positive risk as the verbs
//     above. Byte-identical to the worker's copy.
//     "overrun\w*|overran" is the overwhelmed-in-open-play blowout verb soccer recaps lean on for a side
//     that was swamped ("City overrun United in midfield", "Arsenal overran 4-1 at the Etihad", "Bayern
//     overrunning Dortmund") — a decisive-defeat reveal that slipped past the clobber/shellac/thrash/
//     smash set, and one that carries no digits when the score is omitted (SCORE_RX misses "Barca
//     overran again"). The past tense breaks the stem (over+ran, not over+run), so it needs the explicit
//     "overran" alternate the trailing \w* on "overrun" can't reach. In a per-match recap title "overrun"
//     only ever means a team was overwhelmed; its one non-result sense — an overrunning schedule/budget —
//     never appears in a sports-match title, and no in-scope club or nation is named anything beginning
//     with "overr", so the risk is negligible. Byte-identical to the worker's copy.
//     "nil(?:led|ling)" is the football verb "to nil" — beating a side without conceding, i.e. a
//     clean-sheet result ("City nilled United at the Etihad", "Saints nilled again", "United got
//     nilling"), which names the winning and losing side just as plainly as the blowout verbs above
//     yet carries no digits when the score is dropped, so SCORE_RX and the nil-nil / \d-nil forms
//     elsewhere both miss it. Only the inflected verb forms are added, never bare "nil": the noun
//     "nil" (zero) is everyday and the present-tense verb "nil" is vanishingly rare in a title, so
//     "nilled"/"nilling" catch the reveal at negligible false-positive risk — no everyday word and
//     no in-scope club or nation contains the substring "nilled"/"nilling". Byte-identical to the
//     worker's copy.
//     "overcome|overcomes|overcoming|overcame" is the endure-to-win result verb WC / cup-tie knockout
//     recap titles lean on constantly right beside "prevail\w*"/"surviv\w*" ("USA overcome Uruguay to
//     reach the quarters", "Argentina overcame the hosts", "Spain overcoming a scare") — a winner reveal
//     that slipped past the prevail/survive/beat/defeat/dispatch set despite naming the side that got
//     through just as plainly, and it carries no digits (SCORE_RX misses it). Especially timely as the
//     tournament reaches its win-or-go-home rounds. Spelled out (not "overcom\w*") on purpose: the stem
//     form would swallow "overcompensate"/"overcomplicate", which these four whole-word forms can't
//     (overcome/overcomes/overcoming plus the irregular past "overcame"). No in-scope club or nation is
//     named anything beginning with "overcome", and in a per-match recap title it means nothing but the
//     named side prevailing (the "overcome with emotion" sense never appears there), so it adds coverage
//     at the same negligible false-positive risk as the verbs above — and any benign collision errs to
//     the over-hide-is-safe side (a masked title costs a tap to reveal; a leaked one breaks the whole
//     promise). Byte-identical to the worker's copy.
//     "buzzer[- ]?beaters?" is the basketball/hockey sibling of the already-covered "walk[- ]?off":
//     both name a dramatic game-ending score, so a title carrying it reveals the outcome ("Curry
//     buzzer beater sinks the Lakers", "buzzer-beater to win it", "wild buzzerbeater finish") — the
//     same walk-off-style result leak, yet it carries no digits (SCORE_RX misses it) and no existing
//     keyword caught it (it contains no win-word for winners?/wins/won to catch, exactly like
//     "walk-off"). It's a staple of NBA highlight titles, so it fills a real gap. Near-zero
//     false-positive risk: the required trailing "beater" keeps the neutral "final buzzer" (every game
//     ends with one) from matching, and "buzzer beater" has no meaning outside a game-deciding shot.
//     The "[- ]?" covers "buzzer beater"/"buzzer-beater"/"buzzerbeater" and the "s?" the plural, and
//     any residual collision errs to the over-hide-is-safe side (a masked title costs a tap to reveal;
//     a leaked one breaks the whole promise). Byte-identical to the worker's copy.
//     "book(?:s|ed)? ((?:their|its|a|his|her) (?:place|spot|berth|ticket|passage)|(?:place|spot|berth|passage))"
//     is the canonical knockout qualification idiom WC / cup-tie coverage reaches for the instant a side
//     goes through ("England book their place in the final", "USA book a spot in the semis", "Brazil
//     booked their passage") — a pure advancement reveal that names the side that won the tie yet carries
//     no digits (SCORE_RX misses it) and slips past "advanc\w*"/"clinch\w*" because headlines phrase it
//     this way far more often than they say "advance". Headlines also routinely drop the article ("Canada
//     book spot in the final", "Argentina book place at the World Cup"), so the article is optional for
//     place/spot/berth/passage — but NOT for the "ticket" noun, which without an article overlaps the
//     ordinary ticket-sales sense ("book tickets for the final"); "punch their ticket" below stays the
//     article-required advancement form for that word. The trailing place/spot/berth/ticket/passage
//     requirement is what makes it safe: it keeps the football sense of a bare "booked" (a yellow card —
//     "Smith was booked") from matching, and no benign "book a place at the table" sense appears in a
//     match title. Highly timely as the tournament reaches its win-or-go-home rounds, and any residual
//     collision (a "can they book their place tonight?" preview) errs to the over-hide-is-safe side.
//     The determiner set is (their|its|a|his|her): the "his|her" covers the individual-athlete framing
//     the team-only (their|its) set missed — the tennis / boxing / athletics / golf / swimming recaps this
//     app also covers phrase advancement about a person, not a squad ("Djokovic books his place in the
//     final", "Gauff books her spot in the semis", "Fury punches his ticket to a title shot"), each a pure
//     advancement reveal that leaked. It stays as safe as the team form: "his|her place/spot/berth/ticket/
//     passage" after "book(s)"/"punch(es)" names a person going through, and the benign senses ("took his
//     place on the bench" has no "book", "book your tickets" uses "your" — neither in the set) still pass.
//     Byte-identical to the worker's copy.
//     The round-qualified sibling — "book(?:s|ed)? (?:their/its/a/his/her )?(?:final|semi-final|quarter-
//     final|last-16/8/4|play-off) (?:place|spot|berth|passage)" — is the same advancement reveal with the
//     ROUND named between the verb and the noun instead of the round trailing in a "in the …" phrase:
//     "Djokovic books quarter-final spot", "England book final spot", "Spain book last-16 place", "Italy
//     book play-off spot". The base book clause above only accepts the place-noun DIRECTLY after the verb
//     (optionally an article/possessive), so a round adjective wedged in front of it ("books quarter-final
//     spot") slipped through untouched — a pure "who went through" leak in exactly the win-or-go-home
//     titles this app most needs to hide. It stays as tight as the base clause: a specific round name must
//     sit IMMEDIATELY before place/spot/berth/passage, so the ordinary "book tickets for the final" (no
//     round-then-place structure) and "team books final roster spot" ("roster" breaks the adjacency) both
//     still pass. "ticket" is deliberately left out of this branch — "book … final ticket" has no natural
//     advancement headline and would risk the ticket-sales sense. Any residual over-hide errs to the
//     over-hide-is-safe side. Byte-identical to the worker's copy.
//     "reach(?:es|ed|ing)? (?:the )?(?:finals?|semi…|quarter…|last 16/8/4)" is the OTHER canonical
//     knockout-advancement idiom this WC-heavy app sees all through the win-or-go-home rounds, right
//     beside the just-added "book their place" and the existing "advanc\w*" ("Spain reach the final",
//     "Brazil reached the semis", "France reach the quarters", "USA reaching the semifinals", "Croatia
//     reach the last 8") — a pure advancement reveal that names the side that won the tie yet carries
//     no digits (SCORE_RX misses it) and slips past both "advanc\w*" (headlines say "reach" far more
//     often) and "book their place" (a different surface form). The required trailing round noun is what
//     makes it safe: it keeps the everyday "within reach"/"reach for the top corner"/"reach save"/bare
//     "reach the ball" from firing, and the "(?!\s+third)" guard excludes the soccer tactical phrase
//     "reach the final third" (the only benign collision, and even that errs over-hide-safe). Timely as
//     the tournament hits its semifinals/final. Byte-identical to the worker's copy.
//     "through to (?:the )?(?:finals?|semi…|quarter…|last 16/8/4)" is the THIRD canonical
//     knockout-advancement idiom, right beside "reach …"/"book their place"/"advanc\w*" — the British
//     match-report phrasing broadcasters lean on the instant a side goes through ("England through to
//     the final", "Spain through to the quarterfinals", "USA through to the last 16", "Brazil through to
//     the semis"). It names the side that won the tie yet carries no digits (SCORE_RX misses it) and
//     slips past all three siblings: it uses neither "reach" nor "book" nor "advance". The round-noun
//     list mirrors the "reach" alternative above verbatim, so the required trailing round keeps a bare
//     "battled through to the whistle" / "broke through the line" from firing (no round noun follows),
//     and the same "(?!\s+third)" guard excludes the tactical "through to the final third". Byte-identical
//     to the worker's copy.
//     "progress(?:es|ed|ing)? (?:to |into |through to )?(?:the )?(?:finals?|semi…|quarter…|last 16/8/4)"
//     is the FOURTH canonical knockout-advancement idiom, right beside "reach …"/"through to …"/"book
//     their place"/"advanc\w*" — the British match-report verb broadcasters use interchangeably with
//     "reach"/"through" the moment a side goes through ("Spain progress to the quarters", "Germany
//     progressed to the semis", "France progress into the last 16", "Portugal progress through to the
//     final"). It names the side that won the tie yet carries no digits (SCORE_RX misses it) and slips
//     past all three siblings: it uses neither "reach" nor "through to" nor "book" as its head verb. The
//     round-noun list mirrors the alternatives above verbatim, so the REQUIRED trailing round noun keeps
//     the everyday "match in progress"/"work in progress"/"progress report"/"progress bar" from firing (no
//     round noun follows), and the same "(?!\s+third)" guard excludes the tactical "progress into the
//     final third". Byte-identical to the worker's copy.
//     "into (?:the )?(?:finals?|semi…|quarter…|last 16/8/4)" is the FIFTH knockout-advancement idiom — and
//     the one the four above all miss: the bare, VERBLESS "X into the Y" headline that all-caps
//     fan-channel and broadcaster titles lean on the instant a side goes through ("Spain into the final",
//     "ARGENTINA INTO THE SEMIS", "England into the quarters", "USA into the last 16"). Its four siblings
//     each require a head verb (reach / through to / progress / book their place), so a title that just
//     says "…into the final" with no verb slipped past every one of them, yet it names the side that won
//     the tie just as plainly and carries no digits (SCORE_RX misses it). The round-noun list mirrors the
//     alternatives above verbatim, so the REQUIRED trailing round noun keeps the everyday verbless "into
//     the box"/"into the season"/"into the wild" from firing (no round noun follows), and the same
//     "(?!\s+third)" guard excludes the tactical "into the final third" — the one benign collision, and
//     even that errs over-hide-safe (a masked title costs a tap to reveal; a leaked one breaks the whole
//     promise). Timely as the tournament hits its win-or-go-home rounds. Byte-identical to the worker's copy.
//     The "last[- ]?(?:32|16|8|4|sixteen|eight|four)(?!\s+<unit>)" round token shared by all five
//     advancement idioms above (reach / through to / into / progress / knock-out-of) matches BOTH the
//     digit form ("into the last 16") AND the spelled-out British-headline form the digit-only class
//     missed ("Chelsea reach the last four", "Rangers into the last eight", "through to the last
//     sixteen") — each names the advancing side yet carries no digit for SCORE_RX. It also adds the
//     round of 32 the expanded World Cup introduces ("into the last 32"). The trailing negative
//     lookahead keeps the everyday non-knockout "last four" senses out — "into the last four minutes",
//     "down to the last four games", "the last sixteen games" — so only the knockout-round reading
//     fires; over-hide stays the safe default for anything it still catches. Byte-identical to the worker's copy.
//     "crowned (?:world )?champions?" and "(?:lift|hoist)(?:s|ed|ing)? (?:the )?(?:[\w'’-]+ ){0,2}?(?:world[- ]?cup|trophy|cup\b|silverware)"
//     are the two canonical FINAL-result coronation reveals — the win-the-whole-thing headline the tie/
//     advancement idioms above don't cover ("Argentina crowned world champions", "France crowned
//     champions", "Messi lifts the trophy", "Spain hoist the World Cup", "Chelsea lift the FA Cup",
//     "Real Madrid hoist the Champions League trophy"). Each names the champion yet
//     carries no digits (SCORE_RX misses it) and slips past "win\w*"/"triumph\w*"/"clinch\w*" because a
//     pure coronation headline states none of those verbs. They're deliberately object-anchored so they
//     stay off the "champion(s)" the rest of this filter intentionally leaves alone (see the head note):
//     "crowned" must precede "champions" (never fires on "Champions League"/"Premier League champions"),
//     and the trophy-raise needs a "World Cup"/"trophy"/"cup"/"silverware" object, allowing up to two
//     intervening competition-name words so the object survives a named cup ("lift the Carabao Cup",
//     "hoist the Champions League trophy") — each a coronation reveal the bare-object form missed. The
//     "cup\b" boundary and tight object anchor keep the ubiquitous spoiler-free "World Cup 2026
//     highlights"/"trophy tour"/"weightlifting"/"cupcakes" and "lift spirits"/"lift the lid" and every
//     fixture/preview cup headline ("FA Cup third round draw", "Carabao Cup semi-final: how to watch")
//     stay unblurred). Any residual over-hide (a "who will be crowned champions?"/"who will lift the cup?" preview)
//     errs to the over-hide-is-safe side. Especially timely as the tournament reaches the final. Byte-
//     identical to the worker's copy.
//     The coronation-verb "…title/crown" alternative catches the individual-sport title reveal the
//     tight "(?:re)?claim… (?:the )?(?:title|crown…)" adjacency above missed: a winning verb (claim /
//     take / secure / capture / land / bag / pocket / scoop / lift / hoist) with a tournament or
//     qualifier name sitting between it and the "title"/"crown" object ("Alcaraz claims the Wimbledon
//     title", "Djokovic claims Wimbledon title", "Swiatek claims the French Open title", "secures the
//     Premier League title", "claims the world title", "lifts the Wimbledon crown"). Each names the
//     champion, yet the intervening name broke the immediate-adjacency match and no digits reach
//     SCORE_RX. A 0-3 filler span spans the competition name; the trailing negative lookahead reuses
//     the same non-result "title …" exclusion the "storm to the title" idiom carries ("title race",
//     "title picture", "title hopes", "title fight/clash/shot", "title contenders", "title defence",
//     "title run-in", plus "crown jewel") and adds "of" so the metaphorical naming sense — "lay claim
//     to the title of best ever" — stays visible where a real trophy reveal never reads "title of X".
//     So the ubiquitous spoiler-free preview senses stay unblurred. Purely additive — it only ever
//     hides more, never un-hides an existing catch. Byte-identical to the worker's copy.
//     "world[- ]?champions?" catches the BARE copula coronation reveal its sibling "crowned (?:world )?
//     champions?" above misses — the verbless "X (are) world champions" headline that all-caps fan-channel
//     and celebration recap titles lean on the instant a final ends ("ARGENTINA ARE WORLD CHAMPIONS", "Spain
//     World Champions 2026", "France become world champions"). The crowned/lift/hoist coronation idioms each
//     require a head word ("crowned"/"lift"/"hoist"), so a title that just states "world champions" with no
//     verb slipped past every one of them, yet it names the winner of the whole tournament just as plainly
//     and carries no digits (SCORE_RX misses it). It stays OFF the bare "champion(s)" this filter
//     deliberately leaves alone (see the head note) precisely because it is anchored to the mandatory
//     leading "world": "Champions League"/"Premier League champions"/"reigning champions"/"champions of
//     England" contain no "world" before "champions", so none of them can ever fire (verified) — only the
//     world-title sense does. The "[- ]?" covers "world champions"/"world-champions"/"worldchampions" and the
//     "s?" the singular "world champion" (a boxing/individual world title is itself a result reveal). The
//     optional "(?:cup[- ]?)?" widens it to the even MORE common final-day phrasing that names the trophy
//     outright — "World Cup champions" — which the bare "world[- ]?champions?" form missed because "Cup"
//     sits between "world" and "champions" ("ARGENTINA ARE WORLD CUP CHAMPIONS", "Spain World Cup Champions
//     2026", "France become World Cup champions", "Argentina crowned World Cup Champions"). Even the
//     "crowned …champions?" sibling leaked these, since its "(?:world )?" allows only "world" (not "world
//     cup") before "champions". The added "cup" carries no new false-positive surface: it stays anchored to
//     the mandatory leading "world", so "Champions League"/"Premier League champions"/"World Championship"
//     still can never fire (verified — none has "world" before "champions", and "World Championship" fails
//     the "champions?"+\b boundary on "-ship"). Its one benign collision — a spoiler-free "who will be
//     World Cup champions?" final preview — errs to the same over-hide-is-safe side as above (a masked
//     title costs a tap to reveal; a leaked one breaks the whole promise), and is especially worth catching
//     as the World Cup reaches its final. Byte-identical to the worker's copy.
//     "(?:re)?claim(?:s|ed|ing)? (?:the )?(?:title|crown|trophy|championship|pennant|silverware)" catches the
//     coronation reveal the crowned/lift/hoist cluster above misses — "claim" is one of the commonest recap
//     verbs for winning a title, yet it was absent from the outcome list ("Spain claim the title", "City
//     claim the crown", "Verstappen claims the championship", "Nadal claimed the trophy", "the Reds claim
//     silverware"). Each names the champion, carries no digits (SCORE_RX misses it), and states none of the
//     "win\w*"/"clinch\w*"/"seals?" verbs. Deliberately object-anchored, exactly like the crowned/lift/hoist
//     entries: a bare "claim" is far too common in non-result headlines ("claims a foul", "claims
//     responsibility", "injury claims a season", "an insurance claim"), so it fires ONLY before an
//     unambiguous silverware object. The optional "(?:re)?" prefix adds the equally common regain-the-crown
//     recap verb ("City reclaim the title", "Joshua reclaims the crown", "Alonso reclaimed the championship")
//     — the same achieved-champion reveal, and one the base "claim" alternative could never reach because the
//     group's leading \b won't let it start inside "reclaim" (the "e"→"c" seam is no boundary), so "reclaims
//     the crown" slipped through untouched. The contention preview "lay claim to the title" reads "claim to the
//     title" — a "to" splits "claim" from the object — so it never fires; only the achieved result does. Any
//     residual over-hide (a "can they (re)claim the title?" preview) errs to the over-hide-is-safe side (a masked
//     title costs a tap to reveal; a leaked one breaks the whole promise). Byte-identical to the worker's copy.
//     "wrap(?:s|ped|ping)?[- ]?up (?:the |a |an |their )?(?:[\w'’-]+ ){0,2}?(?:title|crown|trophy|
//     championship|pennant|silverware|scudetto|series|sweep|win|victory)" is the missing sibling of the
//     "claim/clinch/seals? the title" cluster above — "wrap up the title" is one of the commonest
//     season-clinch idioms yet no form of it fired and the biggest reveal of all (a league title, an F1
//     championship, a playoff series) leaked ("Liverpool wrap up the title", "Verstappen wraps up the
//     championship", "Napoli wrapping up the Scudetto", "Celtics wrapped up the series", "Yankees wrap up
//     the pennant"). Each names the winner, carries no digits (SCORE_RX misses it), and states none of the
//     claim/clinch/seal verbs. Deliberately object-anchored exactly like its "claim …silverware" sibling:
//     a bare "wrap up" is far too common as the news-summary noun ("Match wrap-up", "Weekly wrap-up",
//     "Transfer news wrap-up", "Gameweek 5 wrap-up"), so it fires ONLY before an unambiguous clinch object
//     — every one of those summary forms ends at "wrap-up" (or is followed by "show"/"of the week"), never
//     by a title/series object, so all pass through untouched. The "(?:[\w'’-]+ ){0,2}?" lets one or two
//     modifier words sit between the article and the object so the league-qualified forms recap titles
//     actually use match too ("wrap up the Premier League title", "wrap up the Serie A title", "wrap up
//     their fourth straight title"); the lazy 2-word cap keeps a far-apart benign "title" (e.g. "wrap up
//     the latest transfer news and title talk") out of reach. "[- ]?up" covers "wrap up"/"wrap-up"/"wrapup"
//     and "wrap(?:s|ped|ping)?" the inflections. Any residual over-hide (a "can they wrap up the title?"
//     preview, or "wrap up the title race" discussion) errs to the same over-hide-is-safe side as its
//     "claim" sibling (a masked title costs a tap to reveal; a leaked one breaks the whole promise).
//     Byte-identical to the worker's copy.
//     "share(?:s|d)? the spoils"/"honou?rs even" catch the two canonical DRAW-result idioms English
//     soccer/World Cup recap titles reach for when a match ends level — "Spain and Georgia share the
//     spoils", "the two sides shared the spoils", "honours even in a tense affair" — the same level/
//     draw reveal as the "goalless"/"scoreless"/"stalemate\w*"/"deadlock\w*" family, yet a bare idiom
//     (no digits, no "goalless") slipped past both the digit-based SCORE_RX and every existing keyword.
//     Near-zero false-positive risk: both are fixed multi-word idioms that only ever describe a drawn
//     result — "share(?:s|d)?(?: of)? the spoils" is anchored to the literal "the spoils" object (so a
//     lone "share"/"shares"/"shared" never fires); the optional " of" also catches the equally common
//     "a share of the spoils"/"take a share of the spoils" phrasing, which the "share the spoils"-only
//     form missed. And "honou?rs even" needs the trailing "even" (the
//     "honou?r" covers the British "honours" and American "honors" spellings), so neither collides with
//     an in-scope club/nation name or an ordinary title word. Any residual over-hide errs to the
//     over-hide-is-safe side. Byte-identical to the worker's copy.
//     "(?:tak(?:e|es|ing)|took|claim(?:s|ed|ing)?|grab(?:s|bed|bing)?|collect(?:s|ed|ing)?|
//     pocket(?:s|ed|ing)?|scoop(?:s|ed|ing)?)[- ]the[- ]points\b" catches the WIN-side sibling of the
//     "share the spoils"/"share the points" DRAW idioms above: in soccer three points means a win, so a
//     named side that "takes/claims/grabs/collects/pockets/scoops the points" is the outright winner
//     ("City take the points at the Etihad", "Arsenal claim the points at home", "Newcastle took the
//     points off Villa"). Each names the winner, carries no digits (SCORE_RX misses it) and slipped past
//     every existing keyword: the "maximum points"/"all three points" branches need those qualifier words,
//     "share the points" is the DRAW verb, and "come away with the points" needs the "come away with"
//     frame — none fired on the bare "take/claim/grab the points" form. Anchored to the literal "the
//     points" object (a lone "take"/"claim"/"grab" never fires) and to WIN verbs only (not "share"/
//     "split"), so it stays clear of "the points table"/"points on offer"/"points difference" (no verb
//     immediately before "the points") and of the DRAW idioms. The one residual over-hide — a "who takes
//     the points?" preview — errs to the over-hide-is-safe side (a masked title costs a tap to reveal; a
//     leaked one breaks the whole promise). Byte-identical to the worker's copy.
//     "held to an? (?:[\w-]+ )?draw" catches the "held to a draw" idiom — the most common way an
//     English soccer/World Cup recap title frames a favourite dropping points ("Argentina held to a
//     draw", "Brazil held to a late draw", "held to a hard-fought draw", "held to an entertaining
//     draw"). It's the same level/draw reveal as the "goalless"/"scoreless"/"stalemate\w*" family, but
//     the BARE form ("held to a draw", no adjective) carries no digits (SCORE_RX misses it) and slipped
//     past every existing keyword: "held" alone only ever appears as "held[- ]?off"/"holds?[- ]?off"
//     (a protect-the-lead WIN, the opposite result), and "draw" is not a keyword on its own. The "an?"
//     covers the a/an article before a vowel-initial adjective, and the optional single "[\w-]+" word
//     lets one adjective sit between the article and "draw" while the pattern stays anchored to "draw"
//     as the object — so "held off Barcelona", "the draw for the quarter-finals", "how to draw a pitch",
//     and "held to account" all stay out (none is "held to a … draw"). Any residual over-hide errs to
//     the over-hide-is-safe side. Byte-identical to the worker's copy.
//     "(?:ends?|ended|ending) in an? (?:[\w-]+ )?draw" catches the OTHER everyday framing for the same
//     drawn result — the "ends in a draw" recap idiom ("Arsenal vs City ends in a draw", "the derby
//     ended in a goalless draw", "ending in a 1-1 draw") — which sat right beside "held to a draw" and
//     "play out a draw" in the family yet slipped past both: "held to" needs the losing-favourite verb,
//     and "play out" needs that exact verb, so a title that just states the outcome ("ends in a draw")
//     matched neither, and its cousin "finished in a draw" only ever hit incidentally via the combat
//     "finish(?:es|ed)" keyword. Mirrors the "held to a draw" shape exactly — the a/an article plus one
//     optional adjective, anchored to "draw" as the object — so "how the season ends", "the draw for the
//     next round", and "draw your own conclusions" all stay out (none is "ends in a … draw"). Any
//     residual over-hide errs to the over-hide-is-safe side. Byte-identical to the worker's copy.
//     "(?:ends?|ended|ending|finish(?:es|ed|ing)?)[- ](?:all[- ]|dead[- ]|honou?rs[- ])?level" catches the
//     "finish level" framing for the very same drawn result — "the derby ends level", "Arsenal and Chelsea
//     end level", "Real and Barca finish level", "the tie ended all/dead level" — the plainest way a recap
//     states parity without a scoreline. It sat beside the draw idioms yet slipped past them: "held to"/"play
//     out"/"ends in a draw" all need the word "draw", and the combat "finish(?:es|ed)" keyword only ever hit
//     the "finishes/finished level" forms incidentally, leaving "ends level" and the present-tense "finish
//     level" uncovered. Anchored so "end"/"finish" sits directly before "level" (an optional all/dead/honours
//     modifier aside), so "how the season ends", "level playing field", "level up", "next-level", and "all
//     level at half-time" (no end/finish anchor) all stay out. Any residual over-hide errs to the
//     over-hide-is-safe side. Byte-identical to the worker's copy.
//     "settl(?:e|es|ed|ing) for (?:a|an|the) (?:draw|point|stalemate)" catches the "settle for a
//     draw"/"settle for a point" idiom — the everyday way an English soccer/World Cup recap frames a
//     favourite dropping points ("Spurs settle for a draw", "United settled for a point", "Arsenal
//     settling for a draw at home", "both sides settle for the draw"). It's the same level/draw reveal
//     as "held to a ... draw"/"share the spoils"/"honours even"/"all square" beside it, but carries no
//     digits (SCORE_RX misses "settle for a draw") and slipped past every existing keyword: bare
//     "settle" is far too common to be a keyword on its own, and "draw"/"point" are not keywords alone.
//     Anchoring to "settl(e|es|ed|ing) for <article> (draw|point|stalemate)" keeps the benign senses out
//     — "settle down", "settle in for a big season", "settle for less", "settle the debate", the place
//     name Settle, and "unsettled defense" all lack the "for a draw/point/stalemate" object and never
//     fire — while covering settle/settles/settled/settling. Any residual over-hide errs to the
//     over-hide-is-safe side. Byte-identical to the worker's copy.
//     "(?:mak(?:e|es|ing)|made) do with <article> (draw|point|stalemate)" is the direct synonym of the
//     settle-for-a-draw clause above — the everyday recap framing for a favourite grudgingly accepting a
//     dropped-points result ("Chelsea have to make do with a point", "United made do with a draw",
//     "Spurs making do with a stalemate"). Same level/draw reveal, no digits (SCORE_RX misses it), and it
//     slipped past every keyword: "make"/"do" are far too common alone. Anchoring to the exact
//     "make do with <article> (draw|point|stalemate)" object keeps the benign "make do with a smaller
//     squad"/"make do without …"/"make do with what we have" senses out. Byte-identical to the worker's copy.
//     "(?:(?:ends? … in|play … to|settle … for) <article> (?:[\w-]+ )?tie" is the NORTH-AMERICAN twin of the
//     whole draw family above — MLS, NWSL, NHL and the rare NFL recap say "tie" where every clause beside it
//     says "draw" ("Sounders and Timbers play to a tie", "Revolution settle for a tie", "the match ends in a
//     scoreless tie", "Giants and Commanders finish in a tie"). It's the same drawn-result reveal, carries no
//     digits (SCORE_RX misses it), and slipped past the entire family because "draw"/"point"/"stalemate" were
//     the only drawn-result nouns and bare "tie" is far too overloaded to be a keyword alone — in soccer "tie"
//     mostly means a FIXTURE ("cup tie", "first-leg tie"). It is anchored to the same ends-in/play-to/settle-for
//     verb frames the "draw" clauses use, with the one optional adjective ("scoreless"/"hard-fought"), so the
//     fixture sense never fires (a "cup tie" has no ends-in/play-to/settle-for frame in front of it). The
//     tie(?![-\w]) tail keeps it clear of "tie-break"/"tiebreak" (a tennis tiebreak is not a draw), "tied",
//     "tier" and the plural fixture "ties". Any residual over-hide errs to the over-hide-is-safe side.
//     Byte-identical to the worker's copy.
//     "(?:hard[- ]?fought|hard[- ]?earned|battling|gritty|spirited|creditable|dour|drab|gutsy|point[- ]?saving)[- ]draws?"
//     is the bare NOUN-PHRASE twin of the "held to a … draw"/"ends in a … draw"/"settle for a draw" verb idioms
//     beside it: a recap headline that just labels the result — "Battling draw at Anfield", "A hard-fought draw
//     for United", "Gritty draw in the derby" — reveals the match ended level, yet the standalone adjective+"draw"
//     noun phrase (no "held to a …" verb frame, no digits for SCORE_RX) slipped past every existing draw clause
//     because "draw" is not a keyword on its own. It is pinned to a fixed list of manner-of-play adjectives that
//     only ever describe a drawn RESULT ("battling"/"gritty"/"spirited"/"dour"/"drab"/"gutsy"/"creditable"/
//     "point-saving" draw, plus the hyphen-or-space "hard-fought"/"hard-earned" compounds), deliberately EXCLUDING
//     the adjectives a knockout/bracket draw takes ("a tough draw", "a kind draw", "a favourable draw", "an open
//     draw", "the group-stage draw") — none of those words appears here, so the fixture-draw sense never fires and
//     bare "hard"/"tough" can't match. Any residual over-hide errs to the over-hide-is-safe side. Byte-identical to
//     the worker's copy.
//     "settl(?:e|es|ed|ing)[- ]?(?:it|the tie/match/game/contest/series/final/derby/affair)" is the
//     OPPOSITE of the settle-for-a-draw clause above — the decisive-WINNER idiom a recap reaches for
//     when one late score decides the contest: "Kane settles it late for Spurs", "Salah settles the
//     tie at Anfield", "a stunning strike settles the match", "penalty settles the final". In a
//     per-match title it always reveals the game was won (and usually by whom), yet it carries no
//     digits (SCORE_RX misses it) and matched no existing keyword — bare "settle" is far too common to
//     be a keyword, and the settle-for clause needs a draw/point/stalemate object it never shares.
//     Anchoring to the "it" (word-bounded, so "settle items" can't fire) / "the <result-noun>" object
//     keeps the benign senses out — "settle an old score" (a revenge preview), "settle the nerves",
//     "settle in", "settle down", "settle the debate", "settle a contract dispute" all lack that object
//     and never fire. Any residual over-hide errs to the over-hide-is-safe side. Byte-identical to the
//     worker's copy.
//     "all[- ]?square" joins the level/draw-reveal family alongside "goalless"/"scoreless"/
//     "stalemate\w*"/"deadlock\w*"/"held to a ... draw"/"share the spoils"/"honours even": "all square"
//     is the stock British soccer/golf idiom for a level score, so a title carrying it reveals the match
//     is (or ended) level ("Spain and Georgia all square at the break", "the sides finish all square",
//     "all square after 90") — the same partial-result leak as a stalemate, yet a bare idiom carries no
//     digits (SCORE_RX misses it) and slipped past every existing keyword. Near-zero false-positive
//     risk: "all square" only ever means a level result in a sports title (the golf match-play "all
//     square" is itself a tied-result reveal, still the over-hide-is-safe side), and the leading \b
//     keeps it clear of any word ending in "all" ("small square", "install square" — the "all" there
//     sits mid-word with no boundary before it, so neither fires). The "[- ]?" covers "all square"/
//     "all-square". Any residual over-hide errs to the over-hide-is-safe side. Byte-identical to the
//     worker's copy.
//     "(?:runs?|running|ran) riot" is the blowout idiom soccer/World Cup recap titles lean on for a
//     side scoring freely in a one-sided win ("Man City run riot at Old Trafford", "Spain run riot in
//     a 6-0 rout", "Mbappé runs riot", "United ran riot") — a decisive-result reveal that names the
//     dominant side yet carries no digits when the score is omitted (SCORE_RX misses "City run riot
//     again") and slipped past the whole blowout family (thrash/thump/hammer/wallop/…): none of those
//     verbs is "run", and bare "run" is far too common to be a keyword on its own. That is exactly why
//     the pattern is anchored to the "riot" object — only the two-word "run riot" phrase matches, so
//     the ubiquitous bare "run"/"running"/"ran" ("a great run", "running the channel", "ran at the
//     defence") never fires. Near-zero false-positive risk: "riot" only ever completes this
//     dominate-the-game idiom in a sports title — the literal crowd-trouble "fans run riot" is a news
//     headline, and this filter runs ONLY on YouTube highlight/recap titles, never news — and no
//     in-scope club or nation is named "Riot". The inflection sits on "run", so "(?:runs?|running|ran)"
//     covers run/runs/running plus the irregular past "ran" while the required trailing "riot" holds the
//     anchor. Any residual over-hide errs to the over-hide-is-safe side (a masked title costs a tap to
//     reveal; a leaked one breaks the whole promise). Byte-identical to the worker's copy.
//     "rampant" rides the exact same anchor, so the object is now "(?:riot|rampant)":
//     "(?:runs?|running|ran) rampant" is the sibling blowout idiom the "run riot" entry missed
//     ("Liverpool run rampant", "City ran rampant in a 5-0 win", "Mbappé runs rampant") — the same
//     one-sided-win reveal, carrying no digits when the score is omitted. Like "riot", "rampant" only
//     ever completes this dominate-the-game phrase in a highlight title, and no in-scope club or nation
//     is named "Rampant", so it inherits the same near-zero false-positive risk. Byte-identical to the
//     worker's copy.
//     "(?:runs?|running|ran)[- ]?away[- ]?with" is the third "run"-headed blowout idiom beside
//     riot/rampant — the decisive-lead reveal a title carries when it says a side ran away with the
//     result ("City run away with the title", "Verstappen runs away with the race", "United ran away
//     with the game", "Barca running away with La Liga") — no digits when the score is omitted, so
//     SCORE_RX misses it and it slipped past every existing keyword. In a per-match highlight title
//     "run away with (it / the game / the title)" only ever means winning comfortably; its one benign
//     collision is the metaphorical "let your imagination run away with you", which never appears in the
//     highlight titles this un-masks — and even if it did, an over-match here merely keeps a title
//     covered (the app's safe default). Byte-identical to the worker's copy.
//     "(?:runs?|running|ran) rings (?:a)?round" is the fourth "run"-headed blowout idiom beside
//     riot/rampant/away-with — the comprehensively-outplayed reveal a title carries when one side is
//     said to run rings round the other ("City run rings around United", "Barca ran rings round Real",
//     "Mbappé running rings around the defence") — a total-dominance result reveal that carries no
//     digits when the score is omitted, so SCORE_RX misses it and it slipped past every existing
//     keyword. The idiom means only one thing in any context — comprehensively outclassing an
//     opponent — so it carries no benign non-result sense, and the required "rings (a)round" object
//     (the "(?:a)?round" covers both the British "round" and American "around") keeps the bare
//     "run"/"ran"/"runs"/"running" from firing on any everyday phrase ("run rings" alone never
//     appears without the trailing round/around). Byte-identical to the worker's copy.
//     "sees?[- ]?red"/"saw[- ]?red" catch the red-card reveal in its other stock verb phrasing,
//     right beside the existing "red card" noun and the "send(?:s|ing)?[- ]?off"/"sent[- ]?off"
//     verb form: "see red"/"sees red"/"saw red" is how soccer/World Cup highlight titles narrate a
//     dismissal at least as often ("Ramos SEES RED vs Barcelona", "Vinícius saw red late on",
//     "keeper sees red") — the same match-event partial-result leak as "red card"/"sent off", yet it
//     carries no digits (SCORE_RX misses it) and slipped past every existing keyword. Structured
//     exactly like the sibling "sees?[- ]?off"/"saw[- ]?off" (a different idiom — beat back a
//     challenger — that shares only the "sees?"/"saw" head): "sees?" covers see/sees, the separate
//     "saw[- ]?red" branch covers the past tense, and the required trailing "red" keeps bare
//     "see"/"saw"/"sees" from firing ("must-see", "saw the ball", "sees the pass"). The leading \b
//     keeps it clear of "oversees red…" (the "sees" there sits mid-word with no boundary before it),
//     and the closing \b keeps it anchored to whole-word "red". Its one benign collision — the
//     metaphorical anger idiom "see red" — never appears in the per-match highlight titles this
//     filter actually sees (a dismissal is the only thing "sees red" means in a football recap), and
//     even that errs to the over-hide-is-safe side (a masked title costs a tap to reveal; a leaked one
//     breaks the whole promise). Byte-identical to the worker's copy.
//     "pip(?:s|ped|ping)?" sits right beside "edge\w*" in the narrow-win family: "pip"/"pipped" is the
//     stock British soccer/racing idiom for edging a rival by a hair — for a match ("Canada pip USA"),
//     a group/table finish ("Spain pip Germany to top spot", "France pipping England to first") or a
//     title race ("Liverpool pipped to the title", "Australia pipped at the post"). It names the side
//     that came out ahead yet carries no digits (SCORE_RX misses it) and slipped past every existing
//     keyword — "edge\w*" is the only synonym present and headlines reach for "pip" just as readily.
//     Enumerated (NOT "pip\w*") on purpose: "pip\w*" would swallow "pipe"/"pipeline", so the tight
//     "pip(?:s|ped|ping)?" covers pip/pips/pipped/pipping while the trailing \b keeps whole words like
//     "pipe", "Pippa", and "pippin" out. No plausible benign sense survives in the per-clip YouTube
//     highlight titles this filter runs on (the fruit-seed "pips" never appears there), and any residual
//     over-hide errs to the over-hide-is-safe side. Byte-identical to the worker's copy.
//     "come[- ]from[- ]behind" and the "…[- ]down" clause below both carry the full come/comes/came
//     conjugation: the literal "behind" branch had only bare "come" (so "Chelsea came from behind to
//     level", the past tense every recap title leans on, and the American present "comes from behind"
//     both slipped past), and the "…down" clause had come|came but not "comes" ("Liverpool comes from
//     two goals down"). Both are the same comeback-reveal "comeback" already hides — a side was behind
//     and rallied — and carry no digits for SCORE_RX; the added forms share the trusted branch's own
//     negligible risk (the benign "the goal comes from …" lacks the "behind"/"…down" tail), erring to
//     the over-hide-is-safe side. Byte-identical to the worker's copy.
//     "(?:storm|roar|claw)(?:s|ed|ing)?[- ]?back" / "battl(?:e|es|ed|ing)[- ]?back" join the existing
//     "comeback"/"come[- ]from[- ]behind" as the phrasal comeback-reveal family recaps reach for far
//     more often than the bare noun: "Spain storm back from two down", "Warriors roar back to beat the
//     Lakers", "Spain clawed back to level", "United battle back for a point". Each reveals the same
//     score-state leak "comeback" already hides — a side was behind and rallied — yet none of them
//     contains the literal word "comeback" or "come from behind", so they slipped past the whole set,
//     and they carry no digits (SCORE_RX misses them too). The mandatory trailing "back" keeps the risk
//     negligible: it pins "storm"/"roar"/"claw"/"battle" to the comeback sense and clear of their bare
//     benign uses (a weather "storm", a crowd's "roar", a "claw", a generic "battle"), and no in-scope
//     club or nation is named any of these. The stems are enumerated (NOT "\w*") so the group can't run
//     past its inflections: "(?:s|ed|ing)?" covers storm/storms/stormed/storming (and roar/claw) while
//     "battl(?:e|es|ed|ing)" covers battle/battles/battled/battling. The rare literal "claw back losses"
//     (finance) never appears in the per-match highlight titles this filter runs on, and any residual
//     over-hide errs to the over-hide-is-safe side (a masked title costs a tap to reveal; a leaked one
//     breaks the whole promise). Byte-identical to the worker's copy.
//     "fight(?:s|ing)?[- ]?back"/"fought[- ]?back" complete the phrasal comeback-reveal family alongside
//     "comeback"/"come[- ]from[- ]behind"/"(?:storm|roar|claw)…back"/"battl…back" — and "fight back" is
//     the single most common way a soccer/World Cup recap title frames a rally, yet it was the one member
//     of the family still missing ("Spain fight back to level", "United fought back from two down", "Chelsea
//     fighting back late", "Arsenal's fightback falls short"). Each reveals the same score-state leak
//     "comeback" already hides — a side was behind and rallied — yet none contains the literal "comeback"/
//     "come from behind" and none carries digits (SCORE_RX misses them). Structured exactly like the sibling
//     "battl…back": the inflection sits on the verb, so "(?:s|ing)?" covers fight/fights/fighting and the
//     separate "fought[- ]?back" branch covers the irregular past (mirroring the "sees?…off"/"saw…off"
//     present+past split). The MANDATORY trailing "back" pins "fight" to the comeback sense and clear of
//     its ubiquitous bare uses (a "title fight", "fight for the ball", "relegation fight"), and the leading
//     \b keeps it clear of "infighting"/"firefight" (the "fight" there sits mid-word with no boundary before
//     it). The "[- ]?" covers "fight back"/"fight-back"/"fightback" — the closed noun being always a comeback
//     reveal. Its one benign collision — the emotion idiom "fight back tears" — never appears in the per-match
//     highlight titles this filter runs on and errs to the over-hide-is-safe side (a masked title costs a tap
//     to reveal; a leaked one breaks the whole promise). Byte-identical to the worker's copy.
//     "(?:come|came)[- ]from…down" extends the already-covered "come[- ]from[- ]behind" to the numeric
//     deficit form the same rally is just as often framed with ("Chelsea come from two goals down",
//     "Liverpool come from a goal down", "West Indies come from four down", "Barca came from two sets
//     down") — the classic "behind" branch only fires on the literal word "behind", so every "N goals
//     down"/"a goal down" variant slipped past it, and none carries a hyphenated scoreline SCORE_RX would
//     catch. The optional quantifier (an?/\d{1,2}/one…six) and optional deficit noun (goals?/sets?/points?/
//     runs?/scores?) both sit before a MANDATORY trailing "down\b", which is what pins the phrase to the
//     comeback sense and clear of the benign "come from …" uses that lack it ("goals come from midfield",
//     "come from a reliable source") or that trail off elsewhere ("fans come from way down the coast" — no
//     quantifier/noun immediately before "down", so it can't reach the anchor). Any residual over-hide errs
//     to the over-hide-is-safe side. Byte-identical to the worker's copy.
//     "peg(?:s|ged|ging)?[- ]?back" and "(?:pulls?|pulled|pulling|grabs?|grabbed|grabbing) (?:one|a goal|
//     another) back" are the OTHER half of the comeback reveal — the trailing side scoring to cut the
//     deficit — the mirror of the already-covered "claw…back". They are the staple soccer/cricket recap
//     framing for it ("Real Madrid pegged back by Barca", "United pull one back", "Chelsea grabbed another
//     back", "England pegged back to 2-2") and reveal the same score-state leak — a lead was cut, the game
//     is closer than the neutral title lets on — yet none contains "comeback"/"claw" and none carries digits
//     SCORE_RX would catch. "peg…back" is pinned to the comeback sense by the mandatory trailing "back" and
//     is otherwise unused in a per-match title (finance's "pegged at" has no "back"; "peg leg" isn't
//     followed by "back"). The pull/grab branch is the important one: bare "pull back" is the cutback-cross
//     idiom ("great pull-back from Messi", "pulls it back across goal"), an assist that reveals NO result, so
//     the branch REQUIRES the object "one"/"a goal"/"another" before "back" — the form that only ever means a
//     comeback goal — leaving the cutback pass (and "pullback"/"pulls the ball back") untouched. Any residual
//     over-hide errs to the over-hide-is-safe side. Byte-identical to the worker's copy.
//     "(?:cut|halve|reduce|trim|slash)…deficit" is the PARTIAL-comeback sibling of the already-covered
//     "overturn/erase…deficit" (which reverses the gap outright) and of "pull one back"/"pegged back"
//     (the trailing side scoring to close it): a recap that says a lead was cut reveals the same
//     score-state leak — a scoring event happened and the game is closer than the neutral title lets on
//     ("Arsenal cut the deficit before half-time", "Lakers reduce the deficit to five", "United halve the
//     deficit at Old Trafford", "Nuggets slashed the deficit late") — yet it names no scoreline for
//     SCORE_RX and matched no existing verb. Anchored on the object "deficit" like the overturn branch, so
//     the result-free senses of these common verbs stay visible (a squad "trim", a wage/roster "cut"). The
//     one place "deficit" is NOT a score gap is economics, so a negative lookbehind drops the finance
//     qualifiers (budget/trade/fiscal/spending/wage/wages/federal/national/structural deficit) — leaving
//     the sports qualifiers that MUST still fire ("two-goal"/"aggregate"/"points" deficit) untouched.
//     "narrow" is deliberately excluded: the adjective "a narrow deficit" would collide. Lookbehind is
//     already relied on in production (see SCORE_RX). Any residual over-hide errs to the over-hide-is-safe
//     side (a masked title costs a tap to reveal; a leaked one breaks the whole promise). Byte-identical to
//     the worker's copy.
//     "to the sword" joins the decisive-defeat idiom family alongside "run riot"/"brush aside": the stock
//     British football headline "put X to the sword" reveals a lopsided defeat and names the routed side
//     just as plainly ("City put United to the sword", "Spurs were put to the sword", "Spain putting the
//     hosts to the sword") — yet it carries no digits (SCORE_RX misses it) and slipped past every existing
//     verb. Anchored on the fixed 3-word phrase "to the sword" (not on "put", whose object varies in length)
//     so it catches every conjugation and any-length object. Near-zero false-positive risk: "to the sword"
//     is exclusive to this idiom and has no benign sense in the per-match highlight titles this filter runs
//     on, and any residual over-hide errs to the over-hide-is-safe side (a masked title costs a tap to
//     reveal; a leaked one breaks the whole promise). Byte-identical to the worker's copy.
//     "share(?:s|d)? the points"/"a point (?:apiece|each)" sit right beside "share(?:s|d)? the spoils"
//     in the level/draw-reveal family: splitting the points is the stock soccer/World Cup idiom for a
//     drawn result, and a recap title carrying it reveals the match ended level ("Arsenal and City
//     share the points", "the sides shared the points", "a point apiece at the Emirates", "Spurs and
//     Chelsea take a point each") — the same partial-result leak as "share the spoils"/"honours even",
//     yet these bare idioms carry no digits (SCORE_RX misses them) and slipped past every existing
//     keyword. Near-zero false-positive risk: "share(?:s|d)? the points" is anchored to the literal
//     "the points" object (so a lone "share"/"shares"/"shared" never fires), and the draw sense is
//     pinned by requiring the singular "a point" before "apiece"/"each" — that leading "a point" keeps
//     the far-more-common basketball box-score plural out ("LeBron and Durant score 30 points apiece",
//     "both stars had 25 points each" name per-player tallies, not a drawn result, and neither matches).
//     Any residual over-hide errs to the over-hide-is-safe side. Byte-identical to the worker's copy.
//     "come away with a point/the points/nothing" (plus "come away empty-handed") sits in this same
//     result-reveal family: an away side that "comes away with a point" drew, "with the points" won, and
//     "with nothing"/"empty-handed" lost — each names the outcome outright ("Palace come away with a point
//     at the Emirates", "Spurs came away with the points", "Wolves came away empty handed") yet carries no
//     digit (SCORE_RX misses it) and, on the bare idiom, matched no existing keyword. Anchored on
//     "come/comes/coming/came away" + the specific result object, with a "(?!to prove|to make)" lookahead
//     so the unrelated "a point to prove/make" preview phrase stays visible and a leading \b keeping it out
//     of "welcome away". Any residual over-hide errs to the over-hide-is-safe side. Byte-identical to the
//     worker's copy.
//     "share(?:s|d)? the honou?rs" is the THIRD canonical draw idiom in this family, sitting right beside
//     "share(?:s|d)? the spoils"/"share(?:s|d)? the points" — a recap that says the two sides shared the
//     honours is reporting a drawn/split result just as plainly ("Arsenal and City share the honours",
//     "the sides shared the honours in a tense affair"). It is distinct from "honou?rs even" already in
//     the set: that one needs the trailing "even" ("honours even"), so the "share the ..." word order
//     slipped past it and carries no digits for SCORE_RX to catch. Near-zero false-positive risk: it is
//     anchored to the literal "the honou?rs" object (a lone "share"/"honours" never fires), the sense of
//     splitting the honours is exclusively a tie/co-result, and "honou?r" covers the British "honours"
//     and American "honors" spellings just as it does in "honou?rs even". Byte-identical to the worker's copy.
//     "(?:claim|take|took) the honou?rs" is the WINNING-side counterpart of the three draw idioms above and
//     the direct sibling of "(?:claim|take|took) the spoils" already keyworded: where "share the honours"
//     splits a tie, a side that TAKES/CLAIMS the honours won the match, and derby/cup/motorsport recaps lead
//     with exactly that ("Rangers take the honours in the Old Firm derby", "Hamilton takes the honours at
//     Silverstone", "United claim the honours in the derby") — a plain winner reveal that carries no digits
//     for SCORE_RX and matched none of the existing verbs. It is pinned to the claim/take/took verb group
//     immediately before the literal "the honou?rs" object, so the benign "do the honours" (coin toss),
//     "guard of honour", "graduated with honours" and "New Year honours list" senses never fire (none is a
//     take/claim verb on "the honours"), and "honou?r" covers both the British "honours" and American
//     "honors" spellings as its siblings do. Byte-identical to the worker's copy.
//     "(?:claim|take|took|secure|earn|grab|bag|pocket|collect|pick up) (?:the )?maximum points" is the
//     British-football WIN idiom and the exact synonym of the "all three points" keyword already in the
//     set: a side that takes maximum points from a fixture won it (three points for a win), and league
//     recaps lead with precisely that phrasing ("Arsenal take maximum points at Anfield", "City secure
//     maximum points", "Spurs collect maximum points to go top") — a plain winner reveal that carries no
//     digits for SCORE_RX and matched none of the existing verbs. It is pinned to the taking-verb group
//     (claim/take/took/secure/earn/grab/bag/pocket/collect/pick up) immediately before the literal
//     "maximum points" object, so the benign preview/advice senses that carry the noun without a taking
//     verb ("how to get maximum points from your fantasy captain", "maximum points on offer this weekend",
//     "United need maximum points to stay up") never fire — none is a taking verb on "maximum points".
//     Any residual over-hide errs to the over-hide-is-safe side. Byte-identical to the worker's copy.
//     "(?:comes?|came)[- ]?out on top" is the stock outright winner-reveal idiom recaps reach for when
//     they don't want to say "beat" — "Spain come out on top", "Warriors came out on top in OT",
//     "United come out on top of the group" — each names the winner (or the table/rankings leader) just
//     as plainly as "wins"/"victory" beside it, yet the bare phrase carries no digits (SCORE_RX misses
//     it) and none of the existing verbs caught it. It is one of the CLEANEST members of the win family:
//     the full 4-token phrase "out on top" is exclusive to this "finish first" sense and has no benign
//     collision in the per-match highlight/recap titles this filter runs on (a "top" of the ninth or a
//     "top" seed never produces "out on top"). "(?:comes?|came)" covers come/comes/came and the "[- ]?"
//     the "come-out"/"come out" hyphenation, while the mandatory "out on top" tail keeps a lone "come"/
//     "top" from ever firing. Any residual over-hide errs to the over-hide-is-safe side (a masked title
//     costs a tap to reveal; a leaked one breaks the whole promise). Byte-identical to the worker's copy.
//     "level(?:l)?ers?" catches "leveller"/"leveler" — the British-recap synonym for the already-covered
//     "equali[sz]\w*" — the goal that pulls a side back level ("Late leveller for Spain", "stunning leveler
//     ties it up", "two levellers in five minutes"). It reveals the exact same tied-the-game event as
//     "equaliser" beside it, yet the word slipped past the whole set and carries no digits for SCORE_RX to
//     catch. The mandatory "er"/"ers" suffix keeps the far-more-common non-result "level" senses out —
//     "level playing field", "levels the series", "top-level clash", "level-headed", "level up" all fail
//     the pattern (verified) — so it only fires on the goal-noun. No in-scope club or nation is named
//     anything matching it. "(?:l)?" covers the British double-l ("leveller") and American single-l
//     ("leveler"); the "s?" the plural. Byte-identical to the worker's copy.
//     "salvag\w*" catches the rescue-a-result reveal soccer/hockey recaps lean on constantly
//     ("Spurs salvage a late point", "United salvage a draw", "Barca salvage pride with a consolation",
//     "City salvaged a draw at the Etihad") — each names the outcome (a rescued draw/point, or a
//     consolation in a loss) just as plainly as the "share the spoils"/"held to a draw" family beside
//     it, yet the bare word carries no digits (SCORE_RX misses it) and slipped past the whole draw set.
//     In a per-match highlight/recap title "salvage" means nothing but rescuing a lesser result — no
//     in-scope club or nation is named anything beginning with "salvag", and the literal wreck/salvage
//     sense never appears in a match title. The stem drops the trailing "e" (salvag, not salvage) so the
//     -ing form matches too, exactly like the "toppl\w*"/"trounc\w*" siblings, so the trailing \w* covers
//     salvage/salvages/salvaged/salvaging at negligible false-positive risk; any residual over-hide errs
//     to the over-hide-is-safe side (a masked title costs a tap to reveal; a leaked one breaks the whole
//     promise). Byte-identical to the worker's copy.
//     "blank(?:s|ed|ing)" catches the shutout VERB — the direct sibling of the already-covered nil-reveal
//     family "shut[- ]?outs?"/"goalless"/"scoreless"/"clean[- ]?sheets?": to "blank" a side is to keep it
//     scoreless, so a title carrying it reveals a shutout ("deGrom blanks Marlins", "Bruins blanked
//     Canadiens", "City blanking United", "Spain blanked at home") — the same result leak as a shutout,
//     yet it carries no digits when the score is omitted (SCORE_RX misses "Bruins blanked again") and no
//     existing keyword caught the verb. It's a staple of MLB/NHL and soccer recap titles. Note the
//     inflection is REQUIRED — it is "(?:s|ed|ing)", NOT a bare "blank" or "blank\w*" — precisely to dodge
//     the collisions of the bare noun/adjective: "point-blank" (a save), "draws a blank" (a player not
//     scoring), "blank stare"/"blank check"/"fill in the blank" all carry no s/ed/ing and so never fire,
//     while "blanks"/"blanked"/"blanking" only ever name the shutout in a per-match highlight title. No
//     in-scope club or nation is named anything matching it, so the false-positive risk stays at the same
//     negligible level as the nil-reveal siblings, and any residual over-hide errs to the over-hide-is-safe
//     side (a masked title costs a tap to reveal; a leaked one breaks the whole promise). Byte-identical to
//     the worker's copy.
//     "consolat\w*" catches the consolation-goal reveal soccer/hockey recap titles lean on constantly
//     ("Georgia grab a late consolation", "Barca's consolation strike", "Marlins pull one back with a
//     consolation") — a distinct partial-result leak the existing set misses: a side only ever scores a
//     "consolation" when it is LOSING, so the word reveals both that a goal was scored AND the result
//     direction (the scoring side is behind), yet it carries no digits (SCORE_RX misses it) and no existing
//     keyword caught it. It sits right beside "salvag\w*" in the lesser-result family — where salvage names
//     rescuing a draw/point, consolation names the goal that softens a defeat (the "salvage" note above even
//     cites "salvage pride with a consolation"). Note the anchor is the stem "consolat", NOT bare
//     "consol" — this deliberately excludes the comfort VERB console/consoles/consoling/consoled (a gaming
//     "console", "console a teammate") AND "consolidate\w*"/"consolidation" (both diverge right after
//     "consol" — an "e"/"i" where "consolat" needs "a") so the only strings that match are consolation/
//     consolations/consolatory (the adjective form the old "consolation\w*" anchor missed), each of which
//     only ever names a losing side's late goal in the per-match highlight titles this filter runs on. No
//     in-scope club or nation is named it, and the rare neutral "consolation final/bracket" never appears in
//     these leagues' YouTube highlight titles — and even that would err to the over-hide-is-safe side (a
//     masked title costs a tap to reveal; a leaked one breaks the whole promise). Byte-identical to the
//     worker's copy.
//     "rescu\w*" is the direct synonym of "salvag\w*" and belongs to the same lesser-result family: the
//     salvage note above literally describes what it catches as "the rescue-a-result reveal", yet the word
//     "rescue" itself was never a keyword — an oversight, since football recap titles reach for it just as
//     constantly ("United rescue a point", "Spurs rescue a draw", "late Ramos goal rescues a point",
//     "Barca rescued a draw at the Camp Nou") and each names the same salvaged draw/point outcome. It carries
//     no digits (SCORE_RX misses it) and no existing keyword caught it. In a per-match highlight title "rescue"
//     means nothing but rescuing a result — a goalkeeper's stop is a "save", never a "rescue", and no in-scope
//     club or nation is named anything beginning with "rescu" — so the trailing \w* covers rescue/rescues/
//     rescued/rescuing/rescuer at the same negligible false-positive risk as "salvag\w*". Any residual
//     over-hide (a metaphorical "rescue mission" preview) errs to the over-hide-is-safe side the salvage/
//     consolation siblings already accept (a masked title costs a tap to reveal; a leaked one breaks the whole
//     promise). Byte-identical to the worker's copy.
//     "go[- ]?ahead (?:goal|run|homer|home[- ]?run|score|basket|bucket|touchdown|header|strike|dunk|three|lay[- ]?up|jumper|try)s?" catches
//     the lead-taking-score reveal that sits right beside the already-covered "equali[sz]\w*" (level) /
//     "level(?:l)?ers?" / "own[- ]?goals?" score-event family: a "go-ahead goal"/"go-ahead run"/"go-ahead
//     touchdown" names the moment a side moved in front, so the title reveals the score DIRECTION (who led)
//     the same way an equaliser reveals a level score — yet it carries no digits (SCORE_RX misses it) and no
//     existing keyword caught the "go-ahead" phrasing. It's a staple across every league this app covers —
//     MLB "go-ahead run"/"go-ahead homer", NHL/soccer "go-ahead goal", NBA "go-ahead bucket"/"go-ahead
//     basket", NFL "go-ahead touchdown", plus the basketball shot-types NBA recaps name outright —
//     "go-ahead dunk"/"go-ahead three"/"go-ahead lay-up"/"go-ahead jumper" — and rugby's "go-ahead try".
//     The MANDATORY trailing scoring noun is what makes it safe: the bare
//     permission idiom "go ahead" (as in "go ahead and…") never precedes one of these nouns in a per-match
//     highlight title, so it can't fire. The regular nouns pluralize with a plain "s" so the single
//     "s?" covers them (goals/runs/homers/home runs/scores/baskets/buckets/touchdowns/headers/strikes/
//     dunks/threes/lay-ups/jumpers); "try" is caught in its singular match-deciding form (a side scores one
//     go-ahead try), and its irregular "tries" plural simply falls outside — the safe side here, since missing
//     a rarer plural only leaves it masked, never leaked. No in-scope club or nation is named anything matching it. Its one benign collision —
//     a "go ahead run the play" style instruction — is vanishingly rare in the video titles this filter runs
//     on and errs to the over-hide-is-safe side (a masked title costs a tap to reveal; a leaked one breaks
//     the whole promise). Byte-identical to the worker's copy.
//     "rall(?:y|ies|ied|ying) (?:past|back|from)" sits right beside the comeback cluster
//     (comeback / come-from-behind / storm|roar|claw back / battle back / fight back / fought
//     back): "rally past" is the single most common come-from-behind winner-reveal in US recap
//     titles ("Warriors rally past Lakers", "Cowboys rally past Eagles"), and "rally back"/"rally
//     from behind"/"rally from two down" are its soccer/NBA siblings — each names a side that
//     erased a deficit to win, yet all slipped past the whole set and carry no digits for SCORE_RX
//     to catch. The MANDATORY trailing direction word (past|back|from) is what keeps it clean: it
//     leaves the tennis NOUN "rally" untouched (the dangerous "amazing rally at the net"/"longest
//     rally of the match"/"30-shot rally" are followed by at/of/end-of-phrase, never past/back/
//     from) and the gather-support sense clear ("rally the crowd"/"fans rally to support" is
//     followed by the/to, not a covered direction). The alternation covers rally/rallies/rallied/
//     rallying; no in-scope club or nation is named anything beginning with "rally". Its one benign
//     collision — a player "rally from injury" — errs to the over-hide-is-safe side (a masked title
//     costs a tap to reveal; a leaked one breaks the whole promise). Byte-identical to the worker's copy.
//     "TKO"/"submission\w*"/"submit(?:s|ted|ting)" catch the two canonical COMBAT-SPORTS method-of-
//     victory reveals — the UFC/MMA analogue of soccer's "red card" or hockey's "shutout" — that this
//     globally-applied filter (it gates the UFC/ESPN fight highlights the app pulls, exactly like every
//     other sport) otherwise leaked: "Makhachev SUBMITS Oliveira", "wins via submission", "Pereira TKO
//     Hill" each name the winner AND the finish, yet carry no digits (SCORE_RX misses them) and none of
//     the win\w*/beat\w*/knock…out set. "TKO" (technical knockout) is combat-only — no in-scope league,
//     club, fighter or benign sports-title word is spelled "TKO", so the outer \b(…)\b bounds it with
//     zero cross-sport collisions. "submission\w*" matches only submission/submissions (it can't reach
//     "submissive", which diverges after "submissi"), and "submit(?:s|ted|ting)" the verb forms (the
//     bare imperative "submit" excluded) — both name a bout's finish in a per-fight title; the rare
//     compilation ("Top 10 Submissions") errs over-hide-safe. "tap(?:s|ped|ping)?[- ]?out" is the same
//     submission finish told from the LOSER's side ("Oliveira taps out", "forced to tap-out", "tapout
//     finish") — the phrase every grappling/MMA recap leans on, yet one that carries no digits and none
//     of the submit/submission/beat set, so it slipped through. "tap out" has no benign meaning in a
//     fight title, and the outer \b(…)\b keeps it clear of "untapped"/"tap into" (no word boundary /
//     no "out"), so it adds the loser-side reveal at negligible false-positive risk. Byte-identical to
//     the worker's copy.
//     "decimat\w*" is the same total-destruction blowout word the all-caps fan-channel highlight
//     titles lean on right beside DESTROY/OBLITERATE/ANNIHILATE ("Real Madrid DECIMATE Barcelona",
//     "Spain decimated Georgia 5-0", "City decimating United") — a lopsided-defeat reveal that
//     slipped past the demolish/destroy/dismantle/obliterate/annihilate/pulverise/thrash/thump/
//     trounce/topple set despite naming the routed side just as plainly and carrying no digits for
//     SCORE_RX to catch. It is one of the CLEANEST members of the family: the pedantic "kill one in
//     ten" sense never appears in a per-match highlight title, and no in-scope club or nation is
//     named anything beginning with "decimat", so the trailing \w* covers decimate/decimates/
//     decimated/decimating/decimation at the same negligible false-positive risk as the verbs
//     above. Byte-identical to the worker's copy.
//     "knock(?:s|ed|ing)? off" catches the defeat/UPSET idiom US recap titles lean on constantly —
//     distinct from the already-covered "knock(?:s|ed|ing)[- ]?out" (elimination): "Warriors knock
//     off Lakers", "Duke knocks off UNC", "15-seed knocks off 2-seed", "USMNT knock off Mexico" each
//     name the beaten side (and usually flag an upset), yet carry no digits (SCORE_RX misses them)
//     and matched none of the beat/defeat/upset set, so the result leaked. It is the March-Madness /
//     NBA / NFL / cup-tie staple for "team X beat the favorite". Crucially the separator is a
//     MANDATORY single space (" off", NOT the "[- ]?off" the sees/holds/fends-off siblings use):
//     that keeps the counterfeit-product homograph OUT — "knockoff"/"knock-off" (a fake jersey) has
//     no space so it never fires, unlike "seeoff"/"holdoff" which aren't words. The required space
//     after "knock" also excludes the "stop it" idiom "knock it off" ("knock" is followed by " it",
//     not " off") and leaves bare "knockout"/"knockout stage" untouched. Its one benign collision —
//     a returning player "knock off the rust" — is rare in the per-match highlight titles this filter
//     runs on and errs to the over-hide-is-safe side (a masked title costs a tap to reveal; a leaked
//     one breaks the whole promise). Byte-identical to the worker's copy.
//     "hang(?:s|ing)?[- ]?on"/"hung[- ]?on" is the direct American-recap sibling of the already-covered
//     "hold(?:s|ing)?[- ]?on"/"held[- ]?on" protect-the-lead win: "hang on" is how NBA/NFL/NHL and soccer
//     recap titles narrate a side surviving a late push to win at least as often as "hold on" ("Bills hang
//     on to beat the Chiefs", "Warriors hang on in OT", "Georgia hung on", "Chelsea hanging on for the
//     win") — the same winner reveal, yet none of its forms fired and the result leaked. Structured
//     exactly like the hold/held pair: the inflection sits on the verb, so "hang(?:s|ing)?" covers
//     hang/hangs/hanging and the separate "hung[- ]?on" branch covers the irregular past, while the
//     mandatory trailing "on" keeps bare "hang" clear of "hangar"/"hanger"/"hangover"/"overhang" (none is
//     "hang"+"on") and the "[- ]?" covers "hang on"/"hang-on". Its one benign collision — the interjection
//     "hang on a sec" — is the exact same over-hide the accepted "hold on" already carries (both fire on
//     "…on"+\b) and is vanishingly rare in the per-match highlight/recap titles this filter runs on; like
//     "hold on" it errs to the over-hide-is-safe side (a masked title costs a tap to reveal; a leaked one
//     breaks the whole promise). Byte-identical to the worker's copy.
//     "(?:cling(?:s|ing)?|clung)[- ]?on" and "(?:cling(?:s|ing)?|clung)[- ]?to …" complete the same
//     protect-the-lead-to-win family as "hold on"/"held on"/"hang on"/"hung on" above: a side clinging on
//     is a side that finished ahead, so "Rangers cling on to beat Celtic", "United clung on for victory",
//     "Chelsea clinging on at the death" each name the winner even when no digits or other keyword fires.
//     The bare "…on" branch (cling/clings/clinging/clung) mirrors the hang/hung structure exactly. The
//     "…to …" branch requires a result object — an optional article, one optional adjective, then
//     win/victory/lead/advantage/point(s)/result — so it fires on "cling to a slender lead"/"clung to their
//     advantage"/"cling to three points" while staying clear of the non-result idioms that dominate outside
//     sport ("cling to hope", "cling to survival", "clings to his job", "cling to a dream"): none of those
//     objects is in the list. Like the rest of the family it errs to over-hide-is-safe and is byte-identical
//     to the worker's copy.
//     "(?:hold(?:s|ing)?|held)[- ]out[- ]for …" completes that same protect-the-result family from the
//     other common phrasing: a side that "holds out for" a result saw the game to its end with that result
//     intact, so "Ten-man Arsenal hold out for a draw", "United held out for a point", "Wolves holding out
//     for a result" each name the finish even when no digits or other keyword fires. "hold on"/"cling to"
//     covered the lead-protection senses but "hold/held out for" named none of them, so those draw/point(s)/
//     result titles leaked (the win/victory forms already hid on the bare "win"/"victory" tokens; this makes
//     the whole idiom hide uniformly). Like the "cling to …" branch it requires a result object — an optional
//     article, one optional adjective, then win/victory/draw/point(s)/result/lead — so the everyday
//     non-result senses stay visible: "hold out for a new contract"/"holds out for more money" (a transfer
//     hold-out), "hold out hope"/"hold out little chance" all put a non-result noun in that slot (or, for
//     "hope", break the "out for" adjacency) and never fire. Errs to the same over-hide-is-safe side as its
//     siblings and is byte-identical to the worker's copy.
//     "empty[- ]?net(?:s|ter|ters)?" catches the late-game insurance goal that reveals the winner — an
//     empty-net(ter) is only ever scored by the LEADING side (the trailing team pulls its goalie), so
//     "Bruins add an empty-netter", "empty-net goal ends it", or a bare social post ("great empty-netter to
//     ice it") each names the winning side even when no other keyword fires and no digits give SCORE_RX a
//     hook. It sits with the scoring-feat nouns (no-hitter/shut-out/blow-out) and, unlike championship terms
//     ("three-peat", "unbeaten") that also show up in forward-looking previews, an empty-netter is ALWAYS
//     retrospective — you can't preview one — so it never fires on a pre-game headline. The required word
//     "empty" before "net" keeps it clear of a bare "net"; "net(?:s|ter|ters)?" covers
//     net/nets/netter/netters while the alternation's closing \b leaves "empty netting" untouched (no
//     boundary after "net"). Its only out-of-scope reading — a literal unguarded net in practice — never
//     occurs in the per-match highlight/recap titles this filter sees, and it errs to the over-hide-safe
//     side regardless. Byte-identical to the worker's copy.
//     "(?:unanimous|split|majority)[- ]?decision" completes the combat-sports method-of-victory family
//     alongside "TKO"/"submission\w*"/"submit"/"tap…out": when a UFC/boxing bout goes the distance the
//     result is a scorecard decision, and the winner is named right beside it ("Canelo wins by unanimous
//     decision", "Jones def. Gustafsson via split decision", "majority decision for Usman") — a distinct
//     result reveal the finish-only combat terms miss (a decision is precisely NOT a KO/submission), often
//     phrased with the abbreviation "def." that "defeat\w*" never matches, and carrying no digits for
//     SCORE_RX. It is anchored to the mandatory scorecard adjective (unanimous/split/majority), which is
//     what keeps it clean: bare "decision" never fires, so the common benign "VAR decision"/"referee's
//     decision"/"controversial decision" all pass through untouched — those three adjectives only ever
//     precede "decision" as a judges' verdict in the per-match highlight titles this filter sees. The
//     "[- ]?" covers "unanimous decision"/"unanimous-decision". Byte-identical to the worker's copy.
//     "(?:goes|going|went|gone)[- ]the[- ]distance" is the OUTCOME sibling of the scorecard-decision
//     entry above: a boxing/MMA bout that "goes the distance" reached the final bell with no
//     stoppage, so a title saying so reveals the fight was NOT finished early — the same method-of-
//     result leak the KO/TKO/submission/decision terms mask, told from the went-the-full-length angle
//     ("Canelo goes the distance against Charlo", "Fury vs Usyk went the distance", "gone the distance
//     for the first time"). Carries no digits for SCORE_RX and matched no existing token. Scoped to the
//     four completed-result forms goes/going/went/gone on purpose so the bare-infinitive PREVIEW form
//     never fires — "Can Fury go the distance?"/"Will he go the distance tonight?" ask an open question
//     and must pass through, the same tight scoping the "qualify" note below keeps. "the distance" must
//     follow immediately, so "goes the extra distance"/"long-distance"/"the full distance" never match.
//     Byte-identical to the worker's copy.
//     "(?:puts?|putting)[- ]...[- ]to[- ]sleep" is the combat-slang KO reveal that sits beside the
//     stoppage/decision cluster above: a fighter "put to sleep" was knocked cold or choked unconscious,
//     the most literal finish there is, yet the phrasing carries no digits for SCORE_RX and no existing
//     token ("Khabib puts McGregor to sleep", "Ngannou put Gane to sleep", "Poirier put to sleep").
//     The one benign homograph is the boredom idiom "put the fans/crowd to sleep", so the {0,3}-word
//     object slot is fenced with a negative lookahead that refuses the audience nouns/pronouns that
//     idiom always takes (fans/crowd/viewers/spectators/everyone/us/me/you/em/them) — a KO names the
//     opponent (a proper name or him/her), never the audience — while "to sleep" must follow the object
//     immediately, so "sleeps 8"/"the city that never sleeps"/"sleepwalk" never match. Byte-identical to
//     the worker's copy.
//     "qualif(?:ies|ied)" is the bare-verb advancement reveal the phrasing-specific idioms above
//     NOTE: keep the bare infinitive "qualify". British headline style uses the plural-subject
//     form for a completed result ("Spain qualify for the last 16", "Japan qualify"), which is
//     exactly what these highlight titles say; dropping it leaked them. The "How to qualify
//     for…" preview worry does not apply — SPOILER_RX only ever sees YouTube highlight-candidate
//     titles (worker) and the modal title chrome, never a news headline.
//     ("book their place"/"reach the …"/"through to the …"/"advanc\w*") all miss: in this WC-heavy app a
//     side "qualifying" from the group or a tie is a pure result reveal that names who went through
//     ("Spain qualify for the last 16", "Argentina have qualified", "USA qualify" — and the flip
//     "Italy fail to qualify" naming who's out), yet it carries no digits (SCORE_RX misses it) and none of
//     the advancement idioms use the word. Scoped to the three result forms qualify/qualifies/qualified
//     (NOT "qualif\w*") on purpose: the closing \b then lands after each, so the pre-tournament match-phase
//     words the app already treats as a separate category — "qualifier(s)", "qualifying", "qualification"
//     — never match (each continues past the y|ies|ied branch: "qualifying" is qualif+ying, "qualifier"
//     is qualif+ier, "qualification" is qualif+ication, none of which is y/ies/ied). Grammatically-plural
//     team usage makes bare present "qualify" the most common WC form, so it's listed alongside the
//     singular "qualifies" and past "qualified", exactly like the "win"/"lose"/"stun" plural-present
//     additions above. Byte-identical to the worker's copy.
//     "whitewash\w*" catches the clean-sweep / comprehensive-defeat framing tennis, cricket and
//     aggregate-tie recaps lean on ("Argentina whitewash Brazil", "India whitewashed 3-0",
//     "a series whitewash") — a result that names the side that lost every game/set, yet its
//     bare-verb present tense ("X whitewash Y") slipped past the sibling "sweep\w*|swept" entry
//     beside it and carries no digits when phrased without a scoreline. In a sports-title context
//     "whitewash" means nothing but a one-sided sweep (the literal paint/cover-up sense never
//     appears in a highlight or headline feed, and no in-scope team is named anything beginning
//     with it), so the trailing \w* covers whitewash/whitewashes/whitewashed/whitewashing at the
//     same negligible false-positive risk as the sweep/rout family. Byte-identical to the worker's copy.
//     "clos(?:e|es|ed|ing)[- ]?out(?: the| a| their| its)? series" catches the playoff series-clinch
//     framing NBA/NHL/MLB recaps lead with ("Celtics close out the series in Game 5", "Panthers closing
//     out the series", "Dodgers closed out series") — to close out a series is to WIN it and eliminate the
//     other side, a decisive reveal that carries no digits for SCORE_RX and slipped past the sibling
//     "sweep\w*|whitewash\w*" entries beside it (a series win need not be a sweep). Deliberately anchored to
//     the object "series" — the one sense in which "close out" can only mean winning — so the everyday
//     senses that DO appear on a sports channel are all left untouched: the defensive "close out on a
//     shooter" drill, a "season close out" roundup and a "close out the year" retrospective have no
//     "series" after "out" and never match. The (?: the| a| their| its)? covers the article/possessive
//     forms and the bare "close out series"; the leading clos(?:e|es|ed|ing) covers close/closes/closed/
//     closing. Byte-identical to the worker's copy.
//     ── Cricket (added 2026-08-03 with the IPL column) ──
//     Cricket states its results in vocabulary no other sport uses, so ten of the commonest IPL
//     result headlines walked straight through the filter above. Measured before this block:
//     "Mumbai Indians all out for 98", "Gujarat Titans bowled out for 155", "Chennai chase down
//     201", "Rajasthan chased 210", "Super Over drama", "SRH post 277 for 3", "RCB 161/5",
//     "Titans defend 155" and "Punjab skittled for 88" all PASSED. Each of them names the result.
//     Every term here is deliberately narrower than its natural phrasing, because this regex also
//     runs against NFL/NBA/soccer titles:
//       "bowl(?:s|ed|ing)[- ]?out" REQUIRES a verb suffix. The bare "bowl out" would fire on
//         "Super Bowl out of reach for the Jets" — the [- ]? also matches a space. Cricket only
//         ever says bowled/bowls/bowling out, so demanding the suffix costs nothing.
//       "defend(?:s|ed|ing)? \d{2,3}" and "chas(?:e|es|ed) \d{2,3}" REQUIRE the digits, so
//         "Chiefs defending champions" and "Curry chasing history in Game 5" stay clean.
//       "\d{2,3}\/(?:10|\d)" is the runs/wickets notation. The 2-3 digit head and the 0-10
//         wicket tail are what keep US date formats out: "12/25" fails the wicket group and
//         "5/31" fails the runs group, so neither a schedule nor a game-time headline trips it.
//       "\d{2,3} for \d" is the spoken form of the same score ("277 for 3"); the 2-3 digit head
//         keeps a basketball shooting line like "5 for 12" out.
//     "all[- ]?out for", "super[- ]?over" (which reveals a tie), "five[- ]?for", "fifer",
//     "wicket haul" and "skittl\w*" carry no non-cricket sense in a sports feed at all.
//     Verified against a 24-case battery (10 cricket results blocked, 14 non-spoiler headlines
//     still passing, including the Super Bowl and date-format traps). Byte-identical to the
//     worker's copy.
//     Cricket century added 2026-09-24. A batsman's century is the sport's signature scoring
//     reveal — the exact analogue of the already-masked hat-trick/brace — yet it carries no
//     digits for SCORE_RX and matched no cricket token above, so "Kohli hits a majestic century",
//     "Root brings up his century" and "Double century for Gill" all leaked. Two branches:
//     the qualifier form "(maiden|double|triple) century" (each unambiguous), and a scoring-verb
//     form (hits/smashes/blasts/notches/slams/cracks/racks up/brings up/compiles) + an optional
//     article and up to two adjective words + "century". "score(s)"/"reaches" are deliberately
//     LEFT OUT of the verb list so "the greatest scores of the century" / "reaches the end of the
//     century" cannot fire, and the trailing "(?!(?:\s+of|[- ]old))" keeps "match of the century"
//     and "a century-old record" visible. Byte-identical to the worker's copy.
//     MMA/combat set added 2026-08-10 — "TKO", "submission" and "knocked out" were already here,
//     but the words the UFC channel ACTUALLY titles with were not, so the mask kept lifting on a
//     result (Jacob 8/10, raised more than once). "stops"/"stopped" is the standard stoppage verb
//     in both MMA and boxing; "KOs?"/"KO'd" is the single most common finish word on the UFC
//     channel and carried no coverage at all (only the T-prefixed "TKO" did); "def(?=\.)" is the
//     ubiquitous results abbreviation ("Jones def. Miocic") — written as a lookahead because the
//     pattern's trailing \b cannot follow a literal period; "retain(?:s|ed)" names the winner of
//     every title fight; "finish(?:es|ed)" and "starch\w*" are the finish-framing verbs left over.
//     Two accepted over-hides, both erring the same way as "destroy" above (a masked title costs
//     one tap; a leaked one breaks the whole promise): "KO" also matches the golfers Lydia/Jin
//     Young Ko, and "stops" also matches a goalkeeper save compilation. "stoppage" was
//     deliberately NOT added — it would mask nearly every soccer title via "stoppage time", and a
//     genuine stoppage-time result is already caught by "winner"/"equali[sz]e".
//     "walk(?:s|ed|ing)?[- ]?it[- ]?off" is the idiom form of the already-covered "walk[- ]?off":
//     MLB/softball highlight titles overwhelmingly phrase a game-ending hit as "Yankees walk it
//     off" / "Judge walks it off" / "WALK IT OFF!", and the intervening "it" slips past the bare
//     "walk[- ]?off" entry (which needs walk and off adjacent). It names the winner outright. The
//     only non-result sense — the "shake off an injury" advice — effectively never appears as a
//     highlight-feed title, and an over-hide there costs one tap while a leak breaks the promise,
//     the same trade-off as the walk-off/buzzer-beater siblings.
//     The "chequered flag"/"crosses the line first" pair covers motorsport and other racing
//     (F1/IndyCar/NASCAR/MotoGP, plus athletics/cycling/swimming), a category the rest of the list —
//     built around team-sport result verbs — barely touches. "(?:take|took|claim) the chequered flag"
//     names the race winner outright (only the winner "takes"/"claims" it; a backmarker merely "sees" it),
//     and "che(?:ck|qu)ered" covers both the British and American spelling. "cross(?:es|ed|ing) the
//     (finish) line first" is the same winner reveal for any timed race — the trailing "first" is
//     what makes it a result rather than the everyday "cross the line" metaphor, so a rugby try
//     line or a "crossed the line" controversy stays clean. Both are tightly anchored (a leading
//     take/took/cross verb, a trailing flag/first), so the false-positive risk is negligible.
//     Byte-identical to the worker's copy.
//     "wire[- ]to[- ]wire" catches the lead-from-start-to-finish idiom that horse racing coined (the
//     "wire" being the finish line) and golf, motorsport and the NBA all reuse: a side that goes
//     wire-to-wire led the whole way, so the phrase names the winner outright ("Scheffler goes
//     wire-to-wire at Augusta", "Verstappen wire-to-wire at Suzuka", "Thunder lead wire-to-wire")
//     yet carries no digit for SCORE_RX and matched no existing keyword — only nearby win/lead words
//     caught it before. It is the two-word "wire TO wire" collocation, distinct from the close-finish
//     "down to the wire" (which stays visible, correctly, as a preview/tension phrase), so its only
//     over-matches are look-ahead previews ("can he go wire-to-wire again?"), which err to the same
//     over-hide-is-safe side as the racing siblings above. Byte-identical to the worker's copy.
//     "spoil(?:s|ed|t|ing)? (?:the|their|X's) (?:party|homecoming|return|debut|farewell|reunion|
//     swan[- ]?song)" catches the upset-win idiom football/hockey/basketball highlight titles lean
//     on constantly ("Leeds spoil the party at Old Trafford", "Wrexham spoiled the party", "Villa
//     spoilt the party", "Brighton spoil United's party", and the same idiom aimed at a milestone
//     occasion: "Heat spoil LeBron's return", "Rangers spoil Crosby's homecoming", "Arsenal spoil
//     Mourinho's debut", "City spoil Rooney's farewell", "United spoil Ronaldo's swansong") — an
//     underdog-beats-a-favourite reveal (often ON the honoured side's title/celebration/return day)
//     that names the winning side yet carries no digit for SCORE_RX and matched no existing keyword.
//     It is anchored to the two-word "spoil …<occasion>" idiom with a mandatory connector between
//     them ("the"/"their"/a possessive like "United's"), so the bare occasion nouns ("birthday
//     party", "return leg preview", "coaching debut interview", "political party") all pass through
//     untouched — only a preceding "spoil"-verb + one of the occasion nouns fires. The occasion set
//     is deliberately limited to milestone events a losing side has "spoiled" (party/homecoming/
//     return/debut/farewell/reunion/swansong); generic "spoil the day/fun/mood" is left out as too
//     loose. The "(?:s|ed|t|ing)?" covers spoil/spoils/spoiled/spoilt (British)/spoiling and the
//     possessive branch accepts both straight and curly apostrophes as real YouTube titles use. The
//     leading verb also accepts "ruin(?:s|ed|ing)?" — an exact synonym headlines swap in just as
//     freely ("Rangers ruin Celtic's party", "Heat ruined LeBron's homecoming") — gated by the same
//     mandatory connector + occasion noun, so it carries the identical narrow footprint.
//     Its benign over-matches ("spoil their party plans") err to the same over-hide-is-safe side as the
//     siblings above (a masked title costs a tap to reveal; a leaked one breaks the whole promise).
//     Byte-identical to the worker's copy.
//     The medal clause — "(?:claim|take|secure|grab|bag|scoop|strike…) (?:the|a|an)? gold/silver/
//     bronze (?:medal)?" — catches the podium-result idiom that dominates Olympics, athletics,
//     swimming and cycling recaps ("Team GB claim gold", "Ledecky takes gold", "Kerr claims
//     bronze medal") — a first/second/third-place reveal with no digit for SCORE_RX. "wins gold"
//     already fell to "win" and "clinch/snatch/seal gold" to their own stems; this adds the
//     everyday claim/take/secure/grab/bag/scoop/strike verbs that named the medal but nothing
//     else. It is anchored on both ends: a winning verb must precede the colour, so the
//     preview senses pass through untouched ("going for gold", "gold medal match preview", "gold
//     rush"); the "(?!\s*coast)" lookahead keeps "take Gold Coast" (the Australian side) out; and
//     the trailing "(?![-\w])" stops an adjectival compound firing ("bronze-tinted", "gold-plated")
//     while still allowing "gold medal(s)". Byte-identical to the worker's copy.
//     "(?:take|takes|taking|took) down" catches the "X take down Y" defeat idiom that
//     US recap titles lean on constantly ("Yankees take down Red Sox", "Chiefs take down
//     the Bills", "Celtics took down the Heat") — it names the winning side with no digit
//     for SCORE_RX and matched no existing keyword ("beat"/"defeat"/"dispatch" didn't cover
//     the two-word "take down"). It requires the literal "take"-verb immediately before a
//     space + "down", so the compound noun "takedown"/"takedowns" (the wrestling/MMA move,
//     one word) and bare "down" senses ("breaking down", "down the stretch", "ups and
//     downs") all pass through untouched — only the verb phrase fires. Its one benign
//     over-match ("take down the poster") errs to the same over-hide-is-safe side as the
//     siblings above (a masked title costs a tap to reveal; a leaked one breaks the whole
//     promise). Byte-identical to the worker's copy.
//     "marching[- ]orders" catches the red-card reveal in the stock British football idiom for a
//     dismissal — "given his marching orders" — that sits right beside the existing "red card"
//     noun, the "send(?:s|ing)?[- ]?off"/"sent[- ]?off" verb form and "sees?[- ]?red"/"saw[- ]?red":
//     a sending-off is a match-event partial-result leak ("Casemiro handed his MARCHING ORDERS vs
//     City", "keeper given his marching orders late on") that carries no digit for SCORE_RX and
//     slipped past every existing keyword. It is anchored to the fixed two-word idiom (a mandatory
//     space-or-hyphen between "marching" and "orders"), so the bare words never fire on their own —
//     "marching" alone (a marching band, marching on) and "orders" alone (side orders, court orders,
//     orders of magnitude) both pass through untouched; only the joined phrase matches. Its one
//     benign collision — a manager sacked and "given his marching orders" (a job dismissal, not a
//     scoreline) — errs to the same over-hide-is-safe side as the disciplinary siblings above (a
//     masked title costs a tap to reveal; a leaked one breaks the whole promise). Byte-identical to
//     the worker's copy.
//     "(?:have|has|had|having|get|gets|getting|got) the last laugh" catches the ultimately-triumphed
//     idiom underdog and derby recaps reach for ("Wrexham HAVE THE LAST LAUGH at Wembley", "Chiefs get
//     the last laugh over the Bills", "Chelsea got the last laugh in the derby") — a win reveal that
//     names no score for SCORE_RX and matched no existing keyword, the sibling to "(?:comes?|came) out
//     on top" beside it. It is anchored to the whole three-word "the last laugh" idiom preceded by a
//     have/get verb, so the bare words never fire alone — "a good laugh", "share a laugh", "last dance",
//     "last minute" and "last chance" all pass through untouched; only the joined phrase matches. Its
//     one benign over-match — a preview asking "who will have the last laugh?" — errs to the same
//     over-hide-is-safe side as the siblings above (a masked title costs a tap to reveal; a leaked one
//     breaks the whole promise). Byte-identical to the worker's copy.
//     The "unbeaten run ended" pair catches the streak-broken result framing recaps lean on
//     constantly in this WC/league-heavy app ("Arsenal END City's unbeaten run", "Liverpool's
//     unbeaten run is OVER", "Napoli snap Inter's winless run", "Real Madrid halt Barca's perfect
//     record") — a loss reveal (the unbeaten side just lost) that named neither a score nor any
//     existing keyword, since "unbeaten"/"winless"/"perfect" are status words, not results. It is
//     deliberately anchored to the ENDING, not the bare status, so pure pre-match/standings titles
//     stay untouched: "remain unbeaten", "stay unbeaten this season?", "unbeaten run continues",
//     "perfect start to the season" all pass through — only a run/streak/start/record explicitly
//     ended, snapped, halted, broken or "over" fires. Two ordered alternatives cover both the
//     verb-first form ("end … unbeaten run") and the noun-first form ("unbeaten run … ends"), each
//     with a lazily-bounded {0,3}/{0,2} word gap (a possessive, a "10-game", a "their") so there is
//     no unbounded backtracking. "record" as an adjective (the record-BREAKING sense, "record run")
//     is intentionally excluded — only the "perfect/unbeaten record" noun sense is a result. Its one
//     benign over-match — a preview that names an unbeaten run only to ask whether it will end — errs
//     to the same over-hide-is-safe side as the siblings above (a masked title costs a tap to reveal;
//     a leaked one breaks the whole promise). Byte-identical to the worker's copy.
//     The "drought ended" pair is the barren-run sibling of the "unbeaten run ended" pair right above
//     it: a "drought" is the goal/trophy/title/away famine recaps name only to report it broken ("Arsenal
//     end 10-year trophy drought", "Man Utd snap their goal drought", "Spurs' title drought is over",
//     "City end drought at Anfield") — an outright result reveal (the side won the trophy, scored, or won
//     on that ground) that carries no scoreline for SCORE_RX and matched no existing keyword. Anchored,
//     exactly like the streak pair, to the ENDING and not the bare word, so the pure worry framing passes
//     through: "in the middle of a drought", "desperate to end the drought?" carry no realised end. Two
//     ordered alternatives cover the verb-first form ("end … drought") and the noun-first form ("drought …
//     over"), each with the same lazily-bounded {0,3}/{0,2} word gap so there is no unbounded backtracking.
//     Its one benign over-match — a preview asking whether a side can end its drought — errs to the same
//     over-hide-is-safe side as every sibling here. Byte-identical to the worker's copy.
//     "straight[- ]?sets?" catches the decisive-tennis (and volleyball) result descriptor the Grand
//     Slam/ATP titles this app surfaces reach for constantly ("Alcaraz eases through in STRAIGHT SETS",
//     "Straight sets for Sabalenka", "Sinner wins in straight sets") — a win with no set dropped, which
//     reveals both that the match is over and that it was one-sided, exactly the partial-result leak
//     the sibling decisive-result nouns ("shut[- ]?outs?", "clean[- ]?sheets?", "sweep") already cover
//     for other sports. Bare "straight sets" carries no digit for SCORE_RX and, without a co-occurring
//     verb, matched no existing keyword — the doc example above ("Alcaraz DISPATCHES Zverev in straight
//     sets") only fired on "dispatch" — so a plain "… in straight sets" recap leaked. It is pinned to
//     the "straight"+"set(s)" adjacency (the optional "[- ]?" covers "straight sets"/"straight-set(s)"),
//     so the bare words never fire alone — "straighten up", "straightforward", "set piece" and "two
//     sets of …" all pass through; only the joined phrase matches. Its one benign over-match — a preview
//     asking whether a favourite can win in straight sets — errs to the same over-hide-is-safe side as
//     the siblings above (a masked title costs a tap to reveal; a leaked one breaks the whole promise).
//     The "worldie"/"golazo"/"wonder[- ]?goal"/"screamer" cluster catches the spectacular-goal nouns
//     that recaps and highlight reels lean on across the soccer-heavy leagues this app surfaces ("Saka's
//     SCREAMER settles it", "Messi's WORLDIE lights up El Clasico", "GOLAZO from Vinicius", "Rodri's
//     WONDERGOAL"). Each reveals a goal was scored — and usually who scored it — the same partial-result
//     leak the sibling goal-event nouns ("own[- ]?goals?", "go[- ]?ahead …", "grand slam", "braces?")
//     already mask; on their own these carried no digit for SCORE_RX and matched no existing keyword, so
//     a bare "Saka's screamer" recap leaked. They are recap-only descriptors — a preview never calls an
//     unplayed goal a worldie — so benign collisions are essentially nil; "wonder[- ]?goals?" is pinned to
//     the "wonder"+"goal" adjacency ("no wonder" alone passes through), and "screamers?" over "cricket's
//     screamer of a catch" errs to the same over-hide-is-safe side as the siblings above. The optional
//     "[- ]?" covers "wonder goal"/"wonder-goal"/"wondergoal" and the trailing "s?" the plurals.
//     Byte-identical to the worker's copy.
//     "(?:triple|double)[- ]?doubles?" catches the NBA stat-line reveal that recap and highlight titles
//     lead with ("Jokic records a triple-double", "Giannis with a double-double") — the same notable
//     individual-feat leak the sibling feat nouns ("hat[- ]?tricks?", "braces?", "no[- ]?hitter",
//     "perfect[- ]?games?") already mask for other sports: it reveals a star had a dominant statistical
//     game, yet on its own carries no digit for SCORE_RX and matched no existing keyword, so a bare
//     "… triple-double" recap leaked. It is pinned to the "triple"/"double" + "double" adjacency, so a
//     bare tennis "doubles" ("men's doubles final", "mixed doubles semifinal") passes through untouched
//     — only the joined stat term fires — and the "[- ]?" covers "triple double"/"triple-double" with the
//     trailing "s?" for the plural. Byte-identical to the worker's copy.
//     "\d{1,3}[- ]?unanswered" and "unanswered[- ]?(?:points?|runs?|goals?|scores?|buckets?)" catch the
//     scoring-run reveal that basketball, NFL and rugby recaps lead with ("Warriors reel off 18 unanswered
//     points", "Chiefs score 21 unanswered", "three unanswered goals") — it discloses one side pulled
//     decisively clear, the same run-of-play leak the comeback/deficit siblings mask from the other
//     direction, yet the digit sits inside "18 unanswered" (no standalone score for SCORE_RX) and it
//     matched no existing keyword, so a bare "… unanswered points" recap leaked. Both branches are pinned:
//     "unanswered" only fires with a leading count OR a following scoring noun, so the general-news
//     "unanswered questions"/"went unanswered" passes through untouched. Byte-identical to the worker's copy.
//     "<count>(?: <scoring-noun>)? without (?:a |any )?reply" is the British soccer/rugby recap idiom for
//     the exact same scoring-run reveal as "unanswered" above, phrased the other way round ("City score
//     four without reply", "three goals without reply", "two tries without reply", "Spain net four without
//     a reply") — it discloses one side scored while the other never answered, the identical run-of-play
//     leak, yet the digit sits inside "four without reply" (no standalone score for SCORE_RX) and none of
//     the existing keywords caught it. It is pinned exactly like the "unanswered" sibling: the phrase only
//     fires when a count (a digit or one–ten, optionally trailed by a scoring noun) sits IMMEDIATELY before
//     "without (a) reply", so the general-language "without reply"/"left without a reply"/"went without a
//     reply" senses — which are preceded by a noun or verb, never a bare count — pass through untouched
//     (verified). The rare non-sports "no one without a reply" errs to the over-hide-is-safe side (a masked
//     title costs a tap to reveal; a leaked one breaks the whole promise). Byte-identical to the worker's copy.
//     "put(?:s|ting)? … <result-noun> to bed" catches the decisive-result idiom commentary and recaps
//     lean on when a late score kills the contest ("Haaland PUTS THE GAME TO BED", "second goal put the
//     TIE TO BED", "United putting the MATCH TO BED"): it reveals the game was won and put beyond reach,
//     the same sealed-it leak the sibling "(?:gets?) over the line"/"clinch"/"seals?" idioms beside it
//     already mask, yet on its own it carries no digit for SCORE_RX and matched no existing keyword, so a
//     bare "… puts the tie to bed" recap leaked. It is deliberately anchored to a sports-result noun
//     (game/tie/match/contest/result/series/final/derby/affair) between "put" and "to bed", so the
//     everyday "put to bed" senses all pass through untouched — "put the story/debate/issue to bed" and
//     "put the kids/baby to bed" never fire; only the joined sports phrase matches. Its one benign
//     over-match — a preview asking whether a side can put the tie to bed — errs to the same
//     over-hide-is-safe side as the siblings above (a masked title costs a tap to reveal; a leaked one
//     breaks the whole promise). Byte-identical to the worker's copy.
//     "put(?:s|ting)? … <result-noun> away" is the American-sports twin of the "… to bed" idiom above —
//     the phrasing NBA/NFL/MLB recaps reach for when a late score seals the win ("Curry PUTS THE GAME
//     AWAY", "Mahomes put the GAME AWAY late", "Yankees put the SERIES AWAY"). It reveals the contest was
//     won and decided, yet on its own carries no digit for SCORE_RX and matched no existing keyword, so a
//     bare "… puts the game away" recap leaked. Anchored to the SAME sports-result noun list as "to bed"
//     (game/tie/match/contest/result/series/final/derby) sitting directly before "away", and gated on the
//     "put(?:s|ting)?" verb — so the everyday "put away" senses all pass through untouched: "putting away
//     the groceries", "put away for the season", "the game away from home" and "play the game away" never
//     fire (no "put" verb immediately governing the result-noun). Its lone benign over-match — a preview
//     asking whether a side can put the game away — errs to the same over-hide-is-safe side as the
//     siblings above (a masked title costs a tap; a leaked one breaks the whole promise). Byte-identical
//     to the worker's copy.
//     "(?:draws?|drew|drawing) level" and "level(?:s|led|ling)? (it | things up | the <result-noun>)"
//     catch the EQUALISER verb frame recaps reach for constantly ("Kane levels it late", "Sub draws
//     level for United", "Rashford levels the scores", "Header levels the tie", "Palmer levels things
//     up"): it reveals the game was pegged back to a tie, the same level-result leak the noun sibling
//     "level(?:l)?ers?" and "equali[sz]\w*" already mask, yet the verb form carries no digit for
//     SCORE_RX and matched no existing keyword, so a bare "… levels it" recap leaked. Bare "level" is
//     far too common to be a keyword ("next-level", "level playing field", "level up your team",
//     "entry-level", "level crossing"), so it is pinned to a result object: "draw(s)/drew level" as a
//     fixed idiom, or level + (it | things up | the scores/tie/match/contest/derby/affair/aggregate).
//     "game" is deliberately left OUT of that noun set — "level the game/playing field" is the everyday
//     fairness idiom, not an equaliser — and the bare "level up"/"next-level" senses never fire because
//     nothing pins to them. Byte-identical to the worker's copy.
//     "put(?:s|ting)? … beyond (all) doubt/reach" and "put(?:s|ting)? … out of sight/reach" catch the
//     game-is-settled idiom commentary and recaps reach for when a late score kills the contest ("Haaland
//     PUTS THE GAME BEYOND DOUBT", "second goal puts it BEYOND REACH", "United put the tie OUT OF SIGHT"):
//     it reveals the game was won and decided, the sibling of the "… to bed"/"(?:gets?) over the line"/
//     "clinch"/"seals?" sealed-it idioms right beside it, yet on its own it carries no digit for SCORE_RX
//     and matched no existing keyword, so a bare "… puts the result beyond doubt" recap leaked. It is
//     anchored to a leading "put" verb, so the everyday "proved/established beyond (reasonable) doubt" and
//     legal "guilty beyond reasonable doubt" senses never fire — only the sports "put … beyond doubt"
//     frame matches — and the single optional word before the phrase keeps the object noun (game/tie/
//     result/it) in range without unbounded backtracking. Its one benign over-match — a preview asking
//     whether a side can put the tie beyond doubt — errs to the same over-hide-is-safe side as the
//     siblings above (a masked title costs a tap to reveal; a leaked one breaks the whole promise).
//     Byte-identical to the worker's copy.
//     "(?:makes?|making|made) it <count> (?:in a row|straight|on the trot/bounce/spin)" catches the
//     winning-streak-CONTINUATION reveal that NBA/NHL/soccer recaps lead with when there is no result
//     verb to trip the keywords ("Warriors make it three straight", "Celtics make it 10 in a row",
//     "United make it four on the bounce"): it reveals the side won again, the mirror of the streak-END
//     sibling right above it ("… unbeaten run ends"), yet the digit sits inside "three straight" (no
//     standalone score for SCORE_RX) and, without a "win"/"won"/"winning" token, it matched no keyword,
//     so a bare "… make it four on the bounce" recap leaked. It is pinned to the "make(s)/made it" +
//     count + streak-marker frame, so the everyday "N in a row"/"N years in a row" senses pass through
//     untouched (they carry no leading "make it"), and the count between "it" and the marker keeps the
//     everyday "makes it look easy"/"made it to the final" senses out (neither has a count there). Its
//     one benign over-match — a preview asking whether a side can make it three straight — errs to the
//     same over-hide-is-safe side as the siblings above. Byte-identical to the worker's copy.
//     "(?:the|a|their) (?:league/domestic/season) double over" catches the rivalry-double reveal
//     football recaps lead with when a side beats the same opponent home and away ("Arsenal complete
//     the double over Tottenham", "City do the league double over United", "Rangers get their double
//     over Celtic"): completing the double means both meetings were won, a decisive reveal that carries
//     no digit for SCORE_RX and — with "seal"/"clinch" already keyworded but "complete"/"do"/"get"/
//     "record" not — leaked when phrased with any of those verbs. It is pinned to a leading article/
//     possessive ("the"/"a"/"their") immediately before "double over", so the everyday injury sense
//     "doubled over in pain" (past participle, no article) and "the crowd double over laughing" (no
//     article on "double") never fire. Its one benign over-match — a preview asking whether a side can
//     complete the double over a rival — errs to the same over-hide-is-safe side as the siblings above.
//     Byte-identical to the worker's copy.
//     "(?:even|level|square|tie|knot …) the series" catches the SERIES-TYING reveal NBA/NHL/MLB playoff
//     recaps lead with when the trailing side wins a game to draw a best-of-seven back level ("Bruins
//     EVEN THE SERIES", "Heat LEVEL THE SERIES", "Rays KNOT THE SERIES", "Oilers SQUARE THE SERIES"):
//     drawing the series level means that game was won, a decisive reveal that on its own carries no
//     digit for SCORE_RX — the "… at 2-2" scoreline recaps append is what SCORE_RX catches, so a bare
//     "… even the series" leaked. The "clos(?:e…) out … series" and "settl(?:e…) the series" idioms
//     beside it already mask the series-CLINCH and series-DECIDER reveals; this adds the series-EQUALISER
//     twin. It is pinned to the fixed "<verb> (up) the series" frame — each verb immediately governing
//     "the series" — so the everyday "even the odds", "level the playing field" and "tie the knot" senses
//     never fire (none is followed by "the series"). Its one benign over-match — a preview asking whether
//     a side can even the series — errs to the same over-hide-is-safe side as the siblings above (a masked
//     title costs a tap to reveal; a leaked one breaks the whole promise). Byte-identical to the worker's copy.
//     "(?:tie|knot|square) the game|score" is the single-game twin of the series-equaliser above — the
//     in-game EQUALISER reveal NBA/NHL/MLB and soccer recaps lead with when the trailing side scores to draw
//     a live game back level ("LeBron TIES THE GAME", "Judge TIED THE SCORE with a homer", "Curry KNOTS THE
//     GAME at 100", "Oilers SQUARE THE GAME in the third"): the game being drawn level means that side just
//     scored, the same partial-result reveal as tying a series, yet a bare "… ties the game" carries no digit
//     for SCORE_RX and matched no existing keyword. Only tie/knot/square are borrowed here, NOT the series
//     clause's "even"/"level": "level the game" and "even the game" carry the everyday fairness ("rules to
//     level the game for smaller clubs") and adverb ("even the game was delayed") senses that "the series"
//     lacks, and are the exact non-result cases the level-up test guards — tie/knot/square before "the
//     game"/"the score" have no such benign reading (the "tie the knot"/"square the circle" idioms take a
//     different noun). "levels/evens the score" is already covered by the "level … the scores?" and
//     equaliser groups above. Pinned to the same "<verb> (up) the (game|score)" frame. Byte-identical to the
//     worker's copy.
//     "(?:spoils|points|honou?rs) … shared" catches the INVERTED (subject-first) DRAW idiom soccer recaps
//     lead with ("Spoils shared at the Emirates", "Points were shared", "Honours shared after late drama").
//     The active "share the spoils/points/honou?rs" already keyworded beside it only fires on the verb-first
//     order; the passive "<noun> shared" report — the same drawn-result reveal — leaked. Pinned to the three
//     result nouns immediately governing "shared" (with an optional were/are/fairly/evenly/duly between), so
//     the everyday "news shared"/"photos shared"/"highlights shared" senses never fire. Its one benign
//     over-match — a non-result "loyalty points shared" — errs to the same over-hide-is-safe side as the
//     siblings above. Byte-identical to the worker's copy.
//     "forc(?:e…)[- ](?:a/an/another )?(?:deciding game|game <n>|decider)" catches the SERIES-EXTENDING
//     reveal NBA/NHL/MLB playoff recaps lead with when the trailing side wins an elimination game to keep
//     the series alive ("Celtics FORCE GAME 7", "Oilers force a deciding Game 7", "Heat force a decider"):
//     you can only force a further game by WINNING to avoid elimination, so it discloses that game's winner
//     just as plainly as the "clos(?:e…) out … series" (series-clinch) and "even the series" (series-equaliser)
//     siblings beside it — yet on its own it carries no digit for SCORE_RX (the "Game 7" number is the game
//     index, not a score) and matched no existing keyword, so a bare "… force Game 7" recap leaked. It is
//     pinned to a leading "force" verb immediately governing a decider object — "game" + a number (or the
//     spelled "five"/"seven"), a "deciding game", or a bare "decider" — so the everyday "Air Force game",
//     "task force", "brute force" and "show of force" senses never fire (none is followed by a decider
//     object; "Air Force game" has no game number). Its one benign over-match — a preview asking whether a
//     side can force Game 7 — errs to the same over-hide-is-safe side as the siblings above (a masked title
//     costs a tap to reveal; a leaked one breaks the whole promise). Byte-identical to the worker's copy.
//     "(?:take|took|drop) the series" catches the SERIES-DECIDED reveal NBA/NHL/MLB playoff recaps lead with
//     when a best-of-seven is won or lost outright ("Celtics TAKE THE SERIES in six", "Nuggets took the
//     series", "Yankees DROP THE SERIES", "Astros dropped the series"): taking the series is winning it and
//     dropping it is losing it — a decisive winner/loser reveal — yet on its own it carries no digit for
//     SCORE_RX (the "… in six"/"… 4-2" tallies recaps append are what SCORE_RX catches) and matched no
//     existing keyword ("win"/"lose" fire on the verbs but "take"/"took"/"drop" did not), so a bare "… take
//     the series" leaked. It joins the series-CLINCH ("close out the series"), series-EQUALISER ("even the
//     series") and series-DECIDER ("force Game 7") siblings beside it as the outright win/loss twin. It is
//     pinned to the fixed "<verb> the series" frame — each verb immediately governing "the series" — so the
//     everyday senses of these common verbs ("take the field", "drop the ball", "take a look at the series")
//     pass through untouched. Its one benign over-match — a preview asking whether a side can take the series
//     — errs to the same over-hide-is-safe side as the siblings above. Byte-identical to the worker's copy.
//     "(?:hold…|held) (?:their|his|her|its) nerve" catches the HELD-COMPOSURE-TO-WIN reveal football,
//     cricket, golf and tennis recaps lead with when a side comes through a tense finish — a penalty
//     shootout, a fourth-innings chase, a final-round lead ("Arsenal HOLD THEIR NERVE on penalties",
//     "England held their nerve", "Djokovic holds his nerve in the fifth", "Nelly Korda holds her
//     nerve"): in a per-match title the idiom means nothing but keeping composure to see the result
//     through, so it names the side that came out on top, yet it carries no digit for SCORE_RX and
//     matched no existing keyword ("hold(s/ing)?[- ]?on"/"held[- ]?on" are the same protect-the-lead
//     family but never reached "… nerve"), so a bare "… hold their nerve" recap leaked. It is pinned
//     to the fixed "<hold-verb> <possessive> nerve" frame — a personal possessive (their/his/her/its),
//     never "the" — so the everyday non-result senses of "nerve" ("nerves of steel", "a test of
//     nerve", "showed real nerve") never fire, and the leading \b (plus "hold"'s own boundary) keeps
//     it out of "holders". Its one benign over-match — a preview asking whether a side can hold their
//     nerve — errs to the same over-hide-is-safe side as the siblings above (a masked title costs a
//     tap to reveal; a leaked one breaks the whole promise). Byte-identical to the worker's copy.
//     "victors" (plural) is the WINNER-NAMED reveal recaps reach for as a bare noun when they skip
//     the "win"/"victory"/"victorious" verbs the family already catches ("Arsenal run out comfortable
//     victors", "United emerge as victors on the night", "the victors march on"): it names the side
//     that came out on top just as plainly, yet on its own it carries no digit for SCORE_RX and
//     matched none of the win-family keywords beside it ("victorious" is the adjective, not this
//     noun), so a bare "… victors" recap leaked. Only the PLURAL is added — the singular "victor"
//     is a common given name (Victor Osimhen, Viktor) and would misfire on every scorer named so —
//     and "victors" as a surname is vanishingly rare, so its \b-anchored word match stays clear of
//     "evictors" and the like while never touching the singular. Its one benign over-match — a
//     preview asking who the victors will be — errs to the same over-hide-is-safe side as the
//     siblings above. Byte-identical to the worker's copy.
//     "(?:battl(?:e|es|ed|ing)|fight(?:s|ing)?|fought|grind(?:s|ing)?|play(?:s|ed|ing)?)[- ]to an?
//     (?:[\w-]+ )?draw" is the drawn-result sibling of "play out a draw"/"held to a … draw" beside it:
//     a recap that frames the stalemate as a fight for the point — "Everton battle to a draw at
//     Goodison", "Spurs and Arsenal play to a draw", "the sides fought to a goalless draw", "City
//     grind to a draw at the Etihad". It's the same level/draw reveal, yet the BARE form (no digits)
//     slips past SCORE_RX and past every existing draw idiom: "held to"/"settle for"/"play out"/"ends
//     in a draw" each need their own exact verb, none of which is "battle/fight/grind/play TO a draw".
//     Anchored so the battle-verb sits directly before "to a(n) … draw" (one optional modifier aside),
//     so "battle to get tickets", "fight to the finish", "draw your own conclusions", and "the draw for
//     the next round" all lack the "to a … draw" object and never fire. Any residual over-hide errs to
//     the over-hide-is-safe side. Byte-identical to the worker's copy.
//     "(?:falls?|fell)[- ]to(?!…)" is the losing-side sibling of "fall short" beside it, and the staple
//     US-headline form for a defeat: "Lakers fall to Celtics", "Djokovic falls to Alcaraz", "Rockies
//     fall to the Dodgers again". It names the loser — and therefore the winner — yet on its own carries
//     no digit for SCORE_RX and matched none of the beat/defeat/loss keywords ("fall short" needs the
//     "short" tail, which this form lacks). The negative lookahead is what keeps it clean: "fall/falls/
//     fell to" fires only when the object is NOT one of the everyday physical-collapse idioms —
//     "falls to his knees", "fell to the ground/floor/turf/canvas/mat/pitch", "fall to pieces/bits",
//     "fall to earth", "fall to their feet" — so an opponent name ("… to Celtics", "… to the Nuggets")
//     is the only thing left that trips it. Any residual over-hide errs to the over-hide-is-safe side.
//     Byte-identical to the worker's copy.
//   • "(?:go(?:es)?|going|went|gone)[- ]down[- ]to(?!…)" is the British-headline twin of "fall to"
//     beside it, and the everyday football/rugby/cricket way a defeat is written the other side of
//     the Atlantic: "Arsenal go down to Chelsea", "England went down to Australia", "Wales have gone
//     down to New Zealand". Like "fall to" it names the loser — and therefore the winner — yet carries
//     no scoreline for SCORE_RX and matched none of the beat/defeat/loss keywords. The verb set is
//     kept to go/goes/going/went/gone on purpose: "come/comes/came down to" is the close-finish preview
//     idiom ("it all comes down to the final day"), so it is deliberately NOT included. The negative
//     lookahead drops the benign "down to" continuations that reveal no result — the close-finish
//     "down to the wire"/"down to the last (kick/day)", the physical "down to earth", the red-card
//     "down to 10/nine men" (a different event, left to the red-card keywords), and the injury
//     "goes down to injury" — so an opponent name is the only thing left that trips it. Any residual
//     over-hide errs to the over-hide-is-safe side. Byte-identical to the worker's copy.
//   • "succumb(?:s|ed|ing)?[- ]to(?!…)" is the third member of the defeat-preposition family beside
//     "fall to" and "go down to" above, and the way a recap names the beaten side when it neither
//     carries a scoreline nor uses a beat/loss keyword: "Newcastle succumb to Liverpool", "England
//     succumbed to Australia", "Djokovic succumbs to Alcaraz". Like its two siblings it names the
//     loser — and therefore the winner. "succumb" is always the yielding side, so the only cleanup the
//     negative lookahead needs is the everyday non-result "succumb to <ailment>" report — the injury/
//     illness/pressure/fatigue continuations (with or without a leading a/an/the/possessive), plus the
//     common body-part knocks (hamstring/knee/ankle/…) — so an opponent name is the only thing left
//     that trips it. Any residual over-hide errs to the over-hide-is-safe side. Byte-identical to the
//     worker's copy.
//   • The "turnaround" alternative is the noun sibling of the "comeback" keyword above: a recap that
//     says a side "complete/stage/mount/produce/orchestrate/pull off a turnaround" is reporting a
//     came-from-behind result just as plainly as "comeback" does, yet the word itself was uncaught,
//     so only the ones that happened to also carry "stunning"/"dramatic" (via the stun\w* keyword)
//     were masked. The 0-3 filler token span lets an article/adjective sit between the verb and
//     "turnaround(s)" ("stage a remarkable turnaround", "produce a second-half turnaround"). Anchoring
//     to those completion verbs is what keeps the everyday scheduling sense out — a "quick turnaround"
//     or "short turnaround" between games has no such verb in front of it, so it never trips. Any
//     residual over-hide errs to the over-hide-is-safe side. Byte-identical to the worker's copy.
//   • The "<verb> (to the) (joint) top of the <table/league/…>" alternative is the standings-mover reveal: a
//     result that lifts a side to first place is reported as "Arsenal go top of the table", "Liverpool
//     move to the top of the Premier League", "Leeds storm to the top of the Championship", "Napoli sit
//     top of the league" — each names a completed result (the win that took them there, or the standings
//     that reflect prior wins) yet carries no scoreline for SCORE_RX and matched none of the win/lead
//     keywords ("leads?/leaders?" only fire on those exact words, not on "top of the table"). The optional
//     "joint " covers the level-on-points variant ("Arsenal go joint top of the table", "Spurs sit joint
//     top of the league"), which wedges "joint" between the verb and "top" and so slipped the bare form.
//     Anchoring
//     to a movement/position verb in front is what keeps the everyday preview use out — a "top of the
//     table clash" billing or a "who will finish top of the table?" question has no such verb before it,
//     so it never trips. Any residual over-hide errs to the over-hide-is-safe side. Byte-identical to
//     the worker's copy.
//   • The "<verb> … top spot / the summit / atop the table" alternative is the sibling of the "top of
//     the table" one right above, covering the two synonyms that phrasing misses: a first-place result
//     reported as "Arsenal reclaim top spot", "Liverpool return to top spot", "City climb to the
//     summit", "Napoli go back to the summit" or "Inter sit atop the table". Each names the standings
//     leader (the win that took them there) yet carries no scoreline for SCORE_RX and matched none of
//     the win/lead keywords, and the base branch above fires only on the literal "top of the <table>".
//     Same design: it is anchored to the very same movement/position verb family, so the preview use
//     stays out — "battle for top spot", "the race for top spot" and "who will reach the summit?" carry
//     no such verb-then-connective before the phrase, so none trips. Any residual over-hide errs to the
//     over-hide-is-safe side. Byte-identical to the worker's copy.
//   • "leapfrog(?:s|ged|ging)?" is the other standings-mover reveal, the sibling of the "top of the
//     table" alternative above: a result that vaults a side above a named rival in the table is reported
//     as "Arsenal leapfrog Spurs", "Leeds leapfrogged Norwich", "City leapfrogging their rivals" — each
//     names a completed result (the win that jumped them ahead) yet carries no scoreline for SCORE_RX and
//     matched none of the win/lead keywords. The stem "leapfrog" is essentially only ever a table-overtake
//     in a sports headline; its non-result senses (the children's game, the "LeapFrog" toy brand) never
//     surface in a scores/highlights feed, so the false-positive risk is negligible and any residual
//     over-hide errs to the over-hide-is-safe side. "(?:s|ged|ging)?" covers leapfrog/leapfrogs/
//     leapfrogged/leapfrogging; the plain "leap(s)"/"leaping" of a keeper's save shares no stem and
//     stays clean. Byte-identical to the worker's copy.
//   • The "<verb> (their/the) advantage" alternative is the sibling of the "leads?" keyword above: a
//     recap reports a second (or further) goal by saying a side "double/restore/extend/stretch/increase
//     their advantage" — "Chelsea double their advantage", "Arsenal restore their advantage", "City
//     extend their advantage". Each names a scoreline-moving result yet carries no digits for SCORE_RX,
//     and "advantage" (unlike "lead") matched no keyword, so the reveal was leaking. Anchoring to those
//     scoring verbs plus a possessive/"the" directly before "advantage" keeps the everyday non-result
//     sense out — "home advantage", "man advantage", "make home advantage count" and "who has the
//     advantage?" have no such verb-then-possessive in front of the bare word, so none trips. Any
//     residual over-hide errs to the over-hide-is-safe side. Byte-identical to the worker's copy.
//   • The "<N> points clear" alternative is the third standings-lead reveal, beside the "top of the
//     table" and "extend their advantage" ones above: a table-position result is routinely reported as
//     a numeric gap — "City go five points clear", "Arsenal now eight points clear at the top", "Rangers
//     one point clear of Celtic" — which names the leader and the margin (a standings spoiler) yet carries
//     no scoreline for SCORE_RX and matched none of the win/lead keywords ("leads?/leaders?" fire only on
//     those exact words). Anchoring to a number (digits or one–ten) directly before "point(s) clear" is
//     what keeps the everyday non-standings sense of "clear" out — "a clear chance", "clear favourites",
//     "clear the ball", "clear track ahead" have no count-then-"points" in front, so none trips; the
//     trailing \b keeps it off "clearance". Any residual over-hide errs to the over-hide-is-safe side.
//     Byte-identical to the worker's copy.
//   • The named-championship-trophy handover alternative is the sibling of the "lift/hoist the
//     world cup/trophy" keyword right before it, extended to the sport-specific trophies whose
//     proper names — not the generic word "trophy" — carry the reveal: the NHL's Stanley Cup, the
//     NFL's Lombardi, MLB's Commissioner's Trophy, the NBA's Larry O'Brien, golf's claret jug,
//     green jacket and Wanamaker. A title saying a side "hoist the Stanley Cup", "raise the Lombardi
//     Trophy", "lift the claret jug" or "slip on the green jacket" names the champion outright, yet
//     it carries no digits (SCORE_RX misses it) and the base keyword only knew "world cup"/"trophy",
//     so "Panthers hoist the Stanley Cup" leaked. Crucially the match is anchored to a possession
//     verb (lift/hoist/raise/capture/claim/secure/take/win, plus "slip on" for the jacket) directly
//     before the trophy name, so the everyday preview/feature framing that merely NAMES the trophy
//     with no handover — "Stanley Cup Final: how to watch", "the history of the green jacket",
//     "Commissioner's Trophy on display" — still passes through untouched, the same over-hide-is-safe
//     discipline the "advantage" clause above uses. Byte-identical to the worker's copy.
//   • The "march on" advancement alternative (next to "advanc\w*") is the knockout-round sibling of
//     the "book their place"/"through to the final" keywords: a side that "march(es) on" or "goes
//     marching on" has won and advanced ("Arsenal march on in the FA Cup", "Spurs go marching on",
//     "Djokovic marches on"), yet the phrase carries no digits (SCORE_RX misses it) and need name no
//     beat/win word, so a bare "Bayern march on" leaked. Anchored to the intransitive win idiom: a
//     negative lookbehind drops the everyday time-passing framing ("the season/tournament/time
//     marches on") and the fan-movement sense ("fans/supporters/crowd … marching on"), and a
//     negative lookahead drops "march on TO/towards/together" so the walk-to-the-ground phrasing
//     ("Fans keep marching on to the stadium") and the Leeds chant ("Marching on Together") stay
//     visible — that also forgoes the "march on to the semis" wording, which "advanc\w*"/"reach …
//     semis"/"into the … final" already cover. The trailing \b keeps "marches onto the pitch" clear.
//     A false positive here would drop a legit item from the worker's search results, not merely mask
//     a title, so the idiom is kept tight. Byte-identical to the worker's copy.
//   • The "rubber match/game" alternative (next to "take the series") is the series-decider sibling of
//     "take the series"/"close out series": a "rubber match" (or "rubber game") IS the deciding game of
//     a tied series, so a side that takes it has won the whole series ("Yankees take the rubber match",
//     "Astros took the rubber game in extras", "Mets claim the rubber game"). That outcome carries no
//     digits (SCORE_RX misses it) and named no existing token, so a bare series-decider recap leaked.
//     Anchored to a possession verb (take/took/claim) directly before "rubber match/game", so the
//     everyday preview framing that merely NAMES the fixture — "rubber match preview", "how to watch the
//     rubber match", "eye the rubber match tonight" — still passes through untouched, the same
//     over-hide-is-safe discipline the siblings above use. Byte-identical to the worker's copy.
//   • The "escape with a win/draw/point" alternative (next to "cling to a win/lead") is the
//     narrow-escape sibling of "grab a point"/"salvage"/"sees out a win": a side that "escapes with"
//     a result got out of a game with it intact, which reveals the outcome ("Chelsea escape with a
//     point at Anfield", "Bruins escaped with a win in OT", "United escape with a scrappy draw").
//     That carries no digits (SCORE_RX misses it) and named no existing token, so a bare escape recap
//     leaked. Gated on a result noun (win/victory/draw/point(s)/result) directly after "escape with"
//     — with one optional adjective ("a narrow win") — so the everyday non-result senses stay visible:
//     "escape with their lives", "escapes with minor injuries", "escape with a warning" all lack the
//     noun and pass through, the same tight, over-hide-is-safe discipline the siblings above use.
//     Byte-identical to the worker's copy.
//   • The "ice the game/win" alternative (next to "put the game away") is the North-American
//     seal-the-win sibling of "put the game to bed"/"put it beyond doubt": a side that "ices"
//     the game/win has closed it out late — the free-throw, empty-net or clock-killing move that
//     settles the result ("Curry ices the game from the line", "Empty-netter ices the win for
//     Boston", "Reaves iced the contest"). That carries no digits (SCORE_RX misses it) and named
//     no existing token, so a bare closeout recap leaked. Gated on a result noun
//     (game/match/win/victory/contest/result) directly after the "ice" verb, with a \b so the
//     "ice" inside prices/voices/services can't fire, and a negative lookbehind dropping the
//     literal-ice framings ("on the ice the game restarted", "hits the ice") — so the recovery,
//     rink and hockey-surface senses ("ice the injury", "ice hockey game", "ice bath before the
//     game", "called for icing the puck") all stay visible, the same tight, over-hide-is-safe
//     discipline the siblings above use. Byte-identical to the worker's copy.
//   • The "get one over on" alternative (right after "get the better of") is that clause's
//     beat-a-rival twin: to "get one over on" an opponent is to have beaten them, the derby/rivalry
//     result recap papers love ("Arsenal get one over on Spurs", "Hamilton gets one over on
//     Verstappen", "Celtics get one over on the Lakers"). It carries no digits (SCORE_RX misses it)
//     and named no existing token, so a bare rivalry-win recap leaked. Anchored to "one over on"
//     (the trailing "on" is what fixes the beat-a-rival sense — "get one over the line" and the like
//     never reach it) and guarded by the same (?<!\bto ) lookbehind the revenge/avenge clauses use,
//     so the instructional preview framing that always leads with "to" — "how to get one over on
//     your rivals", "looking to get one over on them" — stays visible. A bare "Can X get one over on
//     Y?" preview still hides, the same conservative over-hide the sibling clauses accept. Byte-identical
//     to the worker's copy.
//   • The "break of serve" clauses (right after "straight sets", its tennis neighbour) catch the sport's
//     defining result tell: in tennis a set is decided by breaks, so "Alcaraz breaks serve in the third",
//     "a decisive break of serve", "Swiatek broke Gauff's serve twice" each reveal who took control. The
//     phrase carries no digits (SCORE_RX misses it) and named no existing token, so a bare break recap
//     leaked. Two anchored forms: the verb "break(s)/breaking/broke … serve" (with an optional "back"/"the"/
//     possessive slot so "breaks back serve" and "breaks Sinner's serve" are caught) and the noun "break(s)
//     of serve". Both are pinned to the object "serve", which is what fixes the tennis sense — bare "break"
//     is a rain break, a break in play, a lunch break, none of which reach "serve" — and the leading \b keeps
//     "outbreak serves warning" out. "Held serve" is deliberately left visible: holding serve is the neutral,
//     expected outcome and reveals no result. Byte-identical to the worker's copy.
//   • "match[- ]?points?" (right after "break(s) of serve", its tennis neighbour) catches the deciding-point
//     reveal a racket-sport recap leans on: "Alcaraz saves match point", "Sinner fought off three match points",
//     "Swiatek down match point" each reveal the match reached its final, most-dramatic point — the same
//     late-drama tell "goes the distance"/"on penalties"/"extra time" already hide, and a "saves match point"
//     recap usually names the escaper as the eventual winner too. It carries no digits (SCORE_RX misses the bare
//     phrase) and matched no existing token, so a match-point recap leaked. The two-word compound is what fixes
//     the sense — the outer \b keeps it out of "rematch", "set point" is left alone (a set is not the match), and
//     "championship point" is deliberately skipped (it collides with "championship point guard" and the
//     season points-system sense). The lone benign collision — a rare "the match points to …" verb phrasing —
//     errs toward over-hiding, the app's safe default (a masked title costs one tap; a leaked one breaks the
//     whole promise). Byte-identical to the worker's copy.
//   • "serv(?:e|es|ed|ing)[- ]out … (?:set|match)" (right after "match[- ]?points?", its tennis neighbour)
//     catches the serve-out reveal a racket-sport recap leans on: "Sinner serves out the match", "Alcaraz
//     served out the opening set", "Djokovic serving out the match under pressure". In tennis a player who
//     serves out the set/match is winning the final game to close it out, so the phrase names who took the
//     set (or the match) just as plainly as "match point" does — yet it carries no digits (SCORE_RX misses
//     the bare phrase) and matched no existing token, so a serve-out recap leaked. It is pinned to the object
//     "set"/"match" (with an optional article + one adjective slot so "serves out a nervy set" / "the deciding
//     set" are caught), so the everyday "serve out a suspension/ban/contract/sentence/season" senses stay
//     visible; the trailing negative lookahead drops the lone "serve out a (one[- ])match ban" collision, the
//     leading \b keeps it out of "reserves out", and the -ing form only fires with the set/match object so a
//     "serving out of position" tactical note stays visible. "Held serve" (the neutral, expected outcome) and
//     "break of serve" (its own clause) are untouched. Byte-identical to the worker's copy.
//   • "restor(?:e|es|ed|ing)[- ]parity" (in the equaliser cluster, right before "equali[sz]") catches the
//     "restore parity" framing for an equaliser — the plainest way a soccer/hockey recap says a side scored to
//     level the game ("Spurs restore parity", "Canada restored parity in the second", "United restoring parity
//     late"). It reveals the same score-state leak "equalise"/"leveller"/"draws level" beside it already hides —
//     a goal went in and the game is level — yet carries no digits (SCORE_RX misses it) and named no existing
//     token: "equalise"/"leveller" never appear in it, and bare "parity" is far too common a preview/analysis
//     word to be a keyword on its own ("NFL parity on display", "pay parity", "competitive parity"). Anchoring
//     to the scoring verb "restore" (mirroring the sibling "restor…advantage" clause that covers extending a
//     lead) pins it to the equaliser sense and leaves those bare-"parity" senses visible. Any residual over-hide
//     errs to the over-hide-is-safe side (a masked title costs a tap to reveal; a leaked one breaks the whole
//     promise). Byte-identical to the worker's copy.
//   • "open(?:s|ed|ing)[- ]the[- ]scoring" (beside "deadlock", the 0-0 it breaks) catches the canonical recap
//     phrase for the first goal/points of a match — "Haaland opens the scoring", "Arsenal opened the scoring
//     inside five minutes", "Rashford opening the scoring for United". It reveals the score is no longer level
//     and which side struck first, yet it carries no digits (SCORE_RX misses it) and named no existing token.
//     It is pinned to the inflected forms only (opens/opened/opening) so the bare infinitive that every preview
//     and question uses — "who WILL open the scoring", "can X open the scoring", "hoping TO open the scoring" —
//     stays visible; a leading (?<!\bwho[- ]) drops the one present-tense preview shape ("who opens the
//     scoring?") that the inflected forms would otherwise let through. Byte-identical to the worker's copy.
//   • "(?:match|game)[- ]?winn(?:er|ers|ing)" (right after "victors", beside the bare "winners?"/"winning"
//     tokens it backstops) catches the CLOSED-compound spelling of the winning-goal reveal — "matchwinner",
//     "matchwinners", "matchwinning", "gamewinner", "gamewinning" — that fan-channel highlight titles write
//     without a separator ("MATCHWINNER! Saka strikes late", "Tatum's gamewinner"). The hyphenated and spaced
//     forms ("match-winner", "match winner", "match-winning") already matched, because the bare "winners?"/
//     "winning" tokens sit behind the word boundary the hyphen/space supplies; the one-word spelling has no
//     boundary before "winn…", so \bwinners? could not fire inside it and the compound leaked with no digits
//     for SCORE_RX to catch. A matchwinner/gamewinner is by definition the scorer of the deciding goal or
//     basket, so the phrase names a result outright and carries no non-result sense to false-positive on (the
//     "the winner will be announced" / raffle "game winner" senses never spell the closed sports compound).
//     Byte-identical to the worker's copy.
//   • The lead-taking goal reveal (right before the "go-ahead goal" alternative it sits beside): a striking
//     or heading verb that puts a side "ahead" / "in front" / "into the lead" — "Haaland fires City ahead",
//     "Kane heads United in front", "Salah drives Liverpool into the lead", "Bruno rifles United into a 2-1
//     lead". These name a scoreline change (who scored, who is now up) just as plainly as "go-ahead goal"
//     does, yet the scoreless spellings carried no digits for SCORE_RX and used none of the win/lead
//     keywords, so they leaked. The verb set is pinned to ball-striking/heading actions (fire/head/nod/slot/
//     tap/tuck/curl/rifle/lash/prod/poke/bundle/steer/volley/sweep, plus the ubiquitous "put") — verbs that
//     carry no business or preview reading — and the 0-3 filler span lets the scoring side's name sit between
//     the verb and the destination ("puts Newcastle ahead", "steers PSG in front"). Two negative lookaheads
//     drop the idioms that share the surface: "ahead of" / "in front of" — the preview "ahead of kickoff",
//     the standings "ahead of United", the crowd "in front of a sellout", the chance "in front of goal" — so
//     only the lead-change sense is left to trip it. Any residual over-hide errs to the over-hide-is-safe
//     side. Byte-identical to the worker's copy.
//   • "(?:reduc…|down)[- ]to[- ](?:nine|ten|9|10)[- ]men" (right after "marching[- ]orders", beside the
//     red-card family it joins) catches the dismissal reveal in the "a side is a player short" phrasing —
//     "Arsenal reduced to ten men", "United reduced to 10 men at the break", "the red card reduced City to
//     nine men", "Chelsea down to ten men". It is the same match-event partial-result leak the noun "red
//     card" and the verbs "sent off"/"sees red"/"marching orders" already hide, yet it names no existing
//     token and carries no digits when spelled "ten"/"nine" (SCORE_RX misses those). The gap was left open
//     on purpose: the "go[- ]down[- ]to" LOSS branch above carries a negative lookahead that deliberately
//     drops "…down to (ten|nine|…) men" — because "go down to ten men" does NOT mean a side lost the match —
//     but no branch was ever added to catch the dismissal it describes, so it leaked. The count is pinned to
//     nine/ten/9/10 (a full XI is eleven; two reds make nine) so the neutral "ten-man squad"/"ten-man
//     rotation"/basketball "ten-man rotation" senses — which never take the "reduced/down TO … men" verb
//     frame — stay visible, and the 0-2 filler on the "reduc…" verb lets the shorted side's name sit between
//     the verb and "to" ("reduce Barca to ten men") while the bare "down" arm stays contiguous. Any residual
//     over-hide errs to the over-hide-is-safe side. Byte-identical to the worker's copy.
//   • "(?:end|snap|halt|break…)(?:\s+[\w'’.-]+){0,3}?\s+skid\b" (right after the reversed "drought" clause,
//     joining the streak/drought family) catches the North-American losing-streak-broken idiom — "Heat snap
//     the skid", "Knicks snap four-game skid", "Oilers end their skid", "Jets break the skid". A team that
//     "snaps"/"ends"/"halts"/"breaks" its skid has just WON to end a losing run, the same result reveal the
//     sibling "snap … losing streak" (caught via the "losing" token) and the "…drought" clause already hide,
//     yet "skid" is its own American synonym that named no existing token and carries no digits (SCORE_RX
//     misses it), so a bare "snap the skid" recap leaked. Pinned to the same end/snap/halt/break verb family +
//     up-to-three-word filler the drought clause uses, with the object anchored to "skid\b": the literal-skid
//     senses that never take that verb frame — a car that "skids into the wall", "skid marks", "puts the skids
//     under", a team "on the skids" — all stay visible. A preview question ("can the Heat end their skid?")
//     over-hides, the same conservative over-hide the "losing streak" sibling already accepts. Byte-identical
//     to the worker's copy.
//   • "(?:captur…|unif…|wrest…|rip…|strip…|(?:re)?claim…|lift…|hoist…|snatch…) … belts?" (right after the
//     gold/silver/bronze medal clause, joining the trophy-hardware family) catches the combat-sports title
//     changing hands — in boxing and MMA the championship IS the belt, so "Usyk captures the heavyweight
//     belt", "Fury unifies the belt", "Inoue claims the undisputed belt", "Taylor rips the belt from Serrano"
//     each reveal the winner of a title fight the way "reclaim the crown" already does for other sports, yet
//     "belt" named no existing token and carries no digits (SCORE_RX misses it). The sibling win/retain
//     tokens ("wins"/"retain") already hid "wins the belt"/"retains the belt"; this adds the belt-specific
//     verbs they miss. Two guards keep it tight: only INFLECTED forms are listed (captures/captured/capturing,
//     not the bare "capture"), so a bare-infinitive preview — "Can Jones capture the belt?", "Usyk aims to
//     unify the belt", "who will claim the vacant belt?" — stays visible, exactly like the "<strike> home"
//     clause; and the object is anchored to "belts?\b" no more than two filler words after the verb, so the
//     everyday senses that never take that verb frame ("conveyor belt of chances", "seatbelt", "green belt",
//     "the belt is on the line", "how to watch the belt fight") all stay visible. Byte-identical to the
//     worker's copy.
const SPOILER_RX = /\b(walk[- ]?off|walk(?:s|ed|ing)?[- ]?it[- ]?off|buzzer[- ]?beaters?|comeback|(?:come|comes|came)[- ]from[- ]behind|(?:complet(?:e|es|ed|ing)|stag(?:e|es|ed|ing)|mount(?:s|ed|ing)?|produc(?:e|es|ed|ing)|orchestrat(?:e|es|ed|ing)|pull(?:s|ed|ing)?[- ]?off)(?:[- ][\w'’-]+){0,3}?[- ]turnarounds?|(?:come|comes|came)[- ]from(?:[- ](?:an?|\d{1,2}|one|two|three|four|five|six))?(?:[- ](?:goals?|sets?|points?|runs?|scores?))?[- ]down\b|(?:storm|roar|claw)(?:s|ed|ing)?[- ]?back|battl(?:e|es|ed|ing)[- ]?back|peg(?:s|ged|ging)?[- ]?back|(?:pulls?|pulled|pulling|grabs?|grabbed|grabbing) (?:one|a goal|another) back|fight(?:s|ing)?[- ]?back|fought[- ]?back|rall(?:y|ies|ied|ying) (?:past|back|from)|(?:overturn(?:s|ed|ing)?|overhaul(?:s|ed|ing)?|wip(?:e|es|ed|ing)[- ]?out|eras(?:e|es|ed|ing))(?: [\w'’-]+){0,4}? deficit|(?:cut(?:s|ting)?|halv(?:e|es|ed|ing)|reduc(?:e|es|ed|ing)|trim(?:s|med|ming)?|slash(?:es|ed|ing)?)(?: [\w'’-]+){0,3}? (?<!(?:budget|trade|fiscal|spending|wage|wages|federal|national|structural) )deficit|extra[- ]?innings?|overtime|extra[- ]?time|sudden[- ]?death|golden[- ]?(?:goals?|points?)|stun|stuns|stunned|stunning|stunner|shock|shocks|shocked|shocking|crush\w*|outlast\w*|outclass\w*|outplay\w*|overpower\w*|overwhelm\w*|outgun\w*|outmuscl\w*|outduel\w*|outscor\w*|outpoint\w*|outbox\w*|outfight\w*|outfought|prevail\w*|surviv\w*|relegat\w*|(?:secur\w*|earn\w*|seal\w*|clinch\w*|gain\w*|confirm\w*|achiev\w*|complet\w*|celebrat\w*|win|won)(?:[- ][\w'’-]+){0,3}?[- ]promotion\b|promot(?:ed|ion)[- ](?:to|into|back[- ]to|straight[- ]back[- ]to)[- ](?:the[- ])?(?:[\w'’-]+[- ]){0,3}?(?:league|division|flight|tier|premier|championship|serie[- ]a|bundesliga|la[- ]liga|eredivisie)|overcome|overcomes|overcoming|overcame|dominat\w*|dominant(?:ly)?|defeat\w*|beat\w*|edge\w*|pip(?:s|ped|ping)?|dispatch\w*|(?:takes?|taking|took) down|sinks?|sank|sunk|(?<!ups and )downs|downed|holds?[- ]?off|held[- ]?off|hold(?:s|ing)?[- ]?on|held[- ]?on|hang(?:s|ing)?[- ]?on|hung[- ]?on|(?:cling(?:s|ing)?|clung)[- ]?on|(?:cling(?:s|ing)?|clung)[- ]?to (?:a |an |the |their |his |her |its )?(?:[\w'’-]+ )?(?:win|victory|lead|advantage|points?|result)|(?:hold(?:s|ing)?|held)[- ]out[- ]for (?:a |an |the |their )?(?:[\w'’-]+ )?(?:win|victory|draw|points?|result|lead)|escap(?:e|es|ed|ing)[- ]with (?:a |an |the |their )?(?:[\w'’-]+ )?(?:win|victory|draw|points?|result)|(?:hold(?:s|ing)?|held)[- ](?:their|his|her|its)[- ]nerve|(?:sees?|saw|seen|seeing) out (?:a |an |the )?(?:[\w-]+ )?(?:win|victory|result|points?|lead)|sees?[- ]?off|saw[- ]?off|fends?[- ]?off|fended[- ]?off|rout|routs|routed|top(?:s|ped)|toppl\w*|trounc\w*|demoli(?:sh\w*|tions?)|destroy\w*|dismantl\w*|humiliat\w*|embarrass\w*|capitulat\w*|choke\w*|collaps\w*|obliterat\w*|annihilat\w*|decimat\w*|vanquish\w*|pulveri[sz]\w*|thrash\w*|thump\w*|pummel\w*|steamroll\w*|drub\w*|smash\w*|wallop\w*|spank\w*|maul\w*|clobber\w*|shellac\w*|overrun\w*|overran|nil(?:led|ling)|brush(?:es|ed|ing)?[- ]?aside|swat(?:s|ted|ting)?[- ]?aside|(?:blow(?:s|n)?|blew)[- ]away(?![- ](?:the[- ])?cobwebs\b)|(?:runs?|running|ran) (?:riot|rampant)|(?:runs?|running|ran)[- ]?away[- ]?with|(?:runs?|running|ran) rings (?:a)?round|to the sword|(?:tak(?:e|es|ing)|took|claim(?:s|ed|ing)?)[- ]?(?:the[- ]?)?che(?:ck|qu)ered[- ]?flag|cross(?:es|ed|ing)?[- ]?(?:the[- ]?)?(?:finish[- ]?)?line[- ]?first|podium[- ]?finish(?:es)?|(?:laps|lapped|lapping)[- ]the[- ]field|wire[- ]to[- ]wire|hammer(?:ed|ing)|batter(?:ed|ing)|cruise(?:s|d)?|canter(?:s|ed|ing)?|pull(?:s|ed|ing)?[- ]?away|pull(?:s|ed|ing)?[- ]?clear|(?:makes?|made|making) (?:light|hard|short) work of|prov(?:e|es|ed|ing) too (?:strong|good|much)|(?:ha(?:ve|s|d)|having) too much (?:class |quality |firepower |pace |power |strength )?for|too (?:good|strong) for(?! (?:words|comfort)\b)|(?:gets?|getting|got) the better of|(?<!\bto )(?:get(?:s|ting)?|got)[- ]one[- ]over[- ]on\b|(?:(?:gets?|getting|got) the )?job done|(?:gets?|getting|got) over the line|put(?:s|ting)?[- ]?(?:the |this |that )?(?:game|tie|match|contest|result|series|final|derby|affair)s? to bed|put(?:s|ting)?[- ]?(?:the |this |that )?(?:game|tie|match|contest|result|series|final|derby)s? away|(?<!\b(?:the|on|onto|hit|hits|hitting)[- ])\bic(?:e|es|ed|ing)[- ](?:the[- ])?(?:game|match|win|victory|contest|result)|put(?:s|ting)?[- ](?:it[- ]on[- ]ice\b|(?:the|this|that|their)[- ](?:[\w'’-]+[- ])?(?:game|match|tie|contest|result|series|win|victory|lead)[- ]on[- ]ice\b)|put(?:s|ting)?[- ]?(?:the |this |that |it |a |an )?(?:[\w'’-]+ )?(?:beyond (?:all )?(?:doubt|reach)|out of (?:sight|reach))|(?:grind(?:s|ing)?|ground)[- ]?out (?:a |an |the )?(?:win|victory|result|draw|points?)|ek(?:e|es|ed|ing)[- ]?out (?:a |an |the )?(?:win|victory|result|draw|points?)|(?:eas(?:e|es|ed)|power(?:s|ed)?|breez(?:e|es|ed)|coast(?:s|ed)?|sail(?:s|ed)?|stroll(?:s|ed)?|glid(?:e|es|ed)|waltz(?:es|ed)?|roll(?:s|ed)?|blow(?:s|n)?|blew|battl(?:e|es|ed|ing)|grind(?:s|ing)?|ground|get(?:s|ting)?|got)[- ]?past|(?:sneak(?:s|ed)?|snuck|slip(?:s|ped)?|squeez(?:e|es|ed))[- ]?past|squeak(?:s|ed|ing)?[- ]?(?:past|by|through)|scrap(?:e|es|ed|ing)[- ]?(?:past|by|through)|(?:put(?:s|ting)?|stick(?:s|ing)?|stuck|slam(?:s|med|ming)?|bang(?:s|ed|ing)?|slot(?:s|ted|ting)?|rifle(?:s|d)?|fire(?:s|d)?|bur(?:y|ies|ied)) (?:\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten) past|(?:the|a|their)[- ](?:league[- ]|domestic[- ]|season(?:['’]s)?[- ])?double[- ]over\b|leapfrog(?:s|ged|ging)?|triumph\w*|romp\w*|conquer\w*|dethron\w*|reign(?:s|ed|ing)?[- ]supreme|(?:go|goes|going|went|gone)[- ]back[- ]?to[- ]?back\b(?![- ]?(?:games?|nights?|road|home|away|fixtures?|sets?|weekends?|weeks?|days?|matches|contests?|series|losses|defeats?|wins?|victories|outings?|starts?|clean[- ]?sheets?|shut[- ]?outs?))|(?:end(?:s|ed|ing)?|halt(?:s|ed|ing)?)(?:[- ][\w'’-]+){0,2}?[- ](?:their|its|his|her|[\w'’-]+['’]s)[- ](?:[\w'’-]+[- ])?reign\b|(?<!\bto )(?:gets?|getting|got|gains?|gaining|gained|exacts?|exacting|exacted|takes?|taking|took)(?:[- ][\w'’-]+){0,3}?[- ]revenge\b|(?<!\bto )aveng(?:e|es|ed|ing)\b|upset\w*|upend\w*|(?:spoil(?:s|ed|t|ing)?|ruin(?:s|ed|ing)?)[- ]?(?:the|their|[\w'’-]+['’]s)[- ]?(?:party|homecoming|return|debut|farewell|reunion|swan[- ]?song)|clinch\w*|seals?|sealed|snatch\w*|nick(?:s|ed|ing)?[- ]?(?:it|the (?:win|points?|lead|victory|title|tie)|an? (?:win|winner|point|victory|late (?:winner|goal))|all[- ]?three[- ]?points)|(?:steals?|stealing|stole|stolen)[- ]?(?:it|the (?:win|points?|lead|victory|title|tie)|an? (?:win|winner|point|victory|late (?:winner|goal))|all[- ]?three[- ]?points)|shad(?:e|es|ed|ing)[- ](?:it|(?:the|this|that)[- ](?:[\w'’-]+[- ])?(?:set|sets|game|games|frame|frames|leg|legs|round|rounds|opener|decider|contest|match|tie|fight|bout|series|final))|sweep\w*|swept|whitewash\w*|clos(?:e|es|ed|ing)[- ]?out(?: the| a| their| its)? series|oust\w*|eliminat\w*|bow(?:s|ed|ing)?[- ]?out|crash(?:es|ed|ing)?[- ]?out|dump(?:s|ed|ing)?[- ]?out|bundl(?:e|es|ed|ing)?[- ]?out|(?:knock|dump|bundl|boot)\w* (?:[\w'’.-]+ ){1,4}out of (?:the |their |any |all )?(?:[\w'’.-]+ ){0,2}(?:cup|competition|tournament|tourney|play[- ]?offs?|post[- ]?season|semi[- ]?finals?|semis?|quarter[- ]?finals?|quarters?|world[- ]?cup|champions[- ]?league|europ[ae]|last[- ]?(?:32|16|8|4|sixteen|eight|four)(?!\s+(?:third|minutes?|mins?|seconds?|secs?|games?|matches|weeks?|days?|overs?|balls?|laps?|holes?|rounds?|innings?|men|places?)))|knock(?:s|ed|ing)[- ]?out|knock out|knock(?:s|ed|ing)? off|(?:sends?|sent)(?:[- ][\w'’-]+){0,3}?[- ]packing\b|qualif(?:y|ies|ied)|advanc\w*|(?<!(?:season|campaign|tournament|competition|time|show|world|life|year|band|war|army|parade|fans?|supporters?|crowd|faithful)[- ])\bmarch(?:es|ed|ing)?[- ]on\b(?![- ]?(?:to|toward|towards|together)\b)|book(?:s|ed)? (?:(?:their|its|a|his|her) (?:place|spot|berth|ticket|passage)|(?:place|spot|berth|passage))|book(?:s|ed)? (?:(?:their|its|a|his|her)[- ])?(?:(?:grand[- ]?)?final|semi[- ]?finals?|semis?|quarter[- ]?finals?|quarters?|last[- ]?(?:32|16|8|4|sixteen|eight|four)|play[- ]?offs?)[- ](?:place|spot|berth|passage)|punch(?:es|ed)? (?:their|its|a|his|her) ticket|reach(?:es|ed|ing)? (?:the )?(?:finals?|semi[- ]?finals?|semis?|quarter[- ]?finals?|quarters?|last[- ]?(?:32|16|8|4|sixteen|eight|four)(?!\s+(?:third|minutes?|mins?|seconds?|secs?|games?|matches|weeks?|days?|overs?|balls?|laps?|holes?|rounds?|innings?|men|places?)))(?!\s+third)|through to (?:the )?(?:finals?|semi[- ]?finals?|semis?|quarter[- ]?finals?|quarters?|last[- ]?(?:32|16|8|4|sixteen|eight|four)(?!\s+(?:third|minutes?|mins?|seconds?|secs?|games?|matches|weeks?|days?|overs?|balls?|laps?|holes?|rounds?|innings?|men|places?)))(?!\s+third)|into (?:the )?(?:finals?|semi[- ]?finals?|semis?|quarter[- ]?finals?|quarters?|last[- ]?(?:32|16|8|4|sixteen|eight|four)(?!\s+(?:third|minutes?|mins?|seconds?|secs?|games?|matches|weeks?|days?|overs?|balls?|laps?|holes?|rounds?|innings?|men|places?)))(?!\s+third)|progress(?:es|ed|ing)? (?:to |into |through to )?(?:the )?(?:finals?|semi[- ]?finals?|semis?|quarter[- ]?finals?|quarters?|last[- ]?(?:32|16|8|4|sixteen|eight|four)(?!\s+(?:third|minutes?|mins?|seconds?|secs?|games?|matches|weeks?|days?|overs?|balls?|laps?|holes?|rounds?|innings?|men|places?)))(?!\s+third)|(?:reach(?:es|ed|ing)?|through to|progress(?:es|ed|ing)?(?: to| into| through to)?|(?:eas(?:e|es|ed)|breez(?:e|es|ed)|glid(?:e|es|ed)|sail(?:s|ed)?|waltz(?:es|ed)?|stroll(?:s|ed)?|coast(?:s|ed)?|saunter(?:s|ed)?|power(?:s|ed)?|storm(?:s|ed)?) into) (?:the )?next round(?! of (?:talks|negotiations|funding|fundraising|voting|votes?|interviews?|applications?|layoffs?|redundancies|job cuts|tariffs?|sanctions?|testing|tests?|fixtures|games|matches))|set(?:s|ting)?[- ]?up (?:a |an |the |their |his |her |its )?(?:[\w'’-]+ ){0,3}?(?:(?:(?:grand[- ]?)?final|semi[- ]?finals?|semis?|quarter[- ]?finals?|quarters?|last[- ]?(?:32|16|8|4|sixteen|eight|four))(?: (?:showdown|clash|rematch|meeting|tie|decider|encounter))?|showdown|clash|rematch|tie|decider) (?:with|against|versus|vs)|crowned (?:world )?champions?|world[- ]?(?:cup[- ]?)?champions?|(?:lift|hoist)(?:s|ed|ing)? (?:the )?(?:[\w'’-]+ ){0,2}?(?:world[- ]?cup|trophy|cup\b|silverware)|(?:lift(?:s|ed|ing)?|hoist(?:s|ed|ing)?|rais(?:e|es|ed|ing)|captur(?:e|es|ed|ing)|(?:re)?claim(?:s|ed|ing)?|secur(?:e|es|ed|ing)|tak(?:e|es|ing)|took|win|wins|won|slip(?:s|ped)? on) (?:the |a |their )?(?:stanley[- ]?cup|claret[- ]?jug|green[- ]?jacket|larry[- ]?o['’]?brien(?: trophy)?|lombardi(?: trophy)?|wanamaker(?: trophy)?|commissioner['’]?s trophy)|(?:re)?claim(?:s|ed|ing)? (?:the )?(?:title|crown|trophy|championship|pennant|silverware)|(?:(?:re)?claim(?:s|ed|ing)?|tak(?:e|es|ing)|took|secur(?:e|es|ed|ing)|captur(?:e|es|ed|ing)|land(?:s|ed|ing)?|bag(?:s|ged|ging)?|pocket(?:s|ed|ing)?|scoop(?:s|ed|ing)?|lift(?:s|ed|ing)?|hoist(?:s|ed|ing)?)(?:[- ][\w'’-]+){0,3}?[- ](?:title|crown)s?(?!\s*(?:of|bout|fight|clash|race|shot|tilt|eliminator|showdown|decider|defen[cs]e|picture|hopes|challenge|contention|contenders?|holders?|hopefuls?|dream|charge|push|bid|run[- ]?in|jewel|hunt|chase|aspirations?|ambitions?|credentials?|favou?rites?|odds|pedigree))|(?:storm|surg|roar|power|march|charg|dash|sprint|glid|blaz|thunder|romp|waltz|saunter|canter|roll|bulldoz|eas|breez)(?:e|es|ed|ing|s)?[- ]to (?:the |a |an |their |his |her |its )?(?:title|crown|championships?|scudetto|pennant|glory|three[- ]?peat)(?!\s*(?:bout|fight|clash|race|shot|tilt|eliminator|showdown|decider|defen[cs]e|picture|hopes|challenge|contention|contenders?|holders?|hopefuls?|dream|charge|push|bid|run[- ]?in))|wrap(?:s|ped|ping)?[- ]?up (?:the |a |an |their )?(?:[\w'’-]+ ){0,2}?(?:title|crown|trophy|championship|pennant|silverware|scudetto|series|sweep|win|victory)|(?:claim|claims|claimed|claiming|take|takes|taking|took|secure|secures|secured|grab|grabs|grabbed|bag|bags|bagged|scoop|scoops|scooped|strike|strikes|struck) (?:the |a |an )?(?:gold|silver|bronze)(?!\s*coast)(?:[- ]?medals?)?(?![-\w])|(?:captur(?:es|ed|ing)|unif(?:ies|ied|ying)|wrest(?:s|ed|ing)|rip(?:s|ped|ping)|strip(?:s|ped|ping)|(?:re)?claim(?:s|ed|ing)|lift(?:s|ed|ing)|hoist(?:s|ed|ing)|snatch(?:es|ed|ing))[- ](?:the[- ]|a[- ]|his[- ]|her[- ]|their[- ])?(?:[\w'’-]+[- ]){0,2}?belts?\b|(?:end|ends|ended|ending|snap|snaps|snapped|snapping|halt|halts|halted|halting|break|breaks|breaking|broke|broken)(?:\s+[\w'’.-]+){0,3}?\s+(?:unbeaten|unbeatable|winless|perfect|flawless)[- ]?(?:run|streak|start|record)|(?:unbeaten|unbeatable|winless|perfect|flawless)[- ]?(?:run|streak|start|record)(?:\s+[\w'’.-]+){0,2}?\s+(?:ends?|ended|ending|over|snapped|halted|broken|done)|(?:end|ends|ended|ending|snap|snaps|snapped|snapping|halt|halts|halted|halting|break|breaks|breaking|broke|broken)(?:\s+[\w'’.-]+){0,3}?\s+drought\b|drought(?:\s+[\w'’.-]+){0,2}?\s+(?:ends?|ended|ending|over|snapped|halted|broken)|(?:end|ends|ended|ending|snap|snaps|snapped|snapping|halt|halts|halted|halting|break|breaks|breaking|broke|broken)(?:\s+[\w'’.-]+){0,3}?\s+skid\b|(?:makes?|making|made)[- ]it[- ](?:\d{1,2}|two|three|four|five|six|seven|eight|nine|ten)[- ](?:in[- ]a[- ]row|straight|on[- ]the[- ](?:trot|bounce|spin))|(?:go(?:es|ing)?|went|gone|mov(?:e|es|ed|ing)|climb(?:s|ed|ing)?|jump(?:s|ed|ing)?|leap(?:s|ed|t|ing)?|ris(?:e|es|ing)|rose|risen|surg(?:e|es|ed|ing)|storm(?:s|ed|ing)?|vault(?:s|ed|ing)?|shot|sit(?:s|ting)?|sat|stay(?:s|ed|ing)?|remain(?:s|ed|ing)?|return(?:s|ed|ing)?)[- ](?:back[- ])?(?:up[- ])?(?:to[- ](?:the[- ])?)?(?:joint[- ])?top[- ]of[- ](?:the[- ])?(?:table|league|standings|pile|tree|log|ladder|division|premier[- ]?league|championship|bundesliga|eredivisie|serie[- ]a|la[- ]liga|conference)|(?:go(?:es|ing)?|went|gone|mov(?:e|es|ed|ing)|climb(?:s|ed|ing)?|jump(?:s|ed|ing)?|leap(?:s|ed|t|ing)?|ris(?:e|es|ing)|rose|risen|surg(?:e|es|ed|ing)|storm(?:s|ed|ing)?|vault(?:s|ed|ing)?|shot|sit(?:s|ting)?|sat|stay(?:s|ed|ing)?|remain(?:s|ed|ing)?|return(?:s|ed|ing)?|reclaim(?:s|ed|ing)?)[- ](?:back[- ])?(?:up[- ])?(?:(?:to[- ])?top[- ]spot|(?:to[- ])?the[- ]summit|atop[- ](?:the[- ])?(?:table|league|standings|pile|division))|(?:doubl(?:e|es|ed|ing)|restor(?:e|es|ed|ing)|extend(?:s|ed|ing)?|stretch(?:es|ed|ing)?|increas(?:e|es|ed|ing))[- ](?:their|his|her|its|the)[- ]advantage|(?:\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten)[- ]points?[- ]clear\b|leads?|leaders?|winning|winners?|wins|won|win|victory|victories|victorious|victors|(?:match|game)[- ]?winn(?:er|ers|ing)|(?:comes?|came)[- ]?out on top|(?:ha(?:ve|s|d|ving)|got|get(?:s|ting)?) the last laugh|losing|lose|loses|lost|loss|(?:comes?|came)[- ]?up[- ]?short|(?:falls?|fell)[- ]?short|(?:falls?|fell)[- ]to(?![- ](?:(?:his|her|their|its|the)[- ])?(?:knees|feet|floor|ground|turf|pitch|deck|ice|canvas|mat|grass|dirt|mud|snow|earth|pieces|bits|silence)\b)|(?:go(?:es)?|going|went|gone)[- ]down[- ]to(?![- ](?:(?:the[- ])?(?:wire|last|earth)|(?:\d{1,2}|ten|nine|eight|seven|six)[- ]?men|injur\w*)\b)|succumb(?:s|ed|ing)?[- ]to(?![- ](?:a[- ]|an[- ]|the[- ]|his[- ]|her[- ]|their[- ]|its[- ])?(?:injur\w*|knock|strain|illness|disease|cancer|virus|infection|fever|wound\w*|pressure|nerves|fatigue|exhaustion|cramp\w*|temptation|heat|conditions|elements|hamstring|knee|ankle|groin|calf|thigh|quad\w*|shoulder|concussion|setback|problem)\b)|hat[- ]?tricks?|braces?|(?:scor(?:e|es|ed|ing)|net(?:s|ted|ting)?|slot(?:s|ted|ting)?|fir(?:e|es|ed|ing)|convert(?:s|ed|ing)?)[- ](?:twice|thrice|three[- ]times|four[- ]times)|(?:triple|double)[- ]?doubles?|no[- ]?hitter|perfect[- ]?games?|empty[- ]?net(?:s|ter|ters)?|shut[- ]?outs?|\d{1,3}[- ]?unanswered|unanswered[- ]?(?:points?|runs?|goals?|scores?|buckets?)|(?:\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten)(?:[- ](?:goals?|tries|try|points?|runs?|scores?|buckets?))? without (?:a |any )?reply|blow[- ]?outs?|shoot[- ]?outs?|straight[- ]?sets?|\b(?:break(?:s|ing)?|broke)[- ](?:back[- ]|the[- ]|[\w'’-]+['’]s[- ])?serve\b|\bbreaks?[- ]of[- ]serve\b|match[- ]?points?|\bserv(?:e|es|ed|ing)[- ]out[- ](?:a[- ]|an[- ]|the[- ]|his[- ]|her[- ]|their[- ])?(?:[\w'-]+[- ])?(?:set|match)\b(?![- ](?:ban|bans|suspension|suspensions))|on penalt(?:ies|y kicks)|goalless|scoreless|blank(?:s|ed|ing)|\d{1,2}[- ]?nil|nil[- ]?(?:\d{1,2}|nil|all)|clean[- ]?sheets?|deadlock\w*|stalemate\w*|(?<!\bwho[- ])open(?:s|ed|ing)[- ]the[- ]scoring|salvag\w*|rescu\w*|consolat\w*|(?:claim(?:s|ed|ing)?|tak(?:e|es|ing)|took) the spoils|(?:claim(?:s|ed|ing)?|tak(?:e|es|ing)|took) the honou?rs|(?:claim(?:s|ed|ing)?|tak(?:e|es|ing)|took|secur(?:e|es|ed|ing)|earn(?:s|ed|ing)?|grab(?:s|bed|bing)?|bag(?:s|ged|ging)?|pocket(?:s|ed|ing)?|collect(?:s|ed|ing)?|pick(?:s|ed|ing)?[- ]?up) (?:the )?maximum points|(?:tak(?:e|es|ing)|took|claim(?:s|ed|ing)?|grab(?:s|bed|bing)?|collect(?:s|ed|ing)?|pocket(?:s|ed|ing)?|scoop(?:s|ed|ing)?)[- ]the[- ]points\b|(?:claim(?:s|ed|ing)?|tak(?:e|es|ing)|took|earn(?:s|ed|ing)?)(?:[- ][\w'’-]+){0,3}?[- ]bragging[- ]?rights|bragging[- ]?rights(?:[- ][\w'’-]+){0,2}?[- ](?:go|goes|went|belong(?:s|ed)?)[- ]to|share(?:s|d)?(?: of)? the spoils|share(?:s|d)? the points|share(?:s|d)? the honou?rs|(?:spoils|points|honou?rs) (?:were |are |fairly |evenly |duly )?shared|a point (?:apiece|each)|\b(?:com(?:e|es|ing)|came)[- ]away[- ](?:with[- ](?:(?:just[- ]|only[- ]|merely[- ])?a[- ](?:single[- ])?point|the[- ]points|nothing)|empty[- ]?handed)\b(?![- ](?:to[- ]prove|to[- ]make))|honou?rs even|held to an? (?:[\w-]+ )?draw|(?:ends?|ended|ending) in an? (?:[\w-]+ )?draw|(?:ends?|ended|ending|finish(?:es|ed|ing)?)[- ](?:all[- ]|dead[- ]|honou?rs[- ])?level\b|play(?:s|ed|ing)?[- ]?out an? (?:[\w-]+ )?draw|(?:battl(?:e|es|ed|ing)|fight(?:s|ing)?|fought|grind(?:s|ing)?|play(?:s|ed|ing)?)[- ]to an? (?:[\w-]+ )?draw|settl(?:e|es|ed|ing)[- ]?(?:it\b|the[- ](?:tie|match|game|contest|series|final|derby|affair)s?)|settl(?:e|es|ed|ing) for (?:a|an|the) (?:draw|point|stalemate)|(?:mak(?:e|es|ing)|made) do with (?:a|an|the) (?:draw|point|stalemate)|(?:(?:ends?|ended|ending|finish(?:es|ed|ing)?) in|play(?:s|ed|ing)? to|settl(?:e|es|ed|ing) for) (?:an?|the) (?:[\w-]+ )?tie(?![-\w])|(?:grab(?:s|bed|bing)?|earn(?:s|ed|ing)?|secur(?:e|es|ed|ing)|pick(?:s|ed|ing)?[- ]?up) (?:a|an|the) (?:draw|point|stalemate)|(?:hard[- ]?fought|hard[- ]?earned|battling|gritty|spirited|creditable|dour|drab|gutsy|point[- ]?saving)[- ]draws?|all[- ]?square|restor(?:e|es|ed|ing)[- ]parity|equali[sz]\w*|level(?:l)?ers?|(?:draws?|drew|drawing)[- ]?level|level(?:s|led|ling)?[- ]?(?:it\b|things up|the (?:scores?|tie|match|contest|derby|affair|aggregate))|(?:even(?:s|ed|ing)?|squar(?:e|es|ed|ing)|t(?:ie|ies|ied|ying)|knot(?:s|ted|ting)?|level(?:s|led|ling|ed|ing)?)(?:[- ]up)?[- ]the[- ]series|(?:t(?:ie|ies|ied|ying)|knot(?:s|ted|ting)?|squar(?:e|es|ed|ing))(?:[- ]up)?[- ]the[- ](?:games?|scores?)|(?:tak(?:e|es|ing)|took|drop(?:s|ped|ping)?)[- ]the[- ]series|(?:claim(?:s|ed|ing)?|tak(?:e|es|ing)|took) (?:the )?rubber[- ]?(?:match|game)|forc(?:e|es|ed|ing)[- ](?:a[- ]|an[- ]|another[- ])?(?:deciding[- ]game|game[- ](?:\d{1,2}|five|seven)|decider)|\b(?:fires?|fired|firing|heads?|headed|heading|nods?|nodded|nodding|slots?|slotted|slotting|taps?|tapped|tapping|tucks?|tucked|tucking|curls?|curled|curling|rifles?|rifled|rifling|lashes?|lashed|lashing|prods?|prodded|prodding|pokes?|poked|poking|bundles?|bundled|bundling|steers?|steered|steering|volleys?|volleyed|volleying|sweeps?|swept|sweeping|puts?|putting) (?:[\w'’-]+[- ]){0,3}?(?:ahead(?![- ]of)|in[- ]front(?![- ]of)|(?:in)?to (?:a |an |the )?(?:\d[- ]?\d[- ])?lead)|\b(?:slots|slotted|slotting|taps|tapped|tapping|nods|nodded|nodding|rifles|rifled|rifling|curls|curled|curling|prods|prodded|prodding|pokes|poked|poking|bundles|bundled|bundling|lashes|lashed|lashing|tucks|tucked|tucking|volleys|volleyed|volleying|steers|steered|steering)[- ]home\b(?![- ](?:advantage|comforts?|form|ground|soil|crowd|faithful|support|supporters|fans|straight|record|debut|fixtures?))|go[- ]?ahead (?:goal|run|homer|home[- ]?run|score|basket|bucket|touchdown|header|strike|dunk|three|lay[- ]?up|jumper|try)s?|(?:last[- ]?gasp|last[- ](?:minute|second)|stoppage[- ]?time|injury[- ]?time|added[- ]?time|dying[- ](?:minutes|seconds|embers)|\d{1,3}(?:st|nd|rd|th)?[- ]minute|late)[- ](?:goals?|strikes?)\b(?![- ](?:line|kick|kicks|mouth|post|posts|scoring|scorer|scorers|keeper|keepers|difference|action))|own[- ]?goals?|worldies?|golazos?|wonder[- ]?goals?|screamers?|grand slam|send(?:s|ing)?[- ]?off|sent[- ]?off|sees?[- ]?red|saw[- ]?red|red card|marching[- ]orders|(?:reduc(?:e|es|ed|ing)(?:[- ][\w'’-]+){0,2}?|down)[- ]to[- ](?:nine|ten|9|10)[- ]men|all three points|(?:maiden|double|triple)[- ]centur(?:y|ies)(?!(?:\s+of|[- ]old)\b)|(?:hits?|smash(?:es|ed)|blast(?:s|ed)?|notch(?:es|ed)?|slam(?:s|med)?|crack(?:s|ed)?|rack(?:s|ed)?[- ]?up|brings?[- ]?up|brought[- ]?up|compil(?:e|es|ed))[- ](?:a[- ]|an[- ]|his[- ]|her[- ]|their[- ]|the[- ]|another[- ])?(?:[\w'’-]+[- ]){0,2}?centur(?:y|ies)(?!(?:\s+of|[- ]old)\b)|bowl(?:s|ed|ing)[- ]?out|all[- ]?out for|chas(?:e|es|ed|ing)[- ]?down|chas(?:e|es|ed) \d{2,3}\b|super[- ]?over|defend(?:s|ed|ing)? \d{2,3}\b|\d{2,3}\/(?:10|\d)\b|\d{2,3} for \d\b|five[- ]?for\b|fifer|wicket haul|skittl\w*|TKO|KOs?|KO'd|stops|stopped|def(?=\.)|retain(?:s|ed)|finish(?:es|ed)|flat[- ]?lin(?:e|es|ed|ing)|starch\w*|submission\w*|submit(?:s|ted|ting)|tap(?:s|ped|ping)?[- ]?out|(?:goes|going|went|gone)[- ]the[- ]distance|(?:puts?|putting)[- ](?:(?!fans|crowd|viewers|spectators|everyone|us|me|you|em|them)[\w'’.-]+[- ]){0,3}?to[- ]sleep|\b(?:sends?|sent|sending|put(?:s|ting)?|drops?|dropped|dropping|floor(?:s|ed|ing)?|crash(?:es|ed|ing)?|tumbl(?:e|es|ed|ing)|sink(?:s|ing)?|sank|sunk|slump(?:s|ed|ing)?|slip(?:s|ped|ping)?|flat|down)(?:[- ][\w'’-]+){0,3}?[- ](?:to|on|onto)[- ]the[- ]canvas\b|\b(?:hit|hits|hitting|kiss(?:es|ed|ing)?|meet(?:s|ing)?|met)[- ](?:the[- ])?canvas\b|\b(?:hand|arm)[- ]raised\b|(?:unanimous|split|majority)[- ]?decision)\b/i;

// SPOILER_RX carries /i so every keyword above matches regardless of case. This alternative
// can't live there: under /i, [A-Z] means "any letter", so it caught lowercase listicle titles
// too ("top 10 plays of week 2"). Kept as its own case-sensitive regex — it only means anything
// when the two "teams" are genuinely capitalized proper names.
//
// Catches the box-score-style title SCORE_RX's hyphenated form misses entirely —
// "GAME RECAP: Grizzlies 110, Lakers 105" and "Lakers 105 Grizzlies 110 final" both name two
// teams and two scores with nothing but a space (comma optional) between them, no hyphen
// anywhere. Each team name is one or more capitalized words so a bare number never qualifies as
// a "team". Digits capped at 3 for the same reason as SCORE_RX (excludes years).
const TEAM_SCORE_RX =
  /\b([A-Z][\w.'-]+(?: [A-Z][\w.'-]+)*) (\d{1,3}),? ([A-Z][\w.'-]+(?: [A-Z][\w.'-]+)*) (\d{1,3})\b/;

// A Title Case listicle/schedule headline ("Top 3 Storylines Heading Into Round 2", "Ranking
// the Top 5 QBs After Week 6") still satisfies TEAM_SCORE_RX's shape even case-sensitively,
// because every word in that kind of title is capitalized. None of these words is ever a real
// team name, so a match naming one is rejected outright.
const TEAM_SCORE_LISTICLE_WORDS = new Set([
  "Top",
  "Best",
  "Week",
  "Game",
  "Round",
  "Match",
  "Day",
  "Part",
  "Episode",
  "Vol",
  "Season",
]);

function isTeamScoreSpoiler(text: string): boolean {
  const m = text.match(TEAM_SCORE_RX);
  if (!m) return false;
  const [, team1, , team2] = m;
  const words = [...team1.split(" "), ...team2.split(" ")];
  return !words.some((word) => TEAM_SCORE_LISTICLE_WORDS.has(word));
}

/** True if the text contains a score or an outcome keyword (i.e. a spoiler). */
export function isScoreSpoiler(text: string | null | undefined): boolean {
  if (!text) return false;
  return SCORE_RX.test(text) || SPOILER_RX.test(text) || isTeamScoreSpoiler(text);
}
