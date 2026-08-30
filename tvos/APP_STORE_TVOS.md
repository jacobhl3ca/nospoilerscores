# HideScore — Apple TV listing copy

Platform `TV_OS` inside app `6766885311`. Name, subtitle, age rating, price and
categories are app-level and carry over from iOS; everything below is the tvOS
version's own.

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

## Support / marketing URL
https://hidescore.com

## Review notes
HideScore for Apple TV is a native tvOS app (SwiftUI), not a web wrapper.

What it does: it shows the day's schedule with every score hidden, and gives each finished game a 0-100 "worth watching" rating derived only from how close the game was. The rating is spoiler-safe by construction — it never reveals the winner or the margin. Revealing a score is an explicit press of Select on the game.

Content: scores and schedules are read at the user's request from publicly available scoreboard feeds. The app does not relay, host, cache for redistribution, or rebroadcast any third-party video or audio. There is no playback of any kind in the app.

Privacy: no accounts, no sign-in, no analytics, no tracking, no advertising. Preferences are stored in UserDefaults on the device.

Metadata: the description and keywords deliberately contain no league or team names, and the screenshots were captured in an anonymized demo mode that replaces every team, league and broadcaster with placeholders, so no third-party mark appears in the listing.
