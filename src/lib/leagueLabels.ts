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
  "Championship": "EFL Champ",
  "Conference League": "UECL",    // 17 chars, well past the budget; matches the UCL/UEL house style
  "Copa del Rey": "Copa Rey",     // 12 chars, same shape as "Libertadores" → "Copa Lib"    // 117 → 91  (the division; bare "EFL" is the governing body, which also runs League One and Two)
  "French Open": "Fr. Open",      // 103 → 68  (keeps the noun, like the sibling "Aus Open"/"US Open"/"The Open")
  "Libertadores": "Copa Lib",     // 105 → 71
  "Little League": "LLWS",        // 107 → 44  (matches the sport key)
  "NCAA Baseball": "NCAA BSB",    // 8 chars (the college scoreboard's own abbreviation)
  "NCAA Softball": "Softball",    // 8 chars (the only softball league on the board)
  "NCAAW Hockey": "W. Hockey",    // 116 → 99  (women's college hockey; the "S. Rugby" house style. Measured at 390px on 2026-09-14: exactly the budget, one line)
  "NCAA Volleyball": "NCAA VB",   // 15 chars, well past the 99px budget (the sport key stays "ncaavb")
  "NFL Preseason": "NFL Pre",     // 122 → 63
  "Premier League": "EPL",        // 128 → 31  (matches the sport key, and the UCL/UEL house style)
  "Rugby Nations": "Nations",     // 119 → 63
  "Rugby Tests": "Tests",         // 100 → 45
  "Rugby World Cup": "Rugby WC",  // 141 → 84
  "Super Rugby": "S. Rugby",      // 105 → 71
  "Top events": "Top",            // the cross-league column (lib/topEvents.ts)
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
