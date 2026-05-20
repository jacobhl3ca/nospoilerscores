import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const SITE_TITLE = "HideScore — No Spoiler Sports Scores | Spoiler-Free NBA, MLB, NHL";
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
    images: [{ url: "https://hidescore.com/og-image.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESC,
    images: ["https://hidescore.com/og-image.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1 },
  },
};

export const viewport: Viewport = {
  themeColor: "#0a0a0a",
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
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    },
    {
      "@type": "WebSite",
      name: "HideScore",
      url: "https://hidescore.com",
      potentialAction: {
        "@type": "SearchAction",
        target: "https://hidescore.com/?q={search_term_string}",
        "query-input": "required name=search_term_string",
      },
    },
    {
      "@type": "MobileApplication",
      name: "HideScore",
      operatingSystem: "iOS",
      applicationCategory: "SportsApplication",
      url: "https://apps.apple.com/app/hidescore/id6766885311",
      installUrl: "https://apps.apple.com/app/hidescore/id6766885311",
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    },
    {
      "@type": "Organization",
      name: "HideScore",
      url: "https://hidescore.com",
      logo: "https://hidescore.com/icon-512.png",
      sameAs: ["https://apps.apple.com/app/hidescore/id6766885311"],
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
        <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png" />
        <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16.png" />
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#0a0a0a" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(JSON_LD).replace(/</g, "\\u003c"),
          }}
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('nss-preferences');if(t){var p=JSON.parse(t);if(p.theme==='dark'||p.theme==='light'){document.documentElement.setAttribute('data-theme',p.theme);return}}if(window.matchMedia('(prefers-color-scheme:dark)').matches){document.documentElement.setAttribute('data-theme','dark')}}catch(e){}})()`,
          }}
        />
      </head>
      <body className="antialiased">
        {children}
        {/* GoatCounter analytics — create hidescore site at goatcounter.com and update the URL */}
        <script
          data-goatcounter="https://hidescore.goatcounter.com/count"
          async
          src="//gc.zgo.at/count.js"
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
