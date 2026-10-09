import { expect, test, type Page } from "@playwright/test";
import { REQUESTED_BUILDS, REQUESTED_BUILDS_SHOWN } from "../../src/lib/requestedBuilds";

// "Built from your requests" on /contact#feedback (2026-10-09): the list shows
// the first REQUESTED_BUILDS_SHOWN rows, the rest open from a native <details>,
// and the feedback form sends the optional initials to Formspree. Formspree is
// route-intercepted, so nothing is really sent.

const FORMSPREE = "https://formspree.io/f/mkgqkgyr";

async function catchPosts(page: Page) {
  const bodies: Record<string, unknown>[] = [];
  await page.route(FORMSPREE, async (route) => {
    bodies.push(JSON.parse(route.request().postData() || "{}"));
    await route.fulfill({ status: 200, contentType: "application/json", body: '{"ok":true}' });
  });
  return bodies;
}

test("/contact lists what shipped from requests, grouped by person", async ({ page }) => {
  await page.goto("/contact");
  await expect(page.getByRole("heading", { level: 2, name: "Built from your requests" })).toBeVisible();
  const shown = page.getByTestId("requested-builds").locator("li");
  const first = Math.min(REQUESTED_BUILDS.length, REQUESTED_BUILDS_SHOWN);
  await expect(shown).toHaveCount(first);
  await expect(shown.first()).toContainText(REQUESTED_BUILDS[0].kind);
  // Rows render in the data file's order: each person's rows together, rows
  // with no initials last, and a credited row ends with its thanks.
  for (let i = 0; i < first; i++) {
    const r = REQUESTED_BUILDS[i];
    await expect(shown.nth(i)).toBeVisible();
    await expect(shown.nth(i)).toContainText(r.title);
    if (r.by.length) await expect(shown.nth(i)).toContainText(`thanks ${r.by.join(", ")}`);
    else await expect(shown.nth(i)).not.toContainText("thanks");
  }

  const more = page.getByTestId("requested-builds-more").locator("li");
  if (REQUESTED_BUILDS.length > REQUESTED_BUILDS_SHOWN) {
    await expect(more.first()).toBeHidden();
    await page.getByText(`Show all ${REQUESTED_BUILDS.length}`).click();
    await expect(more).toHaveCount(REQUESTED_BUILDS.length - REQUESTED_BUILDS_SHOWN);
    await expect(more.last()).toBeVisible();
  } else {
    await expect(page.locator("details", { has: page.getByTestId("requested-builds-more") })).toHaveCount(0);
  }
  await expect(page.getByText("Want your initials added or removed?")).toBeVisible();
});

test("feedback form sends initials only when filled", async ({ page }) => {
  const bodies = await catchPosts(page);
  await page.goto("/contact#feedback");
  const open = page.locator("#feedback ~ div").getByRole("button", { name: "Send feedback" });

  await open.click();
  await page.locator("#hs-feedback-input").fill("Please add the KHL");
  await page.locator("#hs-feedback-initials").fill("K.S.");
  await page.getByRole("button", { name: "Send feedback" }).last().click();
  await expect.poll(() => bodies.length).toBe(1);
  expect(bodies[0]).toMatchObject({ message: "Please add the KHL", initials: "K.S." });

  await page.getByRole("button", { name: "Add more feedback" }).click();
  await page.locator("#hs-feedback-input").fill("No credit please");
  await page.getByRole("button", { name: "Send feedback" }).last().click();
  await expect.poll(() => bodies.length).toBe(2);
  expect(bodies[1]).not.toHaveProperty("initials");
});

test("initials field caps at 6 characters", async ({ page }) => {
  await page.goto("/contact#feedback");
  await page.locator("#feedback ~ div").getByRole("button", { name: "Send feedback" }).click();
  await page.locator("#hs-feedback-initials").pressSequentially("ABCDEFGH");
  await expect(page.locator("#hs-feedback-initials")).toHaveValue("ABCDEF");
});
