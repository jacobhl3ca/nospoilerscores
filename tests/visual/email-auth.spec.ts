import { expect, test } from "@playwright/test";

test("email sign-in advances from address to the six-digit code", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("nss-preferences", JSON.stringify({
      theme: "light", showRatings: false, skipExplainer: true,
      skipNewsExplainer: true, showNews: false, leaguesOnboarded: true,
    }));
  });
  await page.route("**/api/me", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      signedIn: false, email: null, linkedProviders: [],
      providers: { apple: true, google: true, email: true },
    }),
  }));
  let requestedEmail = "";
  await page.route("**/auth/email/request", async (route) => {
    requestedEmail = (await route.request().postDataJSON()).email;
    await route.fulfill({ status: 200, contentType: "application/json", body: '{"ok":true}' });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Open settings" }).click();
  await page.getByRole("button", { name: "Use email instead" }).click();
  await page.getByLabel("Email address").fill("fan@example.com");
  await page.getByRole("button", { name: "Email me a code" }).click();

  await expect(page.getByLabel("Six-digit sign-in code")).toBeVisible();
  await expect(page.getByText("Check your email for a six-digit code.")).toBeVisible();
  expect(requestedEmail).toBe("fan@example.com");
});
