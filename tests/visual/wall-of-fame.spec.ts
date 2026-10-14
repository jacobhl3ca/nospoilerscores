import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  REQUESTED_BUILDS,
  requestedBuildClaim,
  requestedBuildDay,
  requestedBuildPeople,
  requestedBuildSections,
} from "../../src/lib/requestedBuilds";

// /wall-of-fame (2026-10-11, round 2 of "Built from your requests"): people
// ranked by builds, every row in a table whose titles share one left edge,
// coloured kind pills, a "Suggest something" button that opens the feedback
// form with kind pills, and a "This was me" link on the rows with no initials.
// Formspree is route-intercepted, so nothing is really sent.

const FORMSPREE = "https://formspree.io/f/mkgqkgyr";
const KINDS = ["League", "Feature", "Fix", "Other"];

async function catchPosts(page: Page) {
  const bodies: Record<string, unknown>[] = [];
  await page.route(FORMSPREE, async (route) => {
    bodies.push(JSON.parse(route.request().postData() || "{}"));
    await route.fulfill({ status: 200, contentType: "application/json", body: '{"ok":true}' });
  });
  return bodies;
}

async function setTheme(page: Page, theme: "light" | "dark") {
  await page.addInitScript((t) => localStorage.setItem("nss-preferences", JSON.stringify({ theme: t })), theme);
}

const rows = (page: Page) => page.getByTestId("requested-build-row");
const send = (page: Page) => page.locator("#hs-feedback-form").getByRole("button", { name: "Send feedback" });

// WCAG contrast of an element's text on its own (opaque) background.
function contrast(el: Locator) {
  return el.evaluate((node) => {
    const lum = (rgb: string) => {
      const [r, g, b] = rgb.match(/[\d.]+/g)!.slice(0, 3).map((v) => {
        const c = Number(v) / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const cs = getComputedStyle(node);
    const [hi, lo] = [lum(cs.color), lum(cs.backgroundColor)].sort((a, b) => b - a);
    return { ratio: (hi + 0.05) / (lo + 0.05), color: cs.color, background: cs.backgroundColor };
  });
}

for (const size of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
  test(`${size.width}px: ranked people, every row, titles on one left edge`, async ({ page }) => {
    await page.setViewportSize(size);
    const res = await page.goto("/wall-of-fame");
    expect(res?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1, name: "Wall of fame" })).toBeVisible();
    await expect(page.getByText("Every item started as a note someone sent us.")).toBeVisible();
    await expect(page.getByText("Everyone on this wall gets their next request moved to the top of the list, and 6 months of any supporter perks free.")).toBeVisible();

    const people = requestedBuildPeople();
    const ranked = page.getByTestId("wall-ranked").locator("li");
    await expect(ranked).toHaveCount(people.length);
    for (let i = 0; i < people.length; i++) {
      await expect(ranked.nth(i)).toHaveText(`${i + 1}.${people[i].who} · ${people[i].count} built`);
    }

    // One header per person, then "Asked without a name"; no initials in a row.
    const sections = requestedBuildSections();
    await expect(page.getByTestId("requested-builds").locator("h3")).toHaveText(
      sections.map((s) => (s.who ? `${s.who} · ${s.rows.length} built` : "Asked without a name")),
    );
    await expect(rows(page)).toHaveCount(REQUESTED_BUILDS.length);
    await expect(page.locator("details")).toHaveCount(0);
    for (let i = 0; i < REQUESTED_BUILDS.length; i++) {
      const r = REQUESTED_BUILDS[i];
      await expect(rows(page).nth(i)).toBeVisible();
      await expect(rows(page).nth(i).locator("time")).toHaveText(requestedBuildDay(r.date));
      await expect(rows(page).nth(i).locator(".kind-pill")).toHaveText(r.kind);
      await expect(rows(page).nth(i).getByTestId("requested-build-title")).toContainText(r.title);
      await expect(rows(page).nth(i)).not.toContainText("thanks");
      for (const by of r.by) await expect(rows(page).nth(i)).not.toContainText(by);
    }

    // The table: date, pill and title each start at one x on every row, and a
    // title stays inside its row (a long one wraps instead of pushing out).
    const boxes = await rows(page).evaluateAll((els) =>
      els.map((el) => {
        const x = (sel: string) => el.querySelector(sel)!.getBoundingClientRect();
        const row = el.getBoundingClientRect();
        const title = x('[data-testid="requested-build-title"]');
        return { date: x("time").left, pill: x(".kind-pill").left, title: title.left, titleRight: title.right, rowRight: row.right, border: getComputedStyle(el).borderTopWidth + getComputedStyle(el).borderBottomWidth };
      }),
    );
    for (const b of boxes) {
      expect(Math.abs(b.date - boxes[0].date)).toBeLessThanOrEqual(1);
      expect(Math.abs(b.pill - boxes[0].pill)).toBeLessThanOrEqual(1);
      expect(Math.abs(b.title - boxes[0].title)).toBeLessThanOrEqual(1);
      expect(b.titleRight).toBeLessThanOrEqual(b.rowRight + 0.5);
      expect(b.border).toBe("0px0px");
    }
    // 4rem + 5.5rem at a 15px page font is still rem-based: 64 + 88.
    expect(Math.round(boxes[0].pill - boxes[0].date)).toBe(64);
    expect(Math.round(boxes[0].title - boxes[0].pill)).toBe(88);

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
}

for (const theme of ["light", "dark"] as const) {
  test(`${theme}: each kind has its own pill colours, all over 4.5:1`, async ({ page }) => {
    await setTheme(page, theme);
    await page.goto("/wall-of-fame");
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    await page.getByRole("button", { name: "Suggest something" }).click();
    const seen = new Map<string, { color: string; background: string }>();
    for (const kind of KINDS) {
      const c = await contrast(page.locator(`#hs-feedback-form .kind-pill[data-kind="${kind}"]`));
      expect(c.ratio, `${kind} ${c.color} on ${c.background}`).toBeGreaterThanOrEqual(4.5);
      seen.set(kind, c);
    }
    expect(new Set([...seen.values()].map((c) => c.color)).size).toBe(KINDS.length);
    expect(new Set([...seen.values()].map((c) => c.background)).size).toBe(KINDS.length);
    // A row's pill is the same pill as the form's.
    for (const kind of new Set(REQUESTED_BUILDS.map((r) => r.kind))) {
      const c = await contrast(rows(page).locator(`.kind-pill[data-kind="${kind}"]`).first());
      expect({ color: c.color, background: c.background }).toEqual({ color: seen.get(kind)!.color, background: seen.get(kind)!.background });
    }
  });
}

test("Suggest something opens the form with kind pills; kind and initials reach Formspree", async ({ page }) => {
  const bodies = await catchPosts(page);
  await page.goto("/wall-of-fame");
  await page.getByRole("button", { name: "Suggest something" }).click();

  const pills = page.locator("#hs-feedback-form .kind-pill");
  await expect(pills).toHaveText(KINDS);
  await expect(page.locator('#hs-feedback-form .kind-pill[aria-pressed="true"]')).toHaveCount(0);
  await expect(page.locator("#hs-feedback-input")).toHaveValue("");
  // The pills sit above the message.
  const pillY = (await pills.first().boundingBox())!.y;
  expect(pillY).toBeLessThan((await page.locator("#hs-feedback-input").boundingBox())!.y);

  await pills.filter({ hasText: "Feature" }).click();
  await pills.filter({ hasText: "League" }).click();
  await expect(page.locator('#hs-feedback-form .kind-pill[aria-pressed="true"]')).toHaveText(["League"]);
  await page.locator("#hs-feedback-input").fill("Please add the KHL");
  await page.locator("#hs-feedback-initials").fill("K.S.");
  await send(page).click();
  await expect.poll(() => bodies.length).toBe(1);
  expect(bodies[0]).toMatchObject({ message: "Please add the KHL", kind: "League", initials: "K.S." });
  await expect(page.getByText("Thanks, feedback sent")).toBeVisible();

  // No pill picked (a second tap unpicks): no kind is sent.
  await page.getByRole("button", { name: "Suggest something" }).click();
  await expect(page.locator('#hs-feedback-form .kind-pill[aria-pressed="true"]')).toHaveCount(0);
  await pills.filter({ hasText: "Fix" }).click();
  await pills.filter({ hasText: "Fix" }).click();
  await page.locator("#hs-feedback-input").fill("Just a note");
  await send(page).click();
  await expect.poll(() => bodies.length).toBe(2);
  expect(bodies[1]).toMatchObject({ message: "Just a note" });
  expect(bodies[1]).not.toHaveProperty("kind");
  expect(bodies[1]).not.toHaveProperty("initials");
});

test("This was me: only on rows with no initials, opens the form seeded with the row", async ({ page }) => {
  const bodies = await catchPosts(page);
  await page.goto("/wall-of-fame");
  const blank = REQUESTED_BUILDS.filter((r) => r.by.length === 0);
  expect(blank.length).toBeGreaterThan(0);
  await expect(page.getByRole("button", { name: "This was me" })).toHaveCount(blank.length);
  for (let i = 0; i < REQUESTED_BUILDS.length; i++) {
    await expect(rows(page).nth(i).getByRole("button", { name: "This was me" })).toHaveCount(REQUESTED_BUILDS[i].by.length ? 0 : 1);
  }

  const target = blank[0];
  await rows(page).filter({ hasText: target.title }).getByRole("button", { name: "This was me" }).click();
  await expect(page.locator("#hs-feedback-input")).toHaveValue(requestedBuildClaim(target));
  await expect(page.locator("#hs-feedback-form .kind-pill")).toHaveCount(0);
  await page.locator("#hs-feedback-input").pressSequentially("J.D.");
  await send(page).click();
  await expect.poll(() => bodies.length).toBe(1);
  expect(bodies[0]).toMatchObject({ message: `${requestedBuildClaim(target)}J.D.` });
  expect(bodies[0]).not.toHaveProperty("kind");

  // A second row's claim replaces the first one's text.
  if (blank.length > 1) {
    await rows(page).filter({ hasText: blank[1].title }).getByRole("button", { name: "This was me" }).click();
    await expect(page.locator("#hs-feedback-input")).toHaveValue(requestedBuildClaim(blank[1]));
  }
});

test("support links sit beside the button from Dec 15, not before", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-12-14T12:00:00-05:00"));
  await page.goto("/wall-of-fame");
  await expect(page.getByRole("button", { name: "Suggest something" })).toBeVisible();
  await expect(page.getByTestId("wall-support-link")).toHaveCount(0);

  await page.clock.setFixedTime(new Date("2026-12-15T12:00:00-05:00"));
  await page.reload();
  const kofi = page.getByTestId("wall-support-link").filter({ hasText: "Ko-fi" });
  await expect(kofi).toHaveAttribute("href", "https://ko-fi.com/jacobhl");
  const button = (await page.getByRole("button", { name: "Suggest something" }).boundingBox())!;
  const link = (await kofi.boundingBox())!;
  expect(link.x).toBeGreaterThan(button.x + button.width);
  expect(Math.abs(link.y + link.height / 2 - (button.y + button.height / 2))).toBeLessThanOrEqual(4);
});

test("the doc footer links to the wall, except on the wall itself", async ({ page }) => {
  await page.goto("/about");
  await expect(page.getByRole("navigation", { name: "Site" }).getByRole("link", { name: "Wall of fame" })).toHaveAttribute("href", "/wall-of-fame");
  await page.goto("/wall-of-fame");
  const nav = page.getByRole("navigation", { name: "Site" });
  await expect(nav.getByRole("link", { name: "Wall of fame" })).toHaveCount(0);
  await expect(nav.getByRole("link").filter({ hasNotText: "Back to HideScore" })).toHaveText(["About", "FAQ", "Guides", "Contact", "Feedback", "Privacy", "Terms"]);
});

test("the initials note is an underlined link that opens the form seeded for the change", async ({ page }) => {
  await page.goto("/wall-of-fame");
  const note = page.getByRole("button", { name: "Say so in a note." });
  await expect(note).toHaveAttribute("data-umami-event", "wall-initials");
  expect(await note.evaluate((n) => getComputedStyle(n).textDecorationLine)).toContain("underline");
  await note.click();
  await expect(page.locator("#hs-feedback-input")).toHaveValue("Wall of fame: please add / remove my initials: ");
  await expect(page.locator("#hs-feedback-form .kind-pill")).toHaveCount(0);
});

test("/contact#feedback: Send feedback is the blue accent button, not a link", async ({ page }) => {
  for (const theme of ["light", "dark"]) {
    await page.emulateMedia({ colorScheme: theme as "light" | "dark" });
    await page.goto("/contact#feedback");
    const button = page.locator("#feedback ~ * button, main button").filter({ hasText: /^Send feedback$/ }).first();
    await expect(button).toBeVisible();
    const { bg, accent, color } = await button.evaluate((n) => {
      const probe = document.createElement("div");
      probe.style.background = "var(--accent)";
      n.parentElement!.appendChild(probe);
      const accent = getComputedStyle(probe).backgroundColor;
      probe.remove();
      const cs = getComputedStyle(n);
      return { bg: cs.backgroundColor, accent, color: cs.color };
    });
    expect(bg).toBe(accent);
    expect(color).toBe("rgb(255, 255, 255)");
  }
});

test("every kind pill in the wall table is one width, label centred", async ({ page }) => {
  for (const size of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(size);
    await page.goto("/wall-of-fame");
    const boxes = await rows(page).locator(".kind-pill").evaluateAll((els) =>
      els.map((el) => {
        const pill = el.getBoundingClientRect();
        const label = el.firstElementChild!.getBoundingClientRect();
        return { kind: el.textContent, width: pill.width, offset: (label.left - pill.left) - (pill.right - label.right) };
      }),
    );
    expect(new Set(boxes.map((b) => b.kind))).toEqual(new Set(["League", "Feature", "Fix"]));
    for (const b of boxes) {
      expect(b.width, b.kind!).toBeCloseTo(boxes[0].width, 1);
      expect(Math.abs(b.offset), b.kind!).toBeLessThanOrEqual(1);
    }
  }
});
