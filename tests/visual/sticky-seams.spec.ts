import { expect, test, type Page } from "@playwright/test";

/**
 * Guard for "content shows in a crack between two pinned rows", in EVERY view.
 *
 * Reported six times. The 6th (Jacob 10/9, Firefox at 80% zoom): a 1-device-px
 * row of r/ card content between the pinned Reddit bar and the R/BASEBALL /
 * R/NFL headers. Two sticky rows pin at the same CSS number, but at a
 * fractional zoom the engine snaps each layer to a different device pixel and
 * opens a row between them. sticky-seam.spec.ts holds one seam only (Scores
 * header → league title); the News work of 10/8–10/9 added seams it never saw.
 *
 * The fix is the "seam lip" in globals.css: every `.sticky` row paints 2px of
 * page bg above itself, under the row above it. These tests hold it for every
 * pinned sticky row on the page, not a list, so a new row is covered too:
 *
 *  - crack: push each pinned row 2px down (inline `top`) and hit-test the band
 *    it opened. Only a fixed/sticky layer (the lip, the row above, the seam
 *    cover, the header) may be there. 2px, not 1px: Chromium rounds a 1px or
 *    fractional probe onto the pushed row and every seam reads "ok" (10/9).
 *  - rest: the lip must change no pixel when nothing is cracked, so the 2px
 *    band above each row is shot with lips on and off and must match.
 *  - each view must meet its expected row pairs, else the walk proved nothing.
 */

const LOAD = { timeout: 60_000 }; // the first test pays the dev server's cold compile
const DESKTOP = { viewport: { width: 1280, height: 600 } };
const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true };
const SCORES_PHONE = { ...PHONE, viewport: { width: 393, height: 852 } };

// Same news prefs as news-espn-layout.spec.ts, autoplay off so shots hold still.
const NEWS_PREFS = {
  favoriteLeagues: [],
  favoriteTeams: [],
  theme: "system",
  showRatings: false,
  skipExplainer: true,
  skipNewsExplainer: true,
  showNews: true,
  leaguesOnboarded: true,
  switcherDefaultsVersion: 2,
  defaultLandingView: "news",
  defaultDateMode: "today",
  firstLeague: "mlb",
  secondLeague: "nfl",
  thirdLeague: "nhl",
  fourthLeague: "empty",
  fifthLeague: "empty",
  showTextPosts: true,
  newsAutoplay: false,
};

const NOW = Date.now();
// Copied from news-espn-layout.spec.ts: text posts everywhere, clips in
// espn-videos and on every 2nd subreddit post.
function itemsFor(name: string) {
  const n = name === "espn-videos" ? 10 : 8;
  return Array.from({ length: n }, (_, i) => ({
    id: `${name}-${i}`,
    headline: `${name} post ${i + 1}`,
    description: "",
    published: new Date(NOW - (i + 1) * 3_600_000).toISOString(),
    articleUrl: `https://example.com/${name}/${i}`,
    byline: "",
    section: name.startsWith("reddit-") ? `r/${name.slice(7)}` : "ESPN",
    ...(name.endsWith("-videos") || (name.startsWith("reddit-") && i % 2 === 1)
      ? { playbackUrl: `https://clips.example.test/${name}-${i}.webm` } : {}),
  }));
}

/**
 * External images and clips never load, so every shot holds still; analytics
 * and Sentry stay quiet. Only off-site URLs are routed: a catch-all route on
 * the dev server's own requests stalled page loads (10/9, /api/me never landed).
 */
async function quietNetwork(page: Page) {
  const base = new URL(test.info().project.use.baseURL ?? "http://localhost:3000").host;
  await page.route((url) => url.host !== base, (route) => {
    const req = route.request();
    const host = new URL(req.url()).hostname;
    if (["image", "media"].includes(req.resourceType()) || /(^|\.)(sentry\.io|zgo\.at|stats\.hidescore\.com)$/.test(host)) return route.abort();
    return route.fallback();
  });
}

async function openNews(page: Page, layout: "cards" | "espn") {
  await quietNetwork(page);
  await page.route("**/news/*.json", (route) => {
    const name = new URL(route.request().url()).pathname.split("/").pop()!.replace(/\.json$/, "");
    if (name === "highlights") return route.fulfill({ status: 200, contentType: "application/json", body: '{"games":{}}' });
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ fetchedAt: new Date(NOW).toISOString(), items: itemsFor(name) }) });
  });
  await page.addInitScript((prefs) => {
    if (sessionStorage.getItem("hs-seed")) return;
    sessionStorage.setItem("hs-seed", "1");
    localStorage.setItem("nss-preferences", JSON.stringify(prefs));
  }, { ...NEWS_PREFS, newsLayout: layout });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.locator(".news-source-sticky-top").first().waitFor(LOAD);
  if (layout === "espn") await page.getByTestId("news-reddit-bar").waitFor(LOAD);
  else await page.locator(".league-sticky-top").first().waitFor(LOAD);
  await page.waitForTimeout(600);
}

async function openScores(page: Page) {
  await quietNetwork(page);
  // The share URL skips the first-run league picker (see sticky-seam.spec.ts).
  await page.goto("/?l=m&s=m.0.0&dd=t&dv=s", { waitUntil: "domcontentloaded" });
  await page.locator(".league-sticky-top").first().waitFor(LOAD);
  // A light slate does not scroll: a tall magenta block makes it (sticky-seam.spec.ts).
  await page.evaluate(() => {
    const title = document.querySelector(".league-sticky-top");
    const spacer = document.createElement("div");
    spacer.dataset.testid = "seam-probe-content";
    spacer.style.cssText = "height:3000px;background:magenta";
    title!.parentElement!.appendChild(spacer);
  });
  await page.waitForTimeout(400);
}

/** Scroll to y. "below" arrives scrolling up (news toolbar shown), "above" scrolling down (hidden). */
async function scrollTo(page: Page, y: number, from: "below" | "above") {
  // Two frames between the jumps, so the hide-on-scroll hook sees two scroll
  // events and reads the direction (WebKit on the phone merged them at 80 ms).
  const jump = (top: number) => page.evaluate((t) => new Promise<void>((done) => {
    window.scrollTo({ top: t, behavior: "instant" });
    requestAnimationFrame(() => requestAnimationFrame(() => done()));
  }), top);
  await jump(Math.max(0, from === "below" ? y + 300 : y - 300));
  await page.waitForTimeout(80);
  await jump(y);
  await page.waitForTimeout(400);
}

/** Every pinned sticky row: push 2px down, hit-test the opened band, restore. */
function probeCracks(page: Page) {
  return page.evaluate(() => {
    const name = (el: Element | null): string => {
      if (!el) return "nothing";
      if (el.tagName === "HEADER") return "header";
      for (const c of ["news-toolbar-sticky", "news-reddit-bar", "league-sticky-top", "news-source-sticky-top", "espn-headlines-pin", "sticky-seam-cover"]) {
        if (el.classList.contains(c)) return c;
      }
      return `${el.tagName.toLowerCase()}.${String(el.className).split(" ").slice(0, 3).join(".")}`;
    };
    const pinnedLayer = (el: Element | null): Element | null => {
      for (let e = el; e; e = e.parentElement) {
        const p = getComputedStyle(e).position;
        if (p === "fixed" || p === "sticky") return e;
      }
      return null;
    };
    // elementFromPoint skips pointer-events:none, and the lip and the seam
    // cover are both that. Paint order does not care, so the probe turns them on.
    const probe = document.createElement("style");
    probe.textContent = ".sticky::before,[data-testid='sticky-seam-cover']{pointer-events:auto !important}";
    document.head.appendChild(probe);
    const out: { row: string; upper: string; hit: string; legal: boolean }[] = [];
    try {
      // A full computed-style scan is slow on the long phone page, so it is
      // cached and redone only when the element count changes.
      const w = window as unknown as { __stickyScan?: { n: number; rows: HTMLElement[] } };
      const all = document.querySelectorAll<HTMLElement>("body *");
      if (!w.__stickyScan || w.__stickyScan.n !== all.length) {
        w.__stickyScan = { n: all.length, rows: Array.from(all).filter((el) => getComputedStyle(el).position === "sticky") };
      }
      for (const row of w.__stickyScan.rows) {
        if (!row.isConnected) continue;
        const cs = getComputedStyle(row);
        if (cs.position !== "sticky" || cs.top === "auto") continue;
        const pin = parseFloat(cs.top);
        const r = row.getBoundingClientRect();
        if (!(pin > 0) || r.height <= 0 || r.width <= 0 || Math.abs(r.top - pin) > 0.5 || r.top >= innerHeight) continue;
        const xs = [0.25, 0.5, 0.75].map((f) => Math.max(1, Math.min(innerWidth - 1, r.left + r.width * f)));
        const upperEl = pinnedLayer(document.elementFromPoint(xs[1], pin - 1));
        const upper = upperEl === row ? "nothing (row's own lip)" : name(upperEl);
        const prevTop = row.style.top;
        row.style.top = `${pin + 2}px`;
        try {
          if (Math.abs(row.getBoundingClientRect().top - (pin + 2)) > 0.5) continue; // at the end of its box, cannot move
          const label = row.classList.contains("news-source-sticky-top")
            ? `${name(row)} "${row.innerText.trim().split("\n")[0]}"` : name(row);
          for (const x of xs) {
            const hit = document.elementFromPoint(x, pin + 1);
            out.push({ row: label, upper, hit: name(hit), legal: !!pinnedLayer(hit) });
          }
        } finally {
          row.style.top = prevTop;
        }
      }
    } finally {
      probe.remove();
    }
    return out;
  });
}

/** Shoot the 2px band above every visible sticky row with lips on and off; list the rows that differ. */
async function restBandsDiffer(page: Page) {
  const bands = await page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLElement>(".sticky"))
      .map((el) => ({ el, r: el.getBoundingClientRect() }))
      .filter(({ el, r }) => getComputedStyle(el).position === "sticky" && r.height > 0 && r.width > 0 && r.top >= 2 && r.top < innerHeight)
      .map(({ el, r }) => {
        const x = Math.max(0, r.left);
        return { name: `${el.className.split(" ")[0]}@${Math.round(r.top)}`, clip: { x, y: r.top - 2, width: Math.min(r.right, innerWidth) - x, height: 2 } };
      }));
  const bad: string[] = [];
  for (const b of bands) {
    if (b.clip.width < 1) continue;
    const on = await page.screenshot({ clip: b.clip, animations: "disabled", caret: "hide" });
    const off = await page.addStyleTag({ content: ".sticky::before{display:none !important}" });
    const without = await page.screenshot({ clip: b.clip, animations: "disabled", caret: "hide" });
    await off.evaluate((s) => (s as HTMLElement).remove());
    if (!on.equals(without)) bad.push(b.name);
  }
  return bad;
}

type View = { name: string; use: Record<string, unknown>; open: (page: Page) => Promise<void>; news: boolean; expected: string[] };

const VIEWS: View[] = [
  { name: "Scores desktop", use: DESKTOP, open: openScores, news: false, expected: ["header → league-sticky-top"] },
  { name: "Scores phone", use: SCORES_PHONE, open: openScores, news: false, expected: ["header → league-sticky-top"] },
  {
    name: "News Cards desktop", use: DESKTOP, open: (p) => openNews(p, "cards"), news: true,
    expected: ["shown: news-toolbar-sticky → league-sticky-top", "shown: league-sticky-top → news-source-sticky-top"],
  },
  {
    name: "News ESPN desktop", use: DESKTOP, open: (p) => openNews(p, "espn"), news: true,
    expected: [
      "shown: news-toolbar-sticky → news-source-sticky-top",
      "shown: news-toolbar-sticky → news-reddit-bar",
      "shown: news-reddit-bar → news-source-sticky-top",
      "hidden: header → news-reddit-bar",
    ],
  },
  {
    name: "News ESPN phone", use: PHONE, open: (p) => openNews(p, "espn"), news: true,
    expected: ["shown: news-toolbar-sticky → news-reddit-bar", "shown: news-reddit-bar → news-source-sticky-top", "hidden: header → news-reddit-bar"],
  },
];

for (const view of VIEWS) {
  test.describe(view.name, () => {
    test.use(view.use);

    test("no pinned sticky row shows page content in a 2px crack", async ({ page }) => {
      test.setTimeout(180_000);
      await view.open(page);
      const max = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
      expect(max, "the page must scroll, else no row ever pins").toBeGreaterThan(400);
      // Stops: an even stride, plus one just past the pin point of every sticky
      // row, so each row is pinned at least once however long the page is.
      const rowStops = await page.evaluate(() => {
        window.scrollTo({ top: 0, behavior: "instant" });
        return Array.from(document.querySelectorAll<HTMLElement>("body *"))
          .filter((el) => getComputedStyle(el).position === "sticky" && getComputedStyle(el).top !== "auto")
          .map((el) => el.getBoundingClientRect().top - parseFloat(getComputedStyle(el).top) + 40);
      });
      const stride = Math.max(200, Math.ceil(max / 10));
      const stops = [...Array.from({ length: Math.floor(max / stride) + 1 }, (_, i) => i * stride), ...rowStops]
        .filter((y) => y > 0 && y <= max).map(Math.round).sort((a, b) => a - b)
        .filter((y, i, a) => i === 0 || y - a[i - 1] > 60);
      const states = view.news ? (["below", "above"] as const) : (["below"] as const);
      const pairs = new Set<string>();
      const fails = new Set<string>();
      for (const y of [0, ...stops]) {
        for (const from of states) {
          await scrollTo(page, y, from);
          const state = view.news
            ? ((await page.locator(".news-toolbar-sticky[data-hidden]").count()) ? "hidden" : "shown")
            : "";
          for (const c of await probeCracks(page)) {
            const pair = `${c.upper} → ${c.row.split(" ")[0]}`;
            pairs.add(state ? `${state}: ${pair}` : pair);
            if (!c.legal) fails.add(`content shows in a 2px crack above ${c.row} (under ${c.upper}, toolbar ${state || "n/a"}, hit ${c.hit})`);
          }
        }
      }
      const missing = view.expected.filter((p) => !pairs.has(p));
      expect(missing, `seams never reached, so the walk proved nothing for them; met: ${[...pairs].join(" | ")}`).toEqual([]);
      expect([...fails]).toEqual([]);
    });

    test("the seam lip changes no pixel at rest", async ({ page }) => {
      await view.open(page);
      const bad: string[] = [];
      await scrollTo(page, 0, "below");
      bad.push(...(await restBandsDiffer(page)).map((n) => `top: ${n}`));
      const max = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
      await scrollTo(page, Math.min(max, 900), "below");
      bad.push(...(await restBandsDiffer(page)).map((n) => `pinned: ${n}`));
      expect(bad, "the lip paints over something real above these rows").toEqual([]);
    });
  });
}
