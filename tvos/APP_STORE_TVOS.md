# HideScore — Apple TV listing copy

Platform `TV_OS` inside app `6766885311`. Name, subtitle, age rating, price and
categories are app-level and carry over from iOS; everything below is the tvOS
version's own.

**Privacy policy text is required for tvOS.** Apple TV cannot open a browser, so
App Store Connect wants the policy as text and not just a URL; a submission fails
with `ENTITY_ERROR.ATTRIBUTE.REQUIRED … privacyPolicyText` until it is set. It
lives on the *app info*, shared with the iOS listing, so keep it true of
HideScore as a whole and in step with `src/app/privacy/page.tsx`.

**⚠️ 4.1(a) rule:** no league or team names anywhere in this file. HideScore was
rejected twice for exactly that. Generic sport names only — see
`feedback_app_store_league_names`.

## Promotional text
Check what's on tonight and which of last night's games were actually close —
with every score hidden until you decide to look.

## Keywords
scores,spoiler free,no spoilers,highlights,schedule,baseball,basketball,hockey,soccer,football

## Description

HideScore turns your Apple TV into the board you check before you decide what to watch.

Every score is hidden by default. You see who played, when it started and which channel carried it — never the result. When you're ready, press Select and reveal it.

WORTH WATCHING
Finished games get a spoiler-free verdict: GREAT, GOOD, MEH or SKIP. It tells you how close a game was without telling you who won or by how much. Sort last night's slate by it and you'll never sit through a blowout again.

TONIGHT
Tonight's board, sport by sport, with start times and the channel carrying each game. Live games are marked LIVE — with the score still hidden.

PICK YOUR SPORTS
More than thirty competitions across baseball, basketball, football, hockey, soccer, rugby and cricket. Leagues that are out of season get out of the way on their own.

BUILT FOR THE REMOTE
Shelves you flick through, a board that reads from across the room, and one press to reveal a score when you actually want it.

No account. No sign-in. No tracking. Nothing collected.

—
HideScore is an independent app and is not affiliated with, endorsed by, or sponsored by any team, league, broadcaster, or sports organization. All scores and schedules are sourced from publicly available sports websites.

## What's new
The Home screen's Top Shelf now shows last night's closest games and tonight's slate — with every score still hidden. Highlight HideScore in your top row and pick a game to open it straight from the Home screen.

Also in this version: a live game's card keeps itself up to date, finished games no longer show season records, the type reads larger from across the room, and postponed or exhibition games stay off the board.

## Support / marketing URL
https://hidescore.com

## Review notes
HideScore for Apple TV is a native tvOS app (SwiftUI), not a web wrapper.

What it does: it shows the day's schedule with every score hidden, and gives each finished game a 0-100 "worth watching" rating derived only from how close the game was. The rating is spoiler-safe by construction — it never reveals the winner or the margin. Revealing a score is an explicit press of Select on the game.

Content: scores and schedules are read at the user's request from publicly available scoreboard feeds. The app does not relay, host, cache for redistribution, or rebroadcast any third-party video or audio. There is no playback of any kind in the app.

Privacy: no accounts, no sign-in, no analytics, no tracking, no advertising. Preferences are stored in UserDefaults on the device.

Metadata: the description and keywords deliberately contain no league or team names, and the screenshots were captured in an anonymized demo mode that replaces every team, league and broadcaster with placeholders, so no third-party mark appears in the listing.

## Privacy policy text

HideScore Privacy Policy — last updated 2026-08-06. The current version is always at https://hidescore.com/privacy

HideScore is built to hide sports scores until you choose to see them. We never sell your personal information and never share it for advertising.

WHAT THE APPLE TV APP COLLECTS
Nothing. The Apple TV app has no account and no sign-in, shows no ads, and contains no advertising or analytics trackers. The leagues you turn on and your view preferences are stored on your Apple TV in the app's own storage. tvOS may sync a small amount of that storage between your own Apple devices through your iCloud account; it is never sent to us.

NETWORK REQUESTS
To draw the board, your Apple TV fetches publicly available scores and schedules from third-party sports sources, primarily ESPN, and fetches HideScore's own league list from hidescore.com. Those services receive your IP address and standard request information, as they would for any network request. We do not log or store those requests, and we send them nothing that identifies you.

THE WEBSITE AND MOBILE APPS
HideScore also runs at hidescore.com and as iPhone and iPad apps. Those use privacy-friendly, cookieless analytics (GoatCounter and a self-hosted Umami instance) that record only aggregate page views, and Sentry for crash and error reports — an error message, a stack trace, and basic device details, never tied to your identity and never used for advertising. They also offer an optional sign-in, with Apple, Google, or a six-digit code sent to your email, that syncs your favorite teams and settings across devices; if you use it we store the email address, the identity record, your session, your saved preferences, and basic account timestamps, and deleting your account in Settings erases the server copy. None of this applies to the Apple TV app, which has no sign-in.

CHILDREN
HideScore is not directed at children under 13, and we do not knowingly collect personal information from children under 13. If you believe a child has provided us personal information, contact us and we will delete it.

THIRD-PARTY CONTENT
HideScore shows publicly available information from third-party sports providers. HideScore is not affiliated with, endorsed by, or sponsored by ESPN, MLB, NBA, NHL, NFL, the NCAA, FIFA, or any team, league, or broadcaster. All trademarks and logos belong to their respective owners.

CHANGES
If this policy changes, the updated version will be posted at https://hidescore.com/privacy with a new "Last updated" date.

CONTACT
hi@hidescore.com
