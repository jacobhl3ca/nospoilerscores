import { chromium } from 'playwright';

// Proves the 9/8 carve-out: "Cover video title" is default-OFF, but a clip whose
// strict-channel gate names UFC / ESPN MMA / DAZN Boxing stays covered anyway.
//
// The gate rides on the fallbackUrl as ?nss_strict=1&nss_channels=… (EventCard
// builds it for UFC events). HomeContent's ?v= + &hu= deep link feeds exactly
// that string into VideoModal's fallbackUrl, so this drives the real production
// path — no UFC event has to be on the slate for the test to run.
const BASE = process.argv[2] || 'http://127.0.0.1:8792';
const VID = 'SXyp-mtBJfs';
const link = (channel, prefs) => {
  const src = channel
    ? `https://www.youtube.com/watch?v=${VID}&nss_strict=1&nss_channels=${encodeURIComponent(channel)}`
    : `https://www.youtube.com/watch?v=${VID}`;
  return `${BASE}/?v=${VID}&hu=${encodeURIComponent(src)}${prefs}`;
};

const b = await chromium.launch({ headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
const pass = [];
const check = (n, ok, x='') => pass.push(`${ok?'PASS':'FAIL'}  ${n}${x?' — '+x:''}`);

// Counts the top title mask: a black, ~42-50px band pinned to the top of the
// player region. Measured off the DOM, not inferred from the pref.
async function topMaskHeight(pref) {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 860 } });
  await ctx.addInitScript(p => localStorage.setItem('nss-preferences', JSON.stringify(p)),
    { skipExplainer: true, skipNewsExplainer: true, theme: 'dark', ...pref });
  const p = await ctx.newPage();
  await p.goto(pref.__url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await p.waitForTimeout(12000);
  const h = await p.evaluate(() => {
    const region = document.getElementById('yt-player')?.closest('.overflow-hidden');
    if (!region) return -1;
    const rr = region.getBoundingClientRect();
    const bands = [...region.querySelectorAll('div[aria-hidden]')].filter(d => {
      const s = getComputedStyle(d), r = d.getBoundingClientRect();
      return s.backgroundColor === 'rgb(0, 0, 0)' && r.height > 20 && r.height < 90
        && Math.abs(r.top - rr.top) < 4 && r.width > rr.width - 4;
    });
    return bands.length ? Math.round(bands[0].getBoundingClientRect().height) : 0;
  });
  await ctx.close();
  return h;
}

for (const ch of ['UFC', 'UFC on Paramount+', 'ESPN MMA', 'DAZN Boxing']) {
  const h = await topMaskHeight({ __url: link(ch, '') });
  check(`${ch}: title stays covered with the pref untouched`, h >= 40 && h <= 52, `mask=${h}px`);
}
{
  const h = await topMaskHeight({ __url: link('UFC', ''), maskVideoTitle: false });
  check('UFC: stays covered even with the pref explicitly OFF', h >= 40 && h <= 52, `mask=${h}px`);
}
{
  const h = await topMaskHeight({ __url: link(null, '') });
  check('ordinary clip: NOT covered (the 9/8 default)', h === 0, `mask=${h}px`);
}
{
  // Turning the pref ON does NOT put a bar over a title the app has already
  // judged clean — titleSafe wins, and has since long before this commit
  // (`maskVideoTitle && !titleSafe`; this change only widened the left operand).
  // Asserting the real rule rather than the one you'd guess from the label.
  const h = await topMaskHeight({ __url: link(null, ''), maskVideoTitle: true });
  check('ordinary clip, clean title: still uncovered with the pref ON (titleSafe wins)', h === 0, `mask=${h}px`);
}
{
  const h = await topMaskHeight({ __url: link('MLB', '') });
  check('a non-listed strict channel (MLB): NOT covered', h === 0, `mask=${h}px`);
}
{
  // A FotMob-sourced soccer official: GameHighlights adds nss_mask_title=1
  // because its uploader (here a league channel that prints the score) is not
  // one of the listed channels. Covered with the pref untouched and with it OFF.
  const src = `https://www.youtube.com/watch?v=${VID}&nss_strict=1&nss_channels=${encodeURIComponent('LALIGA EA SPORTS')}&nss_mask_title=1`;
  const url = `${BASE}/?v=${VID}&hu=${encodeURIComponent(src)}`;
  const h = await topMaskHeight({ __url: url });
  check('FotMob clip (nss_mask_title=1): title stays covered with the pref untouched', h >= 40 && h <= 52, `mask=${h}px`);
  const off = await topMaskHeight({ __url: url, maskVideoTitle: false });
  check('FotMob clip: stays covered even with the pref explicitly OFF', off >= 40 && off <= 52, `mask=${off}px`);
}

console.log(pass.join('\n'));
await b.close();
