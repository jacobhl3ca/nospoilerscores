// Does a YouTube video allow embedded playback?
//
// The only honest way to answer is to mount YouTube's own IFrame player from
// the hidescore.com origin and see what it says: error 150 means "embedding
// disabled by request of the owner". Nothing server-side reports this — the
// oEmbed endpoint, the watch page and the /embed/ shell all look identical for
// a blocked video and a playable one, which is why EMBED_BLOCKED_CHANNELS in
// src/lib/youtube.ts is a hand-verified list rather than something derived.
//
// ALWAYS run a known-good control id in the same invocation. A headless browser
// can be refused playback for reasons that have nothing to do with embedding
// (autoplay policy, bot checks), and a control that plays is what separates
// "this channel blocks embeds" from "this session was throttled". The 2026-08-10
// NFL run is the worked example: four NFL uploads returned 150 while ESPN, MLB
// and DAZN Boxing clips played in the very same session.
//
//   node scripts/check-embeddable.mjs <videoId> [<videoId> ...]
//
// Prints one line per id: PLAYS, ERROR (with the YouTube error code), or
// TIMEOUT (never reached a playing state and never errored — inconclusive, not
// a block).
import { chromium } from "playwright";

const IDS = process.argv.slice(2);
if (!IDS.length) {
  console.error("usage: node scripts/check-embeddable.mjs <videoId> [<videoId> ...]");
  process.exit(1);
}

// Per-video budget. Generous because a cold player on a cold profile can take
// several seconds to reach PLAYING, and a premature timeout reads as a block.
const TIMEOUT_MS = 15000;

const browser = await chromium.launch();
const page = await browser.newPage();
// The origin matters: embedding permission is evaluated against the referring
// site, so this has to run from the real production origin to mean anything.
await page.goto("https://hidescore.com/", { waitUntil: "domcontentloaded" });

let blocked = 0;
for (const videoId of IDS) {
  const result = await page.evaluate(
    ([id, timeoutMs]) =>
      new Promise((resolve) => {
        const host = document.createElement("div");
        host.id = `probe-${id}`;
        document.body.appendChild(host);
        const done = (value) => {
          host.remove();
          resolve(value);
        };
        const start = () => {
          const player = new window.YT.Player(host.id, {
            videoId: id,
            height: "200",
            width: "320",
            playerVars: { autoplay: 1, mute: 1, playsinline: 1 },
            events: {
              onReady: () => player.playVideo(),
              onError: (e) => done({ result: "ERROR", code: e.data }),
              // PLAYING (1) or BUFFERING (3) — either proves the embed was allowed.
              onStateChange: (e) => {
                if (e.data === 1 || e.data === 3) done({ result: "PLAYS" });
              },
            },
          });
          setTimeout(() => done({ result: "TIMEOUT", state: player.getPlayerState?.() }), timeoutMs);
        };
        if (window.YT?.Player) start();
        else {
          const tag = document.createElement("script");
          tag.src = "https://www.youtube.com/iframe_api";
          document.head.appendChild(tag);
          window.onYouTubeIframeAPIReady = start;
        }
      }),
    [videoId, TIMEOUT_MS],
  );
  if (result.result === "ERROR" && result.code === 150) blocked++;
  console.log(videoId, JSON.stringify(result));
}

await browser.close();
// Non-zero only when every id was blocked, so a mixed run (the control played)
// still exits clean and the per-line output is what you read.
process.exit(blocked === IDS.length ? 1 : 0);
