import { expect, test } from "@playwright/test";

test("Poker yesterday renders the Aug 5 WSOP final table without a result", async ({ page }) => {
  let lookupUrl = "";
  let openedSearch = false;
  page.on("popup", () => { openedSearch = true; });
  await page.route("**/api/youtube?**", async (route) => {
    lookupUrl = route.request().url();
    await route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ error: "No results" }) });
  });
  await page.clock.setFixedTime(new Date("2026-08-06T16:00:00-04:00"));
  await page.addInitScript(() => {
    localStorage.setItem("nss-preferences", JSON.stringify({
      favoriteLeagues: ["poker"],
      favoriteTeams: [],
      theme: "light",
      showRatings: false,
      skipExplainer: true,
      skipNewsExplainer: true,
      showNews: false,
      leaguesOnboarded: true,
      firstLeague: "poker",
      secondLeague: "empty",
      thirdLeague: "empty",
      fourthLeague: "empty",
      fifthLeague: "empty",
      defaultDateMode: "yesterday",
      defaultLandingView: "scores",
    }));
  });

  await page.goto("/yesterday");
  await expect(page.getByRole("heading", { name: "Poker" })).toBeVisible();
  const title = page.getByText("WSOP Main Event Final Table · Day 3", { exact: true });
  await expect(title).toBeVisible();
  const card = title.locator("xpath=ancestor::div[contains(@class,'rounded-lg')][1]");
  await expect(card.getByText("Final", { exact: true })).toHaveCount(0);
  const replay = page.getByRole("button", { name: "WSOP highlights" });
  await expect(replay).toBeVisible();

  // The curated record carries no winner, payout, chip count, or result field;
  // this catches an accidental future leak into the visible tile.
  await expect(card).not.toContainText(/winner|champion|1st place|payout/i);

  // A miss is fail-closed: strict exact-channel request, then no button and no
  // external YouTube results page (whose titles would reveal the winner).
  await replay.click();
  await expect.poll(() => lookupUrl).not.toBe("");
  const lookup = new URL(lookupUrl);
  expect(lookup.searchParams.get("channel")).toBe("World Series of Poker");
  expect(lookup.searchParams.get("strict")).toBe("1");
  await expect(replay).toHaveCount(0);
  expect(openedSearch).toBe(false);
});

// ── Which major owns a given board date ────────────────────────────────────
//
// Poker majors sit WEEKS apart, which is what makes the walk-back rule
// different from the weekly leagues it was copied from. A fixed
// "past date ⇒ prefer the finished event" order let EPT Barcelona, which ended
// Aug 29, render "Final" on Aug 30, 31, Sep 1, 2 AND Sep 3 — the last of those
// with Triton Jeju starting the very next morning (Jacob 9/4: "shouldn't it be
// the final video and done? it's not the last one"). selectPokerEvent now picks
// whichever major is NEARER to the viewed date, so both of these hold at once.
function twoMajorsWithAGap() {
  const base = { schemaVersion: 1, verifiedAt: "2026-08-06", coverage: ["WSOP", "WPT", "EPT", "Triton"] };
  return JSON.stringify({
    ...base,
    events: [
      {
        id: "ept-gap-2026", tour: "EPT", title: "EPT Barcelona",
        startDate: "2026-08-16", endDate: "2026-08-29", location: "Casino Barcelona",
        broadcasts: ["PokerStars"], eventUrl: "https://www.pokerstarslive.com/ept/barcelona/",
        officialChannel: "PokerStars", officialLabel: "EPT",
        highlightQuery: "EPT Barcelona 2026 highlights", priority: 80,
      },
      {
        id: "triton-gap-2026", tour: "Triton", title: "Triton Super High Roller · Jeju",
        startDate: "2026-09-04", endDate: "2026-09-17", location: "Shinhwa World · Jeju",
        broadcasts: ["Triton Poker"], eventUrl: "https://www.tritonpokerseries.com/en-US/",
        officialChannel: "Triton Poker", officialLabel: "Triton",
        highlightQuery: "Triton Poker Jeju 2026 highlights", priority: 90,
      },
    ],
  });
}

async function pokerBoard(page: import("@playwright/test").Page, nowIso: string) {
  await page.route("**/poker-events.json", route => route.fulfill({
    status: 200, contentType: "application/json", body: twoMajorsWithAGap(),
  }));
  await page.route("**/api/youtube?**", route => route.fulfill({
    status: 404, contentType: "application/json", body: '{"error":"No results"}',
  }));
  await page.clock.setFixedTime(new Date(nowIso));
  await page.addInitScript(() => {
    localStorage.setItem("nss-preferences", JSON.stringify({
      favoriteLeagues: ["poker"], favoriteTeams: [], theme: "light",
      showRatings: false, skipExplainer: true, skipNewsExplainer: true, showNews: false,
      leaguesOnboarded: true, firstLeague: "poker", secondLeague: "empty",
      thirdLeague: "empty", fourthLeague: "empty", fifthLeague: "empty",
      defaultDateMode: "yesterday", defaultLandingView: "scores",
    }));
  });
}

test("a series that finished six days ago does not own yesterday's board", async ({ page }) => {
  // Now = Sep 4, so /yesterday is Sep 3: EPT Barcelona is 5 days finished and
  // Triton Jeju starts tomorrow. The nearer major wins.
  await pokerBoard(page, "2026-09-04T16:00:00-04:00");
  await page.goto("/yesterday");
  await expect(page.getByRole("heading", { name: "Poker" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Triton Super High Roller/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /EPT Barcelona/ })).toHaveCount(0);
});

test("the day after a series ends, its finished tile still holds the board", async ({ page }) => {
  // Now = Aug 31, so /yesterday is Aug 30: EPT Barcelona finished ONE day
  // earlier and Triton is five days out. This is the 2026-08-09 regression the
  // past-date walk-back was written for, and the distance rule has to keep it.
  await pokerBoard(page, "2026-08-31T16:00:00-04:00");
  await page.goto("/yesterday");
  await expect(page.getByRole("heading", { name: "Poker" })).toBeVisible();
  await expect(page.getByRole("button", { name: /EPT Barcelona/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Triton/ })).toHaveCount(0);
});
