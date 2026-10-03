import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createTitleForTeam, teamNameIndex } from "../scripts/lib/team-names.mjs";

// The bake's and the audit's team-title blanking (scripts/lib/team-names.mjs),
// run with copies of both callers' normalizers. The worker's own copy is
// tested in tests/youtube-school-names.test.mjs.

// hlNormalizeTeam in scripts/prebake-news.mjs.
const bakeNormalize = (name) => String(name ?? "")
  .normalize("NFKD")
  .replace(/[̀-ͯ]/g, "")
  .toLowerCase()
  .replace(/&/g, " and ")
  .replace(/[^a-z0-9]+/g, " ")
  .trim();
// normalizeMatchText in scripts/check-highlight-fallbacks.mjs.
const auditNormalize = (value) => String(value ?? "")
  .normalize("NFKD")
  .replace(/[̀-ͯ]/g, "")
  .replace(/[‘’]/g, "'")
  .toLowerCase()
  .replace(/&/g, " and ")
  .replace(/[^a-z0-9']+/g, " ")
  .trim();

for (const [label, normalize] of [["bake", bakeNormalize], ["audit", auditNormalize]]) {
  const titleForTeam = createTitleForTeam(normalize);
  const has = (title, ...names) => {
    const variants = new Set(names.map(normalize));
    const t = titleForTeam(title, variants);
    assert.equal(t.length, normalize(title).length, `${label}: positions stay true for ${title}`);
    return [...variants].some((v) => t.includes(v));
  };

  test(`${label}: a school built on another school's name is not that school`, () => {
    assert.equal(has("Texas A&M Aggies vs. Ole Miss Rebels | Game Highlights | 2026 SEC Soccer", "Texas"), false);
    assert.equal(has("Texas Tech Red Raiders vs. Baylor Bears | Highlights", "Texas"), false);
    assert.equal(has("West Virginia vs. Houston Highlights (10.2.26) | 2026 Big 12 Women's Soccer", "Virginia"), false);
    assert.equal(has("Miami (OH) vs. Clemson Match Highlights | 2026 ACC Women's Soccer", "Miami"), false);
    assert.equal(has("Kansas State vs. Baylor Highlights", "Kansas"), false);
    assert.equal(has("Kansas City vs. Baylor Highlights", "Kansas"), false);
    assert.equal(has("Sam Houston vs. Baylor Highlights", "Houston"), false);
    assert.equal(has("Northern Ireland v Wales | Highlights", "Ireland"), false);
    // A bare hyphen is part of a name.
    assert.equal(has("Texas A&M-Commerce Lions vs. Abilene Christian | Highlights", "Texas A&M"), false);
  });

  test(`${label}: a school keeps its own longer name, and both schools in one title match`, () => {
    assert.equal(has("Texas A&M Aggies vs. Ole Miss Rebels | Game Highlights | 2026 SEC Soccer", "Texas A&M"), true);
    assert.equal(has("West Virginia vs. Houston Highlights (10.2.26)", "West Virginia"), true);
    assert.equal(has("Kansas City vs. Baylor Highlights", "Kansas City"), true);
    assert.equal(has("Washington State vs. Washington | Game Highlights", "Washington"), true);
    assert.equal(has("Washington State vs. Washington | Game Highlights", "Washington State"), true);
    assert.equal(has("Texas Longhorns vs. Ole Miss Rebels | Game Highlights | 2026 SEC Soccer", "Texas"), true);
  });

  test(`${label}: a phrase never spans a title separator`, () => {
    assert.equal(has("Chicago Fire FC - St. Louis CITY SC | Full Match Highlights", "Chicago Fire FC"), true);
    assert.equal(has("Wellington Phoenix - Central Coast Mariners | Highlights", "Wellington Phoenix"), true);
    assert.equal(has("Highlights: Knicks | State Farm Arena", "Knicks"), true);
    assert.equal(has("Villanova @ St. John's | Highlights", "Villanova"), true);
  });

  test(`${label}: pro clubs are unchanged`, () => {
    assert.equal(has("North Melbourne v Carlton Highlights | Round 5, 2026 | AFL", "Melbourne"), false);
    assert.equal(has("Melbourne v Carlton Highlights | Round 5, 2026 | AFL", "Melbourne"), true);
    assert.equal(has("Kansas City Chiefs vs. Buffalo Bills Game Highlights", "Kansas City Chiefs"), true);
    assert.equal(has("Sydney FC v Western Sydney Wanderers | Highlights", "Sydney FC"), true);
    assert.equal(has("Manchester City vs. Leicester City | Extended Highlights", "Leicester City"), true);
  });

  test(`${label}: a team owns a longer name that holds the phrase`, () => {
    assert.equal(has("Sporting Kansas City vs. LA Galaxy | Highlights", "Sporting Kansas City"), true);
    assert.equal(has("Southern Miss Golden Eagles vs. Troy Trojans | Highlights", "Southern Miss Golden Eagles"), true);
    assert.equal(has("Ohio State Buckeyes vs. Michigan | Highlights", "Ohio", "Ohio State Buckeyes"), true);
    assert.equal(has("Ohio State Buckeyes vs. Michigan | Highlights", "Ohio"), false);
  });
}

test("the bake and the audit both use the shared guard", () => {
  const bake = readFileSync(new URL("../scripts/prebake-news.mjs", import.meta.url), "utf8");
  const audit = readFileSync(new URL("../scripts/check-highlight-fallbacks.mjs", import.meta.url), "utf8");
  assert.ok(bake.includes("const hlTitleForTeamGuard = createTitleForTeam(hlNormalizeTeam);"));
  assert.ok(audit.includes("const titleForTeam = createTitleForTeam(normalizeMatchText);"));
  assert.ok(audit.includes("const normalizedTitle = titleForTeam(title, variants);"));
});

test("teamNameIndex: names under four letters stand as words, longer names are substrings", () => {
  assert.equal(teamNameIndex("stanford vs cal match highlights", "cal"), 12);
  assert.equal(teamNameIndex("cal vs stanford", "cal"), 0);
  assert.equal(teamNameIndex("stanford vs pacific a physical game", "cal"), -1);
  assert.equal(teamNameIndex("juventus vs necaxa", "nec"), -1);
  assert.equal(teamNameIndex("juventus vs nec nijmegen", "nec"), 12);
  assert.equal(teamNameIndex("north carolina tar heels", "carolina"), 6);
  assert.equal(teamNameIndex("anything", ""), -1);
});
