import { expect, test, type Page, type Route } from "@playwright/test";

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
 * The fix is the "seam lip" in globals.css: every `.sticky` row paints 3px of
 * page bg above itself, under the row above it. These tests hold it for every
 * pinned sticky row on the page, not a list, so a new row is covered too:
 *
 *  - crack: push each pinned row down (inline `top`) by each of PUSHES and
 *    hit-test every pixel row of the band it opened. Only a fixed/sticky layer
 *    (the lip, the row above, the seam cover, the header) may be there. 2px and
 *    up, not 1px: Chromium rounds a 1px or fractional probe onto the pushed row
 *    and every seam reads "ok" (10/9).
 *  - rest: the lip must change no pixel when nothing is cracked, so the band
 *    above each row (as tall as the lip) is shot with lips on and off and must
 *    match. At a fractional device scale the lip's edge shares a device pixel
 *    with the row's top border and shifts that one blended row by 4 to 5 levels
 *    of 255 (measured at 1.25x and 1.5x), so there the limit is REST_TOLERANCE.
 *  - each view must meet its expected row pairs, else the walk proved nothing.
 *  - real crack (fractional device scales only): the reported bug itself. At
 *    1.25x the bar above and the pinned header snap to different device pixels
 *    and, with no lip, one device-pixel row of card content shows between them
 *    (reproduced headless 10/10, at 1.75x too). The hit-test probes work in
 *    CSS px and cannot see that, so this one reads pixels: with the rows
 *    pinned, scroll SHIFT px and shoot the seam again. The pinned rows did not
 *    move, so a pixel that changed is page content moving through the seam.
 *
 * Views: Scores, Team view, News Cards / Feed / ESPN, each on desktop + phone,
 * and News ESPN desktop again at fractional device scales (the reported case).
 * News Feed has one seam (header → toolbar) and the seam cover holds it, not
 * the lip, so Feed stays green with the lip off; every other view goes red.
 * The native iOS shell (contentInset "always") cannot run headless: hand check.
 */

/** Crack widths probed, in CSS px. The widest must not exceed the lip height in globals.css. */
const PUSHES = [2, 3];
/** Largest per-channel change (0–255) the lip may cause at rest on a fractional device scale. A covered 1px border is 20+. */
const REST_TOLERANCE = 8;
/** Scroll distance of the real-crack check, in CSS px: a whole number of device px at 0.8x, 1.25x and 1.75x. */
const SHIFT = 20;

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

// A top-videos source leads every column, so Cards lifts them into
// AlignedVideoStrip (its own sticky source headers). The default filter is
// Reddit only, and the NFL has no videos source, so the NBA takes its column.
const VIDEOS_FIRST = { secondLeague: "nba", newsTypeFilters: ["topvideos", "reddit"], newsTypeFilterOrder: ["topvideos", "reddit"] };

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

async function openNews(page: Page, layout: "cards" | "feed" | "espn", extraPrefs: Record<string, unknown> = {}) {
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
  }, { ...NEWS_PREFS, newsLayout: layout, ...extraPrefs });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  // Feed is one list of posts: no source headers, no league titles.
  if (layout === "feed") await page.locator("article[data-feed-group]").first().waitFor(LOAD);
  else await page.locator(".news-source-sticky-top").first().waitFor(LOAD);
  if (layout === "espn") await page.getByTestId("news-reddit-bar").waitFor(LOAD);
  await page.waitForTimeout(600);
}

// The share URL skips the first-run league picker (see sticky-seam.spec.ts).
const SCORES_URL = "/?l=m&s=m.0.0&dd=t&dv=s";

/** A light slate does not scroll: a tall magenta block after `anchor` makes it (sticky-seam.spec.ts). */
async function addScrollRoom(page: Page, anchor: string) {
  await page.evaluate((sel) => {
    const spacer = document.createElement("div");
    spacer.dataset.testid = "seam-probe-content";
    spacer.style.cssText = "height:3000px;background:magenta;flex:none";
    document.querySelector(sel)!.parentElement!.appendChild(spacer);
  }, anchor);
  await page.waitForTimeout(400);
}

async function openScores(page: Page) {
  await quietNetwork(page);
  await page.goto(SCORES_URL, { waitUntil: "domcontentloaded" });
  await page.locator(".league-sticky-top").first().waitFor(LOAD);
  await addScrollRoom(page, ".league-sticky-top");
}

// Team view (TeamView.tsx) opens from a team name on a game card, so the MLB
// slate and that team's schedule are stubbed: the live slate is empty on an off
// day, and no card means no team to tap. Same event shape as favorites-only.spec.ts.
const TEAM_NOW = new Date("2026-09-30T12:00:00-04:00");
function mlbEvent(id: number, iso: string, state: "pre" | "post") {
  const side = (tid: string, name: string, abbr: string, homeAway: string) => ({
    homeAway,
    team: { id: tid, displayName: name, shortDisplayName: name.split(" ").pop(), abbreviation: abbr, logo: "", color: "000000" },
    score: state === "post" ? "3" : "0",
    records: [{ summary: "80-80" }],
  });
  return {
    id: String(id),
    date: iso,
    name: "Boston Red Sox at New York Yankees",
    shortName: "BOS @ NYY",
    season: { type: 2 },
    status: {
      displayClock: "0:00",
      period: state === "post" ? 9 : 0,
      type: state === "post"
        ? { name: "STATUS_FINAL", state, detail: "Final", shortDetail: "Final", completed: true }
        : { name: "STATUS_SCHEDULED", state, detail: "7:08 PM EDT", shortDetail: "7:08 PM EDT", completed: false },
    },
    competitions: [{ competitors: [side("10", "New York Yankees", "NYY", "home"), side("2", "Boston Red Sox", "BOS", "away")], broadcasts: [], headlines: [], notes: [] }],
  };
}
const DAY = 86_400_000;
const TEAM_SLATE = JSON.stringify({ events: [mlbEvent(401999101, "2026-09-30T23:08:00Z", "pre")] });
// 6 finished + 6 to come, so the Recent and the Upcoming divider both render.
const TEAM_SCHEDULE = JSON.stringify({
  events: Array.from({ length: 12 }, (_, i) => {
    const post = i < 6;
    return mlbEvent(401999200 + i, new Date(TEAM_NOW.getTime() + (i - 6) * DAY + (post ? 0 : 8 * 3_600_000)).toISOString(), post ? "post" : "pre");
  }),
});

async function openTeam(page: Page) {
  await quietNetwork(page);
  await page.clock.setFixedTime(TEAM_NOW);
  const json = (body: string) => (route: Route) => route.fulfill({ status: 200, contentType: "application/json", body });
  await page.route("**/news/highlights.json", json('{"games":{}}'));
  await page.route("**/baseball/mlb/standings**", json("{}"));
  await page.route("**/baseball/mlb/scoreboard?**", json(TEAM_SLATE));
  await page.route("**/baseball/mlb/teams/*/schedule?**", (route) =>
    json(new URL(route.request().url()).searchParams.get("season") === "2026" ? TEAM_SCHEDULE : '{"events":[]}')(route));
  await page.goto(SCORES_URL, { waitUntil: "domcontentloaded" });
  const teamName = page.locator('button[title^="View "][title$=" schedule"]').first();
  await teamName.waitFor(LOAD);
  // A tap before hydration does nothing, so tap until the team view opens.
  const header = page.getByTestId("team-view-header");
  await expect(async () => {
    if (!(await header.count())) await teamName.click({ timeout: 2_000 });
    await expect(header).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
  await expect(page.locator(".team-divider")).toHaveCount(2, LOAD);
  await addScrollRoom(page, ".team-divider");
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

/** Every pinned sticky row: push it `push` px down, hit-test each pixel row of the opened band, restore. */
function probeCracks(page: Page, push: number) {
  return page.evaluate((push) => {
    const name = (el: Element | null): string => {
      if (!el) return "nothing";
      if (el.tagName === "HEADER") return "header";
      // AlignedVideoStrip shares NewsColumn's SourceHeader, so its column card names it.
      if (el.classList.contains("news-source-sticky-top") && el.closest("[data-testid='aligned-strip-column']")) return "aligned-strip-source";
      for (const c of ["news-toolbar-sticky", "news-reddit-bar", "league-sticky-top", "news-source-sticky-top", "team-divider", "espn-headlines-pin", "sticky-seam-cover"]) {
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
        row.style.top = `${pin + push}px`;
        try {
          if (Math.abs(row.getBoundingClientRect().top - (pin + push)) > 0.5) continue; // at the end of its box, cannot move
          const label = row.matches(".news-source-sticky-top, .team-divider")
            ? `${name(row)} "${row.innerText.trim().split("\n")[0]}"` : name(row);
          for (const x of xs) {
            for (let dy = 0; dy < push; dy++) {
              const hit = document.elementFromPoint(x, pin + dy);
              out.push({ row: label, upper, hit: name(hit), legal: !!pinnedLayer(hit) });
            }
          }
        } finally {
          row.style.top = prevTop;
        }
      }
    } finally {
      probe.remove();
    }
    return out;
  }, push);
}

/** Largest per-channel difference (0–255) between two PNG shots; 255 when their sizes differ. */
function maxPixelDelta(page: Page, a: Buffer, b: Buffer) {
  return page.evaluate(async (shots) => {
    const [p, q] = await Promise.all(shots.map(async (b64) => {
      const bmp = await createImageBitmap(new Blob([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], { type: "image/png" }));
      const ctx = new OffscreenCanvas(bmp.width, bmp.height).getContext("2d")!;
      ctx.drawImage(bmp, 0, 0);
      return ctx.getImageData(0, 0, bmp.width, bmp.height).data;
    }));
    if (p.length !== q.length) return 255;
    let max = 0;
    for (let i = 0; i < p.length; i++) max = Math.max(max, Math.abs(p[i] - q[i]));
    return max;
  }, [a.toString("base64"), b.toString("base64")]);
}

/** Shoot the band above every visible sticky row, as tall as its lip, with lips on and off; list the rows that differ. */
async function restBandsDiffer(page: Page) {
  const tolerance = Number.isInteger(await page.evaluate(() => devicePixelRatio)) ? 0 : REST_TOLERANCE;
  const bands = await page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLElement>(".sticky"))
      .map((el) => ({ el, r: el.getBoundingClientRect(), lip: parseFloat(getComputedStyle(el, "::before").height) || 2 }))
      .filter(({ el, r, lip }) => getComputedStyle(el).position === "sticky" && r.height > 0 && r.width > 0 && r.top >= lip && r.top < innerHeight)
      .map(({ el, r, lip }) => {
        const x = Math.max(0, r.left);
        return { name: `${el.className.split(" ")[0]}@${Math.round(r.top)}`, clip: { x, y: r.top - lip, width: Math.min(r.right, innerWidth) - x, height: lip } };
      }));
  const bad: string[] = [];
  for (const b of bands) {
    if (b.clip.width < 1) continue;
    const on = await page.screenshot({ clip: b.clip, animations: "disabled", caret: "hide" });
    const off = await page.addStyleTag({ content: ".sticky::before{display:none !important}" });
    const without = await page.screenshot({ clip: b.clip, animations: "disabled", caret: "hide" });
    await off.evaluate((s) => (s as HTMLElement).remove());
    if (on.equals(without)) continue;
    const delta = tolerance ? await maxPixelDelta(page, on, without) : 255;
    if (delta > tolerance) bad.push(tolerance ? `${b.name} (changed by ${delta} of 255)` : b.name);
  }
  return bad;
}

/**
 * Fractional device scales: every seam (a pinned row with a pinned layer right
 * above it) is shot, the page scrolls SHIFT px on in `dir`, and the seam is shot
 * again. Lists the seams whose pixels changed while both rows held still.
 */
async function seamsShowMovingContent(page: Page, dir: 1 | -1) {
  type Seam = { name: string; clip: { x: number; y: number; width: number; height: number } };
  const still = () => page.evaluate(() => {
    const pinnedLayer = (el: Element | null): Element | null => {
      for (let e = el; e; e = e.parentElement) {
        const p = getComputedStyle(e).position;
        if (p === "fixed" || p === "sticky") return e;
      }
      return null;
    };
    const w = window as unknown as { __seams?: { row: HTMLElement; upper: Element; top: number; upperTop: number }[] };
    if (w.__seams) {
      // Second call: the seams that are where they were before the scroll.
      const kept = w.__seams.map((s) => s.row.isConnected && Math.abs(s.row.getBoundingClientRect().top - s.top) < 0.01
        && Math.abs(s.upper.getBoundingClientRect().top - s.upperTop) < 0.01);
      delete w.__seams;
      return { seams: [] as Seam[], kept };
    }
    const probe = document.createElement("style");
    probe.textContent = ".sticky::before,[data-testid='sticky-seam-cover']{pointer-events:auto !important}";
    document.head.appendChild(probe);
    const seams: Seam[] = [];
    w.__seams = [];
    try {
      for (const row of document.querySelectorAll<HTMLElement>("body *")) {
        const cs = getComputedStyle(row);
        if (cs.position !== "sticky" || cs.top === "auto") continue;
        const pin = parseFloat(cs.top);
        const r = row.getBoundingClientRect();
        if (!(pin > 0) || r.height <= 0 || r.width <= 0 || Math.abs(r.top - pin) > 0.5 || r.top >= innerHeight) continue;
        const left = Math.max(0, r.left);
        const width = Math.min(innerWidth, r.right) - left;
        // A seam only where a pinned layer covers the whole width above the row;
        // anywhere else page content above the row is the page working.
        const uppers = [0.02, 0.5, 0.98].map((f) => pinnedLayer(document.elementFromPoint(left + width * f, pin - 1)));
        if (width < 1 || uppers.some((u) => !u || u === row || row.contains(u))) continue;
        w.__seams.push({ row, upper: uppers[1]!, top: r.top, upperTop: uppers[1]!.getBoundingClientRect().top });
        seams.push({ name: `${row.className.split(" ")[0]} "${row.innerText.trim().split("\n")[0]}"`, clip: { x: left, y: pin - 1, width, height: 2 } });
      }
    } finally {
      probe.remove();
    }
    return { seams, kept: [] as boolean[] };
  });
  const shoot = (seam: Seam) => page.screenshot({ clip: seam.clip, animations: "disabled", caret: "hide" });
  const { seams } = await still();
  const before: Buffer[] = [];
  for (const seam of seams) before.push(await shoot(seam));
  await page.evaluate((by) => new Promise<void>((done) => {
    window.scrollBy({ top: by, behavior: "instant" });
    requestAnimationFrame(() => requestAnimationFrame(() => done()));
  }), dir * SHIFT);
  await page.waitForTimeout(250);
  const { kept } = await still();
  const moved: string[] = [];
  let checked = 0;
  for (const [i, seam] of seams.entries()) {
    if (!kept[i]) continue; // the row or the layer above it let go: no longer the same seam
    checked++;
    if (!(await shoot(seam)).equals(before[i])) moved.push(seam.name);
  }
  return { checked, moved };
}

/**
 * Scroll stops for a walk down the page: an even stride, plus one just past the
 * pin point of every sticky row, so each row is pinned at least once however
 * long the page is.
 */
async function walkStops(page: Page) {
  const max = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
  expect(max, "the page must scroll, else no row ever pins").toBeGreaterThan(400);
  const rowStops = await page.evaluate(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
    return Array.from(document.querySelectorAll<HTMLElement>("body *"))
      .filter((el) => getComputedStyle(el).position === "sticky" && getComputedStyle(el).top !== "auto")
      .map((el) => el.getBoundingClientRect().top - parseFloat(getComputedStyle(el).top) + 40);
  });
  const stride = Math.max(200, Math.ceil(max / 10));
  return [...Array.from({ length: Math.floor(max / stride) + 1 }, (_, i) => i * stride), ...rowStops]
    .filter((y) => y > 0 && y <= max).map(Math.round).sort((a, b) => a - b)
    .filter((y, i, a) => i === 0 || y - a[i - 1] > 60);
}

type View = { name: string; use: Record<string, unknown>; open: (page: Page) => Promise<void>; news: boolean; expected: string[] };

const VIEWS: View[] = [
  { name: "Scores desktop", use: DESKTOP, open: openScores, news: false, expected: ["header → league-sticky-top"] },
  { name: "Scores phone", use: SCORES_PHONE, open: openScores, news: false, expected: ["header → league-sticky-top"] },
  {
    name: "News Cards desktop", use: DESKTOP, open: (p) => openNews(p, "cards"), news: true,
    expected: ["shown: news-toolbar-sticky → league-sticky-top", "shown: league-sticky-top → news-source-sticky-top"],
  },
  { name: "Team view desktop", use: DESKTOP, open: openTeam, news: false, expected: ["header → league-sticky-top", "league-sticky-top → team-divider"] },
  { name: "Team view phone", use: SCORES_PHONE, open: openTeam, news: false, expected: ["header → league-sticky-top", "league-sticky-top → team-divider"] },
  // One column on the phone: no league title row, the source headers pin under the toolbar.
  {
    name: "News Cards phone", use: PHONE, open: (p) => openNews(p, "cards"), news: true,
    expected: ["shown: news-toolbar-sticky → news-source-sticky-top", "hidden: header → news-source-sticky-top"],
  },
  {
    name: "News Cards desktop, video strip", use: DESKTOP, open: (p) => openNews(p, "cards", VIDEOS_FIRST), news: true,
    expected: ["shown: news-toolbar-sticky → league-sticky-top", "shown: league-sticky-top → aligned-strip-source"],
  },
  // Feed is one list of posts: the toolbar is its only pinned row.
  { name: "News Feed desktop", use: DESKTOP, open: (p) => openNews(p, "feed"), news: true, expected: ["shown: header → news-toolbar-sticky"] },
  { name: "News Feed phone", use: PHONE, open: (p) => openNews(p, "feed"), news: true, expected: ["shown: header → news-toolbar-sticky"] },
  // The reported case (Firefox at 80%) again at real fractional device scales.
  // With the lip off (10/10), 1.25x and 1.75x open the real 1-device-px crack
  // headless; 0.67x, 0.8x, 0.9x, 1.1x, 1.5x, 1.6x and 2.5x do not at this layout.
  ...[1, 0.8, 1.25, 1.75].map((dpr): View => ({
    name: dpr === 1 ? "News ESPN desktop" : `News ESPN desktop at ${dpr}x`,
    use: dpr === 1 ? DESKTOP : { ...DESKTOP, deviceScaleFactor: dpr },
    open: (p) => openNews(p, "espn"), news: true,
    expected: [
      "shown: news-toolbar-sticky → news-source-sticky-top",
      "shown: news-toolbar-sticky → news-reddit-bar",
      "shown: news-reddit-bar → news-source-sticky-top",
      "hidden: header → news-reddit-bar",
    ],
  })),
  {
    name: "News ESPN phone", use: PHONE, open: (p) => openNews(p, "espn"), news: true,
    expected: ["shown: news-toolbar-sticky → news-reddit-bar", "shown: news-reddit-bar → news-source-sticky-top", "hidden: header → news-reddit-bar"],
  },
];

for (const view of VIEWS) {
  test.describe(view.name, () => {
    test.use(view.use);
    const fractional = !Number.isInteger((view.use as { deviceScaleFactor?: number }).deviceScaleFactor ?? 1);
    // Fractional scales are Chromium's (Chrome, Edge and Firefox zoom all move
    // devicePixelRatio; Safari page zoom keeps it whole). WebKit at one does not
    // snap pinned rows to device pixels: on the mini (10/10) the seam rows blend
    // by 2 of 255 as content scrolls, and 0.8x never pins the Reddit bar.
    test.skip(({ browserName }) => fractional && browserName !== "chromium", "fractional device scales run in Chromium only");

    test(`no pinned sticky row shows page content in a ${PUSHES.join(" or ")}px crack`, async ({ page }) => {
      test.setTimeout(180_000);
      await view.open(page);
      const stops = await walkStops(page);
      const states = view.news ? (["below", "above"] as const) : (["below"] as const);
      const pairs = new Set<string>();
      const fails = new Set<string>();
      for (const y of [0, ...stops]) {
        for (const from of states) {
          await scrollTo(page, y, from);
          const state = view.news
            ? ((await page.locator(".news-toolbar-sticky[data-hidden]").count()) ? "hidden" : "shown")
            : "";
          for (const push of PUSHES) {
            for (const c of await probeCracks(page, push)) {
              const pair = `${c.upper} → ${c.row.split(" ")[0]}`;
              pairs.add(state ? `${state}: ${pair}` : pair);
              if (!c.legal) fails.add(`content shows in a ${push}px crack above ${c.row} (under ${c.upper}, toolbar ${state || "n/a"}, hit ${c.hit})`);
            }
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
      // Pinned rows at a whole device scale only: at a fractional one the seam
      // is cracked for real, and the lip changing it is the fix (next test).
      if (!fractional) {
        const max = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
        await scrollTo(page, Math.min(max, 900), "below");
        bad.push(...(await restBandsDiffer(page)).map((n) => `pinned: ${n}`));
      }
      expect(bad, "the lip paints over something real above these rows").toEqual([]);
    });

    if (fractional) {
      test("no page content moves through a seam between pinned rows", async ({ page }) => {
        test.setTimeout(180_000);
        await view.open(page);
        const moved = new Set<string>();
        let checked = 0;
        for (const y of await walkStops(page)) {
          for (const from of ["below", "above"] as const) {
            await scrollTo(page, y, from);
            const state = (await page.locator(".news-toolbar-sticky[data-hidden]").count()) ? "hidden" : "shown";
            // On in the same direction, so the hide-on-scroll toolbar keeps its state.
            const seen = await seamsShowMovingContent(page, from === "below" ? -1 : 1);
            checked += seen.checked;
            for (const name of seen.moved) moved.add(`${name} (toolbar ${state})`);
          }
        }
        expect(checked, "seams shot twice with both rows still pinned; too few proves nothing").toBeGreaterThan(20);
        expect([...moved], "page content shows in the seam above these pinned rows").toEqual([]);
      });
    }
  });
}
