import type { Metadata } from "next";
import SeoLandingPage from "@/components/SeoLandingPage";
import WatchAnyLink, { WatchPasteBox } from "@/components/WatchAnyLink";

// /watch — paste any YouTube highlight link and watch it with the title
// covered. Added 2026-09-24. The same page is the target of /watch?v=<id>
// and /watch?url=<link> deep links, the PWA share target (manifest.json) and
// the Android share intent (MainActivity), all read client-side in
// WatchAnyLink. The og:image stays the generic one: the worker only swaps in
// the YouTube thumbnail on "/", and that thumbnail is usually the result.

const TITLE = "Watch Any YouTube Highlight Without Spoilers | HideScore";
const DESC =
  "Paste any YouTube highlight link. HideScore covers the title and plays the clip in its own player, so a link from the group chat does not spoil the game.";
const CANONICAL = "/watch";

// The iCloud link to the "Open in HideScore" Shortcut. Null until the
// Shortcut is published; the copy below describes it without a link until then.
const IOS_SHORTCUT_URL: string | null = null;

const FAQ = [
  {
    q: "Which links work?",
    a: "Any YouTube video link: youtube.com/watch, youtu.be, Shorts, live and embed links, from the app or the website. You can also paste the whole message a share sheet gives you; HideScore finds the link inside it.",
  },
  {
    q: "What does HideScore hide?",
    a: "The video title is covered until HideScore has read it and found no score in it, and the clip plays in HideScore's own player instead of on a YouTube page full of titles, comments and suggested videos.",
  },
  {
    q: "Can I send a link straight from my phone?",
    a: IOS_SHORTCUT_URL
      ? "On iPhone, add the Open in HideScore Shortcut and pick it from the share sheet. On Android, share the video and pick HideScore."
      : "On iPhone, a Shortcut can do it: take the share sheet input, URL-encode it, and open hidescore.com/watch?text= followed by the encoded text. On Android, share the video and pick HideScore.",
  },
  {
    q: "Can I share the clip on?",
    a: "Yes. Copy the address bar or use Copy link in the player. The link opens the same clip on HideScore with the title covered, and its preview shows the HideScore card, not the video thumbnail.",
  },
];

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  keywords: [
    "watch youtube highlights without spoilers",
    "hide youtube video title",
    "spoiler free youtube highlights",
    "watch highlight link without spoilers",
  ],
  alternates: { canonical: CANONICAL },
  openGraph: {
    title: TITLE,
    description: DESC,
    url: `https://hidescore.com${CANONICAL}`,
    siteName: "HideScore",
    // See the note on the same field in /watch-sports-highlights-without-spoilers.
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

// Runs before the landing paints: a link that carries a video hides the
// landing so it does not flash before the player opens. WatchAnyLink removes
// the attribute again when the link turns out not to parse.
const PENDING_SCRIPT = `(function(){try{if(/[?&](v|url|text|title)=[^&]/.test(location.search)){document.documentElement.setAttribute('data-watch-pending','')}}catch(e){}})()`;

export default function WatchPage() {
  return (
    <>
      <style>{`html[data-watch-pending] .watch-landing{display:none}`}</style>
      <script dangerouslySetInnerHTML={{ __html: PENDING_SCRIPT }} />
      <WatchAnyLink>
        <SeoLandingPage
          h1="Watch any highlight link without spoilers"
      subject="Watch any link"
          lead={
            <div className="mx-auto max-w-2xl">
              <p className="mb-4">
                Paste any highlight link. HideScore covers the title and plays it here.
              </p>
              <WatchPasteBox />
            </div>
          }
          intro={[
            "A friend sends a YouTube link. Opening it on YouTube shows the title, which often has the score, plus a column of suggested videos that name the winner.",
            IOS_SHORTCUT_URL
              ? "On iPhone, add the Open in HideScore Shortcut to your share sheet."
              : "On iPhone, a Shortcut in your share sheet can open any link here.",
            "On Android, share the video from YouTube and pick HideScore.",
          ]}
          sections={[
            {
              h: "The title stays covered",
              p: "HideScore reads the clip's real title before it shows it. If the title has a score in it, it stays covered for the whole clip.",
            },
            {
              h: "No suggested videos",
              p: "The clip plays in HideScore's own player, with no comments, no suggested-video column and no end screen of other results.",
            },
          ]}
          bullets={[
            "Works with youtube.com, youtu.be, Shorts and live links.",
            "Paste the whole shared message; HideScore finds the link.",
            "The link you share on shows the HideScore card, not the video thumbnail.",
          ]}
          ctaLabel="See yesterday's games"
          ctaHref="/yesterday"
          links={[
            { href: "/watch-sports-highlights-without-spoilers", label: "Spoiler-free highlights" },
            { href: "/how-to-watch-sports-highlights-without-spoilers", label: "How to watch without spoilers" },
            { href: "/no-spoiler-scores", label: "No-spoiler scores" },
          ]}
          faq={FAQ}
          schemaName={TITLE}
          schemaDescription={DESC}
          canonical={CANONICAL}
          about={["youtube highlights without spoilers", "spoiler-free sports highlights", "hidden video titles"]}
        />
      </WatchAnyLink>
    </>
  );
}
