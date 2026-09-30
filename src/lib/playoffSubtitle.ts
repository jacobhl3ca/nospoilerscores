// The italic playoff subtitle under a league column header ("Wild Card · Game 1").
//
// One line has to speak for the whole day's slate, but ESPN tags each game
// with its own side of the bracket: "ALWC", "East 1st Round", "AFC Divisional
// Playoffs", "South Region". The column used to print the FIRST game's label,
// so on 2026-09-29 the MLB column read "NLWC · Game 1" over two AL and two NL
// Wild Card games. Every label on the day is now read, and a side that differs
// between games is dropped from the line.

// Strip generic "Stanley Cup Playoffs" / "NBA Playoffs" / "NCAA … Championship"
// prefix segments so a label like "Stanley Cup Playoffs - First Round" reads
// "First Round". Real round info (e.g. "East 1st Round" for NBA/NHL playoffs)
// gets preserved and joined with the game number when both are present.
const GENERIC_LABEL_SEGMENT = /^(?:stanley cup playoffs?|nba playoffs?|wnba playoffs?|nhl playoffs?|playoffs?|postseason|ncaa (?:men'?s|women'?s)?\s*basketball championship|ncaa basketball championship)$/i;

// Extract round + game info from ESPN's playoff headline.
// e.g. "East 1st Round - Game 7" → "East 1st Round · Game 7"
// e.g. "Stanley Cup Playoffs - First Round" → "First Round"
// e.g. "NCAA Men's Basketball Championship - National Championship" → "National Championship"
// ESPN sometimes tacks on "Nth Seed Game" as the last segment — strip that.
export function shortenPlayoffLabel(headline: string): string {
  const parts = headline
    .split(" - ")
    .map(p => p.trim())
    .filter(p => p && !/^\d+(?:st|nd|rd|th)?\s+seed\s+game$/i.test(p))
    .filter(p => !GENERIC_LABEL_SEGMENT.test(p));
  if (!parts.length) return headline.trim();
  return parts.join(" · ");
}

// MLB glues the league onto the round ("ALWC", "NLDS", "ALCS"). The merged
// name is what the round is called once the league is gone, plus a short form
// for a narrow column.
const MLB_ROUND = /^(AL|NL)(WC|DS|CS)$/;
const MLB_ROUND_NAME: Record<string, { full: string; short: string }> = {
  WC: { full: "Wild Card", short: "WC" },
  DS: { full: "Division Series", short: "DS" },
  CS: { full: "LCS", short: "LCS" },
};
// Every other league puts the side first as its own word.
const SIDE_PREFIX = /^(AFC|NFC|Eastern|Western|East|West)\s+(.+)$/;
// March Madness gives the region its own segment: "East Region · 1st Round".
const REGION_SEGMENT = /^\S+ Region$/;
// A merged round that would read as the league's own final ("Championship"
// alone looks like the Super Bowl) keeps both sides instead: "AFC/NFC Championship".
const LAST_ROUND_CORE = /^(?:finals?|championship)$/i;

interface ParsedLabel {
  round: string;       // the label minus its game number: "East 1st Round"
  side: string | null; // "East", "AL", "South Region"
  core: string;        // the round with the side removed: "1st Round", "WC"
  mlb: boolean;
  game: string | null; // "7"
}

function parseLabel(label: string): ParsedLabel {
  const segments = label.split(" · ");
  let game: string | null = null;
  const last = segments[segments.length - 1].match(/^Game (\d+)$/);
  if (last && segments.length > 1) {
    game = last[1];
    segments.pop();
  }
  const round = segments.join(" · ");
  let mlb = false;
  const regionAt = segments.findIndex((s) => REGION_SEGMENT.test(s));
  let side: string | null = regionAt >= 0 ? segments[regionAt] : null;
  const coreSegments = segments.filter((_, i) => i !== regionAt);
  if (side === null && coreSegments.length) {
    const baseball = coreSegments[0].match(MLB_ROUND);
    const prefix = coreSegments[0].match(SIDE_PREFIX);
    if (baseball) {
      side = baseball[1];
      coreSegments[0] = baseball[2];
      mlb = true;
    } else if (prefix) {
      side = prefix[1];
      coreSegments[0] = prefix[2];
    }
  }
  return { round, side, core: coreSegments.join(" · "), mlb, game };
}

// Widest first; LeagueColumn shows the first tier that fits the column.
// `fallback` is the league's own word for its postseason ("Playoffs"), used
// only when the day mixes two different rounds.
export function playoffSubtitleTiers(headlines: string[], fallback?: string): string[] {
  const labels = [...new Set(headlines.map(shortenPlayoffLabel))];
  if (!labels.length) return [];
  const withShortGame = (text: string) => {
    // Compact fallback: "Game 7" → "G7" so a long round + game tag still fits
    // narrow columns when the full version overflows.
    const short = text.replace(/Game (\d+)/g, "G$1");
    return short !== text ? [text, short] : [text];
  };
  if (labels.length === 1) return withShortGame(labels[0]);

  const parsed = labels.map(parseLabel);
  const cores = new Set(parsed.map((p) => p.core));
  if (cores.size > 1) {
    // Two different rounds on one day (East still in round 1, West already in
    // round 2). Name both if the column is wide enough, else the league's word.
    const rounds = [...new Set(parsed.map((p) => p.round))].join(" / ");
    return fallback ? [rounds, fallback] : [rounds];
  }

  const games = new Set(parsed.map((p) => p.game));
  const game = games.size === 1 ? parsed[0].game : null;
  const sides = [...new Set(parsed.map((p) => p.side))];
  const { core, mlb } = parsed[0];
  let round: string;
  let abbrev: string | null = null;
  if (sides.length === 1) {
    // Same side, only the game numbers differ: "East 1st Round".
    round = parsed[0].round;
  } else if (mlb && MLB_ROUND_NAME[core]) {
    round = MLB_ROUND_NAME[core].full;
    abbrev = MLB_ROUND_NAME[core].short;
  } else if (LAST_ROUND_CORE.test(core) && sides.every((s) => s !== null)) {
    round = `${(sides as string[]).sort().join("/")} ${core}`;
  } else {
    round = core;
  }
  const text = game ? `${round} · Game ${game}` : round;
  const tiers = withShortGame(text);
  if (abbrev) tiers.push(game ? `${abbrev} · G${game}` : abbrev);
  return [...new Set(tiers)];
}
