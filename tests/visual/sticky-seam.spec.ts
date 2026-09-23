import { test, expect } from "@playwright/test";

/**
 * Regression guard for "game cards slice under the sticky league title".
 *
 * Reported four separate times (16464D55, 436F28A9, 66BBA2B3, A1610FBF) and
 * "fixed" twice by adjusting offsets, because the real cause is a RACE, not
 * arithmetic: the sticky rows pin at an offset built from --header-h, which a
 * ResizeObserver measures from the live <header>. On the native iOS shell the
 * header's padding is clamp(50px, env(safe-area-inset-top), 60px), so its
 * height changes on resume/rotation/keyboard and the measurement can lag. When
 * the stale --header-h is LARGER than the header actually is, the league title
 * pins below the header's bottom edge and scrolling cards show through the gap.
 *
 * A test that just loads the page and looks for the gap would pass forever —
 * desktop Chromium has no safe-area inset, so the race never fires there. So
 * instead of reproducing the race, these tests reproduce its WORST OUTCOME:
 * they corrupt --header-h directly, in both directions, and assert that
 * nothing bleeds through regardless. That holds the invariant the seam cover
 * exists to guarantee, independent of whatever the measurement is doing.
 *
 * If someone deletes .sticky-seam-cover or changes its height expression so it
 * no longer matches .league-sticky-top's `top`, these fail.
 */

// iPhone 15 Pro geometry, but deliberately NOT devices["iPhone 15 Pro"] —
// that preset also sets defaultBrowserType: "webkit", and this repo's
// playwright.config only provisions chromium.
test.use({
  viewport: { width: 393, height: 852 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
});

/** Scroll far enough that game cards are underneath the pinned title. */
async function scrollIntoCards(page: import("@playwright/test").Page) {
  // Same share-URL trick league-switcher-defaults.spec.ts uses: it skips the
  // first-run "Pick your leagues" modal, whose full-viewport z-50 scrim would
  // otherwise sit over the seam and make every probe meaningless.
  await page.goto("/?l=m&s=m.0.0&dd=t&dv=s", { waitUntil: "networkidle" });
  // The scoreboard hydrates async; the league title only mounts with data.
  await page.locator(".league-sticky-top").first().waitFor({ timeout: 30_000 });

  // Deliberately do NOT rely on the live slate to make the page scroll. The
  // real scoreboard is empty on a light day (and at 1pm ET on a summer
  // weekday it frequently is) — scrollHeight === innerHeight, the title never
  // pins, and every assertion below passes vacuously. A guard that quietly
  // stops guarding is worse than no guard.
  //
  // Instead, inject a tall, unmistakably-coloured block into the league
  // column so the column scrolls deterministically. The invariant under test
  // is about stacking and geometry, not about what the content IS: whatever
  // scrolls beneath the sticky title must never paint in the seam.
  await page.evaluate(() => {
    const title = document.querySelector(".league-sticky-top");
    const spacer = document.createElement("div");
    spacer.dataset.testid = "seam-probe-content";
    spacer.style.cssText = "height:3000px;background:magenta";
    title!.parentElement!.appendChild(spacer);
  });

  await page.waitForFunction(() => {
    const title = document.querySelector(".league-sticky-top");
    const header = document.querySelector("header");
    if (!title || !header) return false;
    if (title.getBoundingClientRect().top <= header.getBoundingClientRect().bottom + 1) return true;
    window.scrollBy(0, 400);
    return false;
  }, undefined, { timeout: 20_000, polling: 250 });
  await page.waitForTimeout(400);
}

/**
 * Overwrite --header-h on the element that owns it (HomeContent's root div),
 * simulating a measurement that has gone stale by `deltaPx`.
 */
async function skewHeaderVar(page: import("@playwright/test").Page, deltaPx: number) {
  await page.evaluate((delta) => {
    const owner = document.querySelector<HTMLElement>('[style*="--header-h"]');
    if (!owner) throw new Error("no element carries --header-h");
    const current = parseFloat(getComputedStyle(owner).getPropertyValue("--header-h"));
    owner.style.setProperty("--header-h", `${current + delta}px`);
  }, deltaPx);
  await page.waitForTimeout(300);
}

/**
 * Walk the band between the header's bottom edge and the league title's top
 * edge and report anything painted there that belongs to the scrolling
 * content. The seam cover and the header itself are the only legal hits.
 */
async function bleedThroughInGap(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const header = document.querySelector("header");
    const title = document.querySelector(".league-sticky-top");
    if (!header || !title) return { checked: 0, offenders: ["missing header or title"] };
    const hb = header.getBoundingClientRect().bottom;
    const tt = title.getBoundingClientRect().top;
    const offenders: string[] = [];
    let checked = 0;
    // elementFromPoint skips pointer-events:none nodes, and the seam cover is
    // pointer-events:none by design (it must never eat taps). Painting order is
    // governed by z-index, not pointer-events, so we flip it on purely for the
    // duration of the probe — that makes hit-testing agree with what the user
    // actually SEES, which is the thing under test.
    const cover = document.querySelector<HTMLElement>("[data-testid='sticky-seam-cover']");
    const restore = cover?.style.pointerEvents ?? "";
    if (cover) cover.style.pointerEvents = "auto";
    try {
    // Sample the whole band, not just its midpoint — a 1px seam is still a seam.
    for (let y = Math.ceil(hb) + 1; y < Math.floor(tt); y += 2) {
      for (const x of [
        window.innerWidth * 0.25,
        window.innerWidth * 0.5,
        window.innerWidth * 0.75,
      ]) {
        checked++;
        const el = document.elementFromPoint(x, y);
        if (!el) continue;
        const legal =
          el.closest("[data-testid='sticky-seam-cover']") ||
          el.closest("header") ||
          el.closest(".league-sticky-top");
        if (!legal) {
          offenders.push(`(${Math.round(x)},${y}) ${el.tagName}.${el.className}`.slice(0, 90));
        }
      }
    }
      return { checked, gap: +(tt - hb).toFixed(1), offenders: offenders.slice(0, 5) };
    } finally {
      if (cover) cover.style.pointerEvents = restore;
    }
  });
}

test("no content bleeds through when --header-h is stale-too-large", async ({ page }) => {
  await scrollIntoCards(page);
  // +40px is the realistic worst case: the inset collapsed from ~59 to ~20
  // between paints, leaving the old, taller measurement in place.
  await skewHeaderVar(page, 40);
  const result = await bleedThroughInGap(page);
  expect(result.gap, "the skew should actually open a gap, else the test proves nothing").toBeGreaterThan(10);
  expect(result.offenders, `scrolled content visible in the ${result.gap}px seam`).toEqual([]);
});

test("no content bleeds through when --header-h is stale-too-small", async ({ page }) => {
  await scrollIntoCards(page);
  await skewHeaderVar(page, -30);
  const result = await bleedThroughInGap(page);
  // Too-small can't open a gap (the header paints past the pin point), so
  // there's nothing to sample — the assertion is simply that nothing leaks.
  expect(result.offenders).toEqual([]);
});

/**
 * The OTHER half of the same race — and the one that shows up as "the first
 * game card has no top outline" (Jacob, repeatedly; single-column board).
 *
 * The seam tests above cover a stale --header-h opening a GAP above the title.
 * The mirror failure is the title being shoved DOWN onto the card below it:
 * `position: sticky` translates an element to its pin offset whenever that
 * offset sits below where the element naturally lands. While the app header
 * was in flow, content started at the header's REAL height while the title
 * pinned at the MEASURED --header-h, so any measurement lag translated the
 * title downward by the difference — and its opaque var(--bg) at z-30 painted
 * over the first card's 1px top border. The seam cover hides the gap that
 * would otherwise give it away, which is why it reads as a clipped card and
 * why three rounds of padding tweaks never made it stay fixed.
 *
 * The fix is structural: the header is `fixed` and .header-flow-spacer gives
 * back its flow space using the SAME --header-h expression, so content starts
 * exactly where the sticky rows pin. Displacement is then identically zero for
 * ANY value of --header-h. That is what this asserts — measured directly, with
 * no dependence on the live slate having games, by comparing the title's
 * rendered top against its own natural (static) top.
 */
/**
 * Hide anything in <main> that sits ABOVE the board — first-run notices, the
 * World Cup banner, the kickoff strip. Every one of them is dismissible and
 * Jacob's steady state has none showing, but while one IS showing it adds
 * ~90px of incidental headroom between the header and the league title. That
 * headroom absorbs the drift and makes the assertions below pass vacuously:
 * the title only gets shoved onto a card when its natural position is at (or
 * near) the header's bottom edge, which is the normal, banner-free layout.
 */
async function clearHeadroomAboveBoard(page: import("@playwright/test").Page) {
  await page.evaluate(() => {
    const board = document.querySelector(".league-sticky-top")?.closest("main > *");
    let sib = board?.previousElementSibling ?? null;
    while (sib) {
      (sib as HTMLElement).style.display = "none";
      sib = sib.previousElementSibling;
    }
  });
}

async function stickyDisplacement(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    window.scrollTo(0, 0);
    const title = document.querySelector<HTMLElement>(".league-sticky-top");
    if (!title) return null;
    const pinnedTop = title.getBoundingClientRect().top;
    // A sticky box keeps its flow slot, so flipping it static reveals exactly
    // where it WOULD sit without the pin — no reflow of anything around it.
    const prev = title.style.position;
    title.style.position = "static";
    const naturalTop = title.getBoundingClientRect().top;
    title.style.position = prev;
    return {
      displacement: +(pinnedTop - naturalTop).toFixed(1),
      pinnedTop: +pinnedTop.toFixed(1),
      naturalTop: +naturalTop.toFixed(1),
    };
  });
}

/** Load the board with the single-column ("II") layout already on. */
async function openSingleColumn(page: import("@playwright/test").Page) {
  // There is no share-URL param for singleColumn, so seed the prefs blob the
  // app reads on mount. The ?l=/?s= share params still merge on top of it,
  // which is what skips the first-run league picker.
  await page.addInitScript(() => {
    localStorage.setItem("nss-preferences", JSON.stringify({ singleColumn: true, leaguesOnboarded: true }));
  });
  await page.goto("/?l=m&s=m.0.0&dd=t&dv=s", { waitUntil: "networkidle" });
  await page.locator(".league-sticky-top").first().waitFor({ timeout: 30_000 });
}

for (const skew of [40, 80]) {
  test(`single column: the league title is never pushed onto the first card (--header-h +${skew}px)`, async ({ page }) => {
    await openSingleColumn(page);
    await clearHeadroomAboveBoard(page);
    const before = await stickyDisplacement(page);
    expect(before, "league title must be mounted").not.toBeNull();
    expect(before!.displacement, "title is displaced before the skew is even applied").toBeLessThan(1);
    // Guard against the guard going vacuous: with the banners hidden the title
    // must actually be sitting at the header's bottom edge, where a stale
    // --header-h can reach it. If layout ever grows new headroom here, this
    // fails loudly instead of quietly proving nothing.
    const headerH = await page.evaluate(() => document.querySelector("header")!.getBoundingClientRect().height);
    expect(
      before!.naturalTop - headerH,
      "no headroom left above the board, else a drift can never reach the title and this test proves nothing",
    ).toBeLessThan(skew);

    await skewHeaderVar(page, skew);
    const after = await stickyDisplacement(page);
    // Displacement > 0 means the title now overlaps whatever is under it —
    // in condense mode that is the first game card, top border first.
    expect(
      after!.displacement,
      `a ${skew}px stale --header-h shoved the league title ${after!.displacement}px down onto the card below it`,
    ).toBeLessThan(1);
  });
}

test("row layout: the league title is never pushed onto the first card", async ({ page }) => {
  await scrollIntoCards(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  await clearHeadroomAboveBoard(page);
  await skewHeaderVar(page, 40);
  const after = await stickyDisplacement(page);
  expect(after!.displacement).toBeLessThan(1);
});

test("the header flow spacer stands in for the fixed header at exactly --header-h", async ({ page }) => {
  await scrollIntoCards(page);
  const geom = await page.evaluate(() => {
    const spacer = document.querySelector("[data-testid='header-flow-spacer']");
    const header = document.querySelector("header");
    if (!spacer || !header) return null;
    const owner = document.querySelector<HTMLElement>('[style*="--header-h"]');
    return {
      spacerH: spacer.getBoundingClientRect().height,
      headerPosition: getComputedStyle(header).position,
      headerVar: parseFloat(getComputedStyle(owner!).getPropertyValue("--header-h")),
    };
  });
  expect(geom, "header flow spacer must be rendered").not.toBeNull();
  // If the header ever goes back to being in flow, the spacer double-counts and
  // this whole guarantee is off — fail loudly rather than drift.
  expect(geom!.headerPosition).toBe("fixed");
  expect(Math.abs(geom!.spacerH - geom!.headerVar)).toBeLessThan(1);
});

test("the seam cover exists and tracks the league title's pin offset", async ({ page }) => {
  await scrollIntoCards(page);
  const geom = await page.evaluate(() => {
    const cover = document.querySelector("[data-testid='sticky-seam-cover']");
    const title = document.querySelector(".league-sticky-top");
    if (!cover || !title) return null;
    const cr = cover.getBoundingClientRect();
    const tr = title.getBoundingClientRect();
    return { coverTop: cr.top, coverBottom: cr.bottom, titleTop: tr.top, opaque: getComputedStyle(cover).backgroundColor };
  });
  expect(geom, "seam cover must be rendered").not.toBeNull();
  expect(geom!.coverTop).toBe(0);
  // The cover's bottom edge runs just PAST where the sticky title pins (the
  // 2px --seam-overlap), so device-pixel rounding at a fractional zoom can
  // never open a row between them. Past by more than ~3px would start eating
  // the title itself.
  const overlap = geom!.coverBottom - geom!.titleTop;
  expect(overlap, "cover must reach past the title's pin line").toBeGreaterThanOrEqual(1);
  expect(overlap, "cover must not reach into the title text").toBeLessThan(3.5);
  expect(geom!.opaque).not.toContain("rgba(0, 0, 0, 0)");
});
