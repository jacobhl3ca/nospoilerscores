// Order of two RATED live games in the competitive sort. Rating first; on a
// tie, the game further along sits higher (Jacob 9/26: "I like ties, but later
// ties ranked higher"). The badge never changes — only the order does.
//
// Pure, with a type-only import, so the node unit runner can load it.
import type { Game } from "./types";

export function compareRatedLive(a: Pick<Game, "rating" | "liveProgress">, b: Pick<Game, "rating" | "liveProgress">): number {
  const byRating = (b.rating ?? 0) - (a.rating ?? 0);
  if (byRating !== 0) return byRating;
  return (b.liveProgress ?? 0) - (a.liveProgress ?? 0);
}
