import type { Metadata } from "next";
import HomeContent from "@/components/HomeContent";

export const metadata: Metadata = {
  title: "Yesterday's Sports Scores — No Spoilers | HideScore",
  description:
    "Yesterday's NBA, MLB, NHL, and NFL games without spoilers. Catch up on completed games — scores hidden, highlights one tap away.",
  alternates: { canonical: "/yesterday" },
  openGraph: {
    title: "Yesterday's Sports Scores — No Spoilers | HideScore",
    description: "Yesterday's completed games, spoiler-free. Tap to see scores or watch highlights.",
    url: "https://hidescore.com/yesterday",
    siteName: "HideScore",
    type: "website",
    images: [{ url: "https://hidescore.com/og-image.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Yesterday's Sports Scores — No Spoilers | HideScore",
    description: "Yesterday's completed games, spoiler-free. Tap to see scores or watch highlights.",
    images: ["https://hidescore.com/og-image.png"],
  },
};

export default function YesterdayPage() {
  return <HomeContent initialOffset={-1} />;
}
