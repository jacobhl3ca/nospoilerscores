# HideScore — Google Play Submission Pack

> **Status note (2026-07-16):** the app and Alpha closed-test release already exist in Play Console. Use `playstore/submission.md` for the current continuation checklist; the original creation steps below are retained as history.

Copy-paste answers for every Play Console screen. Account `7809060308326519816`.
Adapted from `APP_STORE_SUBMISSION.md` for Play's different forms.

> **Assets folder:** `~/scripts/play-console/assets/`
> - `icon-512.png` — 512×512 app icon
> - `feature-graphic.png` — 1024×500 feature graphic (required)
> - `shot-01-scores.png` … `shot-05-tomorrow.png` — 1080×1920 phone screenshots (demo mode, no real teams)
> **AAB to upload:** `~/nospoilerscores/android/app/build/outputs/bundle/release/app-release.aab` (versionCode 1)

---

## 1. Create app (the first dialog)

- **App name:** `HideScore`
- **Default language:** English (United States) – en-US
- **App or game:** App
- **Free or paid:** Free
- Check both declarations (Developer Program Policies, US export laws).
- Click **Create app**.

---

## 2. Store listing (Grow → Store presence → Main store listing)

- **App name:** `HideScore`
- **Short description** (≤80 chars):
```
Watch any game spoiler-free. Scores hidden by default, with competitiveness ratings.
```
  (84 → trim to: `Watch sports spoiler-free. Scores hidden by default, plus matchup ratings.` = 73)
- **Full description** (≤4000):
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

HideScore is an independent app and is not affiliated with, endorsed by, or sponsored by any team, league, broadcaster, or sports organization. All scores, schedules, and links are sourced from publicly available sports websites.
```
- **App icon:** upload `assets/icon-512.png`
- **Feature graphic:** upload `assets/feature-graphic.png`
- **Phone screenshots:** upload all 5 `assets/shot-0*.png` (Play needs 2–8)
- Save.

## 3. Store settings (Grow → Store presence → Store settings)

- **App category:** Sports
- **Tags:** Sports, Scores (pick the closest offered)
- **Contact email:** (your dev contact email)
- **External marketing:** your call (off is fine)

---

## 4. App content (left nav: Policy → App content) — the gating forms

Fill **all** of these or you can't roll out a test:

| Form | Answer |
|------|--------|
| **Privacy policy** | `https://hidescore.com/privacy` |
| **App access** | "All functionality is available without special access" (no login required) |
| **Ads** | No, my app does not contain ads |
| **Content ratings** | Start questionnaire → category **Reference, News, or Educational** → answer **No** to every violence/sexual/drugs/gambling question → submit. Result ≈ Everyone / PEGI 3. |
| **Target audience** | Target age groups: **13–15, 16–17, 18+** (do NOT check under-13 — that triggers the Families program). "Appeal to children?" → No. |
| **Data safety** | **No data collected, no data shared.** (No analytics SDKs, no accounts — verified in package.json.) Walk the wizard: "Does your app collect or share any of the required user data types?" → No. |
| **Government apps** | No |
| **Financial features** | None of these |
| **Health apps** | No |
| **News app** | No (it links to news but isn't a news publisher) |

---

## 5. Closed testing track (Test and release → Testing → Closed testing)

1. **Create track** (or use the default "Alpha" closed track).
2. **Countries/regions:** add all (or just US to start).
3. **Releases → Create new release.**
4. **App signing:** accept **Play App Signing** when prompted (Google manages the key). ⚠️ Anyone who sideloaded `HideScore.apk` can't update over the Play version — different signature, must reinstall.
5. **Upload** `app-release.aab`.
6. **Release name:** `1.0 (1)`. **Release notes:** `First closed test build.`
7. **Testers:** create an email list → add **≥12 Gmail addresses** (Google lowered this from 20 → confirmed in-console 6/12). They must opt in via the test link and stay opted-in **14 consecutive days** before you can apply for production.
8. **Review release → Start rollout to Closed testing.**

---

## 6. After 14 days

Test and release → **Production** → "Apply for production access" (form about how you tested), then create a production release with the same AAB.

---

## Notes
- Every upload after the first must **bump `versionCode`** in `android/app/build.gradle` (`./gradlew bundleRelease` again with JAVA_HOME set — see the android memory).
- 12-tester requirement is the long pole. Options: family/friends Gmails, or a mutual-testing community (r/AndroidClosedTesting / Discord groups that swap test opt-ins).
