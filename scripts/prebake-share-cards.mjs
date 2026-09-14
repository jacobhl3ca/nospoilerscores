// Prebake share-card preview images for finished games and write them to
// ./share-cards-out/<key>.png. The deploy/cron workflow uploads each to the
// `hidescore-data` R2 bucket at `cards/<key>.png`, where the worker serves them
// and injects them as the OG image for shared highlight links (?c=<key>).
//
// Rendering lives here (Node + node-canvas), NOT in the browser: Firefox's
// resistFingerprinting randomizes canvas readback and corrupts a client-side
// export. node-canvas in CI has no such issue.
//
// The card key MUST match src/lib/shareCard.ts buildShareCard() and the worker's
// CARD_KEY_RE, or a shared link's ?c= won't find its image:
//   `${sport}-${awayAbbr}-${homeAbbr}-${YYYYMMDD}`   (lowercased, ET date)

import { createCanvas, loadImage } from "canvas";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";

const BASE = "https://site.api.espn.com/apis/site/v2/sports";
// Two-team leagues only — golf/tennis highlights aren't a matchup card.
const LEAGUE_PATHS = {
  mlb: "/baseball/mlb/scoreboard",
  nba: "/basketball/nba/scoreboard",
  wnba: "/basketball/wnba/scoreboard",
  ncaam: "/basketball/mens-college-basketball/scoreboard",
  ncaaw: "/basketball/womens-college-basketball/scoreboard",
  ncaaf: "/football/college-football/scoreboard",
  nfl: "/football/nfl/scoreboard",
  ufl: "/football/ufl/scoreboard",
  nhl: "/hockey/nhl/scoreboard",
  ncaah: "/hockey/mens-college-hockey/scoreboard",
  ncaabase: "/baseball/college-baseball/scoreboard",
  ncaasoft: "/baseball/college-softball/scoreboard",
  fifa: "/soccer/fifa.world/scoreboard",
  epl: "/soccer/eng.1/scoreboard",
  mls: "/soccer/usa.1/scoreboard",
  ucl: "/soccer/uefa.champions/scoreboard",
  uel: "/soccer/uefa.europa/scoreboard",
  laliga: "/soccer/esp.1/scoreboard",
  seriea: "/soccer/ita.1/scoreboard",
  bundesliga: "/soccer/ger.1/scoreboard",
  ligue1: "/soccer/fra.1/scoreboard",
};

const OUT_DIR = "./share-cards-out";
const SANS = "sans-serif";

const sanitize = (s) => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

function etYmd(iso) {
  return new Date(iso)
    .toLocaleDateString("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" })
    .replace(/-/g, "");
}
function etDateLabel(iso) {
  return new Date(iso)
    .toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "America/New_York" })
    .replace(", ", " · ");
}
// Query dates (ET) for yesterday + today so just-finished games are covered.
function queryDates() {
  const fmt = (d) =>
    d.toLocaleDateString("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).replace(/-/g, "");
  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 3600 * 1000);
  return [...new Set([fmt(yesterday), fmt(now)])];
}

async function safeLoad(url) {
  try {
    return await loadImage(url);
  } catch {
    return null;
  }
}

// Mean luminance (0=black … 1=white) of a logo's opaque pixels. Dark logos
// (Yankees navy, all-black marks) vanish on the dark card, so we detect them and
// drop a light backing chip behind ONLY those — colorful/light logos (Red Sox
// red ≈0.25, most others 0.3+) are left exactly as they were.
function logoLuminance(img) {
  const s = 48;
  const c = createCanvas(s, s).getContext("2d");
  const k = Math.min(s / img.width, s / img.height);
  const w = img.width * k, h = img.height * k;
  c.drawImage(img, (s - w) / 2, (s - h) / 2, w, h);
  const { data } = c.getImageData(0, 0, s, s);
  let sum = 0, n = 0;
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3];
    if (a < 40) continue; // ignore transparent padding
    const L = (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255;
    sum += L * (a / 255);
    n += a / 255;
  }
  return n > 0 ? sum / n : 1;
}

// Rounded-rect path helper — ctx.roundRect isn't guaranteed across node-canvas
// versions, so trace it by hand.
function roundRect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Small "hidden eye" glyph drawn as vectors — the spoiler-free cue. (node-canvas
// can't render the 🙈 emoji in CI without a color-emoji font, so it's drawn.)
function drawEyeOff(ctx, cx, cy, color) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(cx - 9, cy);
  ctx.quadraticCurveTo(cx, cy - 7, cx + 9, cy);
  ctx.quadraticCurveTo(cx, cy + 7, cx - 9, cy);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, 2.3, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(cx - 11, cy + 9);
  ctx.lineTo(cx + 11, cy - 9);
  ctx.stroke();
  ctx.restore();
}

// Render one spoiler-free matchup card (1200×630). Shares the design language of
// the default site card (public/og-image.png): deep gradient + accent glow + dot
// grid + vignette + the rounded-square H mark. Shows the two teams + date — never
// a score or a spoiler-y thumbnail. Exported for the local preview harness.
export async function renderCard(meta) {
  const W = 1200, H = 630;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");
  const ACCENT = "#60a5fa", MUTED = "#9ca3af", INK = "#f8fafc";

  // background gradient
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#0b1322");
  bg.addColorStop(1, "#070708");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // accent glow (top center) + soft lower glow
  let glow = ctx.createRadialGradient(W / 2, 140, 30, W / 2, 140, 640);
  glow.addColorStop(0, "rgba(37,99,235,0.32)");
  glow.addColorStop(1, "rgba(37,99,235,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);
  glow = ctx.createRadialGradient(W / 2, H + 70, 40, W / 2, H + 70, 480);
  glow.addColorStop(0, "rgba(96,165,250,0.12)");
  glow.addColorStop(1, "rgba(96,165,250,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  // dot-grid texture
  ctx.fillStyle = "rgba(255,255,255,0.04)";
  for (let y = 26; y < H; y += 26) {
    for (let x = 26; x < W; x += 26) {
      ctx.beginPath();
      ctx.arc(x, y, 1.1, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // vignette
  const vig = ctx.createRadialGradient(W / 2, H / 2, 220, W / 2, H / 2, 780);
  vig.addColorStop(0, "rgba(0,0,0,0)");
  vig.addColorStop(1, "rgba(0,0,0,0.55)");
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, W, H);

  // top accent hairline
  const hair = ctx.createLinearGradient(0, 0, W, 0);
  hair.addColorStop(0, "rgba(37,99,235,0)");
  hair.addColorStop(0.5, "#3b82f6");
  hair.addColorStop(1, "rgba(37,99,235,0)");
  ctx.fillStyle = hair;
  ctx.fillRect(0, 0, W, 5);

  // ---- header: rounded-square H mark + wordmark + spoiler-free pill ----
  const mX = 64, mY = 50, mS = 64, mR = 16;
  ctx.save();
  ctx.shadowColor = "rgba(37,99,235,0.55)";
  ctx.shadowBlur = 26;
  ctx.shadowOffsetY = 8;
  const mg = ctx.createLinearGradient(mX, mY, mX + mS, mY + mS);
  mg.addColorStop(0, "#3b82f6");
  mg.addColorStop(1, "#1d4ed8");
  ctx.fillStyle = mg;
  roundRect(ctx, mX, mY, mS, mS, mR);
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = "rgba(255,255,255,0.20)";
  ctx.lineWidth = 1.5;
  roundRect(ctx, mX + 1, mY + 1, mS - 2, mS - 2, mR - 1);
  ctx.stroke();
  ctx.fillStyle = "#fff";
  ctx.font = `800 38px ${SANS}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("H", mX + mS / 2, mY + mS / 2 + 2);

  ctx.textAlign = "left";
  ctx.fillStyle = INK;
  ctx.font = `800 40px ${SANS}`;
  ctx.fillText("HideScore", mX + mS + 22, mY + mS / 2 + 1);

  ctx.font = `700 22px ${SANS}`;
  const pTxt = "SPOILER-FREE";
  const pTw = ctx.measureText(pTxt).width;
  const pPad = 20, pH = 42, pW = pPad + 24 + 8 + pTw + pPad, pX = W - 64 - pW, pY = mY + (mS - pH) / 2;
  ctx.fillStyle = "rgba(37,99,235,0.16)";
  roundRect(ctx, pX, pY, pW, pH, pH / 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(96,165,250,0.55)";
  ctx.lineWidth = 1.5;
  roundRect(ctx, pX, pY, pW, pH, pH / 2);
  ctx.stroke();
  drawEyeOff(ctx, pX + pPad + 10, pY + pH / 2, ACCENT);
  ctx.fillStyle = ACCENT;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(pTxt, pX + pPad + 24 + 8, pY + pH / 2 + 1);

  // ---- matchup: logos + @ + names ----
  const [awayLogo, homeLogo] = await Promise.all([safeLoad(meta.away.logo), safeLoad(meta.home.logo)]);
  const cy = 292, box = 180, leftX = 352, rightX = W - 352;
  const drawLogo = (img, cx, abbr) => {
    if (img) {
      // Back dark logos with a light chip so they read on the dark card; leave
      // colorful/light logos untouched (see logoLuminance).
      const dark = logoLuminance(img) < 0.20;
      if (dark) {
        ctx.save();
        ctx.shadowColor = "rgba(0,0,0,0.45)";
        ctx.shadowBlur = 22;
        ctx.shadowOffsetY = 8;
        ctx.fillStyle = "rgba(246,248,251,0.96)";
        ctx.beginPath();
        ctx.arc(cx, cy, box / 2 + 10, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        ctx.strokeStyle = "rgba(255,255,255,0.45)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(cx, cy, box / 2 + 10, 0, Math.PI * 2);
        ctx.stroke();
      }
      // Inset dark logos a touch so they sit inside the chip with padding.
      const s = Math.min(box / img.width, box / img.height) * (dark ? 0.82 : 1);
      ctx.save();
      if (!dark) {
        ctx.shadowColor = "rgba(0,0,0,0.45)";
        ctx.shadowBlur = 24;
        ctx.shadowOffsetY = 8;
      }
      ctx.drawImage(img, cx - (img.width * s) / 2, cy - (img.height * s) / 2, img.width * s, img.height * s);
      ctx.restore();
      return;
    }
    ctx.beginPath();
    ctx.arc(cx, cy, box / 2, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,255,255,0.07)";
    ctx.fill();
    ctx.fillStyle = "#e5e7eb";
    ctx.font = `800 ${Math.round(box * 0.32)}px ${SANS}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText((abbr || "?").slice(0, 4).toUpperCase(), cx, cy + 2);
  };
  drawLogo(awayLogo, leftX, meta.away.abbr);
  drawLogo(homeLogo, rightX, meta.home.abbr);

  // center "@" in a soft ring
  ctx.beginPath();
  ctx.arc(W / 2, cy, 38, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255,255,255,0.05)";
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.12)";
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.fillStyle = MUTED;
  ctx.font = `400 40px ${SANS}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("@", W / 2, cy + 2);

  // team names (auto-fit to ~470px)
  const drawName = (name, x) => {
    let size = 46;
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    do {
      ctx.font = `800 ${size}px ${SANS}`;
      if (ctx.measureText(name.toUpperCase()).width <= 470) break;
      size -= 2;
    } while (size > 24);
    ctx.fillStyle = INK;
    ctx.fillText(name.toUpperCase(), x, cy + box / 2 + 60);
  };
  drawName(meta.away.name, leftX);
  drawName(meta.home.name, rightX);

  // ---- footer: date · league + Watch-the-highlight pill ----
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = MUTED;
  ctx.font = `500 29px ${SANS}`;
  ctx.fillText(`${meta.dateLabel}  ·  ${meta.league}`, W / 2, 524);

  ctx.font = `700 26px ${SANS}`;
  const wTxt = "Watch the highlight";
  const wTw = ctx.measureText(wTxt).width;
  const wPad = 26, wH = 52, wW = wPad + 16 + 12 + wTw + wPad, wX = (W - wW) / 2, wY = 556;
  ctx.fillStyle = "rgba(37,99,235,0.18)";
  roundRect(ctx, wX, wY, wW, wH, wH / 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(96,165,250,0.5)";
  ctx.lineWidth = 1.5;
  roundRect(ctx, wX, wY, wW, wH, wH / 2);
  ctx.stroke();
  const tX = wX + wPad, tY = wY + wH / 2;
  ctx.fillStyle = ACCENT;
  ctx.beginPath();
  ctx.moveTo(tX, tY - 9);
  ctx.lineTo(tX, tY + 9);
  ctx.lineTo(tX + 16, tY);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#dbeafe";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(wTxt, tX + 16 + 12, tY + 1);

  return canvas.toBuffer("image/png");
}

async function fetchScoreboard(sport, ymd) {
  const url = `${BASE}${LEAGUE_PATHS[sport]}?dates=${ymd}`;
  try {
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (hidescore share-card prebake)" } });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data.events) ? data.events : [];
  } catch {
    return [];
  }
}

// Turn one ESPN event into card metadata, or null if it isn't a finished,
// two-team game we can make a matchup card from.
function eventToMeta(sport, event) {
  if (!event?.status?.type?.completed) return null;
  const comp = event.competitions?.[0];
  const competitors = comp?.competitors || [];
  const home = competitors.find((c) => c.homeAway === "home");
  const away = competitors.find((c) => c.homeAway === "away");
  if (!home?.team || !away?.team) return null;

  const aAbbr = sanitize(away.team.abbreviation || away.team.shortDisplayName);
  const hAbbr = sanitize(home.team.abbreviation || home.team.shortDisplayName);
  if (!aAbbr || !hAbbr) return null;

  const ymd = etYmd(event.date);
  return {
    key: `${sport}-${aAbbr}-${hAbbr}-${ymd}`,
    away: {
      name: away.team.shortDisplayName || away.team.displayName || away.team.abbreviation,
      abbr: away.team.abbreviation || "",
      logo: away.team.logo || "",
    },
    home: {
      name: home.team.shortDisplayName || home.team.displayName || home.team.abbreviation,
      abbr: home.team.abbreviation || "",
      logo: home.team.logo || "",
    },
    dateLabel: etDateLabel(event.date),
    league: sport.toUpperCase(),
  };
}

async function main() {
  rmSync(OUT_DIR, { recursive: true, force: true });
  mkdirSync(OUT_DIR, { recursive: true });

  const dates = queryDates();
  const seen = new Set();
  let rendered = 0;

  for (const sport of Object.keys(LEAGUE_PATHS)) {
    for (const ymd of dates) {
      const events = await fetchScoreboard(sport, ymd);
      for (const event of events) {
        const meta = eventToMeta(sport, event);
        if (!meta || seen.has(meta.key)) continue;
        seen.add(meta.key);
        try {
          const buf = await renderCard(meta);
          writeFileSync(`${OUT_DIR}/${meta.key}.png`, buf);
          rendered++;
        } catch (e) {
          console.error(`render failed for ${meta.key}:`, e.message);
        }
      }
    }
  }

  console.log(`Rendered ${rendered} share cards to ${OUT_DIR} (dates: ${dates.join(", ")})`);
}

// Run main() only when executed directly (node scripts/prebake-share-cards.mjs),
// not when imported by the local preview harness.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await main();
}
