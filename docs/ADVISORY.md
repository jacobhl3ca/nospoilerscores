# HideScore Weekly Advisory

> Prioritized product improvement proposals. Highest-impact items first.
> Each run prepends a new dated section; roughly the last 4 weeks are kept.

---

## 2026-09-02

### 1. Push Notifications for Game Starts & Live Events — **IMPACT: Very High | Effort: M**

**Why it matters:** The app's core promise is "watch without spoilers." Users currently have to remember to check HideScore *before* looking at social media. A "Game starting in 30 min" notification keeps them on the right path and drives daily active use better than any other single feature.

**Detail:** Capacitor already wraps both iOS and Android — native push is one plugin away (`@capacitor/push-notifications`). On web, the Push API works in Chrome/Edge without a native shell. A lightweight preference ("Notify me when: [my teams start] [any game goes to overtime] [game on my watchlist is about to start]") stored in existing prefs sync. Worker-side: a scheduled Cloudflare Cron Trigger reads upcoming slates and enqueues pushes ~30 min before kickoff via a push delivery service (e.g. Firebase FCM, which Capacitor supports, or OneSignal). The upcomingSlate infrastructure already partly exists. No new data sources required.

**Effort breakdown:** Capacitor plugin install + FCM credential setup (S), preference UI (S), server-side push dispatch cron (M), web push service worker integration (M). Total: ~M.

---

### 2. "My Teams" Dedicated View — **IMPACT: High | Effort: S**

**Why it matters:** Power users with favorites across 4–5 sports currently have to scan every column to find their teams' games. A "My Teams" pseudo-column — or a first-tab board that shows only games involving favorited teams, sorted by start time — turns the app into a personalized dashboard and dramatically reduces friction for the core returning-user loop.

**Detail:** All the data is already in memory. Favorite teams are tracked in `preferences.favoriteTeams`. A new view mode (4th tab: "⭐ My Teams") would filter across all fetched games, dedup by team, and render them in a single scrollable column with sport badges. No new fetches. Could also be the default for users who have ≥2 favorite teams — auto-surface on first launch after adding a 2nd favorite. The share-URL encoder already handles favoriteTeams, so custom setups remain shareable.

**Effort:** ~S. Mostly a filter + render pass over already-fetched data. UI tab addition + preference-aware default.

---

### 3. Watch Later / "Haven't Watched Yet" Persistence — **IMPACT: High | Effort: M**

**Why it matters:** The #1 accidental spoiler scenario is: user finishes watching a game, comes back to HideScore the next day to check other scores, and accidentally sees a "GREAT" rating badge or a score on a game they DVR'd. There's no way to tell HideScore "I haven't watched this yet — hold spoilers for this specific game."

**Detail:** A long-press or right-click on a game card opens a menu: "Mark as Watched" / "Add to Watch Later." Games on the Watch Later list stay in full spoiler-hide mode regardless of board-wide reveal state, and show a small bookmark icon. "Watched" dismisses the bookmark. The list is keyed by `gameId` (already present in ESPN data), stored in prefs (synced cross-device), and auto-expires entries older than 7 days. Pairs naturally with the push-notification feature: "You have 2 unwatched games from yesterday."

**Effort:** ~M. Requires per-game state persistence, new card interaction (long-press/right-click menu on GameCard), and a minor prefs schema extension.

---

### 4. 7-Day Schedule / "Games This Week" View — **IMPACT: High | Effort: M**

**Why it matters:** Today/Tomorrow navigation is the full extent of forward visibility. Sports fans plan their week — they want to know "is there an NBA game on Thursday I need to avoid Twitter for?" A weekly schedule view, spoiler-free (shows matchups and times but hides past scores), addresses this directly and adds SEO value ("nba schedule this week without spoilers").

**Detail:** ESPN's scoreboard API accepts any date offset. Extend DateNav to support a "This Week" calendar strip (7 small day pills, Mon–Sun) in addition to the existing yesterday/today/tomorrow pills. Tapping a future day fetches that day's schedule — no scores to hide yet, just matchups and start times. Past days show scores hidden (same as today). The calendar dropdown already exists; surface it inline as a strip. Week view could also be a shareable URL (`/week` or `?week=2026-09-01`).

**Effort:** ~M. Fetch layer change is small; UI requires a responsive 7-day strip that works on mobile (horizontal scroll) and doesn't crowd the existing DateNav.

---

### 5. PWA Install Prompt for Desktop (Chrome / Edge) — **IMPACT: Medium-High | Effort: S**

**Why it matters:** The Play Store badge drives Android installs, and the Apple Smart App Banner drives iOS installs. There is no install nudge for desktop Chrome/Edge users, who can install HideScore as a PWA and get it in their taskbar/dock. These users are likely high-intent (they keep a browser tab open all season). PWA install drives repeat visits and eliminates tab-close churn.

**Detail:** Listen for the `beforeinstallprompt` event (already suppressed by default in Chrome). Show a subtle banner or the ⚙️ settings footer button: "Add HideScore to your desktop." Store the deferred prompt, call `.prompt()` on click. Add a `manifest.json` if not present (or verify the existing one has `display: "standalone"`, correct `start_url`, icons). One-time dismissal stored in localStorage. The existing "play badge dismissed" pattern in prefs is a template for the dismiss UX.

**Effort:** ~S. ~50 lines of JS + manifest check. No backend work.

---

### 6. Score Reveal Animation — **IMPACT: Medium | Effort: S**

**Why it matters:** The core "reveal" moment is the emotional heart of the product. Right now it's presumably an instant show/hide. A 300ms blur-dissolve or card-flip animation makes the reveal feel intentional, satisfying, and premium — differentiating HideScore from a browser extension that just hides elements.

**Detail:** When `scoreRevealed` transitions false→true on a `GameCard`, animate the score container: `filter: blur(8px) → blur(0)` with a 250ms ease-out, combined with a scale from 0.95→1.0. For the ratings view (GREAT/GOOD/MEH/SKIP badge), fade-in the badge from opacity 0. Use CSS transitions (Tailwind `transition-all duration-300`). Optionally add a subtle haptic via the Capacitor Haptics plugin on mobile (one light tap on reveal).

**Effort:** ~S. Pure CSS/Tailwind transition additions + one Capacitor haptic call. Totally non-breaking.

---

### 7. Playoff/Standings Context on Game Cards — **IMPACT: Medium | Effort: S–M**

**Why it matters:** "Team A vs Team B" has very different stakes depending on whether it's a regular-season throwaway or a must-win for a playoff spot. Showing "GB: 2.0 WC" or "🔥 Must-win (8th seed)" on the card subtitle would help users prioritize which games to watch without revealing scores.

**Detail:** Standings data is already fetched per league (W-L record, overall rank `#N`). Extend this fetch to include games-back-from-playoffs (ESPN's standings API includes this). Show a small contextual chip on game cards for high-stakes games: "Elimination game," "Clincher," "Series tied 2-2." For playoff series specifically, ESPN's scoreboard already returns series status — surface it on the card subtitle below the matchup. No additional API calls needed; it's already in the payload.

**Effort:** ~S to surface series status (already in payload); ~M to add games-back standings context (one extra standings endpoint field).

---

### 8. NFL Highlights — Partial Recovery via Team Channels — **IMPACT: Medium | Effort: S**

**Why it matters:** NFL highlights are blocked league-wide from the official NFL YouTube channel, which is why the homepage title omits NFL. However, many individual team YouTube channels post shorter clips (big plays, press conferences, "Top 5 moments") that are not blocked. Also, NFL Films and NFL Network post condensed games on their channels. A curated list of 32 team channel IDs + NFL Films would surface something where currently nothing appears.

**Detail:** Add 32 NFL team channel IDs to the `YOUTUBE_CHANNELS` map (currently has NBA, MLB, NHL entries). The highlight search query already runs per sport; per-team channel targeting via `channelId` parameter increases precision. NFL Films channel (`UCJObhbqrNJmEn9k-ncl3nFg`) posts full condensed games. The spoiler regex already filters title text — apply it to NFL too. Set user expectation with a small disclaimer chip: "Clips from team channels — limited availability." This won't match the NHL/NBA experience but is better than nothing for NFL's 50M+ fans.

**Effort:** ~S. 32 channel ID entries + enabling the YouTube search path for NFL (it may be conditionally skipped today).

---

### 9. Accessibility — Keyboard Navigation & Screen Reader Labels — **IMPACT: Medium | Effort: M**

**Why it matters:** The spoiler-reveal interaction (tap to reveal) is the core mechanic but it's currently built on div/button taps. Screen reader users and keyboard-only users have a degraded experience. WCAG 2.1 AA compliance is also increasingly expected for app store listings and B2B/enterprise contexts.

**Detail:**
- Every `GameCard` reveal target should have `role="button"`, `aria-label="Reveal score for [Team A] vs [Team B]"` (pre-reveal) / `aria-label="Score: hidden" aria-pressed="false"` (post-reveal). Screen readers should announce the reveal result.
- `tab` navigation should reach all interactive elements: date pills, league switcher, settings toggle, score reveal, video buttons.
- The video modal needs `aria-modal="true"`, `role="dialog"`, and focus trapping.
- Color contrast: verify that rating badge colors (GREAT/GOOD/MEH/SKIP) meet 4.5:1 contrast ratio on both dark and light themes.
- Run `axe-core` as part of the Playwright test suite (single new test file) to catch regressions.

**Effort:** ~M. Systematic audit + fixes across GameCard, VideoModal, and SettingsPanel. New axe-core Playwright spec.

---

### 10. Spoiler Regex Single-Source-of-Truth — **IMPACT: Medium (DX) | Effort: S**

**Why it matters:** `SCORE_RX` and `SPOILER_RX` are duplicated between `lib/spoilers.ts` and `public/_worker.js`, with a code comment noting they must stay in sync manually. A divergence silently breaks either client-side or server-side spoiler filtering — the kind of bug that's nearly impossible to catch in testing.

**Detail:** The Cloudflare Worker can import from the Next.js source via a build step, or the regex patterns can be extracted into a standalone JSON/JS file (`lib/spoiler-patterns.json`) that is imported by both `lib/spoilers.ts` and bundled into `_worker.js` via esbuild. Add a unit test that imports both and asserts `spoilers_client.SCORE_RX.source === spoilers_worker.SCORE_RX.source`. This is a DX/reliability improvement that prevents future regression.

**Effort:** ~S. Requires understanding the worker's build pipeline, but the change itself is small.

---

### 11. Personalized "For You" News Feed — **IMPACT: Medium | Effort: M**

**Why it matters:** The News tab currently shows all sources for the active leagues. Users with 3–5 leagues get an undifferentiated firehose. Filtering news to "sources about my favorited teams only" would make the News tab 5× more relevant for returning users.

**Detail:** When `favoriteTeams` is non-empty and the user is in News mode, add a toggle chip at the top of each news column: "All / My Teams." "My Teams" filters the feed to only stories containing any favorited team name or abbreviation (simple string match against headline + source team tag). Default stays "All" to preserve current behavior. The filter runs client-side on already-fetched news data — no API changes needed.

**Effort:** ~M. Client-side filter + toggle chip UI + preference to remember the selection per column.

---

### 12. "Share This Game" Deep Link from Game Card — **IMPACT: Low-Medium | Effort: S**

**Why it matters:** Users want to send "hey, watch this game tonight" to friends. The existing share-link encodes the full board setup, but there's no way to share a single game or matchup. A per-game share action would surface HideScore to new users via a "game preview" link that loads with that game highlighted.

**Detail:** Add a share icon (chain link) to the three-dot overflow menu on `GameCard`. It copies `https://hidescore.com/today?game=<gameId>` (or the date-specific URL). On load, the board auto-scrolls to and highlights the referenced game card. The pre-baked OG card (`/cards/<key>.png`) already exists for matchup previews — use it as the OG image for the share URL. No backend work beyond URL param parsing.

**Effort:** ~S. URL param reading + scroll-to-game on mount + share clipboard action.

---

*Previous sections will be appended here as the advisory runs weekly.*
