// The one GREAT/GOOD/MEH/SKIP chain (10/17). The score card, the golf
// leaderboard, the detail modal and the schedule lines all read it, so the
// same rating can never get two words (an 82 once read GOOD on the card and
// GREAT in the modal).
export type RatingTierLabel = "GREAT" | "GOOD" | "MEH" | "SKIP";

export function ratingTier(rating: number): { label: RatingTierLabel; bg: string } {
  if (rating >= 85) return { label: "GREAT", bg: "bg-green-600" };
  if (rating >= 70) return { label: "GOOD", bg: "bg-yellow-600" };
  if (rating >= 50) return { label: "MEH", bg: "bg-orange-600" };
  return { label: "SKIP", bg: "bg-red-700" };
}
