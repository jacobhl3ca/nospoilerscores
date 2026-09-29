import { expect, test, type BrowserContext, type Page } from "@playwright/test";

// Jacob 9/26: pasted his TV channel links, a chip opened IINA, then after a
// refresh the list was gone — from this browser AND the account copy. He had
// three hidescore.com tabs open. Two holes, one test each:
//  1. A tab opened before the paste kept its old prefs in React state; its
//     next save pushed that old blob and wiped the list everywhere.
//  2. A pull whose GET was already on the wire when the list was pasted came
//     back with the server's older copy and put it over the new list.

const LIST = "ESPN = http://tuner.test:9191/proxy/ts/stream/abc";

function prefs(extra: Record<string, unknown> = {}) {
  return {
    favoriteLeagues: ["mlb", "nfl"],
    favoriteTeams: [],
    theme: "light",
    showRatings: false,
    skipExplainer: true,
    skipNewsExplainer: true,
    showNews: false,
    leaguesOnboarded: true,
    switcherDefaultsVersion: 2,
    defaultDateMode: "today",
    defaultLandingView: "scores",
    ...extra,
  };
}

// One signed-in account for every tab in the context. `getDelayMs` holds a
// GET on the wire after it has read the stored copy, like a slow /api/prefs.
async function fakeAccount(context: BrowserContext) {
  const account = { server: prefs() as Record<string, unknown>, getDelayMs: 0, puts: 0 };
  await context.addInitScript((p) => {
    if (!localStorage.getItem("nss-preferences")) localStorage.setItem("nss-preferences", JSON.stringify(p));
  }, prefs());
  await context.route("**/news/highlights.json", (route) => route.fulfill({ status: 200, contentType: "application/json", body: '{"games":{}}' }));
  await context.route("**/api/me", (route) => route.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify({ signedIn: true, email: "t@example.com", uid: "u1", platforms: {} }),
  }));
  await context.route("**/api/prefs", async (route) => {
    if (route.request().method() === "PUT") {
      account.server = JSON.parse(route.request().postData() || "{}");
      account.puts++;
      return route.fulfill({ status: 200, contentType: "application/json", body: '{"ok":true}' });
    }
    const body = JSON.stringify({ prefs: account.server });
    if (account.getDelayMs) await new Promise((r) => setTimeout(r, account.getDelayMs));
    return route.fulfill({ status: 200, contentType: "application/json", body });
  });
  return account;
}

async function pasteList(page: Page) {
  await page.getByRole("button", { name: "Open settings" }).first().click();
  await page.getByText("More settings", { exact: true }).click();
  await page.getByLabel("TV channel links").fill(LIST);
  await page.keyboard.press("Escape");
}

async function listAfterReload(page: Page) {
  await page.reload();
  await page.getByRole("button", { name: "Open settings" }).first().click();
  await page.getByText("More settings", { exact: true }).click();
  // Give the signed-in pull time to land before reading.
  await page.waitForTimeout(1500);
  return page.getByLabel("TV channel links").inputValue();
}

test("a tab opened before the paste does not wipe the list on its next save", async ({ context }) => {
  const account = await fakeAccount(context);
  const a = await context.newPage();
  const b = await context.newPage();
  await a.goto("/");
  await b.goto("/");
  await expect(a.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(b.locator("html")).toHaveAttribute("data-theme", "light");

  await pasteList(a);
  await expect.poll(() => account.server.tvChannelLinks, { timeout: 5000 }).toBe(LIST);

  // The other tab has the list in its own state without a reload …
  await b.getByRole("button", { name: "Open settings" }).first().click();
  await b.getByText("More settings", { exact: true }).click();
  await expect(b.getByLabel("TV channel links")).toHaveValue(LIST);
  await b.keyboard.press("Escape");

  // … so an ordinary change there keeps it.
  const putsBefore = account.puts;
  // The header sun/moon toggle is gone (9/28); Theme lives in Settings only.
  await b.getByRole("button", { name: "Open settings" }).first().click();
  await b.getByRole("group", { name: "Theme" }).getByRole("button", { name: "Dark", exact: true }).click();
  await b.keyboard.press("Escape");
  await expect(b.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect.poll(() => account.puts, { timeout: 5000 }).toBeGreaterThan(putsBefore);

  expect(account.server.tvChannelLinks).toBe(LIST);
  expect(account.server.theme).toBe("dark");
  expect(await listAfterReload(a)).toBe(LIST);
});

test("a pull already on the wire does not undo a list pasted meanwhile", async ({ page }) => {
  const account = await fakeAccount(page.context());
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.waitForTimeout(1500); // the launch pull and its re-affirm PUT are done

  // Tab comes back to the front: the resume pull reads the old copy, then
  // takes 3 s to answer. The list is pasted inside that window.
  account.getDelayMs = 3000;
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await page.waitForTimeout(200);
  await pasteList(page);
  await page.waitForTimeout(3500);
  account.getDelayMs = 0;

  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("nss-preferences") || "{}").tvChannelLinks)).toBe(LIST);
  expect(account.server.tvChannelLinks).toBe(LIST);
  expect(await listAfterReload(page)).toBe(LIST);
});
