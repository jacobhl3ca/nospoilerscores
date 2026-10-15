import { expect, test } from "@playwright/test";
import { WORLD_CUP_TEAMS } from "../../src/lib/worldCupTeams";
import {
  FAILED_LOAD, SCORE, WIDTHS, collectErrors, expectNoHorizontalOverflow, jsonLdNodes, pageTextAndLabels, stubThirdParty,
} from "./offline-doc-page";

// /worldcup/teams: the 48-country grid. One link per WORLD_CUP_TEAMS entry,
// in FIFA-rank order, with a visual "#N" that screen readers hear as
// "FIFA rank N", three footer links, and a JSON-LD ItemList that mirrors the
// grid. The list is baked, so there is no empty or loading state; the error
// state is every third-party request failing. Third-party requests are
// stubbed (offline-doc-page.ts).

const first = WORLD_CUP_TEAMS[0];
const last = WORLD_CUP_TEAMS[WORLD_CUP_TEAMS.length - 1];

for (const size of WIDTHS) {
  test.describe(`${size.width}px`, () => {
    test.use({ viewport: size });

    test("title, 48 team links in rank order, footer, JSON-LD", async ({ page }) => {
      const errors = collectErrors(page);
      await stubThirdParty(page);
      const res = await page.goto("/worldcup/teams");
      expect(res?.status()).toBe(200);
      await expect(page).toHaveTitle("2026 World Cup Teams - Spoiler-Free Schedules | HideScore");
      await expect(page.getByRole("heading", { level: 1, name: "2026 World Cup teams without spoilers" })).toBeVisible();

      const grid = page.locator('main a[href^="/worldcup/teams/"]');
      await expect(grid).toHaveCount(WORLD_CUP_TEAMS.length);
      const hrefs = await grid.evaluateAll((as) => as.map((a) => a.getAttribute("href")));
      expect(hrefs).toEqual(WORLD_CUP_TEAMS.map((t) => `/worldcup/teams/${t.slug}`));

      // Visual "#1"; accessible name "Argentina FIFA rank 1" (flag and "#" hidden).
      await expect(grid.first()).toContainText(`#${first.rank}`);
      await expect(page.getByRole("link", { name: `${first.name} FIFA rank ${first.rank}`, exact: true })).toBeVisible();
      await expect(page.getByRole("link", { name: `${last.name} FIFA rank ${last.rank}`, exact: true })).toBeAttached();

      for (const [name, href] of [["World Cup hub", "/worldcup"], ["Tomorrow", "/worldcup/tomorrow"], ["Highlights", "/worldcup/highlights"]]) {
        await expect(page.getByRole("link", { name, exact: true })).toHaveAttribute("href", href);
      }

      const nodes = await jsonLdNodes(page);
      const collection = nodes.find((n) => n["@type"] === "CollectionPage") as {
        mainEntity: { numberOfItems: number; itemListElement: { position: number; name: string; url: string }[] };
      };
      expect(collection.mainEntity.numberOfItems).toBe(WORLD_CUP_TEAMS.length);
      expect(collection.mainEntity.itemListElement.map((i) => [i.position, i.name, i.url])).toEqual(
        WORLD_CUP_TEAMS.map((t, i) => [i + 1, t.name, `https://hidescore.com/worldcup/teams/${t.slug}`]),
      );
      expect(nodes.map((n) => n["@type"])).toContain("BreadcrumbList");

      expect(await pageTextAndLabels(page)).not.toMatch(SCORE);
      await expectNoHorizontalOverflow(page);
      expect(errors()).toEqual([]);
    });

    test("a team link opens that team's page", async ({ page }) => {
      const errors = collectErrors(page);
      await stubThirdParty(page);
      await page.goto("/worldcup/teams");
      await page.getByRole("link", { name: `${first.name} FIFA rank ${first.rank}`, exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`/worldcup/teams/${first.slug}$`));
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(`${first.name} World Cup schedule without spoilers`);
      expect(errors()).toEqual([]);
    });

    test("third-party requests fail: the grid still renders", async ({ page }) => {
      const errors = collectErrors(page);
      await stubThirdParty(page, "fail");
      await page.goto("/worldcup/teams");
      await expect(page.locator('main a[href^="/worldcup/teams/"]')).toHaveCount(WORLD_CUP_TEAMS.length);
      await expectNoHorizontalOverflow(page);
      expect(errors([FAILED_LOAD])).toEqual([]);
    });
  });
}
