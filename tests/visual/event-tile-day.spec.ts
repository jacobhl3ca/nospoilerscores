import { expect, test, type Page } from "@playwright/test";

// Holds ONE invariant: an event tile on TODAY (or any future tab) is never a
// race that already finished on an earlier day.
//
// The bug it locks down (Jacob 8/10, "nascar showing a highlight on today,
// rather than yesterday and before"): the undated ESPN scoreboard is documented
// as "current or next", and for F1 it is — but on 2026-08-10 the NASCAR and
// IndyCar endpoints both returned SUNDAY'S FINISHED race in state "post". The
// Today tab has no race of its own, fell through to that fallback, and rendered
// a finished tile with its highlight button on a day no race ran. Meanwhile the
// F1 column beside it correctly showed the NEXT race.
//
// The pure decision lives in isStaleFinishedForBoard (tests/event-tiles.test.ts
// pins it in both directions); this spec is the wiring — that fetchLeagueEvent
// actually walks forward, and that the tile it lands on carries no highlight.

const TODAY = "20260810";

async function setNascarOnly(page: Page) {
  await page.addInitScript(() => localStorage.setItem("nss-preferences", JSON.stringify({
    favoriteLeagues: ["nascar"],
    favoriteTeams: [],
    theme: "light",
    showRatings: false,
    skipExplainer: true,
    skipNewsExplainer: true,
    showNews: false,
    leaguesOnboarded: true,
    firstLeague: "nascar",
    secondLeague: "empty",
    thirdLeague: "empty",
    fourthLeague: "empty",
    fifthLeague: "empty",
    defaultDateMode: "today",
    defaultLandingView: "scores",
  })));
  await page.route("**/news/highlights.json", route => route.fulfill({
    status: 200, contentType: "application/json", body: '{"games":{}}',
  }));
  // Any highlight lookup resolves, so a leaked highlight button would actually
  // RENDER — a 404 mock would hide the regression this spec exists to catch.
  await page.route("**/api/youtube?**", route => route.fulfill({
    status: 200, contentType: "application/json", body: '{"videoId":"GuBBEFjoDw8"}',
  }));
}

function race(id: string, name: string, date: string, state: "pre" | "post") {
  return {
    id,
    date,
    name,
    shortName: name,
    links: [{ href: `https://www.espn.com/racing/race/_/id/${id}` }],
    status: { type: { state } },
    competitions: [{
      date,
      status: { type: { state } },
      venue: { fullName: "Iowa Speedway", address: { city: "Newton", state: "IA" } },
      broadcasts: [{ names: ["USA"] }],
    }],
  };
}

const IOWA_FINISHED = race("800001", "NASCAR Cup Series at Iowa", "2026-08-09T19:30Z", "post");
const RICHMOND_NEXT = race("800002", "NASCAR Cup Series at Richmond", "2026-08-15T23:00Z", "pre");

// Reproduces ESPN's real behaviour on 2026-08-10: nothing on today, the UNDATED
// call hands back Sunday's finished race, and only a forward range reveals the
// next one.
async function routeEspnLikeAugust10(page: Page) {
  await page.route("**/racing/nascar-premier/scoreboard**", route => {
    const dates = new URL(route.request().url()).searchParams.get("dates");
    const body = !dates
      ? { events: [IOWA_FINISHED] }                       // undated → the STALE one
      : dates === TODAY
        ? { events: [] }                                  // today → no race
        : dates.startsWith(TODAY + "-")
          ? { events: [RICHMOND_NEXT] }                   // forward range → the fix
          : { events: [IOWA_FINISHED] };                  // any past range/day
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });
}

test("today's race tile is the NEXT race, not Sunday's finished one", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-08-10T16:00:00-04:00"));
  await setNascarOnly(page);
  await routeEspnLikeAugust10(page);

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "NASCAR" })).toBeVisible();

  const title = page.locator('[data-fit-line="title"]').first();
  await expect(title).toBeVisible();
  await expect(title).toHaveText(/Richmond/);
  await expect(page.locator('[data-fit-line="title"]')).not.toHaveText(/Iowa/);
  // And nothing on today offers to replay a race that hasn't run.
  await expect(page.getByRole("button", { name: /highlight/i })).toHaveCount(0);
});

test("yesterday still shows the finished race, with its highlight", async ({ page }) => {
  // The other half of the rule: a PAST tab is exactly where a finished race
  // belongs. A fix that hid it there would have traded one bug for a worse one.
  await page.clock.setFixedTime(new Date("2026-08-10T16:00:00-04:00"));
  await setNascarOnly(page);
  await page.route("**/racing/nascar-premier/scoreboard**", route =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ events: [IOWA_FINISHED] }) }));

  await page.goto("/yesterday");
  await expect(page.getByRole("heading", { name: "NASCAR" })).toBeVisible();
  await expect(page.locator('[data-fit-line="title"]').first()).toHaveText(/Iowa/);
  await expect(page.getByRole("button", { name: /NASCAR highlights/i })).toHaveCount(1);
});
