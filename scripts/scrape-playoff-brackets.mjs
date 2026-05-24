// Scrape official league playoff bracket pages into PNG screenshots, hosted
// statically at /brackets/{sport}-{year}.png. The bracket modal in the UI
// loads these as-is, so the scraper is the only place that knows about the
// official sites and their selectors.
//
// Why screenshots: the NBA / NHL / MLB / NFL bracket pages render their
// brackets as live React components, not static images. There is no public
// API or static SVG to fetch. Wikipedia builds brackets as HTML tables, so
// scraping a single image from there doesn't work either.
//
// Why Playwright (Python): playwright is already installed system-wide at
// /opt/homebrew/bin/playwright as a Python script. Spawning the Python
// runner from this Node entrypoint keeps the scraper invocation consistent
// with the rest of scripts/*.mjs while letting us reuse the working
// Playwright install without another npm dep.
//
// On a per-sport scrape failure we keep the previously-saved PNG so the UI
// keeps rendering the last-known bracket — never blanks a live feature.

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const OUT_DIR = resolve("public/brackets");
const META_PATH = resolve("public/brackets/manifest.json");
const PY = "/opt/homebrew/opt/python@3.13/bin/python3.13";

// Per-sport bracket source. Different sites won the format/scraper tradeoff:
//   NBA: Wikipedia (NBA.com bracket page triggers an HTTP/2 fingerprint
//        block in headless chromium). Wikipedia has multiple .brk tables on
//        the same page (play-in vs main playoffs); pickLargest=true picks
//        the biggest one by area, which is reliably the main bracket.
//   NHL: NHL.com directly — renders the whole season bracket as one clean
//        dark-theme React widget. Wikipedia builds NHL brackets out of
//        many collapsible per-series tables (no single element to grab).
//   MLB: Wikipedia (out-of-season most of the year; UI just won't surface
//        the bracket trigger when the manifest entry's missing).
//   NFL: Wikipedia (same out-of-season story as MLB).
const SOURCES = {
  nba: {
    url: "https://en.wikipedia.org/wiki/2026_NBA_playoffs",
    // NBA Wikipedia builds the main bracket from floating divs after the
    // #Bracket heading, not a single <table>. clipFromHeading captures the
    // bounding rect from that heading down to the next h2/h3.
    clipFromHeading: "Bracket",
  },
  nhl: {
    url: "https://www.nhl.com/playoffs/2026/bracket",
    // NHL.com renders a clean dark-theme bracket React widget. The .brk
    // table selector misses, so we fall back to a full-page screenshot —
    // hideSelectors below strips the nav/ads/cookie chrome before clicking.
    selector: "[data-testid='bracket'], .bracket, section[class*='bracket']",
    hideSelectors: "header, [class*='Header_'], [class*='Promo'], [class*='Advertisement'], [class*='ad-'], [id*='ad-'], iframe, [class*='Subnav'], [class*='SubNav'], .cookie-banner, [class*='CookieBanner'], [class*='cookie-banner'], [class*='Cookie'], [id*='cookie'], [id*='consent'], [class*='consent'], [class*='Consent'], #onetrust-banner-sdk, #onetrust-consent-sdk, .osano-cm-window, [aria-label*='cookie' i], [aria-label*='consent' i]",
  },
  mlb: {
    url: "https://en.wikipedia.org/wiki/2025_Major_League_Baseball_postseason",
    clipFromHeading: "Playoff_bracket",
  },
  nfl: {
    url: "https://en.wikipedia.org/wiki/2025%E2%80%9326_NFL_playoffs",
    clipFromHeading: "Bracket",
  },
};

const PY_RUNNER = `
import sys, json
from playwright.sync_api import sync_playwright

sources = json.loads(sys.argv[1])
out_dir = sys.argv[2]

UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"

results = {}
with sync_playwright() as p:
    # NBA / NFL block plain headless connections — channel="chrome" uses the
    # real installed Chrome binary, which carries fewer fingerprint giveaways
    # than bundled chromium. Falls back to chromium if no Chrome installed.
    try:
        browser = p.chromium.launch(headless=True, channel="chrome")
    except Exception:
        browser = p.chromium.launch(headless=True)
    for sport, src in sources.items():
        # Per-sport fresh context so a network error on one site doesn't
        # leave the next goto navigating from an error page.
        ctx = browser.new_context(
            viewport={"width": 1600, "height": 1200},
            device_scale_factor=2,
            user_agent=UA,
            extra_http_headers={"accept-language": "en-US,en;q=0.9"},
        )
        page = ctx.new_page()
        try:
            page.goto(src["url"], wait_until="domcontentloaded", timeout=45000)
            wait_sel = src.get("selector")
            if wait_sel:
                try:
                    page.wait_for_selector(wait_sel, timeout=10000)
                except Exception:
                    pass
            page.wait_for_timeout(3000)
            # Strip page chrome (nav, ads, cookie banners) before screenshot.
            # Doing this via display:none in JS rather than --block-ads keeps
            # the bracket itself intact.
            if src.get("hideSelectors"):
                try:
                    page.evaluate(
                        "(sel) => document.querySelectorAll(sel).forEach(el => el.style.display='none')",
                        src["hideSelectors"],
                    )
                    page.wait_for_timeout(300)
                except Exception:
                    pass
            path = f"{out_dir}/{sport}-2026.png"
            try:
                if src.get("clipFromHeading"):
                    # Compute the screen rect from a #heading anchor down to
                    # the next h2/h3, then screenshot just that clip. Used
                    # for pages where the bracket is rendered as a region
                    # of floating divs with no single wrapping element.
                    rect = page.evaluate(
                        """(headingId) => {
                          const anchor = document.getElementById(headingId);
                          if (!anchor) return null;
                          // Walk up to the heading element itself (h2/h3/h4).
                          let header = anchor.closest('.mw-heading, h2, h3, h4') || anchor.parentElement;
                          if (!header) return null;
                          // Find next sibling heading at same-or-higher level.
                          let next = header.nextElementSibling;
                          while (next && !next.matches('.mw-heading2, .mw-heading3, h2, h3')) {
                            next = next.nextElementSibling;
                          }
                          const start = header.getBoundingClientRect();
                          const end = next ? next.getBoundingClientRect() : null;
                          window.scrollTo(0, window.scrollY + start.top - 20);
                          const rs = header.getBoundingClientRect();
                          const re = next ? next.getBoundingClientRect() : { top: rs.top + 4000 };
                          // Include left siblings: bracket spans full content width.
                          const content = document.getElementById('mw-content-text') || document.body;
                          const c = content.getBoundingClientRect();
                          return {
                            x: Math.max(0, c.left),
                            y: Math.max(0, rs.top),
                            width: Math.min(c.width, window.innerWidth - Math.max(0, c.left)),
                            height: Math.max(100, re.top - rs.top),
                          };
                        }""",
                        src["clipFromHeading"],
                    )
                    if not rect:
                        raise Exception(f"heading id={src['clipFromHeading']} not found")
                    page.screenshot(path=path, clip=rect)
                    results[sport] = {"ok": True, "path": path, "mode": "clip", "size": [rect["width"], rect["height"]]}
                elif src.get("selector"):
                    loc = page.locator(src["selector"])
                    count = loc.count()
                    if count == 0:
                        raise Exception("selector matched zero elements")
                    target_idx = 0
                    if src.get("pickLargest") and count > 1:
                        biggest_area = 0
                        for i in range(count):
                            box = loc.nth(i).bounding_box()
                            if not box:
                                continue
                            area = box["width"] * box["height"]
                            if area > biggest_area:
                                biggest_area = area
                                target_idx = i
                    el = loc.nth(target_idx)
                    el.scroll_into_view_if_needed(timeout=5000)
                    el.screenshot(path=path)
                    box = el.bounding_box() or {}
                    results[sport] = {"ok": True, "path": path, "mode": "selector", "size": [box.get("width"), box.get("height")]}
                else:
                    raise Exception("no selector or clipFromHeading configured")
            except Exception as e:
                # Full-page fallback so a selector miss still saves SOMETHING
                # — better to ship a less-clean image than to blank the
                # bracket entirely. The manifest entry still gets written.
                page.screenshot(path=path, full_page=False)
                results[sport] = {"ok": True, "path": path, "fallback": "full-page", "selector_error": str(e)}
        except Exception as e:
            results[sport] = {"ok": False, "error": str(e)}
        finally:
            ctx.close()
    browser.close()

print(json.dumps(results))
`;

async function main() {
  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

  const res = spawnSync(PY, ["-c", PY_RUNNER, JSON.stringify(SOURCES), OUT_DIR], {
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
  });

  if (res.status !== 0) {
    console.error("Python runner exited", res.status);
    if (res.stderr) console.error(res.stderr);
    process.exit(1);
  }

  let parsed;
  try {
    parsed = JSON.parse(res.stdout.trim().split("\n").pop());
  } catch {
    console.error("Could not parse runner output");
    console.error(res.stdout);
    process.exit(1);
  }

  const generatedAt = new Date().toISOString();
  const successes = {};
  for (const [sport, result] of Object.entries(parsed)) {
    if (result.ok) {
      successes[sport] = { year: 2026, generatedAt };
      console.log(`  ${sport}: ok${result.fallback ? ` (fallback: ${result.fallback})` : ""}`);
    } else {
      console.warn(`  ${sport}: FAILED — ${result.error}`);
    }
  }

  // Manifest is what the UI reads to decide which brackets exist. Per-sport
  // entries persist across runs so a single failing scrape doesn't drop a
  // sport from the UI; we just rewrite the ones that succeeded.
  let prevManifest = {};
  if (existsSync(META_PATH)) {
    try {
      prevManifest = JSON.parse(
        require("node:fs").readFileSync(META_PATH, "utf8"),
      ).sports ?? {};
    } catch {}
  }
  const merged = { ...prevManifest, ...successes };
  writeFileSync(
    META_PATH,
    JSON.stringify({ generatedAt, sports: merged }, null, 2) + "\n",
  );
  console.log(`Wrote manifest with ${Object.keys(merged).length} sports`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
