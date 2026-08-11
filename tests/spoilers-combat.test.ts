import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { isScoreSpoiler } from "../src/lib/spoilers.ts";

// The words a fight card is actually titled with. Each of these leaked through
// before 2026-08-10 — the filter only knew "TKO", "submission" and the spelled-
// out "knocked out", none of which is how the UFC or DAZN channels write it.
test("a fight result never reads as a clean title", () => {
  for (const title of [
    "Jon Jones def. Stipe Miocic | UFC 309 Highlights",
    "Islam Makhachev stops Volkanovski in Round 1",
    "Alex Pereira KOs Jiri Prochazka",
    "Topuria KO'd Holloway | Full Fight Highlights",
    "Usyk retains undisputed crown",
    "Merab finishes O'Malley at UFC 306",
    "Ngannou starched Gane in 60 seconds",
  ]) {
    assert.equal(isScoreSpoiler(title), true, `leaked: ${title}`);
  }
});

// The combat words are broad on purpose, but they must not swallow the ordinary
// house-style titles the mask is supposed to lift for.
test("the combat words do not swallow ordinary highlight titles", () => {
  for (const title of [
    "Mets vs Braves | Game Highlights",
    "UFC 309: Jones vs Miocic | Official Weigh-in",
    "Full Fight Preview | UFC 310",
    "Bears Press Conference: Week 15",
    "Heineken Dutch Grand Prix | Race Highlights",
    "PGA Championship Round 2 Highlights",
  ]) {
    assert.equal(isScoreSpoiler(title), false, `over-hidden: ${title}`);
  }
});

// The Cloudflare worker carries its own copy of this pattern because it masks
// titles before the page ever loads. A copy that drifts is a copy that leaks on
// exactly one of the two paths, silently — so pin them together.
test("the worker's copy of the pattern is byte-identical", () => {
  const grab = (path: string) => {
    const m = fs
      .readFileSync(new URL(path, import.meta.url), "utf8")
      .match(/const SPOILER_RX = (\/\\b\(walk[\s\S]*?\/i);/);
    return m?.[1] ?? null;
  };
  const lib = grab("../src/lib/spoilers.ts");
  const worker = grab("../public/_worker.js");
  assert.ok(lib, "could not find SPOILER_RX in src/lib/spoilers.ts");
  assert.ok(worker, "could not find SPOILER_RX in public/_worker.js");
  assert.equal(worker, lib);
});
