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
  },
};

export default function YesterdayPage() {
  return <HomeContent initialOffset={-1} />;
}
