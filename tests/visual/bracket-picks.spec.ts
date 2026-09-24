import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// The Picks tab of the MLB playoff picture, driven through the real click path:
// MLB column → "Playoff picture ▸" → the picture's own cover → Picks.
//
// StatsAPI is stubbed so the bracket is fixed: the standings put the 2025 field
// in its real 2025 seeds, and the postseason feed is either 2026's as it stood
// on 9/23 (every game TBD → lock at noon ET on 9/29) or 2025's finished one
// (locked, every series decided). ESPN odds are stubbed empty. /api/picks is
// the worker route, which `next dev` does not serve, so it is stubbed too.

test.describe.configure({ mode: "serial" });

const fx = (y: number) => readFileSync(join(__dirname, "..", "fixtures", `mlb-postseason-${y}.json`), "utf8");

type Row = [number, string, string, number, number, boolean?];
// [id, name, abbrev, wins, losses, divisionLeader]
const DIVISIONS: Record<number, Row[]> = {
  201: [[141, "Toronto Blue Jays", "TOR", 94, 68, true], [147, "New York Yankees", "NYY", 94, 68], [111, "Boston Red Sox", "BOS", 89, 73]],
  202: [[114, "Cleveland Guardians", "CLE", 88, 74, true], [116, "Detroit Tigers", "DET", 87, 75]],
  200: [[136, "Seattle Mariners", "SEA", 90, 72, true]],
  205: [[158, "Milwaukee Brewers", "MIL", 97, 65, true], [112, "Chicago Cubs", "CHC", 92, 70], [113, "Cincinnati Reds", "CIN", 83, 79]],
  204: [[143, "Philadelphia Phillies", "PHI", 96, 66, true]],
  203: [[119, "Los Angeles Dodgers", "LAD", 93, 69, true], [135, "San Diego Padres", "SD", 90, 72]],
};
const standings = {
  records: Object.entries(DIVISIONS).map(([id, rows]) => ({
    division: { id: Number(id) },
    lastUpdated: "2026-09-25T04:00:00Z",
    teamRecords: rows.map(([tid, name, abbreviation, wins, losses, leader]) => ({
      team: { id: tid, name, abbreviation },
      wins, losses,
      winningPercentage: (wins / (wins + losses)).toFixed(3).replace(/^0/, ""),
      divisionLeader: !!leader,
      clinched: true,
      eliminationNumber: "-",
      wildCardEliminationNumber: "-",
    })),
  })),
};

// What happened in 2025, series by series.
const PERFECT = {
  "AL:wc-a": "116", "AL:wc-b": "147", "NL:wc-a": "119", "NL:wc-b": "112",
  "AL:ds-a": "136", "AL:ds-b": "141", "NL:ds-a": "119", "NL:ds-b": "158",
  "AL:cs": "141", "NL:cs": "119", ws: "119",
};
const CLE_RUN = { ...PERFECT, "AL:wc-a": "114", "AL:ds-a": "114", "AL:cs": "114", ws: "114" };
const ORDER = ["AL:wc-a", "AL:wc-b", "NL:wc-a", "NL:wc-b", "AL:ds-a", "AL:ds-b", "NL:ds-a", "NL:ds-b", "AL:cs", "NL:cs", "ws"];

async function stub(page: Page, postseasonYear: number, picksApi: (method: string, body: string | null) => { status: number; json: unknown }) {
  await page.route("**/statsapi.mlb.com/api/v1/standings**", (r) => r.fulfill({ json: standings }));
  await page.route("**/statsapi.mlb.com/api/v1/schedule/postseason/series**", (r) =>
    r.fulfill({ body: fx(postseasonYear), contentType: "application/json" }));
  await page.route("**/site.web.api.espn.com/apis/v2/sports/baseball/mlb/standings**", (r) => r.fulfill({ json: {} }));
  await page.route("**/api/picks**", (r) => {
    const { status, json } = picksApi(r.request().method(), r.request().postData());
    return r.fulfill({ status, json });
  });
}

// `revealed`: the picture's cover is remembered per season, so a reload opens
// straight onto the tab.
async function openPicks(page: Page, revealed = false) {
  await page.goto("/?l=m&s=m.0.0&dd=t&dv=s");
  await page.getByRole("button", { name: /Playoff picture/ }).first().click({ timeout: 20_000 });
  const dialog = page.getByRole("dialog", { name: "MLB playoff picture" });
  await dialog.getByRole("tab", { name: "Picks" }).click();
  if (!revealed) {
    // The Picks tab sits behind the picture's own cover, like the other two.
    await expect(dialog.locator("[data-picture-body]")).toHaveAttribute("aria-hidden", "true");
    await dialog.getByRole("button", { name: /Show the playoff picture/ }).click();
  }
  await expect(dialog.locator("[data-picks]")).toBeVisible();
  return dialog;
}

for (const vp of [
  { name: "desktop", width: 1280, height: 800, scheme: "light" as const },
  { name: "phone", width: 360, height: 780, scheme: "dark" as const },
]) {
  test(`${vp.name}: pick every series before the lock, name it, submit`, async ({ page }) => {
    await page.setViewportSize(vp);
    await page.emulateMedia({ colorScheme: vp.scheme });
    await page.clock.setFixedTime(new Date("2026-09-25T12:00:00-04:00"));
    const posts: string[] = [];
    await stub(page, 2026, (method, body) => {
      if (method === "POST") { posts.push(body ?? ""); return { status: 200, json: { ok: true } }; }
      return { status: 200, json: { board: "mlb-2026", locked: false, count: posts.length, names: posts.length ? ["Jacob"] : [] } };
    });
    const dialog = await openPicks(page);

    await expect(dialog.locator("[data-prize]")).toHaveText("🏆 Perfect bracket OR first place: Jacob grants one wish (within reason).");
    await expect(dialog.getByText(/Wild Card 1 · Division Series 2 · LCS 4 · World Series 8 \(max 28\)/)).toBeVisible();
    await expect(dialog.locator("[data-lock-line]")).toContainText("Tue, Sep 29");

    const submit = dialog.getByRole("button", { name: "Submit picks" });
    await expect(submit).toBeDisabled();
    for (const key of ORDER) {
      const seat = dialog.locator(`[data-pick-card="${key}"] button[data-pick-seat]`).first();
      await seat.scrollIntoViewIfNeeded();
      await seat.click();
      await expect(seat).toHaveAttribute("aria-pressed", "true");
    }
    await expect(dialog.getByText("11 of 11 picked · add your name")).toBeVisible();
    await expect(dialog.locator("[data-pick-champion]")).not.toContainText("Your champion");

    // The name field takes letters and says so when it gets anything else.
    const name = dialog.getByLabel("Your name or initials");
    await name.fill("<b>");
    await expect(dialog.getByText("Letters, numbers, spaces and . ' - only.")).toBeVisible();
    await expect(submit).toBeDisabled();
    await name.fill("Jacob");
    await submit.click();
    await expect(dialog.getByText("Submitted. You can change your picks until they lock.")).toBeVisible();
    expect(posts).toHaveLength(1);
    const sent = JSON.parse(posts[0]);
    expect(sent.board).toBe("mlb-2026");
    expect(sent.name).toBe("Jacob");
    expect(Object.keys(sent.picks)).toHaveLength(11);
    expect(sent.token).toMatch(/^[A-Za-z0-9_-]{16,64}$/);

    await page.screenshot({ path: `test-results/picks-${vp.name}-${vp.scheme}.png`, fullPage: false });

    // Leaderboard before the lock: names only.
    await dialog.getByRole("button", { name: "Leaderboard" }).click();
    await expect(dialog.getByText("Brackets and scores show here once picks lock.")).toBeVisible();

    // The draft survives a reload.
    const again = await openPicks(page, true);
    await expect(again.getByRole("button", { name: "Update picks" })).toBeVisible();
    await expect(again.locator("[data-pick-seat][aria-pressed=true]")).toHaveCount(11);
  });
}

test("a seed that moved since submitting clears those picks and says so", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-09-25T12:00:00-04:00"));
  await stub(page, 2026, () => ({ status: 503, json: { disabled: true } }));
  // Submitted when BOS, not DET, was the 6 seed.
  const stale = { ...PERFECT, "AL:wc-a": "111", "AL:ds-a": "111" };
  await page.addInitScript((v) => {
    localStorage.setItem("picks-mlb-2026", JSON.stringify({ name: "Jacob", draft: v, sent: { name: "Jacob", picks: v, at: "2026-09-24T00:00:00Z" }, posted: true }));
  }, stale);
  const dialog = await openPicks(page);
  await expect(dialog.getByRole("alert")).toHaveText("The seeds moved since you submitted: 2 picks cleared. Re-pick and submit again.");
  await expect(dialog.locator("[data-pick-seat][aria-pressed=true]")).toHaveCount(9);
});

test("after the lock: results sit behind their own cover, then score and rank", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.clock.setFixedTime(new Date("2026-10-30T12:00:00-04:00"));
  await stub(page, 2025, () => ({
    status: 200,
    json: { board: "mlb-2026", locked: true, count: 2, entries: [{ name: "Jacob", picks: PERFECT }, { name: "Madina", picks: CLE_RUN }] },
  }));
  await page.addInitScript((v) => {
    localStorage.setItem("picks-mlb-2026", JSON.stringify({ name: "Jacob", draft: v, sent: { name: "Jacob", picks: v, at: "2026-09-28T00:00:00Z" }, posted: true }));
  }, PERFECT);
  const dialog = await openPicks(page);

  await expect(dialog.locator("[data-lock-line]")).toContainText("Picks locked");
  await expect(dialog.getByLabel("Your name or initials")).toHaveCount(0);
  // No marks and a covered score until the reader asks.
  await expect(dialog.locator("[data-pick-mark]")).toHaveCount(0);
  await expect(dialog.locator("[data-results-body]")).toHaveAttribute("aria-hidden", "true");
  await page.screenshot({ path: "test-results/picks-locked-covered.png" });
  await dialog.getByRole("button", { name: /Show results/ }).click();
  await expect(dialog.locator("[data-my-score]")).toContainText("28 of 28 possible so far (100%)");
  await expect(dialog.locator("[data-my-score]")).toContainText("perfect bracket");
  await expect(dialog.locator('[data-pick-mark="correct"]')).toHaveCount(11);

  await dialog.getByRole("button", { name: "Leaderboard" }).click();
  const rows = dialog.locator("[data-board-row]");
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText("Jacob");
  await expect(rows.nth(0)).toContainText("100%");
  await expect(rows.nth(0)).toContainText("LAD");
  await expect(rows.nth(1)).toContainText("Madina");
  await expect(rows.nth(1)).toContainText("CLE");
  await page.screenshot({ path: "test-results/picks-leaderboard.png" });

  // A series that finishes after the reveal covers everything again.
  await page.evaluate(() => localStorage.setItem("picks-results-seen-mlb-2026", "10"));
  const again = await openPicks(page, true);
  await again.getByRole("button", { name: "Leaderboard" }).click();
  await expect(again.getByRole("button", { name: /Show results/ })).toBeVisible();
});
