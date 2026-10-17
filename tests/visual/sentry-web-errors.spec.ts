import { expect, test, type Page, type Route } from "@playwright/test";

// Sentry web errors #390, #252, #261, #245, #79 (pulled 2026-10-15), each
// reproduced in Chromium at phone and desktop width. Every test records what
// the page sends to Sentry, so it shows both halves: the error a crawler or an
// injected script causes stays out of Sentry, and a real one still goes in.
// No game data is mocked: the board stays empty, so no fixture can show a
// result.

const OWN_ABORT = /HideScore cancelled this request on purpose/;

type Capture = { pageErrors: string[]; sentry: string[] };

// Every cross-origin request: Sentry's envelopes are recorded and answered,
// fetch/XHR hang (so only our own timeouts end them), anything else fails.
async function isolate(page: Page, opts: { hangFetches?: boolean } = {}): Promise<Capture> {
  const cap: Capture = { pageErrors: [], sentry: [] };
  page.on("pageerror", (e) => cap.pageErrors.push(`${e.name}: ${e.message}`));
  await page.route("**/*", (route: Route) => {
    const url = new URL(route.request().url());
    if (url.hostname === "localhost" || url.hostname === "127.0.0.1") return route.continue();
    if (url.hostname.endsWith("sentry.io")) {
      cap.sentry.push(route.request().postData() ?? "");
      return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
    }
    const type = route.request().resourceType();
    if (opts.hangFetches && (type === "fetch" || type === "xhr")) return; // never answered
    return route.abort();
  });
  return cap;
}

async function quietBoardPrefs(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem("nss-preferences", JSON.stringify({
      favoriteLeagues: ["mlb"], favoriteTeams: [], theme: "dark",
      showRatings: false, skipExplainer: true, skipNewsExplainer: true, showNews: false,
      leaguesOnboarded: true, firstLeague: "mlb", secondLeague: "empty",
      thirdLeague: "empty", fourthLeague: "empty", fifthLeague: "empty",
      defaultDateMode: "today", defaultLandingView: "scores",
    }));
  });
}

const sentryHas = (cap: Capture, re: RegExp) => cap.sentry.some((body) => re.test(body));

for (const width of [390, 1440]) {
  test.describe(`Sentry web errors at ${width}px`, () => {
    test.use({ viewport: { width, height: width < 600 ? 844 : 900 } });

    // ── #390 ────────────────────────────────────────────────────────────────
    const TEAM = "/teams/nhl/toronto-maple-leafs";

    // Log every node React (or anything) takes out of <head>.
    async function watchHead(page: Page) {
      await page.addInitScript(() => {
        const w = window as unknown as { __headRemovals: string[] };
        w.__headRemovals = [];
        const real = Node.prototype.removeChild;
        Node.prototype.removeChild = function <T extends Node>(this: Node, child: T): T {
          if (this === document.head) w.__headRemovals.push((child as unknown as Element).outerHTML?.slice(0, 80) ?? child.nodeName);
          return real.call(this, child) as T;
        };
      });
    }
    const headRemovals = (page: Page) => page.evaluate(() => (window as unknown as { __headRemovals: string[] }).__headRemovals);

    test("#390: the team page itself takes nothing out of <head>", async ({ page }) => {
      const cap = await isolate(page);
      await watchHead(page);
      await page.goto(TEAM);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await page.waitForTimeout(1500);
      expect(await headRemovals(page)).toEqual([]);
      expect(cap.pageErrors).toEqual([]);
    });

    for (const [who, ua, reported] of [
      ["a crawler", "Mozilla/5.0 (compatible; SEBot/1.0)", false],
      ["a person", undefined, true],
    ] as const) {
      test(`#390: a <head> node removed outside React throws on the next navigation; ${who}'s event ${reported ? "reports" : "is dropped"}`, async ({ browser }) => {
        const context = await browser.newContext({ viewport: { width, height: 900 }, ...(ua ? { userAgent: ua } : {}) });
        const page = await context.newPage();
        const cap = await isolate(page);
        await page.goto(TEAM);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        await page.waitForTimeout(1000);
        // What the crawler's renderer did: take one metadata node out of <head>.
        await page.evaluate(() => document.head.querySelector('meta[name="description"]')?.remove());
        await page.getByRole("link", { name: "All teams" }).click();
        await page.waitForURL("**/teams");
        await expect.poll(() => cap.pageErrors.join("\n")).toMatch(/reading 'removeChild'/);
        await page.waitForTimeout(2000); // Sentry sends on its own schedule
        expect(sentryHas(cap, /reading 'removeChild'/)).toBe(reported);
        await context.close();
      });
    }

    // ── #252, #261 ──────────────────────────────────────────────────────────
    test("#252/#261: our fetch timeouts under an injected fetch wrapper never reach Sentry", async ({ page }) => {
      test.setTimeout(120_000);
      await quietBoardPrefs(page);
      // What an extension or a privacy browser injects: a fetch wrapper that
      // branches the promise and never handles the branch.
      await page.addInitScript(() => {
        const w = window as unknown as { __rejections: string[] };
        w.__rejections = [];
        addEventListener("unhandledrejection", (e) => {
          const r = e.reason as { name?: string; message?: string } | undefined;
          w.__rejections.push(`${r?.name}: ${r?.message}`);
        });
        const realFetch = window.fetch;
        window.fetch = function (this: typeof globalThis, ...args: Parameters<typeof fetch>) {
          const p = realFetch.apply(this, args);
          void p.then(() => {});
          return p;
        } as typeof fetch;
      });
      const cap = await isolate(page, { hangFetches: true });
      await page.goto("/");
      const rejections = () => page.evaluate(() => (window as unknown as { __rejections: string[] }).__rejections);
      // The MLB statsapi and ESPN timeouts (5-10 s) fire.
      await expect.poll(async () => (await rejections()).length, { timeout: 60_000 }).toBeGreaterThan(0);
      const all = await rejections();
      for (const r of all) expect(r).toMatch(OWN_ABORT);
      await page.waitForTimeout(2000);
      expect(sentryHas(cap, /AbortError/)).toBe(false);
      // The wrapper's branches are page errors too; all of them are our named abort.
      for (const e of cap.pageErrors) expect(e).toMatch(OWN_ABORT);
    });

    // ── #245 ────────────────────────────────────────────────────────────────
    test("#245: play, pause, seek and fullscreen in the wrong state do not throw out of the player controls", async ({ page }) => {
      await quietBoardPrefs(page);
      // Every media call on the player throws or rejects InvalidStateError,
      // the way WebKit does on a <video> in the wrong state.
      await page.addInitScript(() => {
        const w = window as unknown as { __rejections: string[] };
        w.__rejections = [];
        addEventListener("unhandledrejection", (e) => w.__rejections.push(String((e.reason as Error)?.name)));
        const bad = () => new DOMException("The object is in an invalid state.", "InvalidStateError");
        const P = HTMLMediaElement.prototype;
        // Counts the calls, so the test knows the keys reached them.
        const m = window as unknown as { __mediaCalls: number };
        m.__mediaCalls = 0;
        const fail = () => { m.__mediaCalls += 1; return bad(); };
        P.play = function () { return Promise.reject(fail()); };
        P.pause = function () { throw fail(); };
        Object.defineProperty(P, "paused", { configurable: true, get: () => false });
        Object.defineProperty(P, "duration", { configurable: true, get: () => 60 });
        Object.defineProperty(P, "currentTime", { configurable: true, get: () => 10, set: () => { throw fail(); } });
        Element.prototype.requestFullscreen = function () { throw fail(); };
      });
      const cap = await isolate(page);
      // A shared highlight link (?hs=) opens the player on load, as in the event.
      await page.route("https://clips.example.test/**", () => { /* the stream never loads */ });
      await page.goto(`/?hs=${encodeURIComponent("https://clips.example.test/clip.mp4")}`);
      const video = page.locator('video[aria-label="Video player"]');
      await expect(video).toBeVisible();
      // The player's own keys run the same handlers as its buttons and taps:
      // k play/pause (pause() throws), l seek (currentTime throws, then play()
      // rejects), f fullscreen (requestFullscreen throws).
      await page.getByRole("dialog").first().focus();
      for (const key of ["k", "l", "f"]) {
        await page.keyboard.press(key);
        await page.waitForTimeout(300);
      }
      await page.waitForTimeout(700);
      expect(await page.evaluate(() => (window as unknown as { __mediaCalls: number }).__mediaCalls)).toBeGreaterThanOrEqual(3);
      expect(cap.pageErrors).toEqual([]);
      expect(await page.evaluate(() => (window as unknown as { __rejections: string[] }).__rejections)).toEqual([]);
      expect(sentryHas(cap, /InvalidStateError/)).toBe(false);
    });

    // ── #79 ─────────────────────────────────────────────────────────────────
    test("#79: a device that reports Etc/Unknown gets Eastern time, with no RangeError", async ({ page }) => {
      await quietBoardPrefs(page);
      // HeadlessChrome on a host with no zone data reports "Etc/Unknown", a
      // name the same Intl then rejects as a timeZone option.
      await page.addInitScript(() => {
        const proto = Intl.DateTimeFormat.prototype;
        const real = proto.resolvedOptions;
        proto.resolvedOptions = function (this: Intl.DateTimeFormat) {
          return { ...real.call(this), timeZone: "Etc/Unknown" };
        };
      });
      const cap = await isolate(page);
      await page.goto("/");
      expect(await page.evaluate(() => {
        try { new Date().toLocaleString("en-US", { timeZone: "Etc/Unknown" }); return "accepted"; } catch (e) { return (e as Error).name; }
      })).toBe("RangeError");
      await page.getByRole("button", { name: "Open settings" }).first().click();
      const settings = page.getByRole("dialog", { name: "Settings" });
      await expect(settings.getByText(/Auto · your device \(New York\)/)).toBeVisible();
      await page.waitForTimeout(1000);
      expect(cap.pageErrors).toEqual([]);
      expect(sentryHas(cap, /Invalid time zone/)).toBe(false);
    });
  });
}
