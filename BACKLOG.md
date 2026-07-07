# HideScore — Master Backlog

> **HideScore.com** — Sports scores without the spoilers. Hides finals and masks spoiler bars on highlight videos so you can watch the recap without seeing the ending. Web, and iOS (Android coming soon).

## ✅ 2026-07-03 batch — SHIPPED LIVE to prod (web + app)

Pushed to `main` commit `c03d183a` → CI built + deployed + smoke-tested green (07-03). `sw.js` CACHE_VERSION → **v5**. Worktree `~/hs-batch-wt` kept for quick tweak/revert (`git worktree remove ~/hs-batch-wt` when done). **QA checklist below — Jacob to test on phone + in the iOS app.**

- [x] **② Blur = pics/videos only + new "Show text posts" toggle.** Blur applies only to headlines that carry a pic/video. Text posts (headline-only, no media) no longer show a useless blurred-blank; they're **hidden while headlines are blurred** and a new **"Text posts hidden/shown"** pill (appears next to "Headlines hidden" only when headlines are blurred) exposes them **readable**. Revealing headlines shows them anyway. New pref `showTextPosts` (default off). `.news-textpost` row + `.news-card-alltext` card markers + `html.show-text-posts`. Files: `NewsColumn.tsx`, `HomeContent.tsx`, `preferences.ts`, `globals.css`.
  > **🤔 STILL OPEN for Jacob:** scoped "text post" to **any** headline-only item (Reddit AND all-text ESPN/MLB.com cards → those cards collapse until you toggle). Want it limited to **Reddit text posts only**? One-line change.
- [x] **③ Mobile cycle arrows — MOVED OFF THE VIDEO (Jacob 7/3).** Prev/next post paging is now a labelled **‹ Prev / Next › button row BELOW the video** (was a hover-only overlay on the video edge, invisible/awkward on phones). Both buttons always render; the unavailable direction is disabled. Reddit news columns only (they carry siblings). Files: `VideoModal.tsx`.
- [x] **🎥 Prefer YouTube player for news clips (Jacob 7/3 "revert to youtube player by default for now").** When the prebake has a validated YouTube id for a clip, the modal now uses the **YouTube player** (consistent across FF/YT/mobile, spoiler-safe **no bottom bar** by default) instead of the source's own HLS/Brightcove/redlib player. A `videoId` wins the mode-priority; clips with **no** YT id (MLB statsapi HLS, NHL Brightcove, posterless redlib) still fall through to their native player. Files: `VideoModal.tsx` (`hlsMode`/`embedMode` now `&& !videoId`). **⚠️ WATCH:** if a validated YT id is ever wrong/unavailable it won't fall back to the direct clip — easy to revert (drop the `&& !videoId`).
- [x] **⑤ Can't disable CC on homepage highlights — FIXED.** Captions forced **OFF by default** on YouTube via `unloadModule` (the CC player-var can't force-off), and the **CC toggle now shows for YouTube clips too** (was HLS-only) so you can turn them back on. Files: `VideoModal.tsx`.
- [x] **⑥ Dark mode for the in-app Safari player.** In-app links/videos open SFSafariViewController with a **dark toolbar** (`toolbarColor:#0b0e14`). Files: `openExternal.ts`. Only visible in the **native iOS app** — verify there. Toolbar tint is the only chrome capacitor exposes; content dark-mode follows the site + system.
- [x] **④ "Empty" → "Remove col"** — renamed in **all three** places: news swap (`NewsColumn.tsx`), **scores swap** (`LeagueColumn.tsx` — the one Jacob saw), and Settings dropdown (`SettingsPanel.tsx`). Value stays `"empty"`; label only.
- [ ] **① Make r/hidescore — doc ready, needs Jacob to create it.** Can't be scripted (Reddit login; OAuth blocked). Ready-to-paste setup (name, title, description, sidebar, rules, flairs, pinned welcome post, asset pointers, mod steps) → **`~/hidescore-backlog/r-hidescore-setup.html`** (copy-buttons; open in Firefox). Fallbacks if `hidescore` taken: HideScoreApp / hidescores / nospoilerscores. _src: 2026-07-02 brain-dump._

**📋 QA checklist (test on phone + iOS app):**
- [ ] News video → **‹ Prev / Next › row sits BELOW the video**, not on it; both tappable; disabled at first/last post.
- [ ] Open a news **clip that's also on YouTube** → plays in the YouTube player, **no bottom progress bar**, spoiler title masked.
- [ ] Open an **MLB/NHL clip with no YT id** → still plays (HLS/Brightcove) — confirm none went blank.
- [ ] **Homepage highlight → CC starts OFF**; tap **CC** to turn on, tap again to turn off (YouTube).
- [ ] **Headlines hidden** (default) → text-only cards hidden; tap **"Text posts"** pill → they appear readable; reveal Headlines → everything shows.
- [ ] **Scores view** → tap a league title → dropdown says **"Remove col"** (not "Empty"); Settings 3rd-league dropdown too.
- [ ] **iOS app:** tap a link/video that opens the in-app browser → **dark toolbar** (not white).
- [ ] General **mobile streaming**: clips autoplay muted inline, fullscreen works, tap-to-seek + unmute reachable.

**🔎 Mobile-streaming audit (findings):** ✅ HLS = native on iOS Safari/WKWebView, hls.js elsewhere; ✅ autoplay-muted + `playsInline` correct; ✅ fullscreen has a CSS-overlay fallback on iOS (no element-fullscreen); ✅ YT `controls:0` = no spoiler bottom bar by default. The core "differs on FF/YT/mobile" pain was the **assorted news players** — now mitigated by preferring YouTube whenever a validated id exists. **Residual (clips with NO YT id still vary):** NHL Brightcove iframes, posterless redlib/v.redd.it, MLB HLS — and clip hosts rotate (streamff etc.). If a specific one misbehaves on your phone, point me at it.

### 2026-07-03 follow-up (shipped `91633361`, sw v6)
- [x] **Prev/Next pager → fixed bottom-centre bar.** Jacob 7/3: the below-video row jumped because news media height varies. Now **pinned to the modal's bottom-centre** (fixed, above the home indicator) — same thumb target every post, off the video. `VideoModal.tsx`. _Open: confirm this is the spot you want, else move to screen-edge arrows._
- [x] **Footer even spacing.** The `<details>` "About HideScore" had `my-2` fighting the footer `gap-1` → uneven last lines. Now `gap-2` everywhere, `my-2` dropped. `HomeContent.tsx`.
- [ ] **❓ YouTube "bottom bar" — is it wanted?** What shows on the YT player by default is **our custom control strip** (mute / ±5s skip / fullscreen), NOT YouTube's native red bar (`controls:0` kills that). `controlsHidden` defaults `false`. If Jacob wants a totally bare player, default `controlsHidden=true` (tap-to-show) — BUT that also hides the **unmute** button (highlights autoplay muted), so needs a standalone tap-to-unmute affordance first. Awaiting Jacob's call + a player screenshot.
### 2026-07-05 (shipped `6a16cff5`, sw v8)
- [x] **Prev/Next overlap — REAL fix.** The 7/4 fixed-bar + bottom-padding approach failed for tall videos (content overflowed past the reserved padding → still overlapped, Jacob confirmed). Now the pager is **in-flow as the last element under the byline/links**, so it can never overlap them; composes with the `auto/staging` modal refactor that made the modal scroll (`overflow-y-auto`) when a post is taller than the viewport. `VideoModal.tsx`.
- [x] **iOS header safe-area — upgraded to a clamp.** An auto-improve commit (`cf8c0431`) replaced the 50px floor with `clamp(50px, env(safe-area-inset-top), 60px)` when `isNativeApp` — floors the overlap AND caps the intermittent DOUBLE-space (env reading too big) in one. Kept over my floor on rebase. _Test in app; if top/bottom spacing is now stable this closes the native-safe-area item too._

### 2026-07-04 (shipped `542bf38f`, sw v7)
- [x] **Prev/Next overlap fixed.** Kept the liked bottom-centre pager (Jacob: more reliable than on-video arrows) but reserved a bottom band in the modal so the byline / Open-on / Copy-link row lifts clear instead of overlapping. `VideoModal.tsx`.
- [x] **YouTube red bar → stripped.** Added a thin (6px) always-on black bottom mask in spoiler-safe mode (`!youtubeNativeControls && maskVideoBottom`) so YT's red progress line can never flash (belt-and-suspenders over `controls:0`, which already removes it on web — the iOS WKWebView was the suspect). `VideoModal.tsx`. _If a red bar persists: Settings → "Use standard YouTube player" is ON (that intentionally shows YT's bar); turn it off._
- [x] **iOS status-bar overlap — CSS floor (ships via web, no rebuild).** Header `paddingTop` now floors at `max(env(safe-area-inset-top), 50px)` when `isNativeApp`, so it clears the notch even when the WKWebView reports the inset as ~0. `HomeContent.tsx`. _Test in the app. If the intermittent DOUBLE space (env reading too big) still shows, that's the separate native-plugin fix below._
- [x] **hidescore.com "down" = false alarm.** Site was 200 the whole time; the Firefox "trouble finding that site" screen was a transient DNS-over-HTTPS failure to `mozilla.cloudflare-dns.com` on Jacob's machine (reachable again). "Try Again" loads it.
- [ ] **🩹 iOS app: top bar overlaps the status bar + intermittent extra space top/bottom + a stray centre scrollbar.** Header has `paddingTop: calc(env(safe-area-inset-top) + 0.5rem)` but in the native app the inset reads ~0 (and sometimes doubles → the "extra space sometimes"), so the top bar collides with the iOS status bar; the mid-page scroll indicator is likely the same viewport/inset instability. **This is a native WKWebView / safe-area timing issue** (no `@capacitor/status-bar` plugin configured) — NOT reliably fixable or verifiable from the live web push, and blind changes risk regressions. **Proposed:** add `@capacitor/status-bar` + `StatusBar.setOverlaysWebView`/style and/or an `isNativeApp` CSS floor `max(env(safe-area-inset-top), 50px)`; iterate on-device (likely a native rebuild + TestFlight). _Needs Jacob's go-ahead before the native loop._ _src: 2026-07-03 iPhone screenshots._

## 🔝 Top priority

- [ ] **📱➡️ Android Play Store — NEXT STEP: buy a paid 12-tester / 14-day closed-test service.** Play Console setup is 100% done and the release was sent to Google for review 6/14; the only thing left to ship the app is 12 testers opted-in for 14 straight days. Jacob has no Android contacts and free Reddit swaps are reciprocal + drop-out-prone, so **pay for it** the moment the opt-in link goes live: **Upwork gig ~$20** (escrow, safest) or **testerscommunity.com ~$15** (refund if no production access). Full detail + the "push 1 update mid-test" caveat in the 📌 Pinned Android item below; recruiting drafts in `~/hidescore-backlog/play-tester-recruiting.md`. _src: 6/14–15 this chat_

- [ ] **📣 World Cup marketing push — EXECUTE (~June 8–11, before/at the 6/11 kickoff). ⬅ #1.** The once-every-4-years window (WC on home soil + simultaneous NBA/NHL Finals) is the moment to market HideScore — lead with the World Cup, anchor on the competitiveness rating ("which games were classics without revealing who won"). Full plan: memory `project_hidescore_worldcup_marketing_push`. Drafts now live in `~/hidescore-backlog/worldcup-marketing/`: `MARKETING_LAUNCH_POSTS.md` (Show HN + Product Hunt + held Reddit post), `MARKETING_VIDEO_SCRIPTS.md` (5 short-form scripts for Emilio), `MARKETING_COMMUNITIES.md` (tiered Discord/forum list).
  > **Channels:** Show HN + Product Hunt around/just before kickoff (Tue–Thu ~9am PT); Emilio posts the video scripts to IG/TikTok/X; Discord/forum outreach led by r/SideProject ("free no-spoiler World Cup scoreboard," post 6/10–11); Reddit promo **only after the ban appeal clears** (never ban-evade — domain-flag risk).
  > **Point the campaign at `/worldcup`** once it's shipped (next item).
  > ✅ **Asset files secured 6/5** — the 3 `MARKETING_*.md` drafts had been left untracked in the PUBLIC repo; moved to `~/hidescore-backlog/worldcup-marketing/` and added `MARKETING_*.md` to `nospoilerscores/.gitignore` so a `git add .` can't expose them.
  > **Layout rework — TABLED 6/5.** WC stays the center column; MLB returns automatically when the NBA/NHL Finals end ~6/19. Un-table only if you want MLB visible *during* the Finals window.
  > **Staging build — ✅ FIXED 6/5** (you removed `maxGames` in your parallel edits; `npm run build` on staging is clean again — 9 routes incl. `/worldcup`). _src: 2026-06-05; session_hidescore_worldcup_marketing_2026_06_04_

- [x] **🌍 World Cup hub `/worldcup` — ✅ SHIPPED & LIVE (verified 7/4: https://hidescore.com/worldcup returns 200, commits on `origin/main`; sw.js CACHE_VERSION current).** ~~BUILT 6/5; decide ship-or-tweak, then test.~~ Dedicated deep-link landing route for the WC marketing push (mirrors `/tomorrow` `/yesterday`): new `src/app/worldcup/page.tsx` (WC SEO/OG — title "2026 World Cup — No Spoilers | HideScore", canonical `/worldcup`, og:url + twitter card) + a `worldCupHub` prop on `HomeContent.tsx` that renders an accent-bordered framing banner (`<h1>` "⚽ 2026 World Cup, spoiler-free" + the 104-matches / Jun 11–Jul 19 / home-soil pitch + the competitiveness-rating differentiator + a "Free · no tracking cookies · also on the App Store" trust line). The WC column already auto-appears below it (firstPref center pin), so there are **no slot-logic changes — low risk.** Verified: builds clean on latest `origin/main` (`c69313b7`), tsc passes, `/worldcup` static page generated, banner correctly absent on home/`/tomorrow`. **NOT committed/pushed yet** (lives in the working tree + a temp worktree).
  > **🤔 DECISION NEEDED:** ship to prod now (public marketing → no privacy gate needed) or edit the banner copy first? To ship: cherry-pick the 2 files onto `main` via the worktree method → push → CF Pages deploy.
  > **🧪 What to test (after ship):** (1) banner renders + reads well on **desktop AND mobile**; (2) the World Cup column shows below the banner; (3) the **link/OG preview** looks right when the URL is shared (title + description + image); (4) the normal board is unchanged — **no banner** on home / `/tomorrow` / `/yesterday`; (5) before 6/11 it shows the opener via the lookahead, after 6/11 it shows live/today's matches.
  > **📍 Page to test on:** **https://hidescore.com/worldcup** (once pushed to prod). NOT on staging — pushing `staging` deploys nothing (staging itself now builds clean again). Pre-ship preview is local only (built `out/` export served locally). _src: 2026-06-05; session_hidescore_worldcup_marketing_2026_06_04_

- [ ] **Tweak/polish the share-card feature (shipped 5/31 as-is).** The OG share-card preview (browser draws a teams+date PNG to canvas → POSTs to the worker → R2 `cards/<key>.png` → `?c=<key>` swaps OG meta; see `src/lib/shareCard.ts` + `public/_worker.js`) was pushed in its current WIP state per Jacob. Revisit tomorrow: review the rendered card design, confirm the worker OG swap + R2 upload path work end-to-end, and decide what to refine.

- [x] **Reddit news feeds — ✅ WORKING AGAIN (verified 7/4: reddit-nba/reddit-mlb feeds fresh, fetched within last 8h, 12 items each, via the RSS/redlib fallback path — no OAuth needed; per standing memory, Reddit OAuth is BLOCKED and should not be attempted).** ~~fix + re-enable (FIRST to solve).~~ Reddit cards were removed from the news view 2026-05-30; the underlying feed is the priority fix. Register a fresh Reddit API app under any working account (reddit.com/prefs/apps → script/web, ~2 min) → client ID + secret → drop in `~/.config/hidescore/reddit.env` on the Mac mini + `source` in `hidescore-reddit-cron.sh` so `fetchReddit` takes the `oauth.reddit.com` path. App-only OAuth reads public subreddits (no posting / good standing needed). Then re-add the Reddit sources to `leagueSourceCascade`/`GENERIC_CASCADE` + the funnel filter option in HomeContent. _src: project_hidescore_reddit_403.md_

- [ ] **QA + prep for the 2026 World Cup (soon).** World Cup 2026 is this summer — make sure FIFA/soccer surfacing is solid before it starts: verify the `fifa` league config + season window, the new soccer range-lookahead (`fetchNextGameDayRange`) resolves real fixtures, soccer-slot priority (UCL>UEL>MLS, EPL beats both), broadcast/watch links for WC matches, news feeds, and that the column auto-appears on match days. Do a full QA pass on the soccer path generally.

## 🔧 Minor — restore when convenient

- [ ] **Restore the R2-upload retry loop in `news-prebake.yml`.** The 3-attempt retry-with-backoff (orig commit `93833db9`) was lost 5/30 when a linter reverted an in-progress edit during a conflict fix and the simple one-line `wrangler r2 object put` got committed to main. The cron works fine without it; this is just resilience against transient R2 5xx. Re-add the `for attempt in 1 2 3` loop to the "Upload news feeds to R2" step (it's in git history at `93833db9`), to BOTH staging + main so they don't diverge.

## 💡 Consider

- [ ] **First-open "1-tap reveal" demo on the World Cup hub + home — cut bounce on cold ad/search traffic.** First-time visitors landing from the Bing $500 campaign / WC search don't instantly get the hidden-score UX (scores render as ●● until tapped), so a chunk bounce (~64% on `/worldcup`). **On first open ONLY** (gate on a `localStorage` flag, e.g. `nss-seen-reveal-demo`), show a lightweight one-time coachmark/animation — a pulsing "tap to reveal — or leave it hidden" hint, or an auto demo that reveals then re-hides a sample card — then never show it again. Teaches the interaction in ~1 second so cold visitors convert instead of leaving. Low risk (additive, first-visit-gated). Timely while the WC ads drive cold traffic. _src: 2026-06-24 Jacob_

- [ ] **Fewer/wider columns on mobile (2-up or horizontal-scroll) — TABLED 6/9, think through.** The 3-column board is fundamentally too cramped on phones (~100px/column at 390px): the upcoming/compact cards can't fit a bold DOW + time + network on one row AND keep the times aligned across rows — at 3 columns those two goals physically conflict, and the narrowest phones still clip the NBA lead "Tomo" (its "8:30 PM" can't be shortened). The real fix is more width per column: either **2 columns on mobile** (swipe/scroll for the 3rd league) or **horizontal-scroll columns** (all leagues, each ~160px min-width, swipe sideways) or **vertical stack** (1 full-width column, scroll down — also covers the old "more leagues" idea). Each is a real UX trade-off (you currently see all 3 leagues at once). Decide the approach, then it unlocks: mobile time alignment, no card truncation, and a genuinely large network tap target (Jacob's "chip almost full width on mobile"). Touches the column render in `HomeContent.tsx`. _src: 2026-06-09 Jacob_

- [ ] **Apple TV (tvOS) app.** Jacob 6/2 — bring HideScore to the living-room TV. HideScore is a perfect tvOS fit: spoiler-free scores + highlight playback on the big screen. Open questions before starting: (1) **delivery path** — Capacitor has no official tvOS target, so the existing WebView wrapper won't carry over cleanly; options are a native SwiftUI/TVMLKit app that points at the same R2 feeds/APIs, or a thin web-view shell if tvOS allows it (it's restrictive). (2) **navigation** — tvOS is focus-engine / Siri-Remote driven (no touch, no hover), so the whole card/column UI needs a focus-based redesign (D-pad nav between columns/cards, no tiny tap targets). (3) **video** — highlight playback maps well to AVPlayer/native HLS, but the YouTube-iframe path and the monkey spoiler-overlay need a tvOS equivalent. (4) **reuse** — same App Store Connect app record / shared codebase or a separate target? Lower priority than iOS/Android; scoping note only — not started. _src: 2026-06-02 Jacob_
  - **🎁 Dad use-case (6/17) — strong reason to bump this.** Dad (David Licht) watches **Detroit Tigers condensed games almost every night** on his living-room TV → a spoiler-free HideScore on Apple TV is the *perfect* gift and a real first daily user. Frame v1 around exactly his flow: pick Tigers → spoiler-safe final + condensed/highlight playback on the big screen. _src: 2026-06-17 Jacob_

- [ ] **Highlight team names in a chosen accent color on cards.** Jacob 5/31 — consider coloring the team name text (team color? site accent?) on game cards for visual pop. Decide a scheme that stays readable in light + dark and doesn't imply a winner. Not started.
- [ ] **Zoom gets stuck on mobile.** Jacob 5/31 — pinch-zoom on hidescore.com can get "stuck". Viewport has NO zoom lock (`{themeColor, viewportFit:"cover"}`), so the cause is likely the sticky header + fixed bottom tab bar + an overflow trap when zoomed. Needs a clearer repro (can't zoom back out? can't pan while zoomed?) before fixing — don't guess.
- [ ] **Calendar picker on mobile.** The date-picker calendar icon is desktop-only now (the mobile header date-nav line has no room for it). If wanted on mobile, find a spot (e.g. tap the date label, or a slot in Settings).
- [x] **Weather on the game-detail card — SHIPPED 6/16.** Outdoor, non-final games show ESPN-style gametime conditions (emoji + temp + condition) plus an hourly rain-chance bar timeline below, shown only when meaningful rain (peak ≥30%) is forecast. Built on `src/lib/weather.ts` using **Open-Meteo** (free, key-less, CORS-open): geocode the venue city → lat/lon + tz, then that day's hourly forecast — NOT ESPN's summary endpoint (which only gives one gametime snapshot, no hourly timeline). Gated on `!venueIndoor` + `venueLocation` + `state!=="post"`; games beyond the ~15-day forecast horizon just hide it. _src: 2026-06-13→16 Jacob_
  > **Future ideas if revisited:** wind/gust + "feels like"; a tappable AccuWeather/Open-Meteo link; precompute on the board cards (currently modal-only, fetched on open). Rain threshold (30%) is a tunable constant in GameDetailModal.

## 🅿️ Parked — maybe re-add

- [ ] **Column drag-to-reorder (scores view).** Disabled 5/30 — native HTML5 drag-and-drop didn't swap reliably (the draggable header is also the league swap-dropdown button; Safari/Firefox drop custom dataTransfer MIME types mid-drag). Code is intact behind `canDrag = false` in `LeagueColumn.tsx` (+ a `text/plain`/JS-var fallback already added). To re-enable properly, rebuild with **pointer events** (window-level pointermove/up + in-page dispatch) like the RIOC restaurant reorder — see `feedback_playwright_drag_drop_testing` + `session_rioc_restaurant_sort`. Flip `canDrag` back on once rebuilt.

- [ ] **News column-count selector (1/2/3).** Removed 5/30 — it didn't do much and news is now fixed at desktop=3 / mobile=1. If wanted back, restore `ColumnCountButtons`/`ColIcon` + the `newsColCount` pref wiring in `HomeContent.tsx` (it's in git history) and gate the mobile-forced single column behind it.

## 📌 Pinned — when the Android app is ready

- [x] **Footer Android pill — SHIPPED LIVE 6/10** (commit `e92326e3`, on `main` via CI deploy). Un-commented in `HomeContent.tsx` footer beside the App Store badge; links `/HideScore.apk` (sideload) using `android-download-badge.svg` ("Download / Android App" — no "Google Play", no "APK" literal → WAF-safe). Verified live: both badges render, APK 200s (5.27MB). Too-wide header overflow also re-verified RESOLVED at 360/390/414px (bottom-tab-bar overhaul is live).
- [ ] **🟢 NEXT STEP — Android Play closed test: BUY a paid 12-tester/14-day service the moment the opt-in link goes live.** (Also pinned at top of 🔝 Top priority.) Everything else is done (see below); the ONLY remaining gate is getting **≥12 testers opted-in for 14 consecutive days**. **Friends/family is OUT — Jacob has no Android contacts.** Free Reddit swap (r/AndroidClosedTesting etc.) is **reciprocal** (you must test THEIR app back, needs an Android device Jacob doesn't have — only the `hidescore_pixel` emulator) AND high-dropout → **timeout risk** (drop below 12 → 14-day clock stalls). So paid is lowest-risk + lowest-effort for his constraints. **Vetted options (6/15):** (1) **Upwork gig ~$20** — safest *payment* (escrow + reviews + dispute) `upwork.com/services/product/...1757667456412561408`; (2) **testerscommunity.com ~$15** — full refund if you don't get production access (cheapest reputable); ❌ skip `*.github.io` "guaranteed approval" sellers (no accountability). **⚠️ Buy only AFTER the opt-in link exists** (release was SENT for review 6/14, pending Google approval — link appears once published to the track). **⚠️ During the 14 days, push ≥1 small update** — Google rejects "uploaded once, did nothing" as no-real-testing. Recruiting drafts (Reddit comment + family text + risk notes) = `~/hidescore-backlog/play-tester-recruiting.md`. Jacob already posted the group `hidescore-testers@googlegroups.com` publicly (harmless; verify group join-setting = "anyone can join"). _src: 6/14–15 this chat_
- [x] **Play Console setup — DONE 6/14.** App created `com.jacobhl.hidescore` (acct `7809060308326519816`, $25 paid); ALL gating forms complete (privacy `hidescore.com/privacy`, data-safety=no data collected, content-rating, target-audience 13+, no-ads, open-access, gov/financial/health=no); store listing + screenshots done (copy from `~/nospoilerscores/PLAY_STORE_SUBMISSION.md`). **Ad-ID declaration = NO** (was the lone "send for review" blocker — verified safe: no `AD_ID` perm in merged release manifest, no ad/analytics SDKs). Tester list = Google Group `hidescore-testers@googlegroups.com` attached to "Closed testing - Alpha" track (countries=all 176+RoW). Release `1 (1.0)` created + confirmed + **SENT to Google for review 6/14** ("4 of 5 complete"; only "send" remained, now done). **Device verification DONE 6/11.** Signed AAB at `~/Downloads/HideScore-release.aab` (4.8M, versionCode 1; rebuild `cd android && export JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home && export ANDROID_HOME=/opt/homebrew/share/android-commandlinetools && ./gradlew bundleRelease`). ⚠️ every later upload must bump `versionCode`. ⚠️ Play App Signing re-signs → sideload-APK users can't update over the Play build (sig mismatch, must reinstall). _src: session_hidescore_android_app_build_2026_05_20_to_21.md; 6/10–15 this chat_

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

- [ ] **Picture-in-Picture (PiP) — opt-in Settings toggle.** Add Settings → Highlight video → "Allow Picture-in-Picture" (new pref `videoPiP`, default OFF, spoiler-safe). When on, expose a PiP button.
  > PiP needs a native `<video>`, so it only works on the HLS/MP4 clips (MLB direct / v.redd.it) — NOT the YouTube cross-origin iframe (browser PiP can't reach into it; would need a YouTube-API workaround that re-exposes their player). ⚠️ Spoiler caveat: a PiP window shows the **native scrubber + elapsed/duration** — the exact thing `controls:0` strips — which is why it must be explicit opt-in, not default. Scope: gate a PiP button on the native-`<video>` path behind `videoPiP` (`videoRef.current.requestPictureInPicture()`), thread the pref preferences→HomeContent→VideoModal like the other video prefs. _src: 2026-06-17 Jacob (wants it as a settings toggle, not dropped)_

- [ ] **MLB player option 1.** Force hls.js on Safari and drop subtitles for clean, Reddit-style controls.
  > Touch `VideoModal.tsx:133` (skip the native HLS branch), remove the CC button at `:332-342`. _src: project_hidescore_mlb_player_consistency.md_

- [ ] **FastCast pin.** Pin Real Fast + FastCast to the first two slots of the MLB videos strip.
  > New `fetchMLBPinnedRoundups()` in `scripts/prebake-news.mjs`, prepend before the `items.length >= 10` cap. _src: project_hidescore_mlb_fastcast_pin.md_

- [ ] **Post-R2 #1: NBC.com scraper.** Deep-link NBC broadcast chips to `nbc.com/watch/...` URLs.
  > New `scripts/scrape-nbc-sports.mjs` mirroring the prime-asins pattern. Edit `espn.ts:671`. _src: project_hidescore_post_r2_followups.md_

- [x] **Reddit news feeds DOWN — ✅ RESOLVED (verified 7/4: feeds fresh again via the RSS + redlib fallback; see the ✅ item in Top priority).** ~~anonymous endpoint now 403s the Mac-mini IP too; OAuth blocked by the banned account.~~ All r/* feeds stale since ~2026-05-28 17:09 (last good scrape). Up to then the Mac-mini residential IP could still hit unauthenticated `reddit.com/.../hot.json`; Reddit then started 403'ing it (the GHA IPs were already blocked since 4/27).
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

- [x] **Android app — Play Store vs stay-sideload — RESOLVED: "both in parallel" (6/10), device verified (6/11).** Sideload pill live; Play track active in the 📌 Pinned item at top.
  > Decision made 6/10: run both. Device verification done 6/11 on a borrowed Android phone (was the last account-level blocker). Remaining work = Play Console UI closed test — tracked in the 📌 Pinned item. Sideload at `hidescore.com/HideScore.apk` stays the working channel meanwhile. _src: session_hidescore_android_app_build_2026_05_20_to_21.md; 6/10–11_

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

- [ ] **🎛️ Custom control bar on the news/reddit video player — VERY LOW (cosmetic); skipped 6/17.** Port the highlights player's custom controls (styled mute + volume slider, ±5s skip, wrapper-fullscreen, CC) to the native-`<video>` news/reddit player, MINUS the spoiler bits (no title mask / `%`-jumps — news has no scores to hide, so keep a normal scrubber). **Solves:** visual consistency between the two players + ±5s on news clips. **Why low:** native `<video controls>` already works (scrubber/volume/fullscreen/CC all function) — polish, not a fix. **Cost:** ~300 lines; the control bar is hardwired to the YouTube IFrame API, so it'd need abstracting to also drive a `<video>` element — cleanest done as part of that control-bar work, not a separate fork. _src: 2026-06-17 Jacob — skip for now, log in case_

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

---

## 📜 Chat history (key transcripts — rolled up)

- **6/3 — mobile news font fix + FIRST full CLI TestFlight upload** (1.0.3 (7)) — memory `session_hidescore_mobile_news_font_testflight_2026_06_03` + `reference_hidescore_ios_testflight_cli`
- Raw transcripts archived permanently on the mini (`claude-transcript-archive`).
