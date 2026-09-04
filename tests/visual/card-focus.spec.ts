import { expect, test } from "@playwright/test";

// A tap must leave NO ring on a score card; Tab must still show one.
//
// The cards are divs with role="button" + tabIndex=0, and a div with a tabindex
// takes focus on mousedown. Two different browsers then paint two different
// rings: Safari's default :focus outline, and — measured, not assumed —
// Chromium's :focus-visible, which DOES match a pointer click on a div (it
// withholds the ring only for natively clickable controls, which is why the
// app's real <button> classes can key off :focus-visible and these cannot).
// Either way a light-blue ring sat around the card after an ordinary tap and
// stayed there once the details sheet closed (Jacob 9/4, "i think no highlight
// is better in general").
//
// Both halves are asserted on purpose: `outline: none` everywhere would also
// pass a "no ring on click" test while silently failing WCAG 2.4.7 for anyone
// tabbing the board.
async function board(page: import("@playwright/test").Page) {
  await page.route("**/api/youtube?**", route => route.fulfill({
    status: 404, contentType: "application/json", body: '{"error":"No results"}',
  }));
  await page.addInitScript(() => {
    localStorage.setItem("nss-preferences", JSON.stringify({
      favoriteLeagues: ["poker", "mlb"], favoriteTeams: [], theme: "dark",
      showRatings: false, skipExplainer: true, skipNewsExplainer: true, showNews: false,
      leaguesOnboarded: true, firstLeague: "poker", secondLeague: "mlb",
      thirdLeague: "empty", fourthLeague: "empty", fifthLeague: "empty",
      defaultDateMode: "today", defaultLandingView: "scores",
    }));
  });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Poker" })).toBeVisible();
}

const outlineOfFocused = (page: import("@playwright/test").Page) => page.evaluate(() => {
  const el = document.activeElement as HTMLElement | null;
  if (!el) return null;
  const cs = getComputedStyle(el);
  return { card: el.classList.contains("ns-card-focus"), style: cs.outlineStyle, width: cs.outlineWidth };
});

test("clicking a card leaves no focus ring", async ({ page }) => {
  await board(page);
  const card = page.locator(".ns-card-focus").first();
  // A card click opens the details sheet, which takes focus itself; Escape
  // closes it and hands focus back to the card. That is the exact moment the
  // ring was visible in the report — a card sitting in the board, still ringed
  // after the sheet it opened had gone.
  await card.click();
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  const state = await page.evaluate(() => {
    const el = document.querySelector<HTMLElement>(".ns-card-focus");
    if (!el) return null;
    return { focused: document.activeElement === el, style: getComputedStyle(el).outlineStyle };
  });
  expect(state?.focused, "the clicked card never held focus, so this proves nothing").toBe(true);
  expect(state?.style, "a mouse click painted a focus ring on the card").toBe("none");
});

test("tabbing to a card still shows one", async ({ page }) => {
  await board(page);
  let onCard = null as Awaited<ReturnType<typeof outlineOfFocused>>;
  for (let i = 0; i < 60 && !onCard?.card; i++) {
    await page.keyboard.press("Tab");
    onCard = await outlineOfFocused(page);
  }
  expect(onCard?.card, "Tab never reached a card root").toBe(true);
  expect(onCard?.style, "a keyboard-focused card has no visible ring (WCAG 2.4.7)").not.toBe("none");
});
