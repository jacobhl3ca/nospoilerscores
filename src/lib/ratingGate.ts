// The one rating gate for both the full game card and the playoff pairing
// cover (Jacob 9/30), so the two can never disagree: live or final, a real
// rating, ratings on (auto mode already folds its noon ET rule into
// showRatings), and no live delay (the badge returns once play resumes).
// A plain module, not GameCard.tsx, so the unit tests can import it.
import type { Game } from "@/lib/types";

export function shouldShowRating(game: Pick<Game, "state" | "statusDetail" | "rating">, showRatings: boolean): boolean {
  const isDelayed = game.state === "in" && /delay/i.test(game.statusDetail);
  return showRatings && (game.state === "post" || game.state === "in") && game.rating !== null && !isDelayed;
}
