import type { Metadata } from "next";
import SeoLandingPage from "@/components/SeoLandingPage";

// Shipped 2026-09-20. UFC had zero impressions over the prior 90 days because
// no page existed to earn them, and combat sports are the clearest delayed-
// viewing case after motorsport: one Saturday card is nine to thirteen fights
// spread over five or six hours, and each finish is published the moment it
// happens.
//
// ⚠️ WHAT THE UFC COLUMN ACTUALLY IS — see the UFC branch of fetchLeagueEvent
// in espn.ts and FightBout in types.ts before editing. Every BOUT becomes its
// own card (ESPN orders them prelims-first, so the list is reversed to put the
// main event on top). A bout card carries the weight class, both fighters with
// their records, and a state of scheduled / Live / Final. FightBout has no
// winner field at all, so no result is ever rendered — the claim is "never
// printed", not "hidden behind a tap". There is NO excitement rating either:
// ratings come from a score margin (marginCloseness.ts) and a fight has none.
// Highlights resolve strictly against UFC_HIGHLIGHT_CHANNELS in EventCard.tsx
// ("UFC on Paramount+", "UFC", "ESPN MMA") with deliberately NO search
// fallback, so a missing cut hides the button rather than serving a fan reel.
//
// Cards, venues, bout counts, segment times and the broadcaster below are
// verified against ESPN's mma/ufc/scoreboard feed on 2026-09-20
// (dates=20260920-20261115). Segment times are when each block starts; the main
// event closes its block, so it lands hours after the time quoted for it.
//
// ⚠️ The page names the next four cards and says so — the feed ALSO carries
// Fight Nights on Oct 10, Oct 17, Oct 31 and Nov 7, plus a Dana White's
// Contender Series every Tuesday. Do not reword this into "the next cards" and
// leave the list at four.
//
// ⚠️ EventDetailModal.tsx drops the external ESPN button only once an event is
// post. On a LIVE card it is still there, and an ESPN fightcenter page prints
// the prelim results that have already happened. So the honest claim is that
// the board records no result, NOT that nothing can reach one.
const TITLE = "UFC Results Without Spoilers: Watch the Card Before You Know | HideScore";
const DESC =
  "Follow a UFC fight card without seeing who won. Every bout is listed with no result printed anywhere, and highlights open with the title masked. Free.";
const CANONICAL = "/ufc-results-without-spoilers";

const FAQ = [
  {
    q: "Can I check a UFC fight card without seeing the results?",
    a: "Yes. Each bout on the card becomes its own entry showing the weight class, both fighters and their records, and whether the fight is upcoming, live or over. No winner is printed anywhere, so you can look up who fought on Saturday and still sit down to watch it properly.",
  },
  {
    q: "What are the next UFC cards in 2026?",
    a: "UFC Fight Night: Rosas Jr. vs. Barcelos is in Las Vegas on Saturday, September 26, eleven bouts with prelims from 5:00 pm ET and the main card at 8:00. UFC 332: Silva vs. Wang follows in Salt Lake City on October 3, thirteen bouts. UFC 333: Volkanovski vs. Evloev is in Abu Dhabi on October 24, and UFC 334: Gane vs. Hokit comes to New York on November 14. Between those, Fight Nights land on October 10, October 17, October 31 and November 7, with a Contender Series card most Tuesdays. Paramount+ carries all of them in the US.",
  },
  {
    q: "Why is a fight card so hard to avoid being spoiled on?",
    a: "Because it is not one result, it is a dozen. Thirteen fights over six hours means thirteen separate moments where a finish is posted, clipped and pushed, and a knockout in the third prelim will reach you hours before you have started watching. Every one of those notifications is a spoiler for a card you were saving.",
  },
  {
    q: "The Abu Dhabi card runs in the morning. How does that work?",
    a: "UFC 333 on October 24 starts at 10:00 am ET, with the middle block at noon and the main card at 2:00 pm. That is a Saturday daytime event for an American audience, finished long before the hour anyone associates with fight night — which means the result has an entire evening to find you before you sit down with it.",
  },
  {
    q: "Are the UFC highlights on the card safe to open?",
    a: "They are the safest way to get to them. A bout's highlight resolves only against the UFC's own channels, with no wider search behind it, so a fight with no official cut simply shows no button rather than offering a fan re-upload with the finish in its title. The clips that do resolve open with the title masked.",
  },
  {
    q: "Does the main event really land after midnight?",
    a: "On the domestic cards, effectively yes. The main card is the last block of the night and the headline bout closes it, so a 9:00 pm ET main card start — UFC 334 in New York on November 14 — puts the walkouts for the main event somewhere close to midnight. That is why so many people watch it the next day, and why the card needs to keep quiet until they do.",
  },
  {
    q: "Does HideScore show fighter records?",
    a: "Yes. Both fighters' records sit on the bout card alongside the weight class, and a career figure tells you what kind of fight to expect rather than how this one went. The records come from the live feed, so if the promotion updates one quickly after a result, a very attentive reader could infer something from it — the fight itself is never recorded either way.",
  },
  {
    q: "How do I add UFC to my board?",
    a: "Open Settings and pick UFC from the league list. It is not one of the columns chosen for you, so it stays off until you add it and then stays on. Boxing sits in the same list if you follow both.",
  },
  {
    q: "Is HideScore free?",
    a: "Yes. HideScore is free on the web and in the iPhone app, and it works without an account. Signing in only syncs your league columns and preferences across devices.",
  },
];

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  keywords: [
    "ufc results no spoilers",
    "ufc fight card without spoilers",
    "ufc results without spoilers",
    "spoiler free ufc",
    "ufc without spoilers",
    "watch ufc replay without knowing the result",
    "next ufc card 2026",
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

export default function UfcResultsWithoutSpoilersPage() {
  return (
    <SeoLandingPage
      h1="UFC results without spoilers"
      intro={[
        "Yes, you can look up a UFC card without spoilers: HideScore lists every bout with the fighters, their records and whether the fight has happened — and prints no result on any of them.",
        "A fight card is the densest spoiler risk in sport. Thirteen bouts run back to back for the best part of six hours, and each finish is posted within seconds of the referee waving it off. If you plan to watch on Sunday, you are not avoiding one result on Saturday night. You are avoiding thirteen, spread across six hours, on every app you own.",
        "The board takes the opposite approach to a results page. Each bout appears in its own right, main event first, with the weight class and both fighters' records to tell you what the fight is — and with no winner, no method and no round recorded anywhere on it.",
        "The headline cards through the autumn are Rosas Jr. vs. Barcelos in Las Vegas on September 26, UFC 332 in Salt Lake City on October 3, UFC 333 in Abu Dhabi on October 24 and UFC 334 in New York on November 14, with a Fight Night on most of the Saturdays in between.",
      ]}
      sections={[
        {
          h: "Thirteen fights, six hours, thirteen chances to be told",
          p: "UFC 332 in Salt Lake City has thirteen bouts, with the earliest at 4:00 pm Eastern and the main card opening at 8:00. Nobody watches all of it live. The moment you check a phone in the middle of that stretch, whatever has already finished is waiting for you, which is why the useful thing is a card list that knows what happened and declines to say.",
        },
        {
          h: "Nothing to reveal, because nothing was written down",
          p: "There is no covered result to tap on a bout. The record the column keeps has no field for a winner at all, so a layout change, a share link or a preview has nothing to leak. What you get is the matchup, the weight class, the records and a status of scheduled, live, or done. One caveat worth knowing: while a card is still running, the link out to the event page is live, and that page does list the prelims that have already finished.",
        },
        {
          h: "Morning cards are the quiet trap",
          p: "UFC 333 runs from Abu Dhabi on October 24, starting at 10:00 am Eastern with the main card at 2:00 pm. An American fan who has mentally filed fight night under Saturday night will spend that whole day unguarded, and by the evening the card is old news. International events are where a covered board saves you the most.",
        },
        {
          h: "Highlights from the UFC's own channels, or none at all",
          p: "Fight highlights are the single worst thing to search for. The re-upload economy around them lives on the finish, so the title, the thumbnail and the first frame all carry it. A bout's highlight button here is restricted to the promotion's own channels with no wider search behind it — if there is no official cut, the button is simply absent, which is the right failure.",
        },
        {
          h: "Records tell you what the fight is, not how it went",
          p: "A career record is background rather than news: it describes a fighter across years, which is what makes a result-free fight list usable. You can tell a debut from a title eliminator and choose what to watch on that basis, with the outcome still ahead of you. The figures come straight from the live feed, so treat a freshly updated record the way you would treat any other number that moves on a Saturday night.",
        },
        {
          h: "Where to watch, and how to add the column",
          p: "Paramount+ carries the promotion in the United States, and the feed lists it on every card through the autumn. UFC is not one of the leagues picked automatically, so open Settings, add it once, and the column stays with your board from then on.",
        },
      ]}
      bullets={[
        "Every bout listed with no winner, method or round recorded anywhere.",
        "Main event first, prelims below, with weight class and records.",
        "Highlights restricted to the promotion's own channels — no fan re-uploads.",
        "The button hides when there is no official cut, rather than guessing.",
        "Built for morning cards from Abu Dhabi and midnight main events at home.",
        "Add the UFC column from Settings and it stays on your board.",
      ]}
      ctaLabel="Open UFC without spoilers"
      ctaHref="/today"
      links={[
        { href: "/f1-without-spoilers", label: "F1" },
        { href: "/no-spoiler-scores", label: "No-spoiler scores" },
        { href: "/watch-sports-highlights-without-spoilers", label: "All highlights" },
        { href: "/spoiler-free-sports", label: "Spoiler-free sports" },
        { href: "/best-spoiler-free-sports-sites", label: "Compare the apps" },
        { href: "/faq", label: "FAQ" },
      ]}
      faq={FAQ}
      schemaName={TITLE}
      schemaDescription={DESC}
      canonical={CANONICAL}
      about={["UFC results without spoilers", "spoiler-free UFC", "UFC fight card without spoilers"]}
    />
  );
}
