# HideScore — Master Backlog

## 2026-09-14 — NCAA baseball (`ncaabase`) + NCAA softball (`ncaasoft`) columns

**Built 2026-09-14 on `feat/ncaa-baseball-softball`, not yet merged** — one commit, both leagues, same shape
as `ncaah` (`67aa805e`). Both are offseason until February, so nothing shows on the board until then; the tables,
the TV catalog and the window checker are in place before the openers. Config, not code: ESPN serves
`/baseball/college-baseball` and `/baseball/college-softball` in the standard scoreboard shape. Windows are ESPN's
2026 calendar (baseball 02-13 → 06-22 CWS final G3; softball 02-05 → 06-04 WCWS finals G2), `verifiedFor: 2026`,
endDate padded one day past the final like NBA/NHL/NFL. Opt-in (`excludeFromAuto`), Settings → US leagues,
share codes `cb` / `cs`, TV catalog `SUPPORTED`, headers "NCAA BSB" / "Softball" on a phone. Softball is SEVEN
innings (`regulationPeriods: 7`); run-rule finals (`Final/5`) still rate. Live cards read `▲5` / `▼7` / `▲1 Rain`
like MLB. `isPlayoff` = season type 6 (ESPN files the whole NCAA tournament as `championship-series`) or a
regional / super regional / world series / championship note, scoped to the two sports. Poll rank on
`curatedRank` (Top 25), same path as NCAAF / NCAAH. r/collegebaseball card + bake + staleness monitor; softball
has NO reddit card (no sub with volume).

Three changes from the plan, all on evidence:
- **Team-picker logos ride the team `guid`, not `ncaa/500/<id>`.** These sports' team ids are their own
  (softball OU = 524, baseball UCLA = 66); the school-id path 404s for 5 of 6 softball ids and 2 of 8 baseball.
  The core teams payload carries `guid` for 344 / 342 of 400 teams, and `a.espncdn.com/guid/<guid>/logos/default.png`
  is the logo ESPN itself puts on the event (5/5 sampled per sport = 200). No guid → no logo, never a broken image.
- **Picker limit 400 → 500.** College baseball lists 437 teams, softball 446; the old cap dropped the tail.
- **endDate 06-23 / 06-05, not 06-22 / 06-04.** The WCWS final is 8 PM ET = 00:00Z on 06-05 and the window checker
  reads UTC dates, so a 06-04 close reported "closes 1d before the last game". `championshipDate` stays on the real day.

**Highlights are dark** (`NO_HIGHLIGHT_FALLBACK`). Strict probe on the live worker, "NCAA Championships", 8
completed 2026 fixtures: postseason 4/6 correct (CWS finals G1, a CWS double-elimination game, WCWS finals G1, a
WCWS double-elimination game) and BOTH finals Game 2 probes served the Game 1 cut; regular season baseball "No
results", softball Michigan–Wisconsin 4/18 served "Wisconsin vs. Michigan State – 2026 NCAA HOCKEY regional
final". Same shape as ncaah; the monitor does not scan either, a regression check keeps them dark and unmonitored.

**Proof:** tsc, eslint (0 errors), test:unit (297, incl. new `college-baseball-playoff-flag` + live-progress cases),
highlights:check, news:check, poker:check, tv:catalog:check, `check-season-windows --only=ncaabase,ncaasoft` ✓✓,
`next build` all green. Headless-Chromium read-back against the local static build, clock fixed: 4/18 Today =
138 cards (81 baseball + 57 softball, no cap, every game on the column), 276 logos, 0 broken, 52 poll chips
("Top 25 ranking: #N"), 0 highlight buttons, Settings opens in <100 ms; 6/21 = the CWS final (UNC #5 vs OU), 6/4
= the WCWS final (Texas #2 vs Texas Tech #11), 2 logos each, 0 broken; phone 390px = "NCAA BSB" / "Softball"
headers, 0 overflow; fresh profile 9/14 = column absent, both Settings rows OFF with "· offseason", ticking adds
both to the switcher and the slot dropdown; fresh profile 4/18 = tick + pick in slot 2 adds the column. (An
offseason league picked into a slot in September renders no column — same as `ncaah` today, not this change.)

**Open:**
- [ ] 2027 windows: ESPN publishes ~December. Re-read in January; the twice-monthly checker reports them
      unverified until then.
- [ ] Softball reddit card — no sub with volume found (r/collegesoftball near-empty; reddit 429'd the probe
      from this IP on 9/14, re-check).
- [ ] Postseason-only highlight channel gate (shared with hockey) would light the CWS / WCWS. Note the Game 2 →
      Game 1 collision even inside the postseason; the real query carries the `Game N` seriesNote, re-probe with it.
## 2026-09-14 — UFL spring football (`ufl`) gets a column of its own

**✅ Shipped 2026-09-14** — `5ac45ddb`. Deploy run 34856081688 green; `hidescore.com/tv/catalog.json` lists
`ufl`. Production read-back (same `qa/readback.mjs`, `BASE=https://hidescore.com`): 6/13 = 1 card, 2 logos,
0 broken, 0 chips; 4/18 = 2 cards, 4 logos, 0 broken; pre-game mock = ABC chip + #4/#3; live mock =
`Q2 - 8:32`; fresh profile = column absent, "UFL · offseason" row OFF, tick works.
Config, not code, same as NCAA hockey: ESPN serves
`/football/ufl/scoreboard` in the standard two-competitor shape (probed 2026-09-14: abbr UFL, four
quarters, records "6-4", `curatedRank` 99 placeholders — no poll, so NOT in `POLL_RANK_SPORTS`; the
United Bowl carries `season.type` 3, so `isPlayoff` needs nothing new). Window is ESPN's own fixture
list: first kickoff Fri 2026-03-27, United Bowl Sat 2026-06-13 on ABC, 43 games (`verifiedFor: 2026`;
`check-season-windows --only=ufl` ✓). Opt-in (`excludeFromAuto`), listed in Settings → US leagues,
picker after NCAA Hockey, share code `uf`, glyph 🏈, TV catalog `SUPPORTED`, r/UnitedFootballLeague
reddit card + bake + staleness monitor (SEASONAL: quiet Jul–Feb). Rating config, `PERIOD_SECONDS`
900, live labels (Q1–Q4 / OT / Halftime / End of Q3) and `END_OF_PLAY_REGULATION` 4 mirror the NFL.
Game page = `espn.com/ufl/recap/_/gameId/<id>` (`/game/` 404s); stream fallback = FOX Sports live
(13 of the 22 May–June fixtures were FOX/FS1). 2027 dates are unpublished.

Four changes from the plan, all on evidence:
- **Window is 03-25 → 06-14, kickoff 03-27** (plan said 03-12 / 03-14 off the calendar's "Regular
  Season" start). The calendar opens two weeks before any fixture; the first game was Mar 27.
- **`RANK_LEAGUES` includes `ufl`.** The standings feed is one flat 8-team table with a real
  `winPercent` and no per-row `rank`, so the win% sort gives a league-wide "#N" on upcoming cards.
  `MIN_RANK_GAMES` 2 (10-game season). No `overall` record stat — W-L comes from the event.
- **The reddit sub is r/UnitedFootballLeague, not r/UFL.** r/UFL is the University of Florida
  (its hot feed is dorm and course posts); r/UFL_Football stopped in Feb 2025; r/xfl is frozen at 2024.
- **Highlights are dark** (`NO_HIGHLIGHT_FALLBACK`). Strict probe against the live worker on 5
  completed 2026 fixtures (Stallions–Storm 5/3, Defenders–Kings 5/16, Renegades–Battlehawks 5/29,
  Defenders–Storm semi 6/7, Defenders–Kings United Bowl 6/13): "UFL" 0/5, "FOX Sports" 0/1, "ESPN"
  0/1. Unscoped winners were fan channels ("Cincinnati Bengals / Oklahoma Sooners fan", "Mr. Mane").
  `gridironWeekNumber` leaves `ufl` out. The monitor does not scan it; a regression check keeps it
  dark and unmonitored.

**Proof:** tsc, eslint (0 errors), test:unit (292, incl. a new `ufl` live-progress case), highlights:check,
news:check, poker:check, tv:catalog + tv:catalog:check (34 leagues, `ufl` in both catalog.json copies),
`next build` all green. Headless-Chromium read-back against the static build, clock pinned
(`qa/readback.mjs`): 6/13 United Bowl = 1 card, 2 logos, 0 broken, 0 rank chips, 0 highlight buttons;
Sat 4/18 = 2 cards, 4 logos, 0 broken; ESPN payload rewritten to pre-game = "3:00PM · ABC" chip and
#4 / #3 standings chips; rewritten to live = `Q2 - 8:32`; fresh profile on 9/14 = column absent,
Settings row "UFL · offseason" OFF, tick works; on 4/18 the switcher lists UFL and picking it adds the
column (the switcher omits every opt-in offseason league, so on 9/14 it is absent there by design).
The plan expected 4 cards on a Saturday — the 2026 UFL spread games Tue–Sun, so a day peaks at 2.

**Open:**
- [ ] 2027 window re-read when the UFL publishes its schedule (usually January): kickoff, United
      Bowl, and whether the Tue/Thu games stay.
- [ ] Highlight re-probe once the 2027 season starts: if the "UFL" channel starts posting per-game
      cuts, light it (`OFFICIAL_CHANNELS` + `HL_LEAGUES` + the three fallback-monitor maps).
- [ ] Mid-season 2027: confirm the standings win% chip reads right after week 2 (`MIN_RANK_GAMES`).

## 2026-09-12 — NCAA men's hockey (`ncaah`) gets a column of its own

**✅ Shipped 2026-09-12** — `67aa805e` (league add), `6edcced5` (in-season tournaments like Ice Breaker /
Governor's Cup no longer set `isPlayoff`, so a shootout reads SO), `33794261` (the highlight monitor reads the
worker's club alias table). Deploy run 34732388520 green; `hidescore.com/tv/catalog.json` lists `ncaah`.
Production read-back on the mini: fresh profile = no NCAA Hockey column, Settings row OFF, tick + pick adds it;
10/3 column = 15 cards, 30 logos, 0 broken, 0 rank chips, 0 highlight buttons; mocked live = `P2 - 8:32` /
`OT - 2:10` / `SO`; RIT team page loads its schedule. Config, not code, same as
Little League: ESPN serves `/hockey/mens-college-hockey` in the standard scoreboard shape. Window is
ESPN's calendar, 2026-10-02 → 2027-04-10 (`verifiedFor: 2026`). Opt-in (`excludeFromAuto`), listed in
Settings → US leagues, share code `hc`, TV catalog `SUPPORTED` (not `DEFAULT_ON`), r/collegehockey
reddit card + bake + staleness monitor. Rating config and period labels mirror the NHL (P1–P3 / OT /
SO, tournament multi-OT via `isPlayoff`).

Two changes from the plan, both on evidence:
- **Rank = the USCHO poll on the event, not standings.** The standings feed held ONE entry across its
  10 conference groups on 2026-09-12 (Ohio State, "24-0-0" with 26 GP), so a win% sort would crown a
  bogus #1. `ncaah` rides the NCAAF poll path (`pollRank.ts`); it stays out of `RANK_LEAGUES`.
- **Highlights are dark** (`NO_HIGHLIGHT_FALLBACK`). Strict probe on 7 completed 2026 fixtures: "ESPN"
  0/7. "NCAA Championships" posts per-game cuts for the TOURNAMENT (4/5 postseason hits) but returned
  the WRONG game for a regular-season query (Michigan–Minnesota 1/17 → Michigan–Minnesota Duluth
  regional final). The monitor does not scan `ncaah`; a regression check keeps it dark and unmonitored.

**Proof:** tsc, eslint (0 errors), test:unit, highlights:check, news:check, poker:check,
tv:catalog:check, `next build` all green; `check-season-windows --all` shows NCAA Hockey ✓ (its only ✗
is WNBA, same on main). Hidden-Chromium read-back on the mini against the local build, clock fixed:
10/3 Today = 15 cards, 30 logos, 0 broken, 0 rank chips, 0 highlight buttons; mocked live scores read
`P2 - 8:32` / `OT - 2:10` / `SO`; 1/17 Yesterday = 26 cards, 16 poll chips, 0 highlight buttons;
fresh profile = column absent, Settings row OFF, ticking it adds it to the switcher and picking it
adds the column.

**Open:**
- [ ] Postseason-only channel gate so the NCAA tournament (late March → Frozen Four 4/8–4/10) gets
      "NCAA Championships" highlights without the regular-season wrong-match risk.
- [ ] NCAA women's hockey (`ncaawh`): ESPN 200, 2026-09-18 → 2027-03-23, ~19 games a Saturday, no
      standings. ~30 min on the same pattern. Jacob decides.
- [ ] Re-check the standings feed mid-season; if it fills in, W-L records have a source (the PTS tail
      is already stripped).

## 2026-09-06 — NFL preseason cards were dark: the league dropped "Highlights" from its 2026 exhibition titles

✅ **Jacob 9/6 ("nfl at least highlights link or something? whats optimal, isnt there highlights
existing but this is blank?"), screenshot of the NFL column on the Last played · Sat 8/29 board:
Lions–Colts and Bears–Titans with no button.** The clips exist — `Detroit Lions vs Indianapolis
Colts | 2026 Preseason Week 3` and `Chicago Bears vs Tennessee Titans | 2026 Preseason Week 3`,
both on the NFL channel, both at **rank 1** of the exact results page the worker scrapes for the
card's own query. What changed is the title: through 2025 the exhibitions were "… Game Highlights
| 2025 Preseason Week 2"; every 2026 cut (32 of 32 across Weeks 1–3) is the bare "Away vs. Home |
2026 Preseason Week N", and the worker's highlight-keyword filter (`highlight`/`recap`) dropped
each one. Not recall, not timing, and not the embed block. On "what's optimal": the NFL is in
`EMBED_BLOCKED_CHANNELS`, so the button is the hand-off-to-YouTube card either way — that IS the
ceiling; the 32 club channels block game footage the same way (`nflTeamChannels.ts`) and ESPN
ships no NFL highlights at all.

**Fix (branch `fix/nfl-preseason-highlights`, worktree `~/hs-nfl-pre`):** a preseason card
(`Game.isPreseason`) now sends `comp=preseason|hall of fame`, and the worker accepts the bare NFL
preseason title as a highlight only under that token and only from the strict NFL channel
(`isStrictBareNflPreseason`, the WNBA bare-recap shape). The token is also the safety: no week is
sent for an exhibition (its Week 1–3 numbering collides with the regular season's), so the title
having to say "preseason" is what keeps the same pair's regular-season recap off an August card —
and a regular-season lookup is byte-identical to before (without the token the bare titles stay
rejected; replayed). `nss_comp` now rides the modal fallback URL and `VideoModal`'s retry
re-applies it, which closes the same gap for rugby's Nations Championship. The prebake mirrors it
per event (`HL_NFL_PRESEASON_TOKENS`, `preseason` on the item). One league typo tolerated:
`Houston Texans vs. Carolina Panthers | 2026 PreseasonWeek 3` (no trailing word boundary).

**Proof:** the real card requests replayed through the patched worker in Node (curl-backed
fetch): **32/32** of Preseason Weeks 1 + 3 resolve to the NFL's own preseason cut, 0 wrong; the
Hall of Fame Game resolves (its title does say Highlights); the Commanders@Giants Week 15 2025
control is unchanged; the preseason query without the token stays dark. `scripts/check-nfl-weeks.mjs`
gained the plumbing checks (24/24) and a `--live` preseason leg on the 8/29 slate; `npm run
highlights:check`, `test:unit` (213), tsc and eslint all green. ⚠️ The 8/29 cards resolve LIVE
(one scrape per card) — the bake only looks at today/yesterday, so those two games were never
baked and won't be. The regular season opens Wed 9/9 and needs none of this.

✅ **SHIPPED `bd2ede2d` 9/6** (rebased over the two card-height commits, CI deploy green).
Live-verified three ways: the deployed worker answers the exact card requests with
`zPOLpNquCCU` / `tqqbRB2uu2g` and stays dark without the token; `check-nfl-weeks.mjs --live`
= 14/14 Week 15 2025 controls unchanged + 2/2 preseason; headless Chromium on hidescore.com,
NFL column, date arrow back to Sat 8/29 → both cards render the `NFL` button at 112px
(`~/hidescore-nfl-preseason-live-2026-09-06.png`). ⚠️ On the 9/6 board the NFL column now
shows the Wed 9/9 opener (lookahead), so the 8/29 cards are reached with the ‹ date arrow, not
the lookback header in the screenshot. ⚠️ `/_next/static` chunks are cached 4h (`max-age=14400`,
names aren't content-hashed) — a Safari tab open before the deploy may need Cmd+Option+R.

## 2026-09-05 — Card height floor: the MLB card is the height every finished card should be; why Friday's college cards had no clip

✅ **Jacob 9/5 ("set a strict rule that the size of the MLB cards height are the height each card
should be … I still see other leagues cards being smaller"), screenshots of the yesterday board:
MLB with its 3m/10m beside NCAAF cards one row shorter.** The row is the whole difference — a
finished card with a clip is 109px on desktop, one without was 74px. This is the third pass over
that row: `f2deaf2d` (8/9) reserved it on every finished card, `f8522ad5` (8/11) took it back
because a slate where NOTHING resolves wore a blank band under every card ("bigger box not until
it has actual highlight", Jacob 8/10). The new rule keeps both: **a finished card reserves the
button row the moment ANY card on the board has earned one, and not before.** One CSS rule
(`main:has(.hl-slot .highlight-btn) .hl-slot { min-height }` in `globals.css`); the `.hl-slot`
wrapper goes on finished GameCards, event tiles and UFC bouts only, so the details popup's copy
of GameHighlights can never trip it. `display: flow-root` on the slot keeps the row's margin
inside it — without that the margin collapses out and a card with a button measures one margin
taller than the reserve. Measured on the mixed slate (border-box): card 111/111 desktop, 107/107 phone single-column;
slot = button row = 35 (sm) / 31, button 27. `card-height-parity.spec.ts` now asserts all three shapes — mixed
slate lines up, nothing-resolves stays collapsed, and the floor crosses columns (the screenshot).
⚠️ Not covered on purpose: an UPCOMING card (meta row, no clip yet) is still one row shorter than
a finished card with a clip on today's board — same as before; say so if that should join the floor.

🔎 **Why three of Friday's NCAAF cards had no highlight (not timing — by 9:46am the ESPN channel
had already posted OU–UTEP, Miami–Stanford and Kansas–LIU from the same night).** Both NCAAF
buttons are strict-gated to the `ESPN College Football` channel, and ESPN posts a cut only for
games on its own networks. The blanks were **BTN** (Indiana St–Purdue) and **ESPN+** (SJSU–E
Michigan, NC A&T–Georgia St); the FOX/FS1 games (Fresno St–USC, Toledo–Michigan St) are dark the
same way. Verified live against the worker with `strict=1`: `Big Ten Network` has a clean
per-game cut for ALL THREE Big Ten games (`Indiana State vs. Purdue | Highlights | Big Ten
Football | 09/04/26`, plus USC and Michigan St), `SEC` has one for OU–UTEP; FOX's own channels
have nothing, and the two ESPN+ games have nothing on YouTube at all. The fix is a
conference-network secondary for NCAAF (BTN + SEC verified today; ACC/Big 12 to verify), wired
through the prebake so it isn't a live scrape per card. Open call, not built.

## 2026-09-04 — Grand Slam cards were dark for four tournaments; rugby joins the bake; three open calls on uploader gaps

✅ **The bug Jacob reported ("us open highlights for yesterday not showing up properly …
cards not same size as MLB cards") was one missing prop, in four places.**
`LeagueColumn`'s **main-slate** `<GameCard>` call sites — past-date, live, pre and finished —
never passed `leagueLabel`, while the three helper paths (`renderCondensed`,
`renderUpcomingSlate`, `renderPreviousSlate`) always did. For every league whose approved
uploader is keyed on the **sport** (`OFFICIAL_CHANNELS.wnba`, `.mlb`, …) the omission costs
nothing, because `getOfficialChannelName` falls through to the bare sport key. **Tennis and
golf are the only sports whose channel exists ONLY under `${sport}_${label}`**, so
`getOfficialChannelName("tennis", undefined)` returned null →
`hasNoTrustedHighlightSource` went true → `highlightUrl` was nulled → the prefetch effect
returned before ever reading the manifest. Every Slam card lost its button, and because that
row is what makes a finished card full height, sat one row shorter than the MLB cards beside
it. Fixed in `e7c8ed47`; live read-back after deploy shows **30 `US Open Tennis Championships
highlights` buttons at card height 109**, identical to MLB and WNBA.

⚠️ **Why it survived four Grand Slams.** Single-column mode DID pass the label, so the bug was
invisible on a phone. And `scripts/check-highlight-fallbacks.mjs` resolves against the
tournament channel **directly**, so the monitor that exists to catch exactly this never
exercised the UI's label plumbing at all. A green monitor was reporting on a code path no
reader was using. The guard added below asserts the prop, not the lookup.

✅ **Rugby is in the bake** (`1b230e39`). Six Nations, Super Rugby Pacific, Rugby World Cup and
the Nations Championship each already had an approved uploader and a highlight buffer, but
were never in `HL_LEAGUES` — so every rugby card fell through to a **live per-card
`/api/youtube` scrape**, the same slow path Liga MX was pulled off on 2026-08-11. That is
worse than slow: bursts of live lookups soft-block the Worker's **shared IP**, which breaks
highlights for real readers, and a Six Nations Saturday is three matches times every reader.
Nations Championship also needed the competition gate to come with it — World Rugby uploads
the **U20 Junior World Championships between the same nations** in the same window, and
neither the uploader gate nor the both-teams gate separates them. `hlFetchId` now sends
`comp=` the way it already sent `week=`, and carried entries revalidate through
`hlVideoMatchesComp`. `rugbychamp` and `rugbytest` stay out, matching `NO_HIGHLIGHT_FALLBACK`:
no approved channel means nothing to bake against.

📊 Verified against **real finished fixtures**, not "the path returns 200": Six Nations
2026-03-14 3/3, Super Rugby 2026-06-20 1/1, Nations Championship 2026-07-11 4/6 — every hit
oEmbed-checked for uploader, both teams, and the competition token. The two misses have no
clip at all. First mini bake carrying this code finished **1:07 pm, zero errors**; rugby keys
are legitimately 0 today because no rugby competition is in season.

✅ **`tests/label-keyed-channels.test.ts`** — hermetic, in the suite that gates the deploy.
Three assertions, each proven to fail when its bug is reintroduced: every `<GameCard>` in
`LeagueColumn` is handed its league label; every label-keyed `OFFICIAL_CHANNELS` entry is
reachable from a label that still exists (unless a reachable sibling names the same channel);
and **the set of sports with no bare key is exactly `{esports, golf, tennis}`**, so adding a
fourth has to be a decision rather than an accident. `unit-tests.yml` also gained
`LeagueColumn.tsx` / `GameHighlights.tsx` in its path filter — without them the one file the
guard watches was the one file that could not trigger it on a PR.

🗑️ **A spec had been failing for three and a half weeks and it was not a regression.** "NFL
embed failure retry preserves the NFL channel gate" broke at `bf2d2ec6` (2026-08-10), which
put `"NFL"` in `EMBED_BLOCKED_CHANNELS`: `VideoModal` short-circuits to the "Watch on YouTube"
card on the first frame and never mounts a player, so there is no `onError`, no retry, and no
request to assert on. Retargeted to WNBA, plus a new NFL test for what it actually does.
⚠️ Separately, the six `league-switcher-defaults` failures were **60-second timeouts from
running `fullyParallel` against one dev server** — at `--workers=1` all eight pass in 22s.
Harness contention, not product. Re-run that suite single-worker before believing it.

⭐ **`npm run gaps:audit`** (`scripts/audit-highlight-gaps.mjs`) — a missing highlight button
has four causes that look identical from outside, so the script names which: **BAKED** /
**BAKE-GAP** (bake missed it, live lookup still finds it) / **NO-RECAP** (uploader has
nothing — the button is supposed to be missing) / **WRONG-OWNER** (a clip exists but on the
wrong channel). Only WRONG-OWNER needs a person. It reads `SPORT_PATHS` and
`OFFICIAL_CHANNELS` **out of the app** rather than keeping a third copy, because a drifted
copy is what let `check-highlight-fallbacks.mjs` call tennis healthy while every Slam card was
dark. Paced at 8s/lookup with a hard floor — same shared-IP reason as above.
Sep 3: `BAKED 6 · NO-RECAP 6 · WRONG-OWNER 2 · BAKE-GAP 0`. Sep 2: `BAKED 1 · WRONG-OWNER 3`.

### Three open calls, all needing Jacob

⚠️ **1. `Boro` never matches `Middlesbrough` — every Middlesbrough match is dark even though
EFL posted it.** ESPN's `shortDisplayName` is "Boro"; EFL titles it "Burnley v Middlesbrough
Highlights". Proven Sep 2: strict `channel=EFL` query returns **none** for `Boro v Burnley`
and **`d-FQ6il01As` (EFL)** for `Middlesbrough v Burnley`. The worker has no boro/middlesbrough
alias at all. One alias entry.
⛔ **Correction for anyone reading the chat log: the EFL channel is NOT stale or empty.** An
earlier probe of `youtube.com/@EFL` found a different, uploadless channel with the same
handle and briefly suggested swapping the channel string — wrong. The manifest carries **11
baked `efl:` entries** with `officialChannel: "EFL"`, most recent 2026-09-02, oEmbed-confirmed
as author `EFL`. Do not touch the channel string. The other two Sep-2 misses (Wrexham v
Millwall, Cardiff v QPR) are genuine: EFL did not post them, only the club channels did.

⚠️ **2. La Liga's stated reason in the repo is out of date.** `LALIGA EA SPORTS`
(UCTv-XvfzLX3i4IGWAm4sbmA) **does** post a per-match resumen daily (e.g. "REAL SOCIEDAD 0 - 0
CELTA | RESUMEN LALIGA EA SPORTS", 2026-09-03), and `isScoreSpoiler` already flags those
titles so the bar would stay masked. It is dark because our query is **English + dated** while
their titles are **Spanish + undated**, plus name drift ("Celta Vigo" vs "CELTA") — strict
lookups 404'd on all three fixtures tried. Needs a Spanish query variant + alias map, the same
shape as the existing Telemundo World Cup path. The comment claiming "Spanish-language full
matches rather than clean per-match highlights" should be corrected either way.

⚠️ **3. Two NCAAF games are owned by Conference USA, not ESPN College Football**
(Merrimack v Delaware, West Georgia v Kennesaw St, 2026-09-03). Either add C-USA as a
secondary NCAAF channel or accept those staying dark. ✅ **Ligue 1 needs nothing** — channel
is `Ligue 1 McDonald's` (curly apostrophe, UCQsH5XtIc9hONE1BQjucM0g), feed is shorts, clips
and documentaries only, no per-match recaps. Correctly dark.

⚠️ **Two Claude sessions pushed to `main` concurrently this afternoon** (`c1aaa94e`,
`b373ffc2` landed mid-session; `b373ffc2` refines the same highlight-gaps spec touched here).
Nothing was lost, but rebase before assuming your worktree is current.

## 2026-08-13 — `rugbytest` gated to ODD years (closes the empty-column question)

✅ **The open call from the 8/12 entry is decided: gate it, don't leave it.** `rugbytest`
(ESPN 289234) now carries `yearCycle {mod:2, anchor:2027}` — the exact complement of
`nationschamp`'s `anchor:2026`, so **exactly one of the two columns is live in any year.**
Re-confirmed zero events on 289234 for 2026-06-15, 2026-07-11 and 2026-11-07 before
changing anything.

**Why gate rather than leave it:** `excludeFromAuto` kept it out of the auto-picker but NOT
out of the switcher, so it was addable and then empty for the whole `04-03 → 11-13` window.
Eight months of a column that says it is in season and shows nothing reads as broken. With
the gate, 2026 drops it from `thirdLeagueOptions` entirely and the season-opener probe walks
forward to **Apr 2027** ("Returns ~Apr 3"), which is the answer someone opening it wants.

🗑️ **Dropped `verifiedFor: 2026`** — it asserted a 2026 opener now known not to exist. Left
absent rather than moved to 2027: the 2027 window is inherited from ESPN's generic calendar,
not confirmed against a published schedule.

⚠️ **2027 is a Rugby World Cup year (Oct–Nov, Australia), so re-verify the window before the
season** — the autumn half of `04-03 → 11-13` will likely be swallowed by `rugbywc` and the
real content is the July warm-ups.

📊 Verified: `tsc --noEmit` clean, 39/39 unit tests, `npm run build` clean, GHA `6836506b`
green on all three workflows, and the **LIVE prod bundle** confirmed carrying
`sport:"rugbytest",…,yearCycle:{mod:2,anchor:2027}` with no `verifiedFor`. Gate truth table
(2026 Apr/Jul/Nov → Tests off, Nations on · 2027 → Tests on, Nations off · 2028 → flips back).

## 2026-08-12 — Nations Championship shipped (league request); the U20 wrong-match trap and the `comp=` gate; rugby was unmonitored

✅ **`nationschamp` — World Rugby's Nations Championship, ESPN path `/rugby/17567`.** Opt-in
(`excludeFromAuto`), "Racing, combat & more", labeled **"Rugby Nations"**, biennial
(`yearCycle {mod:2, anchor:2026}` — every non-RWC, non-Lions year is even). Window
`07-04 → 11-29` from ESPN's own published calendar: **36 fixtures, the 18 July pool
matches complete, the November leg scheduled, the finals weekend TBD.**

⚠️ **It REPLACED the July/November test windows — it is not an extra column.** `The Rugby
Championship` (path 244293) is frozen on its **2025** season for that reason, and
**`rugbytest` (289234) returns ZERO events for every 2026 date checked**, so there is no
duplicate-fixture overlap. Do not "fix" rugbytest's empty column by pointing it here.

🚨 **The channel gate alone would have served WRONG MATCHES.** `World Rugby` strict-resolved
**13/18** July fixtures — and **three of those thirteen were U20 Junior World Championships
matches**. That tournament runs in the same July window between the same NATIONS, so
"Italy v Japan | Junior World Championships 2026" satisfies the channel gate, the
both-teams gate AND the year gate for the senior Italy–Japan fixture on the same day. That
is a wrong scoreline on a card whose whole promise is not leaking one.

🆕 **Fix = a new `comp=` COMPETITION TITLE GATE** in `public/_worker.js` — the race gate's
sibling for team sports (`compTitleMatches`, pipe-separated, OR across tokens, driven by
`COMPETITION_TITLE_TOKENS` in `src/lib/youtube.ts`). Empty token list = no gate, so every
other sport is byte-for-byte unchanged (verified: an MLB lookup returns the same video).
It is also excluded from the raw-regex rescue tier, the exact hole the race gate fell
through on 2026-08-04.

⚠️ **Query text stays BARE.** Appending the competition name is a measured false-negative
generator on rugby (World Rugby: 0/3 with "Rugby World Cup" appended, 5/5 without).
**Recall comes from the bare query, precision from the title gate.**

📊 **Verified END-TO-END against a LOCAL `wrangler pages dev` worker over all 18 completed
fixtures, both channels, gate live:**

| | result |
|---|---|
| coverage | **15/18** fixtures show a highlight button |
| wrong-competition hits | **0** (was 3 without the gate) |
| `World Rugby` (primary) | 10/18 correct |
| `Super Rugby Pacific` (secondary) | covers 5 more — the southern-hosted fixtures World Rugby skips |

- **⛔ NOT "SANZAAR TV".** It wins the UNSCOPED search for several of these and looks like the
  obvious answer — **0/5 on strict.** Verified, not assumed.
- **3 uncovered, knowingly:** Italy–Japan 7/4 (only a U20 video exists), Italy–Australia 7/18
  (neither channel posted it), Ireland–New Zealand 7/18 — the last is the gate's **one true
  positive cost**: Super Rugby Pacific has the right match under the title "July
  Internationals | New Zealand v Ireland - Third Test Highlights", which never says Nations
  Championship. Correct trade — a hidden button is recoverable, a wrong score is not. **Do
  NOT widen the token to "july internationals"**: generic enough to match a plain test.

🚨 **Rugby has been shipping UNMONITORED since 8/11.** `scripts/check-highlight-fallbacks.mjs`
had OFFICIAL_CHANNELS entries and buffer/period rows for the rugby leagues but **no
`ESPN_PATHS` row**, so the audit never fetched a single rugby fixture. Added
`sixnations`/`superrugby`/`rugbywc`/`nationschamp`; the checker now also sends `comp=`, without
which it would accept a U20 video and report green on a button the app is hiding.

🧹 **Two consistency fixes found on the way:**
- The rugby keys were **missing from `highlightBufferHours`** in `GameHighlights.tsx`, taking
  the 4h default while the audit's mirror said 3 — i.e. the audit could flag a "missing"
  button during the hour the app was deliberately hiding it. Now 3 in both, plus explicit
  `regulationPeriods: 2`.
- The official-highlight badge uppercases the sport KEY, so the rugby cards read
  **"SIXNATIONS" / "SUPERRUGBY" / "RUGBYWC"**. Added `highlightBadgeLabel` rows:
  `6 NATIONS`, `SUPER RUGBY`, `RWC`, `CHAMPIONS`, `TESTS`, `NATIONS`.

## 2026-08-04 — PH account live + launch set **Tue Aug 11**; 3 onboarding modals → 1; NWSL/NASCAR/IndyCar feeds MERGED
🚀 **Product Hunt account created and verified live: `producthunt.com/@jacobhl`** (display name **Jacob Heifetz-Licht**, user **#10099686**). Bio = "Visit jacobhl.com for all projects!", photo present, LinkedIn + Roosevelt Island links attached. **Personal account, hunted by Jacob himself** — PH prohibits company accounts, and a same-hour signup + launch reads as cold, which is why the account was made a week ahead.
📅 **Launch = Tue Aug 11 2026, 00:01 PST / 3:01am ET.** No alarm needed — PH's submit form has a **"Schedule for later"** toggle (status flips to *Scheduled*, up to a month out). Tue–Wed is the window; **Mon and Fri are the two days to avoid.** Two gcal events created on his `Events` calendar:
- **Sat Aug 8 11:00** `d8f3o4ok1i5kuadbov599b96f8` — create the draft + set the schedule. Description carries every asset/copy path.
- **Tue Aug 11 07:00** `5bk2v4patbv5g4k65miejndams` — reply to comments; first 4 hours drive ranking hardest.
✅ **Onboarding: three blocking modals → one.** A first-time visitor used to hit *pick your leagues* → *show ratings?* → *spoiler warning* before seeing a single score. Jacob approved collapsing 2 of the 3 (league picker stays). In `src/components/HomeContent.tsx`: `handleViewModeClick` no longer gates the view behind a confirm — **the tab applies instantly** and the explanation renders as a dismissible **`role="status"` inline bar** at the top of `<main>` (same shape as the WC banner). Still first-time-only — `skipExplainer`/`skipNewsExplainer` are set the moment the notice appears. Deleted the two dialog refs + the **80-line Escape/scroll-lock/focus-trap effect** (modal-only concerns) and both modal JSX blocks. **~181 net lines removed.**
✅ **Verified for real, 9/9 click-through checks PASS** on a fresh browser context (= genuine first-run) — `~/hidescore-patches/verify-modal-bars.py`, Playwright/Chromium against `npm run dev`. Asserts: ≤1 dialog on first paint, no dialog blocks either tab, both bars visible + dismissable via ×, `aria-pressed=true` (view applied immediately), and the notice does **not** return on a second visit. `tsc --noEmit` + eslint clean.
📌 **The screenshot caught what tsc couldn't:** `<strong>Ratings are on.</strong> They show…` rendered as "on.**They**" — JSX ate the space. Fixed with explicit `{" "}` in both bars. **Reading the PNG is the check; a passing assertion isn't.**
⚠️ **THE LESSON — a second Claude session overwrote `HomeContent.tsx` THREE times mid-edit** (12:27, 13:49, 13:53), once *during* a verification run, which is what made the run fail. Hand-re-applying lost twice. **Fix: `~/hidescore-patches/apply-modal-bars.py` — every edit anchored to CONTENT, not line numbers**, so it survives unrelated edits elsewhere in the file; idempotent (prints "already applied"); refuses to half-apply. A `.patch` was useless here — it went stale within minutes.
✅ **NWSL + NASCAR + IndyCar Reddit feeds — now ON `origin/main`.** Added to `REDDIT_SUB` in `src/lib/news.ts` (`r/NWSL`, `r/NASCAR`, `r/INDYCAR`); the other session swept them into its commits and **pushed**. `origin/main` now carries all four new Sport types (**cricket, nwsl, nascar, indycar**) — the earlier "can't ship, `Sport` on main has no cricket" blocker is **RESOLVED**. NWSL deliberately gets its own sub rather than the `SOCCER_REDDIT_FIREHOSE` (r/soccer is overwhelmingly men's club football and would fill the column with a different sport); its old "until it earns a dedicated sub" comment was updated.
📌 **Feed ceiling is bake time, not league count:** ~18 feeds × 45s ≈ 13.5 min against a 30-min cron → **~40 Reddit feeds max.** Each new league costs one 45s gate slot.

**Done:** PH account live + launch scheduled (2 gcal events); modal rework applied + browser-verified; 3 feeds merged to `origin/main`.
**Next:** ⛔ **COMMIT `HomeContent.tsx`** — it is the *only* uncommitted file in the repo and it is NOT deployed. **Then deploy before Aug 11**, or PH visitors still hit all three modals — which defeats the entire point of the change.
**How to resume:** repo `~/nospoilerscores`, branch `feat/prebake-highlights` @ `45aa925d` (**== `origin/main`, 0 ahead / 0 behind**). If the modal work is missing, run `/opt/homebrew/bin/python3 ~/hidescore-patches/apply-modal-bars.py` then the verify script (needs `npm run dev` on :3000 — ⚠️ **sandbox OFF**, else `listen EPERM`). Backup of the pre-change file: `~/hidescore-patches/HomeContent.beforeModalRework-1349.tsx`.
**Needs-Jacob:**
- ⚠️ **PH's "Schedule for later" mechanics are UNVERIFIED** — the 00:01-PST toggle, the month-ahead limit, the company-account ban and the Mon/Fri-avoid rule are all carried from the prior session, never checked against PH's live submit form. **Confirm on Aug 8 when the draft is open**; if the toggle isn't there, the launch needs a manual 3:01am post.
- ✅ ~~2 warm-up comments unconfirmed~~ **Jacob CONFIRMED 8/4 he commented twice.** Closed. 📌 `/@jacobhl/activity` reads "No activity events" to an ANONYMOUS fetch even when comments exist — PH lazy-loads it, so never treat that as proof of no activity.
- ⚠️ **r/NWSL / r/NASCAR / r/INDYCAR were never RSS-verified** — Reddit 429'd the IP (transient, ~24h). A wrong sub name bakes an empty column silently. Check `curl -A "<UA>" https://www.reddit.com/r/NWSL/.rss`, or just look at the columns after the next bake.
- ⚠️ **The new feeds have never been observed baking.** Code is merged; no run has produced `reddit-nwsl.json` / `reddit-nascar.json` / `reddit-indycar.json`. Check `curl https://hidescore.com/news/reddit-nwsl.json` after the next 30-min cron.
- ⚠️ **Modal bars verified at 1270×760 desktop ONLY, and against empty data** (dev server showed "Schedule unavailable"). The header renders a *separate mobile copy* of each view tab — the bars are untested at phone width and in the iOS app.

## 2026-08-03 — "MLB news feed empty in Safari" = NOT a bug, it's the funnel default. Empty-state SHIPPED (`23d5e938`)
🔍 **Report:** Jacob's screenshot — News tab, Cards, 🎥 Videos ON, columns MLB + News. **MLB column completely blank**; News showed r/sports clips fine.
✅ **Root cause (not Safari, not a code bug):** `const newsTypeFilter = prefs.newsTypeFilter ?? "reddit"` in `src/components/HomeContent.tsx` — the **funnel Source filter defaults to Reddit-only**, so a league column holds *exactly one* source (MLB = `reddit-mlb` / r/baseball). The Videos toggle then hides any source with no clips (`SourceSection`: `if (!loading && items.length > 0 && shown.length === 0) return null`). On a day r/baseball has no v.redd.it posts → every source in the column returns null → bare title over blank space.
✅ **Jacob's 2-tap fix:** funnel icon (top-right) → **Source** → **All** (or "Clear filter"). Proved live: funnel=reddit + Videos → `R/BASEBALL, R/NFL, R/SPORTS`; funnel=**all** + Videos → `R/BASEBALL, MLB MOST POPULAR, R/NFL, R/SPORTS`.
✅ **Shipped `23d5e938` → main, GHA "Deploy to Cloudflare Pages" success, live-verified.** `src/components/NewsColumn.tsx`: new `SourceRenderState = "loading" | "hidden" | "shown"`; `SourceSection` reports its outcome up via `onRenderState`; `NewsColumn` renders a card — *"No videos here right now. / Turn off Videos, or widen Source in the filter menu."* — **only** once every source has settled AND all were filtered away. A still-loading column, or one whose source shows its own "No headlines", is untouched. `role=status` + `aria-live=polite`.
✅ **Verified:** forced the exact case locally (mirrored live feeds into `public/news/`, nulled r/baseball's video fields, Videos ON) → message rendered in MLB only, other columns intact; control with Videos OFF → message gone, R/BASEBALL back. `tsc --noEmit` + eslint + full `npm run build` clean. Post-deploy: new string present in shipped bundle `1f0dlfy16v50-.js`, News renders, 0 page errors.
⚠️ **THE REAL LESSON — `~/nospoilerscores-feed` was 305 commits behind `origin/main`.** I first "found and fixed" a genuine-looking bug there (`itemIsVideo` missing `playbackUrl`, which MLB Most Popular items carry *exclusively*) and was one command from deploying it — **`origin/main` already had that fix**. Wasted a full cycle. **Before diagnosing anything from that worktree: `git fetch origin +refs/heads/main:refs/remotes/origin/main` && `git rev-list --count HEAD..origin/main`.** Non-zero ⇒ read via `git show origin/main:<path>`, never the working tree. Recorded in memory `reference_nospoilerscores_deploy_and_bot`.
📌 **Repro recipe (reusable):** `curl https://hidescore.com/news/<feed>.json` into `public/news/` (gitignored) → null out video fields to force the empty case → `npm run dev` (⚠️ needs the Bash sandbox OFF, else `listen EPERM`) → Playwright via `/opt/homebrew/bin/python3` with `localStorage nss-preferences = {leaguesOnboarded:true, newsVideosOnly:true}` → click **News** → dismiss **"FULL OF SPOILERS → Show News"**.

**Done:** `23d5e938` live on hidescore.com; memory + this backlog updated.
**Next:** nothing open. ✅ **8/3 Jacob DECIDED: Reddit-only STAYS the funnel default** (re-confirms his 7/16 "Reddit-first" call) — the shipped empty-state is the answer to the blank column, not a default change. ⛔ Don't re-propose flipping it to "All".
**How to resume:** worktree `~/nospoilerscores-feed` is on branch `fix/news-empty-state` @ `23d5e938` (= `origin/main`). Re-read this entry + memory `reference_nospoilerscores_deploy_and_bot`.
**Needs-Jacob:**
- ⚠️ **Never verified in Safari.** All checks ran headless Chromium; WebKit isn't installable via `playwright-core`. Diagnosis is data/logic-level so browser-independent, but the *rendered* empty-state card is unconfirmed on Safari/iOS. Hard-reload (**Cmd+Opt+R**) and eyeball it.
- ⚠️ **Never verified the funnel CLICK path.** I set `newsTypeFilter` via localStorage, not by clicking funnel → Source → All. Mapping is from code (`setNewsTypeFilter`), not observed.
- ⚠️ **Never saw the empty state render on PRODUCTION** — only that its string shipped in the bundle. Can't force the all-filtered case on live data.
- ✅ ~~Product call: Reddit-only as funnel default?~~ **DECIDED 8/3 — keep Reddit-only.** Closed, don't re-ask.
- 🔒 **Dependabot = NOT URGENT, but ONE bump clears all 4 (fully assessed 8/3).** Exact open set via `gh api repos/jacobhl3ca/nospoilerscores/dependabot/alerts?state=open`: **#49 postcss high** (patched 8.5.18), **#48 postcss high** (8.5.12), **#26 sharp high** (0.35.0), **#6 postcss medium** (8.5.10) — that's the "3 high + 1 moderate" the push printed. **All 4 come from `next@16.2.12`'s own tree** (`npm ls`: next→postcss@8.4.31 + sharp@0.34.5). The other postcss copy, `@tailwindcss/postcss`→**8.5.24**, is already above every patch and is NOT what's flagged.
  **Why not urgent:** `next.config` is `output:"export"` → static on CF Pages, **no Next server**; and `grep -rl next/image src/` = **zero hits** (the app uses plain `<img>` + `proxyImage`), so the image optimizer never runs and **sharp is never invoked**. postcss only processes Jacob's own CSS at build. Dependabot's `scope=runtime` means "declared in `dependencies`", NOT "executes in prod" — that's what makes these read scarier than they are.
  **The clean fix, verified:** `next@16.3.0` ships **postcss 8.5.23** (> 8.5.18/8.5.12/8.5.10) and **optionalDependencies sharp ^0.35.3** (> 0.35.0) → a single `next 16.2.12 → 16.3.0` bump clears **all four**. ⚠️ Correction to what was said mid-session ("would likely clear the postcss pair… says nothing about sharp") — it clears sharp too. Still a framework minor with whole-app blast radius: fold it into a future real deploy with a full `npm run build` + smoke test, never as a standalone security push.
- 🧹 `feat/news-feed-comments` still holds redundant local commit `450a1f8f` and is 305 behind — rebase or drop before reusing that branch.
- 🔐 Push output flagged **4 Dependabot vulns (3 high, 1 moderate)** on the default branch — unreviewed this session.
- ⚠️ **Still the one real gap: nothing was ever checked in Safari.** Every verification this session ran headless Chromium; WebKit isn't installable via `playwright-core`, and memory records that some HideScore bugs are Safari-ONLY (the ytMode wrapper width bug looked perfect in Chromium). The shipped empty-state card is plain flex/text so risk is low, but it is unconfirmed on Safari + the iOS app. iOS picks up the new bundle on **next launch**, not while backgrounded.
_src: 2026-08-03 session_

## 2026-07-22 — "83% of cards blank" media alert = FALSE ALARM (post-WC r/soccer), plus a real bot-thread fix
🔍 Jacob's `hidescore-media-check` watchdog popped "r/soccer: 83% of cards blank (0 vid, 2 img)". **The extractor is fine** — same hour, `reddit-mlb.json` baked 5 videos / 9 images and `reddit-nfl.json` 4 / 4. r/soccer itself is genuinely media-free right now: the World Cup final was 7/19, so the sub is a pure transfer-window feed (rumors, quotes, journalist tweets) with no matches to clip. Live RSS check: **5 of 25** hot posts carry an image, **1** carries a video.
✅ Watchdog retuned (`~/scripts/hidescore-media-check.py`, MacBook-local, not in this repo): r/soccer dropped from `FEEDS` the same way nba/nhl are dropped in their offseasons — its WC-era "0 videos = broken" rule was written when the sub reliably carried goal clips. **Re-add ~Aug 15** when the EPL kicks off.
✅ Real fix shipped here: r/soccer's `u/2soccer2bot` posts "Daily Discussion" + "Wunderkind Watch" daily, neither stickied in the RSS view, so they took **2 of the 12 card slots as permanently blank headlines**. `REDDIT_META_TITLE` now matches "daily discussion" without requiring the word "thread" (+ "wunderkind watch"), and the AutoModerator author skip became a shared `REDDIT_BOT_AUTHOR` regex covering `2soccer2bot`. Re-bake confirms: bot threads gone, blank rate 83% → 75%.
📌 Noted, not acted on: **every redlib mirror is now challenge-walled** (perennialte 503, catsarch 403, bloat.cat + safereddit serve a JS/Anubis interstitial), so the video-id map is permanently empty and clips resolve only from the `v.redd.it` / streamff link sitting in the RSS `<content>`. Graceful today; if r/soccer's clip volume matters once the season starts, the real fix is Reddit OAuth creds (still gated behind manual app approval).

## 2026-07-21 — pinch-zoom locked out + 3 older commits rode to prod
✅ `maximumScale: 1` + `userScalable: false` added to `src/app/layout.tsx` viewport export (commit `2159be7a`) — stops an accidental pinch leaving the page scaled+panned, which shows as blank strips top/bottom. Live on hidescore.com via the usual `push feat/prebake-highlights:main` → GHA.
✅ **HideScore was NOT affected by the WebView `contentInset` bug** that hit The Island and SubwayTimes — `capacitor.config.ts` has no `ios` block, so it already used Capacitor's `.never` default. Same for Tonight NYC. No app update needed for either.
⚠️ That push also carried **3 of Jacob's own commits** that had been sitting unpushed on `feat/prebake-highlights` since 7/20, so they are now LIVE: `faa7fb63` (embed-failure retry now stays inside the caller's strict channel gate — a blocked embed used to re-search unscoped, which is how a fan reupload reached the masked player; F1 + golf), `9af07bc2` (r/soccer firehose card on EPL/UCL/UEL, not just World Cup; MLS excluded), `3469ed8a` (BACKLOG only). All reviewed — intentional, finished, and `faa7fb63` tightens spoiler safety rather than loosening it.

## QA log

- [x] **2026-07-20 Reddit coverage audit + r/soccer firehose on EPL/UCL/UEL — SHIPPED (`9af07bc2`).** Audit: ALL 19 reddit feeds (17 leagues + r/sports + r/soccer) verified live on hidescore.com — 12 items each, ≤4.4h fresh; nothing missing. Upgrade: `leagueSourceCascade` (`src/lib/news.ts`) now pushes the `reddit-soccer` card for `epl|ucl|uel` too (was fifa-only) — one shared bake feeds all 4 cards, zero new prebake/staleness wiring. **MLS deliberately excluded** (r/soccer Euro-centric; r/MLS owns it — commented in code, don't re-add). Deploy note: repo had another session's in-flight WIP (GolfLeaderboard/VideoModal) — committed only news.ts+BACKLOG.md, `git rebase origin/main --autostash` preserved their WIP. **Done:** live. **Next:** nothing open. **Needs-Jacob:** hard-reload + eyeball an EPL/UCL/UEL column. _src: 2026-07-20 session_

- [x] **2026-07-18→19 Google Search Console alerts (hidescore.com + nospoilersport.com) — INVESTIGATED, both benign, NO code change made.** Two GSC emails 7/18: (a) **nospoilersport.com "Page with redirect"** (new reason), (b) **hidescore.com "Crawled – currently not indexed"** — "some fixes failed" on a validation Jacob had previously requested. **Verdict: both are working-as-intended; nothing broken, no fix required.** ⚠️ **nospoilersport.com is a SEPARATE domain from hidescore.com** (confirmed by Jacob — memory previously only knew nospoilerscores/hidescore); its source is `~/nospoilersport-landing/` (static 1-page CF Pages landing, **no git remote**, files: `index.html`, `index-v2-pain.html`, `robots.txt`, `sitemap.xml`, favicons). **(a) "Page with redirect" root cause = the healthy `http://nospoilersport.com` → `301` → `https://nospoilersport.com/` hop.** Google reports the *redirect source* as unindexed and indexes the destination — correct web behavior, expected to persist forever, safe to dismiss permanently. Verified live via `curl -sI -L`: http→301→https/, `https://nospoilersport.com` = 200, `https://nospoilersport.com/` = 200 (both slash + no-slash serve 200 directly, **no redirect between them, no loop**). Cosmetic-only nit found and deliberately **NOT** changed: canonical + `sitemap.xml` use `https://nospoilersport.com` (no trailing slash) while the http redirect lands on `.../` (with slash) — harmless, don't "fix" it. Also noted: `www.nospoilersport.com` returns nothing (never configured) — unrelated to the alert. **(b) "Crawled – currently not indexed" = Google's discretionary call, NOT a technical defect — it cannot be forced, and "validation failed" only means Google still hasn't chosen to index.** Proved hidescore.com is technically clean: pages are genuinely **pre-rendered** (not JS shells) — `/` ~546 words, `/worldcup` ~613, `/today` ~484 of real HTML text; unique `<title>` per page; correct **self**-canonicals (`/worldcup` → `https://hidescore.com/worldcup`); `robots.txt` explicitly `Content-Signal: search=yes` + `Allow: /` for `User-agent: *` (the Cloudflare-managed block only disallows AI crawlers — GPTBot/ClaudeBot/CCBot/Google-Extended/Bytespider/etc. — **Googlebot itself is allowed**); sitemap live with **68 URLs**. **The one real lever identified but NOT executed (Jacob said "dont" 7/19):** trim the 68-URL sitemap to evergreen pages and/or `noindex` the ephemeral near-duplicate date-pages (`/today`, `/worldcup/tomorrow`, `/worldcup/highlights`, all `changefreq=daily`) — those thin pages dilute crawl budget and are exactly what Google skips. **Do NOT re-propose the sitemap trim unless Jacob raises it.** **Done:** diagnosis complete, both GSC Page-Indexing reports opened in Safari, 1-week auto-recheck built + loaded (see next entry). **Next:** nothing — Jacob clicks "Validate Fix" in each GSC report at his leisure. **How to resume:** re-read this entry + memory `reference_gsc_indexing_alerts`. **Needs-Jacob:** the human-only step — hit **Validate Fix** in both reports (links auto-open 7/26). _src: 2026-07-18→19 session_

- [x] **2026-07-19 GSC 1-week auto-recheck job — BUILT, TESTED, LOADED (self-deleting one-off).** Jacob asked for a reminder ~1 week out that re-opens the exact GSC links AND auto-checks what's checkable. **Script `~/scripts/gsc-recheck.py`** (python3, stdlib only — `urllib`, no deps). Per domain (hidescore.com, nospoilersport.com) it runs **6 machine-checkable assertions**: ① `http`→`https` 301/308 ② https apex serves 200 ③ pre-rendered content (>150 words of tag-stripped HTML text — catches a regression to an empty JS shell) ④ `<link rel=canonical>` present ⑤ `robots.txt` doesn't block Googlebot ⑥ `sitemap.xml` reachable + `<loc>` count. Then it: writes a styled report to **`~/hidescore-backlog/gsc-recheck.html`**, opens that report **+ both GSC links in Safari** (Google pages → Safari per standing pref, `open -a Safari`), and fires a Mac popup via `~/scripts/popup_broker.py enqueue --id gsc-recheck` saying either "all green — just hit Validate Fix" or naming the regressed checks. GSC URLs hardcoded as **domain-property** form: `https://search.google.com/search-console/index?resource_id=sc-domain:<domain>` (if a property is URL-prefix instead, switch via the top-left property dropdown). **launchd `com.jacob.gsc-recheck-20260726`** (`~/Library/LaunchAgents/`), `StartCalendarInterval` Month=7 Day=26 Hour=9 Min=30, `RunAtLoad=false`, logs `/tmp/gsc-recheck.launchd.{log,err}`; bootstrapped + verified in `launchctl list`. ⚠️ **Self-destructs:** the script's last step `launchctl bootout gui/$(id -u)/com.jacob.gsc-recheck-20260726` + deletes its own plist, so a Month/Day calendar interval can't re-fire next July. **Smoke-tested 7/19 by importing `check_site()` directly** (avoids opening tabs / triggering self-removal) — **12/12 checks green**: hidescore 68 sitemap URLs / ~528 words, nospoilersport 1 sitemap URL / ~281 words. **Done:** loaded and armed. **Next:** it fires itself Sun **Jul 26, 9:30am** — no action until then. **How to resume:** if it ever needs re-arming, edit the Day/Month in the plist, re-bootstrap, and update the hardcoded `label` string inside `gsc-recheck.py`'s self-removal block to match. **Needs-Jacob:** nothing until 7/26. _src: 2026-07-19 session_

- [x] **2026-07-18 r/ufc + r/formula1 wired, F1 & UFC fully live, F1 card GameCard-parity — SHIPPED (5 deploys, last `9bcfacd2`).** Root cause of "r/ufc not wired": `ufc` (and `f1`) had ESPN paths/logos but NO `REDDIT_SUB` entry (`src/lib/news.ts`) + no `fetchReddit` job (`scripts/prebake-news.mjs`) → league column never got a Reddit card. **(A) Wired both:** `reddit-ufc` → r/ufc (lowercase — r/UFC & r/MMA return 0 via RSS), `reddit-f1` → r/formula1; added both to `check-staleness.mjs` NEWS_HOURLY; feeds baked+uploaded to R2 BEFORE each push (`node scripts/prebake-news.mjs --only=reddit-<x>` + `npx wrangler r2 object put hidescore-data/news/reddit-<x>.json --file public/news/… --remote --content-type application/json`, retry loop for 429s) so the hourly GHA staleness check never 404'd a not-yet-baked feed. Mini's 30-min cron (`~/bin/hidescore-reddit-cron.sh` on jakeh@192.168.99.63) does `git reset --hard origin/main` each run → new jobs self-deploy. **(B) F1 un-hidden** (`hidden:true` removed in `src/lib/espn.ts` ALL_LEAGUES; opt-in/excludeFromAuto like UFC, season 03-01→12-14). **(C) NO UFC/F1 YouTube video cards — decided, don't re-propose:** UFC channel = weigh-ins/shorts/spoiler-titled Fight Motion (no spoiler-safe highlights; Jacob's instinct confirmed); F1 = FOM embed-block. **(D) F1 tile rebuilt to exact GameCard parity** (`src/components/EventCard.tsx`): game-meta-row (11px muted upcoming time / text-xs Final-Live), body = game cards' two-row team skeleton (logo-sized 🏁 slot + `text-sm team-name leading-none truncate` title, circuit row, `min-h-6` rows), `whenLabel(iso, refYmd)` now takes the board's viewed date (`selectedDate` threaded LeagueColumn→EventCard→FightCard) so race-day shows bare "9:00AM" like game cards (fixed for UFC too); tile clickable → ESPN race hub via `openExternal`, **pre/live ONLY** (finished race page = finishing-order spoiler, same GameCard rule), PlayBtn stopPropagation. **(E) F1 highlights locked to real channel:** `play(..., strict=true)` → worker `strict=1` oembed-verifies uploader === "FORMULA 1"; unscoped "Search" test button REMOVED; no strict match → external YT search (never an unvetted reupload in the masked player). Verified live: strict lookup returned `FP1 Highlights | 2026 Belgian GP`, uploader FORMULA 1. UFC stays preference-mode (strict would kill most plays — official channel rarely has fight highlights). **Verify recipe:** headless Chromium + seed `localStorage nss-preferences = {leaguesOnboarded:true, slotLeagues:["f1","mlb","ufc"]}` before goto (bypasses first-run picker; bare `?s=fo.m._` URL param did NOT apply). **Done:** all above live on hidescore.com. **Next:** nothing open from this thread. **How to resume:** memory `reference_nospoilerscores_deploy_and_bot`; F1/UFC card code = `src/components/EventCard.tsx`. **Needs-Jacob:** eyeball F1/UFC in Safari (Cmd+Opt+R; iOS relaunch); optional — make UFC strict too. ⚠️ A parallel session pushed `557b158d` (UFC fighter-name sizing) + FighterRow min-h-6 mid-work — complementary, carried along; `APP_STORE_SUBMISSION.md` had an unstaged edit that wasn't mine (left untouched). _src: 2026-07-18 session_

- [x] **2026-07-14 News Feed polish + Videos filter + embed-block fallback — SHIPPED & LIVE.** All built on the isolated worktree `~/nospoilerscores-feed` (branch `feat/news-feed-comments`, bot-safe) → rebase origin/main → `git push origin feat/news-feed-comments:main` → GHA deploy. **(A) Sticky news toolbar** (`a8e5ae3d`, `98300bea`): the Cards/Feed + Headlines/Videos/Text-posts row stays in its ORIGINAL spot one row below the header but is now `position:sticky` (`.news-toolbar-sticky` in globals.css) so it pins to the top on scroll; its measured height → `--news-toolbar-h`, and `.league-sticky-top` + `.news-source-sticky-top` add it so Cards league titles/source headers stack right below it (no overlap). First tried moving it INTO `<header>` — Jacob said keep original position, so reverted to sticky-in-place. **Clearer toggles:** one `NewsToggleChip` shape (icon + accent-fill = on); **icon-only on mobile** (`<span className="hidden sm:inline">`) so the Videos pill stops wrapping to a 2nd line. **(B) 🎥 Videos filter** (`newsVideosOnly` pref): ITEM-level (`itemIsVideo` in NewsColumn — youtubeVideoId||videoUrl||embedUrl) so it INCLUDES Reddit v.redd.it clips, not just Top-Videos sources; NewsColumn gets `videosOnly` (filters each source's items, hides video-less sources), NewsFeed filters merged items. **(C) Resilient Feed:** `useAggregatedFeed` (NewsFeed.tsx) now merges per-source AS each resolves (not `Promise.all`) so one slow/hanging source no longer freezes it on "Loading…". **(D) Embed-block fallback** (`b38fd438`): FIFA blocks embedded YouTube playback on the FOX/official WC uploads the app hard-gates to (`fifa:"FOX Sports"` allowlist in `src/lib/youtube.ts` — "worked before" = pre-gate embeddable fan reuploads slipped through). On YT error 101/150 with no working alternate, VideoModal sets `ytFailed` and covers YouTube's error with a solid card + "Watch on YouTube" (opens native YT via `openExternal`). **(E) One-tap "Try Telemundo"** (`46df67e2`): the overlay offers the game's OTHER resolved highlight versions as buttons (Telemundo short/extended + other FOX cut, WC-only) — GameHighlights passes them via a `playHl`/`buildAlternates` wrapper → `onPlayHighlight(…, alternates)` → HomeContent `openVideoModal`/videoModal state → VideoModal `alternates` prop; tapping swaps `currentId` (the player effect clears ytFailed and re-attempts). Threaded the callback type through GameCard + LeagueColumn. All verified with Playwright (sticky-on-scroll, Videos incl. Reddit clip, mobile no-wrap, forced-error overlay + Telemundo button). **Needs-Jacob:** comments still need Reddit OAuth creds on the mini to populate (see item below); optional: extend "alternate-on-error" beyond World Cup. _src: 2026-07-14 session_

- [x] **2026-07-11→14 News lightbox (VideoModal) cleanup + resume prefs-sync — SHIPPED & LIVE.** Jacob's asks on the news image/text/video modal (`src/components/VideoModal.tsx`): (1) **Close (X) placement** — was overlapping the photo (image posts) or pinned to the screen corner (text posts); now sits in an in-flow right-aligned row **just above the content's real top-right corner**, identical for all 3 modes (image `w-fit` column, text `max-w-2xl` reading column, video frame-width row). (2) **Mobile** image posts = **swipe-only** (drop the bottom Prev/Next buttons → full-screen photo; added `onSwipeStart/onSwipeEnd` touch handlers, dx≥45 & dx>1.5·dy to ignore vertical scroll/taps); text/video keep the bottom buttons. (3) **Desktop side chevrons** get a `sm:px-24` gutter so they never overlap the media. (4) **Footer** redesigned from bare underlined gray links → **pill buttons** ("Open on r/… ↗" + copy-icon "Copy link") with headline+meta stacked above ("looked sad" fix). (5) **Resume prefs-sync** (`HomeContent.tsx`) — added a `visibilitychange` effect that re-pulls the signed-in user's server prefs when the app/tab becomes visible (not just cold-launch mount), applying live when they differ WITHOUT re-running launch-only resets → fixes "removed the Wimbledon column on web, didn't sync to phone" (phone only synced on relaunch before). **Deploy:** rebased `feat/prebake-highlights` onto `origin/main` FIRST (⚠️ my base predated 4 auto-improve bot fixes — would've regressed Reddit `AT&T` escaping, YT-player fast-close crash, timezone tooltip, aria-valuenow spoiler leak; all preserved) → `npm run build` clean → `git push origin feat/prebake-highlights:main` → GHA `deploy.yml` built+deployed+smoke-tested. 2 commits live: `844cb58c` (lightbox) + `2d24be2a` (resume-sync). Verified w/ Playwright (Chromium `~/Library/Caches/ms-playwright/chromium-1223`) desktop 1280 + mobile 390 for image AND text modes. **Jacob to see it:** hard-reload web (Cmd+Opt+R); **relaunch iOS app** (pulls new JS bundle only on launch). Deploy how-to: memory `reference_nospoilerscores_deploy_and_bot`. _src: 2026-07-11→14 session_

- [x] **📰 News "Feed" view (vertical scroll) — SHIPPED & LIVE 7/14 (`f6d6cc05`).** Cards/Feed toggle in the news header (`newsFeedView` pref). Feed mode = one Reddit-style vertical scroll (`src/components/NewsFeed.tsx`) that aggregates every visible column's sources into a de-duped, time-sorted stream; each post shows source+time, blurred headline (global reveal / tap-to-peek), full-width image (tap → same lightbox), and an Open pill. Cards board stays the default (no regression). Verified w/ Playwright (toggle, scroll, comment blur→reveal). Built on the isolated worktree `~/nospoilerscores-feed` (branch `feat/news-feed-comments`), rebased onto origin/main, pushed → GHA deploy. _src: 2026-07-14 session_
- [ ] **📰 Feed comments — CODE SHIPPED, but won't POPULATE until the mini has Reddit OAuth creds.** UI is done + live (NewsItem `comments[]`, blurred tap-to-reveal in the Feed; verified with a fixture). `prebake-news.mjs` scrapes the top ~8 posts' top comments per Reddit feed via the **OAuth JSON path only** — anon reddit.com is IP-blocked (verified 403/429 from residential too; listings already fall back to redlib for this reason), so an anon comment fetch just burns the 45s Reddit gate for nothing. **To light comments up:** add Reddit `client id/secret` to `~/.config/hidescore/reddit.env` on the Mac mini + `source` it in `hidescore-reddit-cron.sh` (this is the SAME open item as "Reddit news feeds — fix + re-enable" below — one creds step unblocks both). Register an app at reddit.com/prefs/apps (script type, ~2 min); app-only OAuth reads public subs, no posting. _src: 2026-07-14 session_

- [x] **2026-07-11 Highlight row popped in *after* MLB on refresh/past days — FIXED & LIVE.** Cause: `GameHighlights.tsx` gated the whole YouTube highlight row on `bothSettled` (both slots must leave "loading" before the row shows). A prebaked official button was held back by the slower 2nd slot (often a live YouTube scrape), so the row trailed the MLB row (MLB renders instantly from the scoreboard payload). Fix = **removed `bothSettled`**; row now shows the moment *either* slot resolves (`effectiveOfficialStatus === "found" || searchStatus === "found"`). Each button is still individually gated on `found`, so nothing appears-then-disappears. Surgical 1-file diff. **Deploy hygiene:** prod (`origin/main`) sat at `3b9fd64e` with the bug in *committed* code, and the working tree had 12 files of unrelated in-flight WIP (Telemundo/golf/tennis-timeout/AO-channel/weekday-label). So: `git stash` the WIP → applied fix on clean prod code → `npm run build` (clean) → commit `f32b31de` as Jacob → `git push origin HEAD:main` → CI `deploy.yml` built+deployed+smoke-tested (hidescore.com 200). Then `git checkout -- GameHighlights.tsx` + `git stash pop` restored WIP untouched; the pop cleanly 3-way-merged so the branch WIP now also carries the clean gate (won't regress the fix later). **Verify:** hard-refresh hidescore.com (Cmd+Opt+R), open a past day → non-MLB highlight buttons land *with* the MLB ones. **Note:** past days older than the ~10-day prebake window (`HL_ENTRY_TTL_MS`, prebake bakes today+yesterday only) still live-resolve and can't match MLB's instant payload buttons — expected, not a regression. _src: 2026-07-11 session_

- [x] **2026-07-09 World Cup/MLB highlight follow-up QA.** Verified live `hidescore.com` serves the Egypt-Argentina baked IDs (`-LHb5yN-OzI`, `XO3x8vm0Ijc`, `QO8-LAmwS1E`, `6tveHOrsXwY`) and live MLB entries include `mlbOrder:"official-first"`. Found and fixed one UX regression: baked highlight links still visibly cascaded after card paint because `GameHighlights` initialized as loading even after the board-level `/news/highlights.json` preload had settled. Fix adds a synchronous baked-cache read and initializes button refs/statuses from it. Refreshed local ignored `public/news/highlights.json` from live. `npm run build` passes. Browser automation not run because Playwright is not installed in this repo; local dev server restarted at `http://localhost:3001`.

## 🔝 Top priority

- [ ] **🎯 Optimal-improvements audit 7/18 — pick from the ranked list:** [hidescore-optimal-improvements-2026-07-18.html](hidescore-optimal-improvements-2026-07-18.html). ✅ ① DONE 7/18: PR #29 (`auto/staging`) reviewed line-by-line, merged, deployed — the bot's full spoiler-regex coverage is LIVE. Still open: ② ~~WC sunset/retention hook~~ (SKIPPED — Jacob 7/18 "don't need"; don't re-propose) — La Liga/Bundesliga/Serie A in Aug still worth considering ③ build the locked mobile redesign ④ Reddit account decision → OAuth creds ⑤ F1/UFC un-hide. Other new ideas: "surprise me" classic-game discovery, evergreen WC archive page. ✅ `origin/staging` RESOLVED 7/18: all 17 commits audited (13 superseded on main or WC-dead), history preserved as tag `archive/staging-2026-06`, branch deleted (local+remote; bot's `auto/staging` untouched); salvage ideas = schedule-view ratings backfill `3d1a0b92` + per-game highlight-ID R2 prebake `48a92ea5`, redo fresh if wanted. Also pushed 7/18: Playwright visual suite, Android 1.0.1(2) + Play pack; `REDDIT_DRAFT_WORLDCUP.md` moved OUT of the public repo → `~/hidescore-backlog/worldcup-marketing/` (named the Reddit account next to a self-promo playbook). _src: 2026-07-18 audit chat_

- [ ] **🧩 Browser extension "Spoiler Shield" — now its OWN hub project** (pill 🧩 Build > Spoiler Shield → `BACKLOG-spoiler-shield.md`; this line kept as cross-link). DECIDED 7/18: NO AMO signing/account — demo-window mode (`"open it"`), revisit only if publishing. Original detail: lives at `~/hidescore-extension` (NOT in this repo). MV3, Firefox+Chrome; blurs YouTube titles+thumbnails via the site's `SCORE_RX`/`SPOILER_RX` (ported verbatim post-PR-#29) + extension-only Smart context gate (league keywords + ~180 team names); click-to-reveal, popup with on/off + Smart/Aggressive. Load: `about:debugging` → Load Temporary Add-on → `manifest.json` (or `npx web-ext run`). **Next:** AMO self-distribution signing (free, survives restarts), Google/ESPN/Reddit site support, auto-sync regex from R2, store listings ($5 Chrome). ⚠️ Keep the two big regexes in sync with `src/lib/spoilers.ts` as the auto-improve bot grows them. **v0.1.1 (later 7/18):** Jacob caught hover/click exposing titles → fixed 3 leaks (native `title=""` tooltip stripped while shielded; transparent click-catcher overlay replaces event interception — also kills hover preview; recycled card nodes re-judge by storing judged text). _src: 2026-07-18 audit chat_

- [x] **🏎️🥊 F1 & UFC cards — ✅ DONE 7/17–18: both redesigned to GameCard parity and UN-HIDDEN (UFC 7/17, F1 7/18 — see 7/18 QA entry above).** Original item: redesign to match, then un-hide (hidden from UI 2026-06-29). The `EventCard` tiles (F1 single-race tile, UFC one-card-per-bout — `src/components/EventCard.tsx`) don't look like the rest of the score cards, so F1 + UFC were hidden from the league switcher for now. They're flagged `hidden: true` in `ALL_LEAGUES` (`src/lib/espn.ts`) and filtered out of `thirdLeagueOptions` (`HomeContent.tsx`); data + ESPN endpoints are intact. **To re-enable:** rework `EventCard` to match `GameCard`'s card chrome (spacing, header, spoiler treatment), then flip `hidden` off on the two entries. _src: 2026-06-29; mobile cleanup pass_

- [ ] **📣 World Cup marketing push — EXECUTE (~June 8–11, before/at the 6/11 kickoff). ⬅ #1.** The once-every-4-years window (WC on home soil + simultaneous NBA/NHL Finals) is the moment to market HideScore — lead with the World Cup, anchor on the competitiveness rating ("which games were classics without revealing who won"). Full plan: memory `project_hidescore_worldcup_marketing_push`. Drafts now live in `~/hidescore-backlog/worldcup-marketing/`: `MARKETING_LAUNCH_POSTS.md` (Show HN + Product Hunt + held Reddit post), `MARKETING_VIDEO_SCRIPTS.md` (5 short-form scripts for Emilio), `MARKETING_COMMUNITIES.md` (tiered Discord/forum list).
  > **Channels:** Show HN + Product Hunt around/just before kickoff (Tue–Thu ~9am PT); Emilio posts the video scripts to IG/TikTok/X; Discord/forum outreach led by r/SideProject ("free no-spoiler World Cup scoreboard," post 6/10–11); Reddit promo **only after the ban appeal clears** (never ban-evade — domain-flag risk).
  > **Point the campaign at `/worldcup`** once it's shipped (next item).
  > ✅ **Asset files secured 6/5** — the 3 `MARKETING_*.md` drafts had been left untracked in the PUBLIC repo; moved to `~/hidescore-backlog/worldcup-marketing/` and added `MARKETING_*.md` to `nospoilerscores/.gitignore` so a `git add .` can't expose them.
  > **Layout rework — TABLED 6/5.** WC stays the center column; MLB returns automatically when the NBA/NHL Finals end ~6/19. Un-table only if you want MLB visible *during* the Finals window.
  > **Staging build — ✅ FIXED 6/5** (you removed `maxGames` in your parallel edits; `npm run build` on staging is clean again — 9 routes incl. `/worldcup`). _src: 2026-06-05; session_hidescore_worldcup_marketing_2026_06_04_
  > ⏳ **WC final is 7/19 — execute tomorrow or this closes; assets in `~/hidescore-backlog/worldcup-marketing/`.**

- [ ] **🌍 World Cup hub `/worldcup` — BUILT 6/5; decide ship-or-tweak, then test.** Dedicated deep-link landing route for the WC marketing push (mirrors `/tomorrow` `/yesterday`): new `src/app/worldcup/page.tsx` (WC SEO/OG — title "2026 World Cup — No Spoilers | HideScore", canonical `/worldcup`, og:url + twitter card) + a `worldCupHub` prop on `HomeContent.tsx` that renders an accent-bordered framing banner (`<h1>` "⚽ 2026 World Cup, spoiler-free" + the 104-matches / Jun 11–Jul 19 / home-soil pitch + the competitiveness-rating differentiator + a "Free · no tracking cookies · also on the App Store" trust line). The WC column already auto-appears below it (firstPref center pin), so there are **no slot-logic changes — low risk.** Verified: builds clean on latest `origin/main` (`c69313b7`), tsc passes, `/worldcup` static page generated, banner correctly absent on home/`/tomorrow`. **NOT committed/pushed yet** (lives in the working tree + a temp worktree).
  > **🤔 DECISION NEEDED:** ship to prod now (public marketing → no privacy gate needed) or edit the banner copy first? To ship: cherry-pick the 2 files onto `main` via the worktree method → push → CF Pages deploy.
  > **🧪 What to test (after ship):** (1) banner renders + reads well on **desktop AND mobile**; (2) the World Cup column shows below the banner; (3) the **link/OG preview** looks right when the URL is shared (title + description + image); (4) the normal board is unchanged — **no banner** on home / `/tomorrow` / `/yesterday`; (5) before 6/11 it shows the opener via the lookahead, after 6/11 it shows live/today's matches.
  > **📍 Page to test on:** **https://hidescore.com/worldcup** (once pushed to prod). NOT on staging — pushing `staging` deploys nothing (staging itself now builds clean again). Pre-ship preview is local only (built `out/` export served locally). _src: 2026-06-05; session_hidescore_worldcup_marketing_2026_06_04_

- [ ] **Tweak/polish the share-card feature (shipped 5/31 as-is).** The OG share-card preview (browser draws a teams+date PNG to canvas → POSTs to the worker → R2 `cards/<key>.png` → `?c=<key>` swaps OG meta; see `src/lib/shareCard.ts` + `public/_worker.js`) was pushed in its current WIP state per Jacob. Revisit tomorrow: review the rendered card design, confirm the worker OG swap + R2 upload path work end-to-end, and decide what to refine.

- [ ] **Reddit news feeds — fix + re-enable (FIRST to solve).** Reddit cards were removed from the news view 2026-05-30; the underlying feed is the priority fix. Register a fresh Reddit API app under any working account (reddit.com/prefs/apps → script/web, ~2 min) → client ID + secret → drop in `~/.config/hidescore/reddit.env` on the Mac mini + `source` in `hidescore-reddit-cron.sh` so `fetchReddit` takes the `oauth.reddit.com` path. App-only OAuth reads public subreddits (no posting / good standing needed). Then re-add the Reddit sources to `leagueSourceCascade`/`GENERIC_CASCADE` + the funnel filter option in HomeContent. _src: project_hidescore_reddit_403.md_

- [ ] **QA + prep for the 2026 World Cup (soon).** World Cup 2026 is this summer — make sure FIFA/soccer surfacing is solid before it starts: verify the `fifa` league config + season window, the new soccer range-lookahead (`fetchNextGameDayRange`) resolves real fixtures, soccer-slot priority (UCL>UEL>MLS, EPL beats both), broadcast/watch links for WC matches, news feeds, and that the column auto-appears on match days. Do a full QA pass on the soccer path generally.

## 🔧 Minor — restore when convenient

- [ ] **Restore the R2-upload retry loop in `news-prebake.yml`.** The 3-attempt retry-with-backoff (orig commit `93833db9`) was lost 5/30 when a linter reverted an in-progress edit during a conflict fix and the simple one-line `wrangler r2 object put` got committed to main. The cron works fine without it; this is just resilience against transient R2 5xx. Re-add the `for attempt in 1 2 3` loop to the "Upload news feeds to R2" step (it's in git history at `93833db9`), to BOTH staging + main so they don't diverge.

## 💡 Consider

- [ ] **⭐ Top events column — switched OFF 9/5 (Jacob: "top events take down for now").** One flag, `TOP_EVENTS_ENABLED` in `src/lib/topEvents.ts`: the pill is gone from every switcher, the slot dropdowns and Settings; a saved "top" slot reads as Auto; nothing fetches ESPN's strip. Ranking + tests kept, so turning it back on is a one-line change. Same day: the kickoff banner became **once total** — any ✕ retires it for good, the 7-day snooze is gone (`kickoffBannerSnoozedUntil` no longer written). Full banner calendar + copy for review: `~/hidescore-callouts.html`. _src: 2026-09-05_
- [ ] **Settings — highlight the biggest leagues in the catalog.** Jacob 9/5: "top leagues in settings we can consider some highlight for them the biggest ones." Not a ranking section (the 8/11 rule: groups answer what KIND, never how important) — a visual accent on the handful of majors (NFL, NBA, MLB, NHL, UCL, EPL, NCAAF…) inside their existing groups. Decide the set + the treatment (bold / star / pinned-first) before building. _src: 2026-09-05_

- [ ] **"Top events" section in single-column mode on the homepage — TABLED 6/15.** The per-card ⭐ "Top game" badge was REMOVED 6/15 (Jacob: cards look cleaner without it). The concept lives on instead as a dedicated **"top events" section** — a small ranked list of the best games/events across all leagues — shown at the top of the homepage **in single-column board mode** (where there's the width for it). WIP exploration sits on branch `feat/top-events-single-col` (worktree `~/ns-topviews`). The old picker logic (best live game by rating ≥ GOOD, else best upcoming by record) is a starting point for the ranking. Revisit when single-column mode gets more attention. _src: 2026-06-15 Jacob_

- [ ] **Fewer/wider columns on mobile (2-up or horizontal-scroll) — TABLED 6/9, think through.** The 3-column board is fundamentally too cramped on phones (~100px/column at 390px): the upcoming/compact cards can't fit a bold DOW + time + network on one row AND keep the times aligned across rows — at 3 columns those two goals physically conflict, and the narrowest phones still clip the NBA lead "Tomo" (its "8:30 PM" can't be shortened). The real fix is more width per column: either **2 columns on mobile** (swipe/scroll for the 3rd league) or **horizontal-scroll columns** (all leagues, each ~160px min-width, swipe sideways) or **vertical stack** (1 full-width column, scroll down — also covers the old "more leagues" idea). Each is a real UX trade-off (you currently see all 3 leagues at once). Decide the approach, then it unlocks: mobile time alignment, no card truncation, and a genuinely large network tap target (Jacob's "chip almost full width on mobile"). Touches the column render in `HomeContent.tsx`. _src: 2026-06-09 Jacob_

- [ ] **Apple TV (tvOS) app.** Jacob 6/2 — bring HideScore to the living-room TV. HideScore is a perfect tvOS fit: spoiler-free scores + highlight playback on the big screen. Open questions before starting: (1) **delivery path** — Capacitor has no official tvOS target, so the existing WebView wrapper won't carry over cleanly; options are a native SwiftUI/TVMLKit app that points at the same R2 feeds/APIs, or a thin web-view shell if tvOS allows it (it's restrictive). (2) **navigation** — tvOS is focus-engine / Siri-Remote driven (no touch, no hover), so the whole card/column UI needs a focus-based redesign (D-pad nav between columns/cards, no tiny tap targets). (3) **video** — highlight playback maps well to AVPlayer/native HLS, but the YouTube-iframe path and the monkey spoiler-overlay need a tvOS equivalent. (4) **reuse** — same App Store Connect app record / shared codebase or a separate target? Lower priority than iOS/Android; scoping note only — not started. _src: 2026-06-02 Jacob_

- [ ] **Highlight team names in a chosen accent color on cards.** Jacob 5/31 — consider coloring the team name text (team color? site accent?) on game cards for visual pop. Decide a scheme that stays readable in light + dark and doesn't imply a winner. Not started.
- [ ] **Zoom gets stuck on mobile.** Jacob 5/31 — pinch-zoom on hidescore.com can get "stuck". Viewport has NO zoom lock (`{themeColor, viewportFit:"cover"}`), so the cause is likely the sticky header + fixed bottom tab bar + an overflow trap when zoomed. Needs a clearer repro (can't zoom back out? can't pan while zoomed?) before fixing — don't guess.
- [ ] **Calendar picker on mobile.** The date-picker calendar icon is desktop-only now (the mobile header date-nav line has no room for it). If wanted on mobile, find a spot (e.g. tap the date label, or a slot in Settings).

## 🅿️ Parked — maybe re-add

- [x] **Column drag-to-reorder (scores view) — REBUILT + SHIPPED 6/11** with pointer events, exactly as prescribed (window-level pointermove/up like the RIOC restaurant reorder). Press a column header and drag onto another column to swap slots: 8px threshold keeps plain clicks routing to the switcher, floating league-label ghost follows the cursor, target column highlights via `elementFromPoint` + `data-slot-idx`, post-drop synthetic click swallowed so the dropdown doesn't pop open. Touch excluded (would fight page scroll — phones reorder via Settings/arrows). The old HTML5 DnD code was removed. Also fixed the latent `reorderSlots` queue-walk bug (pinned slots didn't advance the displayed-league queue, so an Auto slot after a pinned one read the wrong column).

- [ ] **News column-count selector (1/2/3).** Removed 5/30 — it didn't do much and news is now fixed at desktop=3 / mobile=1. If wanted back, restore `ColumnCountButtons`/`ColIcon` + the `newsColCount` pref wiring in `HomeContent.tsx` (it's in git history) and gate the mobile-forced single column behind it.

## 📌 Pinned — when the Android app is ready

- [x] **Footer Android pill — SHIPPED LIVE 6/10** (commit `e92326e3`, on `main` via CI deploy). Un-commented in `HomeContent.tsx` footer beside the App Store badge; links `/HideScore.apk` (sideload) using `android-download-badge.svg` ("Download / Android App" — no "Google Play", no "APK" literal → WAF-safe). Verified live: both badges render, APK 200s (5.27MB). Too-wide header overflow also re-verified RESOLVED at 360/390/414px (bottom-tab-bar overhaul is live).
- [ ] **Android → Play Store closed test (Jacob chose "both in parallel" 6/10).** Sideload pill is live (above); now run the Play track. **Signed AAB pre-built + staged: `~/Downloads/HideScore-release.aab`** (4.8M, versionCode 1, signed w/ upload key; rebuild anytime via `cd android && ./gradlew bundleRelease`). Remaining = **Play Console UI only** (acct `7809060308326519816`, $25 paid): create app `com.jacobhl.hidescore` → fill gating forms (privacy URL `hidescore.com/privacy` ✓200, data-safety, content-rating, target-audience, no-ads, open-access) → accept Play App Signing (⚠️ sideload APK users can't update over it — sig mismatch, must reinstall) → Closed-testing track → upload the AAB → add **≥20 tester emails**, they stay opted-in **14 consecutive days** → Apply for production. Reuse iOS listing copy (`APP_STORE_SUBMISSION.md`) + `screenshots/01–05`. ⚠️ every later upload must bump `versionCode`. _src: session_hidescore_android_app_build_2026_05_20_to_21.md; 6/10 this chat_

## T1 — Time-sensitive

- [ ] **QA on the native mobile app: confirm the Big Inning link actually deep-links into the MLB app (live only).** The "● Big Inning · LIVE" subtitle under the MLB column header (`LeagueColumn.tsx`) routes via `openExternal` to `entry.selectionUrl ?? https://www.mlb.com/tv`. The app-open hand-off only fires **inside the iOS/Android app** — on web it just opens the URL in a browser — so this can't be verified on desktop or by the dev `FORCE_BIG_INNING_LIVE_PREVIEW` flag (that only previews the styling). It only renders LIVE during the ~3h air window with ≥2 MLB games live, so it must be caught during an actual show. Next windows (ET): **6/4 8:00 PM**, 6/7 4:30 PM, 6/8 7:00 PM, 6/9 7:00 PM. On the **phone app** during one of those: tap it and confirm it opens *inside the MLB app* like the per-game watch links do. _src: 2026-06-03 Jacob_

- [ ] **ESPN Videos feed is stale (~23h) — Mac mini scraper.** The `espn-videos` R2 feed (the col-3 "News" videos on BOTH staging + hidescore.com) last fetched 2026-05-28 17:09; old clips show and dead ones 404 (e.g. the Elly De La Cruz link). Affects prod, not a layout bug.
  > ESPN's WAF blocks GHA datacenter IPs, so `espn-videos` is owned by the Mac mini cron (192.168.99.63) + a retry mirror. ~23h staleness ⇒ the Mac mini scraper is failing/stopped (or ESPN changed markup). Staleness checker should email at crit=24h. Investigate: is the Mac mini reachable + the espn-videos cron running? Re-run `scripts/prebake-news.mjs` for espn-videos there; check for an ESPN scrape regression. _src: 2026-05-29 Jacob (stale ESPN videos / Elly 404)_

- [ ] **GitHub Actions minutes — follow-up trims if the cap looms again.** The two core cron cuts shipped 5/29; this tracks the remaining conditional levers.
  > **DONE 5/29** (direct commits to `main`, `476b85b` / `7ccb9da`): `staleness-check.yml` `*/30`→`0 * * * *` (hourly, −720/mo) and `news-prebake.yml` hourly→`0 */2 * * *` (every 2h, −720/mo). Projected ~3,420 → ~1,980 min/mo, just under the 2,000 free tier (cycle reset ~6/1). A one-time confirm-check is scheduled 6/2 9am ET (routine `trig_01NnceGiHkisQki3uBpWVeBb`) to verify the new rate holds after reset.
  > **DONE 5/29 on `staging`** (so the staging→main merge no longer re-blows the cap): matched main's trims (`staleness-check.yml` `*/30`→hourly, `news-prebake.yml` hourly→every-2h) AND folded `node scripts/check-highlight-fallbacks.mjs` into `staleness-check.yml`'s hourly job, then deleted the standalone `highlight-fallback-check.yml` — so the highlight watchdog now costs 0 extra Actions minutes. The folded step runs even if the staleness step fails (guarded by `!cancelled()` + infra-success), so both alerts stay independent.
  > **Still open / conditional:** **consider `staleness-check` → every 2h (`0 */2 * * *`, another ~−360/mo) — especially if Actions approaches the cap again.** It's a pure watchdog (produces no content), so a 2h check still catches outages; this is the next lever to pull and the cheapest headroom. _src: session_loose_ends_audit_2026_05_28.md (chat 2d0aabd5); 2026-05-29 cron trim_

- [ ] **Merge `staging`→`main` to deploy the layout overhaul live.** The overhaul is COMMITTED + pushed to `origin/staging` (5/29: `15078e67` overhaul, `8480aa07` backlog reformat, `804ff49e` Actions-cap reconcile, `a35dc529` re-table Android pill); the commit step is done. Remaining: test staging, then merge to `main` (which auto-deploys).
  > Prod = `main` via `deploy.yml` (pushing `staging` deploys nothing). `staging` already contains 100% of the live site code — the only commits on `main` it lacks are the 4 cron/infra workflow YAMLs (verified: they touch only `.github/workflows/`), and `804ff49e` already reconciled those crons on staging, so the merge is now Actions-cap-safe. Must be a REAL merge, not a fast-forward — `main`'s 4 infra commits must survive (resolve the `staleness-check.yml` / `news-prebake.yml` conflicts in favor of staging's versions, which are the intended superset). After push to main: verify hidescore.com reflects the new layout, then `npx cap sync ios` to refresh the iOS offline first-launch fallback (low prio — app loads live via `server.url`). Supersedes the T2 "Header overflow" trim. _src: session_hidescore_staging_committed_2026_05_29.md_

- [ ] **iOS app rebuild + TestFlight upload.** Rebuild the iOS bundle (it's behind web) and push to TestFlight.
  > **Update 5/26: a 1.0.3 build 6 was already uploaded → TestFlight** (see the done "Next iOS build (1.0.3)" item below). Since the app loads live via `server.url`, the overhaul appears in-app automatically once it deploys — the upload wasn't blocked by the ordering. Only thing still pending: re-run `npx cap sync ios` AFTER the staging overhaul lands to refresh the offline-only `out/` first-launch fallback (low priority), then upload a fresh build if you want the fallback current. Web is ~3 commits ahead of the iOS bundle (Starts 5/3 fix, layout overhaul, playoff lookahead). `npx cap sync ios` → Xcode archive → TestFlight. _src: project_hidescore_ios_rebuild_2026_05_04.md_

- [ ] **Reddit promo — TABLED (account banned, appealing).** All Reddit work is paused until account access is restored.
  > Already posted to r/hockey: `reddit.com/r/hockey/comments/1thqa0g/` ("Built a free site that shows highlights without spoilers"); r/nba self-promo thread `reddit.com/r/nba/comments/1tkgv5i/`. Reddit account is currently BANNED — Jacob is appealing via email. Do NOT draft/post anything Reddit-related (promo or the OAuth-app follow-up below) until access is back. `REDDIT_DRAFT.md` stays on file for when it is. _src: session_hidescore_reddit_launch_2026_05_19_to_22.md_

- [ ] **Apple verdict watch.** Wait on Apple's review decision for the 5/13 resubmission.
  > Resubmitted 5/13, typical 24–48h turnaround. Passive — nothing to do but watch. _src: session_hidescore_resubmit_2026_05_13.md_

- [ ] **GSC validation clicks.** Click Validate on the three safe Search Console rows.
  > Safe rows: 5xx, 404, redirect. Skip "Crawled-not-indexed". No code, ~2 min. _src: session_hidescore_gsc_2026_04_27.md_

## T2 — Deferred with plan ready

- [ ] **Bracket modal: figure out the spoiler-safe view.** Decide how to surface the playoff bracket without revealing series scores.
  > Built on the `bracket-modal` branch (preview `https://bracket-modal.nospoilerscores.pages.dev`), but the bracket shows series scores (`COL 4 LAK 0`) — exactly what HideScore hides. Options: gate behind the monkey-see toggle, move to News view only, or strip scores and show an empty bracket + matchups. Rendering already works (NHL `#root` crop looks good, NBA Wikipedia clip works) — gating is the open question. Scrapers + `BracketTrigger`/`BracketFullModal` live in `src/components/BracketModal.tsx`. **Do not merge to main until decided.**

- [ ] **VideoModal spoiler-reveal overlay (autoplay-aware).** Show a tap-to-reveal overlay only when the browser blocks autoplay, so YouTube thumbnails can't flash the result.
  > MLB's official channel bakes results into thumbnails ("Complete Game Shutout!"), so the poster spoils before playback. First fix (commit `5131079f`, reverted in `f498eaf5`) showed the overlay unconditionally when monkey was off — but that adds friction where autoplay works. Refined plan: detect autoplay and only overlay when it's BLOCKED. HLS `<video>`: `videoRef.play()` returns a Promise — `.catch()` ⇒ denied ⇒ overlay. YouTube iframe: load `autoplay=1`, watch onStateChange — state stuck at -1/5 after ~500ms ⇒ denied. Hide the rendered headline while the overlay is active. Default monkey-on path unchanged. Reverted code in `5131079f` is the starting reference.

- [ ] **Score-bug removal toggle (Settings + per-video).** Add a setting (and ideally a per-video toggle) to mask the broadcast SCORE BUG baked into highlight footage — the live score graphic visible inside the clip. Companion to the title/bottom-bar mask toggles shipped 6/12 (`maskVideoTitle` / `maskVideoBottom` in Settings → "Highlight video").
  > Harder than the title/bottom masks, which only cover YouTube's own chrome: the score bug is INSIDE the footage (not player chrome), its position varies per broadcast (lower-third vs corner) and per league, and it's on-screen the whole clip — so a single always-on bar would crop a lot and still miss some layouts. Options, roughly in effort order: (a) per-league position presets (e.g. NBA/NHL lower-left, MLB upper-left) driving a small targeted black box; (b) a larger opt-in "hide score graphics" bar the user accepts will crop more; (c) CV/template detection of the score bug per frame (overkill for a hobby site). Lower priority — the title + bottom-strip toggles already cover the YT-chrome spoilers; this is for the in-footage graphic. _src: 2026-06-12 Jacob_

- [ ] **MLB player option 1.** Force hls.js on Safari and drop subtitles for clean, Reddit-style controls.
  > Touch `VideoModal.tsx:133` (skip the native HLS branch), remove the CC button at `:332-342`. _src: project_hidescore_mlb_player_consistency.md_

- [ ] **FastCast pin.** Pin Real Fast + FastCast to the first two slots of the MLB videos strip.
  > New `fetchMLBPinnedRoundups()` in `scripts/prebake-news.mjs`, prepend before the `items.length >= 10` cap. _src: project_hidescore_mlb_fastcast_pin.md_

- [ ] **Post-R2 #1: NBC.com scraper.** Deep-link NBC broadcast chips to `nbc.com/watch/...` URLs.
  > New `scripts/scrape-nbc-sports.mjs` mirroring the prime-asins pattern. Edit `espn.ts:671`. _src: project_hidescore_post_r2_followups.md_

- [ ] **Reddit news feeds DOWN — anonymous endpoint now 403s the Mac-mini IP too; OAuth blocked by the banned account.** All r/* feeds stale since ~2026-05-28 17:09 (last good scrape). Up to then the Mac-mini residential IP could still hit unauthenticated `reddit.com/.../hot.json`; Reddit then started 403'ing it (the GHA IPs were already blocked since 4/27).
  > **5/29 tests (Mac mini):** unauthenticated `r/sports/hot.json` returns **403 with BOTH the app-format UA AND a browser (Safari) UA** → it's an **IP block**, not a User-Agent issue (the [[reference_reddit_curl_bypass]] browser-UA trick only beats Anthropic's crawler block, not Reddit's IP block). And **creating a new OAuth app no-ops behind Reddit's Data-API "Responsible Builder" gate** — the same silent-queue wall hit 4/28 with `Reasonable_Stick_329` (create-app button injects the policy link instead of creating). So Reddit is locked on THEIR side both ways; no client-side fix. Realistic paths: Reddit approves the Data-API registration (filed 4/28, silent since), or run the scrape from a different/un-blocked residential IP, or accept Reddit feeds stay off (site is fine without them).
  > The scraper (`fetchReddit` in `prebake-news.mjs`) already supports app-only OAuth via `oauth.reddit.com` when `REDDIT_CLIENT_ID`/`REDDIT_CLIENT_SECRET` are set — but they're NOT on the Mac mini (only `r2.env` there) and NOT in local `.env.local` (they live in GitHub secrets). **Fix path (does NOT need the banned account back):** register a FRESH Reddit API app under ANY working account (reddit.com/prefs/apps → "script" or "web app", ~2 min) → get client ID + secret. App-only OAuth (`grant_type=client_credentials`) reads **public** subreddit listings — no posting, no good standing required, and Reddit's free tier (~100 req/min) is plenty; the "Data API approval" is only for higher/commercial limits, NOT needed here. Then put the two creds in `~/.config/hidescore/reddit.env` on the Mac mini + `source` it (or export) in `hidescore-reddit-cron.sh` so `fetchReddit` takes the `oauth.reddit.com` path. The old app `Reasonable_Stick_329` is under the banned account → just make a new one. Until wired, Reddit feeds stay empty (ESPN unaffected — decoupled 5/29). _src: project_hidescore_reddit_403.md; 2026-05-29 Jacob_

- [ ] **Length toggle (Extended / Condensed).** Add a highlight-length toggle, starting with MLB.
  > MLB has the most distinct cadences: ~5 min condensed vs ~15–20 min full recap vs 1-min cuts. _src: project_hidescore_gap_closing_2026_04_13.md_

- [ ] **ESPN news: sort-by-views decision.** Decide how to rank ESPN news without a views signal.
  > ESPN's API doesn't expose view counts. Choose: scrape engagement metrics, or curate editorially. _src: project_hidescore_backlog_2026_04_13.md_

- [ ] **ESPN news: default click-action decision.** Pick what tapping an ESPN news item does.
  > Options: ESPN gamecast, highlights modal, expand the card, or nothing. _src: project_hidescore_backlog_2026_04_13.md_

- [ ] **MLS-vs-EPL summer overlap decision.** Decide which league shows when both run over the summer.
  > Both active May 21 → Aug 1. Which displays? _src: project_hidescore_gap_closing_2026_04_13.md_

- [ ] **Playoff bracket on subtitle hover.** During playoffs, hovering a league's playoff subtitle pops a bracket image.
  > Hook point: `LeagueColumn.tsx:679` (`<PlayoffSubtitle …/>`). Live-relevant now (NBA/NHL conference rounds, Stanley Cup ~6/4, NBA Finals ~6/5). Open Qs: (1) bracket source — ESPN screenshot (likely spoils scores, avoid) vs generated SVG from the `games[].playoffLabel` data we already parse vs hand-curated PNG per league. (2) mobile has no hover — tap-to-open modal? long-press? chevron? (3) positioning — anchored tooltip vs centered modal vs slide-down panel. (4) per-league — NBA/NHL/MLB have brackets; WNBA/MLS playoffs; golf has none; NCAA's 64-team grid is separate.

- [ ] **Adaptive layouts for 1–2 visible league columns (the 4–5 half SHIPPED 6/11).** Make the 1-and-2-column layouts respond too instead of assuming 3.
  > **✅ 6/11: the 5-column board is live** — ≥1280px viewports auto-show 5 league columns (Jacob 6/10 "show 5 leagues if there's room for all naturally"): slot system extended to `fourthLeague`/`fifthLeague` in `preferences.ts` (share-URL `s=` already array-based), `pickAndAssignLeagues(viewDate, count)` + `fetchAllLeagues(..., slotCount)` fill slots 4–5 from the priority pool, `HomeContent` tracks the breakpoint (fetches read live `matchMedia` so the first desktop load pulls 5 in one pass) and widens `<main>` to `max-w-7xl`, Settings shows Slots 4–5 "(wide screens)". Narrow viewports keep the classic 3 — slots 4–5 prefs persist untouched. **Remaining (this item):** **1** = single centered wider column (~`max-w-[480px]`), maybe a hero treatment; **2** = two wider equal columns. Pairs with the column drag-handle (the 3-dot indicator added 5/24). _src: session 2026-05-24; shipped 2026-06-11_

- [ ] **F1 (Formula 1).** Add Formula 1 — a bigger lift than other league adds because races have 22 drivers, not 2 teams.
  > ESPN endpoint exists (`racing/f1/scoreboard`); channel = `FORMULA 1`, title format `Race Highlights | 2026 <Race> Grand Prix`. The `Away vs Home` GameCard render and the `${away} vs ${home} highlights ${date}` query both break for a 22-competitor event. Needs: (a) a new GameCard branch like the golf/tennis tournament tiles (race + circuit + podium row), (b) `getF1HighlightQuery(raceName, year)` mirroring `getGolfHighlightQuery`, (c) ~3h buffer (race + upload), (d) season window 03-01 → 12-15, (e) a Sunday priority slot. `OFFICIAL_CHANNELS.f1 = "FORMULA 1"` already handled in the AlignedVideoStrip mobile-strip regex. _src: session 2026-05-27 sports-audit_

- [ ] **Additional sports — decide which to add (Olympics first).** Evaluate and pick which other sports to bring in, Olympics first.
  > Evaluated 2026-05-27 but deferred. In rough priority order:
  > - **Olympics** (Winter + Summer) — biennial 2-week windows (next: Summer 2028 LA Jul 14–30; Winter 2030 French Alps Feb). Huge audience but no aggregated ESPN feed — each event posts under its sport. Needs a custom source (NBC Olympics or IOC YouTube?), not the simple ESPN-add pattern.
  > - **La Liga / Bundesliga / Serie A / Ligue 1** — ESPN `soccer/esp.1`, `ger.1`, `ita.1`, `fra.1`. Most US viewers follow one; do prefs gate which shows?
  > - **Liga MX** — `soccer/mex.1`, year-round (2 splits). Large NYC fanbase, ESPN coverage.
  > - **NWSL** — `soccer/usa.nwsl`, Mar–Nov. Growing audience.
  > - **UFC** — `mma/ufc`, most Saturdays. Spoiler-heavy → fits the app. Add if Jacob watches.
  > - **Ryder Cup** — biennial Sep golf event (next: 2027, Adare Manor, Ireland).
  > - **NASCAR / IndyCar** — `racing/nascar-cup`, `racing/irl`. Niche overlap with F1; skip unless interested.
  > - **Cricket (IPL, T20 World Cup)** — `cricket/<league>`. Global big, small US daily audience.
  > - **Rugby (Six Nations, RWC)** — `rugby/<league>`. Niche in the US.
  > - **UEFA Conference League** — `soccer/uefa.europa.conf`. Pairs with UCL + UEL.
  > _src: session 2026-05-27 sports-audit_
  >
  > **Update 2026-08-03 — most of this list SHIPPED.** Added and verified live against
  > ESPN: Liga MX, NWSL, EFL Championship, Copa Libertadores, Saudi Pro League, Euro
  > (yearCycle-gated to 2028), AFCON (gated to 2027), Cricket/IPL, NASCAR, IndyCar.
  > NCAAM/NCAAW were already in. Still open from the list above: Olympics, Ryder Cup,
  > Rugby (ESPN's `rugby/*` scoreboard 400s — no working path found), UEFA Conference
  > League.

- [ ] **Esports column (LoL) — new data provider, not ESPN.** Biggest remaining audience gap. Worlds peaks ~6M+ concurrent excluding China and is watched almost entirely on VOD in the West because it's played in Asian timezones, which makes it the purest spoiler use-case after cricket.
  > **Source found and de-risked (2026-08-03):** `https://esports-api.lolesports.com/persisted/gw/getSchedule?hl=en-US`
  > with the `x-api-key` header set to Riot's PUBLIC lolesports web key — the constant hardcoded in
  > their own browser client, not a credential. Not pasted here: it is high-entropy enough that
  > gitleaks blocks the commit, and an allowlist entry would weaken the hook for a value anyone can
  > read out of lolesports.com in devtools (Network tab → any `persisted/gw/*` request). Returns 200,
  > **and it sends `access-control-allow-origin: *`** — so it can be fetched straight from the browser
  > with NO worker proxy. That was the expensive part and it's not needed.
  > Payload maps onto the existing two-team `Game` card almost 1:1: `match.teams[].name/code/image`,
  > `result.gameWins` → score, `record.wins/losses` → record, `strategy.count` → Bo1/Bo3/Bo5,
  > `state` unstarted/inProgress/completed → pre/in/post, `blockName` → "Week 3"/"Playoffs".
  > **Two real design decisions before building:**
  > 1. The endpoint is a rolling ~80-event firehose across **22 leagues** (LCK, LPL, LEC, LCS, LCP down
  >    to Hellenic Legends League). Needs a majors allowlist — suggest LCK/LPL/LEC/LCS/LCP + Worlds/MSI.
  > 2. It is **not date-keyed** the way every ESPN endpoint is — there's no `?dates=` param, just a rolling
  >    window plus `pageToken` for older pages. Date navigation (Yesterday / a past tab) needs a
  >    fetch-then-filter layer, which is the one genuinely new bit of plumbing.
  > ⚠️ Team logos come back as `http://static.lolesports.com/...` — must be upgraded to https or they
  > break on the HTTPS page.

- [ ] **Chess column — Lichess broadcasts.** Small audience (~1–2M engaged) but structurally the best fit of any sport on this list: the dominant way people consume chess IS a recap video, so spoilers are the whole problem.
  > **Source found and de-risked (2026-08-03):** `https://lichess.org/api/broadcast?nb=N` (NDJSON, no key,
  > **`access-control-allow-origin: *`** → browser-direct, no proxy). Each record carries
  > `tour.name`, `tour.info.location`, `tour.dates`, `tour.tier`, `tour.url`, `tour.image`.
  > Shape is a tournament + rounds, not two teams — so this should render as the **single-event tile**
  > (the `kind: "f1"` layout that F1/NASCAR/IndyCar now share), titled with the event and subtitled with
  > the location, NOT as a game card.
  > Open question: `tier` semantics need confirming before it can be used to filter to marquee events
  > (Candidates / World Championship / Tata Steel) instead of showing every club tournament.
  > ⚠️ Audit `tour.description` for result leakage before rendering it.

- [ ] **Boxing — BLOCKED on a data source, needs a Jacob decision.** Spiky but enormous (tens of millions per PPV), and replay-heavy, so it fits the app. There is just nothing to read.
  > Confirmed 2026-08-03: ESPN has **no** boxing endpoint. `sports/boxing/scoreboard` → 404,
  > `sports/mma/boxing/scoreboard` → 400, `site.web.api` variant → 404. No free feed found.
  > Three options, all requiring a call: (1) pay for a sports-data API that carries boxing cards;
  > (2) hand-curate — it's only ~8–12 events a year, so a small JSON file in the repo is genuinely
  > viable and costs nothing; (3) drop it. Option 2 is the cheapest real answer.
  > Note boxing is also a weak retention driver either way — a handful of events a year, no daily slate.

- [ ] **Header overflow — bottom-toolbar / tab-bar redesign.** Fix the header overflowing on narrow screens, likely by moving icons to a bottom toolbar.
  > It needs ~422px but phones give 360–414px → 8–62px overflow → the whole page becomes pannable (scores + Settings look mis-scaled). Confirmed live via Playwright at 360/390/414px — a website bug both native apps inherit through the WebView. Root cause: the right-side icon cluster (`justify-self-end … flex-shrink-0` in `HomeContent.tsx`) can't compress. Options: (1) **bottom toolbar / iOS tab bar** (Jacob's pick) — move all icons except date nav (share, monkey-sort, news, calendar, theme, settings) into a fixed bottom bar; header keeps the H logo + ‹ Yest/Today/Tomo ›. Uses `position:fixed` + `env(safe-area-inset-bottom)` like the footer; cleaner inside the native apps than mobile Safari. Note a true tab bar is for nav (Scores/News/Settings) — toggles like monkey-sort/theme aren't nav, so accept a mixed bar or split them. (2) wrap header to two rows on narrow screens. (3) shrink icons `w-7→w-6` + tighten gaps + drop calendar on mobile. (4) collapse secondary icons behind a `⋯` menu. Don't regress the `xl:` logo / DateNav-centering breakpoint — see `feedback_hidescore_header_compact.md`. **Update (5/21):** option (2) the 2-row wrap was shipped (`833e45a3`) then **REVERTED** (`2165e68b`) — Jacob disliked the unbalanced look. Agreed next = **remove redundant icons**: delete the header App Store icon (it duplicates the footer App Store badge) + fold the calendar into tapping the date label → 3 icons (monkey · news · settings), one row. **The 5/28 layout overhaul on `staging` reworks the header into a bottom tab bar (option 1, Jacob's pick) and likely supersedes this — verify that's merged before doing the standalone trim.** _src: session_hidescore_iphone_toolbar_overflow_2026_05_20.md, session_hidescore_android_app_build_2026_05_20_to_21.md_

- [ ] **Android app — Play Store vs stay-sideload (pill un-table now pinned at top).** The app is built + sideloadable; the Play Store track is parked.
  > See the 📌 Pinned item at the top for the footer-pill un-table + label fix. Remaining decision here: Play Console acct `7809060308326519816` ($25 paid) needs a real device + 20-tester / 14-day closed test (~6 weeks) to publish; sideload at `hidescore.com/HideScore.apk` is the working channel meanwhile. _src: session_hidescore_android_app_build_2026_05_20_to_21.md_

## T3 — Older backlog, still open

- [ ] **Dodgers walk-off recap threshold.** Yesterday's walk-off ranked only "good" — it should rank higher; investigate the threshold.
  > _src: project_hidescore_backlog_2026_04_13.md_

- [ ] **MLB time wrap on mobile.** The Pit vs Chi game time wraps on mobile while others don't.
  > _src: project_hidescore_backlog_2026_04_13.md_

- [ ] **NBA "Tomorrow" tag bubble.** A favorited team isn't bubbling to the top when tagged for tomorrow.
  > _src: project_hidescore_backlog_2026_04_13.md_

- [ ] **Multi-network click expand.** Click a multi-network card to wrap text under the network row over team records; click again to collapse.
  > _src: project_hidescore_backlog_2026_04_13.md_

- [ ] **Calendar button won't close on 2nd click.** It opens correctly but won't dismiss.
  > _src: project_hidescore_backlog_2026_04_13.md_

- [ ] **Favorites-saved popup transparent bg.** The popup background is transparent in mobile dark mode (desktop is fine).
  > _src: project_hidescore_backlog_2026_04_13.md_

- [ ] **SportsCenter YouTube fix.** The link points at Jacob's saved channel, not the official ESPN one.
  > _src: project_hidescore_backlog_2026_04_13.md_

- [ ] **Team subreddit links at bottom of cards.** Not yet implemented.
  > _src: project_hidescore_backlog_2026_04_13.md_

- [ ] **Live-game dates in team view use withEspn.** Guard team-view live games so ESPN gamecast links don't spoil scores.
  > A gamecast on a LIVE game would spoil — guard with an `isFinished`-style check. _src: session_hidescore_team_view.md_

- [ ] **NewsColumn / news.ts ownership confirm.** Confirm these were intentionally committed with the team-view session.
  > _src: session_hidescore_team_view.md_

- [ ] **Big yesterday highlights from other teams.** Surface big highlights beyond the top-billed team.
  > _src: project_hidescore_backlog_2026_04_13.md_

- [ ] **Season-wide highlight scrub.** Pull top dunks and the season's biggest highlights from official channels.
  > _src: project_hidescore_backlog_2026_04_13.md_

## T4 — Polish / low priority

- [ ] **Add a "not affiliated" disclaimer + prefer team names over logos (do before the marketing push widens reach).** A discreet footer/About line: "Not affiliated with or endorsed by ESPN, MLB, the NHL, NBA, WNBA, or any league or team." Cheap mitigation for the implied-endorsement / trademark angle. Could live in the same About/overlay home as the orphaned `/faq` `/privacy` links. Team **logos** carry trademark + separate-copyright risk; lean on team **names** where practical (names = nominative fair use, safe). _src: 2026-06-07 ToS review (this chat); see [[project_app_monetization_and_tos]]_

- [ ] **Delete the redundant nospoilerscores Vercel project.** hidescore.com runs on Cloudflare Pages now; the old Vercel Git link just burns ~1 build/day and leaves a stale `.vercel.app` URL.
  > Delete the Vercel project entirely — NOT just disconnect Git (that leaves a frozen `nospoilerscores.vercel.app` still resolving, the worst of the three options). First verify nothing points at the `.vercel.app` URL (DNS, App Store / Capacitor `server.url`, links). Confirmed 5/28: live site is `server: cloudflare`. _src: session_loose_ends_audit_2026_05_28.md (chat f31109fe)_

- [ ] **News section jump-nav — prefer a left sidebar (Claude-homepage style).** Easier way to jump between news sections, especially in 1-col stacked mode where all leagues stack.
  > Jacob's pick (5/29): a **left sidebar** like the claude.ai homepage — a persistent vertical list of the visible league/section headers; tapping scrolls (or filters) to that section. Original idea was a sticky horizontal pill row (like the Yest/Today/Tomo date nav); the sidebar is the preferred direction. Pairs with the 1-col "lists all leagues" behavior. Mobile fallback for a sidebar TBD (drawer? collapse to top pills?). _src: 2026-05-27 layout-iteration; 2026-05-29 Jacob_

- [ ] **Relabel the "smart order" news column header (esp. 1-col mode).** The ESPN/smart-default news column header reads ambiguously; rename to something clear like "Smart order" / "Top headlines".
  > In 1-col mode the view lists all leagues (good), but the lead/ESPN column header needs a clearer label than the current league-switcher affordance — "Smart order", "Top headlines", etc. — so it's obvious what the default ordering is. _src: 2026-05-29 Jacob_

- [ ] **ESPN "News" column: headlines-on-top option (height-matched) + setting to flip.** Jacob wants the col-3 ESPN section to lead with TEXT HEADLINES on top — but at the SAME height as the other two columns' first video cards, so the 3-up top row stays aligned/clean. Add a Settings toggle to flip headlines to the bottom (= current view: ESPN Videos on top, headlines tail below).
  > Requires `AlignedVideoStrip` surgery: today col-3's row-1 cell is a video card (subgrid-aligned with NBA/MLB videos) and ESPN top headlines fill the pad rows below (`useEspnTopTail`). The ask = make col-3's row-1 cell a compact ESPN-headlines block sized to the same subgrid row height as the video cards (align-self handles short content), with the ESPN video(s) moving below. New pref e.g. `espnNewsLead: "headlines" | "video"` (default "headlines" per Jacob), surfaced in SettingsPanel. Needs visual iteration on the preview. _src: 2026-05-29 Jacob_

- [ ] **Mobile / narrow-screen header polish (scores view).** On smaller screens the top toolbar (H logo left, calendar+settings right, then ‹ Yest/Today/Tomo › on a 2nd row) looks unbalanced — too much empty space, date nav floating alone. Tighten it.
  > Jacob flagged 2026-05-29 (screenshot). The bottom-tab-bar overhaul reworked the header; the scores-view narrow layout wraps the date nav to a 2nd row and feels sparse. Options: pull the date nav into the top row when it fits, reduce the vertical gap, or rebalance logo/icon spacing. Don't regress the `xl:` logo / DateNav-centering breakpoint ([[feedback_hidescore_header_compact]]). **Update 5/29: Jacob says "looks fine for now" — low prio.** _src: 2026-05-29 Jacob_

- [ ] **Verify scores column sizing is 1:1 vs the old layout.** staging + main `LeagueColumn` are byte-identical (`max-w-[225px] xl:max-w-[280px]`, same gaps), so the "columns look smaller on staging" was a window-width artifact — but double-check against Jacob's 4:43pm 5/29 screenshot once pasted to confirm 1:1 sizing at the same viewport width.
  > Compare at matched browser widths (the `xl:` 1280px breakpoint bumps 225→280). If they genuinely differ, look for a container max-width / padding delta introduced by the overhaul. Screenshot on Jacob's machine (~Desktop). _src: 2026-05-29 Jacob_

- [ ] **Desktop header rework — swap view-tabs to top-middle, date nav to 2nd row, center on the middle column, full-width divider.** Jacob's #4 (5/29): on larger screens, put the Scores/Rated/News tabs in the TOP-row middle (where Yest/Today/Tomo sits now) and move the date nav to the 2nd row; both middle pieces must be **dead-center aligned with the middle (MLB) column / page center** — currently they center within the flex gap between the logo (left) and icon cluster (right), so they're off-center. Also the header's horizontal divider line must **extend full screen width** and look clean. Must be responsive.
  > Current: header is `flex` (logo left · flex-1 middle · icons right) → middle isn't page-centered. Fix likely = absolutely-center the middle block (`absolute left-1/2 -translate-x-1/2`) or a symmetric 3-col grid with equal side widths, so it lines up with the centered 3-column content below. The inline `BottomTabBar placement="inline"` (added 5/29, currently a 2nd row) becomes the top-middle element; DateNav drops to row 2 (scores/rated only). Needs visual iteration on the preview. _src: 2026-05-29 Jacob #4_

- [ ] **ESPN videos: real highlights only (filter talking-heads) + fix low yield.** Jacob (5/29): the ESPN "News"/Videos column shows analyst/insider videos (e.g. "Jeff Passan: MLB, MLBPA could not be further apart") — he wants ONLY actual play highlights. Also it only returned ~2 items.
  > Scraper-side (Mac mini + `scripts/prebake-news.mjs`). `fetchESPNTopVideos` (writes `espn-videos`) does NOT apply the existing `VIDEO_BLOCKLIST` (NBA/WNBA fetchers do) — apply it there. BUT insider-report titles like "Jeff Passan: …" have no blocklist keyword, so also add insider-name patterns (passan, rovell, lowe, mcmenamin, …) and/or filter by ESPN video category/duration. Low yield (~2) suggests ESPN's top-videos scroll is thin/analysis-heavy right now — may need a dedicated highlights source if it persists. After fixing, the change lands via the repo + the Mac mini's hourly cron (which now stays alive past the Reddit 403s). _src: 2026-05-29 Jacob_

- [ ] **Re-add news source-order / hide menu (☰) — single-column view.** Removed the header ☰ menu 5/29 (Jacob: only useful in 1-col view). Bring it back, scoped to where it helps.
  > The drag-reorder + per-source hide (`NewsOrderMenu`, still defined in HomeContent.tsx) was pulled from the header cluster; state/component remain. Re-surface it in 1-col mode (or per-column) when revisiting the news layout. _src: 2026-05-29 Jacob #3_

- [ ] **Decide what the news columns show when the "Homepage" source filter is selected.** (Don't build yet — just figure out the right behavior.) With the 4-category filter, picking "Homepage" restricts to the league-official site feeds (NBA.com / MLB.com); columns whose visible cascade has no homepage-type source go sparse/empty. Decide the intended UX: collapse to fewer columns? show a single aggregated homepage column? fall back to something? Same question applies to ESPN/Reddit/Top videos when a column has none of that type. _src: 2026-05-29 Jacob_

- [ ] **News toggle icon looks broken.** Swap the News toggle icon — it reads as a smudge at small sizes.
  > Lucide's `newspaper` glyph: at 14–16px the folded-corner detail collapses into a stray smudge/doubled line. Swap for a simpler document/feed icon (`HomeContent.tsx:815-820`). _src: session 2026-05-19_

- [ ] **Big Inning auto-tick timer.** Make the Big Inning subtitle flip to "LIVE" on time without a page re-render.
  > It doesn't flip "9:00 PM ET" → "LIVE" mid-session without a render. Add a 60s timer in PlayoffSubtitle. _src: session104_hidescore_2026_05_08_to_13.md_

- [ ] **Clean dead code.** Remove a few stale code paths.
  > `next.config.ts` rewrites, the commented ESPN button at `GameCard.tsx:44-55`, the backup footer at `HomeContent.tsx:419-422`. _src: project_hidescore_backlog_2026_04_13.md_

- [ ] **Live-clock bar: smooth the loop seam.** The Google-style Material progress bar under the live clock (`Q4 - 02:05`) is a touch glitchy at the end of its cycle — the green segment doesn't minimize smoothly before the loop restarts.
  > Part of the WIP Google live-clock feature (poll-and-jump countdown + Material indeterminate linear progress bar; not yet ported into the repo — lives in the `/tmp/live-clock-comparison` demo). The seam is the primary/secondary `scaleX`→0.08 reset at 100%. Likely fix when porting: the two-segment Material spec is designed to hide the seam (the secondary bar covers the primary's reset) — make sure BOTH segments are wired, or stagger/cross-fade so no frame shows an empty/abrupt collapse. Exact keyframes + DOM in `reference_google_material_indeterminate_progress.md`. _src: session_hidescore_live_clock_google_bar_2026_05_27.md_

- [ ] **Revisit short-column pinning.** Decide whether to bring back pinning a column's cards when it has few games, maybe with new criteria.
  > Added 5/19 (commit `ed02abca`), removed 5/20 (felt off). Possible new triggers: pin only when *every* column has ≤3, or trigger on viewport-height vs total-card-height instead of count. Reference impl in the `LeagueColumn.tsx` diff of `ed02abca` (headerStripRef + ResizeObserver + `stickyGamesStyle`). _src: session 2026-05-20_

- [ ] **Footer pinning consideration.** Explore a footer that sticks to the viewport bottom (FeedbackBox + captions + App Store badge stay visible).
  > Open Qs: mobile real-estate cost, iOS safe-area handling, pin only on tall-content days or always. Sibling to short-column pinning. _src: session 2026-05-20_

- [ ] **Live-card green accent bar.** Revisit a green accent bar on live cards (shipped then reverted).
  > Shipped 5/20 (commit `96126cab`) as a 3px inset box-shadow `#22c55e` on the left edge; reverted 5/20 ("like it but don't love it"). Revisit if live games need a stronger scan signal beyond the red LIVE pill — maybe a thinner bar, a color tied to `--text-live`, or a border-color shift instead of an inset shadow. _src: session 2026-05-20_

- [ ] **Ratings popup copy precision.** Fix the ratings popup copy — it misstates how games are sorted.
  > `HomeContent.tsx:529` says "reordered by top records and best matchups", but live/finished sort by rating and only upcoming sort by records. Suggested: "Games are also reordered by best matchups — live and finished by rating, upcoming by team records." _src: project_hidescore_backlog_2026_04_13.md_

- [ ] **Delete stale `public/` JSON copies.** Delete the 39 fallback JSON files in `public/` once R2 has been stable ~30 days.
  > Target ~6/13. Cosmetic. _src: project_hidescore_deploy_cap.md_

- [ ] **Playoff countdown copy.** Show "Playoffs in X days", appending the date if the card has room.
  > Append "(Mar 20)" if width allows. _src: project_hidescore_backlog_2026_04_13.md_

- [ ] **Playoff placeholders for TBD play-in.** Show greyed-out placeholder cards for TBD play-in games.
  > `season.type: 5`. _src: project_hidescore_backlog_2026_04_13.md_

- [ ] **MLB live links QA.** Do a live-game QA pass on MLB live links.
  > Shipped session 48, needs the QA pass. _src: project_hidescore_backlog_2026_04_13.md_

- [ ] **`/faq` and `/privacy` orphaned — no in-app link.** Give both pages a discreet in-app link; they're currently reachable from nowhere.
  > Footer dropped FAQ/Privacy in commit `c853502d` for a cleaner feedback-box layout (deliberate — the full FAQ on the homepage was too exposed). Now `/faq` is reachable only via `sitemap.xml` (Google finds it, humans can't) and `/privacy` from nowhere. App Store listing carries the privacy URL separately, so submission is fine. Revisit with a discreet home — a "···"/"About" overlay, a settings-panel row, or one subtle footer line. _src: session 2026-05-19_

- [x] **Next iOS build (1.0.3) — bundled + uploaded 2026-05-26.** Built + uploaded **1.0.3 (build 6)** to App Store Connect via CLI archive→export; processing → TestFlight (NOT auto-released — submit for review when ready). Version bump committed + pushed to `staging` 5/29 (`8b43bfed`).
  > Build 6 now CARRIES (no longer "will ride a future build"): dark/tinted app icons, Info.plist white status bar (`UIViewControllerBasedStatusBarAppearance=false` + `UIStatusBarStyle=LightContent`), explicit ATS `NSAllowsArbitraryLoads=false`. **Correction to old note:** Cloud Signing DOES work from the CLI — it needs an **Admin** ASC API key (App Manager fails with "Cloud signing permission error"); ASC keys are immutable so you revoke+regenerate to change role; a released version train is closed even to TestFlight, so MARKETING_VERSION had to go 1.0.2→1.0.3. Full recipe + 3 gotchas in `reference_xcode_cli_ios_buildout.md`. Still open as separate items below: PrivacyInfo.xcprivacy, splash simplification (ATT = no action — GoatCounter is cookieless). _src: session_hidescore_ios_audit_upload_2026_05_22_to_26.md_

- [ ] **Downgrade the Admin ASC API key `4H5A2N5GKT` → App Manager.** Made it Admin 5/26 only to unblock Cloud Signing for the 1.0.3 upload; drop the standing Admin privilege now the upload is done.
  > App Store Connect → Users and Access → Integrations. ASC key roles are IMMUTABLE, so "downgrade" = revoke `4H5A2N5GKT` + regenerate a new key as App Manager, then update `~/.appstoreconnect/credentials` (the creds shim) + the `.p8` at `~/.appstoreconnect/private_keys/`. **Tradeoff:** App Manager CANNOT do CLI Cloud Signing (fails "Cloud signing permission error"), so a future cloud-signed `archive→export` upload would need a temporary Admin re-elevation again — OR switch to LOCAL signing (own distribution cert + provisioning profile), which App Manager handles fine and which sidesteps needing Admin at all. App Manager keeps everything else (metadata, TestFlight, submit-for-review, altool upload). _src: session_hidescore_ios_audit_upload_2026_05_22_to_26.md_

- [ ] **iOS PrivacyInfo.xcprivacy manifest.** Add the privacy manifest Apple requires for new submissions.
  > Required since May 2024. We use GoatCounter (`layout.tsx:135`), so create `ios/App/App/PrivacyInfo.xcprivacy` declaring `NSPrivacyTracking` only if GoatCounter touches IDFA (it doesn't by default — confirm), `NSPrivacyTrackingDomains: ["hidescore.goatcounter.com"]`, and required-reason API entries for any Capacitor plugin touching file timestamps / UserDefaults. Existing submissions are grandfathered; new uploads may start warning. _src: ios audit 2026-05-20_

- [ ] **iOS App Tracking Transparency check.** Check whether GoatCounter touches IDFA; add an ATT prompt only if it does.
  > Paired with the privacy manifest. If GoatCounter touches IDFA, add `NSUserTrackingUsageDescription` to Info.plist and request permission. If not (likely — it's cookieless), do nothing; an ATT prompt for non-tracking analytics is itself a review risk. _src: ios audit 2026-05-20_

- [ ] **iOS splash screen simplification.** Replace the stretched splash image with a plain dark background.
  > `LaunchScreen.storyboard` scales a 1366×1366 image via `scaleAspectFill`; Apple HIG prefers near-empty launch screens. Looks stretched and slow. _src: ios audit 2026-05-20_

- [ ] **Buttons too small to interact with on mobile.** Audit tap targets — several are below Apple's 44×44pt minimum.
  > Star, broadcast chip, +N network expander, and highlight play buttons are under 44×44pt. Related: whole-card click-to-stream (live cards with `cardClickable` at `GameCard.tsx:261`) competes with inner buttons that `stopPropagation` — if buttons grow, accidental whole-card hits rise. Decide: keep the card clickable with bigger buttons, or move the stream affordance to one dedicated chip and un-click the card body. _src: session 2026-05-20_

- [ ] **In-app browser fallback for non-login network links.** If we ever add network/watch links that AREN'T login-gated (free schedules, previews, recaps), upgrade the native app-link handoff to keep the in-app browser as the fallback when the app isn't installed.
  > Current `openExternal.ts` hands known app-domain https URLs to `AppLauncher.openUrl()`: opens the installed app deep-linked to the game, else **full Safari**. Intentional for the current links — they're all login-gated streaming (mlb.com/tv, espn.com/watch, Peacock, Max…) and `SFSafariViewController`'s isolated cookie store (iOS 11+) would force a re-login, so full Safari (carries the user's session) is the better fallback. The "both worlds" design = open with iOS `UIApplication.open(url, options: [.universalLinksOnly: true])` → deep-links to the app if installed, returns failure if not, then fall back to `Browser.open` (in-app). Stock `@capacitor/app-launcher` doesn't expose `universalLinksOnly`, so this needs a small custom native plugin. Only worth it once a non-login link exists. _src: session 2026-05-29 (deep-link to network apps)_

- [ ] **Video streaming-quality levers — both shelved, rec = skip.** Two remaining knobs from the 6/2 video-quality audit (prod `f3bd0ff8`); neither is worth the cost in general. **Recommend leaving both.**
  > **(1) Brightcove rendition pinning** (NHL/MLB *embed*-path clips). No quality lever without ripping out the Brightcove iframe and building a custom player wired to their Playback API — a big lift for marginal gain on a path that's already fine. The `<video>`/hls.js path already pins the top rendition; only the embed path lacks it. **Skip** unless embed-clip quality becomes a real complaint.
  > **(2) Modal width >6xl.** The modal is at `max-w-6xl` (5xl→6xl shipped 6/2; video capped `max-h-[85vh]`). Going wider (7xl / `max-w-screen`) is the *only* Safari/iOS quality lever — those bypass hls.js (native HLS), so the sole knob is the `<video>` element's rendered size; it would also nudge YouTube up. Cost: wider modal crowds the desktop layout on smaller laptops, and because the box is already height-bound at 85vh the real-world resolution gain can be small. **Skip in general.** _Prototype 6/2: `VideoModal.tsx:531` flipped to `max-w-7xl` (commented, uncommitted in the working tree) so the desktop trade-off can be eyeballed — `git checkout src/components/VideoModal.tsx` to revert._ _src: reference_hidescore_video_quality.md; 2026-06-02 Jacob_

## T5 — Strategic reminders (not action items)

- [ ] **MLB clip-embed legality.** Revisit embedding MLB's HLS clips before any monetization.
  > The in-app MLB modal streams MLB's HLS playlists directly. Fine for a hobby site; revisit before an App Store paid tier, ads, sponsorships, or scale. Safer path: anchor out to MLB.com. _src: project_hidescore_mlb_clip_legality.md_

- [ ] **Pre-monetization legal checklist (ToS / fair-use review 2026-06-05/07).** Full risk assessment done; scores/ratings/standings are uncopyrightable facts (Feist v. Rural) → the data layer is low-risk. Before any paid tier / ads / sponsorship-funded scale:
  > **Video is the hot zone.** Never rehost raw video — embed OFFICIAL players only (already the case; keep it). Prefer YouTube embeds (their API grants embedders a license) but DON'T paywall YouTube playback or strip the player/ads (banned by YouTube API ToS). Treat **MLB highlights** (forge-dapi / HLS) as the single biggest exposure — MLBAM is the most aggressive DMCA enforcer in sports; drop or license them FIRST if charging. (Extends the "MLB clip-embed legality" item above.)
  > **Commercial use raises exposure across the board.** ESPN(Disney)/MLB/Reddit ToS all grant only *non-commercial* use; a paid tier converts tolerated hobby use into an express breach and weakens fair-use/hot-news defenses. Keep a generous FREE tier as a practical shield.
  > **Reddit** unauth `.json`/`.rss` is deprecated + a ToS violation (already breaking — see the Reddit OAuth fix item up top). **Logos** = trademark + separate copyright risk → prefer team names (see the disclaimer item in T4).
  > A one-time IP-attorney consult on the video features + Pro structure is worth it before real revenue. _src: 2026-06-07 ToS review (this chat); [[project_app_monetization_and_tos]]_

- [ ] **Monetizing interacts with the active NY unemployment claim — hold until the claim ends.** Donations/Pro income while certifying for UI must be reported (both the income AND the HOURS worked on the business — NY counts any service for your own business, even unpaid). The UI benefit (~$869/wk NY 2026 max) dwarfs expected donation income → don't risk the claim for coffee tips. Support links (BMC / Ko-fi / GitHub Sponsors) are SET UP but leave payouts OFF / W-9 unfilled until off UI. Use a free EIN (not SSN) on the W-9 when you do file it. Federal 1099-K threshold is back to $20k + 200 txns (OBBBA); NJ state threshold is $1k. _src: 2026-06-07; [[project_ny_unemployment_claim]], [[project_app_monetization_and_tos]]_

- [ ] **iOS bundle staleness regression watch.** Don't re-introduce hardcoded JSON fetches that froze iOS data at sync time.
  > Resolved 4/27 (commit `13da7e9`) via `getApiBase()` routing. Don't add hardcoded `/path.json` fetches in client code or iOS freezes data at cap-sync time. _src: project_hidescore_ios_bundle_staleness.md_

- [ ] **Homepage SEO: no H1, no static crawlable text.** Watch homepage search performance after the H1/intro removal; add a minimal H1 if it dips.
  > Removed the "Spoiler-free sports scores" intro 2026-05-19 (`a4f4cebc`) with the FAQ block (`a2a5440c`). Now `/` has no visible `<h1>` and no prerendered body copy — crawlers see only meta tags + JSON-LD. `/faq` and `/privacy` still carry indexable copy. Watch GSC homepage rows for 2–4 weeks; if they dip, mitigate (cheap → rich): sr-only `<h1>HideScore</h1>`, a minimal visible H1, or a one-line tagline above the cards. Sibling to the `/faq` orphan above. _src: session 2026-05-20_

---

<details>
<summary><strong>✅ Done</strong></summary>

### Shipped from this backlog

- [x] **www.hidescore.com → 525 fix** — FIXED 2026-05-13. Stale CNAME → `parkingpage.namecheap.com`; updated CNAME → `hidescore.com` (proxied) + added www to Pages custom domains via CF API. Cert in ~30s. Serves apex content; `<link rel="canonical">` handles SEO.
- [x] **Post-R2 #2: espn-top cron diagnostic** — DONE 2026-05-13 (commit `fb2d9968`). ESPN intermittently serves homepage HTML without the `headlineStack top-headlines` block. Fix: 3× retry with 1.5s gap on empty result in `fetchESPNTopHeadlines`; re-seeds module cache for the videos scraper.
- [x] **Post-R2 #3: espn-top fallback tightening** — DONE 2026-05-13 (commit `0e1f4618`). Added narrow blocklist patterns (`transfer rumors`, `daily.*playoffs|schedule|bracket`) to ARTICLE_BLOCKLIST. Skipped bare `odds`/`preview` (too broad).
- [x] **R2 staleness checker** — DONE 2026-05-13. `scripts/check-staleness.mjs` + `.github/workflows/staleness-check.yml` every 30 min, hits all 38 prebaked feeds, parses `fetchedAt`/`generatedAt`. Tiered alerts (warn = log only; critical/error = fail → GH email). Day-1 caught two real silent failures.
- [x] **Wrangler version pinning** — DONE 2026-05-13 (commit `0e1f4618`). Pinned `wrangler@^4` in all 4 GHA workflows. Mac mini install still TODO.
- [x] **Scrub Co-Authored-By trailers** — DONE 2026-05-21. Found 13 trailer'd commits (all 5/20); rewrote `928fd410..HEAD` with `git filter-branch --msg-filter`, verified empty tree diff, `push --force-with-lease`. New HEAD `0c1a017e`.

### Recently shipped (since the original 4/13 backlog)

- ✅ iOS Capacitor wrapper (sessions 71-74)
- ✅ Alt-video fallback (session 69)
- ✅ MLS/soccer coverage (session 70)
- ✅ PWA polish — manifest, service worker, shortcuts (session 69)
- ✅ Rating methodology overhaul (session 74)
- ✅ 3rd league dropdown + share link (session 76)
- ✅ Team-schedule view — clickable times, team-view column, network +N overlay (sessions 78-79, 14 commits)
- ✅ MLB Big Inning LIVE deeplink to MLB.TV selection slug — commit `4c113158` (5/8)
- ✅ Italic-clip hairline on series subtitles — commit `f0141411` (5/8)
- ✅ App Store footer compliance trim — commit `4a77d7bb` (5/9)
- ✅ ESPN top tail icons restored — commit `218b6140` (5/9)
- ✅ Monkey icon hidden on news view — commit `567a52f4` (5/11)
- ✅ "TBD" rendering for If-Necessary playoff games — commit `59181b56` (5/13)
- ✅ R2 migration Step 2: cron decoupled from deploys — commit `2d61b000` (5/13)
- ✅ App Store resubmit: demo mode + sanitized metadata + screenshots — commits `94dc7a48`, `f44d335c`, `aa561dc2` (5/13)

</details>

## 2026-07-14 — Highlight sources: Telemundo fix + tennis/golf junk gate + infra audit

**Shipped to prod (`~/nospoilerscores` → main → GHA/CF Pages), all live-verified:**
- **Telemundo now works on non-baked games** — deployed client was querying Telemundo in ENGLISH ("highlights World Cup") → 0 results; now Spanish ("resumen Copa Mundial" + Spanish team names). Was why most past WC games showed no TEL / only baked ones did.
- **2nd Telemundo link (TEL 30m extended)** now live-resolves (was baked-only). Shows when Telemundo posts a distinct "Resumen Extendido" (not every game — QFs only had the short). Fixed a wrong-game bug where the extended could grab a different match's clip.
- **Tennis/golf reupload junk fixed** ("Sadak Chaps" for Wimbledon): new `strict=1` gate oembed-verifies the uploader == official channel or 404s. Corrected silently-broken channel names: Australian Open (not "…TV"), United States Golf Association (USGA), The R&A (not "The Open"), PGA Championships. Golf chains: dropped dead PGA TOUR + ESPN where it has no rights (US Open/The Open).
- **Infra audit** — negative-cache I'd added was over-fixing a synthetic rate-limit (real load = ~20 calls/page, 0 fails) → REVERTED. Kept the one real win: WC bake window widened 2→16 days (backfilled baked WC 11→28).
- NBA/WNBA/NFL 2nd-length buttons = not worth it (paywalled). Audit page: `~/nospoilerscores-highlight-audit.html`.
- Deploy gotcha reconfirmed: hourly auto-improve bot churns the repo — always `rebase origin/main` before `push HEAD:main`.

## 2026-07-16 — QA: Argentina–England Telemundo matchup guard

- ✅ **Live fix verified (`fa98e2a0`).** Cloudflare deploy/build/smoke run `29503376843` passed; the commit changes only the `/api/youtube` team-query matcher in `public/_worker.js` (`highlights` → `highlights|resumen`).
- ✅ **Real Yesterday card verified in headless Firefox.** Argentina–England renders only `FOX 15m` + `TEL 10m`; `TEL 30m` is hidden because no distinct correct extended cut exists. Clicking the Telemundo path embeds `2og-PLyCUrs` (Inglaterra–Argentina), not the old Egypt clip.
- ✅ **Nearby behavior unchanged.** Egypt–Argentina still resolves its real Telemundo extended cut (`6tveHOrsXwY`); Argentina–England FOX resolves `y-4saPWrPt0`; representative MLB `Brewers vs Pirates highlights` resolves official MLB `CXNZamytxIM`. Homepage returns 200 with the expected HideScore title.
- **QA result:** no regressions found; no product code/config changes made during QA (QA log only).

## 2026-07-17 — Highlights strict-MLB fix + player/news UX pass (5 commits, all LIVE)

**Repo `~/nospoilerscores`, branch `feat/prebake-highlights` → `git push origin feat/prebake-highlights:main` → GHA/CF deploy. All 5 commits verified deployed (gh run success). Jacob confirmed the final one "works".**

- **`25018da4` — MLB 10m = strictly the date-exact MLB.com condensed (dropped the wrong-game YouTube fallback).** `src/components/GameHighlights.tsx`: removed `showMlbYouTubeCondensed`; now `showMlbCondensed = isMlb && !!mlbCondensedPlayback` and the 10m onClick plays ONLY `mlbCondensedPlayback` in the modal (`onPlayEmbed`, else `openExternal`). **Why:** the old YouTube "TeamA vs TeamB + date" resolver landed a *different game* of a multi-game series ("days don't align"). MLB.com condensed slug + HLS path both carry the date (`condensed-game-nym-phi-7-16-26`, `…/2026-07/16/…`) → unambiguous. Tradeoff Jacob accepted: if MLB.com hasn't posted a clip yet, show NO button rather than a wrong one. **Gotcha:** "today only shows 10m" is EXPECTED — MLB posts the 10m condensed *before* the 3m recap (recap lag); 7/16 Mets@Phillies had recap=None, condensed present.
- **`440dec29` — (a) non-blocking autoplay hint + (b) blur news tiles by default.** (a) `VideoModal.tsx` `autoplayPrompt`: was a full-screen `rgba(0,0,0,.88)` cover with `stopPropagation` (blocked the tap) → now `pointer-events-none` translucent play button + hint pill; tap anywhere falls through to the click-catcher → plays; the `"playing"` event clears `autoplayBlocked`. (b) `HomeContent.tsx`: blur is now default-ON — 3 `blur-news-media` toggles flipped `revealNewsMedia === false` → `!== true`, Media chip `active`/onClick flipped to reveal-only-when-`=== true`; added a **pre-paint inline script in `src/app/layout.tsx`** that adds `blur-news-media` from `nss-preferences` unless `revealNewsMedia===true` (kills the one-frame unblurred spoiler flash on cold load).
- **`77ce692a` — News: Reddit-first + de-blue pill + ×-to-remove-column.** `src/lib/news.ts`: `leagueSourceCascade` and `GENERIC_CASCADE` reordered **Reddit first** (above the highlight video + ESPN). **Side effect (intended):** `stripActive` requires every column's first source `variant==="video"`, so Reddit-first auto-disables the `AlignedVideoStrip` → columns become clean stacked lists (Reddit → video card → ESPN). `HomeContent.tsx`: Cards/Feed toggle active state `var(--accent)`→`var(--bg-card-hover)` + text `white`→`var(--text)` (no more blue pill). **Remove-column ×:** new `removable` prop on `NewsColumn`→`NewsColumnTitle` (subtle × on the title, calls existing `onSwapLeague("empty")`); passed `removable={renderedEntries.length > 1}` in BOTH title paths — the strip-title map (~line 2476) AND the NewsColumn render (~line 2533) — since the default multi-col layout renders titles in the strip.
- **`353442cf` — VideoModal Safari layout fix (the "doesn't fit / x misaligned / controls spread" bug).** `VideoModal.tsx` ytMode wrapper: non-fs `style` was `undefined` (shrink-to-fit flex item) → Safari sized it to the FULL viewport, so the × row (`min(100%,…)`) came out narrower than the centered video and controls sprayed edge-to-edge + overflow. Fix: pin it `{ width: ytFrameWidth, marginLeft:"auto", marginRight:"auto" }` → ×, frame, controls are one centered height-capped column. **Diagnosis method (reusable):** headless Playwright repro proved it's Chromium-perfect / Safari-only — `node` + `require('~/scripts/play-console/node_modules/playwright-core')`, chromium at `~/Library/Caches/ms-playwright/chromium-1208/…`, load **`https://hidescore.com/?v=<youtubeId>`** (the `?v=` deep-link opens the video modal directly — content-independent layout test). Script: scratchpad `modal-repro.js`. **WebKit NOT installable via `playwright-core`** (no browser downloader) — couldn't eyeball Safari locally; Jacob verified (works).

**Verified during session:** `/api/mlb-videos?date=2026-07-09` returns full recap+condensed for all 13 games; `matchMlbVideoEntry` (espn.ts ~2815, team displayName endsWith + closest kickoff) resolves them — so "no highlights on 7/9 games" was a stale client, not missing data / not the strict-MLB change.

**Needs-Jacob / deferred:**
- **Native YouTube player as default** — deferred ("keep what we have for now; revisit when we're sure"). Would expose the video *title* (spoiler). Flip point: `youtubeNativeControls={prefs.youtubeNativeControls ?? false}` in `HomeContent.tsx` (~3278) → `?? true`. Pair with making the YT title/link clickable in our player.
- **Aligned video strip below Reddit** — offered as a follow-up (currently Reddit-first removes the strip → stacked cards). Only do if Jacob wants the aligned video row back, under Reddit.
- **×-to-remove-column is NEWS view only** — the scores board (`LeagueColumn`) could get the same × if wanted.

## 2026-07-18 — UFC card size finally = MLB card size (signal, not threshold) — LIVE `557b158d`

**Repo `~/nospoilerscores` → `push feat/prebake-highlights:main` → GHA/CF run `29643174987` ✅ → verified on live hidescore.com by measuring computed font sizes at 360/390/430/470/520/640/900px, 2-col AND 3-col boards.**

- **Root cause of "still bigger":** the prior fix flipped UFC names at a fixed 155px column width, but MLB's abbreviate↔full flip point moves with the day's longest team nickname (`checkIfFullNamesFit` probe). Reproduced live pre-fix: 520px viewport → 157px columns → MLB "TB" 12px vs UFC 14px.
- **Fix (`557b158d`, 3 files):** every game `LeagueColumn` reports its live `useAbbreviations` up to `HomeContent` (`onAbbrevReport`, keyed by slot; null for no-name columns) → folded into `namesCompact` → `EventCard` fighter names flip 12↔14px in the same render as the team names beside them. Compact names use MLB's exact abbrev classes (`text-xs sm:text-sm`); width fallback survives only for UFC-only boards.
- **Also fixed the "smaller screens" weirdness (recent-change regression, yes):** this week's UFC restyle left a 155–210px column window where the CO-MAIN pill overlapped the time and weight classes truncated to fragments ("Ligh…", "W S…"). Meta row now uses the game cards' `game-meta-row text-xs` font (10px on tight boards via existing CSS) and drops broadcast+weight below 210px (measured collision width).
- **Parallel session same morning:** pushed `c1d5f9ed` (r/ufc news column) + `e474bb91` (F1 re-enable); my push fast-forwarded cleanly between them; `origin/feat/prebake-highlights` ref synced after.
- **Open:** Playwright visual suite = 3 PRE-EXISTING failures (home/today/worldcup, stale snapshots vs live slate — fail identically without this change) → refresh baselines some session. Jacob's screenshot `5.33.25 AM` never existed on disk — re-drop if it showed something else.

### 2026-07-18 later — round 2 from Jacob's screenshots: channel restored + height parity — LIVE

- **"Missing channel"**: the 210px metaCompact cutoff hid "Paramount+" where MLB always shows its network → replaced with MLB's exact meta-row recipe (`flex-wrap`, `gap-x-1`, broadcast always rendered `ml-auto`); too-narrow columns **wrap** the channel to a right-pinned second line ("wrap, don't clip", the game cards' 6/9 rule). Pill slot `flex-auto` w/o `min-w-0` = wraps as a unit, can never overlap the time. `metaCompact` now gates only the weight class.
- **"Columns don't align"**: measured live DOM — MLB team rows are 24px line-boxes at every width; fighter rows collapsed to the 16px mobile flag → every UFC card 16px short, columns drifted. Fix `min-h-6` on FighterRow. Live-verified: 225px cols MLB 102 = UFC 102; 143px non-pill UFC 90 = MLB 90; only Main/Co-Main wrap (~107) on narrow phones.
- **⚠️ Parallel-session note**: the other repo session (F1 parity work) swept these uncommitted EventCard edits into its commits `b52ab69b`/`a4fdde8a` and pushed; deploys `29646323615`/`29646518479` green; final result verified on hidescore.com. `APP_STORE_SUBMISSION.md` still modified/uncommitted (theirs).
- **Offered, awaiting Jacob**: last-names-only fighter names on compact columns (full names still truncate "Dricus Du Ple…" — no abbreviations exist for fighters).

## 2026-07-28 — News picture posts fixed (galleries + 140px thumbnails) — LIVE `5969c0d7`, then deps `6220ab55`

**Trigger:** Jacob — "a lot of the picture posts in hidescore news don't show properly, especially if more than 1 picture posted" + a screenshot of a tiny blurry golf photo in the lightbox.

**Two real bugs, both in the redlib listing path (`scripts/prebake-news.mjs` → `parseRedlibListing`):**
- **Gallery posts** — redlib's listing shows a multi-image post as *only* a 140×140 square-crop thumb + a `<span>gallery</span>` marker. We baked that as the picture. Now the post page is fetched, every image pulled at full res into a new `images[]` field, cached by post id in `public/news/_gallery-cache.json` (one extra fetch per gallery post, ever; 6/sub/bake cap, 800ms spacing).
- **The screenshot** (Lucas Glover, r/sports) — an external-LINK post whose only image is a 140×78 preview crop. Reddit has no bigger version (the size is inside the `s=` signature; the post page has no preview). Now flagged `thumbOnly` → opens as a text card with the crop at its true size instead of an upscaled smear.

**Found + fixed along the way:**
- Every reddit picture was being served from **redlib-media.perennialte.ch** (a volunteer proxy) because absolute URLs skipped the CDN rewrite. Now always Reddit's own CDN.
- ⭐ **safereddit served a challenge page to our Safari UA** → the mirror that's up most often counted as "down" for every fetch, collapsing the fallback chain onto the rate-limited reddit.com RSS. Mirror fetches now retry bare-UA. Plausibly a past feed-staleness cause too.
- Images now go through weserv width-capped (gallery frames arrive at 4000px+/3.5MB each).

**Client:** `VideoModal` gallery paging in place — chevrons/swipe/←→ walk the pictures, then continue to the next post at the ends; `1 / N` counter + dots; NewsFeed shows the cover with a `1 / N` badge.

**Deploys:** GHA `30364051682` ✅ (pics) and `30365635814` ✅ (deps), both smoke-tested; gallery UI confirmed in the live bundle. Pushed 4 feeds straight to R2 so it was visible immediately instead of waiting on the mini's hourly bake.

**Deps side-quest:** 48 Dependabot alerts → **4**. next 16.2.1 → 16.2.12 + `npm audit fix`. Worth knowing: the scary ones were all *server-side* Next advisories and this app is `output:"export"` on Cloudflare Pages — no Next server runs in prod. Residual 3 (postcss, sharp) are pinned inside next itself; the only fix npm offers downgrades next, so leave them.

**Needs-Jacob / open:**
- Eyeball it in Safari (Cmd+Opt+R) and relaunch the iOS app to pick up the new bundle.
- Gallery resolution depends on safereddit's post pages; when every mirror refuses, the post silently falls back to thumbnail-only (no error, just no gallery). If galleries look sparse later, that's why.

### 🏈 In-app NFL highlight playback is closed — don't reopen it (measured 2026-08-10)

⛔ **Do not re-attempt "route NFL to team-club YouTube channels."** This has now been picked up three times. It is dead, and here is the measurement so a fourth attempt isn't needed:

- **Clubs do carry the games.** 9 of 16 Week 15 games resolved a correct-week club package with a clean, non-spoiler title. The reason it looked dead in earlier passes is the *date-keyed* query: 10 of 12 club lookups missed on date and resolved on week. So "clubs don't post highlights" was a query bug, not a fact.
- **But club game footage is embed-blocked too — error 150, same as the league's.** Verified on Giants, Bears, Ravens, and Chargers highlight uploads. In the same session a DAZN Boxing control played fine, and so did two Bears *press conferences*. The block follows **game footage league-wide**, not the channel.
- This also corrects the earlier "Bears and Chiefs embed fine" note — those were **social uploads**, not game highlights.
- **Therefore slot 2 → clubs buys nothing:** it swaps one hand-off-to-YouTube button for another, and adds a live scrape on every finished NFL card. The wiring was written, measured, and reverted deliberately.
- **What was kept:** `src/lib/nflTeamChannels.ts` (32 verified channel names) + `npm run nflchannels:check`. Useful the day the league re-enables embeds, and useful for non-footage clips.

⚠️ **The channel list is trap-laden — 8 of the obvious handles are wrong.** Six are empty squatted channels (`@clevelandbrowns`, `@denverbroncos`, `@greenbaypackers`, `@indianapoliscolts`, `@minnesotavikings`, `@NewEnglandPatriots`); `@Cardinals` is the **MLB** Cardinals; `@Lions` is a **Japanese baseball team**. The checker verifies by **RSS, not search** — a search-based check flagged 9 *correct* names as dead, so don't "simplify" it back to search.

**Unblocks only if:** the NFL re-enables embedding on league or club game footage. Nothing on our side can route around it.
### 🔒 Stale bundled iOS privacy page (deferred 2026-08-10)

⬜ **~30 min, not urgent — Jacob deprioritized it 2026-08-10.** The privacy policy bundled into the HideScore iOS app is out of date relative to the live web one (found in the 2026-08-04 privacy audit; the three false privacy claims on the *web* side were fixed and deployed, the *bundled* copy was not).

- Fix = update the bundled HTML + ship it in the next build. No urgency of its own; fold it into whatever the next HideScore iOS release is so it doesn't cost a build by itself.
- Detail: `privacy-audit-2026-08-04.html`.

## 2026-08-12 — NFL path verified clean; rugby/LLWS channels probed and decided; two frozen data feeds deleted

**NFL (checked before September, nothing to fix).** `check-nfl-weeks.mjs` 13/13 ok,
`check-nfl-team-channels.mjs` **32/32 clubs match their channel's own feed**, and
`check-season-windows.mjs` verifies **NFL `09-07→02-16` (kickoff 09-09)** and
**NFL Preseason `07-21→09-03`** against ESPN's published fixtures. 5 leagues read
"unverifiable" (NCAAM, NBA, NHL, UCL, MLS) only because ESPN has not published their
finals yet — recheck later, nothing is wrong.

**`OFFICIAL_CHANNELS` for the six sports added 8/11 — all six shipped with NO entry,
so all six were falling through to the unscoped search.** Probed each against **five
real completed fixtures** through the live worker with `strict=1`, then read every hit
back through oembed to confirm the uploader.

⚠️ **The probe query must be BARE** — `A vs B highlights M/D/YYYY`, no competition
token, because `COMPETITION_NAMES` carries `fifa` only. Appending one gives false
negatives: World Rugby read **0/3 with "Rugby World Cup" appended and 5/5 without it**.

| key | verdict | channel | strict score |
|---|---|---|---|
| `rugbywc` | ✅ added | `World Rugby` | **5/5** |
| `sixnations` | ✅ added | `Guinness Men's Six Nations` | **4/5** |
| `superrugby` | ✅ added | `Super Rugby Pacific` | **3/5** |
| `llws` | ⛔ dark | — | 0/2 official |
| `rugbychamp` | ⛔ dark | — | 0/5 on three candidates |
| `rugbytest` | ⛔ dark | — | best 2/5, wrong-match risk |

- **Six Nations is sponsor- AND gender-qualified.** "Six Nations Rugby" and "Guinness
  Six Nations" both **0/3**; only the full `Guinness Men's Six Nations` resolves.
  Re-check when the title sponsor changes — it is in the channel name.
- **⛔ LLWS was serving a channel called "Matt H."** A fan aggregator won the unscoped
  search for **both** live 2026 fixtures. Little League's own channel and "ESPN" are
  **0/2** on strict — ESPN holds the broadcast and posts no per-game cut. This was live
  and wrong during the tournament, which is running now through Aug 30.
- **⛔ Champions Cup has no competition-level uploader.** 0/5 on "Investec Champions
  Cup", "EPCR Rugby" and "Champions Cup"; the unscoped winner was **"Glasgow Warriors"**,
  one of the two clubs in that match, and four of five fixtures returned nothing.
- **⛔ November tests have no owner.** Best was "Quilter Nations Series" at 2/5 (England
  home tests only) — and that is a **title sponsor that rebrands every cycle**, the same
  hazard as "Ligue 1 McDonald's". "World Rugby" scored 1/5 and its hit on the first probe
  was a **wrong match** — a 2025 *Women's* Rugby World Cup game served for a men's test.
  Unscoped winners were "Rugby Mzansi" and "Match Videos", both fan channels.

**🧬 The checker's mirror had drifted.** `scripts/check-highlight-fallbacks.mjs` keeps a
copy of `OFFICIAL_CHANNELS`; `mlb` was **missing entirely** and `fifa` read `"FIFA"` while
the app has sent `"FOX Sports"` since the World Cup work. A drifted mirror means green
there proved nothing for those two leagues. Synced, plus the three new rugby keys and
their buffer/period entries.

**🗑️ Deleted `public/espn-airings.json` + `public/prime-asins.json`.** Both are served
from R2 (`R2_ROOT_PATHS` in `_worker.js`) and the repo copies were frozen at **May 13**,
sitting underneath as the documented fall-through on an R2 miss. `prime-asins` keys on a
**dateless matchup string** (`"kc current vs. dash"`), so that fallback would hand today's
game a three-month-old Prime link — a real wrong-answer path, not just clutter. Both now
in `.gitignore`. On a miss the client gets a 404 → empty map → the deep link simply is not
upgraded. **`big-inning-schedule.json` deliberately kept**: CI reads it as a merge base and
it is date-keyed, so a stale entry can never collide with today.

Typecheck clean, `npm run build` clean. **Committed `190fa9a3`, NOT pushed** — pushing to
`main` deploys. LLWS is live through Aug 30, so the fan-channel fix is the one with a
closing window.

## 2026-08-12 — QA pass: everything claimed on Aug 11 is genuinely live; one shipped Android release had no source commit

Verified, not taken on trust. **28/28 feeds fresh, all four Aug-11 deploys green, live site 200.**

- ✅ **hidescore.com 200** (61 KB). The four Aug-11 GHA deploys all `success`
  (`31550173188`, `31554539339`, `31555172596`, `31555686778`, ~1m each, last at 02:04 UTC Aug 12).
  Local repo is **0 ahead / 0 behind `origin/main`**.
- ✅ **Rugby + Little League really shipped.** `llws`, `sixnations`, `superrugby` all present in the
  deployed bundle `/_next/static/chunks/30z7jgng0sidd.js`. Absent from the homepage HTML, which is
  correct — all six are `excludeFromAuto` and only appear once selected in Settings.
- ✅ **The ESPN host move held.** Zero live `site.api.espn.com` calls remain under `src/` — the three
  hits there are comments. The 13 browser-side calls are all `site.web.api.espn.com`. Every remaining
  `site.api` reference is in `scripts/` (Node-side), which is where it belongs.
- ✅ **The airings scrape genuinely runs on the mini.** `com.hidescore.espn-airings` loaded,
  `StartInterval 7200`, wrapper `~/bin/hidescore-espn-airings-cron.sh`, stderr log **empty**. Last run
  11:44 EDT: read 30 games across 5 sports, found no ESPN broadcasts, refreshed the timestamp, and
  uploaded to R2. `hidescore.com/espn-airings.json` serves a `generatedAt` 1.8h old. The freshness guard
  (refuse to upload anything >30 min old) is present and working — this is the exact failure that let
  the old GHA job sit 2,173h stale while reporting green.
- ✅ **`check-staleness.mjs`: all 28 feeds fresh** — 11 reddit, 8 theScore, 3 BBC, Guardian, FIFA/MLS
  video, airings, prime-asins, big-inning. Nothing even in warn.
- ✅ **play-test-monitor healthy after its Aug 11 rebuild.** 15/15 testers on all four apps, day 5 of 16,
  `consecutiveFailures: 0`, last success 09:06 today. The pre-rebuild failure streak ends in the log at
  `FAIL 16` on Aug 11 and does not recur.
- ❌→✅ **FIXED: the Android `5 (1.0.3)` release live on Play was built from uncommitted files.**
  `capacitor.config.ts` (`errorPath`), `android/app/build.gradle` (versionCode 2→5, 1.0.1→1.0.3),
  and the untracked `public/offline.html` + `scripts/trim-android-assets.sh` were all still working-tree
  only, 30 hours after that build went live to testers. The auto-improve bot checks branches out **in
  this working dir**, and the mini's reddit cron hard-resets its copy to `origin/main` every 30 min —
  one such reset would have silently reverted the version bump and the errorPath, and the next release
  would have rebuilt from `versionCode 2` against version codes Play has already burned.
  **Committed locally as `b07d81cb` on `fix/video-tap-play` (not pushed — pushing to `main` deploys).**
- ⚠️ **`public/espn-airings.json` in git is the May 13 file**, shadowed at runtime by the R2 copy the
  browser actually fetches via `getApiBase()`. Harmless today, but it is the file anyone reads when
  debugging, and it is what a native offline bundle would carry. Worth deleting or refreshing.
- ⚠️ **HideScore's Play "sign in details" declaration still says nothing is restricted.** It gained
  sign-in Aug 6 and was not flagged the way Roosevelt Island was, so it submitted on a probably-false
  answer. Fix before the production-access application, not after.

## 2026-08-11 — New sports Jacob approved: rugby + Little League are cheap, WWE + horse racing are not

✅ **SHIPPED the same day — Little League and five rugby competitions are live.**
Six new `Sport` keys (`llws`, `sixnations`, `rugbywc`, `rugbychamp`, `superrugby`,
`rugbytest`), config only, no new parser. What the build taught us on top of the
probe below:

- **Rugby needs one Sport key per competition, not one `rugby` key.** ESPN keys
  rugby by league id and `LeagueConfig` has no per-config path override — the
  four golf majors can share `/golf/pga` but the rugby competitions cannot share
  anything. This is the soccer pattern (16 keys), not the golf pattern.
- ⚠️ **A rugby match page 503s without its `/league/<id>` suffix**, so
  `espnGameUrl` carries the id per competition rather than using one shared path.
- ⚠️ **The LLWS has NO per-game page on espn.com.** `/llws/`, `/llb/`,
  `/baseball/llb/`, `/little-league-world-series/game/_/gameId/` and
  `/mlb/game/_/gameId/` all 404 against a real event id, and llb events carry no
  `links` array at all, so there is no `recapUrl` either. It lands on the section
  index `https://www.espn.com/little-league-world-series/` (200) — the same
  compromise golf and tennis already make. Don't re-probe this.
- **No league logo exists for either.** `teamlogos/leagues/500/llb.png` 404s and
  there is no `leaguelogos/rugby/` set at all; both fall back to the redesign
  sport icons, which is exactly what ESPN's own scoreboards serve.
- **All six are `excludeFromAuto`** — they are selectable in Settings but never
  claim a column on their own. Consequence, by design: **no kickoff banner**,
  since the banner deliberately skips opt-in leagues.
- **No `OFFICIAL_CHANNELS` entries were added.** A wrong channel string fails
  silently and the monitor agrees with it (the Liga MX / "TUDN México" bug), so
  highlights fall back to the loose spoiler-filtered search until someone
  verifies real channels end-to-end. That is the honest state, not an oversight.
- **French Top 14 (270559) deliberately not shipped** — real and verified, but a
  10-month domestic window for the smallest US audience of the six.
- Windows come from each league's own ESPN calendar: LLWS `08-10→08-30`,
  Six Nations `02-05→03-14`, RWC `10-01→11-13` (`yearCycle` mod 4 anchor 2027),
  Champions Cup `12-05→05-23`, Super Rugby `02-13→06-20`, Tests `04-03→11-13`.
  `check-season-windows.mjs` verifies Little League ✓; the rugby windows read
  "unverifiable" because ESPN has not published next season yet.

Still open from this section: **WWE, horse racing, and the Olympics** (the last
one has 2027/2028 calendar events holding the decision).

Jacob approved adding **WWE, horse racing and rugby**, and asked to revisit the
**Olympics conditionally in 2027** with "the popup that EPL got". Endpoints probed
live against `site.api.espn.com` on 2026-08-11 — the answer splits cleanly in two.

**✅ Buildable from the existing data layer (a config entry, not a parser):**
- **Rugby** — `/sports/rugby/<leagueId>/scoreboard` returns the STANDARD ESPN
  scoreboard shape (`competitions[].competitors[]` with `homeAway`/`score`,
  `status.type.state`, venue, `highlights`), so `parseGame` handles it as-is.
  Verified ids: **Six Nations 180659** (3 events), **French Top 14 270559** (6),
  **European Champions Cup 271937**, **Rugby World Cup 164205**, **Super Rugby
  Pacific 242041**, **International Test Match 289234**. ⚠️ There is no
  `/sports/rugby/scoreboard` — 404. The league id is mandatory.
- **Little League World Series** — `/sports/baseball/llb/scoreboard` works and
  returned **48 events for August 2026**; it is running RIGHT NOW and is
  genuinely spoiler-sensitive. This is the best immediate add of the five.

**⛔ Not buildable from ESPN — needs a different source, so price them separately:**
- **WWE** — no endpoint. `wwe/scoreboard` 404s, `mma/wwe/scoreboard` 400s. ESPN
  lists WWE on its menu but exposes no fixtures/results feed.
- **Horse racing** — no endpoint. `horse-racing/scoreboard`, `racing/scoreboard`
  and `racing/horse/scoreboard` all 404/400. Only three days a year matter
  (Derby/Preakness/Belmont), which argues for a curated JSON like `lib/boxing.ts`
  and `lib/poker.ts` already use, rather than a live feed.
- **Olympics** — no endpoint at `olympics/scoreboard`, `olympics/summer/…` or
  `olympics-summer/…`. Next Summer Games is **LA, Jul 2028**; Milan-Cortina
  (Feb 2026) has already been and gone.

**Where they sit in the four Settings groups** (see `SPORT_GROUP` in `espn.ts`):
rugby, WWE, horse racing and the Olympics all land in **"Racing, combat & more"** —
that group's "& more" is exactly the catch-all for a sport that is not a US
league, not soccer, and not a golf/tennis major. **Little League goes in "US
leagues"**, next to MLB, because that is where someone scanning for baseball
looks. No fifth group is needed for any of them.

**The "EPL popup" already exists and is already generic** — nothing to plan.
`getLeagueKickoff` (espn.ts) scans ALL_LEAGUES on every render, takes any league
within **KICKOFF_SOON_DAYS = 14** of its `kickoffDate`, sorts nearest-first and
hands one to the banner above the board; `kickoffMessage` in HomeContent writes
the line. It is per-season dismissible (`seasonKey` is keyed to the exact kickoff
DAY, so next year's banner still fires). **NBA already qualifies** — `kickoffDate:
"10-20"`, not `excludeFromAuto` — so the NBA season opening gets this banner today
with no work. ⚠️ The one catch for a future Olympics/WWE config: the banner
deliberately skips `excludeFromAuto` leagues (mid-August alone opens four soccer
leagues, and announcing an unrequested league above the board reads as an ad), so
a two-week event that wants the banner must also accept being auto-pick eligible.
`yearCycle: { mod: 4, anchor: 2028 }` already exists for quadrennial events (Euro
uses it), so the config shape is not the blocker — the missing feed is.

**Recommended order:** Little League now (it is live and the endpoint works) →
rugby (Six Nations opens February) → horse racing as curated JSON before the
2027 Derby → Olympics revisited in 2027 as Jacob suggested → WWE last, and only
if a results source turns up.
