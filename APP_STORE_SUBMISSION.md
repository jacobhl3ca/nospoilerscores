# HideScore iOS — App Store Submission Pack

Single source of truth for the App Store Connect listing. Copy-paste ready.

---

## App Information

- **Bundle ID:** `com.jacobhl.hidescore`
- **App name (iTunes Connect):** `HideScore`
- **Subtitle (max 30 chars):** `Sports scores, no spoilers`
- **Primary category:** Sports
- **Secondary category:** (leave blank)
- **Content rights:** Yes, contains third-party content (sports scores/news links — public information).
- **Age rating:** 4+ (no questionable content; complete the questionnaire with all "No" answers).
- **Pricing:** Free
- **Availability:** All territories

---

## URLs

- **Marketing URL:** `https://hidescore.com`
- **Support URL:** `https://hidescore.com` (or set up `mailto:hi@hidescore.com` redirect page if Apple rejects the bare site)
- **Privacy Policy URL:** `https://hidescore.com/privacy` *(live as of commit 72e56760)*

---

## Description

Paste the block below into App Store Connect → App Information → Description.

```
HideScore lets you catch up on sports without seeing the score.

Pick a date, hide the result, and watch a game like it's live — even when it's already over. Competitiveness ratings tell you which games are worth your time before you commit to watching.

KEY FEATURES
• Scores hidden by default — you control when (or whether) to reveal them
• Competitiveness ratings to find the games actually worth watching
• Today, tomorrow, and any past date covered
• Highlights, news, and live game links when you're ready
• Filter by your favorite teams
• No accounts, no tracking, no ads

LEAGUES COVERED
MLB, NBA, NHL, NFL, college basketball, soccer (EPL, MLS, Champions League and more), golf, and tennis.

—
HideScore is not affiliated with or endorsed by any team, league, or broadcaster. All scores, schedules, and links are sourced from publicly available sports websites.
```

---

## Promotional Text (max 170 chars, can be updated without resubmitting)

```
Watch any game spoiler-free. Scores hidden by default, competitiveness ratings tell you what's worth watching, and you choose when to peek.
```

---

## Keywords (max 100 chars total, comma-separated, no spaces after commas)

```
sports,scores,nospoilers,hidescore,mlb,nba,nhl,nfl,highlights,schedule,replay,baseball,basketball
```

(95 chars. Drop trailing items if Apple counts spaces differently.)

---

## What's New in This Version (release notes)

```
First release.
```

---

## App Privacy (Nutrition Label Questionnaire)

Click **Get Started** in App Store Connect → App Privacy.

Answer **"No, we do not collect data from this app"** for the top-level question. Justification: this app has zero analytics SDKs (verified — no Sentry, Firebase, Plausible, PostHog, Mixpanel, Vercel Analytics, etc. in `package.json`), no user accounts, no cookies for tracking, and no advertising identifiers. User preferences are stored only in the device's local storage and never transmitted.

If Apple flags the third-party score fetches: those are user-initiated requests to public APIs (ESPN, MLB, NBA, NHL, etc.) — no data is collected by HideScore from those requests.

---

## Age Rating Questionnaire

All questions answer **None / No** → results in **4+**.

---

## Export Compliance

- Uses encryption: **No** (or "Yes, exempt — uses only standard HTTPS provided by iOS")
- Either choice is fine since you only do HTTPS via the system network stack.

---

## Screenshots

Located at: `screenshots/`

- `01-today.png` (1320×2868) — main view, today's games, scores hidden ✓

**Need at least 1, recommend 3-5.** To take additional ones in the booted simulator (iPhone 17 Pro Max already running):

1. **Ratings revealed:** tap the orange monkey icon at top-right → `xcrun simctl io booted screenshot screenshots/02-ratings.png`
2. **Tomorrow tab:** tap "Tomo" tab at top → `xcrun simctl io booted screenshot screenshots/03-tomorrow.png`
3. **News view:** tap the newspaper icon at top-right → `xcrun simctl io booted screenshot screenshots/04-news.png`

Apple no longer requires multiple device sizes — 6.9" (iPhone 16/17 Pro Max) screenshots cover the full lineup.

---

## Reviewer Notes (App Review Information)

```
HideScore is a score-hiding utility for sports fans who want to watch games on delay without seeing the outcome first. All score and schedule data is fetched from publicly available APIs (ESPN, MLB, NBA, NHL, etc.). All play actions for highlights and news open the original source's website or app via the system browser — HideScore does not relay, cache, or rebroadcast any third-party video.

No login is required. Reviewer can use the app immediately on launch.
```

---

## Xcode steps (in order)

Open `ios/App/App.xcodeproj` in Xcode, then:

1. **Signing & Capabilities tab** → ensure "Automatically manage signing" is checked → select your Team. This will register the bundle ID `com.jacobhl.hidescore` automatically.
2. **General → Identity** → keep `Version 1.0`, `Build 1`.
3. **General → Deployment Info → Targets** → consider unchecking iPad (universal will trigger iPad-layout review). iPhone-only is the safe path for v1.
4. **Product → Destination → "Any iOS Device (arm64)"**.
5. **Product → Archive**.
6. When the Organizer opens: **Distribute App → App Store Connect → Upload**. Wait for processing (~5-15 min).
7. Back in App Store Connect → My Apps → HideScore → TestFlight → wait for the build to finish processing → confirm export compliance → install via TestFlight on your phone first to sanity-check.
8. Once happy: App Store tab → fill all fields above → Submit for Review.

---

## Reproducing the app icon

`scripts/render-app-icon.mjs` regenerates `ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png` from the Twemoji SVG in `public/`. Run with `node scripts/render-app-icon.mjs`.

---

## Likely review pushback (and the response)

| Risk | Mitigation in code | Response if flagged |
|------|--------------------|---------------------|
| 5.2.5 (TV/movie aggregator) | All play actions open in source's site/app | "All third-party content opens externally; HideScore does not relay, cache, or rebroadcast." |
| 5.2 (IP — emoji icon) | Twemoji (CC-BY 4.0), not Apple emoji | "Icon is derived from Twemoji, attributed in the app's privacy policy." |
| 4.2 (minimum functionality) | Score-hiding + ratings + news | "Unique value prop is the spoiler-free workflow; standalone purpose distinct from any team/league app." |

---

## Status as of 2026-05-06

- [x] App icon (Twemoji-derived) at correct size, no alpha
- [x] Privacy policy live at `/privacy`
- [x] Footer attribution disclaimer
- [x] Info.plist `arm64` capability
- [x] iOS bundle synced
- [x] First simulator screenshot captured
- [ ] Apple Developer team set in Xcode
- [ ] iPhone vs Universal decision
- [ ] Archive + upload to App Store Connect
- [ ] App Store Connect listing filled
- [ ] App Privacy questionnaire submitted
- [ ] Submitted for review
