import type { Metadata } from "next";
import HomeContent from "@/components/HomeContent";

export const metadata: Metadata = {
  title: "Tomorrow's Sports Schedule — No Spoilers | HideScore",
  description:
    "Tomorrow's NBA, MLB, NHL, and NFL schedule without spoilers. Plan which games to watch — spoiler-free previews and ratings.",
  alternates: { canonical: "/tomorrow" },
  openGraph: {
    title: "Tomorrow's Sports Schedule — No Spoilers | HideScore",
    description: "Tomorrow's games, spoiler-free.",
    url: "https://hidescore.com/tomorrow",
    siteName: "HideScore",
    type: "website",
    images: [{ url: "https://hidescore.com/og-image.png", width: 1200, height: 630 }],
  },
};

export default function TomorrowPage() {
  return <HomeContent initialOffset={1} />;
}
