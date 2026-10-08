#!/usr/bin/env node
// Browser QA for /nfl-playoff-picture and /nfl-standings (2026-10-07). Same
// harness as qa-mlb-seo-pages.mjs: the panel is runtime DOM, so it is checked
// in a real browser. What is pinned: 14 seeds (7 AFC + 7 NFC), 8 division
// tables, 2 conference brackets, no points column and no score-like text on
// the bracket, the "Follow a team" grid, and no sideways overflow on a phone.
//
//   npm run build && node scripts/qa-nfl-seo-pages.mjs      # the local build
//   node scripts/qa-nfl-seo-pages.mjs --url https://hidescore.com
//   … --engine webkit   (Playwright WebKit; run on the mini, see pw-webkit-mini.sh)

import { chromium, webkit } from "playwright";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 8139;
const argv = process.argv.slice(2);
const arg = (k) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : null);
const liveUrl = arg("--url")?.replace(/\/$/, "") ?? null;
const engine = arg("--engine") === "webkit" ? webkit : chromium;

const checks = [];
const ok = (name, pass, detail = "") => {
  checks.push({ name, pass });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

const server = liveUrl
  ? null
  : spawn("python3", ["-m", "http.server", String(PORT), "--bind", "127.0.0.1"], { cwd: path.join(repo, "out"), stdio: "ignore" });
process.on("exit", () => { try { server?.kill(); } catch {} });
const base = liveUrl ?? `http://127.0.0.1:${PORT}`;
const urlFor = (route) => (liveUrl ? `${base}${route}?qa=${Date.now()}` : `${base}${route}.html`);
console.log(`target: ${base}`);
await new Promise((r) => setTimeout(r, 1200));

const PAGES = [
  { route: "/nfl-playoff-picture", h1: "NFL playoff picture 2026", tab: "seeds", faq: 7 },
  { route: "/nfl-standings", h1: "NFL standings 2026", tab: "divisions", faq: 6 },
];

const browser = await engine.launch();

async function open(route, viewport) {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(urlFor(route), { waitUntil: "domcontentloaded" });
  await page.waitForSelector("[data-nfl-body], [data-nfl-panel] [role=status]", { timeout: 20000 });
  await page.waitForSelector("[data-nfl-body]", { timeout: 20000 }).catch(() => {});
  return { ctx, page, errors };
}

for (const p of PAGES) {
  console.log(`\n── ${p.route}`);
  const { ctx, page, errors } = await open(p.route, { width: 1440, height: 1000 });

  const h1 = (await page.locator("h1").allInnerTexts()).map((s) => s.trim());
  ok(`${p.route} h1`, h1.length === 1 && h1[0] === p.h1, JSON.stringify(h1));
  const canonical = await page.locator('link[rel="canonical"]').getAttribute("href");
  ok(`${p.route} self canonical`, canonical === `https://hidescore.com${p.route}`, canonical ?? "none");
  const title = await page.title();
  ok(`${p.route} title`, /HideScore$/.test(title) && title.toLowerCase().includes(p.route.includes("standings") ? "standings" : "playoff picture"), title);

  const selected = await page.locator('[role=tab][aria-selected=true]').getAttribute("id");
  ok(`${p.route} opens on ${p.tab}`, selected === `nfl-picture-tab-${p.tab}`, selected ?? "none");

  await page.click("#nfl-picture-tab-seeds");
  const seeds = await page.locator("[data-nfl-seed]").evaluateAll((els) => els.map((e) => e.getAttribute("data-nfl-seed")));
  ok(`${p.route} 14 seeds`, seeds.length === 14 && seeds.join(",") === "1,2,3,4,5,6,7,1,2,3,4,5,6,7", seeds.join(","));
  const heads = (await page.locator("[data-nfl-body] th").allInnerTexts()).join("|");
  ok(`${p.route} no points column`, !/\b(PF|PA|Pts|Diff|Points)\b/i.test(heads), heads);

  await page.click("#nfl-picture-tab-divisions");
  const divs = await page.locator("[data-nfl-division]").count();
  const divTeams = await page.locator("[data-nfl-division-team]").count();
  ok(`${p.route} 8 divisions / 32 teams`, divs === 8 && divTeams === 32, `${divs} / ${divTeams}`);

  await page.click("#nfl-picture-tab-bracket");
  const brackets = await page.locator("[data-nfl-bracket]").count();
  const bracketTeams = await page.locator("[data-nfl-bracket-team]").count();
  ok(`${p.route} 2 brackets, 14 seated (6 pairs + 1 seed each)`, brackets === 2 && bracketTeams === 14, `${brackets} / ${bracketTeams}`);
  const bracketText = await page.locator("[data-nfl-body]").innerText();
  ok(`${p.route} bracket has no score-like text`, !/\b\d{1,2}\s*[-–]\s*\d{1,2}\b/.test(bracketText.replace(/(Jan|Feb) \d+ – \d+/g, "")), "");
  const dates = await page.locator("[data-nfl-bracket-dates]").count();
  ok(`${p.route} round dates shown`, dates >= 7, String(dates));

  const faq = await page.evaluate(() => {
    for (const s of document.querySelectorAll('script[type="application/ld+json"]')) {
      const g = JSON.parse(s.textContent || "{}")["@graph"] ?? [];
      const f = g.find((n) => n["@type"] === "FAQPage");
      if (f) return f.mainEntity.length;
    }
    return 0;
  });
  ok(`${p.route} FAQPage JSON-LD`, faq === p.faq, String(faq));

  const teamLinks = await page.locator('a[href^="/teams/nfl/"]').count();
  ok(`${p.route} Follow a team grid`, teamLinks >= 32, String(teamLinks));
  ok(`${p.route} no page errors`, errors.length === 0, errors.join(" | "));
  await ctx.close();

  const phone = await open(p.route, { width: 390, height: 844 });
  const overflow = await phone.page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  ok(`${p.route} no sideways overflow at 390`, overflow <= 1, String(overflow));
  await phone.ctx.close();
}

await browser.close();
const failed = checks.filter((c) => !c.pass);
console.log(`\n${checks.length - failed.length}/${checks.length} passed`);
process.exit(failed.length ? 1 : 0);
