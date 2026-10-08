import type { Metadata } from "next";
import SeoLandingPage from "@/components/SeoLandingPage";

// Shipped 2026-10-07. Jacob asked whether HideScore had a guide on avoiding
// spoilers by any means other than opening HideScore. It did not: the three
// how-to pages are HideScore-only steps, and the one list of outside tips (the
// five TIPS on /watch-world-cup-without-spoilers) is scoped to the World Cup.
// This is the evergreen page for "how to avoid sports spoilers" searches. Most
// of the work is phone, social and browser settings, so the page says so, and
// HideScore comes last.
//
// Steps are written as the words on the screen, not full menu paths, because
// menu paths move with every OS release.
//
// ⚠️ PLATFORM CLAIMS CHECKED ON 2026-10-07:
//   • X: muted words hide posts from the timeline and notifications.
//   • Instagram Hidden Words: custom words filter COMMENTS and MESSAGE REQUESTS
//     only (help.instagram.com 700284123459336), not the feed. Said plainly.
//   • Threads Hidden Words: filters Following, For You, search, profiles and
//     replies (expanded April 2024).
//   • Reddit: mutes whole communities (Home, Popular, notifications). No native
//     keyword mute for the feed, so the page does not claim one.
//   • YouTube TV: "Hide all scores for this team/league" under More on a team or
//     league page (support.google.com/youtubetv/answer/7641863). Fubo has a
//     live-scores off switch (support.fubo.tv 36558674556941). Apple TV app:
//     Show Sports Scores off (support.apple.com tvapp atvb2c74ee59).
//   • Redirector (Firefox): AMO listing live, v3.5.3. The Chrome Web Store
//     listing now returns "empty-title" (Manifest V2 removal), so the page
//     names Redirector for Firefox only. The import file format (a top-level
//     "redirects" array of Redirect.toObject() fields) was read from
//     einaregilsson/Redirector js/importexport.js + js/redirect.js.
//   • LeechBlock NG: live on AMO (1.8, updated 2026-09-27) and the Chrome Web
//     Store. Its "How to Block" section takes any URL to show instead of the
//     blocked site, which is how Chrome users redirect to HideScore.
//   • uBlock Origin: `||espn.com^$document` shows uBO's block page; `||` covers
//     every subdomain. uBlock Origin Lite (Chrome) takes custom rules as DNR
//     rules in its Develop tab, not uBO filter lines (uBOL-home discussion
//     #372), so the page sends Chrome users to LeechBlock NG.
//   • The Athletic: theathletic.com 301s to www.nytimes.com/athletic/ (curl,
//     10/7). Hosts and DNS blocks cannot block one path, so it is only in the
//     uBlock and LeechBlock lists.
//   • SelfControl (selfcontrolapp.com, v4.0.2, GPL): "Until that timer
//     expires, you will be unable to access those sites—even if you restart
//     your computer or delete the application."
//   • Cold Turkey pricing page: Free = block websites, timed blocks; Pro adds
//     scheduled blocks and locking.
//   • NextDNS: a denylist entry covers the domain and all subdomains; iPhone
//     via profile, Android via Private DNS.
//   • hBlock was considered for Linux and left out: it replaces the whole hosts
//     file by default.
//   • Safari redirect extensions: the App Store has several free ones, none
//     with a track record yet (Redirect Engine had 1 rating). None is named.
//   • iPhone Shortcuts: Personal Automation → App → "Is Opened" with Run
//     Immediately, then Open URLs. No confirm tap since iOS 17.
//   • Morning-after team alert: no app sends one. HideScore's Add to calendar
//     (CalendarButtons.tsx) and Remind me (lib/reminderLink.ts) are per game.
//
// ⛔ Do not name or link the Spoiler Shield extension (~/hidescore-extension):
// it is unpublished. Re-check a platform claim before editing its sentence.
const TITLE = "How to Avoid Sports Spoilers: Phone, Social and TV Settings | HideScore";
const DESC =
  "Turn off score alerts, mute words on X and Threads, block or redirect ESPN, and set up a morning reminder for your team without the result. Every step checked October 2026.";
const CANONICAL = "/how-to-avoid-sports-spoilers";

const FAQ = [
  {
    q: "How do I stop ESPN from sending me scores?",
    a: "Turn off notifications for the ESPN app in your phone's settings. On an iPhone, open Settings, then Notifications, then ESPN, and switch Allow Notifications off, and switch off Live Activities in the ESPN app's own settings page as well. On Android, long-press any ESPN notification and turn notifications off. Do the same for Apple Sports, Google, your team's app and any news app, since each one sends its own alerts.",
  },
  {
    q: "How do I block ESPN.com so I stop opening it?",
    a: "In Firefox, add the line ||espn.com^$document to My filters in uBlock Origin; it blocks every ESPN subdomain with a block page. In Chrome or Edge, add espn.com to a block set in the free LeechBlock NG extension. On a Mac, SelfControl blocks it in every browser until a timer ends, even across a restart. On an iPhone, iPad or Mac, open Screen Time, go to Content & Privacy, set Web Content to limit adult websites, and add espn.com under Never Allow. On Windows or Linux, the hosts file works if you list espn.com, www.espn.com and m.espn.com on separate lines. A blocker stops the habit tap; it does not stop a push alert, so turn those off too.",
  },
  {
    q: "Can I redirect ESPN to a spoiler-free site?",
    a: "Yes. In Firefox, the Redirector extension sends any espn.com page to hidescore.com, and HideScore has a ready-made rules file you can import. In Chrome or Firefox, LeechBlock NG can show any page you choose in place of a blocked site, so set it to https://hidescore.com. On an iPhone, a Shortcuts automation that runs when the ESPN app opens can open HideScore straight away.",
  },
  {
    q: "Is there a spoiler-free morning alert for my team?",
    a: "Not as a ready-made app, as of October 2026. What works today: add a game to your calendar from its HideScore card and move the alert to the next morning, or subscribe to a team schedule calendar that keeps titles like \"Mets vs Braves\" and never writes the result into the event. Many team and sports calendars do write the final score into the title once the game ends, so check one past game before you subscribe.",
  },
  {
    q: "How do I mute a team on X or Instagram?",
    a: "On X, open Settings, then Privacy and safety, then Mute and block, then Muted words, and add the team name, the nickname and words like final. On Instagram, Hidden Words only filters comments and message requests, not the feed, so mute or unfollow the team and league accounts for the season and tap Not interested on anything that slips through. Threads has its own Hidden Words list, and it does filter the feed and search.",
  },
  {
    q: "Does YouTube have a spoiler-free mode?",
    a: "Not the main YouTube app. Titles and thumbnails often show the result, and the home page recommends highlights the morning after a game. Turn autoplay off, use Don't recommend channel on the league and team channels you do not want pushed at you, and open a specific video from a link rather than from the home page. HideScore's /watch page opens any YouTube link with the title and thumbnail covered. YouTube TV is different: it has a Hide all scores switch on each team and league page.",
  },
  {
    q: "Are there browser extensions that hide sports spoilers?",
    a: "Yes, mostly general keyword blockers: you give them team names and they blur or remove any element on a page that contains one. They help on news sites and social feeds in a desktop browser. They cannot reach your phone's notifications or apps, they cannot read a score that sits inside an image or a video thumbnail, and a broad word list hides a lot of things you wanted to see.",
  },
];

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  keywords: [
    "how to avoid sports spoilers",
    "avoid sports spoilers",
    "how to avoid spoilers sports",
    "block espn",
    "redirect espn",
    "mute sports scores",
    "turn off score notifications",
    "spoiler free sports",
  ],
  alternates: { canonical: CANONICAL },
  openGraph: {
    title: TITLE,
    description: DESC,
    url: `https://hidescore.com${CANONICAL}`,
    siteName: "HideScore",
    locale: "en_US",
    type: "website",
    images: [{ url: "https://hidescore.com/og-image.png", width: 1200, height: 630, alt: TITLE }],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESC,
    images: [{ url: "https://hidescore.com/og-image.png", alt: TITLE }],
  },
};

export default function HowToAvoidSportsSpoilersPage() {
  return (
    <SeoLandingPage
      h1="How to avoid sports spoilers everywhere else"
      subject="Avoid sports spoilers"
      intro={[
        "Most sports spoilers do not come from a scores site. They come from a lock-screen alert, a post in a feed, a YouTube thumbnail, a group chat, or the tab you open out of habit. This guide covers the settings that close each of those, phone first, then social apps, the browser, the people around you and the TV.",
        "HideScore is ours, and it comes last on purpose. Every setting below was checked on October 7, 2026, and none of them needs HideScore.",
      ]}
      sections={[
        {
          h: "1. Turn off score and news push alerts",
          p: "This is the one that matters most. ESPN, Apple Sports, the Google app, your team's app, the league app and most news apps all send score alerts, and each has its own switch. On an iPhone, open Settings, then Notifications, pick the app and switch Allow Notifications off. On Android, long-press the alert when it next arrives and turn notifications off for that app. Check the app's own settings too: some keep sending game alerts from inside the app after you turn off breaking news.",
        },
        {
          h: "2. Mute words on X, Threads and Reddit",
          p: "On X, add the team name, the nickname, the rival, and words like final, goal and OT to Muted words. Muted posts leave your timeline and your notifications. Threads has a Hidden Words list that filters the feed, search and replies. Instagram's Hidden Words only filters comments and message requests, so on Instagram mute or unfollow the team and league accounts for the season instead. Reddit can mute whole communities, which takes their posts out of Home and Popular, but it has no keyword mute for the feed, so mute the team and league subreddits until you have caught up.",
        },
        {
          h: "3. Clear the lock screen and widgets",
          p: "A widget is an alert you never turned on. Remove any Sports, News or Scores widget from the lock screen and home screen, switch off Live Activities for sports apps (a live score that sits on the lock screen for the whole game), and turn off Siri Suggestions on the lock screen so it stops offering the scores app at full time. On Android, remove the sports card from the Google feed to the left of the home screen.",
        },
        {
          h: "4. Open the video, not the homepage",
          p: "YouTube, Google and news homepages put the result in a headline or a thumbnail. Go straight to the video you want from a bookmark or a link. On YouTube, turn autoplay off and use Don't recommend channel on the channels that post the highlights, so the morning after a game your home page is not a wall of results. In Google Discover, tap Not interested on the team card. A spoiler-free link viewer, such as HideScore's /watch page, opens a YouTube link with its title and thumbnail covered.",
        },
        {
          h: "5. Group chats and people",
          p: "Mute the group chat for the length of the game plus a few hours, and say once that you are watching on delay. Most people will hold off if you ask before the game, not after.",
        },
        {
          h: "6. Watching on delay on TV",
          p: "Live TV apps show the score in the guide, in thumbnails and in the progress bar. YouTube TV has a Hide all scores switch under More on each team or league page. Fubo can turn live scores off, and the Apple TV app has a Show Sports Scores setting you can switch off. Start a recording a few minutes early so you can skip the pregame show, which recaps other results, and choose the game from your recordings list rather than from the live guide.",
        },
        {
          h: "7. Block the sites you open out of habit",
          p: "If you type espn.com without thinking, block it. Pick the one method below that fits your device. They all take the same list: espn.com, bleacherreport.com, cbssports.com, sports.yahoo.com and foxsports.com, plus The Athletic (now at nytimes.com/athletic) and any league site you check by habit, such as nba.com, nfl.com, mlb.com or nhl.com.",
          steps: [
            {
              h: "Firefox, any computer: uBlock Origin (free, 30 seconds)",
              p: "Open the uBlock Origin dashboard, go to My filters, paste one line per site and click Apply changes. The $document part makes uBlock show its own block page for the whole site, not just hide its ads, and the || at the start covers every subdomain, so m.espn.com and www.espn.com are blocked too. In Chrome, uBlock Origin Lite takes custom rules in a different format, so in Chrome use LeechBlock NG (below) instead.",
              code: "||espn.com^$document\n||bleacherreport.com^$document\n||cbssports.com^$document\n||sports.yahoo.com^$document\n||nytimes.com/athletic^$document",
            },
            {
              h: "Chrome, Edge or Firefox: LeechBlock NG (free)",
              p: "Install LeechBlock NG (Edge can install it from the Chrome Web Store), open its options, paste the sites into the first block set, one per line, and choose when the block applies: all day, or the hours you are on delay. A lockdown option stops you from changing the set until the time runs out.",
              code: "espn.com\nbleacherreport.com\ncbssports.com\nsports.yahoo.com\nnytimes.com/athletic",
            },
            {
              h: "Mac, timed and hard to undo: SelfControl (free, open source)",
              p: "Add the sites to SelfControl's blocklist, set the slider to the length of your delay (the evening, or the whole game day) and click Start. Until the timer ends the sites stay blocked in every browser, even if you restart the Mac or delete the app, so set the timer with care. Cold Turkey Blocker does the same on Mac and Windows, and its free version blocks websites for a set time; scheduled daily blocks need the paid version.",
            },
            {
              h: "Windows: the hosts file",
              p: "Open Notepad as administrator, open C:\\Windows\\System32\\drivers\\etc\\hosts (set the file type to All files to see it), add the lines below at the end and save. Then open Command Prompt and run ipconfig /flushdns. Each name must be listed on its own line, because the hosts file does not cover subdomains, and it cannot block one path such as nytimes.com/athletic. Cold Turkey Blocker or LeechBlock NG are easier if you want a timer.",
              code: "0.0.0.0 espn.com\n0.0.0.0 www.espn.com\n0.0.0.0 m.espn.com\n0.0.0.0 bleacherreport.com\n0.0.0.0 www.bleacherreport.com",
            },
            {
              h: "Linux: /etc/hosts",
              p: "Add the same lines to /etc/hosts with sudo, then restart the browser. The same limit applies: every subdomain needs its own line, which is why uBlock Origin's ||espn.com^ rule, which covers all of them, is the simpler choice in Firefox.",
              code: "sudo nano /etc/hosts",
            },
            {
              h: "iPhone, iPad or Mac: Screen Time",
              p: "Open Screen Time, go to Content & Privacy, set Web Content to limit adult websites, and add the sites under Never Allow. A Screen Time passcode makes the habit tap fail instead of asking you to confirm. For the app, set an App Limit on ESPN or delete it for the season.",
            },
            {
              h: "Phone or whole home network: a filtering DNS",
              p: "NextDNS and AdGuard DNS both let you add your own sites to a block list. Add espn.com to the denylist and install the service's profile on an iPhone, or set it as Private DNS on Android. It then blocks the site and the ESPN app's data on Wi-Fi and cellular, and a block on espn.com includes every subdomain.",
            },
          ],
          note: "A blocker stops the habit tap; it does not stop a push alert, which is why step 1 comes first.",
        },
        {
          h: "8. Redirect the habit instead of blocking it",
          p: "A block page leaves you with nothing to do. A redirect sends the same tap somewhere safe. In Firefox, the Redirector extension can send every espn.com page to hidescore.com; HideScore has a ready-made rules file below that covers ESPN, CBS Sports, Yahoo Sports and Bleacher Report, which you import from Redirector's settings. In Chrome or Firefox, LeechBlock NG lets you type any address to show in place of a blocked site, so set it to https://hidescore.com. On an iPhone, open Shortcuts, create a personal automation that runs when the ESPN app is opened, set it to Run Immediately, and add an Open URLs action with https://hidescore.com. Safari has redirect extensions in the App Store as well, but none has a track record yet, so we do not name one.",
        },
        {
          h: "9. A morning reminder for your team, without the score",
          p: "No app sends a \"your team played last night\" alert without the result, as of October 2026. Three things come close. On any upcoming game in HideScore, Add to calendar puts the game on your calendar; move the event's alert to the next morning. Settings has a Reminder link that turns each upcoming game into a button for Shortcuts, Raycast or a to-do app. Or subscribe to a team schedule calendar with a default alert the next morning, but check one past game first: many schedule calendars rewrite the event title with the final score once the game ends. A HideScore team calendar feed that only ever says \"vs\" is on our list.",
        },
        {
          h: "10. Last: pick the game from a board with no score on it",
          p: "Once the alerts and feeds are quiet, you still need to find the game. A spoiler-free scoreboard such as HideScore lists yesterday's and today's games with no score, winner or standings on the page, and an optional rating tells you which game was worth watching. It is free, on the web, iPhone and Android, with no account.",
        },
      ]}
      bullets={[
        "Turn off notifications for ESPN, Apple Sports, the Google app and your team's app.",
        "Add the team name and words like final to X's Muted words.",
        "Switch off Live Activities and remove sports widgets from the lock screen.",
        "Mute the group chat until you have watched.",
        "Turn YouTube autoplay off.",
      ]}
      ctaLabel="Open a spoiler-free scoreboard"
      ctaHref="/yesterday"
      links={[
        { href: "/redirects/hidescore-redirector.json", label: "Redirector rules file (ESPN, CBS, Yahoo, BR → HideScore)" },
        { href: "/how-to-watch-sports-highlights-without-spoilers", label: "How to watch highlights without spoilers" },
        { href: "/watch", label: "Watch any YouTube link without spoilers" },
        { href: "/no-spoiler-scores", label: "No-spoiler scores" },
        { href: "/best-spoiler-free-sports-sites", label: "Spoiler-free sites compared" },
      ]}
      faq={FAQ}
      schemaName={TITLE}
      schemaDescription={DESC}
      canonical={CANONICAL}
      about={["avoid sports spoilers", "sports score notifications", "spoiler-free sports"]}
    />
  );
}
