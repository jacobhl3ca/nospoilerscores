import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

import { isClipPageUrl, parseClipPage } from "../scripts/lib/clip-host.mjs";

const fixture = (name) => readFileSync(new URL(`./fixtures/clip-host/${name}`, import.meta.url), "utf8");

test("clip page URLs: every host r/soccer has used, plus an unseen one", () => {
  for (const u of [
    "https://streamff.link/v/5780028f",
    "https://streamin.me/v/abc123",
    "https://dropr.co/v/Xy12ab",
    "https://streama.in/WmqO2Am0qiqT2lk/watch",
    "https://streamain.com/en/WmqO2Am0qiqT2lk/watch",
    "https://newclips.xyz/v/5780028f",
    "https://another.host/embed/AbCd1234",
  ]) assert.equal(isClipPageUrl(u), true, u);
});

test("news, social and Reddit links are not clip pages", () => {
  for (const u of [
    "https://www.marca.com/futbol/atletico/2026/09/21/atletico.html",
    "https://bsky.app/profile/optajoe.com/post/3mw4kidkun22u",
    "https://v.redd.it/a1hoherz13rh1",
    "https://www.youtube.com/embed/abcdefgh",
    "https://streamable.com/e/abcd12",
    "https://www.reddit.com/r/soccer/comments/1wn7xr9/x/",
    "https://www.bbc.com/sport/football/articles/ckd68e40ze3jo",
    "/r/soccer/comments/abc/",
    "not a url",
  ]) assert.equal(isClipPageUrl(u), false, u);
});

test("streama.in watch page: ignores the 20 sidebar clips, points at the embed", () => {
  const page = parseClipPage(fixture("streamain-watch.html"), "https://streamain.com/en/WmqO2Am0qiqT2lk/watch");
  assert.equal(page.mp4, null);
  assert.equal(page.embedUrl, "https://streamain.com/embed/WmqO2Am0qiqT2lk");
  assert.equal(page.thumb, "https://streamain.com/thumbnails/RHWoxN3Or3Sfvlk_1790110783_thumb.jpg");
});

test("streama.in embed page: reads the player's own clip (new CDN host)", () => {
  const page = parseClipPage(fixture("streamain-embed.html"), "https://streamain.com/embed/WmqO2Am0qiqT2lk");
  assert.equal(page.mp4, "https://media.sportits.com/guests/RHWoxN3Or3Sfvlk_1790110783.mp4");
});

test("og:video wins, either attribute order, entities decoded", () => {
  const html = `<meta content="https://cdn.x.co/a.mp4?t=1&amp;s=2" property="og:video:secure_url">
    <meta property="og:image" content="https://cdn.x.co/a.jpg">
    <video src="https://cdn.x.co/other.mp4"></video>`;
  const page = parseClipPage(html, "https://x.co/v/abcd");
  assert.equal(page.mp4, "https://cdn.x.co/a.mp4?t=1&s=2");
  assert.equal(page.thumb, "https://cdn.x.co/a.jpg");
});

test("<source> inside the first <video>, relative URL made absolute", () => {
  const html = `<a data-preview-src="https://cdn.x.co/sidebar.mp4"></a>
    <video controls><source src="/files/clip.mp4" type="video/mp4"></video>`;
  assert.equal(parseClipPage(html, "https://x.co/v/abcd").mp4, "https://x.co/files/clip.mp4");
});

test("a page with no player gives nothing", () => {
  const page = parseClipPage(`<a data-preview-src="https://cdn.x.co/sidebar.mp4"></a>`, "https://x.co/v/abcd");
  assert.deepEqual(page, { mp4: null, thumb: null, embedUrl: null });
});
