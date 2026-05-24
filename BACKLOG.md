# HideScore — Master Backlog

Compiled 2026-05-13 from a full scrub of project memory + session notes + git history. Check items off as you ship them.

Tier key:
- **T1** = time-sensitive (this week)
- **T2** = deferred with plan ready
- **T3** = older backlog, still open
- **T4** = polish / low priority
- **T5** = strategic reminder (not action, just don't forget)

---

## T1 — Time-sensitive

- [ ] **Reddit post on /r/hockey or /r/nba.** Promote HideScore during the playoff window — a direct link to the site, not the App Store.
  > NBA Finals ~6/5, Stanley Cup ~6/4. Drafted 2026-05-13 — see `REDDIT_DRAFT.md`, awaiting a title / body pick. src: session_hidescore_resubmit_2026_05_13.md

- [ ] **Apple verdict watch.** Watch for Apple's review verdict on the 5/13 resubmission — passive.
  > Resubmitted 5/13; typical turnaround 24–48h. src: session_hidescore_resubmit_2026_05_13.md

- [ ] **iOS app rebuild + TestFlight upload.** The web build is a few commits ahead of the shipped iOS bundle — rebuild and push to TestFlight.
  > ~3 commits ahead (Starts 5/3 fix, layout overhaul, playoff lookahead). `npx cap sync ios` → Xcode archive → TestFlight. src: project_hidescore_ios_rebuild_2026_05_04.md

- [ ] **GSC validation clicks.** Click Validate on the 3 safe Google Search Console rows.
  > 3 rows safe (5xx, 404, redirect). Skip "Crawled — not indexed". No code, ~2 min. src: session_hidescore_gsc_2026_04_27.md

## T2 — Deferred with plan ready

- [ ] **Bracket modal: figure out spoiler-safe view.** Bracket-modal feature is built on `bracket-modal` branch (preview at `https://bracket-modal.nospoilerscores.pages.dev`) but the bracket itself reveals series scores (`COL 4 LAK 0` etc.) which is exactly what HideScore exists to hide. Decide where/how to surface it — gate behind the monkey-see toggle like ratings? Move to News view only? Strip scores and show empty bracket + matchups only? NHL image looks good visually; gating is the question, not rendering. Branch has working NHL (`#root` crop) + NBA (Wikipedia clip) scrapers + `BracketTrigger`/`BracketFullModal` components in `src/components/BracketModal.tsx`. Do not merge to main until decided.

- [ ] **MLB player option 1.** Give the MLB video player Reddit-style clean controls.
  > Force hls.js on Safari + disable subtitle tracks. Touch `VideoModal.tsx:133` (skip the native HLS branch), remove the CC button at `:332-342`. src: project_hidescore_mlb_player_consistency.md

- [ ] **FastCast pin.** Pin Real Fast + FastCast to the first two slots of the MLB videos strip.
  > New `fetchMLBPinnedRoundups()` in `scripts/prebake-news.mjs`, prepended before the `items.length >= 10` cap. src: project_hidescore_mlb_fastcast_pin.md

- [ ] **Post-R2 #1: NBC.com scraper.** Deep-link NBC broadcast chips to `nbc.com/watch/...` URLs.
  > New `scripts/scrape-nbc-sports.mjs` mirroring the prime-asins pattern. Edit `espn.ts:671`. src: project_hidescore_post_r2_followups.md

- [ ] **Reddit OAuth completion.** The code is shipped — finish once Reddit approves the Data API.
  > Shipped 4/28 commit `37f3816`. Waiting on Reddit Data API approval for the `Reasonable_Stick_329` app. If approved: retire the Mac mini reddit cron. src: project_hidescore_reddit_403.md

- [ ] **Length toggle (Extended / Condensed).** Add a highlight-length toggle, starting with MLB.
  > MLB has the most distinct cadences: ~5min condensed vs. ~15–20min full recap vs. 1-min cuts. src: project_hidescore_gap_closing_2026_04_13.md

- [ ] **ESPN news — sort-by-views decision.** Sorting by views isn't directly possible — decide how to approach it.
  > ESPN's API doesn't expose view counts. Decide: scrape engagement metrics, or editorial curation. src: project_hidescore_backlog_2026_04_13.md

- [ ] **ESPN news — default click action decision.** Decide what clicking an ESPN news item should do.
  > Pick one: ESPN gamecast / highlights modal / expand card / nothing. src: project_hidescore_backlog_2026_04_13.md

- [ ] **MLS-vs-EPL summer overlap decision.** Decide which competition to display while both are active.
  > Both run May 21 → Aug 1. src: project_hidescore_gap_closing_2026_04_13.md

- [ ] **Playoff bracket on subtitle hover.** When a league is in playoffs, hovering the playoff subtitle under the league header should pop up a bracket.
  > Hook point: `LeagueColumn.tsx:679` (`<PlayoffSubtitle …/>`). Live-relevant now (NBA / NHL conference rounds, Stanley Cup ~6/4, NBA Finals ~6/5). Open questions before building:
  >
  > 1. Bracket source — an ESPN bracket-page screenshot vs. a generated SVG from the `games[].playoffLabel` data we already parse vs. a hand-curated PNG per league; an ESPN screenshot likely spoils scores, so avoid it.
  > 2. Mobile fallback — there's no hover; tap-to-open modal? long-press? a small chevron affordance?
  > 3. Positioning — an anchored tooltip beside the subtitle vs. a centered modal vs. a slide-down panel under the league column.
  > 4. Per-league applicability — NBA / NHL bracket-style yes; MLB has a bracket too; WNBA / MLS playoffs; ignore golf (no bracket). NCAA is a giant 64-team grid — treat separately.

- [ ] **Header overflow — bottom-toolbar / tab-bar redesign.** The header overflows sideways on narrow phones, making the whole page pan left/right — redesign it, probably moving icons into a bottom toolbar.
  > The header needs ~422px but phones give 360–414px → 8–62px of overflow → the whole page becomes pannable left/right (scores + Settings panel look mis-scaled as a side effect). Confirmed on the live site via Playwright at 360 / 390 / 414px, so it's a website bug both native apps inherit through the WebView. Root cause: the right-side icon cluster (`justify-self-end … flex-shrink-0` in `HomeContent.tsx`) can't compress. Options:
  >
  > 1. **Bottom toolbar / iOS-style tab bar** (Jacob's pick to explore) — move every icon except the date nav (share, monkey-sort, news, calendar, theme, settings) into a fixed bottom toolbar; the header keeps only the H logo + ‹ Yest/Today/Tomo ›, fully clearing the overflow. Works on web + both native apps (`position:fixed` + `env(safe-area-inset-bottom)` padding, the pattern the footer already uses); actually cleaner inside the native apps than mobile Safari, where a fixed bottom bar can fight Safari's own auto-hiding toolbar. The page needs bottom padding so content / footer isn't covered. Nuance: a true iOS tab bar is for top-level nav (Scores / News / Settings) — monkey-sort + theme are toggles, not nav, so either accept a mixed bar or split (nav in the bar, toggles stay in the header).
  > 2. Header wraps to two rows on narrow screens — no features cut, taller mobile header.
  > 3. Shrink icons `w-7`→`w-6` + tighten gaps + drop the calendar icon on mobile — stays one row, fixes down to 360px.
  > 4. Collapse secondary icons behind a `⋯` overflow menu.
  >
  > Don't regress the `xl:` logo / DateNav-centering breakpoint — see `feedback_hidescore_header_compact.md`. src: session_hidescore_iphone_toolbar_overflow_2026_05_20.md

## T3 — Older backlog, still open

- [ ] **Dodgers walk-off recap threshold.** A Dodgers walk-off ranked "good" but should rank higher — investigate the threshold.
  > src: project_hidescore_backlog_2026_04_13.md

- [ ] **MLB time wrap on mobile.** On mobile the Pit vs. Chi game time wraps to a second line while others don't.
  > src: project_hidescore_backlog_2026_04_13.md

- [ ] **NBA "Tomorrow" tag bubble.** A favorited NBA team isn't bubbling to the top when it's tagged as playing tomorrow.
  > src: project_hidescore_backlog_2026_04_13.md

- [ ] **Multi-network click expand.** Clicking a card with multiple networks should expand text under the network row to cover team records; a second click collapses it.
  > src: project_hidescore_backlog_2026_04_13.md

- [ ] **Calendar button won't close on 2nd click.** It opens correctly but a second click won't dismiss it.
  > src: project_hidescore_backlog_2026_04_13.md

- [ ] **Favorites-saved popup transparent background.** The popup background is transparent in mobile dark mode (desktop is fine).
  > src: project_hidescore_backlog_2026_04_13.md

- [ ] **SportsCenter YouTube fix.** The SportsCenter link points at Jacob's saved channel instead of the official ESPN one.
  > src: project_hidescore_backlog_2026_04_13.md

- [ ] **Team subreddit links at bottom of cards.** Not yet implemented.
  > src: project_hidescore_backlog_2026_04_13.md

- [ ] **Live-game dates in team view use withEspn.** In team view, live games link to the ESPN gamecast — which would spoil the score. Guard it.
  > Guard with an `isFinished`-style check. src: session_hidescore_team_view.md

- [ ] **NewsColumn / news.ts ownership confirm.** Confirm whether the NewsColumn / `news.ts` changes committed during the team-view session were intended.
  > src: session_hidescore_team_view.md

- [ ] **Big yesterday highlights from other teams.** Surface big highlights from yesterday beyond just the top-billed teams.
  > src: project_hidescore_backlog_2026_04_13.md

- [ ] **Season-wide highlight scrub.** Pull season-wide highlights — top dunks, biggest plays — from official channels.
  > src: project_hidescore_backlog_2026_04_13.md

## T4 — Polish / low priority

- [ ] **News toggle icon looks broken.** At small sizes the header News toggle reads as a smudge — swap it for a simpler document / feed icon.
  > Uses Lucide's `newspaper` glyph; at 14–16px the folded-corner detail collapses into a stray smudge / doubled line on the lower-left. `HomeContent.tsx:815-820`. src: session 2026-05-19

- [ ] **Big Inning auto-tick timer.** The Big Inning subtitle doesn't flip from its start time to "LIVE" without a page render.
  > Add a 60s timer in `PlayoffSubtitle`. src: session104_hidescore_2026_05_08_to_13.md

- [ ] **Clean dead code.** Remove dead code left around the project.
  > `next.config.ts` rewrites, the commented ESPN button at `GameCard.tsx:44-55`, the backup footer at `HomeContent.tsx:419-422`. src: project_hidescore_backlog_2026_04_13.md

- [ ] **Revisit short-column pinning.** Decide whether to bring back short-column pinning — added then removed in May — perhaps with different trigger criteria.
  > Added 5/19 (commit `ed02abca`) to pin a column's cards when it had ≤3 games; removed 5/20 (felt off in practice). Possible new criteria — pin only when *every* column has ≤3, or trigger on viewport-height vs. total-card-height instead of count. Reference impl lives in the `LeagueColumn.tsx` diff of `ed02abca` (headerStripRef + ResizeObserver + `stickyGamesStyle`). src: session 2026-05-20

- [ ] **Footer pinning consideration.** Explore a footer pinned to the viewport bottom so the feedback box, captions, and App Store badge stay visible while scrolling.
  > Open questions: mobile real-estate cost, iOS safe-area handling, whether to pin only on tall-content days or always. Sibling decision to short-column pinning. src: session 2026-05-20

- [ ] **Live-card green accent bar.** Revisit a green accent bar on live game cards — shipped then reverted — if live games need a stronger scan signal.
  > Shipped 5/20 (commit `96126cab`) as a 3px inset box-shadow `#22c55e` on the left edge of live GameCards; reverted 5/20 ("like it but don't love it anymore"). If revisited — a thinner bar, a different color tied to `--text-live`, or a subtle border-color shift instead of an inset shadow. src: session 2026-05-20

- [ ] **Ratings popup copy precision.** The ratings-popup copy is imprecise about how games are reordered — tighten it.
  > `HomeContent.tsx:529` says "reordered by top records and best matchups", but live / finished sort by rating and only upcoming sort by records. Suggested rewrite: "Games are also reordered by best matchups — live and finished by rating, upcoming by team records." src: project_hidescore_backlog_2026_04_13.md

- [ ] **Delete stale `public/` JSON copies.** Once R2 has been stable ~30 days, delete the stale fallback JSON copies — cosmetic.
  > Around 6/13; 39 fallback files in `public/`. src: project_hidescore_deploy_cap.md

- [ ] **Playoff countdown copy.** Show a "Playoffs in X days" countdown, appending the date if the card has room.
  > e.g. append "(Mar 20)". src: project_hidescore_backlog_2026_04_13.md

- [ ] **Playoff placeholders for TBD play-in.** Show greyed-out placeholder cards for TBD play-in playoff games.
  > `season.type: 5`. src: project_hidescore_backlog_2026_04_13.md

- [ ] **MLB live links QA.** Do a live-game QA pass on the MLB live links shipped in session 48.
  > src: project_hidescore_backlog_2026_04_13.md

- [ ] **`/faq` and `/privacy` orphaned — no in-app link.** Both pages exist but nothing on the site links to them — find a discreet home.
  > The footer dropped FAQ / Privacy in commit `c853502d` for the cleaner feedback-box layout (deliberate — a full FAQ on the homepage was too exposed). Current state: `/faq` is reachable only via `sitemap.xml` (Google can find it, humans can't); `/privacy` is linked from nowhere. The App Store listing carries the privacy URL separately so submission is fine, but the website has zero link to either page. Revisit when there's a discreet home — e.g. a small "···" / "About" overlay, a settings-panel row, or one subtle footer line. src: session 2026-05-19

- [ ] **iOS PrivacyInfo.xcprivacy manifest.** Create the iOS privacy manifest Apple has required since May 2024.
  > Apple has required this file since May 2024 for new submissions. We use GoatCounter analytics (`layout.tsx:135`), so create `ios/App/App/PrivacyInfo.xcprivacy` declaring `NSPrivacyTracking` only if GoatCounter touches IDFA (it doesn't by default — confirm), `NSPrivacyTrackingDomains: ["hidescore.goatcounter.com"]`, and required-reason API entries for any Capacitor plugin that touches file timestamps / UserDefaults. Existing submissions are grandfathered through, but new uploads may start hitting warnings. src: ios audit 2026-05-20

- [ ] **iOS App Tracking Transparency check.** Check whether GoatCounter touches IDFA; add an ATT prompt only if it does.
  > Paired with the privacy manifest above. If GoatCounter touches IDFA, add `NSUserTrackingUsageDescription` to Info.plist and request permission. If not (likely — GoatCounter is cookieless), do nothing; an ATT prompt for non-tracking analytics is itself a review risk. src: ios audit 2026-05-20

- [ ] **iOS splash screen simplification.** Swap the stretched splash image for a plain dark background.
  > The current `LaunchScreen.storyboard` scales a 1366×1366 Splash image via `scaleAspectFill`. Apple's HIG prefers near-empty launch screens (background color only, or a tiny logo). It looks stretched across devices and feels slow. Match the app theme. src: ios audit 2026-05-20

- [ ] **Buttons too small to interact with on mobile.** Several mobile buttons are below Apple's 44×44pt tap target — audit and enlarge them.
  > Star, broadcast chip, +N network expander, and highlight play buttons are all below the recommended 44×44pt hit target. Audit interactive elements for tap-target size on mobile.
  >
  > Also reconsider clickable card elements: whole-card click-to-stream (live cards with `cardClickable` at `GameCard.tsx:261`) competes with inner buttons that `stopPropagation`. If buttons get bigger, accidental whole-card hits rise. Decide: keep the card clickable + bigger buttons, or move the stream affordance to a single dedicated chip and un-click the card body. src: session 2026-05-20

## T5 — Strategic reminders (not action items)

- [ ] **MLB clip-embed legality.** The in-app MLB modal streams MLB's HLS playlists directly — fine for a hobby site, but revisit before monetizing.
  > Revisit before any App Store paid tier, ads, sponsorships, or scale. Safer path: anchor out to MLB.com. src: project_hidescore_mlb_clip_legality.md

- [ ] **iOS bundle staleness regression watch.** Don't reintroduce hardcoded JSON fetches in client code or the iOS bundle will freeze data at cap-sync time.
  > Resolved 4/27 commit `13da7e9` via `getApiBase()` routing — don't re-introduce hardcoded `/path.json` fetches. src: project_hidescore_ios_bundle_staleness.md

- [ ] **Homepage SEO: no H1, no static crawlable text.** The homepage has no visible H1 or prerendered text — watch GSC and add a heading / tagline if rankings dip.
  > Removed the "Spoiler-free sports scores" intro 2026-05-19 (`a4f4cebc`) alongside the FAQ block (`a2a5440c`) to clean the homepage. Result: `/` has zero visible `<h1>` and zero prerendered body copy — game data loads client-side, so crawlers see meta tags + JSON-LD only. `/faq` and `/privacy` still carry indexable copy, but homepage-query impressions / CTR may slide. Watch GSC homepage rows over the next 2–4 weeks; if they dip, mitigations (cheapest → richest): an sr-only `<h1>HideScore</h1>`, a minimal visible H1 ("HideScore"), or a one-line tagline above the game cards. Sibling concern to the `/faq` orphan above. src: session 2026-05-20

---

## Stats

| Tier | Open |
|---|---|
| T1 time-sensitive | 4 |
| T2 deferred-with-plan | 10 |
| T3 backlog | 12 |
| T4 polish | 16 |
| T5 strategic | 3 |
| **Total open** | **45** |

## Chat history (per-item)

*Every Claude Code chat that touched each open item — compiled 2026-05-22 from curated session memories + a raw scan of all 376 transcripts in `~/.claude/projects/-Users-jacob/`. Each chat is `date · sessionId-prefix · gist`.*

### T1 — Time-sensitive (chats)

- **Reddit post on /r/hockey or /r/nba** — `2026-05-13 · 956f3711 · Apple rejection fix, demo mode, resubmit + playoff-window promo strategy`; `2026-05-14 · 11218b0f · built BACKLOG.md, Reddit cron diagnosis`; `2026-05-16 · 9bde3fd0 · launch posting plan drafted`; `2026-05-17 · 9739d83d · full launch-planning arc (sub-rules audit, post drafts, /yesterday route)`; `2026-05-22 · 748566f8 · Reddit launch execution (r/hockey 162 upvotes, r/nba self-promo)`
- **Apple verdict watch** — `2026-05-13 · 956f3711 · Apple 4.1(a) Copycats rejection fix, demo mode, App Store resubmit`
- **iOS app rebuild + TestFlight upload** — `2026-05-04 · 3f1cd2c1 · layout overhaul shipped, iOS stale bundle queued for rebuild`; `2026-05-13 · 956f3711 · App Store resubmit arc (Xcode screenshots, sanitized metadata)`
- **GSC validation clicks** — `2026-04-27 · 1c8c71cb · GSC "Why pages aren't indexed" triage, 5-row safe/skip recommendations`

### T2 — Deferred with plan ready (chats)

- **MLB player option 1** — `2026-05-11 · 21f88092 · monkey FastCast diagnosis, MLB player UX options laid out`; `2026-05-13 · dccf8988 · MLB player UX diagnosis with 3 options, Big Inning deep link`
- **FastCast pin** — `2026-05-11 · 21f88092 · diagnosed MLB FastCast ordering, pin plan deferred`; `2026-05-13 · dccf8988 · FastCast pin deferred, fetchMLBPinnedRoundups plan noted`
- **Post-R2 #1: NBC.com scraper** — `2026-05-13 · e5d31c8d · NBC.com routing discovery (plan written, not shipped)`
- **Reddit OAuth completion** — `2026-05-02 · 360ae630 · Mac mini Reddit cron set up as residential-IP workaround, OAuth attempted`; `2026-05-08 · 64f98705 · Reddit 403 resolution confirmed via Mac mini cron, OAuth still pending`
- **Length toggle (Extended / Condensed)** — *no chat found* (originates from pre-archive session `a73138d7` / `project_hidescore_gap_closing_2026_04_13.md`)
- **ESPN news — sort-by-views decision** — `2026-05-16 · 825e4685 · settings team picker + ESPN news body discussion`
- **ESPN news — default click action decision** — `2026-05-16 · 825e4685 · ESPN news default click action discussed`
- **MLS-vs-EPL summer overlap decision** — `2026-05-04 · 3f1cd2c1 · EPL conditional display flag raised`; `2026-05-16 · 825e4685 · MLS/EPL overlap discussed`; `2026-05-20 · fb0ce2d3 · WNBA add, MLS/EPL overlap noted`
- **Playoff bracket on subtitle hover** — `2026-05-20 · 7211102a · bracket hover concept raised, buildout arc`; `2026-05-21 · 6c2a4f25 · bracket hover idea added to BACKLOG T2 with hook point + 4 design Qs`
- **Header overflow — bottom-toolbar / tab-bar redesign** — `2026-05-21 · 6c9a2e48 · iPhone toolbar overflow fix (ThemeToggle hidden <640px)`; `2026-05-21 · c7a11ed6 · today-tab bug fix + BACKLOG header redesign entry written`

### T3 — Older backlog, still open (chats)

- **Dodgers walk-off recap threshold** — *no chat found* (originates from pre-archive session `94c6851c` / `project_hidescore_backlog_2026_04_13.md`)
- **MLB time wrap on mobile** — *no chat found* (originates from pre-archive session `94c6851c`)
- **NBA "Tomorrow" tag bubble** — *no chat found* (originates from pre-archive session `94c6851c`)
- **Multi-network click expand** — *no chat found* (originates from pre-archive session `94c6851c`)
- **Calendar button won't close on 2nd click** — *no chat found* (originates from pre-archive session `94c6851c`)
- **Favorites-saved popup transparent bg** — *no chat found* (originates from pre-archive session `94c6851c`)
- **SportsCenter YouTube fix** — *no chat found* (originates from pre-archive session `94c6851c`)
- **Team subreddit links at bottom of cards** — *no chat found* (originates from pre-archive session `94c6851c`)
- **Live-game dates in team view use withEspn** — *no chat found* (originates from pre-archive session `d06962c6` / `session_hidescore_team_view.md`)
- **NewsColumn/news.ts ownership confirm** — *no chat found* (originates from pre-archive session `d06962c6`)
- **Big yesterday highlights from other teams** — *no chat found* (originates from pre-archive session `94c6851c`)
- **Season-wide highlight scrub** — *no chat found* (originates from pre-archive session `94c6851c`)

### T4 — Polish / low priority (chats)

- **News toggle icon looks broken** — `2026-05-20 · 7211102a · buildout arc, newspaper icon issue surfaced alongside FAQ/SEO work`
- **Big Inning auto-tick timer** — `2026-05-13 · dccf8988 · Big Inning live subtitle + PlayoffSubtitle timer noted as deferred`
- **Clean dead code** — *no chat found* (originates from pre-archive session `94c6851c`)
- **Revisit short-column pinning** — `2026-05-20 · 7211102a · short-column pinning added (commit ed02abca)`; `2026-05-20 · 493fec6a · short-column pinning ripped out, BACKLOG revisit entry added`
- **Footer pinning consideration** — `2026-05-20 · 7211102a · feedback box + footer positioning arc`; `2026-05-20 · 493fec6a · FeedbackBox unpinned, footer pinning deferred to backlog`
- **Live-card green accent bar** — `2026-05-21 · e2490dd3 · 3px green left-bar built (commit 96126cab)`; `2026-05-21 · 140ec9b4 · green bar reverted, BACKLOG revisit entry added`
- **Ratings popup copy precision** — `2026-05-20 · 7211102a · ratings sort description discussed`
- **Delete stale `public/` JSON copies** — `2026-05-05 · 62ff9fd3 · R2 migration Step 1, deploy-cap plan, public/ deletion deferred to ~6/13`
- **Playoff countdown copy** — *no chat found* (originates from pre-archive session `94c6851c`)
- **Playoff placeholders TBD play-in** — *no chat found* (originates from pre-archive session `94c6851c`)
- **MLB live links QA** — *no chat found* (originates from pre-archive session 48, before transcript archive)
- **`/faq` and `/privacy` orphaned — no in-app link** — `2026-05-20 · 7211102a · /faq standalone page created (commit 957693c2), orphan status noted`
- **iOS PrivacyInfo.xcprivacy manifest** — `2026-05-20 · 7211102a · iOS audit follow-ups written to BACKLOG (commit 57b3d375)`; `2026-05-22 · 05d96b38 · iOS best practices audit session`
- **iOS App Tracking Transparency check** — `2026-05-20 · 7211102a · ATT + GoatCounter tracking question added to BACKLOG`; `2026-05-22 · 05d96b38 · iOS ATT audit session`
- **iOS splash screen simplification** — `2026-05-20 · 7211102a · LaunchScreen.storyboard simplification added to BACKLOG`; `2026-05-22 · 05d96b38 · iOS splash screen audit`
- **Buttons too small to interact with on mobile** — `2026-05-20 · 7211102a · 44pt tap-target audit item added to BACKLOG`; `2026-05-22 · 05d96b38 · iOS best practices audit session`

### T5 — Strategic reminders (chats)

- **MLB clip-embed legality** — `2026-04-27 · e732212a · MLB HLS stream legality flagged before monetization`
- **iOS bundle staleness regression watch** — *no chat found* (originates from pre-archive session `2e14d96f` / `project_hidescore_ios_bundle_staleness.md`)
- **Homepage SEO: no H1, no static crawlable text** — `2026-05-19 · 760921ed · ESPN reverify + GSC ranking deep-dive`; `2026-05-20 · 7211102a · Spoiler-free intro removed (commit 19ae3664), SEO watch T5 added to BACKLOG`

---

<details>
<summary><strong>✅ Done — 20 items (6 from this backlog + 14 earlier)</strong></summary>

### Shipped from this backlog

- [x] **www.hidescore.com → 525 fix** — ✅ FIXED 2026-05-13. Root cause: stale CNAME → `parkingpage.namecheap.com` (Namecheap default). Updated CNAME → `hidescore.com` (proxied) + added www to nospoilerscores Pages custom domains via CF API. Cert provisioned in ~30s. Now serves apex content (no canonical redirect — `<link rel="canonical">` handles SEO). Upgrade to 301 later via CF dashboard if needed.
- [x] **Post-R2 #2: espn-top cron diagnostic** — ✅ DONE 2026-05-13 commit `fb2d9968`. Root cause: ESPN intermittently serves homepage HTML *without* the `headlineStack top-headlines` block. Same Mac mini residential IP, 5 min apart, opposite results. Mac mini cron's been losing the lottery most of the day. Fix: 3x retry with 1.5s gap on empty result in `fetchESPNTopHeadlines`. Successful HTML re-seeds module cache for the videos scraper too. Worst case: 4 fetches/~5s instead of 1.
- [x] **Post-R2 #3: espn-top fallback tightening** — ✅ DONE 2026-05-13 commit `0e1f4618`. Cap-at-9 was already obsolete (broken `now.core.api.espn.com` fallback was removed earlier). Added narrow blocklist patterns (`transfer rumors`, `daily.*playoffs|schedule|bracket`) to global ARTICLE_BLOCKLIST. Skipped bare `odds` + `preview` — too broad, false-positives on legit game previews.
- [x] **R2 staleness checker** — ✅ DONE 2026-05-13. New `scripts/check-staleness.mjs` + `.github/workflows/staleness-check.yml` runs every 30min, hits all 38 prebaked feeds at `hidescore.com` (worker → R2 path), parses `fetchedAt`/`generatedAt`. **Tiered alerts:** warnings (past per-feed `warnH`) logged only — workflow stays green, no email; critical (past 4× `warnH`) or fetch error fails workflow → GH emails repo owner. Thresholds: news/espn-airings warn=6h crit=24h; prime-asins warn=18h crit=72h; big-inning warn=36h crit=144h. **Day-1 caught two real silent-failure modes:** Mac mini stuck uploading 25.8h-stale files (self-recovered); espn-videos 28h stale due to ESPN WAF challenging GHA IPs → moved to Mac mini cron + retry mirror (commit `38068ca0`).
- [x] **Wrangler version pinning** — ✅ DONE 2026-05-13 commit `0e1f4618`. Pinned `wrangler@^4` in all 4 GHA workflows. Mac mini install still TODO — needs ssh command Jacob can paste.
- [x] **Scrub Co-Authored-By trailers from recent commits** — ✅ DONE 2026-05-21. Audit found **13** trailer'd commits (all 5/20, `0c25da04`…`85bee286`), not the 7 first estimated. Rewrote `928fd410..HEAD` with `git filter-branch --msg-filter` (perl strips the `Co-Authored-By:` line + preceding blank), verified tree diff empty (file contents byte-identical) and zero remaining trailers, then `git push --force-with-lease origin main`. New HEAD `0c1a017e`. Going forward: no Co-Authored-By trailers on this repo per CLAUDE.md `## Git`.

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
