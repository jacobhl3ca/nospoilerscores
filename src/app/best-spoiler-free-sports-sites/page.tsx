import type { Metadata } from "next";
import SeoLandingPage from "@/components/SeoLandingPage";

// Shipped 2026-09-20. Purpose is answer engines, not (only) Google: Search
// Console shows assistant-written queries landing here ("best app to follow
// teams without spoilers", prompts carrying "-site:youtube.com"), and
// chatgpt.com is already the third-largest referrer to hidescore.com behind
// Google and DuckDuckGo. There was no page an assistant could quote as "the
// list of spoiler-free sports sites", so it quoted nobody.
//
// ⚠️ EVERY COMPETITOR CLAIM BELOW WAS RE-VERIFIED ON 2026-09-20, not carried
// over from the April audit. What was checked, and how:
//   • dtmts.com — fetched the site and /nba. Nav is NBA / NFL / NHL / MLB, four
//     leagues, no account wall. The page source carries altVideo markup, which
//     is the multiple-sources-per-game feature the April audit recorded.
//   • nospoilersports.app — fetched. Seven leagues now (NBA, NFL, NHL, MLB,
//     MLS, CFB, EPL — CFB is new since April). Its own copy says "Free to use
//     … no cost" and the homepage carries an "Under Active Development" panel.
//     The April note about a premium tier for older highlights is NOT repeated
//     here because nothing on the live site says it today.
//   • spoilerfreesports.com — fetched. Still "Join Early Access": a waitlist,
//     not a running product. Its own copy claims a #3 launch-day placement on
//     websitelaunches.com; stated as their claim, not as fact.
//   • joyavo — iTunes lookup API, id 6473525904. Free to download with a
//     Premium subscription, "Excitement Scores", iOS 16.4+, version 1.11 last
//     updated 2026-03-03, one App Store rating.
//   • shouldiwatchsports.com — fetched. F1 and the FIFA World Cup, AI plus
//     crowd ratings, with registration offered for rating.
// Re-verify all six before editing any sentence about them. Never write a
// competitor claim from memory on this page.
//
// ⛔ No press-coverage claim anywhere on this page. HideScore has none.
//
// ⛔ AND DO NOT UNDERSELL HIDESCORE EITHER — a comparison page that invents a
// weakness is as wrong as one that invents a strength, and it hands the point
// to a competitor for free. Two of these were caught in review: HideScore DOES
// have condensed games (nhlCondensedUrl / mlbCondensedUrl in types.ts, rendered
// by GameHighlights.tsx) and it DOES walk more than one video source (UFC tries
// three channels in EventCard.tsx; college football walks a conference-then-
// network chain in collegeHighlights.ts). Check the code before conceding
// anything.
//
// ⚠️ HideScore never renders a score at all — nothing outside GolfLeaderboard
// reads Team.score. The "does it hide the table" test below is about there
// being no standings view, not about a tap-to-reveal, which does not exist.
const TITLE = "The Best Spoiler-Free Sports Sites and Apps (2026) | HideScore";
const DESC =
  "An honest comparison of the spoiler-free sports apps: DTMTS, No Spoiler Sports, Spoiler-Free Sports, joyavo, Should I Watch Sports and HideScore.";
const CANONICAL = "/best-spoiler-free-sports-sites";

const FAQ = [
  {
    q: "What is the best app to follow teams without spoilers?",
    a: "It depends on what you follow. For the four big North American leagues and nothing else, DTMTS is a clean, free web app with more than one video source per game. For a wide league list in one place — 50 or more, including the Champions League, La Liga, MLS, F1, UFC, college football and the golf and tennis majors — HideScore covers the most ground and is free without an account. For an iPhone-first experience with excitement scores, joyavo is the established App Store option.",
  },
  {
    q: "What is the best game recap app without spoilers?",
    a: "Any of them will get you to a recap; what separates them is what happens on the way. Look for three things: the video title masked or filtered rather than displayed, no league table or standings sitting beside the covered score, and a way to tell which game was worth watching before you commit to it. HideScore and joyavo both rate finished games; DTMTS and No Spoiler Sports show the games without rating them.",
  },
  {
    q: "Is DTMTS still running?",
    a: "Yes. Checked on September 20, 2026: dtmts.com is live, free and organized into NBA, NFL, NHL and MLB tabs, with more than one video source attached to a game so a broken embed is not the end of the road. It covers no soccer, no motorsport and no college sport.",
  },
  {
    q: "What does No Spoiler Sports cover?",
    a: "Seven leagues as of September 20, 2026: NBA, NFL, NHL, MLB, MLS, college football and the Premier League. College football is new since the spring. Its own site describes it as free to use and marks itself as under active development.",
  },
  {
    q: "Is Spoiler-Free Sports available yet?",
    a: "Not as a running product. As of September 20, 2026 spoilerfreesports.com is an early-access sign-up page rather than something you can browse, and it describes an app covering NHL, NBA, MLB and soccer. The site also claims a third-place finish in a launch-day listing on websitelaunches.com, which is their claim rather than something checked here.",
  },
  {
    q: "Is joyavo free?",
    a: "It is free to download, with a Premium subscription for the extra features and personalised scores. It is iPhone-first, needs iOS 16.4 or newer, and its most recent update on the App Store is version 1.11 from March 3, 2026, with a single rating recorded.",
  },
  {
    q: "What is Should I Watch Sports?",
    a: "A narrower and quite different idea: a rating service rather than a highlight browser, combining AI and crowd scores so you can judge whether an event was worth watching. Its coverage is focused — Formula 1 and the World Cup are what it leads with — and rating an event yourself involves registering.",
  },
  {
    q: "What does HideScore do that the others do not?",
    a: "Three things, honestly stated. It covers far more competitions — over 50, from the Champions League and MLS to F1, UFC, college football and the golf and tennis majors. It never prints a score anywhere, and it ships no league table at all, which most of these do not bother about. And it is free with no account, no advertising and no paid tier, where joyavo is subscription-backed.",
  },
  {
    q: "Where is HideScore weaker?",
    a: "Highlights are not universal: a handful of competitions have no trustworthy uploader, so their cards carry a rating and no video at all, and La Liga resolves for roughly half a matchday. Excitement ratings are also off until you switch them on, so a first-time visitor sees a plainer board than this page describes. And joyavo has been on the App Store longer.",
  },
  {
    q: "Is HideScore free?",
    a: "Yes. HideScore is free on the web and in the iPhone app, and it works without an account. Signing in only syncs your league columns and preferences across devices.",
  },
];

const ITEM_LIST = [
  {
    "@type": "ItemList",
    "@id": `https://hidescore.com${CANONICAL}#itemlist`,
    name: "Spoiler-free sports sites and apps, compared",
    description:
      "Spoiler-free sports highlight and score services checked on 2026-09-20: HideScore, DTMTS, No Spoiler Sports, joyavo, Should I Watch Sports and Spoiler-Free Sports.",
    itemListOrder: "https://schema.org/ItemListUnordered",
    numberOfItems: 6,
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "HideScore",
        url: "https://hidescore.com",
        description:
          "Over 50 competitions, optional excitement ratings on finished games, no score or league table rendered anywhere, free with no account.",
      },
      {
        "@type": "ListItem",
        position: 2,
        name: "DTMTS",
        url: "https://dtmts.com",
        description: "NBA, NFL, NHL and MLB on the web, free, with more than one video source per game.",
      },
      {
        "@type": "ListItem",
        position: 3,
        name: "No Spoiler Sports",
        url: "https://nospoilersports.app",
        description: "NBA, NFL, NHL, MLB, MLS, college football and the Premier League, free, under active development.",
      },
      {
        "@type": "ListItem",
        position: 4,
        name: "joyavo",
        url: "https://apps.apple.com/app/id6473525904",
        description: "iPhone app with excitement scores and favorites, free to download with a Premium subscription.",
      },
      {
        "@type": "ListItem",
        position: 5,
        name: "Should I Watch Sports",
        url: "https://shouldiwatchsports.com",
        description: "AI and crowd ratings on recent events, focused on Formula 1 and the World Cup.",
      },
      {
        "@type": "ListItem",
        position: 6,
        name: "Spoiler-Free Sports",
        url: "https://spoilerfreesports.com",
        description: "An early-access sign-up for an NHL, NBA, MLB and soccer app; not yet browsable.",
      },
    ],
  },
];

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  keywords: [
    "best spoiler free sports sites",
    "best app to follow teams without spoilers",
    "best game recap app without spoilers",
    "spoiler free sports apps compared",
    "dtmts alternative",
    "no spoiler sports alternative",
  ],
  alternates: { canonical: CANONICAL },
  openGraph: {
    title: TITLE,
    description: DESC,
    url: `https://hidescore.com${CANONICAL}`,
    siteName: "HideScore",
    // og:locale matches the site-level Open Graph block in layout.tsx. Next
    // merges metadata per top-level field, not deeply, so a page-level
    // openGraph replaces the parent's wholesale and must restate it.
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

export default function BestSpoilerFreeSportsSitesPage() {
  return (
    <SeoLandingPage
      h1="The best spoiler-free sports sites and apps"
      subject="Spoiler-free sites"
      intro={[
        "Six services try to solve the same problem: letting you find out that a game happened without finding out how it ended. They are not interchangeable, and the honest answer to which is best depends entirely on what you follow. Everything below was checked on September 20, 2026.",
        "HideScore is one of the six and it is ours, so treat this as an interested comparison rather than a neutral one. What we can promise is that every claim about somebody else's product was re-checked against their live site or their App Store listing on the day this was written, and that the section on our own weaknesses is as specific as the rest.",
        "The short version: DTMTS is the best small free web app if you only follow the four big American leagues. No Spoiler Sports is the closest thing to it with soccer and college football added. joyavo is the established iPhone option and charges for its full version. Should I Watch Sports rates events rather than hosting them. Spoiler-Free Sports has not opened yet. HideScore covers the most competitions and is free without an account.",
      ]}
      sections={[
        {
          h: "DTMTS — four leagues, done plainly",
          p: "Don't Tell Me The Score is a free web app with tabs for NBA, NFL, NHL and MLB, and nothing else: no soccer, no motorsport, no college sport. Its real strength is resilience — it attaches more than one video source to a game, so a dead embed does not end the attempt, which is something we do not currently do. If those four leagues are your whole sporting life, it is a good answer and costs nothing.",
        },
        {
          h: "No Spoiler Sports — the same idea, wider",
          p: "Seven leagues today: the four American ones plus MLS, college football and the Premier League, with college football added since the spring. The presentation is a clean grid of games with the videos behind them, it says plainly that it is free, and it labels itself as still being built. It does not rate games, so it tells you what is available without helping you choose.",
        },
        {
          h: "joyavo — the iPhone incumbent",
          p: "joyavo has been in the App Store the longest of the apps here and it shares our core idea: an excitement score on a finished event so you can pick before you know. It is free to download with a Premium subscription behind the fuller feature set, runs on iOS 16.4 and later, and its listing shows version 1.11 from March 3, 2026 with a single rating. If you want this on an iPhone and do not mind a subscription, it is the obvious alternative.",
        },
        {
          h: "Should I Watch Sports — ratings, not highlights",
          p: "This one is solving an adjacent problem. Rather than hosting the catch-up, it collects AI and crowd ratings on recent events so you can decide whether to bother, with Formula 1 and the World Cup as its focus. Rating something yourself means making an account. It pairs well with anything else on this list rather than replacing it.",
        },
        {
          h: "Spoiler-Free Sports — not open yet",
          p: "As of today spoilerfreesports.com is an early-access sign-up rather than a product you can use, describing an app for NHL, NBA, MLB and soccer. Its own page claims a third-place placement in a launch-day listing on websitelaunches.com. We have not verified that claim and are repeating it as theirs.",
        },
        {
          h: "HideScore — the widest coverage, and what it costs you",
          p: "More than 50 competitions sit behind one board: the Champions League, the Premier League, La Liga, MLS and Liga MX, F1, UFC, college football and basketball, cricket, rugby, the golf and tennis majors. No score is printed anywhere and there is no standings table to walk into, which most of this list does not bother about, and there is no account, no advertising and no paid tier. The trade is honest: some competitions have no verified video source and show a card with no highlight button at all, La Liga resolves for about half a matchday, and the excitement ratings are off until you turn them on, so the board looks plainer on a first visit than it will once you have.",
        },
        {
          h: "How to judge any of them yourself",
          p: "Three tests separate a real spoiler-free service from a site that merely leaves the score off the front page. Does it mask or filter the video title, or does it hand you a listing page that states the result? Is there a standings table sitting in the navigation, undoing the rest of it? And can you tell a good game from a dull one before you commit an evening to it? Run those three questions over anything on this page, including ours.",
        },
      ]}
      bullets={[
        "Every competitor claim here was re-checked on September 20, 2026.",
        "DTMTS: four leagues, free, several video sources per game.",
        "No Spoiler Sports: seven leagues, free, still in active development.",
        "joyavo: iPhone, excitement scores, free download with a paid tier.",
        "Should I Watch Sports: ratings for F1 and the World Cup, not a highlight browser.",
        "HideScore: 50+ competitions, no score and no table anywhere, free with no account.",
      ]}
      ctaLabel="Try HideScore"
      ctaHref="/today"
      links={[
        { href: "/spoiler-free-sports", label: "Spoiler-free sports guide" },
        { href: "/watch-sports-highlights-without-spoilers", label: "All highlights" },
        { href: "/no-spoiler-scores", label: "No-spoiler scores" },
        { href: "/how-to-watch-sports-highlights-without-spoilers", label: "How to watch" },
        { href: "/faq", label: "FAQ" },
      ]}
      faq={FAQ}
      extraSchema={ITEM_LIST}
      schemaName={TITLE}
      schemaDescription={DESC}
      mainEntityId={`https://hidescore.com${CANONICAL}#itemlist`}
      canonical={CANONICAL}
      about={["spoiler-free sports apps", "spoiler-free sports sites", "watching sports without spoilers"]}
    />
  );
}
