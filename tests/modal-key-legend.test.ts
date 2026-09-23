import assert from "node:assert/strict";
import test from "node:test";

import { routeModalKey } from "../src/lib/modalArrowKeys.ts";
import {
  buildKeyLegend,
  CHIP_TO_KEY,
  KEYS_HANDLED_IN_MODAL,
  toModalKeyContext,
  type KeyLegendContext,
} from "../src/lib/modalKeyLegend.ts";

// The bottom-right key legend (Jacob 9/8). The panel's only job is to be true:
// a row naming a key that does nothing is worse than no panel, because it's the
// one thing a user will trust without checking. So the rows are derived from
// the same flags routeModalKey routes on, and the load-bearing test below feeds
// every chip the panel prints back through the router.

/** True when one printed chip really does something in this context. */
function legendKeyIsLive(c: KeyLegendContext, chip: string): boolean {
  if ((KEYS_HANDLED_IN_MODAL as readonly string[]).includes(chip)) return true;
  const shift = chip.startsWith("⇧");
  const bare = shift ? chip.slice(1) : chip;
  return routeModalKey(toModalKeyContext(c, CHIP_TO_KEY[bare] ?? bare, shift)) !== null;
}

const ctx = (over: Partial<KeyLegendContext> = {}): KeyLegendContext => ({
  canSeek: false, galleryCanStep: false, hasPrev: true, hasNext: true,
  hasHeadline: true, ...over,
});

const labels = (c: KeyLegendContext) => buildKeyLegend(c).map((r) => r.label);
const ids = (c: KeyLegendContext) => buildKeyLegend(c).map((r) => r.id);
const row = (c: KeyLegendContext, id: string) => buildKeyLegend(c).find((r) => r.id === id);

// Every shape the modal can be in: video / gallery / plain post, crossed with
// each pager arm and with the headline present or not.
const EVERY_CONTEXT: KeyLegendContext[] = [];
for (const [canSeek, galleryCanStep] of [[false, false], [true, false], [false, true]] as const) {
  for (const hasPrev of [false, true]) {
    for (const hasNext of [false, true]) {
      for (const hasHeadline of [false, true]) {
        EVERY_CONTEXT.push({ canSeek, galleryCanStep, hasPrev, hasNext, hasHeadline });
      }
    }
  }
}

test("the panel never prints a key that does nothing", () => {
  for (const c of EVERY_CONTEXT) {
    for (const r of buildKeyLegend(c)) {
      for (const chip of r.keys) {
        assert.ok(
          legendKeyIsLive(c, chip),
          `"${chip}" (${r.label}) is printed but dead in ${JSON.stringify(c)}`,
        );
      }
    }
  }
});

test("a plain text post with nowhere to go is down to Close and ?", () => {
  assert.deepEqual(
    ids(ctx({ hasPrev: false, hasNext: false, hasHeadline: false })),
    ["esc", "help"],
  );
});

test("? is on the list in every state — it's the way back after the ✕", () => {
  for (const c of EVERY_CONTEXT) {
    const help = buildKeyLegend(c).find((r) => r.id === "help");
    assert.deepEqual(help?.keys, ["?"]);
  }
  // And it's last, under the hairline that starts at Esc.
  assert.equal(buildKeyLegend(ctx()).at(-1)?.id, "help");
});

test("a video prints the playback keys; a text post prints none of them", () => {
  assert.deepEqual(
    ids(ctx({ canSeek: true })),
    ["play", "arrows", "jl", "pct", "mf", "page", "peek", "esc", "help"],
  );
  for (const id of ["play", "jl", "pct", "mf"]) {
    assert.ok(!ids(ctx()).includes(id), `${id} shouldn't show without a video`);
  }
});

test("←/→ is labelled with whatever it actually does here", () => {
  assert.equal(row(ctx({ canSeek: true }), "arrows")?.label, "Skip 5s");
  assert.equal(row(ctx({ galleryCanStep: true }), "arrows")?.label, "Prev / next picture");
  // On a text post ←/→ page, so they join the paging row instead of getting a
  // second row with the same label on it.
  assert.equal(row(ctx(), "arrows"), undefined);
  assert.ok(row(ctx(), "page")?.keys.includes("←"));
  // Nothing to seek and nowhere to page: no arrow row at all rather than a lie.
  assert.equal(row(ctx({ hasPrev: false, hasNext: false }), "arrows"), undefined);
});

test("paging prints one row, with whichever keys reach it", () => {
  assert.deepEqual(row(ctx(), "page")?.keys, ["←", "→", "↑", "↓"]);
  // A video or a gallery owns the plain pair, so Shift takes its place.
  assert.deepEqual(row(ctx({ canSeek: true }), "page")?.keys, ["↑", "↓", "⇧←", "⇧→"]);
  assert.deepEqual(row(ctx({ galleryCanStep: true }), "page")?.keys, ["↑", "↓", "⇧←", "⇧→"]);
  // First post of a column: only the forward half exists, and the label says so
  // instead of printing two rows that both read "Next post" (Jacob's screen 9/8).
  const first = ctx({ hasPrev: false });
  assert.deepEqual(row(first, "page")?.keys, ["→", "↓"]);
  assert.equal(row(first, "page")?.label, "Next post");
  assert.equal(ids(first).filter((id) => id === "page").length, 1);
});

test("the pager rows disappear when there's no neighbouring post", () => {
  const solo = ctx({ hasPrev: false, hasNext: false, canSeek: true });
  assert.ok(!ids(solo).includes("page"));
  assert.ok(labels(solo).includes("Play / pause"));
});

test("H shows only when there's a headline to peek", () => {
  assert.ok(ids(ctx({ hasHeadline: true })).includes("peek"));
  assert.ok(!ids(ctx({ hasHeadline: false })).includes("peek"));
});

// ── "?" through the router ──────────────────────────────────────────────────

const mkey = (over: Record<string, unknown> = {}) => ({
  key: "?", shift: true, chord: false, repeat: false, inTextEntry: false,
  onControl: false, canSeek: false, galleryCanStep: false, hasPrev: false,
  hasNext: false, hasHeadline: false, ...over,
});

test("? toggles the panel from anywhere in the modal, even a dead one", () => {
  assert.equal(routeModalKey(mkey()), "toggle-keys");
  // Not gated on Shift: the glyph is the test, not the chord that made it.
  assert.equal(routeModalKey(mkey({ shift: false })), "toggle-keys");
  // Still works with a button focused — unlike Space, ? does nothing to one.
  assert.equal(routeModalKey(mkey({ onControl: true })), "toggle-keys");
  // And on a video, where every other key is busy.
  assert.equal(routeModalKey(mkey({ canSeek: true })), "toggle-keys");
});

test("? stays out of typing, chords and key repeat", () => {
  assert.equal(routeModalKey(mkey({ inTextEntry: true })), null);
  assert.equal(routeModalKey(mkey({ chord: true })), null);
  assert.equal(routeModalKey(mkey({ repeat: true })), null);
});

test("? doesn't swallow the keys next to it", () => {
  assert.equal(routeModalKey(mkey({ key: "/" })), null);
  assert.equal(routeModalKey(mkey({ key: "7", canSeek: true })), "jump-pct");
});
