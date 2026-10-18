import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createJiti } from "jiti";

// Champions Cup cards, 2026-10-17 (Jacob: "we dont have streaming links for
// any? and their full names wouldnt fit on these cards?"). ESPN lists no TV for
// rugby, so the chip comes from lib/rightsHolders.ts by the viewer's country;
// ESPN's short rugby name is the full club name, so the long ones get a short
// form; and ESPN's codes clash (three "STA", two "LEI"), so the clubs' own codes.
const jiti = createJiti(import.meta.url);
type Team = { displayName: string; shortDisplayName: string; abbreviation: string };
type Game = { awayTeam: Team; homeTeam: Team };
const espn = await jiti.import<{
  displayShortName: (team: Team) => string;
  parseGame: (event: unknown, sport: string) => Game;
}>("../src/lib/espn.ts");
const { getViewerCountry, setViewerCountryOverride, countryForTimeZone, KNOWN_COUNTRIES } = await jiti.import<{
  getViewerCountry: (zone?: string) => string;
  setViewerCountryOverride: (code: string | undefined) => void;
  countryForTimeZone: (zone: string) => string;
  KNOWN_COUNTRIES: readonly string[];
}>("../src/lib/viewerCountry.ts");
const { rightsHolder } = await jiti.import<{
  rightsHolder: (sport: string, country: string, known?: readonly string[]) => { label: string; url: string } | null;
}>("../src/lib/rightsHolders.ts");

const team = (name: string): Team => ({ displayName: name, shortDisplayName: name, abbreviation: "" });

test("long club names get a short form; short ones stay as ESPN sends them", () => {
  const want: Record<string, string> = {
    "Bath Rugby": "Bath", "Bordeaux Begles": "Bordeaux", "Bristol Rugby": "Bristol", "Cardiff Blues": "Cardiff",
    "Clermont Auvergne": "Clermont", "Exeter Chiefs": "Exeter", "Glasgow Warriors": "Glasgow",
    "Gloucester Rugby": "Gloucester", "Leicester Tigers": "Leicester", "Montpellier Herault": "Montpellier",
    "Northampton Saints": "Northampton", "Stade Francais Paris": "Stade Français", "Stade Toulousain": "Toulouse",
    "Castres Olympique": "Castres", "Newcastle Falcons": "Newcastle", "Benetton Treviso": "Benetton",
  };
  for (const [espnName, short] of Object.entries(want)) assert.equal(espn.displayShortName(team(espnName)), short, espnName);
  for (const name of ["Racing 92", "La Rochelle", "Sale Sharks", "Munster", "Leinster", "Toulon"]) {
    assert.equal(espn.displayShortName(team(name)), name);
  }
  // Every short form fits the 225 px desktop column's ~160 px name room.
  assert.ok(Object.values(want).every((s) => s.length <= 14));
});

// Both cups' clubs with ESPN's own codes (rugby/271937 + 272073 teams, read 2026-10-17).
const CUPS: Record<string, [string, string][]> = {
  rugbychamp: [
    ["Bath Rugby", "BAT"], ["Bayonne", "BAY"], ["Bordeaux Begles", "UNI"], ["Bristol Rugby", "BRI"], ["Bulls", "BUL"],
    ["Cardiff Blues", "CAR"], ["Connacht", "CON"], ["Exeter Chiefs", "EXE"], ["Glasgow Warriors", "GLA"],
    ["Harlequins", "HAR"], ["La Rochelle", "STA"], ["Leicester Tigers", "LEI"], ["Leinster", "LEI"], ["Lyon", "LYO"],
    ["Munster", "MUN"], ["Northampton Saints", "NOR"], ["Racing 92", "RAC"], ["Sale Sharks", "SAL"],
    ["Saracens", "SAR"], ["Stade Francais Paris", "STA"], ["Stade Toulousain", "STA"], ["Stormers", "STO"],
    ["Toulon", "RC"], ["Ulster", "ULS"],
  ],
  challengecup: [
    ["Benetton Treviso", "BEN"], ["Black Lion", "BLA"], ["Castres Olympique", "CAS"], ["Cheetahs", "CHE"],
    ["Clermont Auvergne", "ASM"], ["Dragons", "DRA"], ["Edinburgh", "EDI"], ["Gloucester Rugby", "GLO"],
    ["Lions", "LIO"], ["Montpellier Herault", "MON"], ["Newcastle Falcons", "NEW"], ["Ospreys", "OSP"],
    ["Oyonnax", "OYO"], ["Pau", "SEC"], ["Perpignan", "USA"], ["Scarlets", "SCA"], ["Sharks", "SHA"], ["Zebre", "ZEB"],
  ],
};
const fixture: { _cup: string; name: string }[] = JSON.parse(
  readFileSync(new URL("./fixtures/epcr-2026-knockouts.json", import.meta.url), "utf8"),
);
const sale = fixture.find((e) => e.name === "Sale Sharks vs Glasgow Warriors")!;
// The code parseGame gives a club: the fixture's real event with the away team swapped.
function parsedCode(sport: string, name: string, code: string): string {
  const ev = structuredClone(sale) as unknown as { competitions: { competitors: { homeAway: string; team: Record<string, unknown> }[] }[] };
  const away = ev.competitions[0].competitors.find((c) => c.homeAway === "away")!;
  away.team = { ...away.team, name, displayName: name, shortDisplayName: name, abbreviation: code };
  return espn.parseGame(ev, sport).awayTeam.abbreviation;
}

test("club codes are the clubs' own and never repeat in either cup", () => {
  assert.equal(parsedCode("rugbychamp", "Stade Toulousain", "STA"), "TLS");
  assert.equal(parsedCode("rugbychamp", "Leicester Tigers", "LEI"), "LEIC");
  assert.equal(parsedCode("rugbychamp", "Leinster", "LEI"), "LEI");
  assert.equal(parsedCode("challengecup", "Clermont Auvergne", "ASM"), "ASM");
  assert.equal(parsedCode("challengecup", "Perpignan", "USA"), "USAP");
  for (const [sport, clubs] of Object.entries(CUPS)) {
    const codes = clubs.map(([name, code]) => parsedCode(sport, name, code));
    assert.equal(new Set(codes).size, codes.length, `${sport}: ${codes.join(" ")}`);
    assert.ok(codes.every((c) => c.length <= 4), sport);
  }
  // Not rugby: an ESPN code passes through even for a matching name.
  assert.equal(parsedCode("mlb", "Toulon", "RC"), "RC");
});

test("the viewer's country comes from the device time zone, the Settings pick wins", () => {
  assert.equal(countryForTimeZone("Europe/Warsaw"), "PL");
  assert.equal(countryForTimeZone("America/New_York"), "US");
  assert.equal(countryForTimeZone("America/Indiana/Knox"), "US");
  assert.equal(countryForTimeZone("Europe/London"), "GB");
  assert.equal(countryForTimeZone("Mars/Olympus"), "");
  setViewerCountryOverride(undefined);
  assert.equal(getViewerCountry("Europe/Warsaw"), "PL");
  setViewerCountryOverride("FR");
  assert.equal(getViewerCountry("America/New_York"), "FR");
  setViewerCountryOverride("bogus");
  assert.equal(getViewerCountry("America/New_York"), "US");
  setViewerCountryOverride(undefined);
});

test("the chip names the broadcaster for the viewer's country", () => {
  const rh = (sport: string, c: string) => rightsHolder(sport, c, KNOWN_COUNTRIES)?.label;
  assert.equal(rh("rugbychamp", "PL"), "DAZN");
  assert.equal(rh("rugbychamp", "US"), "FloRugby");
  assert.equal(rh("challengecup", "CA"), "FloRugby");
  assert.equal(rh("rugbychamp", "BR"), "DAZN");
  assert.equal(rh("rugbychamp", "GB"), "Premier Sports");
  assert.equal(rh("rugbychamp", "IE"), "Premier Sports");
  assert.equal(rh("rugbychamp", "FR"), "beIN SPORTS");
  assert.equal(rh("rugbychamp", "ZA"), "SuperSport");
  assert.equal(rh("rugbychamp", "ES"), "EPCR TV");
  assert.equal(rh("rugbychamp", "XX"), "Where to watch");
  assert.equal(rh("rugbychamp", ""), "Where to watch");
  assert.match(rightsHolder("challengecup", "", KNOWN_COUNTRIES)!.url, /epcrugby\.com\/challenge-cup\/where-to-watch/);
  assert.equal(rightsHolder("nfl", "US", KNOWN_COUNTRIES), null);
  assert.equal(rightsHolder("urc", "US", KNOWN_COUNTRIES), null);
});
