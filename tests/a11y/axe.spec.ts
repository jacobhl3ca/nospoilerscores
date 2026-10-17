import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

/**
 * Automatic accessibility check (axe-core) on HideScore's four main surfaces:
 *
 *   home    /                                the score board (MLB column)
 *   news    /                                the News tab (landing view "news")
 *   league  /nfl-highlights-without-spoilers  a league landing page
 *   game    /  → a game card → details sheet  the game modal (dialog only)
 *
 * each in light and dark colour scheme at 390 px and 1280 px wide: 16 scans.
 *
 * It fails ONLY on a serious or critical violation that is not in
 * tests/a11y/baseline.json. The baseline is today's debt, keyed by
 * rule + page + variant + a stable target key (see targetKeys()), so a new
 * problem fails the PR while the known ones get fixed at their own pace.
 * Moderate/minor findings never fail; WCAG 2.0/2.1/2.2 A and AA rules only.
 *
 * Run:                 npm run a11y          (builds, serves out/, scans)
 * Regenerate baseline: npm run a11y:update   (A11Y_UPDATE_BASELINE=1)
 *   Update rewrites each scanned page+variant's entries from this run, so a
 *   fixed violation drops out and a new one is accepted. Commit the JSON diff
 *   only for a violation you mean to accept; the diff is the review record.
 *
 * Offline and stable: the clock is fixed, and EVERY request is answered here.
 * Same-origin static files come from out/; /api/* and /auth/* get a 404; the
 * news feed and the ESPN scoreboard get the fixtures below; images get a 1x1
 * PNG; any other third-party request gets an empty 404. Fixture games are all
 * upcoming (no score, no result), and the headlines are neutral.
 */

const BASELINE_PATH = join(__dirname, "baseline.json");
const UPDATE = !!process.env.A11Y_UPDATE_BASELINE;
const FAILING_IMPACTS = new Set(["serious", "critical"]);
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

type Entry = { rule: string; page: string; variant: string; target: string };
const keyOf = (e: Entry) => `${e.rule}|${e.page}|${e.variant}|${e.target}`;

function readBaseline(): Entry[] {
  try {
    return JSON.parse(readFileSync(BASELINE_PATH, "utf8")).violations as Entry[];
  } catch {
    return [];
  }
}

// A stable key per flagged node. axe's own selector is NOT stable: it is a
// chain of Tailwind classes picked for uniqueness, so it changes when a
// class is added anywhere nearby, and even differs by viewport for the same
// element. The key is built from what names the element instead: its tag plus
// the first identifying attribute (data-testid, a non-generated id, data-tab,
// aria-label, title, href path, …), else its first 40 characters of text with
// digits folded to "#". An element with neither is keyed by the nearest
// ancestor that has one, plus its own tag. Two nodes with the same key count
// once: the key says "this element on this page", which is what a reviewer
// accepts or rejects.
async function targetKeys(page: Page, selectors: string[]): Promise<string[]> {
  return page.evaluate((sels) => {
    const ATTRS = ["data-testid", "id", "data-tab", "aria-label", "title", "name", "href", "data-date", "role"];
    const named = (el: Element): string | null => {
      const tag = el.tagName.toLowerCase();
      for (const a of ATTRS) {
        let v = el.getAttribute(a);
        if (!v) continue;
        if (a === "id" && /[«»:]|^r[0-9a-z]+$/i.test(v)) continue; // React useId
        if (a === "href") v = v.replace(/^https?:\/\/[^/]+/, "").split("?")[0] || "/";
        return `${tag}[${a}="${v}"]`;
      }
      const text = (el.textContent ?? "").replace(/\s+/g, " ").trim().replace(/\d/g, "#").slice(0, 40);
      return text ? `${tag}"${text}"` : null;
    };
    return sels.map((sel) => {
      const el = document.querySelector(sel);
      if (!el) return sel;
      const own = named(el);
      if (own) return own;
      for (let up = el.parentElement; up; up = up.parentElement) {
        const n = named(up);
        if (n) return `${n} ${el.tagName.toLowerCase()}`;
      }
      return el.tagName.toLowerCase();
    });
  }, selectors);
}

// ---------- fixtures ----------

const NOW = new Date("2026-10-07T18:00:00-04:00");
const DAY = "20261007";

function upcoming(id: string, away: [string, string, string], home: [string, string, string], time: string) {
  const team = ([tid, name, abbr]: [string, string, string]) =>
    ({ id: tid, displayName: name, shortDisplayName: name, abbreviation: abbr, logo: "", color: "666666" });
  const detail = `10/7 - ${time} PM EDT`;
  return {
    id,
    date: "2026-10-07T23:08Z",
    name: `${away[1]} at ${home[1]}`,
    shortName: `${away[2]} @ ${home[2]}`,
    season: { type: 2, year: 2026 },
    status: {
      displayClock: "0:00",
      period: 0,
      type: { name: "STATUS_SCHEDULED", state: "pre", detail, shortDetail: detail, completed: false },
    },
    links: [],
    competitions: [{
      date: "2026-10-07T23:08Z",
      competitors: [
        { homeAway: "home", team: team(home) },
        { homeAway: "away", team: team(away) },
      ],
      broadcasts: [],
      headlines: [],
      notes: [],
    }],
  };
}

const BOARDS: Record<string, unknown[]> = {
  "baseball/mlb": [
    upcoming("401999001", ["21", "Mets", "NYM"], ["22", "Phillies", "PHI"], "7:08"),
    upcoming("401999002", ["10", "Yankees", "NYY"], ["2", "Red Sox", "BOS"], "8:08"),
  ],
};
const GAME_CARD = "Mets at Phillies — game details";

const PUBLISHED = NOW.toISOString();
const post = (id: string, headline: string, extra: Record<string, unknown> = {}) => ({
  id, headline, description: "", published: PUBLISHED, imageUrl: null, byline: "u/fixture", section: "r/nfl",
  articleUrl: `https://www.reddit.com/r/nfl/comments/${id}/`, ...extra,
});
const NEWS = [
  post("a1", "Practice report: who was limited on Wednesday", { body: "Notes from the open session." }),
  post("a2", "Photo: the new stadium roof from the upper deck", { imageUrl: "https://i.redd.it/a11y-a2.png", imageFullUrl: "https://i.redd.it/a11y-a2.png" }),
  post("a3", "Film study: the zone blitz package", { body: "A look at the scheme." }),
];

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAAAAAA6fptVAAAACklEQVR4nGNgAAAAAgABSK+kcQAAAABJRU5ErkJggg==",
  "base64",
);

const PREFS = {
  favoriteLeagues: [], favoriteTeams: [], theme: "system",
  showRatings: false, skipExplainer: true, skipNewsExplainer: true,
  leaguesOnboarded: true, switcherDefaultsVersion: 2,
  firstLeague: "mlb", secondLeague: "empty", thirdLeague: "empty", fourthLeague: "empty", fifthLeague: "empty",
  hiddenLeagues: ["best"], defaultDateMode: "today",
};

async function stubNetwork(page: Page, prefs: Record<string, unknown>) {
  await page.clock.setFixedTime(NOW);
  await page.addInitScript((p) => localStorage.setItem("nss-preferences", JSON.stringify(p)), prefs);
  const origin = new URL(test.info().project.use.baseURL ?? "http://localhost:3100").origin;
  await page.context().route("**/*", (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const json = (body: unknown, status = 200) =>
      route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

    if (url.pathname.startsWith("/news/") && url.pathname.endsWith(".json")) {
      return url.pathname.endsWith("highlights.json") ? json({ games: {} }) : json({ items: NEWS });
    }
    const board = /\/apis\/site\/v2\/sports\/(.+)\/scoreboard$/.exec(url.pathname);
    if (board) {
      const events = (url.searchParams.get("dates") ?? DAY).startsWith(DAY) ? (BOARDS[board[1]] ?? []) : [];
      return json({ events });
    }
    if (url.origin === origin) {
      if (/^\/(api|auth)\//.test(url.pathname)) return json({ error: "stubbed" }, 404);
      return route.fallback();
    }
    if (req.resourceType() === "image" || /\.(png|jpe?g|webp|gif)(\?|$)/.test(url.pathname)) {
      return route.fulfill({ status: 200, contentType: "image/png", body: PNG });
    }
    if (url.pathname.endsWith(".json") || url.hostname.includes("espn")) return json({});
    return route.fulfill({ status: 404, contentType: "text/plain", body: "" });
  });
}

// ---------- pages ----------

type Target = { page: string; open: (page: Page) => Promise<string | undefined> };

const PAGES: Target[] = [
  {
    page: "home",
    open: async (page) => {
      await stubNetwork(page, { ...PREFS, showNews: false, defaultLandingView: "scores" });
      await page.goto("/");
      await expect(page.getByRole("button", { name: GAME_CARD, exact: true })).toBeVisible({ timeout: 30_000 });
      return undefined;
    },
  },
  {
    page: "news",
    open: async (page) => {
      await stubNetwork(page, { ...PREFS, favoriteLeagues: ["nfl"], showNews: true, defaultLandingView: "news" });
      await page.goto("/");
      await expect(page.locator('button[aria-label="Open post"]').first()).toBeVisible({ timeout: 30_000 });
      return undefined;
    },
  },
  {
    page: "league",
    open: async (page) => {
      await stubNetwork(page, { ...PREFS, showNews: false, defaultLandingView: "scores" });
      await page.goto("/nfl-highlights-without-spoilers");
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 30_000 });
      return undefined;
    },
  },
  {
    page: "game",
    open: async (page) => {
      await stubNetwork(page, { ...PREFS, showNews: false, defaultLandingView: "scores" });
      await page.goto("/");
      const card = page.getByRole("button", { name: GAME_CARD, exact: true });
      await expect(card).toBeVisible({ timeout: 30_000 });
      // Keyboard, not a click: a click at the card's centre can land on a team
      // button (see tests/visual/boxscore.spec.ts).
      await card.focus();
      await page.keyboard.press("Enter");
      await expect(page.getByRole("dialog", { name: GAME_CARD })).toBeVisible();
      return '[role="dialog"]';
    },
  },
];

const VARIANTS = [
  { scheme: "light" as const, width: 390, height: 844 },
  { scheme: "dark" as const, width: 390, height: 844 },
  { scheme: "light" as const, width: 1280, height: 800 },
  { scheme: "dark" as const, width: 1280, height: 800 },
];

for (const v of VARIANTS) {
  const variant = `${v.scheme}-${v.width}`;
  test.describe(variant, () => {
    test.use({ colorScheme: v.scheme, viewport: { width: v.width, height: v.height } });

    for (const target of PAGES) {
      test(`${target.page} has no new serious/critical axe violations`, async ({ page }) => {
        const scope = await target.open(page);
        // Let transitions (sheet slide-in, theme fade) settle before colour checks.
        await page.waitForTimeout(600);

        let axe = new AxeBuilder({ page }).withTags(TAGS);
        if (scope) axe = axe.include(scope);
        const { violations } = await axe.analyze();

        const found = new Map<string, Entry & { help: string; impact: string; html: string }>();
        for (const vi of violations) {
          if (!FAILING_IMPACTS.has(vi.impact ?? "")) continue;
          // An iframe's node has a selector chain; the frame element itself is
          // what this page owns, so key on the first link.
          const keys = await targetKeys(page, vi.nodes.map((n) => String(n.target[0])));
          for (const [i, node] of vi.nodes.entries()) {
            const e = { rule: vi.id, page: target.page, variant, target: keys[i] };
            if (!found.has(keyOf(e))) {
              found.set(keyOf(e), { ...e, help: vi.help, impact: vi.impact ?? "", html: node.html.slice(0, 160) });
            }
          }
        }

        if (UPDATE) {
          const kept = readBaseline().filter((e) => !(e.page === target.page && e.variant === variant));
          const next = [...kept, ...[...found.values()].map(({ rule, page: p, variant: va, target: t }) => ({ rule, page: p, variant: va, target: t }))]
            .sort((a, b) => keyOf(a).localeCompare(keyOf(b)));
          // One entry per line, so a PR's baseline diff reads as a list of
          // accepted (+) and fixed (-) violations.
          writeFileSync(BASELINE_PATH, [
            "{",
            `  "note": "Known serious/critical axe violations. Regenerate: npm run a11y:update (see tests/a11y/axe.spec.ts).",`,
            `  "violations": [`,
            next.map((e) => `    ${JSON.stringify(e)}`).join(",\n"),
            "  ]",
            "}",
            "",
          ].join("\n"));
          return;
        }

        const known = new Set(readBaseline().map(keyOf));
        const fresh = [...found.values()].filter((e) => !known.has(keyOf(e)));
        const fixed = readBaseline().filter((e) => e.page === target.page && e.variant === variant && !found.has(keyOf(e)));
        if (fixed.length) {
          test.info().annotations.push({ type: "a11y-fixed", description: `${fixed.length} baseline entr${fixed.length === 1 ? "y" : "ies"} no longer found; run npm run a11y:update to drop them` });
        }
        expect(
          fresh,
          `New serious/critical a11y violations on ${target.page} (${variant}):\n` +
            fresh.map((e) => `  [${e.impact}] ${e.rule}: ${e.help}\n    target: ${e.target}\n    html:   ${e.html}`).join("\n"),
        ).toEqual([]);
      });
    }
  });
}
