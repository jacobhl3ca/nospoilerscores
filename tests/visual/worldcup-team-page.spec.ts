import { expect, test } from "@playwright/test";
import { getWorldCupTeam } from "../../src/lib/worldCupTeams";
import { formatWorldCupDay, worldCupLastMatchYmd } from "../../src/lib/worldCup2026";
import {
  FAILED_LOAD, SCORE, WIDTHS, collectErrors, expectNoHorizontalOverflow, jsonLdNodes, pageTextAndLabels, stubThirdParty,
} from "./offline-doc-page";

// /worldcup/teams/<slug>: one static page per team. Title and h1 from the
// team name, the FIFA rank line, a last-match link (shown after the final:
// date only, read from the baked table), four "Follow" links, four FAQ items,
// and WebPage + SportsTeam + BreadcrumbList + FAQPage JSON-LD. The empty
// state is an unknown slug (dynamicParams = false → the 404 page); the error
// state is every third-party request failing. Third-party requests are
// stubbed (offline-doc-page.ts). The dev server reads the real clock, and the
// tournament ended 2026-07-19, so the last-match link is always on.

// Spain takes "Spain's"; a name ending in s takes a bare apostrophe.
const CASES = [
  { slug: "spain", possessive: "Spain's" },
  { slug: "netherlands", possessive: "Netherlands'" },
];

for (const size of WIDTHS) {
  test.describe(`${size.width}px`, () => {
    test.use({ viewport: size });

    for (const { slug, possessive } of CASES) {
      test(`${slug}: title, rank, last-match link, follow links, FAQ, JSON-LD`, async ({ page }) => {
        const team = getWorldCupTeam(slug)!;
        const ymd = worldCupLastMatchYmd(slug)!;
        const errors = collectErrors(page);
        await stubThirdParty(page);
        const res = await page.goto(`/worldcup/teams/${slug}`);
        expect(res?.status()).toBe(200);

        await expect(page).toHaveTitle(`${team.name} World Cup Schedule Without Spoilers | HideScore`);
        await expect(page.getByRole("heading", { level: 1 })).toHaveText(`${team.name} World Cup schedule without spoilers`);
        await expect(page.getByText(`FIFA ranking snapshot: #${team.rank}.`)).toBeVisible();

        const lastMatch = page.getByRole("link", { name: `Open ${possessive} last match, ${formatWorldCupDay(ymd)}`, exact: true });
        await expect(lastMatch).toBeVisible();
        await expect(lastMatch).toHaveAttribute("href", `/worldcup?d=${ymd}`);

        for (const [name, href] of [
          ["Open World Cup hub", "/worldcup"],
          ["Tomorrow's matches", "/worldcup/tomorrow"],
          ["Spoiler-free highlights", "/worldcup/highlights"],
          ["Watch guide", "/watch-world-cup-without-spoilers"],
          ["All teams", "/worldcup/teams"],
        ]) {
          await expect(page.getByRole("link", { name, exact: true })).toHaveAttribute("href", href);
        }

        const questions = page.locator("main section h3");
        await expect(questions).toHaveCount(4);
        await expect(questions.first()).toHaveText(`Can I follow ${team.name} at the World Cup without seeing the score?`);

        const nodes = await jsonLdNodes(page);
        expect(nodes.map((n) => n["@type"])).toEqual(expect.arrayContaining(["WebPage", "SportsTeam", "BreadcrumbList", "FAQPage"]));
        expect(nodes.find((n) => n["@type"] === "SportsTeam")?.name).toBe(team.name);
        const crumbs = nodes.find((n) => n["@type"] === "BreadcrumbList") as { itemListElement: { name: string }[] };
        expect(crumbs.itemListElement.map((c) => c.name)).toEqual(["HideScore", "World Cup", "Teams", team.name]);
        const faq = nodes.find((n) => n["@type"] === "FAQPage") as { mainEntity: { name: string }[] };
        expect(faq.mainEntity.map((q) => q.name)).toEqual(await questions.allTextContents());

        expect(await pageTextAndLabels(page)).not.toMatch(SCORE);
        await expectNoHorizontalOverflow(page);
        expect(errors()).toEqual([]);
      });
    }

    test("text flag (England): the tag renders in the flag tile", async ({ page }) => {
      const errors = collectErrors(page);
      await stubThirdParty(page);
      await page.goto("/worldcup/teams/england");
      await expect(page.locator("main span[aria-hidden='true']").filter({ hasText: /^ENG$/ })).toBeVisible();
      await expectNoHorizontalOverflow(page);
      expect(errors()).toEqual([]);
    });

    test("unknown team: the 404 page, not an empty team page", async ({ page }) => {
      const errors = collectErrors(page);
      await stubThirdParty(page);
      const res = await page.goto("/worldcup/teams/not-a-team");
      expect(res?.status()).toBe(404);
      await expect(page.getByRole("heading", { level: 1, name: "Page not found" })).toBeVisible();
      await expect(page.getByRole("link", { name: "Back to HideScore" })).toHaveAttribute("href", "/");
      await expect(page.getByText("World Cup schedule without spoilers")).toHaveCount(0);
      await expectNoHorizontalOverflow(page);
      // The document's own 404 status is the one expected console line.
      expect(errors([/status of 404/])).toEqual([]);
    });

    test("third-party requests fail: the page still renders", async ({ page }) => {
      const errors = collectErrors(page);
      await stubThirdParty(page, "fail");
      await page.goto("/worldcup/teams/spain");
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("Spain World Cup schedule without spoilers");
      await expect(page.locator("main section h3")).toHaveCount(4);
      await expectNoHorizontalOverflow(page);
      expect(errors([FAILED_LOAD])).toEqual([]);
    });
  });
}
