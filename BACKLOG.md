# HideScore — Master Backlog

## 📌 Pinned — when the Android app is ready

- [ ] **Un-table the Android download pill + fix its label + Play Store decision.** Re-tabled 5/29 (commit `a35dc529`) while the Android app is handled separately; surface it when ready.
  > The footer pill was un-tabled in the layout overhaul but linked a sideload `/HideScore.apk` under a "Google Play" label, so it was re-tabled. When the Android app is ready: un-comment the pill in the `HomeContent.tsx` footer (`!isNativeApp` block, beside the App Store pill) AND fix the label/destination mismatch — relabel "Android APK" / "Direct download" for a sideload, or finish the Play closed test before calling it "Google Play". Badge SVG must NOT contain the literal "APK" — CF WAF 500s it. Capacitor app built + emulator-verified 5/20-21 (appId `com.jacobhl.hidescore`, WebView → hidescore.com via `server.url`); signed APK at `public/HideScore.apk`. Play Console acct `7809060308326519816` ($25 paid) needs a real device + 20-tester / 14-day closed test (~6wk); sideload is the working channel meanwhile. Upload keystore at `~/.config/hidescore/upload.env` — back it up. _src: session_hidescore_android_app_build_2026_05_20_to_21.md_

## T1 — Time-sensitive

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

- [ ] **MLB player option 1.** Force hls.js on Safari and drop subtitles for clean, Reddit-style controls.
  > Touch `VideoModal.tsx:133` (skip the native HLS branch), remove the CC button at `:332-342`. _src: project_hidescore_mlb_player_consistency.md_

- [ ] **FastCast pin.** Pin Real Fast + FastCast to the first two slots of the MLB videos strip.
  > New `fetchMLBPinnedRoundups()` in `scripts/prebake-news.mjs`, prepend before the `items.length >= 10` cap. _src: project_hidescore_mlb_fastcast_pin.md_

- [ ] **Post-R2 #1: NBC.com scraper.** Deep-link NBC broadcast chips to `nbc.com/watch/...` URLs.
  > New `scripts/scrape-nbc-sports.mjs` mirroring the prime-asins pattern. Edit `espn.ts:671`. _src: project_hidescore_post_r2_followups.md_

- [ ] **Reddit OAuth completion.** Finish Reddit OAuth once the Data API app is approved.
  > Code shipped 4/28 (commit `37f3816`), waiting on Reddit Data API approval for the `Reasonable_Stick_329` app. If approved, retire the Mac mini reddit cron. _src: project_hidescore_reddit_403.md_

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

- [ ] **Adaptive layouts for 1–5 visible league columns.** Make the column layout respond to how many leagues are shown instead of assuming 3.
  > Today it's hardcoded for 3 columns (`max-w-[225px] xl:max-w-[280px]` per column in `LeagueColumn.tsx`). The "Empty" slot option (5/24) lets users drop to 2 or 1. Plan, keyed on non-empty slot count: **1** = single centered wider column (~`max-w-[480px]`), maybe a hero treatment; **2** = two wider equal columns; **3** = current; **4–5** = drop per-column max-width, shrink gaps/abbreviations, or horizontal-scroll on narrow viewports. Slot system needs >3 slots (currently first/second/third in `preferences.ts` + `setSlotLeague`). 4–5 columns are desktop-only; mobile collapses to scroll/stack. Pairs with the column drag-handle (the 3-dot indicator added 5/24). _src: session 2026-05-24_

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

## T5 — Strategic reminders (not action items)

- [ ] **MLB clip-embed legality.** Revisit embedding MLB's HLS clips before any monetization.
  > The in-app MLB modal streams MLB's HLS playlists directly. Fine for a hobby site; revisit before an App Store paid tier, ads, sponsorships, or scale. Safer path: anchor out to MLB.com. _src: project_hidescore_mlb_clip_legality.md_

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
