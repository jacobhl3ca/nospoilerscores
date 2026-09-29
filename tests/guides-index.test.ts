import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { GUIDE_GROUPS, GUIDE_ROUTES } from "../src/lib/guidesIndex.ts";

// /guides (2026-09-28) lists every spoiler-free guide from one constant. These
// catch the two ways it drifts: a listed route that no longer exists, and a
// new SeoLandingPage route that ships without a /guides entry (an orphan from
// the page that is meant to link everything).

const appDir = new URL("../src/app/", import.meta.url);
const pageFor = (route: string) => new URL(`.${route}/page.tsx`, appDir);

test("every /guides entry has a page.tsx under src/app", () => {
  for (const route of GUIDE_ROUTES) {
    assert.ok(fs.existsSync(pageFor(route)), `${route} has no src/app${route}/page.tsx`);
  }
});

test("no route is listed twice", () => {
  assert.equal(new Set(GUIDE_ROUTES).size, GUIDE_ROUTES.length);
});

test("every group has at least one guide", () => {
  for (const g of GUIDE_GROUPS) assert.ok(g.guides.length > 0, g.sport);
});

test("every SeoLandingPage route is on /guides", () => {
  const missing: string[] = [];
  const walk = (dir: URL, route: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!e.isDirectory() || e.name.startsWith("[")) continue;
      const sub = new URL(`${e.name}/`, dir);
      const r = `${route}/${e.name}`;
      const page = new URL("page.tsx", sub);
      if (fs.existsSync(page) && fs.readFileSync(page, "utf8").includes("<SeoLandingPage")) {
        if (!GUIDE_ROUTES.includes(r)) missing.push(r);
      }
      walk(sub, r);
    }
  };
  walk(appDir, "");
  assert.deepEqual(missing, []);
});

test("the sitemap lists /guides and every guide", () => {
  const sitemap = fs.readFileSync(new URL("sitemap.ts", appDir), "utf8");
  for (const route of ["/guides", ...GUIDE_ROUTES]) {
    assert.ok(sitemap.includes(`"${route}"`), `${route} is not in sitemap.ts`);
  }
});
