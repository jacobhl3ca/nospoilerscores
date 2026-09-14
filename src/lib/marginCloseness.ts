// Score margin → a 0-100 "how close is this game" number. This is the shared
// input to all three of the rating's closeness factors (final margin, running
// margin across periods, margin entering the final period) — see
// calculateRating in espn.ts.
//
// Most sports get the straight line the ratings have always used: every point
// of margin costs `multiplier`, calibrated per sport in SPORT_RATING_CONFIG.
// A straight line assumes points arrive one at a time. That holds for
// basketball and hockey and is simply false for football, where they arrive in
// chunks of 3, 6, 7 and 8 — so the number that decides whether a football game
// is still live is not the margin, it is how many SCORES the margin is worth.
//
// The straight line put a 7-0 game — the most ordinary "anyone's game" score in
// the sport — on 65, four under GOOD, and badged it MEH. Jacob called it on a
// live NCAAF card (9/4): "its 7-0 very common? maybe good for that".
//
// Football's curve reads the margin the way the game is actually watched:
//
//     margin  closeness  what it takes to tie
//     0       100        nothing
//     3        85        a field goal
//     8        72        a touchdown and the two-point conversion (one score)
//     16       40        two scores
//     24       14        three scores
//     32+       0        out of reach
//
// with straight lines between the knots. Two things about the shape carry the
// whole idea, and both are asserted in tests/margin-closeness.test.ts:
//
//   * 3 → 8 is the FLAT stretch. Inside one score the exact margin barely
//     changes how the game watches, so 3, 6, 7 and 8 all sit in GOOD or above.
//   * 8 → 16 is the CLIFF. Crossing out of one score is the moment a football
//     game genuinely changes, and each point of margin costs about 1.5× as much
//     closeness there as on the flat stretch (4.0 per point against 2.6).
//
// Past three scores it flattens again: 31 down and 38 down watch the same.
//
// A leaf module on purpose. espn.ts can't be loaded by the `node --test` unit
// runner (its extensionless "./types" import), so anything that needs direct
// tests lives out here — same reason pollRank.ts and sessionVisits.ts exist.

/** Knots of a piecewise-linear margin → closeness curve, in ascending margin. */
export type ClosenessCurve = readonly (readonly [margin: number, closeness: number])[];

/** Football (NFL and college): closeness by how many scores it takes to tie. */
export const FOOTBALL_CLOSENESS: ClosenessCurve = [
  [0, 100],
  [3, 85],
  [8, 72],
  [16, 40],
  [24, 14],
  [32, 0],
];

/** Linear interpolation along the knots; flat outside either end. */
function alongCurve(margin: number, curve: ClosenessCurve): number {
  const first = curve[0];
  if (margin <= first[0]) return first[1];
  for (let i = 1; i < curve.length; i++) {
    const [x0, y0] = curve[i - 1];
    const [x1, y1] = curve[i];
    if (margin <= x1) return y0 + ((margin - x0) / (x1 - x0)) * (y1 - y0);
  }
  return curve[curve.length - 1][1];
}

/**
 * How close a margin reads, 0-100. Pass a `curve` for a sport that scores in
 * chunks (football); everything else takes the straight `multiplier` line.
 * Margins may be fractional — the running-margin factor averages across
 * periods — and the result is always clamped into [0, 100].
 */
export function marginCloseness(
  margin: number,
  multiplier: number,
  curve?: ClosenessCurve | null,
): number {
  const m = Math.abs(margin);
  const raw = curve ? alongCurve(m, curve) : 100 - m * multiplier;
  return Math.max(0, Math.min(100, raw));
}
