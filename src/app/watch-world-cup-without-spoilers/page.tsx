import type { Metadata } from "next";
import Link from "next/link";
import DocTopBar from "@/components/DocTopBar";

const TITLE = "How to Watch the 2026 World Cup Without Spoilers | HideScore";
const DESC =
  "A simple guide to following the 2026 FIFA World Cup spoiler-free: a schedule that prints no score, ratings that name no winner, and how to watch on delay.";
// Guide publish / last-revised dates (the file's real git create + last-edit
// days). Single source of truth: the openGraph article:* tags below AND the
// Article JSON-LD's datePublished/dateModified both read these, so the two
// freshness signals can never drift. Bump MODIFIED whenever the copy here
// meaningfully changes.
const PUBLISHED = "2026-06-23";
const MODIFIED = "2026-08-16";

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  keywords: [
    "how to watch the world cup without spoilers",
    "world cup no spoilers",
    "avoid world cup spoilers",
    "watch world cup on delay",
    "world cup spoiler free",
    "2026 world cup schedule",
    "world cup hidden scores",
  ],
  alternates: { canonical: "/watch-world-cup-without-spoilers" },
  // No `robots` override: metadata is shallowly merged, so a child `robots`
  // object fully replaces the root layout's — which would drop its googleBot
  // directives (max-image-preview:large, max-snippet:-1). index/follow is
  // already inherited from the layout, so this page stays indexable AND keeps
  // the richer snippet/image-preview hints (matches /faq and /privacy).
  openGraph: {
    title: TITLE,
    description: DESC,
    url: "https://hidescore.com/watch-world-cup-without-spoilers",
    siteName: "HideScore",
    // og:locale matches the site-level Open Graph block in layout.tsx and the
    // World Cup/date/SEO-landing routes. A page's openGraph replaces the parent's
    // wholesale (Next merges metadata per top-level field, not deep), so without
    // this the page emitted no og:locale for social unfurlers (Facebook/
    // LinkedIn/Slack/iMessage). en_US is the OG-spec format (underscore, not "en").
    locale: "en_US",
    type: "article",
    // Emit article:published_time / article:modified_time / article:author so
    // this OG "article" carries the same freshness + authorship signals as the
    // Article JSON-LD below (previously it declared type:"article" but shipped
    // none of the article:* meta that platforms read). Dates come from the
    // shared PUBLISHED/MODIFIED constants, so they stay in lockstep with the
    // JSON-LD.
    publishedTime: PUBLISHED,
    modifiedTime: MODIFIED,
    authors: ["HideScore"],
    images: [{ url: "https://hidescore.com/og-worldcup.png", width: 1200, height: 630, alt: "HideScore — watch the 2026 World Cup without spoilers" }],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESC,
    images: [{ url: "https://hidescore.com/og-worldcup.png", alt: "HideScore — watch the 2026 World Cup without spoilers" }],
  },
};

const FAQ: { q: string; a: string }[] = [
  {
    q: "Can I follow the World Cup without seeing the score?",
    a: "Yes. HideScore shows the full World Cup schedule and prints no score on any of it, so you can check what is on and what is coming up without learning any results.",
  },
  {
    q: "How do I know if a World Cup match was good without spoilers?",
    a: "HideScore gives each finished match a competitiveness rating from 0 to 100 that reflects how close and dramatic it was — without revealing who won. You can pick the classics to watch on delay and skip the blowouts, completely blind to the result.",
  },
  {
    q: "Is HideScore free?",
    a: "Yes. HideScore is completely free, with no ads, no account, and no tracking. Your favorite teams and preferences are stored only on your device.",
  },
  {
    q: "Is there a World Cup app?",
    a: "HideScore is a free app on the App Store and on Google Play, and also works in any web browser at hidescore.com/worldcup. Neither prints a score.",
  },
  {
    q: "What time are 2026 World Cup matches in the US?",
    a: "Most weekday group-stage matches kick off at 1, 4, and 7 PM ET, which lands in the middle of the US workday — one of the main reasons spoilers are so easy to stumble into. HideScore shows the full spoiler-free schedule so you can plan what to watch later.",
  },
];

const TIPS: { h: string; p: string }[] = [
  {
    h: "Mute keywords on social media",
    p: "On X and Instagram, mute words like the team names, “World Cup,” “FIFA,” “goal,” and common scorelines for the length of the tournament. Most accidental spoilers come from a single autoplay post.",
  },
  {
    h: "Turn off sports and news notifications",
    p: "A lock-screen push from a news or scores app is the fastest way to ruin a match. Disable notifications for those apps until you have watched.",
  },
  {
    h: "Go straight to the match, not the homepage",
    p: "YouTube, Google, and news homepages surface result-revealing thumbnails and headlines. Open your stream or HideScore directly instead of browsing to it.",
  },
  {
    h: "Tell your group chat you are on delay",
    p: "A quick “watching the 4pm game tonight, no spoilers please” heads off the most personal kind of spoiler.",
  },
  {
    h: "Use HideScore to plan what to watch",
    p: "Check the schedule and competitiveness ratings to choose the best matches to watch — without ever seeing a score.",
  },
];

export default function WatchWorldCupWithoutSpoilersPage() {
  return (
    <main
      className="mx-auto max-w-2xl px-4 doc-page text-[15px] leading-relaxed"
      style={{ color: "var(--text)" }}
    >
      <DocTopBar route="watch-world-cup-without-spoilers" subject="World Cup 2026" />
      <h1 className="text-2xl font-bold mb-4">How to watch the 2026 World Cup without spoilers</h1>

      <p className="mb-4" style={{ color: "var(--text-muted)" }}>
        The 2026 FIFA World Cup ran <strong style={{ color: "var(--text)" }}>June 11 to July 19</strong> across the
        United States, Canada, and Mexico — <strong style={{ color: "var(--text)" }}>104 matches</strong>, with most
        weekday games kicking off at 1, 4, and 7 PM ET, right in the middle of the workday. If you can&apos;t watch
        live, a single push notification, group-chat message, or autoplay clip can give away the result before you press
        play. Here is how to follow every game on your own schedule and keep the ending a surprise.
      </p>

      <h2 className="text-lg font-semibold mt-8 mb-2">Why World Cup spoilers are so hard to avoid</h2>
      <p className="mb-4" style={{ color: "var(--text-muted)" }}>
        Because the US is hosting, most weekday matches kick off in the afternoon — so a lot of fans are at work, and a
        lot of the world is asleep. Results then leak from everywhere at once: phone notifications, social feeds, news
        sites, betting odds, coworkers, and even the thumbnail on a highlight video. Watching the World Cup on delay
        only works if the place you check the schedule never states the score.
      </p>

      <h2 className="text-lg font-semibold mt-8 mb-2">The simplest fix: a schedule with no score on it</h2>
      <p className="mb-4" style={{ color: "var(--text-muted)" }}>
        <Link href="/worldcup" className="underline underline-offset-2" style={{ color: "var(--accent)" }}>
          HideScore&apos;s spoiler-free World Cup hub
        </Link>{" "}
        shows the entire schedule and prints no score on any match. There is no login, no tracking,
        and nothing to pay. It works in any browser at hidescore.com/worldcup and as a free app on iPhone and Android, so you can check
        what&apos;s on without risking the result.
      </p>

      <h2 className="text-lg font-semibold mt-8 mb-2">Know which matches are worth watching — without learning who won</h2>
      <p className="mb-4" style={{ color: "var(--text-muted)" }}>
        The hardest part of watching on delay is deciding which games are worth your time when you can&apos;t see the
        scores. HideScore solves this with a <strong style={{ color: "var(--text)" }}>competitiveness rating</strong>: a
        0–100 score of how close and dramatic each finished match was, shown <em>without revealing the result</em>. A
        90-rated group game was a classic; a 40 was probably one-sided. You get to watch the best matches first and skip
        the blowouts — completely blind to who won.
      </p>

      <h2 className="text-lg font-semibold mt-8 mb-2">The 2026 World Cup at a glance</h2>
      <ul className="mb-4 space-y-1.5 list-disc pl-5" style={{ color: "var(--text-muted)" }}>
        <li>48 teams, 104 matches, 16 host cities across the US, Canada, and Mexico.</li>
        <li>Group stage opened June 11; the tournament built to the final on <strong style={{ color: "var(--text)" }}>July 19</strong>.</li>
        <li>In the US, matches air on Fox / FS1 (English) and Telemundo / Universo (Spanish), with streaming on their apps.</li>
        <li>Most weekday matches kick off at 1, 4, and 7 PM ET — easy to miss live, easy to get spoiled.</li>
      </ul>

      <h2 className="text-lg font-semibold mt-8 mb-3">Five ways to avoid World Cup spoilers</h2>
      <ol className="mb-4 space-y-3 list-decimal pl-5">
        {TIPS.map((t) => (
          <li key={t.h}>
            <strong>{t.h}.</strong> <span style={{ color: "var(--text-muted)" }}>{t.p}</span>
          </li>
        ))}
      </ol>

      <h2 className="text-lg font-semibold mt-8 mb-3">Frequently asked questions</h2>
      <section className="space-y-5">
        {FAQ.map((item) => (
          <div key={item.q}>
            <h3 className="font-semibold mb-1">{item.q}</h3>
            <p style={{ color: "var(--text-muted)" }}>{item.a}</p>
          </div>
        ))}
      </section>

      <div
        className="mt-10 rounded-xl px-5 py-5 text-center"
        style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
      >
        <p className="font-semibold mb-3">Ready to watch the World Cup on your own schedule?</p>
        <Link
          href="/worldcup"
          className="inline-block rounded-lg px-5 py-2.5 font-semibold"
          style={{ background: "var(--accent)", color: "#fff" }}
          data-umami-event="wc-open-hub"
        >
          Open the spoiler-free World Cup hub →
        </Link>
        <p className="mt-3 text-xs" style={{ color: "var(--text-muted)" }}>
          Free · no account · no tracking ·{" "}
          <a
            href="https://apps.apple.com/app/hidescore/id6766885311"
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2"
            style={{ color: "var(--text-muted)" }}
            data-umami-event="install-appstore"
          >
            also on the App Store
          </a>
          {/* tip jar hidden for now 2026-06-24; restore by un-commenting:
          {" "}·{" "}
          <a
            href="https://ko-fi.com/jacobhl"
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-2"
            style={{ color: "var(--text-muted)" }}
          >
            support it ☕
          </a>
          */}
        </p>
      </div>

      <div className="mt-10 flex gap-4">
        <Link href="/" className="underline underline-offset-2" style={{ color: "var(--text-muted)" }} data-umami-event="doc-bottom-open-watch-world-cup-without-spoilers">
          ← Back to HideScore
        </Link>
        <Link href="/faq" className="underline underline-offset-2" style={{ color: "var(--text-muted)" }}>
          HideScore FAQ
        </Link>
      </div>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@graph": [
              {
                "@type": "Article",
                headline: "How to Watch the 2026 World Cup Without Spoilers",
                description: DESC,
                // Declare the article's content language, matching the inLanguage
                // signal the site adds to its other CreativeWork schema nodes (the
                // WebApplication/WebSite in layout, the WebPage nodes on the SEO
                // landing + World Cup team pages, and the FAQPage below). Article
                // is a CreativeWork subtype, so this is a valid locale hint that
                // keeps every schema node's language signal consistent site-wide.
                inLanguage: "en",
                // image is a recommended Article field for Google rich results;
                // reuse the page's OG card (a real, valid 1200×630 image).
                image: "https://hidescore.com/og-worldcup.png",
                // datePublished/dateModified are recommended Article fields —
                // they tell Google when the guide first went up and when it was
                // last revised, a freshness signal for the rich result. Dates
                // are the page file's real git create/last-edit days; bump
                // dateModified whenever the copy here meaningfully changes.
                // Shared with the openGraph article:* tags above (PUBLISHED /
                // MODIFIED) so the JSON-LD and OG freshness signals never drift.
                datePublished: PUBLISHED,
                dateModified: MODIFIED,
                author: { "@type": "Organization", name: "HideScore" },
                publisher: {
                  "@type": "Organization",
                  name: "HideScore",
                  logo: { "@type": "ImageObject", url: "https://hidescore.com/icon-512.png" },
                },
                mainEntityOfPage: "https://hidescore.com/watch-world-cup-without-spoilers",
                // Tie this guide into the site's WebSite entity (@id declared in
                // layout.tsx's @graph) rather than letting it read as a standalone
                // Article. `isPartOf` is a valid CreativeWork property and Google
                // merges every JSON-LD block on the page into one graph, so the
                // #website reference resolves against the layout's node — the same
                // node-linking the SeoLandingPage WebPage nodes already use to
                // point isPartOf at #website. This Article was the lone CreativeWork
                // on the site still not linked into that shared entity.
                isPartOf: { "@id": "https://hidescore.com/#website" },
              },
              {
                // BreadcrumbList lets Google render a Home › World Cup › this-guide
                // trail in the search result instead of the bare URL. The hierarchy
                // mirrors the page's own links (it points readers to /worldcup), so
                // the trail matches how the site is actually navigated.
                "@type": "BreadcrumbList",
                // Stable @id so the page node below can reference this exact list
                // (Google merges the page's JSON-LD into one graph, so the ref
                // resolves here) instead of leaving it a bare, @id-less list
                // floating beside the page it describes — the last route on the
                // site still emitting an orphan BreadcrumbList, matching the
                // /privacy, /faq, /worldcup/teams, and SeoLandingPage node-linking.
                "@id": "https://hidescore.com/watch-world-cup-without-spoilers#breadcrumb",
                itemListElement: [
                  { "@type": "ListItem", position: 1, name: "HideScore", item: "https://hidescore.com" },
                  { "@type": "ListItem", position: 2, name: "World Cup", item: "https://hidescore.com/worldcup" },
                  { "@type": "ListItem", position: 3, name: "Watch Without Spoilers", item: "https://hidescore.com/watch-world-cup-without-spoilers" },
                ],
              },
              {
                "@type": "FAQPage",
                // Anchor this Q&A node to the page's canonical URL and into the
                // shared WebSite entity. FAQPage is a WebPage subtype, so without a
                // `url`/`isPartOf` it floated as a SECOND, disconnected page node
                // beside the Article describing the exact same address — the lone
                // sibling in this @graph still left unlinked, after the Article
                // already carries isPartOf → #website. Anchoring it the same way
                // (the node-linking /faq, the SEO landing pages, and the World Cup
                // team pages already use) makes the two page nodes read as one
                // entity for this URL instead of two.
                url: "https://hidescore.com/watch-world-cup-without-spoilers",
                isPartOf: { "@id": "https://hidescore.com/#website" },
                // Point this page node at the BreadcrumbList above by @id — the
                // Article node is a CreativeWork (not a WebPage), so `breadcrumb`
                // can't validly sit on it; FAQPage is a WebPage subtype and is the
                // correct node to carry the breadcrumb reference, the same
                // WebPage→#breadcrumb node-linking every other route already uses.
                breadcrumb: { "@id": "https://hidescore.com/watch-world-cup-without-spoilers#breadcrumb" },
                // Same locale signal as the Article node above, matching the
                // inLanguage the FAQPage nodes already carry on /faq and the SEO
                // landing / World Cup team pages. FAQPage is a WebPage subtype, so
                // this is a valid locale hint.
                inLanguage: "en",
                mainEntity: FAQ.map((item) => ({
                  "@type": "Question",
                  name: item.q,
                  acceptedAnswer: { "@type": "Answer", text: item.a },
                })),
              },
            ],
          }).replace(/</g, "\\u003c"),
        }}
      />
    </main>
  );
}
