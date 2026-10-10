// Team names that hold another team's name, for the highlight title gates in
// scripts/prebake-news.mjs and scripts/check-highlight-fallbacks.mjs. Mirrors
// CONTAINING_TEAM_NAMES, SCHOOL_NAME_PREFIXES, SCHOOL_NAME_SUFFIXES and
// blankContainingSchoolNames in public/_worker.js (the worker cannot import
// it). Keep the lists in sync by hand.

// Whole names that hold another team's name: Rep Ireland ("Ireland",
// "Irlanda") never matches a Northern Ireland title, Kansas never a Kansas
// City one.
export const CONTAINING_TEAM_NAMES = [
  "northern ireland", "irlanda del norte",
  "kansas city", "sam houston", "george washington", "miami (ohio)",
  "georgia southern", "texas southern", "southern miss", "southern utah", "southern illinois",
  "southern indiana", "southern methodist", "southern california",
];

// A direction before, or a word after, a school's name makes another school:
// "West Virginia" holds Virginia, "Texas A&M" holds Texas. The college chains
// match on ESPN's school name, and the SEC posts both Texas schools' cuts
// against the same opponents with no date in the title. Checked 2026-10-03
// against every team ESPN lists for the pro leagues the bake walks: no club's
// own name is such a phrase. ⛔ Never "city" (Leicester City), "united" or a
// bare "st" (St Kilda).
export const SCHOOL_NAME_PREFIXES = [
  "west", "east", "north", "south", "western", "eastern", "northern", "southern", "central", "middle",
  "southeast", "southeastern", "northwest", "northwestern", "southwest", "southwestern", "northeast", "northeastern",
];
export const SCHOOL_NAME_SUFFIXES = [
  "state", "st.", "tech", "a&m", "a & m", "a&t", "christian", "southern", "central", "international", "atlantic",
  "gulf coast", "valley", "poly", "baptist", "(oh)", "(ohio)", "monroe", "duluth", "omaha", "anchorage", "fairbanks",
  "kearney", "fort wayne", "pine bluff", "little rock", "upstate", "wilmington", "greensboro", "asheville",
  "rio grande valley", "eastern shore", "lowell", "corpus christi", "commerce", "kingsville",
];

// Title separators. A school phrase never spans one, so "Chicago Fire FC -
// St. Louis CITY SC" keeps the Fire. A bare hyphen or dash is part of a name
// ("Texas A&M-Commerce").
const TITLE_SEPARATOR_RX = /\s+[-–—]+\s+|\s*[|@:/,•]\s*/;

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// A team owns a longer name when one of its own names holds it as whole words:
// "Sporting Kansas City" owns "Kansas City", "Southern Miss Golden Eagles"
// owns "Southern Miss".
const ownsName = (variants, phrase) => {
  const p = ` ${phrase} `;
  for (const v of variants) if (v && ` ${v} `.includes(p)) return true;
  return false;
};

/**
 * Where a team name stands in a normalized title, or -1. A name under four
 * characters ("Cal", "SMU", "NEC") must stand as a whole word: "cal" is inside
 * "physical", "nec" inside "connecticut". Mirrors teamNameIndex in
 * public/_worker.js.
 */
export function teamNameIndex(title, name) {
  if (!name) return -1;
  if (name.length >= 4) return title.indexOf(name);
  const m = new RegExp(`(?:^|[^a-z0-9])(${escapeRegex(name)})(?![a-z0-9])`).exec(title);
  return m ? m.index + m[0].length - m[1].length : -1;
}

/**
 * Returns titleForTeam(title, variants): the title in `normalize`'s form as
 * matched for one team, with every longer team name that holds one of
 * `variants` and that the team does not own blanked to spaces of the same
 * length, so positions stay true. `normalize` must turn each run of dropped
 * characters into one space and trim (both callers' normalizers do).
 */
export function createTitleForTeam(normalize) {
  const containing = CONTAINING_TEAM_NAMES.map(normalize);
  const prefixAlt = [...new Set(SCHOOL_NAME_PREFIXES.map(normalize))].map(escapeRegex).join("|");
  const suffixAlt = [...new Set(SCHOOL_NAME_SUFFIXES.map(normalize))].map(escapeRegex).join("|");
  const rxCache = new Map();
  const phraseRx = (name) => {
    let rx = rxCache.get(name);
    if (!rx) {
      const n = escapeRegex(name);
      rx = new RegExp(`(?<![a-z0-9])(?:(?:${prefixAlt}) ${n}|${n} (?:${suffixAlt}))(?![a-z0-9])`, "g");
      rxCache.set(name, rx);
    }
    return rx;
  };
  const blankSchools = (t, variants) => {
    for (const name of variants) {
      if (name) t = t.replace(phraseRx(name), (m) => (ownsName(variants, m) ? m : " ".repeat(m.length)));
    }
    return t;
  };
  return function titleForTeam(title, variants) {
    const full = normalize(title);
    const parts = String(title ?? "").split(TITLE_SEPARATOR_RX).map(normalize).filter(Boolean);
    // The parts rejoin to the whole title in every real case; if one ever
    // does not, blank the whole title and let a phrase span the separator.
    let t = parts.join(" ") === full
      ? parts.map((p) => blankSchools(p, variants)).join(" ")
      : blankSchools(full, variants);
    for (const name of containing) {
      if (!ownsName(variants, name)) t = t.split(name).join(" ".repeat(name.length));
    }
    return t;
  };
}
