import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const SITE_TITLE = "HideScore — Spoiler-Free Sports Scores & Highlights | NBA, NFL, NHL, MLB";
const SITE_DESC =
  "Spoiler-free sports scores and highlights. Check NBA, MLB, NHL, NFL, and golf without seeing the score. Game ratings tell you if it's worth watching before you hit play.";

export const metadata: Metadata = {
  title: SITE_TITLE,
  description: SITE_DESC,
  metadataBase: new URL("https://hidescore.com"),
  applicationName: "HideScore",
  keywords: [
    "no spoiler scores",
    "spoiler free sports",
    "spoiler free scores",
    "hide sports scores",
    "sports scores without spoilers",
    "no spoiler sports",
    "no spoiler NBA",
    "no spoiler MLB",
    "no spoiler NHL",
    "spoiler free highlights",
    "HideScore",
  ],
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: SITE_TITLE,
    description: SITE_DESC,
    url: "https://hidescore.com",
    siteName: "HideScore",
    type: "website",
    images: [
      {
        url: "https://hidescore.com/og-image.png",
        width: 1200,
        height: 630,
        alt: "HideScore — spoiler-free sports scores and highlights",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESC,
    images: [
      {
        url: "https://hidescore.com/og-image.png",
        alt: "HideScore — spoiler-free sports scores and highlights",
      },
    ],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1 },
  },
  // Stop iOS Safari (and the Capacitor WebView) from auto-linking the app's
  // pervasive time/date/number text. Every card, header subtitle, and date pill
  // is full of strings the OS eagerly turns into tappable blue links — game
  // times ("10:30 AM"), date labels ("Tue 5/2", "Round 3 of 4"), venue lines,
  // and bare numbers — which restyles the content out of the design and pops an
  // unwanted "Create Event"/dialer sheet on tap. Emits
  // <meta name="format-detection" content="telephone=no,date=no,address=no">;
  // no visual change on desktop, purely suppresses the mobile mis-detection.
  formatDetection: { telephone: false, date: false, address: false },
};

export const viewport: Viewport = {
  // Match the browser chrome to the page background per color scheme. The
  // default theme follows prefers-color-scheme (see the inline script below),
  // so a light-mode device should get the light --bg (#ffffff), not a dark bar.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
  viewportFit: "cover",
};

const JSON_LD = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebApplication",
      name: "HideScore",
      alternateName: ["No Spoiler Scores", "Spoiler Free Sports"],
      url: "https://hidescore.com",
      description: SITE_DESC,
      applicationCategory: "SportsApplication",
      operatingSystem: "Web",
      // Declare the content language on the site-level nodes, matching the
      // `<html lang="en">` above and the `inLanguage: "en"` already on the
      // per-page WebPage nodes (SeoLandingPage). Both WebApplication and
      // WebSite are CreativeWork subtypes, so this is a valid signal that helps
      // crawlers and voice assistants target the right locale.
      inLanguage: "en",
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    },
    {
      // No SearchAction: the site has no URL-driven search endpoint (team
      // search is local state, never a ?q= route), so a Sitelinks Searchbox
      // target would point nowhere — and Google retired that feature in late
      // 2024. A broken SearchAction earns no rich result and risks a Search
      // Console structured-data error, so the WebSite node stands on its own.
      "@type": "WebSite",
      name: "HideScore",
      url: "https://hidescore.com",
      inLanguage: "en",
    },
    {
      "@type": "MobileApplication",
      name: "HideScore",
      operatingSystem: "iOS",
      applicationCategory: "SportsApplication",
      url: "https://apps.apple.com/app/hidescore/id6766885311",
      installUrl: "https://apps.apple.com/app/hidescore/id6766885311",
      // Same locale signal the sibling WebApplication/WebSite nodes carry —
      // MobileApplication is a SoftwareApplication → CreativeWork subtype too,
      // so inLanguage is valid here and keeps all product nodes consistent.
      inLanguage: "en",
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    },
    {
      // The Android build ships on Google Play too (the footer links this exact
      // listing). Declare it alongside the iOS node so search engines see both
      // native apps, not just iOS — same shape as the node above.
      "@type": "MobileApplication",
      name: "HideScore",
      operatingSystem: "Android",
      applicationCategory: "SportsApplication",
      url: "https://play.google.com/store/apps/details?id=com.jacobhl.hidescore",
      installUrl: "https://play.google.com/store/apps/details?id=com.jacobhl.hidescore",
      inLanguage: "en",
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    },
    {
      "@type": "Organization",
      name: "HideScore",
      url: "https://hidescore.com",
      logo: "https://hidescore.com/icon-512.png",
      sameAs: [
        "https://apps.apple.com/app/hidescore/id6766885311",
        "https://play.google.com/store/apps/details?id=com.jacobhl.hidescore",
      ],
    },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={geistSans.variable} suppressHydrationWarning>
      <head>
        {/* Team & league logos load from ESPN's image CDN above the fold on
            nearly every game card. Warm the DNS + TCP + TLS connection before
            the parser reaches those <img> tags so the first logos paint sooner.
            No crossOrigin — plain <img> fetches are no-cors, so a CORS-mode
            preconnect would open a separate connection the images can't reuse.
            dns-prefetch is the fallback for browsers that ignore preconnect. */}
        <link rel="preconnect" href="https://a.espncdn.com" />
        <link rel="dns-prefetch" href="https://a.espncdn.com" />
        {/* The first paint is data-driven: on load the app immediately fetches
            the ESPN scoreboard from site.api.espn.com to fill every league
            column (BASE_URL in lib/espn.ts). Warm that host's DNS + TCP + TLS
            during HTML parse so the handshake is already done when React fires
            its first fetch, shaving it off the time-to-content path. Unlike the
            image preconnect above, this one carries crossOrigin — the data
            fetch is an anonymous CORS request (default mode, no credentials),
            and a CORS-mode preconnect only gets reused by a matching CORS
            connection; without it the browser would open a second one.
            dns-prefetch is the fallback for browsers that ignore preconnect. */}
        <link rel="preconnect" href="https://site.api.espn.com" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="https://site.api.espn.com" />
        {/* A SECOND ESPN API host is hit on that same first-paint load: the
            standings feed at site.web.api.espn.com (fetchStandingsRanks /
            fetchStandingsRecords in lib/espn.ts), kicked off inside fetchLeague
            for every RANK_LEAGUES column (NBA/MLB/NFL/NHL/…) to stamp the "#N"
            rank + W-L record onto team names. It's a different subdomain than
            site.api.espn.com above, so it needs its own connection — warm it
            here too. Same anonymous CORS request (plain fetch, no credentials),
            so it carries crossOrigin to match, with dns-prefetch as fallback. */}
        <link rel="preconnect" href="https://site.web.api.espn.com" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="https://site.web.api.espn.com" />
        {/* Every news-column and video-strip thumbnail is routed through the
            images.weserv.nl proxy (proxyImage in lib/news.ts) — the heaviest
            images on the board. Resolve its DNS during HTML parse so the first
            thumbnail's connection setup starts a round-trip sooner. Only a
            dns-prefetch here, NOT a full preconnect like the espncdn logos
            above: those logos are eager and above the fold, whereas these
            thumbnails are loading="lazy" and usually below it, so a warmed TCP+
            TLS socket would likely idle unused (and get closed) before any
            thumbnail requests it. DNS resolution is the cheap, always-useful
            part with no idle-socket cost. */}
        <link rel="dns-prefetch" href="https://images.weserv.nl" />
        {/* Both analytics tags (GoatCounter + Umami, at the end of <body>) fetch
            their loader script and then beacon a pageview on EVERY load — so
            these three hosts are always hit: gc.zgo.at (the GoatCounter loader),
            hidescore.goatcounter.com (its count beacon), and stats.hidescore.com
            (Umami's script + beacon). Resolve their DNS during HTML parse so the
            lookup isn't still pending when the deferred/on-load scripts fire.
            dns-prefetch only, NOT preconnect: the tags are async/deferred and
            non-blocking, so a warmed TCP+TLS socket could idle and get closed
            before they run — DNS resolution is the cheap, always-useful part
            with no idle-socket cost (same reasoning as the weserv proxy above).
            Unlike the lazy thumbnails there, these requests are guaranteed to
            fire, so the warmup is never wasted. */}
        <link rel="dns-prefetch" href="https://gc.zgo.at" />
        <link rel="dns-prefetch" href="https://hidescore.goatcounter.com" />
        <link rel="dns-prefetch" href="https://stats.hidescore.com" />
        <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png" />
        <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16.png" />
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <link rel="manifest" href="/manifest.json" />
        {/* theme-color is emitted from the `viewport` export above (light/dark) */}
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-title" content="HideScore" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(JSON_LD).replace(/</g, "\\u003c"),
          }}
        />
        {/* When the stored preference OVERRIDES the OS scheme (e.g. forces dark
            on a light-mode device), also correct the browser-chrome tint here so
            it matches on EVERY page. The two theme-color metas above are media-
            based (they follow prefers-color-scheme), so on an override they'd
            paint the toolbar for the OS scheme, not the rendered theme — a dark
            page under a light bar. HomeContent already fixes this at runtime, but
            only on the app board; the static pages (/faq, /privacy, the World Cup
            guide, error, 404) had no such sync. Doing it in this pre-paint script
            covers them all, pre-paint, with no flash. Only the override branch
            touches the metas — OS-following users keep the media-based metas
            untouched so they still track a live OS theme change. The metas exist
            in <head> before this script runs, so querySelectorAll finds them. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('nss-preferences');if(t){var p=JSON.parse(t);if(p.theme==='dark'||p.theme==='light'){document.documentElement.setAttribute('data-theme',p.theme);var c=p.theme==='dark'?'#0a0a0a':'#ffffff';var m=document.querySelectorAll('meta[name="theme-color"]');for(var i=0;i<m.length;i++){m[i].setAttribute('content',c)}return}}if(window.matchMedia('(prefers-color-scheme:dark)').matches){document.documentElement.setAttribute('data-theme','dark')}}catch(e){}})()`,
          }}
        />
        {/* Replay the last active view tab (scores/ratings/news) before paint so
            the right tab is highlighted on refresh — without this the static HTML
            paints with Scores active and flashes to Ratings once prefs load. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var v=localStorage.getItem('nss-last-view');if(v==='scores-plain'||v==='scores-rated'||v==='news'){document.documentElement.setAttribute('data-view',v);return}}catch(e){}document.documentElement.setAttribute('data-view','scores-plain')})()`,
          }}
        />
      </head>
      <body className="antialiased">
        {children}
        {/* GoatCounter analytics — create hidescore site at goatcounter.com and update the URL */}
        {/* Explicit https (not protocol-relative //) so the loader still resolves
            inside the Capacitor native WebView, where the page origin is
            capacitor://localhost — a // URL would resolve to capacitor://gc.zgo.at
            and fail to load. On the https website this is byte-identical (a //
            URL already inherits the page's https there). Matches the Umami tag
            below, which is likewise explicit-https. */}
        <script
          data-goatcounter="https://hidescore.goatcounter.com/count"
          async
          src="https://gc.zgo.at/count.js"
        />
        {/* Umami analytics — self-hosted on the Mac mini, privacy-first */}
        <script
          defer
          src="https://stats.hidescore.com/script.js"
          data-website-id="bd9fa6f3-8754-4ca6-b439-f9e2bdeec66d"
        />
        {/* PWA service worker — prod only; in dev it caches stale chunks and breaks hydration */}
        {process.env.NODE_ENV === "production" && (
          <script
            dangerouslySetInnerHTML={{
              __html: `if('serviceWorker' in navigator){window.addEventListener('load',function(){navigator.serviceWorker.register('/sw.js').catch(function(){})})}`,
            }}
          />
        )}
      </body>
    </html>
  );
}
