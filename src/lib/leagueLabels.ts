// Short header forms for league labels too long to sit on one line in a narrow
// column. Keyed on the exact ALL_LEAGUES label; anything absent renders in full.
//
// Lives in lib/ rather than beside LeagueColumn so tests/league-labels.test.ts
// can read it: the component is .tsx, and node's type-stripping test runner
// cannot import JSX.
//
// The budget is 99px: a phone column measures 114px (three columns at every
// width — 390px viewport, measured on live 2026-09-01) minus the 11px ▾ chevron
// and the 4px gap it sits behind. Every label below busts it in Geist 700 /
// 16px / tracking-wide, and every short form here is measured under it. The two
// single-word labels ("Championship" 117px, "Libertadores" 105px) have no space
// to break at, so they overflowed the column rather than wrapping — same fix.
export const SHORT_LEAGUE_LABELS: Record<string, string> = {
  "Champions Cup": "Champ Cup",   // 128 → 94  (rugby)
  "Challenge Cup": "Challenge",   // 13 chars; the sibling of "Champ Cup", unmeasured (2026-09-27)
  "Prem Rugby": "PREM",           // 10 chars, past the 9-char proxy; the league's own brand
  "Championship": "EFL Champ",
  "Conference League": "UECL",    // 17 chars, well past the budget; matches the UCL/UEL house style
  "Copa del Rey": "Copa Rey",     // 12 chars, same shape as "Libertadores" → "Copa Lib"    // 117 → 91  (the division; bare "EFL" is the governing body, which also runs League One and Two)
  "French Open": "Fr. Open",      // 103 → 68  (keeps the noun, like the sibling "Aus Open"/"US Open"/"The Open")
  "Libertadores": "Copa Lib",     // 105 → 71
  "Little League": "LLWS",        // 107 → 44  (matches the sport key)
  "NCAA Baseball": "NCAA BSB",    // 8 chars (the college scoreboard's own abbreviation)
  "NCAA Softball": "Softball",    // 8 chars (the only softball league on the board)
  "NCAAW Hockey": "W. Hockey",    // 116 → 99  (women's college hockey; the "S. Rugby" house style. Measured at 390px on 2026-09-14: exactly the budget, one line)
  "Nations League": "UNL",        // 14 chars, past the budget; UEFA's own abbreviation, and "Nations" is taken by Rugby Nations
  "NCAA Volleyball": "NCAA VB",   // 15 chars, well past the 99px budget (the sport key stays "ncaavb")
  "NCAAW Soccer": "W. Soccer",    // women's college soccer; the "W. Hockey" house style (the sport key stays "ncaawsoc")
  "NFL Preseason": "NFL Pre",     // 122 → 63
  "NBA Preseason": "NBA Pre",     // twin of "NFL Pre" (added 2026-10-09)
  "Premier League": "EPL",        // 128 → 31  (matches the sport key, and the UCL/UEL house style)
  "Rugby Nations": "Nations",     // 119 → 63
  "Rugby Tests": "Tests",         // 100 → 45
  "Rugby World Cup": "Rugby WC",  // 141 → 84
  "Super Rugby": "S. Rugby",      // 105 → 71
  "ESPN front page": "ESPN.com",   // the cross-league column (lib/topEvents.ts)
  "Best of yesterday": "Yesterday", // the cross-league column (lib/bestYesterday.ts)
  // The same column on a longer span (lib/topGames.ts TOP_GAMES_COLUMN_LABEL).
  "Best this week": "Week",
  "Best this month": "Month",
  "Best this year": "Year",
};

// Below this column width the header falls back to SHORT_LEAGUE_LABELS. The
// widest full label ("Rugby World Cup") needs 141px + the 15px of chevron and
// gap = 156px, so 160 clears every current label with 4px to spare — and sits
// well clear of both real column widths: 114px on a phone, 192px at sm, 225px+
// from md up. Single-column ("condense") mode is a full-width column, so it
// lands on the far side of this and keeps the full name.
export const HEADER_SHORT_LABEL_MAX_PX = 160;

// Character cap standing in for the 99px budget above, since a node test has no
// font to measure with. Calibrated against the real measurements: every short
// form here is 9 characters or fewer and lands at 94px or less, while the
// candidates that busted the budget ran 11 ("Championshp" 111px, "Rugby W Cup"
// 109px, "Nations Cup" 100px). A PROXY, not a guarantee — width is not a
// function of character count, so a new entry still needs measuring in the
// browser. This only catches the obvious kind of mistake.
export const SHORT_LABEL_MAX_CHARS = 9;

// The league chip on each cross-league card ("MLB" on an ESPN front page or
// Best of yesterday card). OFF since 2026-09-26: Jacob found it too small
// ("the leagues look mini ... dont have them for now"); the team logos already
// say the league. The chip code stays in GameCard at a larger size (11px, was
// 9px), so turning it back on is this one line. Re-run the chip tests in
// espn-front-page.spec.ts + best-yesterday.spec.ts when you do: they skip
// while this is false.
export const SHOW_CARD_LEAGUE_CHIP = false;
