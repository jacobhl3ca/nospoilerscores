#!/usr/bin/env node
// Screenshot sweep + acceptance read-back for the MLB playoff picture.
//
//   npm run build && node scripts/shots-playoff-picture.mjs
//
// Captures both tabs, both themes, desktop and 390px, writes them to
// ~/hidescore-playoff-picture/ with one index page, and asserts the facts the
// panel is supposed to be showing today (who is still alive, what each clinched
// club actually clinched). Exits non-zero if any of those reads back wrong.

import { chromium } from "playwright";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 8139;
const outDir = path.join(os.homedir(), "hidescore-playoff-picture");
fs.mkdirSync(outDir, { recursive: true });

const server = spawn("python3", ["-m", "http.server", String(PORT), "--bind", "127.0.0.1"], {
  cwd: path.join(repo, "out"),
  stdio: "ignore",
});
const stop = () => { try { server.kill(); } catch {} };
process.on("exit", stop);
await new Promise((r) => setTimeout(r, 1200));

const base = `http://127.0.0.1:${PORT}/`;
const season = new Date().getUTCFullYear();
const DIALOG = '[role="dialog"][aria-label="MLB playoff picture"]';
const failures = [];
const shots = [];

const browser = await chromium.launch();

async function open(theme, width, height) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2 });
  // Seed the panel's own state before the first paint: the theme the page boots
  // into, and the reveal, so the cover is not what gets photographed.
  await ctx.addInitScript(([theme, season]) => {
    try {
      localStorage.setItem("nss-preferences", JSON.stringify({ theme }));
      localStorage.setItem(`mlb-playoff-picture-revealed-${season}`, "1");
      localStorage.removeItem("mlb-playoff-picture-sort");
      localStorage.removeItem("mlb-playoff-picture-tab");
    } catch {}
  }, [theme, season]);
  const page = await ctx.newPage();
  await page.goto(base, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(6000);
  for (let i = 0; i < 5; i++) {
    const overlay = page.locator("div.fixed.inset-0.z-50").first();
    if (!(await overlay.count())) break;
    const dismiss = overlay.getByRole("button", { name: /got it|start|continue|^ok$|skip|close|no thanks|maybe later|dismiss/i }).first();
    if (await dismiss.count()) await dismiss.click({ force: true }).catch(() => {});
    else await page.keyboard.press("Escape").catch(() => {});
    await page.waitForTimeout(700);
  }
  await page.getByRole("button", { name: "Playoff picture", exact: true }).first().click();
  await page.locator(DIALOG).waitFor({ timeout: 15000 });
  await page.waitForTimeout(5500); // statsapi + espn
  return { ctx, page };
}

async function shoot(page, name) {
  const file = path.join(outDir, `${name}.png`);
  await page.locator(DIALOG).screenshot({ path: file });
  shots.push({ name, file: path.basename(file) });
  console.log(`shot  ${name}`);
}

try {
  for (const theme of ["light", "dark"]) {
    for (const [label, w, h] of [["desktop", 1440, 1000], ["phone", 390, 844]]) {
      const { ctx, page } = await open(theme, w, h);
      await shoot(page, `${theme}-${label}-odds`);
      await page.locator(`${DIALOG} [role="tab"]`).nth(1).click();
      await page.waitForTimeout(500);
      await shoot(page, `${theme}-${label}-bracket`);

      // Acceptance read-back, once, on the widest light run (all six columns
      // are rendered there).
      if (theme === "light" && label === "desktop") {
        await page.locator(`${DIALOG} [role="tab"]`).nth(0).click();
        await page.waitForTimeout(400);
        const rows = await page.evaluate((sel) => {
          const out = [];
          for (const t of document.querySelectorAll(`${sel} table`)) {
            for (const r of t.querySelectorAll("tbody tr")) {
              if (r.cells.length !== 6) continue;
              out.push({ seed: r.cells[0].innerText.trim(), team: r.cells[1].innerText.trim(), status: r.cells[5].innerText.trim() });
            }
          }
          return out;
        }, DIALOG);
        const by = (frag) => rows.find((r) => r.team.includes(frag));
        const expectStatus = (frag, want) => {
          const r = by(frag);
          if (!r) failures.push(`${frag} is not on the board at all`);
          else if (r.status !== want) failures.push(`${frag} reads "${r.status}", expected "${want}"`);
          else console.log(`ok    ${frag} → ${r.status}`);
        };
        const expectPresent = (frag) => {
          const r = by(frag);
          if (!r) failures.push(`${frag} is missing from the picture`);
          else console.log(`ok    ${frag} present (seed ${r.seed})`);
        };
        expectPresent("Blue Jays");   // AL East eliminated, wild card alive
        expectPresent("Orioles");
        expectPresent("Diamondbacks"); // the NL's only live chaser
        expectStatus("Yankees", "Clinched berth");
        expectStatus("Brewers", "Clinched division");
        expectStatus("Dodgers", "Clinched division");
        console.log(`      ${rows.length} rows read`);
      }
      await ctx.close();
    }
  }

  const html = `<!doctype html>
<meta charset="utf-8">
<title>HideScore — MLB playoff picture, ${new Date().toISOString().slice(0, 10)}</title>
<style>
  body { font: 14px/1.5 -apple-system, system-ui, sans-serif; margin: 24px; background: #fafafa; color: #111; }
  h1 { font-size: 18px; margin: 0 0 4px; }
  p.sub { color: #666; margin: 0 0 24px; }
  section { margin: 0 0 28px; }
  h2 { font-size: 13px; text-transform: uppercase; letter-spacing: .04em; color: #666; margin: 0 0 8px; }
  img { max-width: 100%; border: 1px solid #ddd; border-radius: 10px; background: #fff; display: block; }
</style>
<h1>MLB playoff picture — Odds tab and Bracket tab</h1>
<p class="sub">Both themes, desktop (1440px) and phone (390px). Captured ${new Date().toLocaleString("en-US")}.</p>
${shots.map((s) => `<section><h2>${s.name.replace(/-/g, " · ")}</h2><img src="${s.file}" alt="${s.name}"></section>`).join("\n")}
`;
  fs.writeFileSync(path.join(outDir, "index.html"), html);
  console.log(`\npage: ${path.join(outDir, "index.html")}`);
} catch (e) {
  failures.push(`run threw: ${e.message}`);
} finally {
  await browser.close();
  stop();
}

if (failures.length) {
  console.log(`\n${failures.length} acceptance check(s) failed:`);
  for (const f of failures) console.log(`  FAIL  ${f}`);
  process.exit(1);
}
console.log("\nall acceptance read-backs passed");
