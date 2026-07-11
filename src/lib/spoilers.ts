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
//     "triumph\w*"/"romp\w*" catch the winner-side framing headlines lean on just
//     as often ("Argentina triumph on penalties", "City romp to victory",
//     "Australia romp home") — each names the victor, and neither word means
//     anything but winning in ordinary English, so the false-positive risk is the
//     same negligible level as the blowout verbs above. Both keep their full
//     stem across every inflection (triumphs/triumphed/triumphing, romps/romped/
//     romping), so a trailing \w* covers all of them.
const SCORE_RX = /(?<![-/])\b\d{1,2}\s*[-–]\s*\d{1,2}\b(?![-/])/;
const SPOILER_RX = /\b(walk[- ]?off|comeback|come[- ]from[- ]behind|extra[- ]?innings?|stuns|stunner|crushes|outlast\w*|prevail\w*|dominat\w*|defeat\w*|beat\w*|edge\w*|rout|routs|routed|toppl\w*|trounc\w*|demolish\w*|thrash\w*|triumph\w*|romp\w*|upset\w*|clinch\w*|sweep\w*|swept|oust\w*|eliminat\w*|advanc\w*|leads?|leader|winning|winner|wins|won|loses|lost|loss|hat[- ]trick|no[- ]hitter|shut[- ]?outs?|grand slam|red card|all three points)\b/i;

/** True if the text contains a score or an outcome keyword (i.e. a spoiler). */
export function isScoreSpoiler(text: string | null | undefined): boolean {
  if (!text) return false;
  return SCORE_RX.test(text) || SPOILER_RX.test(text);
}
