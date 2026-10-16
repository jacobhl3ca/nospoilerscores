import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

// A reloaded news modal finds its ESPN-layout card from the post's section,
// which the share URL carries as ?hn (or ?hl when they match). Jacob 10/10.
const jiti = createJiti(import.meta.url);
const news = await jiti.import<{ newsCardKeyForSection: (s: string | null | undefined) => string | null }>("../src/lib/news.ts");
const share = await jiti.import<{ buildHighlightShareUrl: (p: Record<string, unknown>) => string | null }>("../src/lib/shareCard.ts");

test("section → ESPN-layout card key", () => {
  const k = news.newsCardKeyForSection;
  assert.equal(k("ESPN Video"), "espn-videos");
  assert.equal(k("ESPN"), "espn-top");
  assert.equal(k("r/nba"), "reddit-nba");
  assert.equal(k("r/baseball"), "reddit-mlb");
  assert.equal(k("r/soccer"), "reddit-soccer");
  assert.equal(k("r/sports"), "reddit-general");
  assert.equal(k("r/rugbyunion"), "reddit-rugbyunion");
  assert.equal(k("r/nope"), null);
  assert.equal(k("MLB.com"), null);
  assert.equal(k(null), null);
});

test("share URL carries the section as ?hn only when ?hl differs", () => {
  const q = (p: Record<string, unknown>) => new URL(share.buildHighlightShareUrl({ playbackUrl: "https://x.test/a.mp4", ...p })!).searchParams;
  assert.equal(q({ section: "ESPN Video" }).get("hn"), "ESPN Video");
  assert.equal(q({ section: "r/nba", sourceLabel: "r/nba" }).get("hn"), null);
  assert.equal(q({ section: "r/nba", sourceLabel: "r/nba" }).get("hl"), "r/nba");
  assert.equal(q({}).get("hn"), null);
});
