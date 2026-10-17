import { expect, test, type Page } from "@playwright/test";

// A per-game TV channel line (`Peacock = …/game?{game}`) checks the user's own
// tuner for that game's stream. The check ran on render until 10/17, and a
// fetch to a tailnet address on page load made Firefox ask "allow this site to
// reach your local network?" on every visit. It now runs on the chip's click.

const TUNER = "http://tuner.lna.test:9443";
const WEB = "https://www.peacocktv.com/sports/mlb";

async function setup(page: Page, checkStatus: number) {
  const asked: string[] = [];
  await page.clock.setFixedTime(new Date("2026-09-27T12:00:00-04:00"));
  await page.addInitScript(([tuner]) => {
    localStorage.setItem("nss-preferences", JSON.stringify({
      favoriteLeagues: ["mlb"],
      favoriteTeams: [],
      theme: "light",
      skipExplainer: true,
      skipNewsExplainer: true,
      showNews: false,
      leaguesOnboarded: true,
      firstLeague: "mlb",
      secondLeague: "empty",
      thirdLeague: "empty",
      fourthLeague: "empty",
      fifthLeague: "empty",
      defaultDateMode: "today",
      defaultLandingView: "scores",
      tvChannelLinks: `Peacock = ${tuner}/game?{game}`,
      tvPlayer: "raw",
    }));
    const w = window as unknown as { __opened: string[] };
    w.__opened = [];
    window.open = (u?: string | URL) => { w.__opened.push(String(u)); return null; };
  }, [TUNER]);
  await page.route(`${TUNER}/**`, (route) => {
    asked.push(route.request().url());
    return route.fulfill({ status: checkStatus, body: "", headers: { "access-control-allow-origin": "*" } });
  });
  await page.route("**/radio-stations.json", (route) => route.fulfill({ status: 404, body: "" }));
  await page.route("**/news/highlights.json", (route) => route.fulfill({
    status: 200, contentType: "application/json", body: '{"games":{}}',
  }));
  await page.route("**/baseball/mlb/scoreboard?**", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      events: [{
        id: "401999102",
        date: "2026-09-27T23:10:00Z",
        name: "Los Angeles Angels at Houston Astros",
        shortName: "LAA @ HOU",
        season: { type: 2 },
        status: {
          displayClock: "0:00",
          period: 0,
          type: { name: "STATUS_SCHEDULED", state: "pre", detail: "Sun, September 27th at 7:10 PM EDT", shortDetail: "9/27 - 7:10 PM EDT", completed: false },
        },
        competitions: [{
          competitors: [
            { homeAway: "home", team: { id: "18", displayName: "Houston Astros", shortDisplayName: "Astros", abbreviation: "HOU", logo: "", color: "002D62" }, score: "0", records: [{ summary: "88-73" }] },
            { homeAway: "away", team: { id: "3", displayName: "Los Angeles Angels", shortDisplayName: "Angels", abbreviation: "LAA", logo: "", color: "BA0021" }, score: "0", records: [{ summary: "70-91" }] },
          ],
          broadcasts: [{ names: ["Peacock"] }],
          headlines: [],
          notes: [],
        }],
      }],
    }),
  }));
  await page.goto("/");
  const chip = page.locator('a[title="Watch Peacock on your TV"]').locator("visible=true").first();
  await expect(chip).toBeVisible();
  return { asked, chip };
}

const opened = (page: Page) => page.evaluate(() => (window as unknown as { __opened: string[] }).__opened);

test("a Peacock card renders without contacting the tuner; the click checks, then opens the stream", async ({ page }) => {
  const { asked, chip } = await setup(page, 200);
  await page.waitForTimeout(1500);
  expect(asked, "no tuner request on render").toEqual([]);
  expect(await chip.getAttribute("href")).toMatch(/^http:\/\/tuner\.lna\.test:9443\/game\?net=Peacock&home=Houston\+Astros/);
  await chip.click();
  await expect.poll(() => opened(page)).toHaveLength(1);
  expect(asked).toHaveLength(1);
  expect(asked[0]).toMatch(/&check=1$/);
  expect((await opened(page))[0]).toMatch(/^http:\/\/tuner\.lna\.test:9443\/game\?net=Peacock/);
});

test("a 404 from the click's check opens the network's website instead", async ({ page }) => {
  const { asked, chip } = await setup(page, 404);
  await page.waitForTimeout(500);
  expect(asked).toEqual([]);
  await chip.click();
  await expect.poll(() => opened(page)).toHaveLength(1);
  expect((await opened(page))[0]).not.toContain("tuner.lna.test");
  expect(asked).toHaveLength(1);
});
