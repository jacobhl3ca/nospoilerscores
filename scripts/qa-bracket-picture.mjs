#!/usr/bin/env node
// Live browser QA for the two spoiler-gated panels: the Grand Slam bracket and
// the MLB playoff picture. Drives the real static export in Chromium, because
// the things worth checking here — that the blur is actually applied, that the
// covered content is hidden from assistive tech, that tapping reveals it — are
// all runtime DOM state that a bundle grep cannot prove.
//
//   npm run build && node scripts/qa-bracket-picture.mjs      # the local build
//   node scripts/qa-bracket-picture.mjs --url https://hidescore.com
//
// With no --url it serves ./out itself. Exits non-zero on any failed check.

import { chromium } from "playwright";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 8137;
const argv = process.argv.slice(2);
// Pointing this at production is how a deploy gets proven: a 200 from the CDN
// is not evidence the new code is on the page, but these checks are.
const liveUrl = argv.includes("--url") ? argv[argv.indexOf("--url") + 1] : null;
const checks = [];
const ok = (name, pass, detail = "") => {
  checks.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

const server = liveUrl
  ? null
  : spawn("python3", ["-m", "http.server", String(PORT), "--bind", "127.0.0.1"], {
      cwd: path.join(repo, "out"),
      stdio: "ignore",
    });
const stop = () => { try { server?.kill(); } catch {} };
process.on("exit", stop);

const baseUrl = liveUrl ?? `http://127.0.0.1:${PORT}/`;
console.log(`target: ${baseUrl}`);
await new Promise((r) => setTimeout(r, 1200));

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.on("pageerror", (e) => console.log("  [page error]", e.message));

// The board raises its own full-screen overlays (the first-run explainer, the
// season-kickoff banner), some of them only after the first fetches land. They
// swallow every click underneath, so clear them before each board interaction —
// dismissing once on load is not enough.
async function clearOverlays() {
  for (let i = 0; i < 5; i++) {
    const overlay = page.locator("div.fixed.inset-0.z-50").first();
    if (!(await overlay.count())) return;
    const labels = await overlay.locator("button").allInnerTexts().catch(() => []);
    console.log("dismissing overlay:", JSON.stringify(labels.slice(0, 6)));
    const dismiss = overlay.getByRole("button", { name: /got it|start|continue|^ok$|skip|close|no thanks|maybe later|dismiss/i }).first();
    // Escape before any blind click: the league picker is one of these overlays,
    // and clicking its last button would toggle a column off rather than
    // dismiss it.
    if (await dismiss.count()) await dismiss.click({ force: true }).catch(() => {});
    else await page.keyboard.press("Escape").catch(() => {});
    await page.waitForTimeout(800);
  }
}

try {
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(6000); // let the ESPN fetches land
  await clearOverlays();

  const headers = await page.locator("h2, h3").allInnerTexts().catch(() => []);
  console.log("columns on the board:", headers.filter(Boolean).slice(0, 12).join(" | "));

  // ── Grand Slam bracket ────────────────────────────────────────────────────
  const roundSubtitle = page.locator("button", { hasText: /^(Quarterfinal|Semifinal|Final|Round \d|QF|SF|R\d)/ }).first();
  const hasTennis = (await roundSubtitle.count()) > 0;
  ok("tennis column exposes a tappable round subtitle", hasTennis,
    hasTennis ? await roundSubtitle.innerText() : "no tennis column on the board");

  if (hasTennis) {
    await clearOverlays();
    await roundSubtitle.click();
    const dialog = page.locator('[role="dialog"][aria-label*="bracket" i]');
    await dialog.waitFor({ timeout: 15000 });
    ok("bracket dialog opens", true, (await dialog.getAttribute("aria-label")) ?? "");

    await page.waitForTimeout(6000); // ESPN draw fetch
    const title = await dialog.locator("h2").innerText();
    ok("bracket names the live tournament", /US Open|Wimbledon|Aus Open|French Open/.test(title), title);

    const rounds = dialog.locator('[role="group"] > div > div');
    const roundCount = await rounds.count();
    ok("bracket renders round columns", roundCount >= 3, `${roundCount} columns`);

    // Every covered round must be blurred AND hidden from assistive tech.
    const covered = dialog.locator('button[aria-label^="Show the"]');
    const coveredCount = await covered.count();
    ok("later rounds start covered", coveredCount > 0, `${coveredCount} covered`);

    const blurState = await dialog.evaluate(() => {
      const out = [];
      for (const btn of document.querySelectorAll('button[aria-label^="Show the"]')) {
        const body = btn.parentElement?.querySelector("div");
        if (!body) continue;
        out.push({
          blur: getComputedStyle(body).filter,
          hidden: body.getAttribute("aria-hidden"),
          events: getComputedStyle(body).pointerEvents,
        });
      }
      return out;
    });
    ok("covered rounds are blurred", blurState.length > 0 && blurState.every((b) => b.blur.includes("blur")),
      JSON.stringify(blurState[0] ?? {}));
    ok("covered rounds are hidden from assistive tech", blurState.every((b) => b.hidden === "true"));
    ok("covered rounds are untappable", blurState.every((b) => b.events === "none"));

    // A first-round column is the published draw and must NOT be covered.
    const fullDraw = dialog.getByRole("button", { name: /full draw/i });
    if (await fullDraw.count()) {
      await fullDraw.click();
      await page.waitForTimeout(500);
      const r1Covered = await dialog.evaluate(() => {
        const cols = [...document.querySelectorAll('[role="group"] > div > div')];
        const first = cols[0];
        return !!first?.querySelector('button[aria-label^="Show the"]');
      });
      ok("round 1 (the published draw) is never covered", r1Covered === false);
      // The same control, now relabelled — clicking `fullDraw` again would miss.
      await dialog.getByRole("button", { name: /last rounds only/i }).click();
      await page.waitForTimeout(300);
    }

    const before = await dialog.locator('button[aria-label^="Show the"]').count();
    await dialog.locator('button[aria-label^="Show the"]').first().click();
    await page.waitForTimeout(400);
    const after = await dialog.locator('button[aria-label^="Show the"]').count();
    ok("tapping a covered round reveals it", after === before - 1, `${before} → ${after}`);

    const names = await dialog.locator('[role="group"]').innerText();
    ok("revealed round shows matchups, never a score", !/\d+\s*[-–]\s*\d+/.test(names.replace(/\b\d{1,2}\s*[-–]\s*\d{1,2}\b(?=\s*(?:back|up))/g, "")));

    await page.keyboard.press("Escape");
    await page.waitForTimeout(400);
    ok("Escape closes the bracket", (await page.locator('[role="dialog"][aria-label*="bracket" i]').count()) === 0);
  }

  // ── MLB playoff picture ───────────────────────────────────────────────────
  await clearOverlays();
  const promo = page.getByRole("button", { name: "Playoff picture", exact: true }).first();
  const hasPromo = (await promo.count()) > 0;
  ok("MLB column exposes the playoff-picture promo", hasPromo);

  if (hasPromo) {
    await promo.click();
    const dialog = page.locator('[role="dialog"][aria-label="MLB playoff picture"]');
    await dialog.waitFor({ timeout: 15000 });
    await page.waitForTimeout(5000); // statsapi fetch

    const body = dialog.locator("h2 ~ div > div").first();
    const state = await dialog.evaluate(() => {
      const grid = document.querySelector('[role="dialog"][aria-label="MLB playoff picture"] .grid');
      if (!grid) return null;
      const cs = getComputedStyle(grid);
      return { blur: cs.filter, hidden: grid.getAttribute("aria-hidden"), events: cs.pointerEvents, text: grid.innerText.slice(0, 60) };
    });
    ok("playoff picture loads", state !== null, state ? `${state.text.replace(/\n/g, " / ")}` : "no grid");
    if (state) {
      ok("playoff picture starts blurred", state.blur.includes("blur"), state.blur);
      ok("playoff picture is hidden from assistive tech while covered", state.hidden === "true");
      ok("playoff picture is untappable while covered", state.events === "none");
    }

    await dialog.getByRole("button", { name: /Show the playoff picture/i }).click();
    await page.waitForTimeout(400);
    const revealed = await dialog.evaluate(() => {
      const grid = document.querySelector('[role="dialog"][aria-label="MLB playoff picture"] .grid');
      return grid ? { blur: getComputedStyle(grid).filter, hidden: grid.getAttribute("aria-hidden"), rows: grid.innerText.split("\n").filter(Boolean).length } : null;
    });
    ok("tapping reveals the playoff picture", revealed?.blur === "none" && revealed?.hidden === null, JSON.stringify(revealed));
    ok("both leagues render their six seeds", (revealed?.rows ?? 0) >= 12, `${revealed?.rows} lines`);
    void body;
  }
} catch (e) {
  ok("run completed without throwing", false, e.message);
} finally {
  await browser.close();
  stop();
}

const failed = checks.filter((c) => !c.pass);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length ? 1 : 0);
