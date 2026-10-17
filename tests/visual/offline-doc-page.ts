import { expect, type Page } from "@playwright/test";

// Shared setup for the doc-page specs (teams-hub, worldcup-teams,
// worldcup-team-page). These pages render from baked constants, so the only
// network they touch is third-party: the two analytics scripts, Sentry, and
// (on /teams) ESPN's logo CDN. Every non-localhost request is answered here,
// so the specs run the same offline as online.

// 1×1 transparent PNG.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

export type ThirdParty = "ok" | "fail";

// "ok": scripts load empty, images load a PNG, anything else gets 204.
// "fail": every third-party request is aborted, the way a blocker or a
// dropped connection leaves it.
export async function stubThirdParty(page: Page, mode: ThirdParty = "ok") {
  const baseHost = new URL(process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000").host;
  await page.route((url) => url.host !== baseHost, (route) => {
    if (mode === "fail") return route.abort("internetdisconnected");
    const type = route.request().resourceType();
    if (type === "script") return route.fulfill({ status: 200, contentType: "text/javascript", body: "" });
    if (type === "image") return route.fulfill({ status: 200, contentType: "image/png", body: PNG });
    return route.fulfill({ status: 204, body: "" });
  });
}

// Console errors and uncaught exceptions. `allow` drops the lines a test
// causes on purpose (a 404 status, an aborted request).
export function collectErrors(page: Page) {
  const errors: string[] = [];
  page.on("console", (msg) => { if (msg.type() === "error") errors.push(msg.text()); });
  page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
  return (allow: RegExp[] = []) => errors.filter((e) => !allow.some((re) => re.test(e)));
}

export const FAILED_LOAD = /^Failed to load resource: net::ERR_/;

export async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

// "2-1", "3 – 0": a scoreline. Lookarounds keep ISO dates ("2026-10-09") and
// ranges inside longer numbers from matching.
export const SCORE = /(?<![\d-])\d{1,2}\s*[-–]\s*\d{1,2}(?![\d-])/;

// Visible text, plus every aria-label, title and alt on the page.
export async function pageTextAndLabels(page: Page): Promise<string> {
  return page.evaluate(() => {
    const attrs = [...document.querySelectorAll("[aria-label],[title],[alt]")].flatMap((el) =>
      ["aria-label", "title", "alt"].map((a) => el.getAttribute(a) ?? ""),
    );
    return [document.body.innerText, document.title, ...attrs].join("\n");
  });
}

export async function jsonLdNodes(page: Page): Promise<Record<string, unknown>[]> {
  const blocks = await page.locator('script[type="application/ld+json"]').allTextContents();
  return blocks.flatMap((raw) => {
    const data = JSON.parse(raw);
    return (data["@graph"] ?? [data]) as Record<string, unknown>[];
  });
}

export const WIDTHS = [
  { width: 390, height: 844 },
  { width: 1440, height: 900 },
];
