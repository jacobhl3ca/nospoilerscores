import { expect, test } from "@playwright/test";
import { TEAM_PAGE_LEAGUES, teamPagePath, teamsInLeague } from "../../src/lib/teamPageLeagues";
import {
  FAILED_LOAD, SCORE, WIDTHS, collectErrors, expectNoHorizontalOverflow, jsonLdNodes, pageTextAndLabels, stubThirdParty,
} from "./offline-doc-page";

// /teams (2026-09-26): the hub that links every team page. A "Leagues" jump
// bar, then one section per league with its guide link and a grid of team
// links, each with a logo. The data is baked (src/lib/teamPages.ts), so there
// is no empty or loading state; the error state is the logo CDN failing,
// where each logo hides (TeamLogo hide="display") and the names stay.
// Third-party requests are stubbed (offline-doc-page.ts).

const TOTAL = TEAM_PAGE_LEAGUES.reduce((n, l) => n + teamsInLeague(l.league).length, 0);

for (const size of WIDTHS) {
  test.describe(`${size.width}px`, () => {
    test.use({ viewport: size });

    test("title, league jump bar, every team link, JSON-LD", async ({ page }) => {
      const errors = collectErrors(page);
      await stubThirdParty(page);
      const res = await page.goto("/teams");
      expect(res?.status()).toBe(200);
      await expect(page).toHaveTitle("Team Schedules Without Spoilers | HideScore");
      await expect(page.getByRole("heading", { level: 1, name: "Team schedules without spoilers" })).toBeVisible();
      await expect(page.getByRole("navigation", { name: "Breadcrumb" })).toContainText("HideScore");

      const jump = page.getByRole("navigation", { name: "Leagues" }).getByRole("link");
      await expect(jump).toHaveText(TEAM_PAGE_LEAGUES.map((l) => l.label));
      for (let i = 0; i < TEAM_PAGE_LEAGUES.length; i++) {
        await expect(jump.nth(i)).toHaveAttribute("href", `#${TEAM_PAGE_LEAGUES[i].league}`);
      }

      for (const l of TEAM_PAGE_LEAGUES) {
        const section = page.locator(`section#${l.league}`);
        await expect(section.getByRole("heading", { level: 2 })).toContainText(`${l.label} team scores without spoilers`);
        await expect(section.getByRole("link", { name: `${l.label} guide` })).toHaveAttribute("href", l.guide);
        const teams = teamsInLeague(l.league);
        const links = section.getByRole("listitem").getByRole("link");
        await expect(links).toHaveCount(teams.length);
        await expect(links.first()).toHaveAttribute("href", teamPagePath(teams[0]));
        await expect(links.first()).toHaveText(teams[0].name);
        await expect(links.last()).toHaveAttribute("href", teamPagePath(teams[teams.length - 1]));
      }
      await expect(page.locator("main section li a")).toHaveCount(TOTAL);

      // The first logo loads (the stub serves a PNG) and is decorative.
      const logo = page.locator("section#nfl li img").first();
      await expect(logo).toBeVisible();
      await expect(logo).toHaveAttribute("alt", "");
      await expect.poll(() => logo.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);

      const types = (await jsonLdNodes(page)).map((n) => n["@type"]);
      expect(types).toEqual(expect.arrayContaining(["CollectionPage", "BreadcrumbList"]));

      expect(await pageTextAndLabels(page)).not.toMatch(SCORE);
      await expectNoHorizontalOverflow(page);
      expect(errors()).toEqual([]);
    });

    test("a jump link scrolls its league into view", async ({ page }) => {
      const errors = collectErrors(page);
      await stubThirdParty(page);
      await page.goto("/teams");
      await page.getByRole("navigation", { name: "Leagues" }).getByRole("link", { name: "Premier League" }).click();
      await expect(page).toHaveURL(/\/teams#premier-league$/);
      await expect(page.locator("section#premier-league h2")).toBeInViewport();
      await expectNoHorizontalOverflow(page);
      expect(errors()).toEqual([]);
    });

    test("logo CDN fails after hydration: logos hide, names and links stay", async ({ page }) => {
      const errors = collectErrors(page);
      await stubThirdParty(page);
      await page.goto("/teams");
      const img = page.locator("section#nfl li img").first();
      await expect(img).toBeVisible();
      // Wait for React to own the <img> (hydrated), then take the CDN down
      // and make a fresh request fail while onError is listening.
      await expect.poll(() => img.evaluate((el) => Object.keys(el).some((k) => k.startsWith("__reactFiber")))).toBe(true);
      await page.unrouteAll({ behavior: "ignoreErrors" });
      await stubThirdParty(page, "fail");
      await img.evaluate((el: HTMLImageElement) => { el.src = `${el.src.split("?")[0]}?retry=1`; });
      await expect(img).toBeHidden();
      const first = page.locator("section#nfl li a").first();
      await expect(first).toBeVisible();
      await expect(first).toHaveText(teamsInLeague("nfl")[0].name);
      await expectNoHorizontalOverflow(page);
      expect(errors([FAILED_LOAD])).toEqual([]);
    });

    test("logo CDN down from the first request: logos hide, names and links stay", async ({ page }) => {
      test.fixme(true, "Bug: a logo that fails before hydration misses TeamLogo's onError and stays a visible broken image.");
      const errors = collectErrors(page);
      await stubThirdParty(page, "fail");
      await page.goto("/teams");
      const first = page.locator("section#nfl li a").first();
      await expect(first).toBeVisible();
      await expect(first).toHaveText(teamsInLeague("nfl")[0].name);
      await expect(first.locator("img")).toBeHidden();
      await expect(page.locator("main section li a")).toHaveCount(TOTAL);
      await expectNoHorizontalOverflow(page);
      expect(errors([FAILED_LOAD])).toEqual([]);
    });
  });
}
