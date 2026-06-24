import type { Metadata } from "next";
import HomeContent from "@/components/HomeContent";

const TITLE = "2026 World Cup — No Spoilers | HideScore";
const DESC =
  "Follow the 2026 FIFA World Cup without spoilers. 104 matches, June 11 – July 19. Watch every game on your own schedule — scores stay hidden, and competitiveness ratings tell you which matches were classics without revealing who won.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  keywords: [
    "world cup no spoilers",
    "spoiler free world cup",
    "2026 world cup schedule",
    "world cup scores hidden",
    "watch world cup on delay",
    "fifa world cup spoiler free",
  ],
  alternates: { canonical: "/worldcup" },
  openGraph: {
    title: TITLE,
    description: "The 2026 World Cup, spoiler-free. Watch on your own schedule — scores hidden until you tap.",
    url: "https://hidescore.com/worldcup",
    siteName: "HideScore",
    type: "website",
    images: [{ url: "https://hidescore.com/og-image.png", width: 1200, height: 630, alt: "HideScore — the 2026 FIFA World Cup, spoiler-free" }],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: "The 2026 World Cup, spoiler-free. Watch on your own schedule — scores hidden until you tap.",
    images: [{ url: "https://hidescore.com/og-image.png", alt: "HideScore — the 2026 FIFA World Cup, spoiler-free" }],
  },
};

export default function WorldCupPage() {
  // initialOffset 0 → land on today's / upcoming slate (not the morning
  // "yesterday" smart-default), so the hub always frames "what's on to watch."
  return <HomeContent initialOffset={0} worldCupHub />;
}
