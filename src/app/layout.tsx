import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import BootBeacon from "./boot-beacon";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const SITE_TITLE = "HideScore — Spoiler-Free Sports Scores & Highlights | NBA, NFL, NHL, MLB";
const SITE_DESC =
  "Spoiler-free sports scores and highlights. Check NBA, MLB, NHL, NFL, soccer, and golf without seeing the score. Game ratings tell you if it's worth watching before you hit play.";

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
    // The one locale signal the Open Graph block was missing — the site already
    // declares its language everywhere else (<html lang="en">, and inLanguage on
    // every JSON-LD node). og:locale lets social unfurlers (Facebook, LinkedIn,
    // Slack, iMessage) render a locale-appropriate preview for the homepage, the
    // canonical share target. en_US is the OG-spec format (underscore, not "en").
    locale: "en_US",
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
    // The googleBot block opts into the most permissive preview limits Google
    // offers: "large" image previews and unbounded text snippets. HideScore's
    // core content is spoiler-free video highlights, yet the one preview lever
    // that governs VIDEO — max-video-preview — was the lone omission, so Google
    // fell back to its conservative default clip length for any video result.
    // -1 means "no limit", matching the intent of the image/snippet directives
    // beside it so all three preview types are treated the same.
    googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1, "max-video-preview": -1 },
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
  width: "device-width",
  initialScale: 1,
  // Lock out pinch/double-tap zoom in the Capacitor WebView — an accidental
  // pinch left the page scaled and panned, showing blank strips top/bottom.
  // Mobile Safari ignores user-scalable=no, so browser zoom still works.
  maximumScale: 1,
  userScalable: false,
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
      // Tie this product node to the publishing Organization below via its @id,
      // so the four sibling @graph nodes read as one linked entity instead of
      // four unrelated ones. `publisher` is a valid CreativeWork property, and
      // referencing the Organization's @id is schema.org's standard node-linking
      // pattern — it tells crawlers "HideScore the app is published by HideScore
      // the Organization," strengthening entity/knowledge-panel understanding.
      publisher: { "@id": "https://hidescore.com/#organization" },
    },
    {
      // No SearchAction: the site has no URL-driven search endpoint (team
      // search is local state, never a ?q= route), so a Sitelinks Searchbox
      // target would point nowhere — and Google retired that feature in late
      // 2024. A broken SearchAction earns no rich result and risks a Search
      // Console structured-data error, so the WebSite node stands on its own.
      "@type": "WebSite",
      // Stable @id so per-page WebPage nodes (the SEO landing pages' own
      // JSON-LD) can point isPartOf at this exact site entity instead of
      // re-declaring a second, @id-less WebSite for the same URL. Google merges
      // every JSON-LD block on a page into one graph, so the reference resolves
      // here and both blocks read as one WebSite — same node-linking pattern the
      // publisher/#organization references above use.
      "@id": "https://hidescore.com/#website",
      name: "HideScore",
      url: "https://hidescore.com",
      inLanguage: "en",
      // Same publisher link as the WebApplication node — points the site entity
      // at the Organization's @id below (schema.org node reference).
      publisher: { "@id": "https://hidescore.com/#organization" },
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
      // Same publisher link the WebApplication/WebSite nodes carry — points this
      // iOS app node at the Organization's @id below so all three product nodes
      // read as one linked entity, not three unrelated ones. `publisher` is a
      // CreativeWork property and MobileApplication is a CreativeWork subtype,
      // so it's valid here for the exact reason it's valid on WebApplication;
      // this node was the lone product outlier still missing the link.
      publisher: { "@id": "https://hidescore.com/#organization" },
    },
    {
      // No Android MobileApplication node: the Google Play listing is still a
      // non-public closed test (the footer's Play badge stays commented out in
      // HomeContent, and the "iOS only" copy is the shipped truth). Declaring it
      // here would advertise a native app crawlers/users following the URL can't
      // install. Restore this node alongside the iOS one when Play goes public.
      "@type": "Organization",
      // Stable @id so the WebApplication/WebSite nodes above can reference this
      // Organization as their `publisher`, linking the @graph into one entity.
      "@id": "https://hidescore.com/#organization",
      name: "HideScore",
      url: "https://hidescore.com",
      // Google lists `description` as a recommended Organization property — it
      // feeds the entity/knowledge-panel understanding of who publishes the
      // site. Every sibling node here already carries rich metadata; this one
      // was the lone outlier. Reuse SITE_DESC so the brand summary stays in one
      // place and matches the <meta name="description"> and OG/Twitter copy.
      description: SITE_DESC,
      logo: "https://hidescore.com/icon-512.png",
      sameAs: [
        "https://apps.apple.com/app/hidescore/id6766885311",
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
        {/* Playing a highlight in the embedded player (VideoModal) injects the
            YouTube iframe API script from www.youtube.com and then mounts a
            www.youtube.com/embed iframe — the app's core "watch highlights
            without spoilers" interaction. Resolve that host's DNS during HTML
            parse so the lookup isn't the first thing blocking the connection
            when the user taps a highlight. dns-prefetch only, NOT preconnect:
            the player loads on demand (only for visitors who open a clip), so a
            warmed TCP+TLS socket would idle unused for everyone who doesn't —
            the same idle-socket reasoning as the weserv proxy and analytics
            hosts. (Thumbnails/posters are routed through weserv above, so this
            covers the player connection itself, not the images.) */}
        <link rel="dns-prefetch" href="https://www.youtube.com" />
        {/* The www.youtube.com/iframe_api script the player injects (VideoModal)
            is only a tiny loader — it in turn pulls the real YouTube widget API
            and the embed player's static assets (www-widgetapi.js, base.js, CSS,
            sprites) from s.ytimg.com. So a highlight play hits a SECOND host the
            www.youtube.com prefetch above doesn't cover; warm its DNS too, on the
            same on-demand path, so neither lookup blocks the connection when the
            user taps a clip. dns-prefetch only, for the same idle-socket reason
            as the www.youtube.com hint above (the player loads only for visitors
            who open a clip, so a warmed TCP+TLS socket would idle unused). */}
        <link rel="dns-prefetch" href="https://s.ytimg.com" />
        {/* The game-detail modal's venue weather (lib/weather.ts) is warmed on
            card hover/pointerdown (prefetchGameWeather) — it geocodes the venue
            via geocoding-api.open-meteo.com then pulls the forecast from
            api.open-meteo.com. Resolve both hosts' DNS during HTML parse so the
            lookup isn't the first thing blocking the connection when the user
            hovers a card, shaving the "weather pops in a beat late" delay the
            prefetch already targets. dns-prefetch only, NOT preconnect: weather
            fetches only for visitors who hover/open a game, so a warmed TCP+TLS
            socket would idle unused for everyone who doesn't — the same on-demand
            idle-socket reasoning as the youtube/ytimg hints above. */}
        <link rel="dns-prefetch" href="https://geocoding-api.open-meteo.com" />
        <link rel="dns-prefetch" href="https://api.open-meteo.com" />
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
        {/* sizes="any" marks the SVG as scalable so browsers prefer it over the
            fixed 16/32px PNGs above — the crisp, DPI-independent tab icon. It's
            the same monkey glyph the PNGs raster, so there's no visual change,
            just a sharper icon on hi-DPI displays (and on the static SEO/legal
            pages, which don't run HomeContent's runtime favicon swap). */}
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" sizes="any" />
        {/* The asset is 180×180; declaring sizes makes the hint explicit, matching
            the favicon PNGs above (iOS already uses this icon either way). */}
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
        <link rel="manifest" href="/manifest.json" />
        {/* theme-color is emitted from the `viewport` export above (light/dark) */}
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-title" content="HideScore" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        {/* iOS Safari Smart App Banner. The site already promotes the HideScore
            iOS app everywhere else — the footer "also on the App Store" link, the
            MobileApplication JSON-LD node above, the manifest's sameAs — but this
            was the one surface still missing Apple's own native banner, the
            highest-intent install prompt (it deep-links to Open when the app is
            already installed, App Store otherwise). app-id is the same App Store
            ID (6766885311) used by those other references, so app promotion stays
            consistent across every surface. Safety: the banner is a Safari.app
            feature — WKWebView (the Capacitor native wrapper) does NOT render it,
            so users already inside the app never see a "get the app" bar; on
            desktop and non-Safari browsers the tag is silently ignored. It's slim,
            native Safari chrome above the page (not part of the layout) and is
            user-dismissible, so it changes no in-page design or behavior. */}
        <meta name="apple-itunes-app" content="app-id=6766885311" />
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
        {/* Spoiler-blur news media by DEFAULT, pre-paint — only reveal when the
            user has explicitly turned Media on (revealNewsMedia===true). Without
            this early class the effect in HomeContent applies blur only after
            hydration, flashing an unblurred (spoiler) preview for one frame on
            cold loads (Jacob 7/16 — blur on by default). */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('nss-preferences');var reveal=false;if(t){var p=JSON.parse(t);reveal=p.revealNewsMedia===true}if(!reveal){document.documentElement.classList.add('blur-news-media')}}catch(e){document.documentElement.classList.add('blur-news-media')}})()`,
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
        {/* Self-heal watchdog. Recovers a wedged install with no user action —
            no "delete & reinstall the app" step. Two triggers, both engine- and
            SW-version-independent because this runs inline in every network-first
            HTML document the app fetches on launch:
              1. A /_next/ script or stylesheet fails to load (stale HTML still
                 referencing a chunk hash that a later deploy removed — the exact
                 blank-screen wedge that has forced the sw-vN bumps).
              2. The app never signals a successful boot (BootBeacon sets
                 window.__HS_OK once the React tree hydrates); if it is still
                 unset 8s after load, the bundle failed to run and the screen is
                 blank.
            On either, unregister every service worker + delete every cache +
            reload once. sessionStorage rate-limits to one heal per 30s so a
            genuinely offline device can't reload-loop. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){var HK='hs-heal-ts';function heal(){try{var last=+(sessionStorage.getItem(HK)||0);if(Date.now()-last<30000)return;sessionStorage.setItem(HK,String(Date.now()));}catch(e){}var rl=function(){try{location.reload()}catch(e){}};var js=[];try{if('serviceWorker'in navigator)js.push(navigator.serviceWorker.getRegistrations().then(function(rs){return Promise.all(rs.map(function(r){return r.unregister()}))}));}catch(e){}try{if(window.caches)js.push(caches.keys().then(function(ks){return Promise.all(ks.map(function(k){return caches.delete(k)}))}));}catch(e){}if(js.length){Promise.all(js.map(function(p){return p.catch(function(){})})).then(rl,rl);setTimeout(rl,2500);}else rl();}window.addEventListener('error',function(e){var t=e&&e.target;if(t&&(t.nodeName==='SCRIPT'||t.nodeName==='LINK')){var s=t.src||t.href||'';if(s.indexOf('/_next/')>-1)heal();}},true);window.addEventListener('load',function(){setTimeout(function(){try{if(navigator.onLine===false)return;if(!window.__HS_OK)heal();}catch(e){}},8000);});})()`,
          }}
        />
      </head>
      <body className="antialiased">
        <BootBeacon />
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
          data-website-id="bd9fa6f3-8754-4ca6-b439-f9e2bdeec66d" data-domains="hidescore.com,www.hidescore.com"
        />
        {/* PWA service worker — prod only; in dev it caches stale chunks and breaks hydration */}
        {process.env.NODE_ENV === "production" && (
          <script
            dangerouslySetInnerHTML={{
              __html: `if('serviceWorker' in navigator){window.addEventListener('load',function(){navigator.serviceWorker.register('/sw-v13.js').catch(function(){})})}`,
            }}
          />
        )}
      </body>
    </html>
  );
}
