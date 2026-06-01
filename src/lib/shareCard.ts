// Share-card previews for highlight links.
//
// When a highlight link is shared into iMessage / Slack / Twitter, the unfurled
// preview should show the two teams + the date — not a generic site image or a
// spoiler-y YouTube thumbnail. We can't generate images in the Cloudflare Pages
// worker without blowing the free-plan bundle-size limit (Satori/resvg WASM), so
// instead the BROWSER draws the card to a <canvas> at share time (it already has
// the team logos loaded and fonts ready) and POSTs the PNG to the worker, which
// stores it in R2 at `cards/<key>.png`. The worker then swaps the page's OG meta
// to point at that image for any `?c=<key>` link (see public/_worker.js).
//
// The card key format is the contract between this file and the worker's
// validation regex + OG-title reconstruction — keep them in sync:
//   `${sport}-${awayAbbr}-${homeAbbr}-${YYYYMMDD}`   (all lowercased, ET date)

import type { Game } from "./types";

export interface ShareCardMeta {
  key: string;
  away: { name: string; abbr: string; logo: string };
  home: { name: string; abbr: string; logo: string };
  dateLabel: string; // "Fri · May 30, 2026"
  league: string; // "MLB"
}

const sanitize = (s: string) => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

/** Build the share-card metadata for a finished game. Derives a stable, ET-pinned key. */
export function buildShareCard(game: Game, leagueLabel?: string): ShareCardMeta | null {
  const away = game.awayTeam;
  const home = game.homeTeam;
  // TBD/placeholder teams (future playoff slots) can't make a meaningful card.
  if (!away?.abbreviation && !away?.shortDisplayName) return null;
  if (!home?.abbreviation && !home?.shortDisplayName) return null;

  const d = new Date(game.date);
  // ET calendar date → YYYYMMDD. en-CA renders as YYYY-MM-DD; strip dashes.
  const ymd = d
    .toLocaleDateString("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" })
    .replace(/-/g, "");
  const a = sanitize(away.abbreviation || away.shortDisplayName);
  const h = sanitize(home.abbreviation || home.shortDisplayName);
  if (!a || !h) return null;

  const key = `${game.sport}-${a}-${h}-${ymd}`;
  const dateLabel = d
    .toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "America/New_York" })
    .replace(", ", " · "); // "Fri, May 30, 2026" → "Fri · May 30, 2026"

  return {
    key,
    away: { name: away.shortDisplayName || away.displayName, abbr: away.abbreviation, logo: away.logo },
    home: { name: home.shortDisplayName || home.displayName, abbr: home.abbreviation, logo: home.logo },
    dateLabel,
    league: leagueLabel || game.sport.toUpperCase(),
  };
}

// Logos come from ESPN's CDN, which taints a <canvas> if drawn directly. We
// route them through the worker's /api/logo proxy (adds ACAO:*) and decode via
// createImageBitmap so the canvas stays clean and toBlob() won't throw.
async function loadLogo(logoUrl: string): Promise<ImageBitmap | null> {
  if (!logoUrl) return null;
  try {
    const res = await fetch(`/api/logo?u=${encodeURIComponent(logoUrl)}`);
    if (!res.ok) return null;
    return await createImageBitmap(await res.blob());
  } catch {
    return null;
  }
}

const SANS = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

// Draw a logo "contain"-fitted and centered inside a square box, or fall back to
// an accent circle with the abbreviation when the logo couldn't be loaded.
function drawLogo(
  ctx: CanvasRenderingContext2D,
  img: ImageBitmap | null,
  cx: number,
  cy: number,
  box: number,
  abbr: string,
) {
  if (img) {
    const scale = Math.min(box / img.width, box / img.height);
    const w = img.width * scale;
    const h = img.height * scale;
    ctx.drawImage(img, cx - w / 2, cy - h / 2, w, h);
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
}

/** Render the 1200×630 preview card to a PNG blob in the browser. */
export async function renderShareCardBlob(meta: ShareCardMeta): Promise<Blob | null> {
  if (typeof document === "undefined") return null;
  // Make sure web fonts are settled so text metrics are stable.
  try {
    await (document as Document & { fonts?: { ready?: Promise<unknown> } }).fonts?.ready;
  } catch {
    /* fonts API optional */
  }

  const W = 1200;
  const H = 630;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const [awayLogo, homeLogo] = await Promise.all([loadLogo(meta.away.logo), loadLogo(meta.home.logo)]);

  const ACCENT = "#60a5fa";
  const MUTED = "#94a3b8";

  // Background — subtle top-to-bottom dark gradient.
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#0f172a");
  bg.addColorStop(1, "#0a0a0a");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  // Faint accent glow behind the matchup.
  const glow = ctx.createRadialGradient(W / 2, 250, 40, W / 2, 250, 520);
  glow.addColorStop(0, "rgba(96,165,250,0.10)");
  glow.addColorStop(1, "rgba(96,165,250,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  // Header — brand mark left, spoiler-free tag right.
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  ctx.font = `400 38px ${SANS}`;
  ctx.fillText("🙈", 64, 96);
  ctx.fillStyle = "#f8fafc";
  ctx.font = `700 38px ${SANS}`;
  ctx.fillText("HideScore", 116, 96);

  ctx.textAlign = "right";
  ctx.fillStyle = ACCENT;
  ctx.font = `600 26px ${SANS}`;
  ctx.fillText("SPOILER-FREE", W - 64, 92);

  // Matchup — two logos with "@" between, names beneath.
  const cy = 270;
  const box = 188;
  const leftX = 348;
  const rightX = W - 348;
  drawLogo(ctx, awayLogo, leftX, cy, box, meta.away.abbr);
  drawLogo(ctx, homeLogo, rightX, cy, box, meta.home.abbr);

  ctx.fillStyle = MUTED;
  ctx.font = `300 64px ${SANS}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("@", W / 2, cy);

  // Team names beneath each logo (auto-shrink to fit the half-width).
  const drawName = (name: string, x: number) => {
    const maxW = 460;
    let size = 48;
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    do {
      ctx.font = `700 ${size}px ${SANS}`;
      if (ctx.measureText(name.toUpperCase()).width <= maxW) break;
      size -= 2;
    } while (size > 26);
    ctx.fillStyle = "#f8fafc";
    ctx.fillText(name.toUpperCase(), x, cy + box / 2 + 64);
  };
  drawName(meta.away.name, leftX);
  drawName(meta.home.name, rightX);

  // Date + league.
  ctx.textAlign = "center";
  ctx.fillStyle = MUTED;
  ctx.font = `500 30px ${SANS}`;
  ctx.fillText(`${meta.dateLabel} · ${meta.league}`, W / 2, 540);

  // Call to action.
  ctx.fillStyle = ACCENT;
  ctx.font = `600 30px ${SANS}`;
  ctx.fillText("▸ Watch the highlight", W / 2, 588);

  return await new Promise<Blob | null>((resolve) => canvas.toBlob((b) => resolve(b), "image/png"));
}

// Keys rendered+uploaded this session — avoid re-doing the work on repeat shares.
const uploaded = new Set<string>();

/**
 * Ensure the share card for `meta` exists in R2 so the link preview unfurls with
 * the matchup image. Best-effort: a failure just means the link falls back to the
 * default site preview, so callers should not block sharing on it.
 */
export async function ensureShareCardUploaded(meta: ShareCardMeta): Promise<void> {
  if (uploaded.has(meta.key)) return;
  const blob = await renderShareCardBlob(meta);
  if (!blob) return;
  const res = await fetch(`/api/card-upload?key=${encodeURIComponent(meta.key)}`, {
    method: "POST",
    headers: { "Content-Type": "image/png" },
    body: blob,
  });
  if (res.ok) uploaded.add(meta.key);
}

/** The hidescore.com share link for a highlight: opens the clip in-app, unfurls as the matchup card. */
export function shareCardUrl(meta: ShareCardMeta, youtubeId?: string | null): string {
  const v = youtubeId ? `v=${encodeURIComponent(youtubeId)}&` : "";
  return `https://hidescore.com/?${v}c=${encodeURIComponent(meta.key)}`;
}
