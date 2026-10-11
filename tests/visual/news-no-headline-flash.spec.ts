import { expect, test, type Page } from "@playwright/test";

// Jacob 10/10: with Headlines on in the toolbar and off on each ESPN-layout
// card, a News reload showed headlines for a moment. A headline is a spoiler,
// so no frame may paint one in the clear. A sampler installed before any page
// script reads every .news-title on each animation frame and after each DOM
// change, and records the ones the browser would paint un-blurred.
// Every news feed is mocked, as in news-espn-layout.spec.ts.

const BASE_PREFS = {
  favoriteLeagues: [],
  favoriteTeams: [],
  theme: "system",
  showRatings: false,
  skipExplainer: true,
  skipNewsExplainer: true,
  showNews: true,
  leaguesOnboarded: true,
  switcherDefaultsVersion: 2,
  wideSlotsVersion: 1,
  defaultLandingView: "news",
  defaultDateMode: "today",
  firstLeague: "mlb",
  secondLeague: "nfl",
  thirdLeague: "nhl",
  fourthLeague: "empty",
  fifthLeague: "empty",
  showTextPosts: true,
  newsLayout: "espn",
};

const LOAD = { timeout: 30_000 };
const CARD_KEYS = ["espn-videos", "espn-top", "reddit-mlb", "reddit-nfl", "reddit-nhl"];
// Jacob's state: Headlines on in the toolbar, off on every card.
const CARDS_OFF = Object.fromEntries(CARD_KEYS.map((k) => [k, { revealTitles: false }]));
const JACOB = { revealNewsTitles: true, newsCardPrefs: CARDS_OFF };

const NOW = Date.now();
function itemsFor(name: string) {
  return Array.from({ length: 6 }, (_, i) => ({
    id: `${name}-${i}`,
    headline: `${name} post ${i + 1}`,
    description: "",
    published: new Date(NOW - (i + 1) * 3_600_000).toISOString(),
    articleUrl: `https://example.com/${name}/${i}`,
    byline: "",
    section: name.startsWith("reddit-") ? `r/${name.slice(7)}` : name === "espn-videos" ? "ESPN Video" : "ESPN",
  }));
}

async function mockFeeds(page: Page) {
  await page.route("**/news/*.json", (route) => {
    const name = new URL(route.request().url()).pathname.split("/").pop()!.replace(/\.json$/, "");
    if (name === "highlights") return route.fulfill({ status: 200, contentType: "application/json", body: '{"games":{}}' });
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ fetchedAt: new Date(NOW).toISOString(), items: itemsFor(name) }) });
  });
}

type Sample = { t: number; via: "raf" | "dom"; n: number; text: string; card: string; html: string };

// Installed before any page script, on every load of the tab. A sample is one
// look at the page that found a headline the browser would paint in the clear:
// a rendered .news-title, not tapped open (.peek), whose computed filter is not
// the full blur (so a half-faded one counts too).
async function installSampler(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __flash: Sample[] };
    type Sample = { t: number; via: "raf" | "dom"; n: number; text: string; card: string; html: string };
    w.__flash = [];
    const scan = (via: "raf" | "dom") => {
      let n = 0;
      let first: Element | null = null;
      for (const el of document.querySelectorAll(".news-title:not(.peek)")) {
        if (!(el.textContent ?? "").trim() || el.getClientRects().length === 0) continue;
        if (getComputedStyle(el).filter === "blur(7px)") continue;
        n++;
        first ??= el;
      }
      if (!first || w.__flash.length >= 5000) return;
      const card = first.closest('[class*="news-card-titles-"]');
      w.__flash.push({
        t: Math.round(performance.now()),
        via,
        n,
        text: (first.textContent ?? "").trim().slice(0, 60),
        card: card ? (card.className.match(/news-card-titles-\w+/)?.[0] ?? "") : "no card class",
        html: document.documentElement.className,
      });
    };
    const loop = () => { scan("raf"); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
    new MutationObserver(() => scan("dom")).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ["class"] });
  });
}

// Seed prefs ONCE per tab, so a reload keeps what the app wrote.
async function seed(page: Page, prefs: Record<string, unknown>, auth: boolean) {
  await page.addInitScript(({ blob, signedIn }) => {
    if (sessionStorage.getItem("hs-seed")) return;
    sessionStorage.setItem("hs-seed", "1");
    localStorage.setItem("nss-preferences", JSON.stringify(blob));
    // A signed-in device holds the last /api/me answer (prefsSync nss-auth).
    if (signedIn) localStorage.setItem("nss-auth", JSON.stringify({ at: Date.now(), state: { signedIn: true, email: "t@example.com" } }));
  }, { blob: { ...BASE_PREFS, ...prefs }, signedIn: auth });
}

// A signed-in account whose copy of the prefs is `remote`. Both answers land
// late, like the real ones (1-3 s after first paint).
async function mockAccount(page: Page, remote: Record<string, unknown>) {
  const late = () => new Promise((r) => setTimeout(r, 700));
  await page.route("**/api/me", async (route) => {
    await late();
    await route.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify({ signedIn: true, email: "t@example.com", uid: "u1", provider: "apple", linkedProviders: ["apple"], providers: { apple: true, google: true, email: true }, platforms: {} }),
    });
  });
  await page.route("**/api/prefs", async (route) => {
    if (route.request().method() !== "GET") return route.fulfill({ status: 200, contentType: "application/json", body: '{"ok":true}' });
    await late();
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ prefs: { ...BASE_PREFS, ...remote } }) });
  });
}

async function signedOut(page: Page) {
  await page.route("**/api/me", (route) => route.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify({ signedIn: false, email: null, linkedProviders: [], providers: { apple: true, google: true, email: true } }),
  }));
}

const titles = (page: Page) => page.locator('[data-testid="news-espn-layout"] .news-title');
const saved = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem("nss-preferences") || "{}"));
const samples = (page: Page) => page.evaluate(() => (window as unknown as { __flash: Sample[] }).__flash);

// One load: wait for the posts, then keep sampling past the account pull.
async function settle(page: Page) {
  await expect.poll(() => titles(page).count(), LOAD).toBeGreaterThanOrEqual(CARD_KEYS.length * 6);
  await page.waitForTimeout(2500);
}

// Open News, then reload it, and return every sample from both loads.
async function loadAndReload(page: Page) {
  await page.goto("/");
  await settle(page);
  const first = await samples(page);
  await page.reload();
  await settle(page);
  const second = await samples(page);
  const line = (tag: string, s: Sample[]) => {
    const painted = s.filter((x) => x.via === "raf");
    const span = s.length ? s[s.length - 1].t - s[0].t : 0;
    return `${tag}: ${s.length} samples (${painted.length} painted), ${span} ms${s[0] ? `, first "${s[0].text}" [${s[0].card}] at ${s[0].t} ms, html="${s[0].html}"` : ""}`;
  };
  const report = `${line("load", first)}\n${line("reload", second)}`;
  await test.info().attach("flash-samples", { body: report, contentType: "text/plain" });
  console.log(`[flash] ${test.info().title}\n${report}`);
  return { first, second };
}

const allBlurred = (page: Page) =>
  titles(page).evaluateAll((els) => els.every((el) => getComputedStyle(el).filter === "blur(7px)"));

test.beforeEach(async ({ page }) => {
  await mockFeeds(page);
  await installSampler(page);
});

test("the sampler does see a headline that shows (Headlines on, no card values)", async ({ page }) => {
  // The control for every test below: with Headlines on, samples must come in.
  await signedOut(page);
  await seed(page, { revealNewsTitles: true }, false);
  await page.goto("/");
  await settle(page);
  expect((await samples(page)).filter((x) => x.via === "raf").length).toBeGreaterThan(0);
});

test("A: Headlines on, every card off: no headline in the clear on load or reload", async ({ page }) => {
  await signedOut(page);
  await seed(page, JACOB, false);
  const { first, second } = await loadAndReload(page);
  expect(first).toEqual([]);
  expect(second).toEqual([]);
  expect(await allBlurred(page)).toBe(true);
});

test("B: Headlines off everywhere: no headline in the clear on load or reload", async ({ page }) => {
  await signedOut(page);
  await seed(page, {}, false);
  const { first, second } = await loadAndReload(page);
  expect(first).toEqual([]);
  expect(second).toEqual([]);
  expect(await allBlurred(page)).toBe(true);
});

test("C: signed in, the account copy equals this device: the pull shows no headline", async ({ page }) => {
  await mockAccount(page, JACOB);
  await seed(page, JACOB, true);
  const { first, second } = await loadAndReload(page);
  expect(first).toEqual([]);
  expect(second).toEqual([]);
  expect(await allBlurred(page)).toBe(true);
});

test("C: signed in, the account copy has no per-card values: the cards stay off", async ({ page }) => {
  await mockAccount(page, { revealNewsTitles: true });
  await seed(page, JACOB, true);
  const { first, second } = await loadAndReload(page);
  expect(first).toEqual([]);
  expect(second).toEqual([]);
  expect(await allBlurred(page)).toBe(true);
  expect((await saved(page)).newsCardPrefs).toEqual(CARDS_OFF);
});

test("C: signed in, the account copy turns Headlines on with every card off: no headline before the cards know", async ({ page }) => {
  // This device: Headlines off, no per-card values. The account: Jacob's
  // state. The pull must not show a headline between its two steps (the
  // toolbar value on <html>, then each card's own class).
  await mockAccount(page, JACOB);
  await seed(page, {}, true);
  const { first, second } = await loadAndReload(page);
  expect(first).toEqual([]);
  expect(second).toEqual([]);
  expect(await allBlurred(page)).toBe(true);
});

test("C: signed in, this device shows headlines and the account copy hides them: blurred from the first frame", async ({ page }) => {
  // The 1-3 s before the pull lands is the flash: this device's copy says
  // show, the account's says hide. A signed-in tab holds every headline
  // blurred until the pull is in (html.hs-prefs-settling).
  await mockAccount(page, JACOB);
  await seed(page, { revealNewsTitles: true }, true);
  const { first, second } = await loadAndReload(page);
  expect(first).toEqual([]);
  expect(second).toEqual([]);
  expect(await allBlurred(page)).toBe(true);
  await expect(page.locator("html")).not.toHaveClass(/hs-prefs-settling/);
});

test("C: signed in, the account copy has Headlines on and no card values: nothing shows until the pull lands", async ({ page }) => {
  // The account's own Headlines-on is the user's setting, so the headlines do
  // show once the pull lands. Until then this device's copy (off) holds.
  let pulled = 0;
  page.on("response", (r) => { if (new URL(r.url()).pathname === "/api/prefs" && r.request().method() === "GET") pulled = Date.now(); });
  await mockAccount(page, { revealNewsTitles: true });
  await seed(page, {}, true);
  const started = Date.now();
  await page.goto("/");
  await settle(page);
  const s = await samples(page);
  expect(pulled).toBeGreaterThan(0);
  // Page clock → wall clock, with 150 ms of slack for the navigation start.
  const early = s.filter((x) => started + x.t < pulled - 150);
  expect(early).toEqual([]);
  expect((await saved(page)).revealNewsTitles).toBe(true);
});

// ── The three other places a blurred headline was readable (Jacob 10/10):
// a link's URL in the browser's status bar on hover (a Reddit permalink and an
// ESPN story URL end in a slug of the headline), a button's aria-label, and
// ?ht= in the address bar once a post was open.
const slug = (headline: string, sep: string) => headline.toLowerCase().replace(/[^a-z0-9]+/g, sep);
function sluggedItemsFor(name: string) {
  return itemsFor(name).map((item, i) => ({
    ...item,
    headline: `${name} winner ${i + 1}`,
    articleUrl: name.startsWith("reddit-")
      ? `https://www.reddit.com/r/${name.slice(7)}/comments/id${i}/${slug(`${name} winner ${i + 1}`, "_")}/`
      : name === "espn-top"
        ? `https://www.espn.com/nfl/story/_/id/10${i}/${slug(`${name} winner ${i + 1}`, "-")}`
        : `https://www.espn.com/video/clip/_/id/20${i}`,
    ...(name === "espn-videos" ? { playbackUrl: `https://clips.example.test/${i}.webm` } : {}),
  }));
}

async function mockSluggedFeeds(page: Page) {
  await page.route("**/news/*.json", (route) => {
    const name = new URL(route.request().url()).pathname.split("/").pop()!.replace(/\.json$/, "");
    if (name === "highlights") return route.fulfill({ status: 200, contentType: "application/json", body: '{"games":{}}' });
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ fetchedAt: new Date(NOW).toISOString(), items: sluggedItemsFor(name) }) });
  });
  await page.route("https://clips.example.test/**", (route) => route.abort());
}
const hrefsIn = (scope: ReturnType<Page["locator"]>) =>
  scope.locator("a[href]").evaluateAll((els) => els.map((a) => a.getAttribute("href") ?? ""));

test("ESPN layout: no headline in a link's href, in an aria-label, or in the address bar", async ({ page }) => {
  await signedOut(page);
  await mockSluggedFeeds(page);
  await seed(page, {}, false);
  await page.goto("/");
  await settle(page);

  const news = page.getByTestId("news-espn-layout");
  expect((await hrefsIn(news)).filter((h) => /winner/i.test(h))).toEqual([]);
  const labels = await news.locator("[aria-label]").evaluateAll((els) => els.map((el) => el.getAttribute("aria-label") ?? ""));
  expect(labels).toContain("Play highlight");
  expect(labels.filter((l) => /winner/i.test(l))).toEqual([]);

  // Open a clip: the address bar names the post, not its headline.
  await news.locator('button[aria-label="Play highlight"]').first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.locator("p.news-title").first()).toHaveText("espn-videos winner 1", LOAD);
  const q = new URL(page.url()).searchParams;
  expect(q.get("hs")).toBe("https://clips.example.test/0.webm");
  expect(q.has("ht")).toBe(false);
  expect(decodeURIComponent(page.url())).not.toMatch(/winner/i);
  // A reload reopens the post; its headline comes back from the card's list.
  await page.reload();
  await expect(dialog.locator("p.news-title").first()).toHaveText("espn-videos winner 1", LOAD);
  expect(new URL(page.url()).searchParams.has("ht")).toBe(false);
  await page.keyboard.press("Escape");

  // A Reddit post's modal: its "Open on …" link has no slug.
  await page.getByTestId("news-espn-reddit").locator('button[aria-label="Open post"]:has(.news-title)').first().click();
  await expect.poll(() => hrefsIn(dialog), LOAD).toContain("https://www.reddit.com/r/mlb/comments/id0/");
  expect((await hrefsIn(dialog)).filter((h) => /winner/i.test(h))).toEqual([]);
});

test("Feed: a post's Open link has no headline slug, and no aria-label carries a headline", async ({ page }) => {
  await signedOut(page);
  await mockSluggedFeeds(page);
  await seed(page, { newsLayout: "feed" }, false);
  await page.goto("/");
  const links = page.locator("article a[href]", { hasText: /^Open/ });
  await expect(links.first()).toBeVisible(LOAD);
  const hrefs = await links.evaluateAll((els) => els.map((a) => a.getAttribute("href") ?? ""));
  expect(hrefs.some((h) => /^https:\/\/www\.reddit\.com\/r\/\w+\/comments\/id\d\/$/.test(h))).toBe(true);
  expect(hrefs.filter((h) => /winner/i.test(h))).toEqual([]);
  const labels = await page.locator("article [aria-label]").evaluateAll((els) => els.map((el) => el.getAttribute("aria-label") ?? ""));
  expect(labels.filter((l) => /winner/i.test(l))).toEqual([]);
});
