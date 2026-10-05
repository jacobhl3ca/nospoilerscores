import { expect, test, type Page } from "@playwright/test";

// Footer links are soft navigations (10/5). In the iOS shell a failed PAGE
// load shows the bundled "No connection" screen, so a footer tap must not be
// a page load: every link from the board and from a doc page has to reach its
// page with zero `document` requests after the first one, and back has to
// return to the board.

const PAGES: { href: string; h1: string }[] = [
  { href: "/about", h1: "About HideScore" },
  { href: "/faq", h1: "Frequently asked questions" },
  { href: "/guides", h1: "Spoiler-free guides" },
  { href: "/contact", h1: "Contact HideScore" },
  { href: "/contact#feedback", h1: "Contact HideScore" },
  { href: "/privacy", h1: "Privacy Policy" },
];

const LABEL: Record<string, string> = {
  "/about": "About", "/faq": "FAQ", "/guides": "Guides",
  "/contact": "Contact", "/contact#feedback": "Feedback", "/privacy": "Privacy",
};

async function setup(page: Page) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => localStorage.setItem("nss-preferences", JSON.stringify({
    favoriteLeagues: ["mlb"], favoriteTeams: [], theme: "light", showRatings: false,
    skipExplainer: true, skipNewsExplainer: true, showNews: false, leaguesOnboarded: true,
    defaultLandingView: "scores",
  })));
  const docs: string[] = [];
  page.on("request", (r) => {
    if (r.resourceType() === "document" && r.frame() === page.mainFrame()) docs.push(r.url());
  });
  return docs;
}

function footerLink(page: Page, href: string) {
  // The board footer row and DocFooter's nav both carry these hrefs; take the last
  // one on the page (the footer, below any in-body link).
  return page.locator(`a[href="${href}"]`).filter({ hasText: new RegExp(`^${LABEL[href]}$`) }).last();
}

async function expectArrived(page: Page, target: { href: string; h1: string }) {
  const [path, hash] = target.href.split("#");
  await expect(page).toHaveURL((u) => u.pathname === path && (hash ? u.hash === `#${hash}` : true));
  await expect(page.getByRole("heading", { level: 1, name: target.h1 })).toBeVisible();
  if (hash) {
    await expect(page.locator(`#${hash}`)).toBeInViewport();
    // At 390 px the form sits below the fold, so this proves the hash scrolled.
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  }
}

for (const target of PAGES) {
  test(`board footer → ${target.href} is a soft navigation, back returns to the board`, async ({ page }) => {
    const docs = await setup(page);
    await page.goto("/");
    const link = footerLink(page, target.href);
    await link.scrollIntoViewIfNeeded();
    await link.click();
    await expectArrived(page, target);
    // The doc page marked the tap as arrived (lib/navRecovered).
    // The doc page's effect runs a moment after paint, so poll.
    await expect.poll(() => page.evaluate(() => sessionStorage.getItem("hs-footer-tap"))).toBeNull();
    await page.goBack();
    await expect(page).toHaveURL((u) => u.pathname === "/");
    await expect(footerLink(page, "/about")).toBeAttached();
    expect(docs).toHaveLength(1);
  });
}

for (const target of PAGES.filter((p) => p.href !== "/about")) {
  test(`/about footer → ${target.href} is a soft navigation`, async ({ page }) => {
    const docs = await setup(page);
    await page.goto("/about");
    const link = footerLink(page, target.href);
    await link.scrollIntoViewIfNeeded();
    await link.click();
    await expectArrived(page, target);
    expect(docs).toHaveLength(1);
  });
}

test("a footer tap that never arrived is counted once on the next board load", async ({ page }) => {
  await setup(page);
  // The real tracker would replace the stub; keep it out.
  await page.route("https://stats.hidescore.com/**", (r) => r.abort());
  await page.addInitScript(() => {
    const w = window as unknown as { __ev: unknown[]; umami: unknown };
    w.__ev = [];
    w.umami = { track: (n: string, d: unknown) => w.__ev.push([n, d]) };
    if (!sessionStorage.getItem("seeded")) {
      sessionStorage.setItem("seeded", "1");
      sessionStorage.setItem("hs-footer-tap", JSON.stringify({ sw: true, secs: 312 }));
    }
  });
  await page.goto("/");
  await expect.poll(() => page.evaluate(() => (window as unknown as { __ev: unknown[] }).__ev))
    .toEqual([["nav-recovered", { sw: "yes", secs: "312" }]]);
  await page.reload();
  await expect(footerLink(page, "/about")).toBeAttached();
  await page.waitForTimeout(1500);
  expect(await page.evaluate(() => (window as unknown as { __ev: unknown[] }).__ev)).toEqual([]);
});
