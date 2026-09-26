import llwsRegions from "./llwsRegions.json";
import collegeHighlightChannels from "./collegeHighlightChannels.json";
import { buildCollegeFallbackChain, titleMaskedChainChannels, type ChainTeam, type CollegeHighlightConfig, type FallbackChannel } from "./collegeHighlights";
import { isNflTeamChannel } from "./nflTeamChannels";

// The JSON import types as a literal object, which cannot be indexed by an
// arbitrary string; the codes come from ESPN at runtime, so widen it once here.
const LLWS_REGION_NAMES: Record<string, string> = llwsRegions;

// Official YouTube channel names per league
const OFFICIAL_CHANNELS: Record<string, string> = {
  nba: "NBA",
  wnba: "WNBA",
  mlb: "MLB",
  nhl: "NHL",
  nfl: "NFL",
  ncaam: "March Madness",
  // NCAAW: same NCAA tournament uploader as NCAAM ("March Madness" channel
  // posts both men's and women's brackets). Regular-season games stay dark if
  // that exact uploader has no recap; there is no unscoped secondary search.
  ncaaw: "March Madness",
  // NCAAF: ESPN College Football posts per-game recaps with title format
  // "Team A vs. Team B | Full Game Highlights | ESPN College Football".
  ncaaf: "ESPN College Football",
  // CFL (added 2026-09-13): TSN (channelId UC--i2rV5NCxiEIPefr3l-zQ), not
  // the league. Probed against the LIVE worker with strict=1 + week= on all
  // 16 completed games of Weeks 12–15: 16/16 hits, 0 wrong, every title
  // "CFL WEEK N: Away vs. Home | Full Highlights" (one Banjo Bowl variant "…
  // | CFL HIGHLIGHTS", still right). The CFL's own channel scored 2/8 and
  // served the WRONG game once without week= — it titles by city only ("CFL
  // 2026 Recap: Ottawa @ Toronto - Week 15") and never carries team names.
  // The week gate is load-bearing: TSN has 2024/2025 "CFL Week 10: …" uploads
  // with no year in the title. Playoffs carry no week and TSN titles them by
  // round ("EAST SEMI-FINAL: … FULL HIGHLIGHTS"); the worker's date tiers
  // pick the year there.
  //
  // 2026-09-22 QA (all 61 regular-season + playoff finals probed): three more
  // failure modes found and fixed in the worker, all specific to TSN/CFL and
  // inert for every other league on the same gate —
  //   1. TSN spells weeks 1–5 out ("CFL WEEK ONE" … "WEEK FIVE"), which the
  //      digit-only week regex read as "no week token" (the wrong-week gate's
  //      intentional pass-through for postseason titles) and let a Week 1
  //      recap serve for a Week 6/8 query. parseWeekFromTitle now reads
  //      ONE–TWENTY-ONE spelled out too.
  //   2. TSN's OWN 2024/2025 "Away vs. Home | CFL HIGHLIGHTS" re-uploads
  //      carry no week and no year, so a title with no week token is a
  //      genuinely different, older upload format for TSN specifically —
  //      unlike NFL/NCAAF, where a no-week title can be a legitimate
  //      same-season cut. WEEK_TOKEN_REQUIRED_CHANNELS (worker-only) flips
  //      "no token" to a hard reject for channel=TSN alone.
  //   3. The age gate (#84) missed these same re-uploads live because
  //      YouTube's relative timestamp sometimes reads abbreviated ("2y ago")
  //      rather than spelled out ("2 years ago"); latestPossiblePublish now
  //      reads both.
  cfl: "TSN",
  // World Cup: FOX is the US English-language rightsholder and "FOX Sports"
  // posts a clean per-match "TeamA vs TeamB Highlights | 2026 FIFA World Cup™"
  // for every game. FIFA's own channel only posts alt-cast / limited clips, so
  // use the broadcaster — same pattern as EPL→NBC Sports, UCL→CBS Sports Golazo,
  // MLS→Major League Soccer. The worker further restricts WC results to an
  // official-channel allowlist (FOX Sports / FOX Soccer / FIFA); the client also
  // requires an exact channel for every slot and every embed retry.
  fifa: "FOX Sports",
  // EPL: Premier League's own YouTube channel posts only short clips
  // (broadcast rights restrict full game recaps). NBC Sports (US broadcaster)
  // uploads the actual game-by-game highlights with title format
  // "TeamA v. TeamB | PREMIER LEAGUE HIGHLIGHTS | M/D/YYYY | NBC Sports".
  epl: "NBC Sports",
  // MLS: the official channel is "Major League Soccer", not "MLS" —
  // the abbreviation never matched, so the labeled button always 404'd.
  mls: "Major League Soccer",
  // UCL / UEL: UEFA's own channel posts compilations not per-game recaps;
  // CBS Sports Golazo (US rights holder) posts per-match Extended Highlights
  // with title format "TeamA vs. TeamB: Extended Highlights | UCL [Round] |
  // CBS Sports Golazo". They only post the extended version (no standard
  // companion) — the worker's extended-vs-standard demote still picks them
  // because nothing else competes at the same tier.
  ucl: "CBS Sports Golazo",
  // UEL: the uploader MOVED. CBS split its European coverage onto a second
  // channel, "CBS Sports Golazo - Europe", and the Europa League went with it —
  // the 2026-09-16 League Phase MD1 slate read 0/18 baked on the old string.
  // Re-probed against the LIVE worker with strict=1 over the first 8 fixtures
  // of that matchday: "CBS Sports Golazo - Europe" 6/8, 0 wrong; the old
  // channel 0/8. Titles are unchanged in shape ("Omonia vs. Celta Vigo:
  // Extended Highlights | UEL League Phase MD1 | CBS Sports Golazo"), so the
  // signature that moved is the author_name, not the title. The old channel
  // stays on as the strict 2nd slot (SECONDARY_CHANNELS) in case an older tie
  // or a stray upload still lives there. ⚠️ UCL is NOT changed here — probe it
  // the same way on its own next matchday before touching `ucl`.
  uel: "CBS Sports Golazo - Europe",
  // Serie A: Paramount+ / CBS holds the US rights, same as UCL/UEL, and the
  // same Golazo channel posts the per-match Extended Highlights.
  seriea: "CBS Sports Golazo",
  // Bundesliga: the league's own channel is the per-match highlight source.
  // Exact author_name verified 2026-08-03 via the channel RSS feed (it is
  // "Bundesliga", not "Bundesliga Official" or similar).
  bundesliga: "Bundesliga",
  // ── Leagues added 2026-08-03. Every string below is the exact YouTube
  // author_name, verified END-TO-END against the LIVE worker with strict=1 on
  // real completed fixtures (a strict hit proves both the string and that the
  // channel actually carries that match). Without these entries each league
  // fell through to the unscoped search, which measurably served junk: Liga MX
  // → club/aggregator uploads, NWSL → single-club channels, EFL → "Wrexham
  // AFC", Saudi PL → "Santos El Creador", Libertadores → nothing at all.
  //
  // Liga MX: TUDN is the Univision rightsholder, and the channel that actually
  // carries the per-match recap is "TUDN USA" — it posts
  // "HIGHLIGHTS - A vs B | Liga MX - Jornada N Apertura YYYY | TUDN".
  // ⚠️ This was "TUDN México" through 2026-08-09 and resolved NOTHING: a strict
  // (and even a non-strict) channel-scoped lookup returned "No results" for
  // every Liga MX fixture tried, so the column rendered a finished card with an
  // empty reserved highlight row (Jacob 8/10 — "box size is huge and don't see
  // highlights"). Re-verified 2026-08-10 against the live worker with strict=1:
  // TUDN USA 3/3, TUDN México 0/3, bare "TUDN" 0/3.
  ligamx: "TUDN USA",
  // NWSL: the league channel's author_name is the FULL name, not the
  // abbreviation — "NWSL" never matched. Club channels (Seattle Reign FC,
  // San Diego Wave FC) also post per-match highlights and were winning the
  // unscoped search, which is exactly the inconsistency the gate exists to
  // stop. CBS Sports W Golazo is separately verified for the strict alternate.
  nwsl: "National Women's Soccer League",
  // EFL Championship: the league's own channel, author_name is the bare
  // "EFL" (not "Sky Bet EFL", not "Sky Sports Football" — both verified 0/1).
  efl: "EFL",
  // Copa Libertadores: CONMEBOL's own channel carries the per-match cut.
  libertadores: "CONMEBOL Libertadores",
  // Saudi Pro League: the official channel's author_name is bilingual and
  // leads with the ARABIC name — the English-only "Saudi Pro League" and
  // "Roshn Saudi League" both verified 0/2. Keep this string byte-exact.
  saudi: "الدوري السعودي للمحترفين - Saudi Pro League",
  // AFCON: CAF's own channel ("CAFOnline" verified 0/1). Gated to 2027 in
  // ALL_LEAGUES, so this sits inert until the tournament year.
  afcon: "CAF TV",
  // FA Cup (added 2026-09-14): ESPN holds the US rights and "ESPN FC" posts a
  // per-tie "A vs. B | FA Cup Highlights | ESPN FC" cut. The FA's own "Emirates
  // FA Cup" channel was 0/5 on strict. ESPN FC verified END-TO-END against the
  // LIVE worker with strict=1 on ten completed 2025-26 ties, bare query shape:
  // 7/10 hits, 0 wrong. The three misses were all-EFL third-round ties (Oxford
  // v MK Dons, Blackpool v Ipswich, Blackburn v Hull) ESPN FC never cut — a
  // hidden button, not a wrong video. From the fourth round on it was 5/5.
  // ⚠️ The SAME channel also cuts the Premier League meetings of the same
  // clubs, and Copa del Rey showed exactly that failure (a LaLiga Elche–Betis
  // served for the cup tie), so the FA Cup ships with a REQUIRED "fa cup"
  // title token — see COMPETITION_TITLE_TOKENS. Re-measured with the token:
  // still 7/10, 0 wrong.
  facup: "ESPN FC",
  // Little League World Series: ESPN holds the US broadcast AND posts a
  // per-game "Full Game Highlights" cut. This was written off as no-uploader on
  // 2026-08-12 (see the removed NO_HIGHLIGHT_FALLBACK note) because the probe
  // used ESPN's own team names — and those never appear in the titles. Titles
  // name the STATE or COUNTRY: "Washington vs. Alabama | Full Game Highlights |
  // Little League World Series". With highlightTeamName() rewriting the query,
  // re-verified 2026-08-21 against the live worker with strict=1 over all 11
  // completed 2026 fixtures: 8 hits, 0 wrong match. The three misses are early
  // pool games ESPN never cut, which is a hidden button, not a wrong video.
  llws: "ESPN",
  // ── Rugby, added 2026-08-12. The six sports shipped on 8/11 went out with NO
  // entries at all, so all six fell through to the unscoped search. Verified
  // END-TO-END against the LIVE worker with strict=1 on 5 real completed
  // fixtures each, using the query production actually sends.
  // ⚠️ That query is BARE — `A vs B highlights M/D/YYYY`, no competition token,
  // because COMPETITION_NAMES carries `fifa` only. Appending a competition
  // string while probing gives false negatives (World Rugby read 0/3 with
  // "Rugby World Cup" appended and 5/5 without it). Probe with the bare shape.
  //
  // Six Nations: the channel is sponsor- AND gender-qualified. Bare
  // "Six Nations Rugby" and "Guinness Six Nations" both verified 0/3 — only
  // the full "Guinness Men's Six Nations" resolves (4/5). Re-check the string
  // when the title sponsor changes; it is in the channel name.
  sixnations: "Guinness Men's Six Nations",
  // Super Rugby Pacific: "Super Rugby" alone is 0/5, the competition's own
  // channel spells out Pacific (3/5). Sky Sport NZ holds the broadcast but
  // posts no per-match cut (0/5).
  superrugby: "Super Rugby Pacific",
  // Rugby World Cup: World Rugby's own channel, 5/5 — the cleanest of the six.
  // NOT "Rugby World Cup" (0/5, no such uploader). Gated to 2027 by yearCycle,
  // so this sits inert until the tournament.
  rugbywc: "World Rugby",
  // Nations Championship (added 2026-08-12). World Rugby's own channel again —
  // but this one CANNOT ship on the channel gate alone, and that is the whole
  // story of this entry.
  //
  // Measured against the LIVE worker with strict=1 over ALL 18 completed July
  // 2026 pool fixtures, bare query shape: "World Rugby" resolved 13/18 — and
  // THREE of those thirteen were the WRONG MATCH. The channel also carries the
  // U20 Junior World Championships, which runs in the same July window between
  // the same NATIONS, so "Italy v Japan | Junior World Championships 2026"
  // satisfies the channel gate, the both-teams gate and the year gate for the
  // senior Italy–Japan fixture on the same day. Serving it would put an U20
  // scoreline on a senior card — the same wrong-match class that kept rugbytest
  // dark (a Women's RWC game served for a men's test). Hence the title gate in
  // COMPETITION_TITLE_TOKENS below, which is REQUIRED, not an optimization:
  // with it World Rugby is 10/18 correct and 0/18 wrong.
  nationschamp: "World Rugby",
  // euro + cricket deliberately have NO entry — see the block comment below.
  //
  // ── La Liga + Ligue 1, LIT 2026-09-19. Both were dark because the LEAGUE's
  // own channel was unusable: LALIGA's ("LALIGA EA SPORTS") posts
  // Spanish-language full matches rather than per-match English highlights, and
  // Ligue 1's author name is sponsor-suffixed with a curly apostrophe ("Ligue 1
  // McDonald's") that re-brands every cycle. Neither objection applies to the
  // US BROADCASTER, which is the same answer EPL→NBC Sports and UCL→CBS Sports
  // Golazo already use.
  //
  // Ligue 1: beIN SPORTS USA holds the US rights and posts a per-match
  // "Lorient vs Toulouse | HIGHLIGHTS Ligue 1 | 09/12/2026 | beIN SPORTS USA".
  // Probed against the LIVE worker with strict=1 over the first 8 finished
  // fixtures of the Sep 12-13 2026 slate: 7/8 hits, 0 wrong. Every title
  // carries both the competition name and an explicit MM/DD/YYYY, so the date
  // gate is live too. The one miss (Angers–Le Havre) has no recap anywhere.
  ligue1: "beIN SPORTS USA",
  // La Liga: ESPN FC (ESPN holds the US rights) posts "Real Sociedad vs.
  // Atletico Madrid | LALIGA Highlights | ESPN FC". Probed against the LIVE
  // worker with strict=1 over 8 finished fixtures of the Sep 12-13 2026 slate:
  // 4/8 hits, 0 wrong — it cuts the big-club games and skips the rest, so
  // expect about half the slate to stay dark.
  //
  // ⚠️ 4/8 does NOT clear the old "≥4/5 strict hits" gate, and shipping it is a
  // deliberate widening (approved 2026-09-19). The gate that actually protects
  // a no-spoiler card is ZERO WRONG MATCHES, not hit rate: a miss hides the
  // button, which is recoverable, while a wrong match puts someone else's
  // scoreline on the card. So the rule for a broadcaster channel is now: 0
  // wrong over at least 8 probes, any non-zero hit rate, PLUS a required
  // competition title token whenever the channel cuts more than one
  // competition. ESPN FC cuts the FA Cup, the Copa del Rey and the Premier
  // League alongside LALIGA — and Copa del Rey measured that exact failure on
  // 2026-09-14 (a LALIGA Elche–Betis served for the cup tie) — so La Liga ships
  // with the "laliga" token in COMPETITION_TITLE_TOKENS, same as facup.
  laliga: "ESPN FC",
  // Golf majors — each tournament has its own channel. Keys must match the
  // label-derived lookup key `golf_${label.toLowerCase().replace(/\s+/g,"")}`
  // (see getOfficialChannelName), so the PGA Championship — whose league label
  // is "PGA Champ" — keys to golf_pgachamp, NOT golf_pga (which never matched,
  // dropping its official channel from the highlight chain). Mirrors the
  // golf_pgachamp key in SECONDARY_CHANNELS below.
  // Channel names below are the exact YouTube ownerText/author_name (the
  // worker matches on channel identity, not title text — verified 2026-07-11
  // via youtube.com/oembed + RSS). A wrong string silently 404s the official
  // slot and lets a reupload win, so these must match precisely.
  golf_masters: "The Masters",
  golf_pgachamp: "PGA Championships",       // plural — channel is "PGA Championships"
  golf_usopen: "United States Golf Association (USGA)", // NOT "USGA" (that never matched)
  golf_theopen: "The R&A",                  // The Open is run by The R&A; "The Open" never matched
  // Tennis Grand Slams — the tournament's own channel is the ONLY reliable
  // per-match source (ATP Tour / WTA / Tennis TV do NOT carry Slam highlights,
  // since Slams aren't tour-owned). Verified author_name strings.
  tennis_frenchopen: "Roland-Garros",
  tennis_wimbledon: "Wimbledon",
  tennis_usopen: "US Open Tennis Championships",
  tennis_ausopen: "Australian Open",        // NOT "Australian Open TV" (silently broke every AO match)
  tennis_australianopen: "Australian Open",
  // F1 + UFC official channels
  f1: "FORMULA 1",
  ufc: "UFC",
  // Esports — keyed per LEAGUE, not per sport, because the "esports" sport key
  // covers LCK/LPL/LEC/Dota/CS at once and they have nothing in common as
  // uploaders. The key is `esports_${league.toLowerCase()}` where league is
  // PandaScore's league name, carried on Game.esportsLeague (see
  // getOfficialChannelName + fetchEsportsGames).
  //
  // LEC only. Verified 2026-08-04 via each channel's <link rel="canonical">
  // → RSS <author><name>. Do NOT verify by grepping the first "channelId" out
  // of a channel page: that returns a RECOMMENDED channel, not the page owner,
  // and it gave a wrong name for every handle tried (@LCK → "LCK Global",
  // @lolesports → "LCS").
  //
  // LEC posts a clean per-series cut:
  //   "TH vs KC | HIGHLIGHTS | 2026 #LEC Summer - Week 2 Day 4 | Team Heretics
  //    vs Karmine Corp" — one video per series, no score in the title.
  esports_lec: "LEC",
  // Deliberately ABSENT, both verified and rejected rather than unchecked:
  //
  // - LCK (author_name "LCK Global", handle @LCKGlobal) posts per-GAME VODs
  //   — "KT vs HLE | Match 100 Game 3 | 2026 LCK" — three per series, full
  //   length, not highlights. Worse, it is a SPOILER: a "Game 3" video existing
  //   proves a Bo3 went the distance, so the video list leaks the series shape
  //   before anything is clicked. Same class of leak as a score in a title.
  //   (@LCK is a DIFFERENT channel, author_name "LCK" — the Korean-language
  //   variety/content channel. Do not use it.)
  // - LPL (author_name "LPL", handle @LPLOfficial) is posting Asia Masters
  //   day-VODs, no per-series LPL highlight cut at all.
  // - "LoL Esports" (@lolesports) is Shorts and clips only.
  //
  // Re-check LCK if it ever switches to a per-series cut; re-check LPL at the
  // start of a domestic split.
};

// Leagues where NO trustworthy uploader exists on YouTube, so the unscoped
// "any title that matches" fallback must NOT run — a null here hides the
// highlight button entirely rather than serving a re-upload.
//
// La Liga / Ligue 1: neither currently has a stable, verified per-match uploader
// mapping. A rightsholder happening to rank first in an unscoped search is not a
// channel guarantee, so both stay dark until an exact author_name is verified.
//
// cricket (IPL): verified 2026-08-03 against three real 2026 fixtures. The
// unscoped search returned "Cricket fan 🏏786", "BCCI Cricket Match Highlights"
// (an unaffiliated channel that merely names itself after the board) and
// "Cricastra" — 3 for 3 fan re-uploads, zero official results. There is no
// official YouTube per-match highlight at all: IPL match highlights are
// exclusive to JioHotstar and geo-locked to India, and the official @IPL
// channel posts only promos and short clips. "IPL", "Indian Premier League"
// and "Star Sports" all verified 0/3 on strict. So the IPL card shows its
// scorecard + rating and NO highlight button. Re-check if the rights move.
//
// euro: verified 0/1 — UEFA's own channel does not post per-match EURO
// highlights (the unscoped winner was a TSN re-upload). Gated to 2028 in
// ALL_LEAGUES anyway, so re-verify at the next tournament rather than now.
// esports: unlike cricket, this is per-LEAGUE rather than all-or-nothing. The
// unscoped search for an esports match is a minefield — the scene runs on fan
// re-uploads and the titles routinely carry the result outright ("INSANE 3-0
// SWEEP") — so esports NEVER gets the search fallback. But a league with a
// verified official channel (currently LEC only, see OFFICIAL_CHANNELS) can
// still resolve strictly against that channel. A league with no verified entry
// stays fully dark. See hasNoTrustedHighlightSource below.
//
// llws: NO LONGER DARK — see OFFICIAL_CHANNELS.llws. The 2026-08-12 "0/2 on
// strict, ESPN posts no per-game cut" finding was wrong, and wrong in an
// instructive way: the probe queried ESPN's team names ("Tacoma WA"), which
// appear in no ESPN title. ESPN titles by state/country, so the channel was
// right and the QUERY was the failure. Fixed by highlightTeamName().
//
// rugbychamp (Investec Champions Cup): 0/5 on "Investec Champions Cup",
// "EPCR Rugby" and "Champions Cup". There is no competition-level uploader —
// the unscoped winner was "Glasgow Warriors", i.e. one of the two CLUBS in the
// match, and the other four fixtures returned nothing at all. Club channels
// winning an unscoped search is the same inconsistency that put NWSL behind an
// exact channel; here there is no exact channel to put it behind.
//
// rugbytest (International Test Match): no single uploader owns the November
// window. Best was "Quilter Nations Series" at 2/5 — England home tests only,
// and that name is a title SPONSOR that rebrands every cycle (the Ligue 1
// McDonald's hazard). "World Rugby" scored 1/5 here and, worse, its one hit on
// the first probe was a WRONG match — a 2025 Women's Rugby World Cup game
// served for a men's autumn test. The unscoped winners were "Rugby Mzansi" and
// "Match Videos", both fan channels. Dark until one uploader owns the window.
//
// ncaah (NCAA men's hockey, added 2026-09-12): probed against the LIVE worker
// with strict=1 on 7 completed 2026 fixtures, bare query shape. "ESPN" was 0/7.
// "NCAA Championships" posts a clean per-game cut for the NCAA TOURNAMENT only
// (Frozen Four semis + final, one regional final: 4/5 postseason hits) — and
// it served the WRONG game for the regular season: "Michigan vs Minnesota
// highlights 1/17/2026" returned "Michigan vs. Minnesota Duluth - 2026 NCAA
// hockey regional final highlights". A wrong match fails the gate outright, and
// regular-season games stream on ESPN+ with no official upload. Dark. A
// postseason-only channel gate is the way to light it for the March tournament.
//
// ncaawh (NCAA women's hockey, added 2026-09-14, lit 2026-09-23). The 9/14
// note said "same evidence as the men's: ESPN+ only, no per-game uploader".
// That was never probed for the women's game and was wrong: the ECAC Hockey
// channel posts a per-game cut ("RPI at Mercyhurst | NCAA Women's Ice Hockey |
// Highlights - September 18, 2026 | #ECACHockey"), 3/3 strict on the 9/18-9/19
// opening weekend with a `women` title token, no score in the title. Lit
// WITHOUT a fixed channel, like ncaavb: a game with an ECAC school uses the
// conference chain, every other game stays dark. Atlantic Hockey America
// joined the chain 2026-09-26: one cut per AHA women's game, score in every
// title (covered by `maskTitle`, the title bar stays masked) and no gender
// word (its own empty `channelTitleTokens` list, flagged `ownTokens`, replaces
// the sport-wide `women` token for that channel only). The channel probe
// (Hockey East/WCHA/NEWHA post no per-game cut) is in lib/collegeHighlights.ts,
// with the men's re-probe and what ncaah still needs.
//
// ufl (UFL spring football, added 2026-09-14): probed against the LIVE worker
// with strict=1 on 5 completed 2026 fixtures (May 3, May 16, May 29, Jun 7
// semifinal, Jun 13 United Bowl), bare query shape. "UFL" was 0/5; "FOX Sports"
// and "ESPN" 0/1 each on the United Bowl. The unscoped winners were fan
// channels ("Cincinnati Bengals / Oklahoma Sooners fan", "Mr. Mane"). Dark
// until an official uploader owns the per-game cut.
//
// ncaabase / ncaasoft (NCAA baseball + softball, added 2026-09-14): dark.
// Probed the LIVE worker with strict=1 and "NCAA Championships" on 8
// completed 2026 fixtures (bare query, no seriesNote). Postseason: 4/6 correct
// (CWS finals G1, a CWS double-elimination game, WCWS finals G1, a WCWS
// double-elimination game), and the two finals GAME 2 probes both served the
// Game 1 cut. Regular season: baseball "No results"; softball "Michigan vs
// Wisconsin 4/18/2026" served "Wisconsin vs. Michigan State - 2026 NCAA
// HOCKEY regional final" — a wrong match, the ncaah failure shape exactly.
// The regular season streams on ESPN+ / SEC Network+ with no per-game
// uploader. The same postseason-only channel gate ncaah needs would light
// the CWS / WCWS.
//
// ncaavb (NCAA women's volleyball, added 2026-09-14): probed against the LIVE
// worker with strict=1, bare query shape, on the 2025 NCAA tournament (final,
// both semifinals, a regional final, a regional semifinal). "NCAA
// Championships" hit 1/5 (the Wisconsin–Kentucky semifinal only) and "ESPN"
// 0/3; two regular-season Sep 2026 queries were 0/2. Well under the 4/5 gate,
// and regular-season matches stream on ESPN+ / B1G+ with no official upload.
// Lit 2026-09-16 WITHOUT a fixed channel: the conference channels (Big Ten
// Volleyball, ACC Digital Network, Big 12 Conference, SEC) post per-match cuts,
// so each match uses its own schools' conference chain. See
// lib/collegeHighlights.ts; a match outside those four conferences stays dark.
//
// uecl / copadelrey / dfbpokal (added 2026-09-14, all three DARK). Probed
// against the LIVE worker with strict=1 on 5 completed 2025-26 fixtures each,
// bare query shape:
//   uecl — "CBS Sports Golazo" 0/5 (the uploader is a separate "CBS Sports
//     Golazo - Europe" channel: 2/5, and one of the two was the WRONG LEG —
//     "Round of 16 - Leg 1" served for the Leg 2 fixture a week later; a title
//     token cannot tell two legs of one tie apart).
//   copadelrey — "ESPN FC" 3/5 with TWO wrong matches (LaLiga Elche–Betis and
//     Betis–Atlético served for the cup ties); with a "copa del rey" title
//     token 2/5 and 0 wrong, still under the 4/5 gate.
//   dfbpokal — "DFB" 0/5, "ESPN FC" 0/5; the unscoped winners were Bundesliga
//     league meetings of the same clubs (Dortmund–Leverkusen MD16 for the
//     round-of-16 tie), i.e. the wrong-match class again.
// Re-probe once the 2026-27 knockouts exist; any relight needs ≥4/5 and a
// competition title token.
//
// ncaawsoc / ncaamsoc (NCAA soccer, added 2026-09-26, both DARK). The cut
// Jacob found for Penn State at Ohio State (women's, 9/10) is on "Real Woso
// Fan", a fan channel, not an uploader the app can trust; no conference or
// network channel has been probed for either sport yet. Regular-season matches
// stream on ESPN+ with no official upload. Light either the way ncaavb was:
// a per-school conference chain in collegeHighlightChannels.json once a
// conference channel measures ≥4/5 strict with a title token.
const NO_HIGHLIGHT_FALLBACK = new Set([
  "copadelrey",
  "cricket",
  "dfbpokal",
  "euro",
  "esports",
  // laliga + ligue1 left this set 2026-09-19 — both now resolve against their
  // US broadcaster (ESPN FC / beIN SPORTS USA), each behind a required
  // competition title token. See OFFICIAL_CHANNELS above.
  "ncaah",
  "ncaabase",
  // Both college soccer feeds: no trusted uploader yet (see the note above).
  "ncaamsoc",
  "ncaasoft",
  "ncaawsoc",
  "rugbychamp",
  "rugbytest",
  "ufl",
  "uecl",
]);

// True when a league has no exact approved channel. Callers must render no
// highlight button (not a search-page link) for these.
//
// `label` is the sub-league (esports: PandaScore's league name — "LCK", "LEC").
// Esports is one sport key spanning many unrelated uploaders, so the answer is
// per-league. Every sport is dark unless it maps to a verified exact channel.
export function hasNoTrustedHighlightSource(sport: string, label?: string): boolean {
  if (sport === "esports") return !getOfficialChannelName(sport, label);
  return NO_HIGHLIGHT_FALLBACK.has(sport) || !getOfficialChannelName(sport, label);
}

// True when a sport must never fall back to an unscoped YouTube search, even
// though it does have a verified official channel to resolve against. Esports
// titles routinely spoil the result, so a failed strict resolve must surface
// the "open on YouTube" fallback rather than silently re-searching.
export function requiresStrictChannelOnly(sport: string): boolean {
  return sport === "esports";
}

// Curated channel chain for golf highlight buttons — used directly
// (not as a fallback) because the tournament-run channels ("The
// Masters", "USGA", etc.) are unreliable for recaps: they mix in Par
// 3 Contest, player-specific clips, and practice rounds during
// tournament week, which was burying the actual day-end recap.
//
// Order matters — slot 0 (the "main recap" button) pulls from the first
// channel, slot 1 from the second, etc. Golf Channel is the reliable per-round
// recap fallback across all four majors ("... Round N | Golf Channel"). ESPN
// only kept where it actually holds broadcast rights + posts round recaps —
// the Masters and PGA Championship (Thu/Fri windows). ESPN has NO rights to the
// US Open (golf) or The Open (those are NBC/Golf Channel/Peacock in the US), so
// it's dropped there — it was dead-weight fallback. "PGA TOUR" removed from
// every chain: that channel explicitly excludes major highlights, so it never
// hit. Sky Sports Golf kept for The Open (UK R&A licensee). (Verified 2026-07-11.)
const SECONDARY_CHANNELS: Record<string, string[]> = {
  // CBS's women's-sports channel now posts the per-match extended NWSL recap.
  // The league channel skipped Courage–Summit on 2026-08-05 while W Golazo
  // published an official, embeddable cut, so keep it as the strict 2nd slot.
  nwsl: ["CBS Sports W Golazo"],
  // UEL's 2nd slot is the channel it just moved OFF — "CBS Sports Golazo" still
  // holds the older ties, and keeping it strict here costs nothing when it has
  // no cut for a match. See the uel note in OFFICIAL_CHANNELS.
  uel: ["CBS Sports Golazo"],
  // Nations Championship: the two hemispheres post separately. World Rugby
  // covers the fixtures hosted in the north, and Super Rugby Pacific — the
  // SANZAAR channel, already this app's primary for `superrugby` — posts the
  // southern-hosted ones World Rugby skips. Strict-verified 2026-08-12 over all
  // 18 completed July fixtures: the five World Rugby has NO video for
  // (Scotland–South Africa, Wales–Argentina, Ireland–New Zealand,
  // Italy–Australia, Scotland–Fiji) are 4/5 covered here, taking the league
  // from 10/18 to 15/18 with still zero wrong matches.
  // ⚠️ NOT "SANZAAR TV". It wins the UNSCOPED search for several of these and
  // looks like the obvious answer, but it is 0/5 on strict — its uploads do not
  // survive the resolver's own gates. Verified, not assumed.
  nationschamp: ["Super Rugby Pacific"],
  golf_masters: ["Golf Channel", "ESPN"],
  golf_pgachamp: ["Golf Channel", "ESPN"],
  golf_usopen: ["Golf Channel"],
  golf_theopen: ["Golf Channel", "Sky Sports Golf"],
  f1: ["FORMULA 1", "ESPN", "Sky Sports F1"],
  ufc: ["UFC", "ESPN"],
};

// Official channels that disable embedded playback on EVERY upload, so the
// in-app player can only ever render YouTube's own "Video unavailable" screen.
// Verified 2026-08-10 in a real browser from the hidescore.com origin via the
// IFrame API: FORMULA 1's 2026 Hungarian and 2026 British race-highlight
// uploads both fire onError with code 150 ("embedding disabled by request of
// the owner"). Not a geo/bot artifact — the same videos play fine on
// youtube.com.
//
// Being on this list means the modal skips the player entirely and opens on the
// "Watch on YouTube" card instead of black-screening for several seconds first
// (player init → error 150 → a walk down SECONDARY_CHANNELS that, for F1,
// cannot succeed: ESPN and Sky Sports F1 both return "No results" for a race
// highlight — checked the same day against the live /api/youtube worker).
//
// Deleting a name here restores the normal try-then-fall-back path, which is
// all it takes if a rights holder ever turns embedding back on.
//
// NFL added 2026-08-10 by the same measurement, run through scripts/check-
// embeddable.mjs: four separate NFL uploads all returned error 150, while ESPN,
// MLB and DAZN Boxing clips played in the very same headless session — so this
// is the channel's own setting, not a bot or geo artifact. Worth stating
// plainly because the last NFL playback complaint was NOT this: the "league
// blocked embedded playback" card Jacob hit on 8/9 was a false positive from
// the autoplay watchdog (see VideoModal's onReady note). This one is real, and
// there is no second source to fall back to — ESPN's NFL scoreboard ships
// `highlights: []` on every competition, so the league's own channel is the
// only place the clip exists.
const EMBED_BLOCKED_CHANNELS = new Set(["FORMULA 1", "NFL"]);

// True when the FIRST channel a highlight is gated to refuses embeds. The lead
// channel is the only one guaranteed to hold the clip (the rest of the chain is
// opportunistic), so a blocked lead means the attempt is already lost.
//
// The 32 NFL club channels block game footage exactly like the league does
// (error 150 on every club highlight package, measured 2026-08-10 — see
// nflTeamChannels.ts), so the club short-cut button (GameHighlights, NFL
// "Lions 10m") goes straight to the hand-off card too. Without this the modal
// would mount the player, hit 150, and only then show it.
export function leadChannelBlocksEmbeds(channels: string[]): boolean {
  return channels.length > 0 && (EMBED_BLOCKED_CHANNELS.has(channels[0]) || isNflTeamChannel(channels[0]));
}

// Channels whose clip title bar must stay masked no matter what the spoiler
// filter says. The mask is normally lifted once SPOILER_RX clears the real
// YouTube title, which is right for a team sport: "Mets vs Braves | Game
// Highlights" is the house style and carries nothing.
//
// Combat sports are not like that. A fight has exactly one fact — who finished
// whom — and the channels title with it every time, in language that keeps
// mutating (stopped, KO'd, def., retains, starched, and whatever comes next).
// Every miss is a full spoiler on the marquee bout, and the filter has already
// been caught out here more than once (Jacob 8/10). So for these channels the
// answer isn't another keyword: it's to stop asking the question. The cost is
// one covered strip on clips that would have been safe to show.
// ⚠️ These must cover EVERY channel a combat clip can arrive from, not just the
// league's own. UFC walks three of them in coverage order
// (UFC_HIGHLIGHT_CHANNELS in EventCard) and a bare "UFC" set matched exactly one
// — so the two that actually serve most bouts, "UFC on Paramount+" and
// "ESPN MMA", sailed past the always-mask and showed their titles (Jacob 8/11,
// "titles have spoilers"). The `UFC on …` family is matched by PREFIX so a
// broadcaster change (Paramount+ replaced ESPN+ mid-2026) cannot silently
// reopen the hole; anything else has to be listed.
const TITLE_ALWAYS_MASKED_CHANNELS = new Set(["UFC", "ESPN MMA", "DAZN Boxing"]);

//
// Soccer club channels and LIGA BBVA MX (the efl / ligamx chains, 2026-09-25)
// title by result — "Birmingham 2 Boro 2", "JUÁREZ 2-0 TIGRES" — in forms the
// score regex does not all catch, so they are masked the same way. The list
// lives with the chain (`maskTitle` in collegeHighlightChannels.json).
let chainMaskedChannels: Set<string> | null = null;
export function channelAlwaysMasksTitle(channels: string[]): boolean {
  const chainMasked = (chainMaskedChannels ??= titleMaskedChainChannels(COLLEGE_HIGHLIGHT_CONFIG));
  return channels.some((c) => TITLE_ALWAYS_MASKED_CHANNELS.has(c) || c.startsWith("UFC on ") || chainMasked.has(c));
}

export function getYouTubeSearchUrl(
  awayTeam: string,
  homeTeam: string,
  dateStr: string,
  seriesNote?: string | null,
  competition?: string | null
): string {
  const query = buildQuery(awayTeam, homeTeam, dateStr, seriesNote, competition);
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
}

export function getHighlightSearchQuery(
  awayTeam: string,
  homeTeam: string,
  dateStr: string,
  seriesNote?: string | null,
  competition?: string | null
): string {
  return buildQuery(awayTeam, homeTeam, dateStr, seriesNote, competition);
}

export function getOfficialChannelName(sport: string, label?: string): string | null {
  // Tournament-specific channels for golf/tennis
  if (label) {
    const labelKey = `${sport}_${label.toLowerCase().replace(/\s+/g, "")}`;
    if (OFFICIAL_CHANNELS[labelKey]) return OFFICIAL_CHANNELS[labelKey];
  }
  return OFFICIAL_CHANNELS[sport] ?? null;
}

// Competition/tournament token to require in highlight titles for sports where
// the same two teams meet across many competitions. Soccer national teams play
// friendlies, qualifiers AND continental cups against each other, and there are
// decades of old World Cup classics between the same nations — so without this
// the matcher can serve a friendly (or a 2006 classic) as today's World Cup
// game. The client embeds this token in the query (buildQuery) and the
// /api/youtube worker requires it in the video title — the soccer analogue of
// the golf tournament gate. World Cup (fifa) ONLY; every other league maps to
// null and is completely unaffected.
const COMPETITION_NAMES: Record<string, string> = {
  fifa: "World Cup",
};

export function getCompetitionName(sport: string): string | null {
  return COMPETITION_NAMES[sport] ?? null;
}

// COMPETITION TITLE GATE (`comp=` on /api/youtube). Distinct from
// COMPETITION_NAMES above: that one appends a word to the SEARCH QUERY, this
// one is a hard filter on the winning video's TITLE. A candidate that clears
// the channel gate but whose title carries none of these tokens is dropped and
// the button hides — the same "better to 404 than serve the wrong event"
// posture as the race gate (motorsport), the week gate (NFL) and the World Cup
// gate, and it exists for exactly the same failure: ONE official channel that
// uploads more than one competition between the same opponents.
//
// Query text is deliberately left BARE for these sports. Appending the
// competition name is a measured false-negative generator on rugby (World Rugby
// read 0/3 with "Rugby World Cup" appended and 5/5 without it — 2026-08-12),
// so recall comes from the bare query and precision comes from this gate.
//
// nationschamp: World Rugby and Super Rugby Pacific both also post the U20
// Junior World Championships, played in the same July window between the same
// nations. Without the token, three of thirteen strict hits were U20 matches
// dressed as senior internationals. The gate costs one true positive —
// "July Internationals | New Zealand v Ireland - Third Test Highlights" is the
// right match under a title that never says Nations Championship — and that is
// the correct trade: a hidden button is recoverable, a wrong scoreline on a
// no-spoiler card is not. Do NOT widen this to "july internationals": it is
// generic enough to match a plain test that is not part of the competition.
//
// facup: ESPN FC cuts the FA Cup AND the Premier League, and the same two clubs
// meet in both. Copa del Rey on the same channel measured the failure outright
// (a LaLiga Elche–Betis served for the cup tie, 2026-09-14), so the FA Cup
// requires its name in the title. Every ESPN FC FA Cup cut is titled
// "… | FA Cup Highlights | ESPN FC" (7/7 hits carried it).
// ncaavb: its conference channels (SEC, Big Ten Network, ESPN) post football and
// basketball between the same schools; strict probes served both. Every match
// cut says "Volleyball" in the title. See lib/collegeHighlights.ts.
// laliga: the SAME ESPN FC channel again, and the same hazard facup carries —
// it cuts LALIGA, the FA Cup, the Copa del Rey and the Premier League, and the
// Copa del Rey probe served a LaLiga meeting of the same two clubs for a cup
// tie. Every ESPN FC LaLiga cut is titled "… | LALIGA Highlights | ESPN FC"
// (4/4 hits carried it). Both spellings are listed because the token match is
// punctuation-insensitive but NOT space-insensitive — "LA LIGA Highlights"
// normalizes to "la liga", which the bare "laliga" token would miss.
// ligue1: beIN SPORTS USA also carries the Coupe de France, Ligue 2 and beIN's
// other rights, so the league name is required in the title. All 7 hits are
// titled "… | HIGHLIGHTS Ligue 1 | MM/DD/YYYY | beIN SPORTS USA".
const COMPETITION_TITLE_TOKENS: Record<string, string[]> = {
  ncaavb: ["volleyball"],
  nationschamp: ["nations championship"],
  facup: ["fa cup"],
  laliga: ["laliga", "la liga"],
  ligue1: ["ligue 1"],
  // ncaawh: ECAC Hockey posts the men's and the women's cut of the same two
  // schools, often the same weekend. "women" is in every women's title and in
  // no men's title. The reverse token must be "ncaa men": "men" alone is a
  // substring of "women s" once punctuation folds to spaces. Atlantic Hockey
  // America's titles carry neither word, so that channel opts out through its
  // own empty list in collegeHighlightChannels.json (`ownTokens`).
  ncaawh: ["women"],
};

// NFL preseason — the same failure one season-phase over. The NFL channel
// carries the whole year, and a pair that meets in August can meet again in
// the regular season under the same two names and the same year; the week gate
// can't separate them because Game.weekNumber is deliberately null for the
// exhibitions (their Week 1–3 numbering collides with the regular season's).
// So a preseason card requires the title to say so. The tokens double as the
// worker's permission to accept the NFL's bare preseason title, which carries
// no "highlights" at all ("Detroit Lions vs Indianapolis Colts | 2026
// Preseason Week 3" — see isStrictBareNflPreseason in public/_worker.js). The
// Hall of Fame Game is titled "… | 2026 Hall of Fame Game Highlights", hence
// the second token. Mirrored by HL_NFL_PRESEASON_TOKENS in
// scripts/prebake-news.mjs — keep the two in sync.
const NFL_PRESEASON_TITLE_TOKENS = ["preseason", "hall of fame"];

// CFL playoffs — the week gate's blind spot. TSN titles the regular season by
// week ("CFL WEEK 13: …") and the postseason by ROUND with no year ("CFL
// EASTERN SEMI-FINAL: …", "CFL EAST FINAL: …", "GREY CUP: … | FULL
// HIGHLIGHTS"). Playoff cards carry no week (gridironWeekNumber), so with only
// the date gate both 2025 semi-finals resolved to a REGULAR-season meeting of
// the same two teams ("CFL WEEK 13: Montreal Alouettes vs. Winnipeg Blue
// Bombers" — probed 2026-09-13, 2/2 wrong). With the round from the card's
// playoffLabel as a title gate the same five 2025 playoff games read 5/5
// right. Mirrored by hlCflPlayoffTokens in scripts/prebake-news.mjs and
// cflPlayoffTokens in scripts/check-highlight-fallbacks.mjs — keep in sync.
export function cflPlayoffTitleTokens(playoffLabel?: string | null): string[] {
  const l = (playoffLabel ?? "").toLowerCase();
  if (/grey.?cup/.test(l)) return ["grey cup"];
  if (/semi/.test(l)) return ["semi final"];
  if (/east/.test(l)) return ["east final", "eastern final"];
  if (/west/.test(l)) return ["west final", "western final"];
  // A playoff game with no round in its label: any postseason title, never a
  // "WEEK N" one.
  return ["grey cup", "semi final", "east final", "eastern final", "west final", "western final", "playoff"];
}

export function getCompetitionTitleTokens(
  sport: string,
  opts?: { preseason?: boolean; playoff?: boolean; playoffLabel?: string | null },
): string[] {
  if (sport === "nfl" && opts?.preseason) return NFL_PRESEASON_TITLE_TOKENS;
  if (sport === "cfl" && opts?.playoff) return cflPlayoffTitleTokens(opts.playoffLabel);
  return COMPETITION_TITLE_TOKENS[sport] ?? [];
}

// Per-game fallback uploaders for the official slot, tried in order only after
// the primary channel misses. Empty for every sport without an entry in
// collegeHighlightChannels.json. See lib/collegeHighlights.ts.
const COLLEGE_HIGHLIGHT_CONFIG = collegeHighlightChannels as Record<string, CollegeHighlightConfig>;

export function getHighlightFallbackChannels(
  sport: string,
  primaryChannel: string | null | undefined,
  home: ChainTeam | null | undefined,
  away: ChainTeam | null | undefined,
  broadcasts: readonly string[] | null | undefined,
): FallbackChannel[] {
  return buildCollegeFallbackChain(COLLEGE_HIGHLIGHT_CONFIG[sport], primaryChannel, home, away, broadcasts);
}

// True for a sport with no fixed uploader whose official channel is the first
// channel of each game's chain (ncaavb). A game whose chain is empty stays dark.
export function highlightPrimaryFromChain(sport: string): boolean {
  return !!COLLEGE_HIGHLIGHT_CONFIG[sport]?.primaryFromChain;
}

// Returns the full curated fallback chain of YouTube channels to try for the
// 2nd highlight button, in priority order. Empty array means no curated
// options; callers must not substitute a generic search.
export function getSecondaryChannels(sport: string, label?: string): string[] {
  if (label) {
    const labelKey = `${sport}_${label.toLowerCase().replace(/\s+/g, "")}`;
    if (SECONDARY_CHANNELS[labelKey]) return SECONDARY_CHANNELS[labelKey];
  }
  // Fall back to the bare-sport key — mirrors getOfficialChannelName. Without
  // this the label-less entries (f1, ufc) were unreachable: a labelKey lookup
  // like `f1_<label>` never matches the bare `f1` key, so their curated chains
  // fell through to []. Golf callers pass a label that hits the labelKey above,
  // so their behavior is unchanged.
  return SECONDARY_CHANNELS[sport] ?? [];
}

// ESPN's `shortDisplayName` occasionally diverges from how official league
// channels title their highlight uploads (e.g. ESPN: "Red Bull NY", MLS
// channel videos: "New York Red Bulls"). Without a rewrite the
// strict channel-scoped /api/youtube lookup returns no results and the
// highlight button stays hidden.
const TEAM_NAME_ALIASES: Record<string, string> = {
  "Red Bull NY": "New York Red Bulls",
  // ESPN uses compact expansion-team names while WNBA titles spell out the
  // clubs. The strict resolver requires both teams, so query the title form.
  "Tempo": "Toronto Tempo",
  "Valkyries": "Golden State Valkyries",
  // ESPN names RPI by its full name; the ECAC Hockey titles say "RPI" ("RPI at
  // Mercyhurst | NCAA Women's Ice Hockey | …"). 0/2 strict without this.
  "Rensselaer": "RPI",
};

function aliasTeam(name: string): string {
  return TEAM_NAME_ALIASES[name] ?? name;
}

// Little League World Series: ESPN names a team for its CITY plus a state or
// country code — "Tacoma WA", "Leon NCA". ESPN's own recap titles use neither;
// they name the state or the country outright ("Washington vs. Alabama | Full
// Game Highlights | Little League World Series"). So the highlight query, the
// "open on YouTube" URL and the prebake's title check all have to ask for the
// mapped form. Keyed on the CODE, not the city: the qualifying city changes
// every year, the code does not.
//
// The table itself lives in llwsRegions.json so the two plain-node scripts that
// need it (prebake-news.mjs, check-highlight-fallbacks.mjs) read the SAME bytes
// this module does — they cannot import a .ts file, and hand-kept copies drifting
// apart would make the bake and the client disagree on matchup identity, at which
// point getChannelVerifiedBakedId rejects every entry the bake writes.

// College football titles spell the school out ("Western Kentucky Hilltoppers
// vs. Georgia Bulldogs"), but ESPN's shortDisplayName abbreviates it ("Western
// KY", "Arizona St", "E Michigan"), and the worker's both-teams gate then
// rejects the real upload. ESPN's `location` is the plain school name. Measured
// 2026-09-16 on the 9/12 slate against the live worker, strict on ESPN College
// Football: every game the short name found, the location found too, plus
// Western Kentucky–Georgia and Eastern Michigan–Michigan State.
// ncaavb (same date): location 11 hits over 143 conference-channel probes,
// shortDisplayName 1 over 35.
const LOCATION_NAME_SPORTS = new Set(["ncaaf", "ncaavb"]);

// Rewrite a team name into the form the sport's official uploader puts in its
// titles. Identity for every sport but LLWS and the LOCATION_NAME_SPORTS, so
// nothing else can regress. `location` is ESPN's team.location; when it is
// missing the short name stands.
export function highlightTeamName(sport: string, name: string, location?: string | null): string {
  if (LOCATION_NAME_SPORTS.has(sport)) return location?.trim() || name;
  if (sport !== "llws") return name;
  const code = name.trim().split(/\s+/).pop() ?? "";
  return LLWS_REGION_NAMES[code.toUpperCase()] ?? name;
}

function buildQuery(awayTeam: string, homeTeam: string, dateStr: string, seriesNote?: string | null, competition?: string | null): string {
  const head = `${aliasTeam(awayTeam)} vs ${aliasTeam(homeTeam)} highlights`;
  const parts = [competition ? `${head} ${competition} ${dateStr}` : `${head} ${dateStr}`];
  if (seriesNote) parts.push(seriesNote);
  return parts.join(" ");
}

// Build a YouTube search query for a specific completed round of a golf major.
// Example: getGolfHighlightQuery("Masters", 1, 2026) → "Masters 2026 Round 1 highlights"
export function getGolfHighlightQuery(label: string, round: number, year: number): string {
  return `${label} ${year} Round ${round} highlights`;
}

export function getGolfHighlightUrl(label: string, round: number, year: number): string {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(getGolfHighlightQuery(label, round, year))}`;
}

export function getApiBase(): string {
  if (typeof window === "undefined") return "";
  const proto = window.location.protocol;
  if (proto === "capacitor:" || proto === "file:") return "https://hidescore.com";
  return "";
}

// Running time (seconds) the /api/youtube lookup reported for each id it
// returned. Lets a live-resolved button show minutes like a baked one; ids the
// worker had no length for are simply absent.
const resolvedLengths = new Map<string, number>();
export function resolvedLengthSec(id: string | null | undefined): number | null {
  return id ? resolvedLengths.get(id) ?? null : null;
}

export async function fetchFirstVideoId(query: string, channel?: string, exclude?: (string | null | undefined)[], preferExtended?: boolean, strict?: boolean, raceTokens?: string[], weekNumber?: number | null, compTokens?: string[]): Promise<string | null> {
  try {
    let url = `${getApiBase()}/api/youtube?q=${encodeURIComponent(query)}`;
    if (channel) url += `&channel=${encodeURIComponent(channel)}`;
    // Competition title gate — see COMPETITION_TITLE_TOKENS. Pipe-separated to
    // match the `race` param's shape; empty for every sport that doesn't need it.
    if (compTokens?.length) url += `&comp=${encodeURIComponent(compTokens.join("|"))}`;
    // Motorsport race gate — the channel gate can't tell two races apart when
    // one channel uploads every round. See buildRaceTokens in lib/espn.ts.
    if (raceTokens?.length) url += `&race=${encodeURIComponent(raceTokens.join("|"))}`;
    // Gridiron week gate — the NFL analogue of the race gate. NFL recap titles
    // carry a week, never a date, so two meetings of the same teams in one
    // season are identical to the date and year gates. See Game.weekNumber.
    if (weekNumber) url += `&week=${weekNumber}`;
    const excludeIds = (exclude ?? []).filter((id): id is string => !!id);
    if (excludeIds.length) url += `&exclude=${encodeURIComponent(excludeIds.join(","))}`;
    if (preferExtended) url += `&prefer=extended`;
    // strict=1 tells the worker to oembed-verify the result's uploader equals
    // `channel` (drops title-only reupload matches). Only meaningful with a
    // channel; harmless otherwise.
    if (strict && channel) url += `&strict=1`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    if (data.videoId && Number.isFinite(data.lengthSec) && data.lengthSec > 0) resolvedLengths.set(data.videoId, data.lengthSec);
    return data.videoId ?? null;
  } catch {
    return null;
  }
}

// English (ESPN `shortDisplayName`) → Spanish nation name, so the Telemundo
// Deportes "resumen Copa Mundial" query is built with the name that channel's
// recap titles actually use. Any nation absent here falls back to aliasTeam()
// (i.e. the English name), which under-matches on a Spanish-language channel —
// so the map is kept complete across the qualified field. Spellings follow
// Telemundo's own usage (e.g. "Catar", "Arabia Saudita"). Keyed alphabetically.
const TELEMUNDO_WORLD_CUP_TEAM_ALIASES: Record<string, string> = {
  Algeria: "Argelia",
  Argentina: "Argentina",
  Australia: "Australia",
  Austria: "Austria",
  Belgium: "Bélgica",
  "Bosnia-Herzegovina": "Bosnia y Herzegovina",
  Brazil: "Brasil",
  Canada: "Canadá",
  "Cape Verde": "Cabo Verde",
  Colombia: "Colombia",
  "Congo DR": "RD Congo",
  Croatia: "Croacia",
  Curacao: "Curazao",
  Czechia: "Chequia",
  Ecuador: "Ecuador",
  Egypt: "Egipto",
  England: "Inglaterra",
  France: "Francia",
  Germany: "Alemania",
  Ghana: "Ghana",
  Haiti: "Haití",
  Iran: "Irán",
  Iraq: "Irak",
  "Ivory Coast": "Costa de Marfil",
  Japan: "Japón",
  Jordan: "Jordania",
  Mexico: "México",
  Morocco: "Marruecos",
  Netherlands: "Países Bajos",
  "New Zealand": "Nueva Zelanda",
  Norway: "Noruega",
  Panama: "Panamá",
  Paraguay: "Paraguay",
  Portugal: "Portugal",
  Qatar: "Catar",
  "Saudi Arabia": "Arabia Saudita",
  Scotland: "Escocia",
  Senegal: "Senegal",
  "South Africa": "Sudáfrica",
  "South Korea": "Corea del Sur",
  Spain: "España",
  Sweden: "Suecia",
  Switzerland: "Suiza",
  Tunisia: "Túnez",
  Turkiye: "Turquía",
  Uruguay: "Uruguay",
  USA: "Estados Unidos",
  Uzbekistan: "Uzbekistán",
  // Same fix fifaRankings.ts carries for these two nations: ESPN's scoreboard
  // commonly sends "DR Congo" and "Côte d'Ivoire", which normalize away from the
  // "Congo DR"/"Ivory Coast" primary keys above and would fall through to the
  // English name on a Spanish-language channel — the exact under-match this map
  // is meant to prevent. Alias each to the same Spanish name; the primary keys
  // stay put, and distinct nations can't collide under the normalization, so no
  // currently-resolving lookup regresses.
  "DR Congo": "RD Congo", // vs. "Congo DR"
  "Cote d'Ivoire": "Costa de Marfil", // vs. "Ivory Coast" (FIFA's official French name)
};

// Fold diacritics + typographic apostrophes and lowercase for lookup — the SAME
// normalization fifaRank() uses (fifaRankings.ts), which this Telemundo map's raw
// exact-match lookup previously skipped. ESPN's shortDisplayName can arrive
// accented ("Türkiye", "Curaçao"), and an exact index against the plain-ASCII
// keys ("Turkiye", "Curacao") then missed and fell through to the English name on
// a Spanish-language channel, silently dropping the Telemundo highlight button for
// those nations. Normalizing both sides resolves the variant; a plain-ASCII name
// normalizes to its own lowercased key, so every currently-working lookup is
// unchanged (distinct nations can't collide under case/diacritic folding).
function normalizeTeamName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip combining diacritical marks
    .replace(/[‘’]/g, "'") // fold curly apostrophes to ASCII
    .toLowerCase()
    .trim();
}

const TELEMUNDO_ALIASES_NORMALIZED: Record<string, string> = Object.fromEntries(
  Object.entries(TELEMUNDO_WORLD_CUP_TEAM_ALIASES).map(([k, v]) => [normalizeTeamName(k), v]),
);

function telemundoWorldCupTeam(name: string): string {
  return TELEMUNDO_ALIASES_NORMALIZED[normalizeTeamName(name)] ?? aliasTeam(name);
}

function buildTelemundoWorldCupQuery(awayTeam: string, homeTeam: string, dateStr: string, seriesNote?: string | null): string {
  const head = `${telemundoWorldCupTeam(awayTeam)} vs ${telemundoWorldCupTeam(homeTeam)} resumen Copa Mundial`;
  const parts = [`${head} ${dateStr}`];
  if (seriesNote) parts.push(seriesNote);
  return parts.join(" ");
}

export async function resolveTelemundoWorldCupVideo(
  awayTeam: string,
  homeTeam: string,
  dateStr: string,
  seriesNote: string | null | undefined,
  exclude?: (string | null | undefined)[],
  preferExtended?: boolean,
): Promise<string | null> {
  return fetchFirstVideoId(
    buildTelemundoWorldCupQuery(awayTeam, homeTeam, dateStr, seriesNote),
    "Telemundo Deportes",
    exclude,
    preferExtended,
    true,
  );
}

// Resolve a per-game highlight against one exact uploader. There is no
// unscoped tier: a missing channel or strict miss returns null and the caller
// hides the button rather than serving a re-upload.
export async function resolveHighlightVideo(
  awayTeam: string,
  homeTeam: string,
  dateStr: string,
  seriesNote: string | null | undefined,
  channel?: string,
  exclude?: (string | null | undefined)[],
  competition?: string | null,
  preferExtended?: boolean,
  weekNumber?: number | null,
  compTokens?: string[],
): Promise<string | null> {
  const datedQuery = buildQuery(awayTeam, homeTeam, dateStr, seriesNote, competition);
  if (!channel) return null;
  return fetchFirstVideoId(datedQuery, channel, exclude, preferExtended, true, undefined, weekNumber, compTokens);
}
