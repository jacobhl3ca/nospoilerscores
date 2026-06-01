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
  nhl: "/hockey/nhl/scoreboard",
  fifa: "/soccer/fifa.world/scoreboard",
  epl: "/soccer/eng.1/scoreboard",
  mls: "/soccer/usa.1/scoreboard",
  ucl: "/soccer/uefa.champions/scoreboard",
  uel: "/soccer/uefa.europa/scoreboard",
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

async function renderCard(meta) {
  const W = 1200, H = 630;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");
  const ACCENT = "#60a5fa", MUTED = "#94a3b8", BRAND = "#3b82f6";

  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#0f172a");
  bg.addColorStop(1, "#0a0a0a");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W / 2, 250, 40, W / 2, 250, 520);
  glow.addColorStop(0, "rgba(96,165,250,0.10)");
  glow.addColorStop(1, "rgba(96,165,250,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  // Brand mark: blue circle + white "H" (matches the site logo), then wordmark.
  ctx.beginPath();
  ctx.arc(84, 80, 22, 0, Math.PI * 2);
  ctx.fillStyle = BRAND;
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.font = `700 26px ${SANS}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("H", 84, 82);
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#f8fafc";
  ctx.font = `700 38px ${SANS}`;
  ctx.fillText("HideScore", 118, 92);
  ctx.textAlign = "right";
  ctx.fillStyle = ACCENT;
  ctx.font = `600 26px ${SANS}`;
  ctx.fillText("SPOILER-FREE", W - 64, 90);

  const [awayLogo, homeLogo] = await Promise.all([safeLoad(meta.away.logo), safeLoad(meta.home.logo)]);
  const cy = 270, box = 188, leftX = 348, rightX = W - 348;
  const drawLogo = (img, cx, abbr) => {
    if (img) {
      const s = Math.min(box / img.width, box / img.height);
      ctx.drawImage(img, cx - (img.width * s) / 2, cy - (img.height * s) / 2, img.width * s, img.height * s);
      return;
    }
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, box / 2, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,255,255,0.08)";
    ctx.fill();
    ctx.fillStyle = "#e5e7eb";
    ctx.font = `700 ${Math.round(box * 0.34)}px ${SANS}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText((abbr || "?").slice(0, 4).toUpperCase(), cx, cy + 2);
    ctx.restore();
  };
  drawLogo(awayLogo, leftX, meta.away.abbr);
  drawLogo(homeLogo, rightX, meta.home.abbr);

  ctx.fillStyle = MUTED;
  ctx.font = `300 64px ${SANS}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("@", W / 2, cy);

  const drawName = (name, x) => {
    let size = 48;
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    do {
      ctx.font = `700 ${size}px ${SANS}`;
      if (ctx.measureText(name.toUpperCase()).width <= 460) break;
      size -= 2;
    } while (size > 26);
    ctx.fillStyle = "#f8fafc";
    ctx.fillText(name.toUpperCase(), x, cy + box / 2 + 64);
  };
  drawName(meta.away.name, leftX);
  drawName(meta.home.name, rightX);

  ctx.textAlign = "center";
  ctx.fillStyle = MUTED;
  ctx.font = `500 30px ${SANS}`;
  ctx.fillText(`${meta.dateLabel} · ${meta.league}`, W / 2, 540);
  ctx.fillStyle = ACCENT;
  ctx.font = `600 30px ${SANS}`;
  ctx.fillText("▸ Watch the highlight", W / 2, 588);

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

await main();
