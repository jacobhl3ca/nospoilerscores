# HideScore — Weekly Advisory

Auto-generated proposals. Cherry-pick what fits; nothing here changes app code.

---

## 2026-07-22 — Post-WC lull + fall sports on deck

**Context this week:** World Cup 2026 finished 7/19 (3 days ago). NFL Preseason opens today. EPL returns 8/16 (25 days). NCAAF starts 8/22, NFL regular season 9/4. The site is in its quietest traffic window of the year — ideal for the structural work that's been deferred while the WC was live.

---

### 1. Reddit OAuth creds — unlock comments + news feeds now (Effort: S)

**Why it matters:** Comments are fully built and waiting behind a single 2-minute registration step (`reddit.com/prefs/apps → script app type`). Once `client_id` + `secret` land in `~/.config/hidescore/reddit.env` and are sourced in the cron, three things unlock at once: (a) Reddit news feeds re-enable for MLB, NBA, NFL, NHL, and soon EPL; (b) the blurred tap-to-reveal comments in Feed view go live; (c) the r/soccer firehose column (already wired for EPL/UCL/UEL) starts populating 25 days before the EPL opener, which is prime time to build the habit with soccer fans.

**Detail:** Register a "script" type app — no posting permissions needed, just public-sub reads. The OAuth path (`oauth.reddit.com`) bypasses the 403s that block the anonymous residential IP. The `fetchReddit`/`prebake-news.mjs` code is already written. The blocked-account situation doesn't affect a new app registration.

**Do this week.** Every day of delay is news cards the news view can't fill.

---

### 2. Mobile column layout overhaul — 2-column or horizontal-scroll (Effort: M)

**Why it matters:** At 390px, the 3-column board gives each column ~100px — too narrow to show DOW + time + network on one row, too narrow for team names without truncation. This is the site's biggest UX problem on phones, which is where most casual sports fans check scores. The backlog has tabled this twice; the post-WC lull (low-traffic, no time-sensitive WC column) is the right window to ship a breaking redesign without it landing on a busy day.

**Recommended approach:** Horizontal-scroll columns — each league column gets `min-width: 160px`, the row overflows horizontally, and the user swipes to reach the 3rd column. It keeps all leagues in view spatially without reducing what each card can show. A momentum-scroll snap between columns makes the swipe feel native.

**What it unlocks:** Time alignment across cards (currently impossible at 3 columns), full team names without abbreviation, a wider network-chip tap target (Jacob's noted complaint), and a more comfortable card body for future features (score-bug mask, series status, etc.).

---

### 3. Post-WC evergreen archive page `/worldcup/2026` (Effort: S/M)

**Why it matters:** The tournament finished 3 days ago. Right now `"2026 World Cup results"`, `"World Cup 2026 highlights"`, and `"2026 World Cup bracket"` are being searched in volume. HideScore has spoiler-free ratings for every WC game and video highlights — no competitor combines those. A permanent `/worldcup/2026` page (static, no expiry) that lists all 104 matches with their game-quality ratings and links to highlights would rank for this long tail for years. The WC hub page and bracket component are already built; this is mostly a static render of the data.

**Detail:** Bake the final bracket + all group stage / knockout scores + ratings into a static JSON at build time. The page can reuse `WorldCupBracket` and `GameCard` in a read-only/archive mode. Add a canonical link and OG title "2026 FIFA World Cup Results & Game Ratings — No Spoilers". The "no spoilers" angle is unique: other archive pages show scores by default; HideScore hides them until tapped.

---

### 4. La Liga, Bundesliga, Serie A — add as swap-only options (Effort: S)

**Why it matters:** The WC showcased international soccer to US fans. La Liga, Bundesliga, and Serie A all start around Aug 15–23 — the same window as EPL. Adding them as `excludeFromAuto` swap options (selectable from the slot-3/4 dropdown in Settings, never auto-picked) costs almost nothing (each is a 2-line `LeagueConfig` entry + an ESPN scoreboard path) but lets soccer fans who want to track their club follow it on the same spoiler-safe board they used all WC. It also becomes an SEO-able settings share URL (`hidescore.com/?l=...`).

**Exact sports paths to add:**
- La Liga: `/soccer/esp.1/scoreboard`
- Bundesliga: `/soccer/ger.1/scoreboard`
- Serie A: `/soccer/ita.1/scoreboard`
- Ligue 1: `/soccer/fra.1/scoreboard`

These paths already exist in ESPN's API (same pattern as `epl`/`mls`). Season windows: La Liga ~08-15 → 05-24, Bundesliga ~08-22 → 05-17, Serie A ~08-23 → 05-25, Ligue 1 ~08-08 → 05-24.

---

### 5. "Surprise me" classic-game discovery feature (Effort: M)

**Why it matters:** The post-WC dead zone (and any off-season) is when users want passive entertainment, not live scores. A "Surprise me" button that surfaces a randomly-selected high-rated past game (rating ≥ 85, sport matches the user's favorite leagues) gives HideScore a retention hook no competitor has. The user gets a spoiler-free classic to watch — they see a game card with the rating badge, the teams, and a "Watch highlights" button, but no score until they choose to reveal it. Mentioned in the optimal-improvements audit as a new idea.

**Detail:** The simplest version is a static pre-baked JSON of curated great games per league (50–100 per sport) served from R2. A "Surprise me" button in the date-nav or settings panel picks a random one weighted toward the user's favorite leagues and shows it as a modal game card. Could also be the basis for a `/classics` route with SEO value ("best NBA games ever", etc.).

---

### 6. EPL/NCAAF/NFL fall-season column QA (Effort: S)

**Why it matters:** EPL starts 8/16, NCAAF 8/22, NFL 9/4. The league config has all three wired, but after a summer of soccer/golf/WC edge cases, the auto-pick logic and column-header rendering should be tested before fans start checking daily.

**Items to verify before 8/16:**
- EPL auto-picks when active and no higher-priority sport is running (currently MLS is the only active soccer league)
- NCAAF doesn't displace NFL Preseason in a way that leaves the center slot awkward
- The 5-column wide-board layout assigns EPL/NCAAF/NFL to sensible slots simultaneously
- The news r/soccer firehose card correctly annotates EPL posts (already wired per the 7/20 commit, but worth a live check on match day)
- `matchupLabel` / `playoffLabel` for EPL match weeks renders correctly (not "Playoff" for regular season)

---

### 7. Score-bug mask in the video player (Effort: M)

**Why it matters:** HideScore already masks the YouTube title strip (top) and the player's bottom chrome. But the biggest remaining spoiler in highlight clips is the broadcast SCORE BUG — the live-score overlay baked into the footage itself (top-left corner typically). Users who want a completely spoiler-free highlights experience still see `SEA 3 — HOU 1` in the corner of the clip before they're ready. A CSS overlay targeting the broadcast score-bug region (typically a fixed top-left rectangle, ~10% width × 6% height) would complete the spoiler safety story for highlights.

**Detail:** The overlay would be a semi-transparent colored block (matching the video background) rendered over the embed, togglable via a new `maskScoreBug` pref (default: off, since it's position-sensitive and may cover other content). In the VideoModal, a "Mask score bug" toggle next to the existing title/bottom toggles in Settings. Start with the broadcast score-bug position typical of ESPN/NBC/CBS (top-left); offer a "right corner" option for Fox broadcasts.

---

### 8. Season-start teaser: "Coming soon" column state (Effort: S)

**Why it matters:** When a user checks HideScore in the week before a new season opens, the league column shows "No games today" — a dead end. An upcoming-season preview state for known start-date leagues would replace the empty column with something engaging: "NFL Preseason opens in 3 days", a countdown, and the first week's matchup slate if available. Low effort because the `startDate` already lives in `LeagueConfig`; it's a UI layer on the empty-column path.

**Detail:** When a league's `startDate` is within 7 days and the column would otherwise be empty, render a "Season preview" card with the league logo, days-to-go countdown, and a teaser of the first week's marquee matchup (from the ESPN API's lookahead). This surfaces naturally in the current "next game day" logic — extend the lookahead window when within the 7-day pre-season window.

---

### 9. Accessibility: focus trap + keyboard nav in all modals (Effort: S)

**Why it matters:** `VideoModal`, `GameDetailModal`, and `SettingsPanel` don't trap focus — a keyboard user tabbing through the modal will escape into the background. This is a WCAG 2.1 AA failure (2.1.2 — No Keyboard Trap is the rule, but the issue here is the inverse: focus escapes). Reported as a Sentry-visible edge case via the accessibility tree; screen-reader users also lose their place when modals open without an `aria-modal` container.

**Detail:** Each modal needs: (a) `role="dialog"` + `aria-modal="true"` + a descriptive `aria-labelledby`; (b) focus moved to the modal's first focusable element on open; (c) a `FocusTrap` utility (100 lines of vanilla JS, no library needed) that constrains Tab/Shift+Tab to the modal's children; (d) Escape key closes. The `SettingsPanel` already uses a drawer ref — focus trap wraps around it.

---

### 10. App-clip / instant app for "check today's scores" (Effort: L)

**Why it matters:** iOS App Clips and Android Instant Apps let users experience the core of an app without a full install. For HideScore the core loop is "check today's scores, spoiler-free" — a perfect App Clip: tiny, single-purpose, fast. A user who gets texted a HideScore share link opens a full-screen scores view instantly, no install gate. If they love it, one tap installs the full app. This would be the most friction-free acquisition path for new users referred by existing ones.

**Detail:** An App Clip targets a max of 15 MB. The scores board (today's games, 3 leagues, no auth, no news) comfortably fits. The Clip's associated domain is already set up for hidescore.com (universal links). The main App Store app already exists; an App Clip is a new Xcode target pointing at the same codebase with a reduced feature set. Android Instant App is a similar split-module build from the Capacitor project.

---

*Previous advisory sections will appear below as they accumulate.*
