# HideScore — Master Backlog

Compiled 2026-05-13 from a full scrub of project memory + session notes + git history. Check items off as you ship them. Source memory file is cited so the implementation plan can be re-loaded.

Tier key:
- **T1** = time-sensitive (this week)
- **T2** = deferred with plan ready
- **T3** = older backlog, still open
- **T4** = polish / low priority
- **T5** = strategic reminder (not action, just don't forget)

---

## T1 — Time-sensitive

- [ ] **Reddit post on /r/hockey or /r/nba** — promo during playoff window (NBA Finals ~6/5, Stanley Cup ~6/4). Direct link to hidescore.com, not App Store. **Drafted 2026-05-13 — see REDDIT_DRAFT.md, awaiting title/body pick.** _src: session_hidescore_resubmit_2026_05_13.md_
- [ ] **Apple verdict watch** — resubmitted 5/13, typical 24-48h. Passive. _src: session_hidescore_resubmit_2026_05_13.md_
- [ ] **iOS app rebuild + TestFlight upload** — web has ~3 commits ahead of iOS bundle (Starts 5/3 fix, layout overhaul, playoff lookahead). `npx cap sync ios` → Xcode archive → TestFlight. _src: project_hidescore_ios_rebuild_2026_05_04.md_
- [x] **www.hidescore.com → 525 fix** — ✅ FIXED 2026-05-13. Root cause: stale CNAME → `parkingpage.namecheap.com` (Namecheap default). Updated CNAME → `hidescore.com` (proxied) + added www to nospoilerscores Pages custom domains via CF API. Cert provisioned in ~30s. Now serves apex content (no canonical redirect — `<link rel="canonical">` handles SEO). Upgrade to 301 later via CF dashboard if needed.
- [ ] **GSC validation clicks** — 3 rows safe to click Validate (5xx, 404, redirect). Skip "Crawled-not-indexed". No code, ~2 min. _src: session_hidescore_gsc_2026_04_27.md_

## T2 — Deferred with plan ready

- [ ] **Bracket modal: figure out spoiler-safe view** — bracket-modal feature is built on `bracket-modal` branch (preview at `https://bracket-modal.nospoilerscores.pages.dev`) but the bracket itself reveals series scores (`COL 4 LAK 0` etc.), which is exactly what HideScore exists to hide. Decide where/how to surface it — gate behind monkey-see toggle? Move to News view only? Strip scores and show empty bracket + matchups only? NHL image looks good visually (`#root` crop) and NBA Wikipedia clip works too; gating is the question, not rendering. Branch has working scrapers + `BracketTrigger`/`BracketFullModal` components in `src/components/BracketModal.tsx`. **Do not merge to main until decided.**
- [ ] **VideoModal spoiler reveal overlay (autoplay-aware)** — MLB's official YouTube channel bakes the result into highlight thumbnails ("Complete Game Shutout!"). When a user clicks "Watch highlight" from a GameCard, the YouTube poster flashes the result before playback starts. Initial fix (commit `5131079f`, reverted in `f498eaf5`) shipped a Tap-to-reveal overlay unconditionally when monkey was off — but that adds friction for users whose browsers DO autoplay (the video starts immediately, no spoiler visible). **Refined plan:** detect autoplay availability and only show the reveal overlay when autoplay was BLOCKED. For HLS `<video>`: `videoRef.play()` returns a Promise — `.catch()` ⇒ autoplay denied ⇒ show overlay. For YouTube iframe: load with `autoplay=1`, listen for onStateChange — if state stays at -1/5 after ~500ms, autoplay denied. Hide rendered headline whenever overlay is active. Default monkey-on path stays unchanged. Reverted code lives in commit `5131079f` as starting reference.
- [ ] **MLB player option 1** — force hls.js on Safari + disable subtitle tracks → Reddit-style clean controls. Touch `VideoModal.tsx:133` (skip native HLS branch), remove CC button at `:332-342`. _src: project_hidescore_mlb_player_consistency.md_
- [ ] **FastCast pin** — pin Real Fast + FastCast to slots 1+2 of mlb-videos strip. New `fetchMLBPinnedRoundups()` in `scripts/prebake-news.mjs`, prepend before `items.length >= 10` cap. _src: project_hidescore_mlb_fastcast_pin.md_
- [ ] **Post-R2 #1: NBC.com scraper** — deep-link NBC broadcast chips to `nbc.com/watch/...` URLs. New `scripts/scrape-nbc-sports.mjs` mirroring prime-asins pattern. Edit `espn.ts:671`. _src: project_hidescore_post_r2_followups.md_
- [x] **Post-R2 #2: espn-top cron diagnostic** — ✅ DONE 2026-05-13 commit `fb2d9968`. Root cause: ESPN intermittently serves homepage HTML *without* the `headlineStack top-headlines` block. Same Mac mini residential IP, 5 min apart, opposite results. Mac mini cron's been losing the lottery most of the day. Fix: 3x retry with 1.5s gap on empty result in `fetchESPNTopHeadlines`. Successful HTML re-seeds module cache for the videos scraper too. Worst case: 4 fetches/~5s instead of 1.
- [x] **Post-R2 #3: espn-top fallback tightening** — ✅ DONE 2026-05-13 commit `0e1f4618`. Cap-at-9 was already obsolete (broken `now.core.api.espn.com` fallback was removed earlier). Added narrow blocklist patterns (`transfer rumors`, `daily.*playoffs|schedule|bracket`) to global ARTICLE_BLOCKLIST. Skipped bare `odds` + `preview` — too broad, false-positives on legit game previews.
- [x] **R2 staleness checker** — ✅ DONE 2026-05-13. New `scripts/check-staleness.mjs` + `.github/workflows/staleness-check.yml` runs every 30min, hits all 38 prebaked feeds at `hidescore.com` (worker → R2 path), parses `fetchedAt`/`generatedAt`. **Tiered alerts:** warnings (past per-feed `warnH`) logged only — workflow stays green, no email; critical (past 4× `warnH`) or fetch error fails workflow → GH emails repo owner. Thresholds: news/espn-airings warn=6h crit=24h; prime-asins warn=18h crit=72h; big-inning warn=36h crit=144h. **Day-1 caught two real silent-failure modes:** Mac mini stuck uploading 25.8h-stale files (self-recovered); espn-videos 28h stale due to ESPN WAF challenging GHA IPs → moved to Mac mini cron + retry mirror (commit `38068ca0`).
- [ ] **Reddit OAuth completion** — code shipped 4/28 commit 37f3816, waiting on Reddit Data API approval for `Reasonable_Stick_329` app. If approved: retire Mac mini reddit cron. _src: project_hidescore_reddit_403.md_
- [ ] **Length toggle (Extended/Condensed)** — start with MLB (most distinct cadences: ~5min condensed vs ~15-20min full recap vs 1-min cuts). _src: project_hidescore_gap_closing_2026_04_13.md_
- [ ] **ESPN news integration — sort-by-views decision** — ESPN API doesn't expose. Decide: scrape engagement metrics OR editorial curation. _src: project_hidescore_backlog_2026_04_13.md_
- [ ] **ESPN news integration — default click action decision** — pick: ESPN gamecast / highlights modal / expand card / nothing. _src: project_hidescore_backlog_2026_04_13.md_
- [ ] **MLS-vs-EPL summer overlap decision** — both active May 21 → Aug 1. Which displays? _src: project_hidescore_gap_closing_2026_04_13.md_
- [ ] **Playoff bracket on subtitle hover** — when a league is in playoffs, hovering the italic `PlayoffSubtitle` under the league header pops a bracket image. Hook point: `LeagueColumn.tsx:679` (`<PlayoffSubtitle …/>`). Live-relevant now (NBA/NHL conference rounds, Stanley Cup ~6/4, NBA Finals ~6/5). **Open Qs before building:** (1) bracket source — ESPN bracket page screenshot vs generated SVG from `games[].playoffLabel` data we already parse vs hand-curated PNG per league; ESPN screenshot likely spoils scores so avoid. (2) mobile fallback — no hover; tap-to-open modal? long-press? small chevron affordance? (3) "optimally" positioning — anchored tooltip beside the subtitle vs centered modal vs slide-down panel under the league column. (4) per-league applicability — NBA/NHL bracket-style yes; MLB has bracket too; WNBA/MLS playoffs; ignore for golf (no bracket). NCAA = giant 64-team grid, treat separately.
- [ ] **Header overflow — bottom-toolbar / tab-bar redesign** — header overflows horizontally on narrow screens: it needs ~422px but phones give 360–414px → 8–62px overflow → the _whole page_ becomes pannable left/right (scores + Settings panel look mis-scaled as a side effect). Confirmed on the live site via Playwright at 360/390/414px, so it's a website bug both native apps inherit through the WebView. Root cause: the right-side icon cluster (`justify-self-end … flex-shrink-0` in `HomeContent.tsx`) can't compress. **Options:** (1) **Bottom toolbar / iOS-style tab bar** (Jacob's pick to explore) — move every icon except the date nav (share, monkey-sort, news, calendar, theme, settings) into a fixed bottom toolbar; header keeps only the H logo + ‹ Yest/Today/Tomo ›, fully clearing the overflow. Works on web + both native apps (just `position:fixed` + `env(safe-area-inset-bottom)` padding, same pattern the footer already uses); actually cleaner _inside_ the native apps than mobile Safari, where a fixed bottom bar can fight Safari's own auto-hiding toolbar. Page needs bottom padding so content/footer isn't covered. Nuance: a true iOS tab bar is for top-level nav (Scores / News / Settings) — monkey-sort + theme are toggles, not nav, so either accept a mixed bar or split (nav in the bar, toggles stay in header). (2) header wraps to two rows on narrow screens — no features cut, taller mobile header. (3) shrink icons `w-7→w-6` + tighten gaps + drop the calendar icon on mobile — stays one row, fixes down to 360px. (4) collapse secondary icons behind a `⋯` overflow menu. Don't regress the `xl:` logo / DateNav-centering breakpoint — see `feedback_hidescore_header_compact.md`. _src: session_hidescore_iphone_toolbar_overflow_2026_05_20.md_

## T3 — Older backlog, still open

- [ ] **Dodgers walk-off recap threshold** — yesterday's game ranked "good", should be higher. Investigate threshold. _src: project_hidescore_backlog_2026_04_13.md_
- [ ] **MLB time wrap on mobile** — Pit vs Chi game time wraps, others don't. _src: project_hidescore_backlog_2026_04_13.md_
- [ ] **NBA "Tomorrow" tag bubble** — favorited team not bubbling to top when tagged tomorrow. _src: project_hidescore_backlog_2026_04_13.md_
- [ ] **Multi-network click expand** — click card with multiple networks → wrap text under network row to cover team records; second click collapses. _src: project_hidescore_backlog_2026_04_13.md_
- [ ] **Calendar button won't close on 2nd click** — opens correctly but won't dismiss. _src: project_hidescore_backlog_2026_04_13.md_
- [ ] **Favorites-saved popup transparent bg** — mobile dark mode (desktop fine). _src: project_hidescore_backlog_2026_04_13.md_
- [ ] **SportsCenter YouTube fix** — currently links Jacob's saved channel, not official ESPN. _src: project_hidescore_backlog_2026_04_13.md_
- [ ] **Team subreddit links at bottom of cards** — feature not implemented. _src: project_hidescore_backlog_2026_04_13.md_
- [ ] **Live-game dates in team view use withEspn** — ESPN gamecast on a LIVE game would spoil. Guard with `isFinished`-style check. _src: session_hidescore_team_view.md_
- [ ] **NewsColumn/news.ts ownership confirm** — committed alongside team view session, was it intended? _src: session_hidescore_team_view.md_
- [ ] **Big yesterday highlights from other teams** — surface beyond top-billed. _src: project_hidescore_backlog_2026_04_13.md_
- [ ] **Season-wide highlight scrub** — top dunks, biggest highlights from official channels. _src: project_hidescore_backlog_2026_04_13.md_

## T4 — Polish / low priority

- [ ] **News toggle icon looks broken** — the header News toggle uses Lucide's `newspaper` glyph; at 14–16px the folded-corner detail collapses into what reads as a stray smudge/doubled line on the lower-left. Swap for a simpler document/feed icon (`HomeContent.tsx:815-820`). _src: session 2026-05-19_
- [ ] **Big Inning auto-tick timer** — subtitle doesn't flip "9:00 PM ET" → "LIVE" mid-session without page render. Add 60s timer in PlayoffSubtitle. _src: session104_hidescore_2026_05_08_to_13.md_
- [ ] **Clean dead code** — `next.config.ts` rewrites, commented ESPN button at `GameCard.tsx:44-55`, backup footer at `HomeContent.tsx:419-422`. _src: project_hidescore_backlog_2026_04_13.md_
- [ ] **Revisit short-column pinning** — added 5/19 (commit `ed02abca`) to pin a column's cards when it had ≤3 games; removed 5/20 (felt off in practice). Decide if/when to bring back, possibly with different criteria — e.g. pin only when _every_ column has ≤3, or trigger on viewport-height vs total-card-height instead of count. Reference impl lives in the `LeagueColumn.tsx` diff of `ed02abca` (headerStripRef + ResizeObserver + `stickyGamesStyle`). _src: session 2026-05-20_
- [ ] **Footer pinning consideration** — explore sticky-to-viewport-bottom footer (FeedbackBox + captions + App Store badge stay visible while scrolling games). Open Qs: mobile real-estate cost, iOS safe-area handling, whether to pin only on tall-content days or always. Sibling decision to short-column pinning above. _src: session 2026-05-20_
- [ ] **Live-card green accent bar** — shipped 5/20 (commit `96126cab`) as a 3px inset box-shadow `#22c55e` on the left edge of live GameCards; reverted 5/20 ("like it but don't love it anymore"). Revisit if live games need a stronger scan signal beyond the existing red LIVE pill — possibly a thinner bar, a different color tied to `--text-live`, or a subtle border-color shift instead of an inset shadow. _src: session 2026-05-20_
- [ ] **Ratings popup copy precision** — `HomeContent.tsx:529` says "reordered by top records and best matchups" but actually live/finished sort by rating, only upcoming sort by records. Suggested rewrite: "Games are also reordered by best matchups — live and finished by rating, upcoming by team records." _src: project_hidescore_backlog_2026_04_13.md_
- [x] **Wrangler version pinning** — ✅ DONE 2026-05-13 commit `0e1f4618`. Pinned `wrangler@^4` in all 4 GHA workflows. Mac mini install still TODO — needs ssh command Jacob can paste.
- [ ] **Delete stale `public/` JSON copies** — after R2 stable ~30 days (~6/13), 39 fallback files in `public/` deletable. Cosmetic. _src: project_hidescore_deploy_cap.md_
- [ ] **Playoff countdown copy** — show "Playoffs in X days"; if room remains in card width, append "(Mar 20)". _src: project_hidescore_backlog_2026_04_13.md_
- [ ] **Playoff placeholders TBD play-in** — `season.type: 5`, show greyed-out cards. _src: project_hidescore_backlog_2026_04_13.md_
- [ ] **MLB live links QA** — shipped session 48, needs live-game QA pass. _src: project_hidescore_backlog_2026_04_13.md_
- [ ] **`/faq` and `/privacy` orphaned — no in-app link** — Footer dropped FAQ/Privacy in commit `c853502d` for the cleaner feedback-box layout (deliberate — full FAQ on homepage was too exposed). Current state: `/faq` reachable only via `sitemap.xml` (Google can find it, humans can't); `/privacy` linked from nowhere. App Store listing carries the privacy URL separately so submission is fine, but the website has zero link to either page. Revisit when there's a discreet home for them — e.g. a small "···" / "About" overlay, a settings-panel row, or one subtle footer line that doesn't clutter. _src: session 2026-05-19_
- [ ] **iOS PrivacyInfo.xcprivacy manifest** — Apple has required this file since May 2024 for new submissions. We use GoatCounter analytics (`layout.tsx:135`), so create `ios/App/App/PrivacyInfo.xcprivacy` declaring `NSPrivacyTracking` only if GoatCounter touches IDFA (it doesn't by default — confirm), `NSPrivacyTrackingDomains: ["hidescore.goatcounter.com"]`, and required-reason API entries for any Capacitor plugin that touches file timestamps / UserDefaults. Existing submissions grandfathered through, but new uploads may start hitting warnings. _src: ios audit 2026-05-20_
- [ ] **iOS App Tracking Transparency check** — paired with privacy manifest above. Verify whether GoatCounter touches IDFA. If yes, add `NSUserTrackingUsageDescription` to Info.plist and request permission. If no (likely — GoatCounter is cookieless), do nothing; an ATT prompt for non-tracking analytics is itself a review risk. _src: ios audit 2026-05-20_
- [ ] **iOS splash screen simplification** — current `LaunchScreen.storyboard` scales a 1366×1366 Splash image via `scaleAspectFill`. Apple HIG prefers near-empty launch screens (background color only, or tiny logo). Looks stretched on different devices and feels slow. Swap for plain dark background to match app theme. _src: ios audit 2026-05-20_
- [ ] **Buttons too small to interact with on mobile** — star, broadcast chip, +N network expander, highlight play buttons are below Apple's recommended 44×44pt hit target. Audit interactive elements for tap-target size on mobile. _src: session 2026-05-20_
  - **Reconsider clickable card elements** — whole-card click-to-stream (live cards w/ `cardClickable` at `GameCard.tsx:261`) competes with inner buttons that `stopPropagation`. If buttons get bigger, accidental whole-card hits rise. Decide: keep card clickable + bigger buttons, or move the stream affordance to a single dedicated chip and un-click the card body.
- [x] **Scrub Co-Authored-By trailers from recent commits** — ✅ DONE 2026-05-21. Audit found **13** trailer'd commits (all 5/20, `0c25da04`…`85bee286`), not the 7 first estimated. Rewrote `928fd410..HEAD` with `git filter-branch --msg-filter` (perl strips the `Co-Authored-By:` line + preceding blank), verified tree diff empty (file contents byte-identical) and zero remaining trailers, then `git push --force-with-lease origin main`. New HEAD `0c1a017e`. Going forward: no Co-Authored-By trailers on this repo per CLAUDE.md `## Git`.

## T5 — Strategic reminders (not action items)

- [ ] **MLB clip-embed legality** — in-app MLB modal streams MLB's HLS playlists directly. Fine for hobby site, **revisit before monetization** (App Store paid tier, ads, sponsorships, scale). Safer path: anchor-out to MLB.com. _src: project_hidescore_mlb_clip_legality.md_
- [ ] **iOS bundle staleness regression watch** — resolved 4/27 commit 13da7e9 via `getApiBase()` routing. Don't re-introduce hardcoded `/path.json` fetches in client code or iOS will freeze data at cap-sync time. _src: project_hidescore_ios_bundle_staleness.md_
- [ ] **Homepage SEO: no H1, no static crawlable text** — Removed "Spoiler-free sports scores" intro 2026-05-19 (`a4f4cebc`) alongside the FAQ block (`a2a5440c`) to clean the homepage. Result: `/` has zero visible `<h1>` and zero prerendered body copy — game data loads client-side, so crawlers see meta tags + JSON-LD only. `/faq` and `/privacy` still carry indexable copy, but homepage-query impressions/CTR may slide. Watch GSC homepage rows over the next 2–4 weeks; if they dip, mitigations (cheapest → richest): sr-only `<h1>HideScore</h1>`, minimal visible H1 ("HideScore"), or a one-line tagline above the game cards. Sibling concern to line 65 (`/faq` orphan). _src: session 2026-05-20_

---

## Recently shipped (since the original 4/13 backlog)

For reference — these were on past lists but are done.

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

---

## Stats

| Tier | Count |
|---|---|
| T1 time-sensitive | 5 |
| T2 deferred-with-plan | 12 |
| T3 backlog | 12 |
| T4 polish | 12 |
| T5 strategic | 2 |
| **Total open** | **43** |

Recently shipped (~5 weeks): 14 items.
