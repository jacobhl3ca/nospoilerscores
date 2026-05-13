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

COVERAGE
Major professional and collegiate leagues across baseball, basketball, hockey, football, soccer, golf, and tennis.

—
HideScore is an independent app and is not affiliated with, endorsed by, or sponsored by any team, league, broadcaster, or sports organization. All scores, schedules, and links are sourced from publicly available sports websites.
```

---

## Promotional Text (max 170 chars, can be updated without resubmitting)

```
Watch any game spoiler-free. Scores hidden by default, competitiveness ratings tell you what's worth watching, and you choose when to peek.
```

---

## Keywords (max 100 chars total, comma-separated, no spaces after commas)

```
sports,scores,nospoilers,hidescore,highlights,schedule,replay,baseball,basketball,hockey,football
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

If Apple flags the third-party score fetches: those are user-initiated requests to publicly available sports data APIs — no data is collected by HideScore from those requests.

---

## Age Rating Questionnaire

All questions answer **None / No** → results in **4+**.

---

## Export Compliance

- Uses encryption: **No** (or "Yes, exempt — uses only standard HTTPS provided by iOS")
- Either choice is fine since you only do HTTPS via the system network stack.

---

## Screenshots

Located at: `screenshots/` (1320×2868, iPhone 17 Pro Max, 6.9"). All captured in demo mode (`?demo=1`) so zero third-party team/league/broadcaster names appear — required after the 2026-05-07 Copycats rejection.

- `01-yest.png` — Yesterday, scores hidden (headline shot)
- `02-yest-ratings-on.png` — Yesterday, GREAT/SKIP/GOOD rating chips revealed
- `03-today.png` — Today, game times, scores hidden
- `04-tomorrow.png` — Tomorrow upcoming + next-game cards
- `05-calendar.png` — Date picker overlay
- `06-light-mode.png` — Light theme

Stale shots from the rejected submission moved to `screenshots/stale/`. Apple requires 1, recommends 3-5; 6 covers all sizes.

### Reproducing demo-mode screenshots

1. `npm run build` then `npx serve out -p 3010` (or `npm run dev -p 3010`)
2. Add to `capacitor.config.ts` temporarily: `server: { url: 'http://localhost:3010/?demo=1', cleartext: true }`
3. `npx cap sync ios`
4. Boot iPhone 17 Pro Max simulator, lock status bar:
   `xcrun simctl status_bar booted override --time "9:41" --batteryState charged --batteryLevel 100 --cellularBars 4 --wifiBars 3 --dataNetwork wifi`
5. Build + install: `xcodebuild -project ios/App/App.xcodeproj -scheme App -destination "platform=iOS Simulator,id=<UDID>" -derivedDataPath ios/App/build_dd build` then `xcrun simctl install booted ios/App/build_dd/Build/Products/Debug-iphonesimulator/App.app`
6. `xcrun simctl launch booted com.jacobhl.hidescore`
7. Capture each view: `xcrun simctl io booted screenshot screenshots/01-yest.png` etc.
8. **Revert `capacitor.config.ts`** — remove `server.url` block before any production build.

The demo-mode transformer lives in `src/lib/demoMode.ts` and is activated client-side by the `?demo=1` query param. Real users never trigger it.

---

## Reviewer Notes (App Review Information)

```
HideScore is a score-hiding utility for sports fans who want to watch games on delay without seeing the outcome first. All score and schedule data is fetched from publicly available sports data APIs. All play actions for highlights and news open the original source's website or app via the system browser — HideScore does not relay, cache, or rebroadcast any third-party video. HideScore is an independent app and is not affiliated with, endorsed by, or sponsored by any team, league, broadcaster, or sports organization.

No login is required. Reviewer can use the app immediately on launch.
```

---

## Reply to App Review (paste in App Store Connect resubmit message)

```
Hello,

Thank you for the detailed feedback. We have revised the app metadata to remove all third-party league and team references:

• Removed the "LEAGUES COVERED" section from the app description and replaced it with a generic statement about sport categories.
• Removed all league acronyms (MLB, NBA, NHL, NFL) and league-specific terms from the keywords field.
• Replaced the submitted screenshots with versions that do not display third-party team marks, logos, or league branding.
• Strengthened the disclaimer that HideScore is an independent app not affiliated with or endorsed by any team, league, broadcaster, or sports organization.

HideScore is a utility for fans who want to watch any sporting event spoiler-free. All scores and schedules are fetched from publicly available sports data APIs at the user's request; the app itself does not relay, host, or rebroadcast any third-party content.

Please let us know if any further changes are needed.

Best,
Jake
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

## Status as of 2026-05-13 (resubmit)

- [x] App icon (Twemoji-derived) at correct size, no alpha
- [x] Privacy policy live at `/privacy`
- [x] Footer attribution disclaimer
- [x] Info.plist `arm64` capability
- [x] iOS bundle synced
- [x] Apple Developer team set in Xcode (first submission shipped)
- [x] iPhone-only deployment confirmed
- [x] Archive + upload to App Store Connect (first submission shipped)
- [x] App Store Connect listing filled (first submission)
- [x] App Privacy questionnaire submitted (first submission)
- [x] Submitted for review (first submission, REJECTED 2026-05-07/08 — 4.1(a) Copycats)
- [x] Metadata sanitized — description, keywords, screenshots
- [x] Demo-mode screenshots captured (`screenshots/01-06`)
- [ ] App Store Connect: replace screenshots in the listing
- [ ] App Store Connect: paste new description
- [ ] App Store Connect: paste new keywords
- [ ] App Store Connect: paste reply to App Review
- [ ] Resubmit for review
