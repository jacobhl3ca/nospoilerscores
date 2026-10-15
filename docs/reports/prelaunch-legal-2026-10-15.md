# HideScore: pre-launch legal checklist for Product Hunt (2026-10-15)

> **Not legal advice; have a lawyer review items marked lawyer.**

Scope: the web app (hidescore.com), the iOS and Android apps, and the store listings, read from `main` at `bd3185f`.
Each item gives status (OK / gap / unclear), evidence, the fix, effort (S = under 1 h, M = half a day, L = more), and who must do it (code / owner / lawyer).
Items are ranked. Blockers come first.

## Summary

| # | Item | Status | Who | Effort |
|---|------|--------|-----|--------|
| B1 | Google Play Data safety says "no data collected" | gap | owner | S |
| B2 | Privacy policy does not match what the code collects | gap | code + lawyer | M |
| B3 | Bracket picks offers a prize with no official rules | gap | owner + lawyer | S |
| B4 | In-app player plays unlicensed clips; App Review notes are out of date | gap | owner + lawyer | S |
| B5 | Android launcher icon, widget and web icons look like Apple emoji art | gap | code | S |
| B6 | Play listing: screenshots show team logos; text says "No accounts" | gap | owner | S |
| B7 | No DMCA designated agent, no repeat-infringer line | gap | owner + code + lawyer | S |
| B8 | Apple App Privacy label is incomplete | gap | owner | S |
| H1 | Account deletion: web link, scope, path text | gap | code + owner | M |
| H2 | EU/UK consent for the device ID and GoatCounter | unclear | lawyer | M |
| H3 | Terms do not cover accounts, user content, contests, perks | gap | lawyer + code | M |
| H4 | YouTube terms: player masks, search scraping, required links | unclear | lawyer + code | M |
| H5 | Logos: hot-linked from ESPN, copied into share cards | unclear | lawyer | M |
| M1 | "Not affiliated" notice | OK | none | none |
| M2 | League names in SEO page titles | OK | none | none |
| M3 | Store description says scores can be revealed | gap | owner | S |
| M4 | Accessibility statement and scan findings | gap | code + owner | M |
| M5 | Children (COPPA) | OK, with one note | owner | S |
| M6 | Sign in with Apple | OK | none | none |
| M7 | Gambling and odds content | OK, with one note | code | S |
| M8 | Sports data sources and licensing claims | unclear | lawyer | none now |
| M9 | Supporter links and perks (Ko-fi, Patreon) | unclear | owner | S |
| M10 | Governing law and operator identity | unclear | lawyer | S |
| P1 | Product Hunt launch rules | to do | owner | S |

---

## Blockers (fix before launch day)

### B1. Google Play Data safety says "no data collected"
- **Status:** gap.
- **Evidence:**
  - `playstore/submission.md:41` and `PLAY_STORE_SUBMISSION.md:306` answer "No data collected, no data shared".
  - The code collects data: accounts (email, provider IDs), Umami and GoatCounter analytics, Sentry crash reports, the feedback form, and the bracket leaderboard. See the data-flow list in B2.
- **Fix:** Fill in the Data safety form again. Declare at minimum: Personal info → Email address and Name (bracket display name); App activity → App interactions; App info and performance → Crash logs and Diagnostics; Device or other IDs (the `hs_did` random ID). Mark the purposes (App functionality, Analytics). Add the account-deletion URL (see H1).
- **Effort:** S. **Who:** owner (Play Console).
- **Rule:** [Play Data safety](https://support.google.com/googleplay/android-developer/answer/10787469), [User Data policy](https://support.google.com/googleplay/android-developer/answer/10144311). Google can remove an app whose Data safety answers are wrong.

### B2. Privacy policy does not match what the code collects
- **Status:** gap.
- **Evidence:** the policy is at `src/app/privacy/page.tsx`. It names usage stats, crash reports and accounts only (lines 52-63). Last updated 2026-09-25 (line 45), which is older than the device ID (10-13) and the feedback initials field (10-9).
- **Data flows found in the code:**

  | Flow | Data | Goes to | Evidence | In policy? |
  |------|------|---------|----------|------------|
  | Umami analytics | page views, events, random device ID `hs_did`, hashed account code | stats.hidescore.com (owner's server) | `src/app/layout.tsx:545-564`, `src/lib/prefsSync.ts:70-88` | yes |
  | GoatCounter analytics | page views, referrer, screen size | gc.zgo.at, hidescore.goatcounter.com | `src/app/layout.tsx:527-531` | **no** |
  | First-run league picker event | the leagues the user picked | Umami | `src/components/LeaguePickerModal.tsx:100,467` | partly |
  | Sentry (web) | errors, device details, 10% performance traces, logs, breadcrumbs | sentry.io (US) | `src/instrumentation-client.ts:6-8,51-53` | partly |
  | Sentry (iOS, Android native) | native crashes | sentry.io | `ios/App/App/AppDelegate.swift:22-26`, `android/app/src/main/AndroidManifest.xml:15-17` | yes |
  | Account record | email, all linked provider IDs, created/updated dates | Cloudflare R2 | `public/_worker.js:4481-4503` | partly |
  | Account activity | first/last seen, visit count per platform | Cloudflare R2 | `public/_worker.js:4412-4553` | "basic activity" |
  | Synced settings | settings and favorites (up to 64 KB) | Cloudflare R2 | `public/_worker.js:4608` | yes |
  | Opened news links | up to 3,000 links over 14 days | Cloudflare R2 | `public/_worker.js:4614-4675` | **no** |
  | Email sign-in codes | email in plain text, hashed code, expiry | Cloudflare D1 | `migrations/0001_email_login_codes.sql:3-10` | **no** |
  | Sign-in email sending | email address | Resend (api.resend.com) | `public/_worker.js:4768-4787` | **no** |
  | Session cookie `hs_session` | sub, uid, email; HttpOnly; 90 days | first-party cookie | `public/_worker.js:4104-4105,4226-4228` | **no** (policy only says stats are cookieless) |
  | Feedback form | message, optional email, optional initials, build, platform, full user agent | Formspree | `src/components/FeedbackBox.tsx:11,177-195` | **no** |
  | Wall of Fame | initials, given with consent, public | public repo and `/wall-of-fame` | `src/lib/requestedBuilds.ts:7-11` | **no** |
  | Bracket picks leaderboard | display name (up to 20 chars) and picks, public; hashed device token; hashed IP for 10 min | Cloudflare KV, public `/api/picks` | `public/_worker.js:5109-5112,5288-5396` | **no** |
  | Coarse location | country, region, TV market (from Cloudflare) | returned to the device for radio links | `public/_worker.js:1096-1109` | **no** |
  | Image proxy | every proxied thumbnail URL and the user's IP | images.weserv.nl | `src/lib/news.ts:789-807`, `public/_worker.js:194-203` | **no** |
  | Weather | venue city name, user's IP | Open-Meteo | `src/lib/weather.ts:120` | **no** |
  | Sports data, video, logos | normal web requests with IP | ESPN, MLB, NHL, YouTube, Brightcove, FotMob, Wikimedia | `src/app/layout.tsx:268-347` | yes (general) |
  | Worker data proxies | request IP visible to hidescore.com | `/api/youtube`, `/api/mlb-videos`, others | `public/_worker.js:1207-3963` | **no** (policy says "we do not log these requests") |
  | On-device storage | settings, cached email in `nss-auth`, `hs_did`, opened links, offline board, picks | localStorage, sessionStorage, Service Worker cache | `src/lib/prefsSync.ts:110,140`, `public/sw-v16.js` | partly |
  | Push notifications | none | none | no push plugin or token | n/a |
  | Cloudflare Web Analytics (RUM) | no beacon in the repo | unclear: check the Cloudflare dashboard | `public/_headers`, `wrangler.toml` | n/a |

- **Fix (text edit to `src/app/privacy/page.tsx`):**
  1. Name each processor: Cloudflare (hosting, storage), Umami (self-hosted), GoatCounter, Sentry, Formspree, Resend, images.weserv.nl, Open-Meteo.
  2. Add the session cookie and the main localStorage keys. Replace "counted without cookies" with plain wording about the device ID in local storage.
  3. Add public data: Wall of Fame initials and the bracket display name.
  4. Add how long each kind of data is kept.
  5. Add user rights (access, correction, deletion, objection) and how to use them.
  6. Add the legal basis for each purpose (GDPR Art. 13) and say data goes to the US.
  7. Add a Do Not Track sentence (CalOPPA requires it).
  8. Correct "We do not log these requests": the worker proxies some feeds.
  9. Fix the deletion path text (see H1).
  10. Update the date.
- **Effort:** M. **Who:** code (text), lawyer (review).
- **Rules:** [GDPR Art. 13](https://gdpr-info.eu/art-13-gdpr/), [CalOPPA, Bus. & Prof. Code 22575](https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=BPC&sectionNum=22575), [FTC: privacy and security](https://www.ftc.gov/business-guidance/privacy-security), [Apple 5.1.1(i)](https://developer.apple.com/app-store/review/guidelines/#data-collection-and-storage).
- **CCPA:** it probably does not apply yet. The thresholds are $25M+ revenue, 100,000+ consumers, or 50%+ of revenue from selling data ([CA AG CCPA page](https://oag.ca.gov/privacy/ccpa)). A lawyer should confirm. CalOPPA applies at any size.

### B3. Bracket picks offers a prize with no official rules
- **Status:** gap. The MLB postseason is live now, so this is live now.
- **Evidence:**
  - `src/components/BracketPicks.tsx:72`: "Perfect bracket OR first place: HideScore grants one wish (within reason)." It is shown at line 651.
  - The terms (`src/app/terms/page.tsx`) have no contest rules, eligibility, age limit, prize value, or winner selection.
  - The prize is shown in the iOS and Android apps too, because they load the website.
- **Fix:** do one of these:
  1. Remove the prize sentence. Keep "play for fun". (Fastest.)
  2. Or publish official rules: sponsor name, eligibility (age 18+, where it is void), entry period, scoring, tie-breaker, prize and its value, how the winner is told, and "Apple and Google are not sponsors". Link them from the bracket.
- **Effort:** S (option 1). **Who:** owner (decision), lawyer (option 2).
- **Rules:** [Apple 5.3.1-5.3.2](https://developer.apple.com/app-store/review/guidelines/#gaming-gambling-and-lotteries) (official rules must be in the app and say Apple is not a sponsor); [Play real-money gambling, games and contests](https://support.google.com/googleplay/android-developer/answer/9877032). State contest laws also apply; a lawyer should check them.

### B4. In-app player plays unlicensed clips; App Review notes are out of date
- **Status:** gap.
- **Evidence:**
  - The app plays these in its own `<video>` player (HLS or MP4), not in an official player: MLB statsapi HLS, ESPN MP4s, v.redd.it, and other clip hosts such as streamable and streamff. See `scripts/lib/media-policy.mjs:13-18` and `src/components/VideoModal.tsx:1772-1808`.
  - Clips on Reddit clip hosts are usually copies of broadcasts that the poster does not own.
  - `BACKLOG.md:1256` already calls MLB highlights "the single biggest exposure".
  - No video is rehosted or proxied. The worker proxies only JSON metadata (`public/_worker.js:3887,3991`). This is good.
  - The App Review notes say "All play actions for highlights and news open the original source's website or app … does not relay … any third-party video" (`APP_STORE_SUBMISSION.md:148,167`). That is no longer true.
- **Fix:**
  1. Before launch, turn off the `cliphosts` and `vreddit` classes with the existing switch (`MEDIA_OFF`, runbook at `scripts/lib/media-policy.mjs:5-11`). This is an owner action, not a code change. Also set `MEDIA_OFF` in the GitHub Actions bake workflow env.
  2. Ask a lawyer about `mlb` and `espn` in-app playback. The safe default is to open those on the source site.
  3. Update the App Review notes before the next iOS submission so they describe the in-app player truthfully.
- **Effort:** S. **Who:** owner (switch, notes), lawyer (MLB and ESPN).
- **Rules:** [17 U.S.C. § 512](https://www.law.cornell.edu/uscode/text/17/512) (safe harbor needs no knowledge of infringement), [Apple 5.2.2 and 5.2.3](https://developer.apple.com/app-store/review/guidelines/#intellectual-property), [Play Intellectual Property policy](https://support.google.com/googleplay/android-developer/answer/9888072), [Reddit User Agreement](https://redditinc.com/policies/user-agreement).

### B5. Android launcher icon, widget and web icons look like Apple emoji art
- **Status:** gap. This is a visual judgement, not a confirmed fact.
- **Evidence:**
  - These files look like Apple's own "see-no-evil monkey" emoji (shaded 3D style), not Twemoji:
    - `android/app/src/main/res/mipmap-*/ic_launcher.png`, `ic_launcher_round.png` and `ic_launcher_foreground.png` (the Android app icon)
    - `android/app/src/main/res/drawable-nodpi/widget_monkey.png`
    - `public/icon-192.png` and `public/icon-512.png` (PWA icons, `public/manifest.json:22-66`)
    - `public/apple-touch-icon.png`
    - The Organization logo in JSON-LD (`src/app/layout.tsx:227`)
  - The iOS icon and the Play Store icon are Twemoji (flat style): `ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png`, `playstore/icon-512.png`.
  - The terms say "The monkey icon is derived from Twemoji (CC-BY 4.0)" (`src/app/terms/page.tsx:98-100`).
- **Fix:** Make every icon from the Twemoji SVG (`public/monkey-see-no-evil.svg`). `scripts/render-app-icon.mjs` already does this for iOS; extend it to the Android mipmaps, the widget and the web icons. Ship a new Android build.
- **Effort:** S (plus a store build). **Who:** code.
- **Rules:** Apple emoji art is Apple's copyrighted work and is licensed only for display on Apple devices ([Apple Software License Agreements](https://www.apple.com/legal/sla/)); [Twemoji graphics, CC-BY 4.0](https://github.com/twitter/twemoji); [Play Intellectual Property policy](https://support.google.com/googleplay/android-developer/answer/9888072).

### B6. Play listing: screenshots show team logos; text says "No accounts"
- **Status:** gap.
- **Evidence:**
  - `playstore/screenshots/01-scores.png` and `02-ratings.png` show real MLB and MLS team logos and "MLB", "MLS" and "World Cup" headers.
  - Apple rejected the iOS app on 2026-05-07 under 4.1(a) for the same kind of content (`APP_STORE_METADATA_ARCHIVE.md:3,95`). The iOS set now uses demo mode (`APP_STORE_SUBMISSION.md:118`).
  - The Play description says "No accounts, tracking, or ads" (`playstore/submission.md:32`). Optional accounts and analytics exist. The App Store text says "No account required, no advertising tracking" (`APP_STORE_SUBMISSION.md:49`), which is accurate.
- **Fix:**
  1. Replace the Play screenshots with demo-mode shots (`?demo=1`, `src/lib/demoMode.ts`).
  2. Change the line to "No account required. No ads."
  3. Use demo-mode images in the Product Hunt gallery as well.
- **Effort:** S. **Who:** owner.
- **Rules:** [Play Impersonation policy](https://support.google.com/googleplay/android-developer/answer/9888374), [Play Metadata policy](https://support.google.com/googleplay/android-developer/answer/9898842), [Apple 4.1 and 5.2.1](https://developer.apple.com/app-store/review/guidelines/#copycats).

### B7. No DMCA designated agent, no repeat-infringer line
- **Status:** gap.
- **Evidence:**
  - The terms have a plain "Takedown requests" email section (`src/app/terms/page.tsx:103-107`). `/contact` promises removal "within 1 business day" (`src/app/contact/page.tsx:98`).
  - There is no DMCA agent, no list of what a notice must contain, no counter-notice process, and no repeat-infringer policy.
- **Fix:**
  1. Register a designated agent at the [Copyright Office DMCA directory](https://www.copyright.gov/dmca-directory/). It costs $6 and must be renewed every 3 years ([renewal guide](https://www.copyright.gov/dmca-directory/transcripts/renew.pdf)). A P.O. box or a registered-agent service can stand in for a home address.
  2. Add a "Copyright (DMCA)" section to the terms: the agent's name and address, what a notice must contain, the counter-notice process, and "We end the accounts of repeat infringers in appropriate circumstances."
  3. Link it from `/contact`.
- **Effort:** S. **Who:** owner (register), code (text), lawyer (review).
- **Rules:** [17 U.S.C. § 512(c)(2)](https://www.law.cornell.edu/uscode/text/17/512) (the agent is needed for safe harbor), [§ 512(i)(1)(A)](https://www.law.cornell.edu/uscode/text/17/512) (repeat-infringer policy).

### B8. Apple App Privacy label is incomplete
- **Status:** gap.
- **Evidence:**
  - The label plan (`APP_STORE_SUBMISSION.md:90-97`) declares Email, User ID, Product Interaction (App Functionality only) and Crash Data.
  - It leaves out:
    - Analytics as a purpose (Umami, GoatCounter)
    - Device ID (`hs_did`)
    - Name (bracket display name)
    - Other Diagnostic Data (Sentry traces and logs)
    - Customer Support / Other User Content (the feedback form)
    - Browsing History or Product Interaction for opened news links
  - There is no app-level `PrivacyInfo.xcprivacy` in `ios/App/App/`.
- **Fix:** Update the label in App Store Connect to match the B2 table. Check whether the app needs its own privacy manifest. The Sentry SDK ships one, but the app may use required-reason APIs (for example UserDefaults through Capacitor).
- **Effort:** S. **Who:** owner.
- **Rules:** [Apple App privacy details](https://developer.apple.com/app-store/app-privacy-details/), [Privacy manifest files](https://developer.apple.com/documentation/bundleresources/privacy-manifest-files).

---

## High (fix this week)

### H1. Account deletion: web link, scope, path text
- **Status:** gap.
- **Evidence:**
  - In-app deletion exists: `DELETE /api/account` (`public/_worker.js:4685-4716`), button at `src/components/SettingsPanel.tsx:2148-2202`. It asks twice. This meets Apple 5.1.1(v).
  - The privacy page says "Settings → Account → Delete account" (`src/app/privacy/page.tsx:70`). The button is in the bottom row of Settings, not in the Account section.
  - Deletion does not remove:
    - the public leaderboard entry (`public/_worker.js:4704-4705`)
    - login-code rows in D1 that hold the plain email (they expire later)
    - Umami, GoatCounter and Sentry data
    - Formspree and Resend copies
  - Google Play requires a web link where a user can ask for deletion without the app. None is listed.
- **Fix:**
  1. Add a short "Delete your account" section with an anchor (for example `/privacy#delete`) that gives the in-app path and an email route. Put that URL in Play Data safety.
  2. Correct the path text.
  3. State what deletion keeps, and for how long.
  4. Consider deleting the leaderboard entry and the D1 rows on account deletion.
- **Effort:** M. **Who:** code, owner (Play Console).
- **Rules:** [Play account deletion requirements](https://support.google.com/googleplay/android-developer/answer/13327111), [Apple: offering account deletion](https://developer.apple.com/support/offering-account-deletion-in-your-app/).

### H2. EU/UK consent for the device ID and GoatCounter
- **Status:** unclear.
- **Evidence:** a persistent random ID `hs_did` is written to localStorage and sent with every analytics event (`src/app/layout.tsx:545-557`). GoatCounter also runs on every page (`src/app/layout.tsx:527-531`). The only control is an opt-out at `/notrack`. There is no consent banner.
- **Fix:** ask a lawyer if analytics storage needs opt-in consent for EU and UK visitors. Options: drop `hs_did` for EU/UK visitors, drop GoatCounter (Umami already counts visits), or add a consent prompt. Also ask if an EU representative (GDPR Art. 27) is needed.
- **Effort:** M. **Who:** lawyer, then code.
- **Rules:** [ePrivacy Directive Art. 5(3)](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32002L0058) (storage on a device needs consent unless strictly necessary), [EDPB guidelines (see 2/2023 on Art. 5(3))](https://www.edpb.europa.eu/our-work-tools/our-documents/guidelines_en), [ICO guide to PECR (cookies and similar technologies)](https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/guide-to-pecr/), [GDPR Art. 27](https://gdpr-info.eu/art-27-gdpr/).

### H3. Terms do not cover accounts, user content, contests, perks
- **Status:** gap.
- **Evidence:**
  - The terms are present and linked: footer `src/components/DocFooter.tsx:29`, board footer `src/components/HomeContent.tsx:6358`, `src/app/sitemap.ts:95`.
  - They cover: as-is, no warranty (`src/app/terms/page.tsx:64-77`); limit of liability (79-83); third-party content (85-92); trademarks and "not affiliated" (94-101); takedown (103-107); New Jersey law (109-113); changes (115-119).
  - They do not cover:
    - **Accounts:** a minimum age (13+), sign-in, suspension and termination.
    - **User content:** a licence to use feedback, Wall of Fame initials, and bracket display names; rules against offensive names.
    - **Contests:** the bracket prize (B3).
    - **Paid perks:** the Wall of Fame promises "6 months of any future supporter perks free" (`src/app/wall-of-fame/page.tsx:90`). Ko-fi and Patreon links start on 2026-12-15 (`src/lib/supportLinks.ts:8-18`). The terms say "HideScore is free" (line 66).
    - **Repeat infringers** (B7).
    - **Third-party terms:** users are bound by the YouTube Terms of Service when they play YouTube clips (H4).
    - **Disputes:** whether to add arbitration or a class-action waiver.
- **Fix:** add short sections for each gap. Have a lawyer review them. Add terms for perks before the 2026-12-15 support launch.
- **Effort:** M. **Who:** lawyer, code (text).
- **Rules:** [Apple 5.1.1(ii)](https://developer.apple.com/app-store/review/guidelines/#data-collection-and-storage) (account-based features), [17 U.S.C. § 512(i)](https://www.law.cornell.edu/uscode/text/17/512) (repeat infringers), [YouTube API Services Terms](https://developers.google.com/youtube/terms/api-services-terms-of-service).

### H4. YouTube terms: player masks, search scraping, required links
- **Status:** unclear.
- **Evidence:**
  - Clips play in the YouTube IFrame player (`src/components/VideoModal.tsx:1986,2100-2125`). That player is a YouTube API Service.
  - The app puts covers over YouTube's title, pause and end screens (`src/components/VideoModal.tsx:685-698`).
  - The worker reads YouTube search result pages directly (`public/_worker.js:1330`, also `:926`, `:3082`).
  - The terms and privacy page do not mention YouTube's Terms or Google's Privacy Policy.
- **Fix:**
  1. Add to the terms: "Videos from YouTube are subject to the YouTube Terms of Service." Add a link to the Google Privacy Policy on the privacy page. Both are short text edits.
  2. Ask a lawyer whether covering the player's overlays is allowed.
  3. Replace page scraping with the YouTube Data API (it has a quota but is permitted).
- **Effort:** M. **Who:** code (text, API), lawyer (masks).
- **Rules:** [YouTube API Services Terms](https://developers.google.com/youtube/terms/api-services-terms-of-service), [Developer Policies](https://developers.google.com/youtube/terms/developer-policies) (privacy-policy and terms requirements; do not modify or obscure the player), [YouTube Terms of Service](https://www.youtube.com/t/terms) (no automated access).

### H5. Logos: hot-linked from ESPN, copied into share cards
- **Status:** unclear.
- **Evidence:**
  - In-app team logos are hot-linked: ESPN CDN (`src/lib/teamLogos.ts:37`, about 140 URLs in `src/lib/teamPages.ts`), mlbstatic (`src/lib/playoffPicture.ts:734`), Wikimedia and FotMob (`src/lib/teamLogoOverrides.ts:18,23`).
  - Four crests are bundled in `public/logos/` and were taken from Wikipedia (`src/lib/teamLogoOverrides.ts:154`).
  - Share-card PNGs draw ESPN team logos and are stored and served from hidescore.com (`scripts/prebake-share-cards.mjs:247-270`, `public/_worker.js:1116-1133`). This makes copies.
  - Logos are used only to identify teams. They are not used in the app icon, the iOS screenshots or the OG images (`public/og-image.png` has text only).
- **Fix:** keep logos small and only next to the team name. Do not use them in ads, the Product Hunt gallery, or store screenshots. Ask a lawyer about the share-card copies; the low-risk fallback is cards with team names only. Remember that ESPN's terms allow only non-commercial use (`BACKLOG.md:1257`).
- **Effort:** M. **Who:** lawyer, then code if needed.
- **Rules:** [Nominative use](https://en.wikipedia.org/wiki/Nominative_use) ([New Kids on the Block v. News America, 9th Cir. 1992](https://en.wikipedia.org/wiki/New_Kids_on_the_Block_v._News_America_Publishing,_Inc.)), [ESPN / Disney Terms of Use](https://disneytermsofuse.com/).

---

## Medium and checks that pass

### M1. "Not affiliated" notice
- **Status:** OK.
- **Evidence:** `src/app/terms/page.tsx:96-97`, `src/app/about/page.tsx:126`, `src/app/contact/page.tsx:102`, `src/app/privacy/page.tsx:89`, App Store description (`APP_STORE_SUBMISSION.md:55`), Play description (`playstore/submission.md:34`).
- **Fix:** add the same line to the Product Hunt description.
- **Who:** owner.

### M2. League names in SEO page titles
- **Status:** OK.
- **Evidence:** "NFL Highlights Without Spoilers…" (`src/app/nfl-highlights-without-spoilers/page.tsx:4`), "Premier League Without Spoilers" (`src/app/premier-league-without-spoilers/page.tsx:4`), about 30 similar pages. `public/manifest.json:4` names NBA, MLB, NHL, NFL.
- **Note:** using a name to say what the app covers is nominative use. Do not add "official", league logos, or league colours to these pages.
- **Rule:** [Nominative use](https://en.wikipedia.org/wiki/Nominative_use).

### M3. Store description says scores can be revealed
- **Status:** gap (accuracy, not IP).
- **Evidence:** "Scores hidden by default — you control when (or whether) to reveal them" (`APP_STORE_SUBMISSION.md:44`, `playstore/submission.md:27`). `/about` says no score is ever drawn (`src/app/about/page.tsx:80-82`).
- **Fix:** change it to "No scores, ever. Ratings tell you which games are worth watching."
- **Effort:** S. **Who:** owner.
- **Rule:** [Apple 2.3.1](https://developer.apple.com/app-store/review/guidelines/#accurate-metadata), [Play Metadata policy](https://support.google.com/googleplay/android-developer/answer/9898842).

### M4. Accessibility statement and scan findings
- **Status:** gap.
- **Evidence:**
  - There is no accessibility statement page.
  - The 2026-10-15 axe scan is not in the repo or in a GitHub issue or PR. **Owner: add its link here.**
  - Its findings, as given in the task:
    - **Colour contrast:** muted text (`var(--text-muted)`) on the doc pages and footers.
    - **Buttons without names:** icon-only buttons.
    - **Pinch-zoom blocked:** `maximumScale: 1` and `userScalable: false` in `src/app/layout.tsx:111-115`. The comment says this is for the Capacitor WebView. The tag is served to every browser, and Android Chrome obeys it.
- **Fix:**
  1. Serve the zoom lock only in the native shell, or remove it.
  2. Fix contrast to at least 4.5:1.
  3. Add `aria-label` to every icon-only button.
  4. Publish a short `/accessibility` page: the target (WCAG 2.2 AA), known issues, and a contact.
- **Effort:** M. **Who:** code, owner (link the scan).
- **Rules:** [WCAG 2.2: 1.4.3 Contrast, 1.4.4 Resize Text, 4.1.2 Name, Role, Value](https://www.w3.org/TR/WCAG22/), [DOJ web accessibility guidance (ADA)](https://www.ada.gov/resources/web-guidance/), [W3C statement generator](https://www.w3.org/WAI/planning/statements/), [European Accessibility Act](https://eur-lex.europa.eu/eli/dir/2019/882/oj) (micro-enterprises are exempt for services).

### M5. Children (COPPA)
- **Status:** OK, with one note.
- **Evidence:** the policy says "not for children under 13" (`src/app/privacy/page.tsx:80`). Play target audience is 13+ (`playstore/submission.md:40`). The App Store age rating is 4+ (`APP_STORE_SUBMISSION.md:20`). The app is not directed at children.
- **Note:** a 4+ rating together with a prize contest (B3) and accounts can draw review questions. Keep the 13+ statement. If the prize stays, limit it to adults.
- **Rule:** [FTC COPPA FAQ](https://www.ftc.gov/business-guidance/resources/complying-coppa-frequently-asked-questions).

### M6. Sign in with Apple
- **Status:** OK.
- **Evidence:** Apple, Google and email-code sign-in are offered (`src/app/privacy/page.tsx:61`, `public/_worker.js:4269-4395`). Sign in with Apple is one of the options. That meets 4.8.
- **Rule:** [Apple 4.8 Login Services](https://developer.apple.com/app-store/review/guidelines/#login-services).

### M7. Gambling and odds content
- **Status:** OK, with one note.
- **Evidence:** there is no sportsbook integration, and betting news is filtered out (`scripts/prebake-news.mjs:381-391`). The "Odds" tab shows playoff-chance percentages from ESPN (`src/components/PlayoffPictureModal.tsx:75`, `src/lib/playoffPicture.ts:299-311`).
- **Fix:** rename the "Odds" tab to "Chances" so reviewers do not read it as betting.
- **Effort:** S. **Who:** code.
- **Rule:** [Apple 5.3](https://developer.apple.com/app-store/review/guidelines/#gaming-gambling-and-lotteries), [Play gambling policy](https://support.google.com/googleplay/android-developer/answer/9877032).

### M8. Sports data sources and licensing claims
- **Status:** unclear.
- **Evidence:**
  - The store text says data comes from "publicly available sports websites" (`APP_STORE_SUBMISSION.md:55`). It does not claim a licence. Keep it that way.
  - ESPN, MLB and Reddit terms allow only non-commercial use (`BACKLOG.md:1257`).
  - Reddit is read through public Redlib mirrors (`scripts/prebake-news.mjs:1577-1598`).
  - Facts such as schedules and scores are not protected by copyright ([Feist v. Rural](https://supreme.justia.com/cases/federal/us/499/340/)).
- **Fix:** none needed for a free launch. Talk to a lawyer before any paid tier or sponsorship.
- **Who:** lawyer (later).

### M9. Supporter links and perks (Ko-fi, Patreon)
- **Status:** unclear.
- **Evidence:** the support links are web-only and start on 2026-12-15 (`src/lib/supportLinks.ts:1-8,39-42`). The Wall of Fame "supporter perks" sentence (`src/app/wall-of-fame/page.tsx:90`) also shows inside the iOS and Android apps.
- **Fix:** keep the links out of the native apps. Ask whether mentioning paid perks inside the apps counts as steering to an outside purchase; the rules differ by storefront. Add perk terms (H3).
- **Who:** owner.
- **Rule:** [Apple 3.1.1 and 3.1.3](https://developer.apple.com/app-store/review/guidelines/#payments), [Play Payments policy](https://support.google.com/googleplay/android-developer/answer/9858738).

### M10. Governing law and operator identity
- **Status:** unclear.
- **Evidence:** New Jersey law and courts (`src/app/terms/page.tsx:109-113`). No operator name or legal entity is given anywhere, by the owner's choice (`src/app/about/page.tsx:8-13`).
- **Fix:** ask a lawyer whether the terms and privacy policy must name the operator (GDPR Art. 13(1)(a) requires the controller's identity). An LLC or a registered-agent address can keep a home address private.
- **Who:** lawyer.

---

## Product Hunt

### P1. Product Hunt launch rules
- **Status:** to do.
- **Evidence:** a launch is planned (`BACKLOG.md:842-858`).
- **Checklist:**
  1. Do not ask anyone to upvote: not on X, Reddit, email or in the app. Ask people to "check it out and leave a comment" instead.
  2. No vote rings, paid votes, or new accounts made to vote.
  3. Post a maker comment at launch: who made it, why, what is free, and the data it collects (link `/privacy`).
  4. Disclose that you are the maker. Use demo-mode screenshots (B6) and the "not affiliated" line (M1).
  5. Do not offer a reward for votes. A Wall of Fame perk or bracket prize must not be tied to Product Hunt activity.
- **Who:** owner.
- **Sources:** [Product Hunt: How to launch](https://www.producthunt.com/launch), [Launch Guide](https://www.producthunt.com/launch/guide). The search found these pages, but they could not be opened from the audit environment. Read the current guide before launch day.

---

## Sources checked in the repo

- Terms, privacy, about, contact, FAQ, Wall of Fame: `src/app/{terms,privacy,about,contact,faq,wall-of-fame}/page.tsx`
- Store metadata: `APP_STORE_SUBMISSION.md`, `APP_STORE_METADATA_ARCHIVE.md`, `PLAY_STORE_SUBMISSION.md`, `playstore/submission.md`, `playstore/screenshots/`, `screenshots/`
- Data flows: `src/app/layout.tsx`, `src/instrumentation-client.ts`, `public/_worker.js`, `src/lib/prefsSync.ts`, `src/components/FeedbackBox.tsx`, `src/components/SettingsPanel.tsx`, `migrations/`, `wrangler.toml`
- Media and logos: `src/components/VideoModal.tsx`, `scripts/lib/media-policy.mjs`, `src/lib/news.ts`, `src/lib/teamLogos.ts`, `src/lib/radio.ts`, `public/logos/`, app icon assets
