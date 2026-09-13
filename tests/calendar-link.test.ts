import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";
import type { Game, LeagueEventCard, FightBout } from "../src/lib/types.ts";
import type { CalendarEvent } from "../src/lib/calendarLink.ts";

// calendarLink imports shareCard at runtime (the uid reuses the share-card
// key), so load it through jiti like live-progress does for espn.ts.
const jiti = createJiti(import.meta.url);
const {
  buildCalendarEvent,
  buildEventCalendarEvent,
  googleCalendarUrl,
  icsText,
  icsDataUrl,
  icsHttpsUrl,
  icsFileName,
  isTennisTimeEstimate,
} = (await jiti.import("../src/lib/calendarLink.ts")) as {
  buildCalendarEvent: (g: Game, label?: string) => CalendarEvent | null;
  buildEventCalendarEvent: (e: LeagueEventCard, f?: FightBout) => CalendarEvent | null;
  googleCalendarUrl: (ev: CalendarEvent) => string;
  icsText: (ev: CalendarEvent, now?: Date) => string;
  icsDataUrl: (ev: CalendarEvent) => string;
  icsHttpsUrl: (ev: CalendarEvent) => string;
  icsFileName: (ev: CalendarEvent) => string;
  isTennisTimeEstimate: (s: string) => boolean;
};

const team = (abbr: string, short: string) =>
  ({ id: abbr, abbreviation: abbr, shortDisplayName: short, displayName: short, logo: "", color: "", score: "", winner: false, record: "" });

const mlb = (over: Partial<Game> = {}): Game =>
  ({
    id: "401700001",
    sport: "mlb",
    date: "2026-09-13T23:05:00Z", // 7:05 PM ET
    name: "New York Mets at Philadelphia Phillies",
    shortName: "NYM @ PHI",
    state: "pre",
    statusDetail: "7:05 PM ET",
    clock: "",
    period: 0,
    completed: false,
    homeTeam: team("PHI", "Phillies"),
    awayTeam: team("NYM", "Mets"),
    broadcasts: ["ESPN", "MLB.TV"],
    venue: "Citizens Bank Park",
    venueLocation: "Philadelphia, Pennsylvania",
    rating: 87,
    seriesNote: null,
    isPlayoff: false,
    isPreseason: false,
    playoffLabel: null,
    seriesStatus: null,
    recapUrl: null,
    streamUrl: null,
    primeStreamUrl: null,
    ...over,
  }) as Game;

test("MLB pre game → Google URL with two UTC stamps 180 min apart, league-prefixed title, spoiler-free details", () => {
  const ev = buildCalendarEvent(mlb(), "MLB");
  assert.ok(ev);
  assert.equal(ev.title, "MLB: Mets at Phillies");
  assert.equal(ev.durationMin, 180);
  assert.equal(ev.location, "Citizens Bank Park, Philadelphia, Pennsylvania");
  assert.equal(ev.uid, "mlb-nym-phi-20260913@hidescore.com");
  const url = googleCalendarUrl(ev);
  const u = new URL(url);
  assert.equal(u.origin + u.pathname, "https://calendar.google.com/calendar/render");
  assert.equal(u.searchParams.get("action"), "TEMPLATE");
  assert.equal(u.searchParams.get("text"), "MLB: Mets at Phillies");
  assert.equal(u.searchParams.get("dates"), "20260913T230500Z/20260914T020500Z");
  const details = u.searchParams.get("details") || "";
  assert.match(details, /ESPN · MLB\.TV/);
  assert.match(details, /hidescore\.com/);
  assert.doesNotMatch(details, /\b87\b|rating|final/i);
  assert.equal(u.searchParams.get("location"), "Citizens Bank Park, Philadelphia, Pennsylvania");
});

test("finished, live, invalid-date and TBD-team games make no event", () => {
  assert.equal(buildCalendarEvent(mlb({ state: "post" })), null);
  assert.equal(buildCalendarEvent(mlb({ state: "in" })), null);
  assert.equal(buildCalendarEvent(mlb({ date: "not a date" })), null);
  assert.equal(buildCalendarEvent(mlb({ date: "" })), null);
  assert.equal(buildCalendarEvent(mlb({ awayTeam: team("", "") })), null);
});

test("no broadcasts → details are just the site link; league label defaults to the sport key", () => {
  const ev = buildCalendarEvent(mlb({ broadcasts: [], sport: "nhl" }));
  assert.ok(ev);
  assert.equal(ev.title, "NHL: Mets at Phillies");
  assert.equal(ev.description, "https://hidescore.com");
  assert.equal(ev.durationMin, 165);
});

const tennis = (over: Partial<Game> = {}): Game =>
  mlb({
    id: "t1",
    sport: "tennis",
    shortName: "Shelton vs Alcaraz",
    name: "Shelton vs Alcaraz",
    homeTeam: team("ALC", "Alcaraz"),
    awayTeam: team("SHE", "Shelton"),
    seriesNote: "US Open 2026",
    playoffLabel: "Quarterfinal",
    statusDetail: "Not before 3:00 PM",
    venue: "",
    venueLocation: undefined,
    broadcasts: ["ESPN"],
    ...over,
  });

test("tennis with an order-of-play estimate carries it in the title and flags it in the description", () => {
  const ev = buildCalendarEvent(tennis());
  assert.ok(ev);
  assert.equal(ev.title, "Shelton vs Alcaraz · US Open 2026 · Quarterfinal · Not before 3:00 PM");
  assert.match(ev.description, /ESPN's estimate/);
  assert.equal(ev.location, undefined);
  assert.equal(ev.durationMin, 180);
});

test("tennis with a plain clock is not flagged; a day-only fallback makes no event", () => {
  const ev = buildCalendarEvent(tennis({ statusDetail: "3:00 PM ET" }));
  assert.ok(ev);
  assert.equal(ev.title, "Shelton vs Alcaraz · US Open 2026 · Quarterfinal");
  assert.doesNotMatch(ev.description, /estimate/);
  assert.equal(buildCalendarEvent(tennis({ dateIsEstimate: true })), null);
  assert.equal(isTennisTimeEstimate("Followed by"), true);
  assert.equal(isTennisTimeEstimate("TBD"), true);
  assert.equal(isTennisTimeEstimate(""), true);
  assert.equal(isTennisTimeEstimate("11:00 AM ET"), false);
});

test("icsText is a CRLF VCALENDAR with UTC stamps, escaped SUMMARY and a hidescore UID", () => {
  const ev = buildCalendarEvent(mlb({ shortName: "A; B, C" }), "MLB")!;
  const ics = icsText({ ...ev, title: "MLB: Mets at Phillies; Game 1, of 3" }, new Date("2026-09-13T12:00:00Z"));
  const lines = ics.split("\r\n");
  assert.equal(lines[0], "BEGIN:VCALENDAR");
  assert.ok(ics.endsWith("END:VCALENDAR\r\n"));
  assert.doesNotMatch(ics, /[^\r]\n/, "every line break is CRLF");
  assert.ok(lines.includes("BEGIN:VEVENT") && lines.includes("END:VEVENT"));
  assert.ok(lines.some((l) => /^PRODID:/.test(l)));
  assert.ok(lines.includes("DTSTAMP:20260913T120000Z"));
  assert.ok(lines.includes("DTSTART:20260913T230500Z"));
  assert.ok(lines.includes("DTEND:20260914T020500Z"));
  assert.ok(lines.includes("SUMMARY:MLB: Mets at Phillies\\; Game 1\\, of 3"), lines.find((l) => l.startsWith("SUMMARY")));
  assert.ok(lines.includes("UID:mlb-nym-phi-20260913@hidescore.com"));
  assert.ok(lines.some((l) => /^DESCRIPTION:ESPN · MLB\.TV\\n\\nhttps:\/\/hidescore\.com/.test(l)));
  assert.ok(lines.includes("LOCATION:Citizens Bank Park\\, Philadelphia\\, Pennsylvania"));
});

test("long lines fold at 75 chars with a leading space", () => {
  const ev = buildCalendarEvent(mlb({ broadcasts: ["A very long broadcaster name that goes on and on", "Another one just as long", "And a third"] }), "MLB")!;
  const ics = icsText(ev);
  for (const line of ics.split("\r\n")) assert.ok(line.length <= 75, `line too long: ${line}`);
  assert.match(ics, /\r\n [^\r]/);
});

test("data URL and https URL both carry the ics text; the filename comes from the uid", () => {
  const ev = buildCalendarEvent(mlb(), "MLB")!;
  const data = icsDataUrl(ev);
  assert.ok(data.startsWith("data:text/calendar;charset=utf-8,"));
  assert.ok(decodeURIComponent(data.slice(data.indexOf(",") + 1)).startsWith("BEGIN:VCALENDAR\r\n"));
  const https = icsHttpsUrl(ev);
  assert.ok(https.startsWith("https://hidescore.com/api/ics?t=BEGIN%3AVCALENDAR"));
  assert.equal(icsFileName(ev), "hidescore-mlb-nym-phi-20260913.ics");
});

const race: LeagueEventCard = {
  kind: "f1",
  title: "Singapore Grand Prix",
  subtitle: "Marina Bay Street Circuit · Singapore",
  state: "pre",
  statusDetail: "Race",
  date: "2026-10-04T12:00:00Z",
  broadcasts: ["ESPN2"],
  officialLabel: "F1",
};

test("a race tile makes an event; a finished one and a poker date window do not", () => {
  const ev = buildEventCalendarEvent(race);
  assert.ok(ev);
  assert.equal(ev.title, "Singapore Grand Prix");
  assert.equal(ev.durationMin, 180);
  assert.equal(ev.location, "Marina Bay Street Circuit · Singapore");
  assert.equal(ev.uid, "f1-singapore-grand-prix-2026-10-04@hidescore.com");
  assert.equal(buildEventCalendarEvent({ ...race, state: "post" }), null);
  assert.equal(buildEventCalendarEvent({ ...race, kind: "poker", scheduleLabel: "Sep 20 – Oct 3" }), null);
});

test("a tapped UFC bout uses the bout's own date and names the card", () => {
  const fight: FightBout = {
    id: "b1", weightClass: "Flyweight", state: "pre", statusDetail: "10:00 PM ET",
    date: "2026-09-20T02:00:00Z",
    red: { name: "Kape", shortName: "Kape", record: "20-7-0" },
    blue: { name: "Horiguchi", shortName: "Horiguchi", record: "34-5-0" },
    highlightQuery: "",
  };
  const card: LeagueEventCard = { kind: "ufc", title: "UFC Fight Night: Kape vs. Horiguchi", state: "post", statusDetail: "Final", date: "2026-09-19T22:00:00Z", broadcasts: ["ESPN+"], fights: [fight] };
  const ev = buildEventCalendarEvent(card, fight);
  assert.ok(ev, "the bout's state wins over the card's");
  assert.equal(ev.title, "Kape vs Horiguchi · UFC Fight Night: Kape vs. Horiguchi");
  assert.equal(ev.startIso, "2026-09-20T02:00:00.000Z");
  assert.equal(ev.durationMin, 240);
  assert.equal(ev.uid, "ufc-b1@hidescore.com");
});
