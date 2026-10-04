import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createJiti } from "jiti";

// Competition climbing (added 2026-10-03). Fixtures are real payloads read on
// 2026-10-03:
//   climbing-calendar.json  sportclimbing/ifsc-calendar release 202610031015,
//                           trimmed to Chamonix, Koper, Salt Lake City,
//                           Santiago and one Para Series event; each
//                           start_list cut to 3 names (kept ON PURPOSE: the
//                           spoiler guard below proves none of them leak)
//   climbing-results.json   ifsc.results.info: the Koper event, the Koper
//                           lead finals (rounds 11021/11022), the Bern men's
//                           boulder final (10667) and the Madrid men's speed
//                           final (10673, trimmed to the last two stages)
const jiti = createJiti(import.meta.url);
const fixture = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8"));
const calendar = fixture("climbing-calendar.json");
const results = fixture("climbing-results.json");

type Round = { id: string; kind: string; discipline: string; category: string; startsAt: string; endsAt: string | null; streamUrl: string | null; state: string; rating: number | null; provisional: boolean; blockedRegions: string[] };
type Day = { events: { id: string; name: string; location: string; disciplines: string[]; dayIndex: number; dayCount: number; whereToWatchUrl: string | null; rounds: Round[] }[]; error?: string };

const workerMod = (await import("../public/_worker.js")) as unknown as {
  default: { fetch: (r: Request, env: unknown, ctx: unknown) => Promise<Response> };
  climbEtSlateYmd: (iso: string) => string;
  climbExpandRounds: (ev: unknown) => (Round & { ymd: string })[];
  climbRoundState: (s: string, e: string | null, status: string | undefined, now: number) => string;
  climbParseHeight: (s: string) => number | null;
  climbBoulderRating: (r: unknown) => number | null;
  climbLeadRating: (r: unknown) => number | null;
  climbSpeedRating: (r: unknown) => number | null;
  climbFinalRating: (r: unknown) => number | null;
  climbReplayTitleOk: (t: string, d: string, k: string, c: string, loc: string, y: string) => boolean;
  climbDay: (ymd: string, now: number, ctx?: unknown) => Promise<Day>;
  climbResetState: () => void;
};
const espn = await jiti.import<{
  climbingCardFromApi: (ev: unknown) => { kind: string; title: string; subtitle?: string; state: string; climbRounds?: { id: string; label: string; rating: number | null }[]; climbNotStreamed?: number; climbWhereToWatch?: string; officialChannel?: string };
  ALL_LEAGUES: { sport: string; label: string; excludeFromAuto?: boolean; startDate?: string }[];
  sportStreamFallback: (sport: string) => string;
  sportGlyph: (sport: string) => string;
}>("../src/lib/espn.ts");
const climb = await jiti.import<{
  climbRoundLabelVariants: (r: { category: string; discipline: string; kind: string }) => string[];
  climbVisibleRounds: <T>(r: T[]) => T[];
  climbNotStreamedCount: (r: unknown[]) => number;
  climbNotStreamedLabel: (n: number) => string;
  climbSubtitle: (loc: string, d: string[], i: number, n: number) => string;
  climbStreamVideoId: (u: string | null) => string | null;
}>("../src/lib/climbing.ts");
const yt = await jiti.import<{ channelAlwaysMasksTitle: (c: string[]) => boolean; getOfficialChannelName: (s: string) => string | null }>("../src/lib/youtube.ts");

// Upstream stub: the calendar, the results service (handshake + JSON API) and
// World Climbing's where-to-watch article. `refuse` makes the results service
// answer 403 to everything, the case where it blocks Cloudflare's IPs.
function stubUpstream({ calendarDown = false, refuse = false } = {}) {
  const asked: string[] = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const u = String(input instanceof Request ? input.url : input);
    asked.push(u);
    if (u.includes("github.com/sportclimbing/ifsc-calendar")) {
      return calendarDown ? new Response("bad gateway", { status: 502 }) : new Response(JSON.stringify(calendar));
    }
    if (u === "https://ifsc.results.info/") {
      if (refuse) return new Response("forbidden", { status: 403 });
      return new Response('<html><head><meta name="csrf-token" content="tok123"></head></html>', {
        headers: { "set-cookie": "_ifsc_resultservice_session=sess456; path=/; HttpOnly" },
      });
    }
    if (u.startsWith("https://ifsc.results.info/api/v1/")) {
      const h = new Headers(init?.headers);
      if (refuse || h.get("X-Csrf-Token") !== "tok123" || !String(h.get("Cookie")).includes("sess456")) {
        return new Response("{}", { status: 401 });
      }
      const body = results[u.slice("https://ifsc.results.info/api/v1/".length)];
      return body ? new Response(JSON.stringify(body)) : new Response("{}", { status: 404 });
    }
    if (u.startsWith("https://www.worldclimbing.com/news/where-to-watch-the-")) {
      return new Response("", { status: u.includes("koper") ? 200 : 404 });
    }
    if (u.startsWith("https://www.youtube.com/@worldclimbing/search")) return new Response("<html></html>");
    throw new Error(`unexpected fetch ${u}`);
  }) as typeof fetch;
  return { asked, restore: () => { globalThis.fetch = realFetch; } };
}

const KOPER_FINAL_DONE = Date.parse("2026-09-06T12:00:00Z");

test("rounds file under their ET slate day, with the 1 AM rollover", () => {
  assert.equal(workerMod.climbEtSlateYmd("2026-10-17T19:00:00-06:00"), "20261017"); // 9 pm ET
  assert.equal(workerMod.climbEtSlateYmd("2026-10-18T00:30:00-04:00"), "20261017"); // 12:30 am ET → night before
  assert.equal(workerMod.climbEtSlateYmd("2026-05-01T09:00:00+08:00"), "20260430"); // Keqiao 9 am = 9 pm ET the day before
});

test("a Men's & Women's round splits into one row per category with the same stream", () => {
  const koper = calendar.events.find((e: { id: number }) => e.id === 1487);
  const rows = workerMod.climbExpandRounds(koper);
  const finals = rows.filter((r) => r.kind === "final");
  assert.deepEqual(finals.map((r) => r.category).sort(), ["men", "women"]);
  assert.equal(finals[0].streamUrl, finals[1].streamUrl);
  assert.equal(finals[0].streamUrl, "https://youtu.be/ZvdCCugSDkg");
  assert.equal(finals[0].ymd, "20260905");
  // Koper's lead qualification has no stream and a provisional time.
  const qual = rows.find((r) => r.kind === "qualification")!;
  assert.equal(qual.streamUrl, null);
  assert.equal(qual.provisional, true);
});

test("state: pre before the start, post when finished or two hours past the end", () => {
  const s = "2026-10-17T19:00:00-06:00";
  const e = "2026-10-17T20:30:00-06:00";
  const at = (iso: string) => Date.parse(iso);
  assert.equal(workerMod.climbRoundState(s, e, undefined, at("2026-10-17T18:59:00-06:00")), "pre");
  assert.equal(workerMod.climbRoundState(s, e, "active", at("2026-10-17T19:30:00-06:00")), "in");
  assert.equal(workerMod.climbRoundState(s, e, "finished", at("2026-10-17T20:10:00-06:00")), "post");
  assert.equal(workerMod.climbRoundState(s, e, "active", at("2026-10-17T22:29:00-06:00")), "in");
  assert.equal(workerMod.climbRoundState(s, e, "active", at("2026-10-17T22:31:00-06:00")), "post");
});

test("heights parse as numbers: 33+ is half a hold above 33", () => {
  assert.equal(workerMod.climbParseHeight("33+"), 33.5);
  assert.equal(workerMod.climbParseHeight("33"), 33);
  assert.equal(workerMod.climbParseHeight("TOP"), null);
});

test("ratings land in 0-100 and order the finals the way the results read", () => {
  const men = workerMod.climbFinalRating(results["category_rounds/11021/results"]);   // 33+ vs 30+
  const women = workerMod.climbFinalRating(results["category_rounds/11022/results"]); // 42+ vs 33: a runaway
  const boulder = workerMod.climbFinalRating(results["category_rounds/10667/results"]);
  const speed = workerMod.climbFinalRating(results["category_rounds/10673/results"]);  // 4.75 vs 4.81
  for (const r of [men, women, boulder, speed]) assert.ok(typeof r === "number" && r >= 0 && r <= 100, String(r));
  assert.ok(men! > women!, `a 3-hold gap (${men}) beats a 9-hold gap (${women})`);
  assert.ok(women! < 50, "a runaway lead final is a SKIP");
  assert.ok(speed! >= 85, `a 0.06 s speed final is GREAT (${speed})`);
});

test("lead: a tie on height at the top earns the countback bonus", () => {
  const base = structuredClone(results["category_rounds/11021/results"]);
  const close = workerMod.climbLeadRating(base)!;
  base.ranking[1].score = base.ranking[0].score;
  const tied = workerMod.climbLeadRating(base)!;
  assert.ok(tied > close);
});

test("speed: a fall in the big final costs 20", () => {
  const r = structuredClone(results["category_rounds/10673/results"]);
  const fin = r.speed_elimination_stages.find((s: { stage_name: string }) => s.stage_name === "Final");
  fin.heats[0].athletes[1].ascents[0].dnf = true;
  assert.equal(workerMod.climbSpeedRating(r), 50);
});

test("a searched replay must carry the house title, nothing else", () => {
  const ok = (t: string, c = "men", loc = "Koper") => workerMod.climbReplayTitleOk(t, "lead", "final", c, loc, "2026");
  assert.ok(ok("Lead finals | Koper 2026"));
  assert.ok(ok("Lead finals | Koper 2026 | World Climbing"));
  assert.ok(ok("Men's Lead final | Koper 2026"));
  assert.ok(ok("Men’s Lead final | Koper 2026"));
  assert.ok(!ok("Women's Lead final | Koper 2026"), "the other category");
  assert.ok(!ok("Lead finals | Chamonix 2026"), "another event");
  assert.ok(!ok("Someone takes gold | Lead finals | Koper 2026"), "a result clip");
  assert.ok(!ok("Lead semi-finals | Koper 2026"), "another round");
  assert.ok(workerMod.climbReplayTitleOk("Boulder semi-finals | Salt Lake City 2026", "boulder", "semi-final", "women", "Salt Lake City", "2026"));
});

// Every athlete name in the fixtures, as whole words of 3+ letters.
function fixtureNames(): string[] {
  const names = new Set<string>();
  const add = (s: unknown) => {
    for (const w of String(s ?? "").split(/[\s,]+/)) if (w.length >= 3) names.add(w.toLowerCase());
  };
  for (const ev of calendar.events) for (const a of ev.start_list ?? []) { add(a.first_name); add(a.last_name); }
  for (const body of Object.values(results) as { ranking?: unknown[]; startlist?: unknown[] }[]) {
    for (const a of [...(body.ranking ?? []), ...(body.startlist ?? [])] as { firstname?: string; lastname?: string }[]) {
      add(a.firstname); add(a.lastname);
    }
  }
  return [...names];
}

test("the worker answers Koper's finals day with ratings and no athlete names", async () => {
  workerMod.climbResetState();
  const { restore } = stubUpstream();
  try {
    const res = await workerMod.default.fetch(new Request("https://hidescore.com/api/climbing?dates=20260905"), {}, { waitUntil() {} });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("Access-Control-Allow-Origin"), "*");
    const body = (await res.json()) as Day;
    assert.equal(body.events.length, 1);
    const ev = body.events[0];
    assert.equal(ev.location, "Koper");
    assert.equal(ev.dayIndex, 2);
    assert.equal(ev.dayCount, 2);
    assert.match(ev.whereToWatchUrl ?? "", /where-to-watch-the-world-climbing-series-koper-2026$/);
    assert.deepEqual(ev.rounds.map((r) => r.id).sort(), ["1487-lead-men-final", "1487-lead-women-final"]);
    for (const r of ev.rounds) {
      assert.equal(r.state, "post");
      assert.ok(typeof r.rating === "number");
    }
    // ⛔ Spoiler guard: not one name from the calendar or the results.
    assert.ok(fixtureNames().length > 50, "the guard has names to look for");
    const text = JSON.stringify(body).toLowerCase();
    const leaked = fixtureNames().filter((n) => new RegExp(`(^|[^a-z])${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z]|$)`).test(text));
    assert.deepEqual(leaked, []);
    assert.doesNotMatch(text, /"(rank|score|ranking|startlist|start_list|athlete|firstname|lastname)"/);
  } finally {
    restore();
  }
});

test("before a day starts, nothing is asked of the results service", async () => {
  workerMod.climbResetState();
  const { asked, restore } = stubUpstream();
  try {
    const day = await workerMod.climbDay("20261017", Date.parse("2026-10-10T12:00:00Z"));
    assert.equal(day.events[0].location, "Salt Lake City");
    assert.deepEqual(day.events[0].rounds.map((r) => r.state), ["pre", "pre"]);
    assert.deepEqual(day.events[0].rounds.map((r) => r.rating), [null, null]);
    assert.ok(!asked.some((u) => u.includes("ifsc.results.info")));
  } finally {
    restore();
  }
});

test("semis are never rated, and a refused results service still serves the schedule", async () => {
  workerMod.climbResetState();
  const { restore } = stubUpstream({ refuse: true });
  try {
    const day = await workerMod.climbDay("20260905", KOPER_FINAL_DONE);
    const rounds = day.events[0].rounds;
    assert.equal(rounds.length, 2);
    // Two hours past the scheduled end, so post without the results service.
    assert.deepEqual(rounds.map((r) => r.state), ["post", "post"]);
    assert.deepEqual(rounds.map((r) => r.rating), [null, null]);
    assert.equal(rounds[0].streamUrl, "https://youtu.be/ZvdCCugSDkg");
  } finally {
    restore();
  }
  workerMod.climbResetState();
  const again = stubUpstream();
  try {
    const semis = (await workerMod.climbDay("20260904", KOPER_FINAL_DONE)).events[0].rounds.filter((r) => r.kind === "semi-final");
    assert.equal(semis.length, 2);
    assert.deepEqual(semis.map((r) => r.rating), [null, null]);
  } finally {
    again.restore();
  }
});

test("a calendar that is down says so; a warm isolate keeps serving its last good copy", async () => {
  workerMod.climbResetState();
  const down = stubUpstream({ calendarDown: true });
  try {
    const day = await workerMod.climbDay("20261017", Date.parse("2026-10-10T12:00:00Z"));
    assert.deepEqual(day, { events: [], error: "calendar" });
  } finally {
    down.restore();
  }
  const up = stubUpstream();
  try {
    await workerMod.climbDay("20261017", Date.parse("2026-10-10T12:00:00Z"));
  } finally {
    up.restore();
  }
  const downAgain = stubUpstream({ calendarDown: true });
  try {
    const day = await workerMod.climbDay("20261017", Date.parse("2026-10-10T12:00:00Z"));
    assert.equal(day.events.length, 1);
  } finally {
    downAgain.restore();
  }
});

test("the Para Series is left out", async () => {
  workerMod.climbResetState();
  const { restore } = stubUpstream();
  try {
    const day = await workerMod.climbDay("20260515", Date.parse("2026-05-01T12:00:00Z"));
    assert.deepEqual(day.events, []);
  } finally {
    restore();
  }
});

test("the client card: SLC day 2 subtitle, rows, no hidden rounds", async () => {
  workerMod.climbResetState();
  const { restore } = stubUpstream();
  try {
    const day = await workerMod.climbDay("20261017", Date.parse("2026-10-10T12:00:00Z"));
    const card = espn.climbingCardFromApi(day.events[0]);
    assert.equal(card.kind, "climbing");
    assert.equal(card.subtitle, "Salt Lake City · Boulder · Day 2 of 3");
    assert.deepEqual(card.climbRounds!.map((r) => r.label), ["Men's Boulder Semi-final", "Men's Boulder Final"]);
    assert.equal(card.climbNotStreamed, 0);
    assert.equal(card.state, "pre");
    assert.equal(card.officialChannel, "World Climbing");
    // Day 1 is two unstreamed qualifications: no rows, one footer line.
    const day1 = await workerMod.climbDay("20261016", Date.parse("2026-10-10T12:00:00Z"));
    const c1 = espn.climbingCardFromApi(day1.events[0]);
    assert.equal(c1.climbRounds!.length, 0);
    assert.equal(c1.climbNotStreamed, 2);
    assert.equal(climb.climbNotStreamedLabel(2), "2 rounds not streamed");
  } finally {
    restore();
  }
});

test("Chamonix: streamed speed quals show, unstreamed lead quals are counted", async () => {
  workerMod.climbResetState();
  const { restore } = stubUpstream();
  try {
    const day = await workerMod.climbDay("20260710", Date.parse("2026-07-20T12:00:00Z"));
    const card = espn.climbingCardFromApi(day.events[0]);
    assert.deepEqual(card.climbRounds!.map((r) => r.label), ["Women's Speed Qualification", "Men's Speed Qualification"]);
    const day2 = await workerMod.climbDay("20260711", Date.parse("2026-07-20T12:00:00Z"));
    const c2 = espn.climbingCardFromApi(day2.events[0]);
    assert.equal(c2.climbNotStreamed, 2, "men's and women's lead qualification");
    assert.match(c2.subtitle ?? "", /^Chamonix · Lead & Speed · Day 2 of 3$|^Chamonix · Speed & Lead · Day 2 of 3$/);
  } finally {
    restore();
  }
});

test("a rating on anything but a finished final is dropped by the client", () => {
  const card = espn.climbingCardFromApi({
    id: "1", name: "X", location: "Y", disciplines: ["lead"], dayIndex: 1, dayCount: 1, whereToWatchUrl: null,
    rounds: [
      { id: "a", kind: "semi-final", discipline: "lead", category: "men", startsAt: "2026-09-04T20:00:00+02:00", endsAt: null, provisional: false, streamUrl: "https://youtu.be/odEZAUSxM30", blockedRegions: [], state: "post", rating: 90 },
      { id: "b", kind: "final", discipline: "lead", category: "men", startsAt: "2026-09-05T20:00:00+02:00", endsAt: null, provisional: false, streamUrl: "https://youtu.be/ZvdCCugSDkg", blockedRegions: [], state: "in", rating: 90 },
    ],
  });
  assert.deepEqual(card.climbRounds!.map((r) => r.rating), [null, null]);
});

test("labels, video ids and the column config", () => {
  assert.deepEqual(climb.climbRoundLabelVariants({ category: "women", discipline: "lead", kind: "semi-final" }),
    ["Women's Lead Semi-final", "Women's Lead Semi", "W Lead Semi", "W Lead SF"]);
  assert.equal(climb.climbStreamVideoId("https://youtu.be/ZvdCCugSDkg"), "ZvdCCugSDkg");
  assert.equal(climb.climbStreamVideoId("https://www.youtube.com/watch?v=ZvdCCugSDkg&t=10"), "ZvdCCugSDkg");
  assert.equal(climb.climbStreamVideoId("https://www.youtube.com/@worldclimbing/live"), null);
  const l = espn.ALL_LEAGUES.find((x) => x.sport === "climbing");
  assert.ok(l);
  assert.equal(l.label, "Climbing");
  assert.equal(l.excludeFromAuto, true);
  assert.equal(espn.sportGlyph("climbing"), "🧗");
  assert.equal(espn.sportStreamFallback("climbing"), "https://www.youtube.com/@worldclimbing/live");
  assert.equal(yt.getOfficialChannelName("climbing"), "World Climbing");
  assert.equal(yt.channelAlwaysMasksTitle(["World Climbing"]), true);
});
