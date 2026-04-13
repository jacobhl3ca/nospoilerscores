import type { Metadata } from "next";
import HomeContent from "@/components/HomeContent";

export const metadata: Metadata = {
  title: "Today's Sports Scores — No Spoilers | HideScore",
  description:
    "Today's NBA, MLB, NHL, and NFL games without spoilers. See which games are worth watching before the score is revealed.",
  alternates: { canonical: "/today" },
  openGraph: {
    title: "Today's Sports Scores — No Spoilers | HideScore",
    description: "Today's games, spoiler-free. Ratings tell you what's worth watching.",
    url: "https://hidescore.com/today",
  },
};

export default function TodayPage() {
  return <HomeContent initialOffset={0} />;
}
