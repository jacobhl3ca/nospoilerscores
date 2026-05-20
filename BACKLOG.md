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
- [ ] **Ratings popup copy precision** — `HomeContent.tsx:529` says "reordered by top records and best matchups" but actually live/finished sort by rating, only upcoming sort by records. Suggested rewrite: "Games are also reordered by best matchups — live and finished by rating, upcoming by team records." _src: project_hidescore_backlog_2026_04_13.md_
- [x] **Wrangler version pinning** — ✅ DONE 2026-05-13 commit `0e1f4618`. Pinned `wrangler@^4` in all 4 GHA workflows. Mac mini install still TODO — needs ssh command Jacob can paste.
- [ ] **Delete stale `public/` JSON copies** — after R2 stable ~30 days (~6/13), 39 fallback files in `public/` deletable. Cosmetic. _src: project_hidescore_deploy_cap.md_
- [ ] **Playoff countdown copy** — show "Playoffs in X days"; if room remains in card width, append "(Mar 20)". _src: project_hidescore_backlog_2026_04_13.md_
- [ ] **Playoff placeholders TBD play-in** — `season.type: 5`, show greyed-out cards. _src: project_hidescore_backlog_2026_04_13.md_
- [ ] **MLB live links QA** — shipped session 48, needs live-game QA pass. _src: project_hidescore_backlog_2026_04_13.md_
- [ ] **`/faq` and `/privacy` orphaned — no in-app link** — Footer dropped FAQ/Privacy in commit `c853502d` for the cleaner feedback-box layout (deliberate — full FAQ on homepage was too exposed). Current state: `/faq` reachable only via `sitemap.xml` (Google can find it, humans can't); `/privacy` linked from nowhere. App Store listing carries the privacy URL separately so submission is fine, but the website has zero link to either page. Revisit when there's a discreet home for them — e.g. a small "···" / "About" overlay, a settings-panel row, or one subtle footer line that doesn't clutter. _src: session 2026-05-19_

## T5 — Strategic reminders (not action items)

- [ ] **MLB clip-embed legality** — in-app MLB modal streams MLB's HLS playlists directly. Fine for hobby site, **revisit before monetization** (App Store paid tier, ads, sponsorships, scale). Safer path: anchor-out to MLB.com. _src: project_hidescore_mlb_clip_legality.md_
- [ ] **iOS bundle staleness regression watch** — resolved 4/27 commit 13da7e9 via `getApiBase()` routing. Don't re-introduce hardcoded `/path.json` fetches in client code or iOS will freeze data at cap-sync time. _src: project_hidescore_ios_bundle_staleness.md_

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
| T2 deferred-with-plan | 11 |
| T3 backlog | 12 |
| T4 polish | 8 |
| T5 strategic | 2 |
| **Total open** | **38** |

Recently shipped (~5 weeks): 14 items.
