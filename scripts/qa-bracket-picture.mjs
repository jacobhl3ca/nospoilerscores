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
// Something the board legitimately isn't showing today. Logged, never counted.
const skip = (name, detail = "") => console.log(`SKIP  ${name}${detail ? ` — ${detail}` : ""}`);

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

const PICTURE = '[role="dialog"][aria-label="MLB playoff picture"]';

// The cover is on the tab panel, so both tabs share it. Reading the computed
// filter is the only proof that the blur is actually applied.
async function coverState(page) {
  return page.evaluate((sel) => {
    const body = document.querySelector(`${sel} [data-picture-body]`);
    if (!body) return null;
    const cs = getComputedStyle(body);
    return {
      blur: cs.filter,
      hidden: body.getAttribute("aria-hidden"),
      events: cs.pointerEvents,
      text: body.innerText.slice(0, 60),
      rows: body.innerText.split("\n").filter(Boolean).length,
    };
  }, PICTURE);
}

// Data rows only: the seed dividers and the "+N more" line are single-cell rows.
async function columnValues(page, n) {
  return page.evaluate(({ sel, n }) => {
    const t = document.querySelector(`${sel} table`);
    if (!t) return [];
    return [...t.querySelectorAll("tbody tr")]
      .filter((r) => r.cells.length === 6)
      .map((r) => r.cells[n].innerText.trim());
  }, { sel: PICTURE, n });
}

const statusColumn = (page) => columnValues(page, 5);

// The sort runs on ESPN's raw value; the cell prints a clamped label, so ">99%"
// is a club sitting on a raw 100 and "<1%" one sitting on a raw 0.0-something.
// Reading the label back has to undo that clamp or the monotonicity check calls
// a correct sort broken.
const pct = (v) => {
  const s = String(v).trim();
  if (s.startsWith(">")) return 100;
  if (s.startsWith("<")) return 0;
  const n = parseFloat(s.replace("%", ""));
  return Number.isFinite(n) ? n : null;
};

function isSorted(vals, dir) {
  const nums = vals.filter((v) => v !== null);
  // A club with no number published belongs at the end in BOTH directions.
  if (vals.slice(nums.length).some((v) => v !== null)) return false;
  for (let i = 1; i < nums.length; i++) {
    if (dir === "desc" ? nums[i] > nums[i - 1] : nums[i] < nums[i - 1]) return false;
  }
  return nums.length > 0;
}

// How many clubs per league are still alive by MLB's own numbers. Exactly six
// seats exist, so any league with more than six alive must be showing a chase.
async function liveChasers() {
  const season = new Date().getUTCFullYear();
  const out = { AL: 0, NL: 0 };
  try {
    const r = await fetch(`https://statsapi.mlb.com/api/v1/standings?leagueId=103,104&season=${season}&standingsTypes=byDivision&hydrate=team`);
    const d = await r.json();
    const LEAGUE = { 200: "AL", 201: "AL", 202: "AL", 203: "NL", 204: "NL", 205: "NL" };
    const isE = (v) => String(v ?? "").trim().toUpperCase() === "E";
    for (const rec of d.records ?? []) {
      const key = LEAGUE[rec.division?.id];
      if (!key) continue;
      for (const t of rec.teamRecords ?? []) {
        if (!(isE(t.eliminationNumber) && isE(t.wildCardEliminationNumber))) out[key]++;
      }
    }
  } catch {
    /* zeros: the check then asks for nothing rather than failing on a feed blip */
  }
  return out;
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
  // The Slams run Jan–Sep. Out of season there is no tennis column to open, and
  // that is the board working, not a regression — so it is skipped, not failed.
  if (hasTennis) ok("tennis column exposes a tappable round subtitle", true, await roundSubtitle.innerText());
  else skip("tennis bracket checks", "no tennis column on the board — no Slam in progress");

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

    const state = await coverState(page);
    ok("playoff picture loads", state !== null, state ? state.text.replace(/\n/g, " / ") : "no panel");
    if (state) {
      ok("playoff picture starts blurred", state.blur.includes("blur"), state.blur);
      ok("playoff picture is hidden from assistive tech while covered", state.hidden === "true");
      ok("playoff picture is untappable while covered", state.events === "none");
    }

    // Two tabs, and BOTH of them sit behind the one cover — switching views is
    // not a way around the spoiler gate.
    const tabs = dialog.locator('[role="tab"]');
    const tabNames = await tabs.allInnerTexts();
    ok("the picture has an Odds and a Bracket tab", tabNames.length === 2 && /odds/i.test(tabNames[0]) && /bracket/i.test(tabNames[1]), tabNames.join(" | "));
    await tabs.nth(1).click();
    await page.waitForTimeout(300);
    const coveredBracket = await coverState(page);
    ok("the bracket tab starts covered too", !!coveredBracket && coveredBracket.blur.includes("blur") && coveredBracket.hidden === "true",
      JSON.stringify(coveredBracket && { blur: coveredBracket.blur, hidden: coveredBracket.hidden }));
    await tabs.nth(0).click();
    await page.waitForTimeout(300);

    await dialog.getByRole("button", { name: /Show the playoff picture/i }).click();
    await page.waitForTimeout(400);
    const revealed = await coverState(page);
    ok("tapping reveals the playoff picture", revealed?.blur === "none" && revealed?.hidden === null, JSON.stringify(revealed && { blur: revealed.blur, hidden: revealed.hidden }));
    ok("both leagues render their six seeds", (revealed?.rows ?? 0) >= 12, `${revealed?.rows} lines`);

    // The numbers on a row are chances, never the W-L record; games back is
    // opt-in behind its own toggle, off by default.
    const gridText = await dialog.locator("[data-picture-body]").innerText();
    ok("no W-L record on any row", !/\b\d{2,3}-\d{2,3}\b/.test(gridText));
    const oddsCount = (gridText.match(/(?:>|<)?\d{1,3}%/g) ?? []).length;
    ok("rows carry a playoff-odds percentage", oddsCount >= 8, `${oddsCount} percentages`);

    // "Clinched" on its own reads as "clinched the division" to half the people
    // who see it, and that is wrong for a club that only has a berth.
    const statuses = await statusColumn(page);
    ok("no status reads a bare \"Clinched\"", statuses.every((s) => s !== "Clinched"),
      statuses.filter((s) => /Clinch/.test(s)).join(" | ") || "none clinched yet");

    ok("games back is hidden by default", !/\b(back|up)\b|In the mix/.test(gridText));
    const gbToggle = dialog.getByLabel("Show games back");
    ok("games-back toggle present and off", (await gbToggle.count()) === 1 && !(await gbToggle.isChecked()));
    await gbToggle.check();
    await page.waitForTimeout(300);
    const withGb = await dialog.locator("[data-picture-body]").innerText();
    ok("games-back toggle shows the chase", /\d+\.\d (back|up)/.test(withGb));
    await gbToggle.uncheck();
    ok("magic-number key sits in the dialog header", (await dialog.locator("text=/Magic N/").count()) === 1);

    // ── Sorting ─────────────────────────────────────────────────────────────
    // The panel opens on the odds, best chance first. Seed is one click away.
    const alTable = dialog.locator("table").first();
    const openOrder = (await columnValues(page, 2)).map(pct);
    ok("the panel opens on the odds, best chance first", isSorted(openOrder, "desc"), openOrder.join(" "));
    ok("the opening header says so", (await dialog.locator('th[aria-sort="descending"]').count()) >= 1);

    // An odds sort drops the seed dividers — they mark seed boundaries, which
    // mean nothing in a probability order. The opening view is an odds sort.
    ok("an odds sort is one flat list", !/still alive|wild-card round below/i.test(await dialog.locator("[data-picture-body]").innerText()));

    await alTable.getByRole("button", { name: /Playoffs/ }).click();
    await page.waitForTimeout(250);
    const asc = (await columnValues(page, 2)).map(pct);
    ok("clicking Playoffs flips it", isSorted(asc, "asc"), asc.join(" "));
    ok("the flipped header says so", (await dialog.locator('th[aria-sort="ascending"]').count()) >= 1);

    await alTable.getByRole("button", { name: /Playoffs/ }).click();
    await page.waitForTimeout(250);
    const desc = (await columnValues(page, 2)).map(pct);
    ok("clicking Playoffs again puts the best chance back on top", isSorted(desc, "desc"), desc.join(" "));

    // Seed is the view that carries the dividers and the chase section, so the
    // "Still alive" checks below run in it.
    await alTable.getByRole("button", { name: /Seed/ }).click();
    await page.waitForTimeout(250);
    const seedOrder = await columnValues(page, 0);
    ok("clicking Seed returns the seeded picture", seedOrder.slice(0, 6).join(",") === "1,2,3,4,5,6", seedOrder.join(","));

    // ── Still alive ─────────────────────────────────────────────────────────
    // A club out of its division can still be chasing a wild card. MLB
    // publishes two elimination numbers and only both of them saying "E" means
    // out — so ask the feed how many NL clubs are alive and expect the panel to
    // show a chase whenever more than six are.
    const aliveByLeague = await liveChasers();
    for (const [i, key] of ["AL", "NL"].entries()) {
      const table = dialog.locator("table").nth(i);
      const text = (await table.innerText()).toLowerCase();
      const expect = aliveByLeague[key] > 6;
      ok(`${key} shows "Still alive" when the feed has a live chaser`,
        !expect || text.includes("still alive"),
        `${aliveByLeague[key]} clubs alive${expect ? ", chase expected" : ", none outside the six"}`);
      // Every live club gets a row. The list was once cut at five with a
      // "+N more" line that could not be opened.
      const pctRows = await table.locator("tbody tr").filter({ hasText: "%" }).count();
      ok(`${key} lists every club still alive`,
        pctRows === aliveByLeague[key] && !text.includes("more still alive"),
        `${pctRows} rows for ${aliveByLeague[key]} alive`);
    }

    // ── The sort survives a reload ──────────────────────────────────────────
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(6000);
    await clearOverlays();
    await page.getByRole("button", { name: "Playoff picture", exact: true }).first().click();
    await dialog.waitFor({ timeout: 15000 });
    await page.waitForTimeout(5000);
    // The panel's own default is the odds, so finding seed order after a reload
    // is unambiguous proof the stored preference won.
    const keptSort = await dialog.locator("table").first().locator("th").first().getAttribute("aria-sort");
    ok("the sort is remembered across a reload", keptSort === "ascending", `seed header: ${keptSort}`);

    // ── Bracket tab ─────────────────────────────────────────────────────────
    await dialog.locator('[role="tab"]').nth(1).click();
    await page.waitForTimeout(400);
    const bracket = await dialog.evaluate(() => {
      const body = document.querySelector('[role="dialog"][aria-label="MLB playoff picture"] [data-picture-body]');
      if (!body) return null;
      return {
        teams: body.querySelectorAll("[data-bracket-team]").length,
        slots: body.querySelectorAll("[data-bracket-slot]").length,
        channels: [...body.querySelectorAll("[data-bracket-channel]")].map((n) => n.textContent.trim()),
        images: [...body.querySelectorAll("img")].map((n) => n.getAttribute("src") ?? ""),
        // A chaser is a club still after a seat somebody else holds today. It
        // rides INSIDE that seat's card, so its nearest [data-bracket-team]
        // ancestor's card is the one it belongs to.
        chasers: [...body.querySelectorAll("[data-bracket-chaser]")].map((n) => n.innerText.replace(/\s+/g, " ").trim()),
        // A seat's own line: abbreviation then the odds pill. Every one of the
        // twelve must carry a percentage or a clinch tick, never a bare name.
        seatLines: [...body.querySelectorAll("[data-bracket-team]")].map((n) => n.innerText.replace(/\s+/g, " ").trim()),
        // The shading is the point of the "same conditional format" ask: a
        // painted pill has a real background, an unpainted one does not.
        shaded: [...body.querySelectorAll("[data-bracket-team] span[class*='tabular-nums']")]
          .filter((n) => {
            const bg = getComputedStyle(n).backgroundColor;
            return bg && bg !== "transparent" && !/rgba\(0, 0, 0, 0\)/.test(bg);
          }).length,
        // Wide-and-short, not a grid of squares. The old layout stacked two
        // near-square tiles per matchup; a seat is now a row, so the narrowest
        // of the twelve is still several times wider than it is tall.
        seatRatio: (() => {
          const boxes = [...body.querySelectorAll("[data-bracket-team]")].map((n) => n.getBoundingClientRect());
          if (!boxes.length) return null;
          return Math.min(...boxes.map((b) => b.width / Math.max(b.height, 1)));
        })(),
        text: body.innerText,
      };
    });
    ok("bracket tab renders", bracket !== null);
    if (bracket) {
      ok("the bracket shows all twelve seeded clubs", bracket.teams === 12, `${bracket.teams} team tiles`);
      ok("every later seat is still empty", bracket.slots >= 6, `${bracket.slots} empty slots`);
      ok("every round carries a channel line as text", bracket.channels.length >= 6, bracket.channels.join(" | "));
      // Team logos only: no round marks, no network logos, no sponsor art.
      ok("the only images in the bracket are team logos",
        bracket.images.length > 0 && bracket.images.every((s) => s.includes("mlbstatic.com/team-logos/")),
        bracket.images.find((s) => !s.includes("mlbstatic.com/team-logos/")) ?? `${bracket.images.length} logos`);
      // Round names are TEXT, never a round logo — so they must be readable in
      // the panel's own text. innerText returns them CSS-uppercased.
      const bracketText = bracket.text.toLowerCase();
      ok("the bracket names every round in text", ["AL Wild Card", "ALDS", "ALCS", "NL Wild Card", "NLDS", "NLCS", "World Series"]
        .every((r) => bracketText.includes(r.toLowerCase())), bracket.text.split("\n").slice(0, 4).join(" / "));
      ok("the bracket says it is a snapshot", /If the season ended today/i.test(bracket.text));
      // Same conditional format as the odds table: a percentage on every seat,
      // shaded by its own number.
      ok("every seated club carries an odds or a clinch mark",
        bracket.seatLines.length === 12 && bracket.seatLines.every((l) => /%|✓/.test(l)),
        bracket.seatLines.find((l) => !/%|✓/.test(l)) ?? `${bracket.seatLines.length} lines`);
      ok("the seat percentages are shaded, not flat text", bracket.shaded > 0, `${bracket.shaded} shaded pills`);
      // Chasers are optional by September's end — once every seat is clinched
      // there is nobody left to list, and that is the correct empty state.
      ok("any chaser shown names a club and its odds",
        bracket.chasers.every((c) => /[A-Z]{2,3}/.test(c) && /%/.test(c)),
        bracket.chasers.join(" | ") || "no live chasers");
      ok("a chaser is only ever listed under a seat", !/Chasing this spot/.test(bracket.text) || bracket.chasers.length > 0);
      ok("a seat is a row, not a square tile",
        bracket.seatRatio !== null && bracket.seatRatio > 2.5, `narrowest seat ratio ${bracket.seatRatio?.toFixed(2)}`);
    }

    const updated = dialog.locator("p", { hasText: /^Updated / });
    const placed = await updated.evaluate((el) => {
      const dlg = el.closest('[role="dialog"]');
      const a = el.getBoundingClientRect(), b = dlg.getBoundingClientRect();
      return { fromRight: Math.round(b.right - a.right), fromBottom: Math.round(b.bottom - a.bottom) };
    }).catch(() => null);
    ok("updated-at sits bottom right", !!placed && placed.fromRight < 40 && placed.fromBottom < 40, JSON.stringify(placed));
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
