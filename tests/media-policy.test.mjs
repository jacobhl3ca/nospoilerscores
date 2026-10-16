import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  MEDIA_CLASSES,
  applyMediaPolicy,
  applyMediaPolicyCounted,
  classifyMediaUrl,
  describeMediaOff,
  mediaOffLogLine,
  readMediaOff,
  readMediaOffDetailed,
} from "../scripts/lib/media-policy.mjs";

// URL shapes the bake writes, copied from live feeds (2026-10-13) and from the
// resolvers in scripts/prebake-news.mjs.
const MLB_VOD = "https://mlb-cuts-diamond.mlb.com/FORGE/2026/2026-10/12/7611702a-8bcb3551-9bb8f2bc-csvm-diamondgcp-asset.m3u8";
const MLB_LIVE = "https://adhoc-hlslive-fst-gcp.mlb.com/a6042c6b-9fc1-4ad5-bce7-2f10dea5abe2/LIVE-Rays-Press-Conference.m3u8";
const VREDDIT_HLS = "https://v.redd.it/2f0ebbqg27vh1/HLSPlaylist.m3u8";
const VREDDIT_MP4 = "https://v.redd.it/2f0ebbqg27vh1/CMAF_720.mp4?source=fallback";
const REDDIT_GIF_MP4 = "https://preview.redd.it/vc119ucyj7vh1.gif?format=mp4&s=1bd01cb3e58e788cae2a40d23f2957f4c0c75aaf";
const ESPN_MP4 = "https://espnmedia-cdn.akamaized.net/espn/media/16x9/wsc/2026/1013/1ea74fb3-1d27-40d0-9e51-629d05893c5a/1ea74fb3-1d27-40d0-9e51-629d05893c5a.mp4";
const CLIP_HOSTS = {
  streamable: "https://cdn-cf-east.streamable.com/video/mp4/0ihydc.mp4?Expires=1792181187166&Key-Pair-Id=APKAIEYUVEN4EVB2OKEQ&Signature=abc",
  hostedhost: "https://cdn.hostedhost.top/fc57053a.mp4",
  streamin: "https://c-cdn.streamin.top/uploads/a9bfc0ab.mp4",
  streamff: "https://cdn.streamff.one/5780028f.mp4",
  dropr: "https://cdn.dropr.co/9b1f0c.mp4",
  streamain: "https://cdn.streamain.com/WmqO2Am0qiqT2lk.mp4",
  sportits: "https://media.sportits.com/clips/WmqO2Am0qiqT2lk.mp4",
  imgur: "https://i.imgur.com/AbCd123.mp4",
  generic: "https://clips.example-new-host.net/v/5780028f.mp4",
};

test("classifier: MLB statsapi / mlb.com HLS", () => {
  assert.equal(classifyMediaUrl(MLB_VOD), "mlb");
  assert.equal(classifyMediaUrl(MLB_LIVE), "mlb");
  assert.equal(classifyMediaUrl("https://www.mlb.com/video/some-slug"), "mlb");
});

test("classifier: Reddit-hosted video, including its GIF mp4", () => {
  assert.equal(classifyMediaUrl(VREDDIT_HLS), "vreddit");
  assert.equal(classifyMediaUrl(VREDDIT_MP4), "vreddit");
  assert.equal(classifyMediaUrl(REDDIT_GIF_MP4), "vreddit");
  assert.equal(classifyMediaUrl("https://external-preview.redd.it/x.gif?format=mp4&s=1"), "vreddit");
});

test("classifier: ESPN akamaized mp4", () => {
  assert.equal(classifyMediaUrl(ESPN_MP4), "espn");
  assert.equal(classifyMediaUrl("https://some-other-bucket.akamaized.net/a/b.mp4?x=1"), "espn");
});

test("classifier: every other clip host is cliphosts", () => {
  for (const [name, url] of Object.entries(CLIP_HOSTS)) assert.equal(classifyMediaUrl(url), "cliphosts", name);
});

test("classifier: a lookalike host does not borrow another class", () => {
  assert.equal(classifyMediaUrl("https://notmlb.com/a.m3u8"), "cliphosts");
  assert.equal(classifyMediaUrl("https://mlb.com.evil.example/a.m3u8"), "cliphosts");
  assert.equal(classifyMediaUrl("https://fakeredd.it/a.mp4"), "cliphosts");
  assert.equal(classifyMediaUrl("https://akamaized.net.example.org/a.mp4"), "cliphosts");
});

test("classifier: official players and non-URLs are left alone (null)", () => {
  for (const u of [
    "https://www.youtube.com/watch?v=abcdefghijk",
    "https://youtu.be/abcdefghijk",
    "https://www.youtube-nocookie.com/embed/abcdefghijk",
    "https://players.brightcove.net/6415718365001/default_default/index.html?videoId=6406773003112",
    "",
    "   ",
    null,
    undefined,
    42,
    "not a url",
    "/relative/path.mp4",
    "blob:https://hidescore.com/abc",
    "data:video/mp4;base64,AAAA",
  ]) assert.equal(classifyMediaUrl(u), null, String(u));
});

test("classifier: protocol-relative and mixed-case hosts", () => {
  assert.equal(classifyMediaUrl("//v.redd.it/abc/HLSPlaylist.m3u8"), "vreddit");
  assert.equal(classifyMediaUrl("HTTPS://V.REDD.IT/abc/HLSPlaylist.m3u8"), "vreddit");
});

function withDir(fn) {
  const dir = mkdtempSync(join(tmpdir(), "media-policy-"));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("readMediaOff: nothing set, missing file = empty", () => {
  const missing = join(tmpdir(), "media-policy-does-not-exist", "media-off");
  const got = readMediaOffDetailed({ env: {}, file: missing });
  assert.deepEqual([...got.off], []);
  assert.deepEqual(got.unknown, []);
  assert.equal(got.fileError, null);
  assert.equal(readMediaOff({ env: {}, file: missing }).size, 0);
});

test("readMediaOff: env comma list", () => {
  const off = readMediaOff({ env: { MEDIA_OFF: "mlb, vreddit ,ESPN" }, file: null });
  assert.deepEqual([...off].sort(), ["espn", "mlb", "vreddit"]);
});

test("readMediaOff: file with comments, blank lines, mixed case and trailing comments", () => {
  withDir((dir) => {
    const file = join(dir, "media-off");
    writeFileSync(file, [
      "# takedown notice 2026-10-14",
      "mlb",
      "",
      "  CliPhosts  # streamff owner",
      "   # indented comment",
      "vreddit, espn",
      "",
    ].join("\n"));
    const off = readMediaOff({ env: {}, file });
    assert.deepEqual([...off].sort(), ["cliphosts", "espn", "mlb", "vreddit"]);
  });
});

test("readMediaOff: env and file are merged", () => {
  withDir((dir) => {
    const file = join(dir, "media-off");
    writeFileSync(file, "espn\n");
    const off = readMediaOff({ env: { MEDIA_OFF: "mlb" }, file });
    assert.deepEqual([...off].sort(), ["espn", "mlb"]);
  });
});

test("readMediaOff: all expands to every class", () => {
  const off = readMediaOff({ env: { MEDIA_OFF: "all" }, file: null });
  assert.deepEqual([...off].sort(), [...MEDIA_CLASSES].sort());
  withDir((dir) => {
    const file = join(dir, "media-off");
    writeFileSync(file, "# everything\nall\n");
    assert.deepEqual([...readMediaOff({ env: {}, file })].sort(), [...MEDIA_CLASSES].sort());
  });
});

test("readMediaOff: a typo turns nothing off and is reported", () => {
  const got = readMediaOffDetailed({ env: { MEDIA_OFF: "mlbb,mlb,mlbb,youtube" }, file: null });
  assert.deepEqual([...got.off], ["mlb"]);
  assert.deepEqual(got.unknown, ["mlbb", "youtube"]);
});

test("readMediaOff: an unreadable file is reported, not thrown", () => {
  withDir((dir) => {
    // A directory where the file should be: readFileSync fails with EISDIR.
    const got = readMediaOffDetailed({ env: { MEDIA_OFF: "mlb" }, file: dir });
    assert.deepEqual([...got.off], ["mlb"]);
    assert.match(got.fileError ?? "", /EISDIR|illegal operation/i);
  });
});

test("readMediaOff: the default file is under ~/.config/hidescore", () => {
  let asked = null;
  readMediaOff({ env: {}, read: (f) => { asked = f; throw Object.assign(new Error("nope"), { code: "ENOENT" }); } });
  assert.match(asked, /\.config\/hidescore\/media-off$/);
});

const feed = () => [
  { id: "a", headline: "MLB cut", articleUrl: "https://www.mlb.com/video/a", imageUrl: "https://img.mlbstatic.com/a.jpg", playbackUrl: MLB_VOD },
  { id: "b", headline: "Reddit clip", articleUrl: "https://www.reddit.com/r/baseball/comments/b", imageUrl: "https://preview.redd.it/b.jpg", videoUrl: VREDDIT_HLS },
  { id: "c", headline: "Reddit gif", articleUrl: "https://www.reddit.com/r/baseball/comments/c", videoUrl: REDDIT_GIF_MP4 },
  { id: "d", headline: "Goal", articleUrl: "https://www.reddit.com/r/soccer/comments/d", videoUrl: CLIP_HOSTS.hostedhost, imageUrl: "https://cdn.hostedhost.top/d.jpg" },
  { id: "e", headline: "Streamable", articleUrl: "https://www.reddit.com/r/nba/comments/e", videoUrl: CLIP_HOSTS.streamable },
  { id: "f", headline: "ESPN clip", articleUrl: "https://www.espn.com/video/clip?id=1", videoUrl: ESPN_MP4, durationSec: 87 },
  { id: "g", headline: "YouTube", articleUrl: "https://www.youtube.com/watch?v=abcdefghijk", youtubeVideoId: "abcdefghijk", videoUrl: null },
  { id: "h", headline: "NHL", articleUrl: "https://www.nhl.com/video/h", embedUrl: "https://players.brightcove.net/6415718365001/default_default/index.html?videoId=6406773003112" },
  { id: "i", headline: "Image only", articleUrl: "https://example.com/i", imageUrl: "https://example.com/i.jpg", body: "text" },
];

const urlsLeft = (items) => items.map((i) => `${i.id}:${i.playbackUrl ?? "-"}|${i.videoUrl ?? "-"}`);

test("applyMediaPolicy: nothing off changes nothing", () => {
  const items = feed();
  assert.deepEqual(applyMediaPolicy(items, new Set()), items);
  assert.deepEqual(applyMediaPolicy(items, undefined), items);
  assert.equal(applyMediaPolicyCounted(items, new Set()).stripped, 0);
});

for (const [cls, ids] of [
  ["mlb", ["a"]],
  ["vreddit", ["b", "c"]],
  ["cliphosts", ["d", "e"]],
  ["espn", ["f"]],
]) {
  test(`applyMediaPolicy: ${cls} strips only its own items`, () => {
    const items = feed();
    const got = applyMediaPolicyCounted(items, new Set([cls]));
    assert.equal(got.stripped, ids.length);
    for (const item of got.items) {
      const before = items.find((i) => i.id === item.id);
      if (ids.includes(item.id)) {
        assert.equal(item.playbackUrl ?? null, null, `${item.id} playbackUrl`);
        assert.equal(item.videoUrl ?? null, null, `${item.id} videoUrl`);
      } else {
        assert.deepEqual(item, before, `${item.id} untouched`);
      }
    }
  });
}

test("applyMediaPolicy: all strips every play URL, keeps YouTube and Brightcove", () => {
  const got = applyMediaPolicyCounted(feed(), new Set(["all"]));
  assert.equal(got.stripped, 6);
  assert.deepEqual(urlsLeft(got.items), ["a:-|-", "b:-|-", "c:-|-", "d:-|-", "e:-|-", "f:-|-", "g:-|-", "h:-|-", "i:-|-"]);
  assert.equal(got.items.find((i) => i.id === "g").youtubeVideoId, "abcdefghijk");
  assert.match(got.items.find((i) => i.id === "h").embedUrl, /players\.brightcove\.net/);
  // The expanded set (what readMediaOff returns for `all`) gives the same answer.
  assert.deepEqual(applyMediaPolicy(feed(), readMediaOff({ env: { MEDIA_OFF: "all" }, file: null })), got.items);
});

test("applyMediaPolicy: several classes at once", () => {
  const got = applyMediaPolicyCounted(feed(), new Set(["mlb", "espn"]));
  assert.equal(got.stripped, 2);
  assert.deepEqual(urlsLeft(got.items).slice(0, 6), ["a:-|-", `b:-|${VREDDIT_HLS}`, `c:-|${REDDIT_GIF_MP4}`, `d:-|${CLIP_HOSTS.hostedhost}`, `e:-|${CLIP_HOSTS.streamable}`, "f:-|-"]);
});

test("applyMediaPolicy: never touches articleUrl, headline, images, body or any other field", () => {
  const items = feed();
  const got = applyMediaPolicy(items, new Set(["all"]));
  const withoutPlayUrls = (item) => Object.fromEntries(Object.entries(item).filter(([k]) => k !== "playbackUrl" && k !== "videoUrl"));
  for (const [i, item] of got.entries()) {
    assert.deepEqual(withoutPlayUrls(item), withoutPlayUrls(items[i]), item.id);
  }
  assert.equal(got.find((i) => i.id === "f").durationSec, 87);
});

test("applyMediaPolicy: no input mutation, no new keys on items that had none", () => {
  const items = feed();
  const snapshot = JSON.stringify(items);
  const got = applyMediaPolicy(items, new Set(["all"]));
  assert.equal(JSON.stringify(items), snapshot);
  assert.notEqual(got, items);
  assert.equal("videoUrl" in got.find((i) => i.id === "a"), false);
  assert.equal("playbackUrl" in got.find((i) => i.id === "b"), false);
  assert.equal(got.find((i) => i.id === "a").playbackUrl, null);
});

test("applyMediaPolicy: an item with both fields loses both, counted once", () => {
  const both = [{ id: "x", playbackUrl: MLB_VOD, videoUrl: VREDDIT_HLS }];
  const got = applyMediaPolicyCounted(both, new Set(["mlb", "vreddit"]));
  assert.equal(got.stripped, 1);
  assert.deepEqual(got.items[0], { id: "x", playbackUrl: null, videoUrl: null });
  const one = applyMediaPolicyCounted(both, new Set(["mlb"]));
  assert.deepEqual(one.items[0], { id: "x", playbackUrl: null, videoUrl: VREDDIT_HLS });
});

test("applyMediaPolicy: tolerates junk input", () => {
  assert.deepEqual(applyMediaPolicy(undefined, new Set(["all"])), []);
  assert.deepEqual(applyMediaPolicy([null, "x", { id: "n" }], new Set(["all"])), [null, "x", { id: "n" }]);
});

test("log line: classes list or dash, and the stripped count", () => {
  assert.equal(mediaOffLogLine(new Set(), 0), "MEDIA-OFF classes=- stripped=0");
  assert.equal(mediaOffLogLine(new Set(["vreddit", "mlb"]), 7), "MEDIA-OFF classes=mlb,vreddit stripped=7");
  assert.equal(mediaOffLogLine(new Set(MEDIA_CLASSES), 12), "MEDIA-OFF classes=all stripped=12");
  assert.equal(mediaOffLogLine(new Set(["all"]), 1), "MEDIA-OFF classes=all stripped=1");
  assert.equal(describeMediaOff(new Set(["espn"])), "espn");
});
