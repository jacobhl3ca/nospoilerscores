# HideScore — Weekly Product Advisory

---

## 2026-08-19

### Summary
HideScore has exceptional core mechanics — spoiler-safe scores, quality ratings, and highlight masking — running on a lean, fast static stack. The biggest near-term leverage is **distribution** (Android public launch, push notifications, viral sharing) and **retention** (personalized daily digest, alerts on favorite teams). The World Cup 2026 window is an enormous SEO/traffic event that should be milked hard. Below are proposals ranked by impact.

---

### 1. Launch Android publicly on the Play Store _(Impact: HIGH | Effort: S)_

**Why it matters**: The Play Store badge is commented out in `HomeContent.tsx` — the listing exists in closed testing but no one can find it organically. iOS has a full App Store listing and JSON-LD `MobileApplication` schema. Android gets neither, leaving a large audience untapped and the existing Capacitor work sitting idle.

**Detail**: Promote the closed test to production, uncomment the badge, and add an `android` node to the `MobileApplication` schema alongside the iOS node. The Capacitor shell already points to `hidescore.com` so every push to `main` is effectively already shipping to Android users — the only blocker is the store listing itself.

---

### 2. Push notifications: "Game worth watching" alerts _(Impact: HIGH | Effort: M)_

**Why it matters**: Users open the app *hoping* a great game happened. Push notifications let HideScore reach them *before* they accidentally see a score elsewhere — which is the entire product promise. The service worker (sw-v15.js) is already installed, so the browser infrastructure is there.

**Detail**: Add a `subscribe-to-alerts` setting that lets users opt into end-of-game pushes for their favorite teams or leagues. Payload: "Lakers game last night: ⭐ GREAT (no score). Worth watching!" The push logic could live in the existing Cloudflare Worker since it already runs cron-adjacent work. Opt-in only, one push per finished game per user.

---

### 3. Personalized "Worth watching tonight" digest email _(Impact: HIGH | Effort: M)_

**Why it matters**: Email is a habit-forming re-engagement loop. The quality rating data + favorite team prefs are already computed; the only missing piece is a delivery mechanism. Users who sign in (Apple/Google/email) already have an email address.

**Detail**: Nightly email (sent ~11 pm local time based on stored timezone pref) listing today's finished games with quality badges but no scores. Subject line: "3 GREAT games from last night — spoiler-free." One-click unsubscribe, no third-party ESP required if sending via Cloudflare Email Workers. Start with opt-in at sign-in time.

---

### 4. "Game of the Day" pinned card _(Impact: MEDIUM-HIGH | Effort: S)_

**Why it matters**: After a big day of games, finding the best one requires scanning all columns. A single pinned "Game of the Day" card surfaced above the columns — showing only the rating badge and matchup, no score — gives casual visitors immediate value and a clear CTA to reveal and watch.

**Detail**: Add a `pinned` banner section between the DateNav and the column grid. Show the highest-rated finished game. On mobile single-column layout this is especially valuable since users can't see all columns at once. Collapse it with a chevron for users who prefer the existing layout.

---

### 5. World Cup 2026 — capitalize on the traffic window _(Impact: HIGH | Effort: M)_

**Why it matters**: The 2026 FIFA World Cup runs June 11 – July 19, 2026 in North America (US, Canada, Mexico). It is the single largest sports-viewing event in the world and a generational opportunity: the host-country audience is massive and largely unfamiliar with the sport, meaning they will be searching for exactly what HideScore offers. The `/worldcup` page already exists.

**Detail**:
- Add 3–5 more targeted SEO landing pages: `/world-cup-2026-scores`, `/watch-world-cup-highlights-without-spoilers`, `/fifa-world-cup-spoiler-free`. Use FAQ schema and team/matchup structured data.
- On the `/worldcup` hub, surface the Group Stage / Knockout bracket prominently (already partially built per the codebase) with team flags.
- Add `WorldCup2026` JSON-LD `Event` markup on the hub page.
- Consider a dedicated email capture ("Get spoiler-free WC alerts") for the months before the tournament to build a list.

---

### 6. Safari/WebKit testing parity _(Impact: MEDIUM-HIGH | Effort: M)_

**Why it matters**: The iOS native app loads `hidescore.com` in a WKWebView, which is WebKit. Multiple BACKLOG entries confirm the 2026-08-04 onboarding, modal bars, and empty-state card have never been verified on WebKit. Bugs here affect every iOS App Store user.

**Detail**: Expand Playwright tests to include a WebKit browser target (Playwright ships `webkit` out of the box — no new install needed since `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1`; just add `{ name: 'webkit' }` to `playwright.config.ts`). Add smoke tests for: onboarding flow at 390×844 (iPhone 14 viewport), GameDetailModal open/close, VideoModal seek-cap behavior. Run these in the existing `smoke.yml` GHA step.

---

### 7. Viral sharing — spoiler-safe "matchup card" share flow _(Impact: MEDIUM | Effort: S)_

**Why it matters**: The `hidescore.com/?c=<key>` share link already generates an OG matchup card PNG (via CI, stored in R2) that unfurls cleanly in iMessage and Slack without revealing the score. But there is no prominent "Share this game" UI affordance in the main game card — only in the VideoModal. Users who haven't opened a highlight don't see a share button at all.

**Detail**: Add a share icon (sheet icon, not a link icon) to every finished GameCard. On tap, copy the share link to clipboard and show a brief "Link copied — spoiler-free!" toast. On iOS/Android, use the native Web Share API (`navigator.share`) when available so it drops into the native share sheet. This turns every finished game into a low-friction sharing moment.

---

### 8. Reddit OAuth for in-app comments _(Impact: MEDIUM | Effort: S)_

**Why it matters**: The comments UI is built but silently produces no content because the Mac mini doesn't have Reddit OAuth credentials configured. Post-game Reddit discussion is one of the highest-value, most-engaged content types for sports fans. It's effectively a free engagement feature sitting dormant.

**Detail**: Register a Reddit script app at `reddit.com/prefs/apps` (read-only scope is sufficient), set `REDDIT_CLIENT_ID` + `REDDIT_CLIENT_SECRET` on the Mac mini cron environment, and verify the `NWSL`, `NASCAR`, and `IndyCar` feeds produce baked JSON. Add a monitoring step to the `staleness-check.yml` GHA to alert when a news feed has been empty for >24 h.

---

### 9. Patch Dependabot vulnerabilities _(Impact: MEDIUM | Effort: S)_

**Why it matters**: 4 open Dependabot findings — 3 high-severity `postcss` and 1 high-severity `sharp` — all from Next.js transitive dependencies. The `output: "export"` mode means the production server is safe, but CI pipelines and local dev environments are exposed. More importantly, unaddressed security advisories create noise that obscures real new ones.

**Detail**: Upgrade to `next@16.3.0` (or whichever patch bumps the affected transitive deps). The breaking-changes guide in `node_modules/next/dist/docs/` should be consulted before upgrading. Add `npm audit` as a step in the `deploy.yml` GHA so new high-severity deps fail the build.

---

### 10. In-app rating explainer / onboarding tooltip _(Impact: MEDIUM | Effort: S)_

**Why it matters**: The game quality rating (0–100) is HideScore's biggest differentiator but it is invisible by default (requires switching to the Ratings tab). New visitors who land on the Scores tab and leave never discover the feature. The existing onboarding was reworked 2026-08-04 but there are BACKLOG notes that it was only verified at desktop.

**Detail**: On the first visit with the Scores tab selected, show a single dismissible tooltip or bottom-sheet: "Tap Ratings to see how good each game was — no score revealed." One appearance, stored in `localStorage`. Alternatively, show the Ratings tab as the default for new visitors (since yesterday's slate is always complete, ratings are immediately meaningful).

---

### 11. Esports coverage expansion _(Impact: MEDIUM | Effort: M)_

**Why it matters**: Esports (`Sport` union includes `esports`, keyed by `esportsLeague`) is defined in the type system and has a PandaScore integration noted in the codebase, but it is not surfaced in the default league picker or auto-selector. The audience skews young and digitally native — exactly the demographic that cares about spoilers.

**Detail**: Add 2–3 top esports leagues (League of Legends Worlds, CS2 Majors, Valorant Champions) to `ALL_LEAGUES` with appropriate season windows. The PandaScore API is free-tier and has good structured data. Add `/esports-scores-without-spoilers` SEO landing page to capture that query intent.

---

### 12. Timezone-aware "Last night" default date _(Impact: MEDIUM | Effort: S)_

**Why it matters**: The app defaults to yesterday, which is the right call since overnight games will have finished. But for users in UTC+10 (Australia, east Asia), "yesterday" in their local timezone is often still "today" in US Eastern time where most sports are played. This means those users see tomorrow's empty slate when they want finished games.

**Detail**: The timezone pref and ZIP lookup are already implemented. Use the stored timezone to compute "last night's games" relative to the user's local midnight rather than UTC midnight. This is a one-line change in the date-default logic but meaningfully improves the experience for international users.

---

### 13. SEO — sport-specific structured data on landing pages _(Impact: MEDIUM | Effort: S)_

**Why it matters**: The existing landing pages (`/nba-scores-without-spoilers`, etc.) already have `FAQPage` and `WebPage` schema. Adding `SportsOrganization` and `SportsEvent` structured data would give Google more signal for sports-intent queries and could unlock rich result features (event carousels).

**Detail**: On sport-specific landing pages, add a `SportsOrganization` JSON-LD block for the league (NBA, NHL, etc.) and a handful of `SportsEvent` blocks for upcoming marquee matchups (pulled at build time from the ESPN API). This is purely additive to the existing schema and requires no UI changes.

---

### 14. "Skip" game ratings — community signal integration _(Impact: LOW-MEDIUM | Effort: L)_

**Why it matters**: The current quality rating is algorithmic (score closeness, comeback index, etc.). Adding a lightweight thumbs-up/thumbs-down after a user watches highlights would create a community-weighted rating layer that improves over time. This also gives signed-in users a reason to engage post-watch.

**Detail**: Add a ±1 vote stored in Cloudflare D1 (already set up for auth). Weight the community signal at 20% of the displayed rating. Show vote counts as a subtle "(23 agreed)" subtitle on GREAT/SKIP badges. Privacy: votes are anonymous by game ID, not linked to user identity in the display.

---

### 15. Offline/PWA improvement — stale-while-revalidate for scores _(Impact: LOW | Effort: M)_

**Why it matters**: The service worker (sw-v15.js) handles offline mode for static assets, but ESPN API responses are not cached. On a flaky connection (subway, stadium) the app shows an error spinner rather than showing the last known scores with a "last updated X min ago" badge.

**Detail**: In the service worker, add a stale-while-revalidate strategy for ESPN scoreboard API responses, keyed by date + league. Cache TTL: 5 minutes. On cache hit, render immediately and trigger a background refresh. Show a subtle "⟳ Updated 3 min ago" timestamp on the column header when serving from cache. This is especially valuable for the iOS and Android native apps running in poor-signal venues.

---

*Next advisory: 2026-08-26*
