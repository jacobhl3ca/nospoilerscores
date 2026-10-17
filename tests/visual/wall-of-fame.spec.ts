import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  REQUESTED_BUILDS,
  requestedBuildDay,
  requestedBuildPeople,
  requestedBuildSections,
} from "../../src/lib/requestedBuilds";

// /wall-of-fame (2026-10-11, round 2 of "Built from your requests"): people
// ranked by builds, every row in a table whose titles share one left edge,
// coloured kind pills, a "Suggest something" button that opens the feedback
// form with kind pills. The "This was me" links came out 10/14.
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
    await expect(page.getByRole("heading", { level: 1, name: "Wall of Fame" })).toBeVisible();
    await expect(page.getByText("Every item started as a note someone sent us.")).toBeVisible();
    await expect(page.getByText("Everyone on this wall gets their next request moved to the top of the list, and 6 months of any future supporter perks free.")).toBeVisible();

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

// Header (2026-10-15): trophy tile, Title Case h1, subtitle, live count.
test("header: trophy tile, h1, subtitle in order; meta line counts the builds", async ({ page }) => {
  await page.goto("/wall-of-fame");
  const header = page.getByTestId("wall-header");
  const order = await header.evaluate((h) => {
    const all = Array.from(h.querySelectorAll("*"));
    return ['[data-testid="wall-trophy"]', "h1", '[data-testid="wall-subtitle"]'].map((sel) => all.indexOf(h.querySelector(sel)!));
  });
  expect(order.every((i) => i >= 0)).toBe(true);
  expect(order).toEqual([...order].sort((a, b) => a - b));
  await expect(header.locator("h1")).toHaveText("Wall of Fame");
  await expect(page.getByTestId("wall-trophy")).toHaveAttribute("aria-hidden", "true");
  await expect(page.getByTestId("wall-trophy").locator("svg")).toBeVisible();
  await expect(page.getByTestId("wall-subtitle")).toHaveText("Every item started as a note someone sent us.");
  await expect(page.getByTestId("wall-meta")).toContainText(`${REQUESTED_BUILDS.length} built so far`);
  // The subtitle moved out of the section.
  await expect(page.locator("main section").getByText("Every item started as a note someone sent us.")).toHaveCount(0);
});

for (const theme of ["light", "dark"] as const) {
  test(`${theme}: trophy icon is at least 3:1 on its tile`, async ({ page }) => {
    await setTheme(page, theme);
    await page.goto("/wall-of-fame");
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    const c = await contrast(page.getByTestId("wall-trophy"));
    expect(c.ratio, `${c.color} on ${c.background}`).toBeGreaterThanOrEqual(3);
  });
}

test("390px: the header causes no horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/wall-of-fame");
  await expect(page.getByTestId("wall-header")).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

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

test("no This was me buttons, not even on the unnamed rows", async ({ page }) => {
  await page.goto("/wall-of-fame");
  expect(REQUESTED_BUILDS.some((r) => r.by.length === 0)).toBe(true);
  await expect(page.getByRole("heading", { name: "Asked without a name" })).toBeVisible();
  await expect(page.getByText("This was me")).toHaveCount(0);
  for (let i = 0; i < REQUESTED_BUILDS.length; i++) {
    await expect(rows(page).nth(i).getByRole("button")).toHaveCount(0);
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

test("the doc footer links to the wall as WOF, except on the wall itself", async ({ page }) => {
  await page.goto("/about");
  const wof = page.getByRole("navigation", { name: "Site" }).getByRole("link", { name: "Wall of Fame", exact: true });
  await expect(wof).toHaveAttribute("href", "/wall-of-fame");
  await expect(wof).toHaveText("WOF");
  await expect(wof).toHaveAttribute("aria-label", "Wall of Fame");
  await expect(wof).toHaveAttribute("title", "Wall of Fame");
  await page.goto("/wall-of-fame");
  const nav = page.getByRole("navigation", { name: "Site" });
  await expect(nav.getByRole("link", { name: "Wall of Fame" })).toHaveCount(0);
  await expect(nav.getByRole("link").filter({ hasNotText: "Back to HideScore" })).toHaveText(["About", "FAQ", "Guides", "Contact", "Privacy", "Terms"]);
  await expect(nav.getByRole("button", { name: "Feedback", exact: true })).toBeVisible();
});

for (const path of ["/wall-of-fame", "/about"]) {
  for (const size of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
    test(`${path} ${size.width}px: footer Feedback opens the form in place, no navigation`, async ({ page }) => {
      await page.setViewportSize(size);
      const docs: string[] = [];
      page.on("request", (r) => {
        if (r.resourceType() === "document" && r.frame() === page.mainFrame()) docs.push(r.url());
      });
      await page.goto(path);
      const url = page.url();
      const button = page.getByRole("navigation", { name: "Site" }).getByRole("button", { name: "Feedback", exact: true });
      await button.scrollIntoViewIfNeeded();
      await button.click();
      await expect(page.locator("#hs-feedback-input")).toBeVisible({ timeout: 500 });
      expect(page.url()).toBe(url);
      expect(docs).toHaveLength(1);
    });
  }
}

for (const theme of ["light", "dark"] as const) {
  test(`${theme}: /contact email is a plain link, no accent background`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: theme });
    await page.goto("/contact");
    const email = page.locator('main a[href="mailto:hi@hidescore.com"]').first();
    await expect(email).toBeVisible();
    const bg = await email.evaluate((n) => getComputedStyle(n).backgroundColor);
    expect(bg).toBe("rgba(0, 0, 0, 0)");
    expect(await email.evaluate((n) => getComputedStyle(n).textDecorationLine)).toContain("underline");
  });
}

// Footer rows (10/14, "WOF"): the board footer fits one line on a 390 px
// phone on the web, and an article's doc footer fits one line on a desktop.
async function rowCount(loc: Locator) {
  return loc.evaluate((el) => new Set([...el.children].map((c) => Math.round((c as HTMLElement).getBoundingClientRect().top))).size);
}

test("board footer row is 1 line at 390px (web)", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => localStorage.setItem("nss-preferences", JSON.stringify({
    favoriteLeagues: ["mlb"], favoriteTeams: [], theme: "light", showRatings: false,
    skipExplainer: true, skipNewsExplainer: true, showNews: false, leaguesOnboarded: true,
    defaultLandingView: "scores",
  })));
  await page.goto("/");
  const row = page.locator("footer").locator('a[href="/wall-of-fame"]').locator("xpath=..");
  await row.scrollIntoViewIfNeeded();
  expect(await rowCount(row)).toBe(1);
});

test("article doc footer is 1 line at 1280px", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/nba-highlights-without-spoilers");
  expect(await rowCount(page.getByRole("navigation", { name: "Site" }))).toBe(1);
});

test("the initials note is an underlined link that opens the form seeded for the change", async ({ page }) => {
  await page.goto("/wall-of-fame");
  const note = page.getByRole("button", { name: "Say so in a note." });
  await expect(note).toHaveAttribute("data-umami-event", "wall-initials");
  expect(await note.evaluate((n) => getComputedStyle(n).textDecorationLine)).toContain("underline");
  await note.click();
  await expect(page.locator("#hs-feedback-input")).toHaveValue("Wall of Fame: please add / remove my initials: ");
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
    expect(new Set(boxes.map((b) => b.kind))).toEqual(new Set(["League", "Feature"]));
    for (const b of boxes) {
      expect(b.width, b.kind!).toBeCloseTo(boxes[0].width, 1);
      expect(Math.abs(b.offset), b.kind!).toBeLessThanOrEqual(1);
    }
  }
});
