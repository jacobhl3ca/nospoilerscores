// Second-chance inputs for the highlight bake's lookups (added 2026-10-09).
// Each one is tried only after the normal query missed, so a game the first
// query finds is resolved exactly as before.
//
// The live path mirrors the first two in src/lib/youtube.ts
// (highlightDateStrs, TEAM_NAME_SHORT_ALIASES); keep them in step.

// A US night game ends after midnight UTC, and some channels title the recap
// by the UTC day: WNBA "Aces vs Valkyries … October 8" for the 9:30 PM ET 10/7
// game. "Oct 7, 2026" found nothing, "Oct 8, 2026" found it. Returns the ET
// date, then the UTC date when it differs.
export function hlDateStrs(iso) {
  const fmt = (timeZone) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone });
  const et = fmt("America/New_York");
  const utc = fmt("UTC");
  return utc === et || utc === "Invalid Date" ? [et] : [et, utc];
}

// The short club name some channels use when the long alias finds nothing.
// URC titles its Cardiff recaps "Cardiff v Zebre Parma", so "Cardiff Rugby"
// (the HL_TEAM_ALIASES form) missed and "Cardiff" found it (2026-10-02).
export const HL_TEAM_SHORT_ALIASES = {
  "Cardiff Blues": "Cardiff",
};

// The [away, home] pairs to query, in order: the names as given, then the
// short aliases when either team has one.
export function hlNamePairs(away, home) {
  const shortAway = HL_TEAM_SHORT_ALIASES[away] ?? away;
  const shortHome = HL_TEAM_SHORT_ALIASES[home] ?? home;
  const pairs = [[away, home]];
  if (shortAway !== away || shortHome !== home) pairs.push([shortAway, shortHome]);
  return pairs;
}

// Where a one-letter misspelling of `variant` appears in `title` as a whole
// word, or -1. Both inputs are already normalized (lowercase, plain letters).
// TUDN titled Estonia–Luxembourg "Estonia vs Lexemburgo" (2026-10-03), one
// letter off its "luxemburgo". Deliberately narrow: a single-word variant of
// 7+ letters, a word of the same length, exactly one letter different. The
// caller also requires the OTHER team to match exactly.
export function hlTypoWordIndex(title, variant) {
  if (!variant || variant.length < 7 || /[^a-z]/.test(variant)) return -1;
  for (const m of String(title).matchAll(/[a-z]+/g)) {
    const word = m[0];
    if (word.length !== variant.length || word === variant) continue;
    let diff = 0;
    for (let i = 0; i < word.length && diff < 2; i++) if (word[i] !== variant[i]) diff++;
    if (diff === 1) return m.index;
  }
  return -1;
}
