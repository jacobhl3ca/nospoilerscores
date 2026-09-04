import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

// Two halves of one failure, both silent, both shipped for four Grand Slams
// (fixed 2026-09-04).
//
// getOfficialChannelName(sport, label) looks up `${sport}_${label-with-spaces-
// stripped}` FIRST and falls back to the bare `sport` key. Most leagues have a
// bare key, so a missing or renamed label costs them nothing and the bug hides.
// Tennis has NO bare `tennis` key — its uploader is the TOURNAMENT's channel —
// so for the Slams the label is the only route to a highlight button, and when
// it went undefined the trust gate turned the whole row off. Golf is the same
// shape (four majors, four channels, no bare `golf` key).
//
// Half one: the label has to REACH the component. LeagueColumn's four main-slate
// <GameCard> call sites didn't pass it while the three helper paths did.
// Half two: the label has to still MATCH the key. This is the golf_pga →
// golf_pgachamp bug already recorded in youtube.ts's own comments: the league
// label is "PGA Champ", so `golf_pga` never matched and that major quietly lost
// its official channel. A rename in ALL_LEAGUES orphans the key the same way.
//
// Both files are read as TEXT, not imported: espn.ts imports "./types" with no
// extension, which node's ESM resolver cannot follow (same reason as
// league-labels.test.ts), and youtube.ts pulls in a JSON import. The literals
// are plain strings, so a scan is stable — and each half opens with a
// did-the-scan-find-anything assertion so a shape change fails loudly instead of
// making every assertion below it vacuously true.

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
const ESPN_SRC = read("../src/lib/espn.ts");
const YT_SRC = read("../src/lib/youtube.ts");
const COLUMN_SRC = read("../src/components/LeagueColumn.tsx");

const LABELS = new Set([...ESPN_SRC.matchAll(/\blabel: "([^"]+)"/g)].map((m) => m[1]));
// The key getOfficialChannelName builds from a league label.
const labelKey = (sport: string, label: string) => `${sport}_${label.toLowerCase().replace(/\s+/g, "")}`;

const OFFICIAL_CHANNELS_BLOCK = YT_SRC.slice(
  YT_SRC.indexOf("const OFFICIAL_CHANNELS"),
  YT_SRC.indexOf("\n};", YT_SRC.indexOf("const OFFICIAL_CHANNELS")),
);
const CHANNEL_KEYS = [...OFFICIAL_CHANNELS_BLOCK.matchAll(/^\s{2}([a-z0-9_]+):\s*"/gm)].map((m) => m[1]);

// esports is the one label-keyed family whose label is NOT an ALL_LEAGUES label:
// one "esports" sport key spans many unrelated uploaders, so GameHighlights
// passes PandaScore's league name off Game.esportsLeague instead of the column
// label. Excluded here and asserted separately below.
const ESPORTS_KEYS = CHANNEL_KEYS.filter((k) => k.startsWith("esports_"));

test("the OFFICIAL_CHANNELS scan actually found the map", () => {
  assert.ok(
    CHANNEL_KEYS.length >= 25,
    `only ${CHANNEL_KEYS.length} channel keys scanned out of youtube.ts — the literal's shape changed and every assertion below is now vacuous`,
  );
  assert.ok(LABELS.size >= 40, `only ${LABELS.size} labels scanned out of espn.ts — same problem, one file over`);
});

test("every label-keyed channel is reachable from a league label that still exists", () => {
  // Build every key the app can actually produce: sport_label for each
  // (sport, label) pair in ALL_LEAGUES.
  const reachable = new Set<string>();
  for (const m of ESPN_SRC.matchAll(/sport: "([a-z0-9]+)",\s*label: "([^"]+)"/g)) {
    reachable.add(labelKey(m[1], m[2]));
  }
  const channelOf = new Map(
    [...OFFICIAL_CHANNELS_BLOCK.matchAll(/^\s{2}([a-z0-9_]+):\s*"((?:[^"\\]|\\.)*)"/gm)].map((m) => [m[1], m[2]]),
  );
  const candidates = CHANNEL_KEYS.filter((k) => k.includes("_") && !ESPORTS_KEYS.includes(k));
  // An unreachable key is FINE when a reachable sibling key for the same sport
  // names the identical channel — that is a spare spelling of a label, kept in
  // case ALL_LEAGUES ever renames it (tennis_australianopen beside the live
  // tennis_ausopen). What must never happen is a channel that NO label can
  // reach: that slot renders nothing and says nothing about why.
  const unreachable = candidates.filter((k) => {
    if (reachable.has(k)) return false;
    const sport = k.split("_")[0];
    return !candidates.some(
      (other) => other !== k && other.startsWith(`${sport}_`) && reachable.has(other) && channelOf.get(other) === channelOf.get(k),
    );
  });
  assert.deepEqual(
    unreachable,
    [],
    `OFFICIAL_CHANNELS entries no league label can build, and with no reachable sibling naming the same channel — so getOfficialChannelName falls through and that official slot goes dark with no error: ${unreachable.join(", ")}. Either the label was renamed in espn.ts or the key is misspelled (see golf_pga vs golf_pgachamp).`,
  );
});

test("the sports with no bare key are the ones that depend on the label", () => {
  // Documents WHY the call-site test below matters, and fails if a bare key is
  // ever added or removed without a look at that dependency.
  const bare = new Set(CHANNEL_KEYS.filter((k) => !k.includes("_")));
  const labelOnly = [...new Set(CHANNEL_KEYS.filter((k) => k.includes("_")).map((k) => k.split("_")[0]))]
    .filter((sport) => !bare.has(sport))
    .sort();
  assert.deepEqual(
    labelOnly,
    ["esports", "golf", "tennis"],
    `the set of sports reachable ONLY through a league label changed. Any sport in this list loses every highlight button the moment its label stops reaching GameHighlights — check the call sites before updating this list.`,
  );
});

test("every GameCard in LeagueColumn is handed its league label", () => {
  // The exact regression: four of seven call sites omitted it.
  const sites = COLUMN_SRC.split("<GameCard").slice(1);
  assert.ok(sites.length >= 4, `only ${sites.length} <GameCard call sites found — the scan missed them, not the file`);
  const missing = sites
    .map((site, i) => ({ i, props: site.slice(0, site.indexOf("/>")) }))
    .filter(({ props }) => !/\bleagueLabel=/.test(props))
    .map(({ i }) => `call site #${i + 1}`);
  assert.deepEqual(
    missing,
    [],
    `<GameCard> in LeagueColumn.tsx without leagueLabel: ${missing.join(", ")}. Harmless for a sport with a bare OFFICIAL_CHANNELS key, but it silently turns off every highlight button for tennis and golf.`,
  );
});

test("GolfLeaderboard is handed its league label too", () => {
  // Same lookup, different component: getOfficialChannelName("golf", leagueLabel).
  const sites = COLUMN_SRC.split("<GolfLeaderboard").slice(1);
  assert.ok(sites.length >= 1, "no <GolfLeaderboard call site found — the scan missed it, not the file");
  for (const site of sites) {
    assert.match(
      site.slice(0, site.indexOf("/>")),
      /\bleagueLabel=/,
      "<GolfLeaderboard> without leagueLabel — every major's round-recap button resolves to a null channel",
    );
  }
});

test("esports resolves its channel from the match, not the column label", () => {
  // esports_* keys are exempt from the reachability test above only because the
  // label comes from Game.esportsLeague. If that ever changes to the column
  // label, the exemption is wrong and this catches it.
  assert.ok(ESPORTS_KEYS.length > 0, "no esports_* channel keys found — the exemption above is now unexplained");
  const HIGHLIGHTS_SRC = read("../src/components/GameHighlights.tsx");
  assert.match(
    HIGHLIGHTS_SRC,
    /game\.sport === "esports"\s*\?\s*\(game\.esportsLeague/,
    "GameHighlights no longer derives the esports highlight label from game.esportsLeague, so esports_* keys now depend on the column label like tennis and golf",
  );
});
