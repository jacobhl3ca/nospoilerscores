# HideScore — Weekly Product Advisory

> Auto-generated each week. Newest section first; roughly 4 weeks retained.
> Proposals only — no app code changed.

---

## 2026-07-15

**Context this week:** World Cup 2026 enters its final four days (semis/finals, through July 19). News feed shipped July 14. Telemundo Spanish highlights fixed. Reddit comments are built but dark, waiting on OAuth creds. F1/UFC cards still hidden. iOS/Android apps trailing web by several releases.

---

### 1. Execute the WC marketing push — the window closes July 19
**Why it matters:** The `MARKETING_LAUNCH_POSTS.md` + `MARKETING_VIDEO_SCRIPTS.md` drafts are sitting in `~/hidescore-backlog/worldcup-marketing/` fully written, but the marketing push was flagged for pre-kickoff (June 8–11) and has not gone out at scale. Four days remain: semis on July 15 and 16, third-place July 19, final July 19. The final is the single highest search-traffic soccer moment in four years. HideScore is live, the WC hub (`/worldcup`) is live, Telemundo fallback just shipped — the product is ready. This is the one-time window.  
**Effort:** S (copy and assets already written, just needs to be posted)  
**Action:** Post the Show HN + Product Hunt threads now (best timing: Tue–Thu ~9am PT). Have Emilio post at least one of the five video scripts on IG/TikTok before the final. Submit the r/soccer / r/worldcup posts if the Reddit ban appeal has cleared (never ban-evade — confirm status first). Point everything at `/worldcup`.

---

### 2. Register a fresh Reddit OAuth app — unlocks news comments and feeds in one step
**Why it matters:** The comments feature is fully built and blurred in the Feed view, but it silently serves nothing because `prebake-news.mjs` has no creds. The Reddit feeds themselves (also showing nothing) are blocked by the same missing step. Both unblock with one two-minute action: go to `reddit.com/prefs/apps` on any working account → create a "script" app → drop the client ID + secret into `~/.config/hidescore/reddit.env` on the Mac mini → source it in `hidescore-reddit-cron.sh`. App-only OAuth (`grant_type=client_credentials`) reads public subreddits — no posting, no good standing needed. The banned account is unrelated; create a new one.  
**Effort:** S (15–30 minutes total)  
**Action:** Register app, drop creds, restart cron, verify the feed populates on the next hourly prebake.

---

### 3. Convert the WC audience into a year-round soccer audience before July 19
**Why it matters:** La Liga (Spain) starts August 15, Bundesliga August 22, EPL August 9. Users arriving for the WC are the exact audience for European club soccer. The window to capture their preferences is while they're active.  
**Effort:** M (3 new SEO landing pages + league config additions)  
**Action:** Add `/la-liga-scores-without-spoilers`, `/premier-league-scores-without-spoilers`, `/bundesliga-scores-without-spoilers` using the same `SeoLandingPage` template. Wire `soccer/esp.1` (La Liga), `soccer/eng.1` (EPL), `soccer/ger.1` (Bundesliga) into the league config alongside MLS (already present). The infrastructure is identical to the MLS add — just new ESPN endpoint strings and a new switcher entry per league. Do not show all three simultaneously; use the existing priority-pool logic so the most relevant one auto-selects. Publish these pages before La Liga kickoff for a 3-week SEO lead.

---

### 4. Mobile 2-column layout — the core UX blocker on phones
**Why it matters:** At 390px the three-column board gives each column ~100px. Bold day-of-week + time + network + team names can't fit; cards truncate visibly and the backlog explicitly names this as a physical conflict. The existing BACKLOG entry ("2-up or horizontal-scroll") has already identified the right options. With WC traffic arriving on phones in peak numbers right now, this is the highest-reach UX fix.  
**Effort:** L (real layout change, touches `HomeContent.tsx`, column sizing, date nav centering)  
**Recommendation:** Horizontal-scroll columns (each ~160px min-width) is the lowest-risk approach — it preserves the "all leagues at a glance" mental model, doesn't hide leagues, and is a CSS-level change at the column container. 2-up with a swipeable 3rd column is cleaner but requires gesture handling. Decide the direction, then unblocks mobile time alignment, tap targets, and the chip layout.

---

### 5. Redesign `EventCard` to match `GameCard` and re-enable F1 + UFC
**Why it matters:** F1 is mid-season (races roughly biweekly through November). UFC holds events most Saturdays. Both are hidden behind `hidden: true` in `ALL_LEAGUES` because `EventCard.tsx` doesn't match the card chrome. The data and ESPN endpoints are intact — the entire block is the visual mismatch.  
**Effort:** M (redesign `EventCard` to match spacing, header, spoiler treatment of `GameCard`)  
**Action:** Style `EventCard` to use the same card shell as `GameCard` (border radius, padding, header bar, monochrome spoiler state). For F1: podium row (P1/P2/P3) in place of Away/Home. For UFC: main event bout at top, undercard count below. Once visually aligned, flip `hidden: false` on both entries in `espn.ts`. Then add `/f1-results-without-spoilers` and `/ufc-results-without-spoilers` SEO pages for the organic lift.

---

### 6. Add a homepage H1 / sr-only tagline — cheap SEO fix
**Why it matters:** `/` has no `<h1>` and no prerendered body copy since the intro section was removed (commit `a4f4cebc`). Crawlers see only meta tags and JSON-LD. This is already flagged in the backlog as a watch item, and GSC rows should be checked. An sr-only `<h1>` costs zero visual debt and is a 15-minute fix.  
**Effort:** S  
**Action:** In `HomeContent.tsx`, add `<h1 className="sr-only">HideScore — Spoiler-Free Sports Scores &amp; Highlights</h1>` at the top of the render tree, before the header. If a visible tagline tests well, elevate it. Also check GSC for the homepage row — if impressions dipped after `a4f4cebc`, this is the first fix to ship.

---

### 7. Internal links from the app to SEO landing pages — build link equity
**Why it matters:** The six new SEO pages (`/nba-scores-without-spoilers`, `/nhl-scores-without-spoilers`, `/mlb-highlights-without-spoilers`, `/nfl-highlights-without-spoilers`, `/soccer-highlights-without-spoilers`, `/no-spoiler-scores`) exist in the sitemap but have zero in-app inlinks. Google weights internal links heavily for page authority; pages discoverable only via sitemap rank worse than pages with real navigation paths.  
**Effort:** S  
**Action:** Add a minimal "About / More" section to `SettingsPanel.tsx` or the footer with links to these pages (labelled by sport). Alternatively, add a discreet footer row: "NBA · NHL · MLB · NFL · Soccer — spoiler-free." This simultaneously resolves the orphaned `/faq` and `/privacy` issue (also noted in backlog).

---

### 8. VideoModal: autoplay-aware spoiler-reveal overlay
**Why it matters:** MLB's official YouTube channel bakes results into thumbnails ("Complete Game Shutout!", "Walk-off!"). When autoplay is blocked (common on mobile Safari), the thumbnail is visible before the user taps play — spoiling the game. The refined plan is already spec'd in the backlog: detect autoplay block via Promise rejection (HLS) or iframe state-change timeout (YouTube), then show the overlay only when blocked.  
**Effort:** M (the reverted code at `5131079f` is the starting reference)  
**Action:** Implement the autoplay-detection path per the backlog spec. HLS: `videoRef.play().catch(() => setOverlay(true))`. YouTube: `autoplay=1` + onStateChange watch — if state stuck at -1 after 500ms, show overlay. Hide the rendered thumbnail and headline while overlay is active. This is especially impactful for MLB and WC (FOX thumbnails also include score graphics).

---

### 9. "Not affiliated" disclaimer in footer/About — before wider marketing reach
**Why it matters:** The marketing push (item 1) will widen reach significantly. An implied-endorsement risk from ESPN/MLB/league logos is cheap to mitigate with one footer line. Names (nominative fair use) are safer than logos; a one-line disclaimer is industry-standard protection.  
**Effort:** S  
**Action:** Add to the footer: "Not affiliated with or endorsed by ESPN, MLB, NHL, NBA, WNBA, FIFA, or any league or team." Keep it small (`text-xs text-muted`). Pair with adding `/privacy` and `/faq` to the footer (also orphaned).

---

### 10. WC bracket view (knockout stage) — gated behind monkey toggle
**Why it matters:** The WC is in the knockout final rounds, when the bracket is what fans most want to see. The `BracketModal` component is built on a branch; the open question was "how to show series scores spoiler-safely." The cleanest answer: show matchup + team names, hide all scores behind the same monkey-reveal toggle already used on game cards. A spoiler-gated bracket is high-value for the remaining 4 days of the tournament and evergreen for future knockout sports.  
**Effort:** M (wire existing `BracketModal` with score-gating, then merge)  
**Action:** In `BracketModal.tsx`, wrap score/outcome cells with the monkey-reveal pattern (show/hide based on `monkeySpoilerMode` pref). The matchup names and bracket structure are never spoilers. Then merge the `bracket-modal` branch and surface a bracket button in the `WorldCup` hub header.

---

### 11. Web push notification opt-in for match alerts
**Why it matters:** HideScore has a PWA service worker (`sw-v11.js`) already registered. Web Push is the one retention mechanism missing — a user who opts in can be notified "World Cup final starts in 15 min" and comes back at exactly the right moment. This is especially high-value for casual fans who forget to check.  
**Effort:** M (service worker push subscription + a small notification API + a server-side push trigger)  
**Action:** Add a `Notification.requestPermission()` prompt tied to the user explicitly opting in (e.g. a "Notify me for WC matches" button on the `/worldcup` hub). The subscription endpoint goes to a Cloudflare Worker; the Mac mini cron triggers push ~15 min before each match. Use `web-push` npm package on the Worker side. This pairs naturally with the existing Mac mini cron infrastructure.

---

### 12. App Store review prompt — capture WC traffic while sentiment is high
**Why it matters:** HideScore's App Store rating affects search ranking and conversion for the iOS app. The WC final is the emotional peak for sports fans — people who just watched a classic match spoiler-free are at maximum satisfaction. That's the moment for a prompt.  
**Effort:** S (Capacitor has `@capacitor-community/rate-app` or use native `SKStoreReviewController`)  
**Action:** After a user watches 3+ highlight clips in a session, call `SKStoreReviewController.requestReview()` (native, non-interruptive — Apple controls frequency). Gate on: at least 3 sessions, at least 3 highlights played, not yet prompted this version. Target this for the WC final window before July 19.

---

### 13. Post-WC: Add La Liga, EPL, Bundesliga to league-switcher dropdown
**Why it matters:** After July 19 the WC column disappears and users who came for soccer have nowhere to go. The `MLS` column currently auto-fills the soccer slot. European leagues have larger global audiences and run August–May. Letting users pin `La Liga` or `EPL` in the 3rd/4th slot closes a significant gap vs ESPN.  
**Effort:** S per league (ESPN endpoint strings already known: `soccer/esp.1`, `soccer/eng.1`, `soccer/ger.1`)  
**Action:** Add to `ALL_LEAGUES` in `espn.ts`. Use the existing soccer season-window logic. Surface in the column switcher under a "Soccer" group header. Pair with SEO landing pages per item 3.

---

### 14. "Highlight length" toggle — start with MLB
**Why it matters:** MLB is the sport with the most distinct highlight lengths: ~1-min cut vs ~5-min condensed game vs ~15-20-min full recap. The toggle is in the backlog but its value is highest for MLB (more distinct options than other sports). Users who DVR and want a quick recap vs a full digest have very different preferences.  
**Effort:** M (new length selector on MLB `GameHighlights`, search query parameterization)  
**Action:** Add "Short / Condensed / Full" toggle to `GameHighlights.tsx` for MLB only. Short = current default cut. Condensed = prepend "condensed" to the query. Full = "extended" or "full game" query variant. Persist as a pref (`mlbHighlightLength`). Good upsell hook if a Pro tier is ever added.

---

### 15. Spoiler-free "game of the day" email / daily digest
**Why it matters:** Retention for casual fans is the hardest problem. The core use case ("I'll check what games are on tonight") works, but there's no pull mechanism to bring people back when they forget. A spoiler-free daily digest email ("Tonight: 4 NBA games including one projected thriller") is the lowest-friction re-engagement channel.  
**Effort:** L (email list infra, template, unsubscribe, CAN-SPAM/GDPR handling)  
**Action:** Start with a simple opt-in landing page + a single automated email: "Here are tonight's games, scores hidden." Use Cloudflare Worker + an email provider (Resend or Postmark free tier). Highlight the top-rated predicted game (by record/rating) with scores blurred. This is the most natural complement to the World Cup marketing push — capture emails during peak traffic, then keep those users engaged post-WC.

---

*End of 2026-07-15 section.*
