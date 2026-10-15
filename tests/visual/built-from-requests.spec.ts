import { expect, test, type Page } from "@playwright/test";

// "Built from your requests" on /contact#feedback (2026-10-09). From 10/11 the
// list is on /wall-of-fame (wall-of-fame.spec.ts); /contact keeps the heading
// and a link to it. The feedback form sends the optional name (initials
// until 10/15) to Formspree, which is route-intercepted, so nothing is really sent.

const FORMSPREE = "https://formspree.io/f/mkgqkgyr";

async function catchPosts(page: Page) {
  const bodies: Record<string, unknown>[] = [];
  await page.route(FORMSPREE, async (route) => {
    bodies.push(JSON.parse(route.request().postData() || "{}"));
    await route.fulfill({ status: 200, contentType: "application/json", body: '{"ok":true}' });
  });
  return bodies;
}

test("/contact keeps the heading and links to the wall of fame", async ({ page }) => {
  await page.goto("/contact");
  await expect(page.getByRole("heading", { level: 2, name: "Built from your requests" })).toBeVisible();
  await expect(page.getByTestId("requested-builds")).toHaveCount(0);
  const link = page.locator("main section").getByRole("link", { name: "See the wall of fame →" });
  await expect(link).toHaveAttribute("href", "/wall-of-fame");
  await link.click();
  await expect(page).toHaveURL((u) => u.pathname === "/wall-of-fame");
  await expect(page.getByRole("heading", { level: 1, name: "Wall of fame" })).toBeVisible();
});

test("feedback form sends the name only when filled", async ({ page }) => {
  const bodies = await catchPosts(page);
  await page.goto("/contact#feedback");
  const open = page.locator("#feedback ~ div").getByRole("button", { name: "Send feedback" });

  await open.click();
  await expect(page.locator("#hs-feedback-form .kind-pill")).toHaveCount(0);
  await page.locator("#hs-feedback-input").fill("Please add the KHL");
  await page.locator("#hs-feedback-name").fill("K.S.");
  await page.getByRole("button", { name: "Send feedback" }).last().click();
  await expect.poll(() => bodies.length).toBe(1);
  expect(bodies[0]).toMatchObject({ message: "Please add the KHL", name: "K.S." });
  expect(bodies[0]).not.toHaveProperty("kind");

  await page.getByRole("button", { name: "Add more feedback" }).click();
  await page.locator("#hs-feedback-input").fill("No credit please");
  await page.getByRole("button", { name: "Send feedback" }).last().click();
  await expect.poll(() => bodies.length).toBe(2);
  expect(bodies[1]).not.toHaveProperty("name");
});

test("name field caps at 40 characters and names the wall", async ({ page }) => {
  await page.goto("/contact#feedback");
  await page.locator("#feedback ~ div").getByRole("button", { name: "Send feedback" }).click();
  const field = page.locator("#hs-feedback-name");
  await expect(field).toHaveAttribute("placeholder", "Name for the Wall of fame (optional)");
  await field.fill("A".repeat(45));
  await expect(field).toHaveValue("A".repeat(40));
});
