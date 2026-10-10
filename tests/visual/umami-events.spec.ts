import { readFileSync } from "node:fs";
import { expect, test, type Browser, type Page } from "@playwright/test";

// Umami events, round 2 (2026-10-01). The real tracker script is swapped for
// a stub that records every track() call, so each test reads exactly what
// would have been sent: once per action, the listed fields only, nothing for
// ?demo=1 or "Don't count my visits", and a tracker that throws breaks nothing.

const STUB = (mode: "record" | "throw") => `
  window.__ev = window.__ev || [];
  window.umami = {
    track: function (name, data) {
      ${mode === "throw" ? 'throw new Error("blocked");' : ""}
      window.__ev.push({ name: name, data: data || null });
    },
    identify: function () {},
  };`;

async function stubTracker(page: Page, mode: "record" | "throw" = "record") {
  await page.route("https://stats.hidescore.com/script.js", (route) =>
    route.fulfill({ status: 200, contentType: "application/javascript", body: STUB(mode) }));
}

type Ev = { name: string; data: Record<string, string> | null };
const events = (page: Page) => page.evaluate(() => (window as unknown as { __ev?: Ev[] }).__ev ?? []);
const named = async (page: Page, name: string) => (await events(page)).filter((e) => e.name === name);

const BASE_PREFS = {
  favoriteLeagues: ["nfl"],
  favoriteTeams: [],
  theme: "system",
  showRatings: false,
  skipExplainer: true,
  skipNewsExplainer: true,
  leaguesOnboarded: true,
  switcherDefaultsVersion: 2,
  defaultDateMode: "today",
};

async function seedPrefs(page: Page, extra: Record<string, unknown> = {}, opts: { noTrack?: boolean } = {}) {
  await page.addInitScript(({ prefs, noTrack }) => {
    if (sessionStorage.getItem("seeded")) return;
    localStorage.setItem("nss-preferences", JSON.stringify(prefs));
    if (noTrack) localStorage.setItem("umami.disabled", "1");
    sessionStorage.setItem("seeded", "1");
  }, { prefs: { ...BASE_PREFS, ...extra }, noTrack: !!opts.noTrack });
}

const LOAD = { timeout: 30_000 };

async function openSettings(page: Page) {
  await page.getByRole("button", { name: "Open settings", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Settings" });
  await expect(dialog).toBeVisible(LOAD);
  return dialog;
}

// The clip is a real WebM recorded at test time (same as
// modal-keys-news-native-video.spec.ts), ~3 s long, so it plays to the end.
let CLIP: Buffer;
test.beforeAll(async ({ browser }) => { CLIP = await recordClip(browser); });

async function recordClip(browser: Browser): Promise<Buffer> {
  const ctx = await browser.newContext({ recordVideo: { dir: test.info().outputPath("clip"), size: { width: 320, height: 180 } }, viewport: { width: 320, height: 180 } });
  const page = await ctx.newPage();
  await page.setContent("<body style='margin:0;background:#246'></body>");
  await page.waitForTimeout(3000);
  const video = page.video()!;
  await ctx.close();
  return readFileSync(await video.path());
}

const NOW = new Date().toISOString();
const ITEM = { description: "", published: NOW, imageUrl: null, byline: "", section: "ESPN" };
const ITEMS = [
  { ...ITEM, id: "v1", headline: "Clip one: a late winner", articleUrl: "https://www.espn.com/video/clip?id=1", playbackUrl: "https://clips.example.test/one.webm" },
  { ...ITEM, id: "v2", headline: "Clip two: the save of the night", articleUrl: "https://www.espn.com/video/clip?id=2", playbackUrl: "https://clips.example.test/two.webm" },
];

async function openNewsClip(page: Page) {
  await page.route("**/news/*.json", (route) => route.fulfill({
    status: 200, contentType: "application/json",
    body: route.request().url().includes("highlights.json") ? '{"games":{}}' : JSON.stringify({ items: ITEMS }),
  }));
  await page.route("https://clips.example.test/**", (route) => route.fulfill({ status: 200, contentType: "video/webm", body: CLIP }));
  await page.goto("/");
  await page.locator('button[aria-label^="Play highlight:"], button[aria-label="Open post"]', { hasText: /Clip one/ }).first().click();
  await expect(page.getByRole("dialog", { name: "Video player" })).toBeVisible();
  await expect(page.locator('[role="dialog"] video')).toBeVisible();
}

const NEWS = { showNews: true, defaultLandingView: "news", newsTypeFilter: "all" };

test("video-play then video-finished, once each, with player, source, league and page", async ({ page }) => {
  await stubTracker(page);
  await seedPrefs(page, NEWS);
  await openNewsClip(page);
  await expect.poll(() => named(page, "video-play"), LOAD).toHaveLength(1);
  await expect.poll(() => named(page, "video-finished"), { timeout: 15_000 }).toHaveLength(1);
  const [play] = await named(page, "video-play");
  const [done] = await named(page, "video-finished");
  expect(Object.keys(play.data ?? {}).sort()).toEqual(["league", "page", "player", "source"]);
  expect(play.data).toMatchObject({ player: "native", page: "today" });
  expect(play.data?.league).toMatch(/^[a-z0-9]+$/);
  expect(play.data?.league).not.toBe("unknown");
  expect(done.data).toEqual(play.data);
  test.info().annotations.push({ type: "video-play", description: JSON.stringify(play.data) });
  // A replay of the same clip is not a second play.
  await page.locator('[role="dialog"] video').evaluate((v: HTMLVideoElement) => { v.currentTime = 0; return v.play(); });
  await page.waitForTimeout(1000);
  expect(await named(page, "video-play")).toHaveLength(1);
});

test("settings-open per open, settings-change {key} once per key per open, no value", async ({ page }) => {
  await stubTracker(page);
  await seedPrefs(page);
  await page.goto("/");
  let dialog = await openSettings(page);
  const theme = dialog.getByRole("group", { name: "Theme" });
  await theme.getByRole("button", { name: "🌙 Dark" }).click();
  await theme.getByRole("button", { name: "☀️ Light" }).click();
  await expect.poll(() => named(page, "settings-change")).toEqual([{ name: "settings-change", data: { key: "theme" } }]);
  expect(await named(page, "settings-open")).toHaveLength(1);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  dialog = await openSettings(page);
  await dialog.getByRole("group", { name: "Theme" }).getByRole("button", { name: "🌙 Dark" }).click();
  await expect.poll(() => named(page, "settings-open")).toHaveLength(2);
  await expect.poll(() => named(page, "settings-change")).toHaveLength(2);
});

test.describe("switcher", () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(new Date("2026-09-29T15:00:00-04:00"));
  });
  test("switcher-add-more once per tap on Add more…", async ({ page }) => {
    await stubTracker(page);
    await seedPrefs(page, { showNews: false, defaultLandingView: "scores", firstLeague: "mlb", secondLeague: "nfl", thirdLeague: "wnba", fourthLeague: "empty", fifthLeague: "empty" });
    await page.goto("/");
    const header = page.getByRole("button", { name: "WNBA", exact: true });
    await expect(header).toBeVisible(LOAD);
    await header.click();
    await page.getByRole("dialog", { name: "Switch league" }).getByTestId("league-switcher-add-more").click();
    await expect(page.getByRole("dialog", { name: "More leagues" })).toBeVisible();
    await expect.poll(() => named(page, "switcher-add-more")).toEqual([{ name: "switcher-add-more", data: null }]);
    // The Add more… sheet itself sends no picker events.
    expect((await events(page)).filter((e) => e.name.startsWith("league-picker"))).toEqual([]);
  });
});

test("first-run picker events still fire (#247)", async ({ page }) => {
  await stubTracker(page);
  await page.goto("/");
  const sheet = page.getByRole("dialog", { name: /Pick your leagues/ });
  await expect(sheet).toBeVisible(LOAD);
  await expect.poll(() => named(page, "league-picker-shown")).toHaveLength(1);
  await sheet.getByRole("button", { name: "Use defaults" }).click();
  await expect.poll(() => named(page, "league-picker-defaults")).toHaveLength(1);
});

test("umami.disabled = 1 sends nothing: settings and a clip played to the end", async ({ page }) => {
  await stubTracker(page);
  await seedPrefs(page, NEWS, { noTrack: true });
  await openNewsClip(page);
  await expect.poll(() => page.locator('[role="dialog"] video').evaluate((v: HTMLVideoElement) => v.ended), { timeout: 15_000 }).toBe(true);
  await page.keyboard.press("Escape");
  const dialog = await openSettings(page);
  await dialog.getByRole("group", { name: "Theme" }).getByRole("button", { name: "🌙 Dark" }).click();
  await page.waitForTimeout(1500);
  expect(await events(page)).toEqual([]);
});

test("?demo=1 sends nothing", async ({ page }) => {
  await stubTracker(page);
  await seedPrefs(page);
  await page.goto("/?demo=1");
  const dialog = await openSettings(page);
  await dialog.getByRole("group", { name: "Theme" }).getByRole("button", { name: "🌙 Dark" }).click();
  await page.waitForTimeout(1500);
  expect(await events(page)).toEqual([]);
});

test("a tracker that throws leaves the page working", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await stubTracker(page, "throw");
  await seedPrefs(page, NEWS);
  await openNewsClip(page);
  await expect.poll(() => page.locator('[role="dialog"] video').evaluate((v: HTMLVideoElement) => v.currentTime), LOAD).toBeGreaterThan(0.5);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Video player" })).toHaveCount(0);
  const dialog = await openSettings(page);
  await dialog.getByRole("group", { name: "Theme" }).getByRole("button", { name: "🌙 Dark" }).click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("nss-preferences") || "{}").theme)).toBe("dark");
  expect(errors.filter((m) => m.includes("blocked"))).toEqual([]);
});
