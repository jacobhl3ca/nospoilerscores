// Measures where YouTube's mid-clip "More videos" pause shelf sits in a phone-size
// embed, with the same playerVars VideoModal uses (controls:0, rel:0, mute:1).
// One-off probe for the paused-strip height (Mom's phone, 2026-10-05). Run on the mini:
//   ~/scripts/pw-webkit-mini.sh --script scripts/measure-yt-pause-shelf.mjs --out shots-shelf <worktree>
import { webkit, chromium, devices } from "playwright";
import { writeFileSync } from "node:fs";

const OUT = process.env.OUT || "shots-shelf";
const IDS = (process.argv[2] || "aqz-KE-bpKQ,9bZkp7q19f0").split(",");
const PROFILES = [
  { name: "iphone15pro", device: devices["iPhone 15 Pro"], width: 358 },
  { name: "iphone15pro-390", device: devices["iPhone 15 Pro"], width: 390 },
  { name: "desktop", device: devices[process.env.BROWSER === "chromium" ? "Desktop Chrome" : "Desktop Safari"], width: 640 },
  { name: "desktop-narrow", device: devices[process.env.BROWSER === "chromium" ? "Desktop Chrome" : "Desktop Safari"], width: 358 },
  { name: "desktop-1280", device: { ...devices[process.env.BROWSER === "chromium" ? "Desktop Chrome" : "Desktop Safari"], viewport: { width: 1400, height: 900 } }, width: 1280 },
];

const page = (id, w) => `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{margin:0;background:#111}#wrap{width:${w}px;aspect-ratio:16/9;position:relative}</style></head>
<body><div id="wrap"><div id="p"></div></div>
<script>
window.__state = [];
window.onYouTubeIframeAPIReady = () => {
  window.player = new YT.Player("p", { videoId: ${JSON.stringify(id)}, width: "100%", height: "100%",
    playerVars: { autoplay: 1, mute: 1, rel: 0, modestbranding: 1, playsinline: 1, controls: 0,
      iv_load_policy: 3, cc_load_policy: 0, origin: location.origin },
    events: { onStateChange: e => window.__state.push(e.data) } });
};
</script><script src="https://www.youtube.com/iframe_api"></script></body></html>`;

const results = [];
const browser = await (process.env.BROWSER === "chromium" ? chromium : webkit).launch();
for (const prof of PROFILES) {
  for (const id of IDS) {
    const ctx = await browser.newContext({ ...prof.device });
    const p = await ctx.newPage();
    await p.route("https://hidescore.com/__shelf", r => r.fulfill({ contentType: "text/html", body: page(id, prof.width) }));
    const rec = { profile: prof.name, id, width: prof.width };
    try {
      await p.goto("https://hidescore.com/__shelf");
      await p.waitForFunction(() => window.player && window.player.getPlayerState, null, { timeout: 30_000 });
      // Autoplay may be refused; a tap on the iframe centre starts it like a user would.
      await p.waitForTimeout(4000);
      let st = await p.evaluate(() => window.player.getPlayerState());
      if (st !== 1) {
        const box = await p.locator("#wrap").boundingBox();
        await p.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
        await p.waitForTimeout(3000);
        st = await p.evaluate(() => window.player.getPlayerState());
      }
      rec.playingBeforePause = st;
      await p.evaluate(() => { window.player.seekTo(30, true); });
      await p.waitForTimeout(2500);
      await p.evaluate(() => window.player.pauseVideo());
      await p.waitForTimeout(3000);
      rec.stateAfterPause = await p.evaluate(() => window.player.getPlayerState());
      const frame = p.frames().find(f => f.url().includes("youtube.com/embed"));
      rec.frameHeight = (await p.locator("#wrap").boundingBox()).height;
      rec.elements = frame ? await frame.evaluate(() => {
        const out = [];
        for (const el of document.querySelectorAll("*")) {
          const cls = typeof el.className === "string" ? el.className : "";
          const txt = (el.textContent || "").trim();
          if (!/pause-overlay|suggestion|related|endscreen|more-videos/i.test(cls) && !(/^More videos$/i.test(txt))) continue;
          const r = el.getBoundingClientRect();
          const cs = getComputedStyle(el);
          if (r.width === 0 || r.height === 0 || cs.display === "none" || cs.visibility === "hidden" || +cs.opacity === 0) continue;
          out.push({ cls: cls.slice(0, 80), tag: el.tagName, top: Math.round(r.top), bottom: Math.round(r.bottom), h: Math.round(r.height), text: txt.slice(0, 40) });
        }
        return out.slice(0, 40);
      }) : "no youtube frame";
      await p.screenshot({ path: `${OUT}/${prof.name}-${id}.png` });
    } catch (e) {
      rec.error = String(e).slice(0, 300);
    }
    results.push(rec);
    await ctx.close();
  }
}
await browser.close();
writeFileSync(`${OUT}/shelf.json`, JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 1));
