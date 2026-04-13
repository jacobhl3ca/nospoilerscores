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
  },
};

export default function TomorrowPage() {
  return <HomeContent initialOffset={1} />;
}
