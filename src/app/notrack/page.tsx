import type { Metadata } from "next";
import { NoTrackToggle } from "@/components/NoTrackToggle";

export const metadata: Metadata = {
  title: "Don't count my visits | HideScore",
  robots: { index: false, follow: false },
};

export default function NoTrackPage() {
  return <NoTrackToggle />;
}
