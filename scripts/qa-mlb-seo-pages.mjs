#!/usr/bin/env node
// Browser QA for the three MLB postseason search pages (/mlb-playoff-bracket,
// /mlb-playoff-picture, /mlb-wild-card-standings). What they promise is all
// runtime DOM state, so it is checked in a real Chromium rather than by grep:
// the page opens straight onto the playoff panel on the right tab and sort,
// the board (and so its first-run league picker) never mounts, the panel opens
// uncovered without touching the board's own cover, series winners wait behind
// one tap, and nothing overflows a phone.
//
//   npm run build && node scripts/qa-mlb-seo-pages.mjs      # the local build
//   node scripts/qa-mlb-seo-pages.mjs --url https://hidescore.com
//
// With no --url it serves ./out itself. Exits non-zero on any failed check.

import { chromium } from "playwright";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 8138;
const argv = process.argv.slice(2);
const liveUrl = argv.includes("--url") ? argv[argv.indexOf("--url") + 1].replace(/\/$/, "") : null;
const shotDir = argv.includes("--shots") ? argv[argv.indexOf("--shots") + 1] : null;

const checks = [];
const ok = (name, pass, detail = "") => {
  checks.push({ name, pass });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

const server = liveUrl
  ? null
  : spawn("python3", ["-m", "http.server", String(PORT), "--bind", "127.0.0.1"], {
      cwd: path.join(repo, "out"),
      stdio: "ignore",
    });
process.on("exit", () => { try { server?.kill(); } catch {} });
const base = liveUrl ?? `http://127.0.0.1:${PORT}`;
// python's http.server has no clean URLs; Cloudflare Pages does.
const urlFor = (route) => (liveUrl ? `${base}${route}?qa=${Date.now()}` : `${base}${route}.html`);
console.log(`target: ${base}`);
await new Promise((r) => setTimeout(r, 1200));

const PAGES = [
  { route: "/mlb-playoff-bracket", h1: "MLB playoff bracket 2026", tab: "bracket", faq: 8 },
  { route: "/mlb-playoff-picture", h1: "MLB playoff picture 2026", tab: "odds", sort: "playoff", faq: 7 },
  { route: "/mlb-wild-card-standings", h1: "MLB wild card standings 2026", tab: "odds", sort: "seed", faq: 6 },
];
const SIBLINGS = PAGES.map((p) => p.route);

const browser = await chromium.launch();

async function openFresh(route, viewport, seed = null, postseason = null) {
  const ctx = await browser.newContext({ viewport });
  if (seed) await ctx.addInitScript((kv) => { for (const [k, v] of Object.entries(kv)) localStorage.setItem(k, v); }, seed);
  // A stand-in for MLB's postseason feed, so a finished series can be tested
  // before any has been played.
  if (postseason) {
    await ctx.route("**/schedule/postseason/series**", (r) =>
      r.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(postseason) }));
  }
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log("  [page error]", e.message));
  await page.goto(urlFor(route), { waitUntil: "domcontentloaded" });
  // The panel has landed once either feed has answered.
  await page.waitForSelector("[data-picture-body], [data-picture-variant] [role=status]", { timeout: 20000 });
  await page.waitForSelector("[data-picture-body]", { timeout: 20000 }).catch(() => {});
  return { ctx, page };
}

for (const p of PAGES) {
  console.log(`\n── ${p.route}`);
  const { ctx, page } = await openFresh(p.route, { width: 1440, height: 1000 });

  const h1 = (await page.locator("h1").allInnerTexts()).map((s) => s.trim());
  ok(`${p.route} h1`, h1.length === 1 && h1[0] === p.h1, JSON.stringify(h1));

  const canonical = await page.locator('link[rel="canonical"]').getAttribute("href");
  ok(`${p.route} self canonical`, canonical === `https://hidescore.com${p.route}`, canonical ?? "none");

  ok(`${p.route} panel renders inline`, (await page.locator('[data-picture-variant="page"]').count()) === 1);
  ok(`${p.route} no dialog, no overlay`, (await page.locator('[role="dialog"], div.fixed.inset-0').count()) === 0);
  // HomeContent's <main id="main-content"> is the board; its absence is what
  // guarantees the first-run league picker cannot open here.
  ok(`${p.route} board not mounted (no league picker)`, (await page.locator("main#main-content").count()) === 0);

  const selected = await page.locator('[role="tab"][aria-selected="true"]').getAttribute("id");
  ok(`${p.route} opens on the ${p.tab} tab`, selected === `mlb-picture-tab-${p.tab}`, selected ?? "none");

  const body = page.locator("[data-picture-body]");
  const open = await body.evaluate((el) => !getComputedStyle(el).filter.includes("blur") && el.getAttribute("aria-hidden") !== "true");
  ok(`${p.route} opens uncovered`, open);
  ok(`${p.route} no cover button`, (await page.getByRole("button", { name: /Show the playoff picture/ }).count()) === 0);
  const wroteReveal = await page.evaluate(() => Object.keys(localStorage).some((k) => k.startsWith("mlb-playoff-picture-revealed-")));
  ok(`${p.route} leaves the board's cover alone`, !wroteReveal);

  if (p.tab === "bracket") {
    const seats = await page.locator("[data-bracket-team]").count();
    ok(`${p.route} bracket shows 12 seeded clubs`, seats === 12, `${seats}`);
    const channels = await page.locator("[data-bracket-channel]").count();
    ok(`${p.route} each round names its network`, channels === 7, `${channels}`);
  } else {
    const caption = (await page.locator("table caption").allInnerTexts()).join(" | ");
    const want = p.sort === "seed" ? "sorted by seed" : "sorted by playoffs";
    ok(`${p.route} table sort`, caption.toLowerCase().includes(want), caption);
    const byeLines = await page.getByText("bye · wild-card round below").count();
    ok(`${p.route} bye divider ${p.sort === "seed" ? "shown" : "absent"}`, p.sort === "seed" ? byeLines === 2 : byeLines === 0, `${byeLines}`);
  }

  const faq = await page.evaluate(() => {
    for (const s of document.querySelectorAll('script[type="application/ld+json"]')) {
      const g = JSON.parse(s.textContent || "{}")["@graph"] || [];
      const f = g.find((n) => n["@type"] === "FAQPage");
      if (f) return f.mainEntity.length;
    }
    return 0;
  });
  ok(`${p.route} FAQPage JSON-LD`, faq === p.faq, `${faq}`);

  const hrefs = await page.locator("a[href]").evaluateAll((as) => as.map((a) => a.getAttribute("href")));
  const missing = SIBLINGS.filter((r) => r !== p.route && !hrefs.includes(r));
  ok(`${p.route} links its two siblings`, missing.length === 0, missing.join(", "));

  if (shotDir) await page.screenshot({ path: path.join(shotDir, `${p.route.slice(1)}-1440.png`) });
  await ctx.close();

  // Phone: the tab strip is on the first screen and the page never scrolls sideways.
  const phone = await openFresh(p.route, { width: 390, height: 844 });
  const tabTop = await phone.page.locator('[role="tablist"]').evaluate((el) => el.getBoundingClientRect().top);
  ok(`${p.route} panel above the fold on a phone`, tabTop < 844 * 0.6, `tabs at ${Math.round(tabTop)}px`);
  await phone.page.waitForTimeout(300);
  const overflow = await phone.page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  ok(`${p.route} no sideways page scroll at 390px`, overflow <= 0, `${overflow}px`);
  if (shotDir) await phone.page.screenshot({ path: path.join(shotDir, `${p.route.slice(1)}-390.png`), fullPage: false });
  await phone.ctx.close();
}

// The page's tab and sort outrank what a visitor last left the modal on.
{
  const { ctx, page } = await openFresh("/mlb-playoff-bracket", { width: 1440, height: 1000 }, { "mlb-playoff-picture-tab": "odds" });
  const selected = await page.locator('[role="tab"][aria-selected="true"]').getAttribute("id");
  ok("stored tab=odds still opens /mlb-playoff-bracket on Bracket", selected === "mlb-picture-tab-bracket", selected ?? "none");
  await ctx.close();
}
{
  const { ctx, page } = await openFresh("/mlb-wild-card-standings", { width: 1440, height: 1000 }, { "mlb-playoff-picture-sort": "playoff:desc" });
  const caption = (await page.locator("table caption").first().innerText()).toLowerCase();
  ok("stored sort=playoff still opens /mlb-wild-card-standings by seed", caption.includes("sorted by seed"), caption);
  await ctx.close();
}

// Series results. Read the AL 3 and 6 seeds off the bracket's own logos, then
// serve a postseason feed in which the 6 seed has swept that wild-card series.
{
  const first = await openFresh("/mlb-playoff-bracket", { width: 1440, height: 1000 });
  const ids = await first.page.locator("[data-bracket-team] img").evaluateAll((imgs) =>
    imgs.slice(0, 2).map((i) => Number(/team-logos\/(\d+)/.exec(i.getAttribute("src") || "")?.[1])));
  await first.ctx.close();
  const [three, six] = ids;
  const game = (pk) => ({
    gamePk: pk, gameType: "F", gameDate: "2026-09-29T20:00:00Z", officialDate: "2026-09-29", gamesInSeries: 3,
    status: { abstractGameState: "Final" },
    teams: { home: { team: { id: three }, isWinner: false }, away: { team: { id: six }, isWinner: true } },
  });
  const feed = { series: [{ series: { id: "F_1" }, games: [game(1), game(2)] }] };
  const { ctx, page } = await openFresh("/mlb-playoff-bracket", { width: 1440, height: 1000 }, null, feed);
  const toggle = page.locator("[data-bracket-results-toggle]");
  await toggle.waitFor({ timeout: 15000 }).catch(() => {});
  ok("a finished series puts a Show series results button up", (await toggle.count()) === 1, `AL 3/6 ids ${three}/${six}`);
  ok("its winner stays hidden until then", (await page.locator("[data-bracket-outcome], [data-bracket-advanced]").count()) === 0);
  await toggle.click();
  const won = await page.locator('[data-bracket-outcome="won"]').count();
  const lost = await page.locator('[data-bracket-outcome="lost"]').count();
  ok("after the tap the series shows one winner and one loser", won === 1 && lost === 1, `${won} won, ${lost} lost`);
  const moved = await page.locator("[data-bracket-advanced] img").evaluateAll((imgs) => imgs.map((i) => i.getAttribute("src")));
  ok("the winner moves into the Division Series seat", moved.length === 1 && moved[0].includes(`/${six}.svg`), JSON.stringify(moved));
  ok("the twelve seeded seats are still twelve", (await page.locator("[data-bracket-team]").count()) === 12);
  await page.getByRole("tab", { name: "Picks" }).click();
  await page.waitForFunction(() => !document.body.innerText.includes("Loading picks"), null, { timeout: 15000 }).catch(() => {});
  const pickButtons = await page.locator('button[aria-label*="to win the"]').count();
  ok("the Picks tab still opens off the shared feed", pickButtons > 0, `${pickButtons} pick buttons`);
  await ctx.close();
}

await browser.close();
const failed = checks.filter((c) => !c.pass);
console.log(`\n${checks.length - failed.length}/${checks.length} passed`);
process.exit(failed.length ? 1 : 0);
