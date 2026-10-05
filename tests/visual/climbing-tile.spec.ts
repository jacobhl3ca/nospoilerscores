import { expect, test, type Page } from "@playwright/test";

// The Climbing column (added 2026-10-03) against a mocked /api/climbing. The
// worker's own behaviour (calendar split, ratings, the no-names guard) is in
// tests/climbing.test.ts; this is the wiring: the day subtitle, one card per
// round, Watch live before / Watch replay after, the rating badge behind the
// ratings switch, and no athlete name anywhere on the board.

const prefs = (showRatings: boolean) => ({
  favoriteLeagues: ["climbing"], favoriteTeams: [], theme: "light", showRatings,
  skipExplainer: true, skipNewsExplainer: true, showNews: false, leaguesOnboarded: true,
  firstLeague: "climbing", secondLeague: "empty", thirdLeague: "empty", fourthLeague: "empty",
  fifthLeague: "empty", defaultDateMode: "today", defaultLandingView: "scores",
});

const round = (o: Record<string, unknown>) => ({
  endsAt: null, provisional: false, streamUrl: null, blockedRegions: [], state: "pre", rating: null, ...o,
});

// What the worker answered for these two days (shape of climbDay), names-free.
const SLC_DAY2 = {
  events: [{
    id: "1488", name: "World Climbing Series Salt Lake City 2026", location: "Salt Lake City",
    disciplines: ["boulder"], dayIndex: 2, dayCount: 3, whereToWatchUrl: null,
    rounds: [
      round({ id: "1488-boulder-men-semi-final", kind: "semi-final", discipline: "boulder", category: "men", startsAt: "2026-10-17T10:00:00-06:00", endsAt: "2026-10-17T12:50:00-06:00", provisional: true }),
      round({ id: "1488-boulder-men-final", kind: "final", discipline: "boulder", category: "men", startsAt: "2026-10-17T19:00:00-06:00", endsAt: "2026-10-17T20:30:00-06:00", provisional: true }),
    ],
  }],
};
const BLOCKED = ["AT", "DE", "FR", "GB", "IT"];
const KOPER_FINALS = {
  events: [{
    id: "1487", name: "World Climbing Series Koper 2026", location: "Koper",
    disciplines: ["lead"], dayIndex: 2, dayCount: 2,
    whereToWatchUrl: "https://www.worldclimbing.com/news/where-to-watch-the-world-climbing-series-koper-2026",
    rounds: [
      round({ id: "1487-lead-men-final", kind: "final", discipline: "lead", category: "men", startsAt: "2026-09-05T20:00:00+02:00", endsAt: "2026-09-05T22:42:00+02:00", streamUrl: "https://youtu.be/ZvdCCugSDkg", blockedRegions: BLOCKED, state: "post", rating: 76 }),
      round({ id: "1487-lead-women-final", kind: "final", discipline: "lead", category: "women", startsAt: "2026-09-05T20:00:00+02:00", endsAt: "2026-09-05T22:42:00+02:00", streamUrl: "https://youtu.be/ZvdCCugSDkg", blockedRegions: BLOCKED, state: "post", rating: 30 }),
    ],
  }],
};
// Names from the real fixtures for these rounds; none may reach the page.
const NAMES = ["Suzuki", "Yoshida", "Garnbret", "Anraku", "Schalck", "Avezou"];

async function open(page: Page, opts: { now: string; path: string; showRatings: boolean; body: unknown }) {
  const asked: string[] = [];
  await page.route("**/api/climbing?**", (route) => {
    asked.push(route.request().url());
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(opts.body) });
  });
  await page.route("**/news/highlights.json", (route) => route.fulfill({ status: 200, contentType: "application/json", body: '{"games":{}}' }));
  await page.clock.setFixedTime(new Date(opts.now));
  await page.addInitScript((p) => localStorage.setItem("nss-preferences", JSON.stringify(p)), prefs(opts.showRatings));
  await page.goto(opts.path);
  await expect(page.getByRole("heading", { name: "Climbing" })).toBeVisible();
  return asked;
}

test("Oct 17: the Salt Lake City day shows its two rounds, Watch live, and no names", async ({ page }) => {
  const asked = await open(page, { now: "2026-10-17T09:00:00-04:00", path: "/today", showRatings: true, body: SLC_DAY2 });
  expect(asked.some((u) => u.includes("dates=20261017"))).toBe(true);
  await expect(page.locator("[data-climb-subtitle]")).toHaveText(/Salt Lake City · Boulder · Day 2(?: of |\/)3/);
  const cards = page.locator("[data-climb-round]");
  await expect(cards).toHaveCount(2);
  await expect(cards.nth(0)).toContainText("Men's Boulder Semi");
  await expect(cards.nth(1)).toContainText("Men's Boulder Final");
  // Provisional times carry the ≈ marker.
  await expect(cards.nth(1)).toContainText("≈");
  await expect(page.getByRole("link", { name: /Watch Men's Boulder Final live on YouTube/ })).toHaveAttribute("href", "https://www.youtube.com/@worldclimbing/live");
  await expect(page.getByRole("button", { name: /Watch replay/ })).toHaveCount(0);
  await expect(page.getByRole("img", { name: /Worth-watching rating/ })).toHaveCount(0);
  const text = await page.locator("main").innerText();
  for (const n of NAMES) expect(text.toLowerCase()).not.toContain(n.toLowerCase());
});

test("Sep 5 (Koper): finished finals offer Watch replay and a badge with ratings on", async ({ page }) => {
  await open(page, { now: "2026-09-05T23:30:00-04:00", path: "/today", showRatings: true, body: KOPER_FINALS });
  const cards = page.locator("[data-climb-round]");
  await expect(cards).toHaveCount(2);
  await expect(page.getByRole("button", { name: /Watch replay highlights/ })).toHaveCount(2);
  await expect(page.getByRole("img", { name: /Worth-watching rating: Good/ })).toHaveCount(1);
  await expect(page.getByRole("img", { name: /Worth-watching rating: Skip/ })).toHaveCount(1);
  await expect(cards.first()).toContainText("YouTube · geo-blocked");
  await expect(page.getByRole("link", { name: "Other regions" }).first()).toHaveAttribute("href", /where-to-watch-the-world-climbing-series-koper-2026/);
  const text = await page.locator("main").innerText();
  for (const n of NAMES) expect(text.toLowerCase()).not.toContain(n.toLowerCase());
});

test("Sep 5 (Koper): no badge with ratings off, the replay still there", async ({ page }) => {
  await open(page, { now: "2026-09-05T23:30:00-04:00", path: "/today", showRatings: false, body: KOPER_FINALS });
  await expect(page.locator("[data-climb-round]")).toHaveCount(2);
  await expect(page.getByRole("button", { name: /Watch replay highlights/ })).toHaveCount(2);
  await expect(page.getByRole("img", { name: /Worth-watching rating/ })).toHaveCount(0);
});

test("a day of unstreamed qualifications says how many", async ({ page }) => {
  await open(page, {
    now: "2026-10-16T09:00:00-04:00", path: "/today", showRatings: false,
    body: { events: [{ ...SLC_DAY2.events[0], dayIndex: 1, rounds: [
      round({ id: "q1", kind: "qualification", discipline: "boulder", category: "men", startsAt: "2026-10-16T09:00:00-06:00" }),
      round({ id: "q2", kind: "qualification", discipline: "boulder", category: "women", startsAt: "2026-10-16T16:00:00-06:00" }),
    ] }] },
  });
  await expect(page.locator("[data-climb-round]")).toHaveCount(0);
  await expect(page.locator("[data-climb-not-streamed]")).toHaveText("2 rounds not streamed");
});

test("the calendar being down reads as unavailable, not as a quiet day", async ({ page }) => {
  await open(page, { now: "2026-10-17T09:00:00-04:00", path: "/today", showRatings: false, body: { events: [], error: "calendar" } });
  await expect(page.getByText("Event info unavailable")).toBeVisible();
});
