import assert from "node:assert/strict";
import test from "node:test";

import { parseYouTubeId, readWatchQuery } from "../src/lib/youtubeLink.ts";

const ID = "dQw4w9WgXcQ";

// ── Every form /watch accepts ────────────────────────────────────────────────

const ACCEPT: [string, string][] = [
  ["youtu.be", `https://youtu.be/${ID}`],
  ["youtu.be with the share tracker", `https://youtu.be/${ID}?si=AbC123xyz`],
  ["youtube.com/watch", `https://youtube.com/watch?v=${ID}`],
  ["www.youtube.com/watch with extra params", `https://www.youtube.com/watch?feature=share&v=${ID}&t=42s`],
  ["m.youtube.com/watch", `https://m.youtube.com/watch?v=${ID}`],
  ["music.youtube.com/watch", `https://music.youtube.com/watch?v=${ID}`],
  ["/shorts/", `https://www.youtube.com/shorts/${ID}`],
  ["/live/", `https://www.youtube.com/live/${ID}?feature=share`],
  ["/embed/", `https://www.youtube.com/embed/${ID}`],
  ["youtube-nocookie /embed/", `https://www.youtube-nocookie.com/embed/${ID}`],
  ["bare id", ID],
  ["bare id with whitespace", `  ${ID}\n`],
  ["scheme-less link", `youtu.be/${ID}`],
  ["share-sheet text: title then link", `Mets vs. Braves Highlights | MLB https://youtu.be/${ID}`],
  ["link at the end of a sentence", `watch this: https://www.youtube.com/watch?v=${ID}.`],
  ["link in parentheses", `(https://youtu.be/${ID})`],
];

for (const [name, input] of ACCEPT) {
  test(`accepts ${name}`, () => {
    assert.equal(parseYouTubeId(input), ID);
  });
}

// ── Rejects ──────────────────────────────────────────────────────────────────

const REJECT: [string, string][] = [
  ["a Vimeo link", "https://vimeo.com/76979871"],
  ["a 10-character id", "dQw4w9WgXc"],
  ["a youtube.com/results URL", "https://www.youtube.com/results?search_query=mets+highlights"],
  ["a 12-character youtu.be path", `https://youtu.be/${ID}X`],
  ["a look-alike host", `https://notyoutube.com/watch?v=${ID}`],
  ["a redirect link that carries a YouTube URL in its query", `https://www.google.com/url?q=https://youtu.be/${ID}`],
  ["empty input", ""],
];

for (const [name, input] of REJECT) {
  test(`rejects ${name}`, () => {
    assert.equal(parseYouTubeId(input), null);
  });
}

// ── The /watch query ─────────────────────────────────────────────────────────

test("readWatchQuery reads v, url, text and title", () => {
  assert.equal(readWatchQuery(`?v=${ID}`).id, ID);
  assert.equal(readWatchQuery(`?url=${encodeURIComponent(`https://youtu.be/${ID}`)}`).id, ID);
  // Web Share Target: Android often puts the link in `text` and leaves `url` empty.
  assert.equal(readWatchQuery(`?title=Highlights&text=${encodeURIComponent(`Highlights https://youtu.be/${ID}`)}&url=`).id, ID);
});

test("readWatchQuery keeps the raw value when nothing parses", () => {
  const r = readWatchQuery(`?url=${encodeURIComponent("https://vimeo.com/1")}`);
  assert.equal(r.id, null);
  assert.equal(r.raw, "https://vimeo.com/1");
  assert.deepEqual(readWatchQuery(""), { id: null, raw: null });
});
