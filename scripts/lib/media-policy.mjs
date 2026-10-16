// Per-source off switch for in-app video playback (added 2026-10-13, before the
// Product Hunt launch). If a rights owner sends a takedown notice, the bake
// strips that source's play URLs. The card then has no playable URL, and the
// client already falls back to opening articleUrl in a new tab.
//
// RUNBOOK (the Mac mini owns the bake)
//   Turn a class off:   ssh jakeh@100.69.74.78 'echo mlb >> ~/.config/hidescore/media-off'
//                       (LAN fallback: jakeh@192.168.99.63)
//   When it applies:    on each feed's next bake. Reddit cron every 30 min, full bake hourly.
//   Turn it back on:    delete that line from the file.
//   Check:              the bake log has one line, `MEDIA-OFF classes=<list or -> stripped=<n>`.
//
// Classes (the file holds one per line, `#` starts a comment; env MEDIA_OFF=a,b is merged in):
//   mlb        MLB statsapi / mlb.com HLS (news item playbackUrl)
//   vreddit    Reddit-hosted video: v.redd.it HLS/mp4 and Reddit's own GIF mp4s
//   cliphosts  every other external clip host videoUrl (streamff, streamin, dropr,
//              streamable, hostedhost, sportits, imgur mp4, generic clip-host mp4s)
//   espn       ESPN Videos clips and the La Liga game-card espnClipUrl
//   all        every class above
// YouTube ids and NHL Brightcove embedUrl are official players and are never touched.
//
// The file lives OUTSIDE the repo on purpose: the mini resets its checkout to
// origin/main every bake, so a flag inside the repo would not survive.
//
// NOT covered (live in the client, or other bake files): the per-game MLB/NHL
// recap and condensed buttons, recaps.json, mlb-review.json, shared links that
// carry `?hs=<stream url>`. A manual GitHub Actions bake does not see the file;
// set MEDIA_OFF in that workflow's env.

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const MEDIA_CLASSES = ["mlb", "vreddit", "cliphosts", "espn"];
export const DEFAULT_MEDIA_OFF_FILE = join(homedir(), ".config", "hidescore", "media-off");

// Fields that hold a play URL on a news item. embedUrl and youtubeVideoId stay.
const PLAY_FIELDS = ["playbackUrl", "videoUrl"];

// Official players: left alone whatever a field holds.
const OFFICIAL_PLAYER_HOSTS = ["youtube.com", "youtu.be", "youtube-nocookie.com", "brightcove.net"];
const HOST_CLASSES = [
  ["mlb", ["mlb.com", "mlbstatic.com"]],
  ["vreddit", ["redd.it", "reddit.com", "redditmedia.com"]],
  ["espn", ["akamaized.net", "espn.com", "espncdn.com"]],
];

const hostIs = (host, domain) => host === domain || host.endsWith(`.${domain}`);

// Which class a play URL belongs to, by host: "mlb" | "vreddit" | "espn" |
// "cliphosts", or null when it is not an http(s) URL or is an official player.
// Anything that is not MLB, Reddit or ESPN is a clip host.
export function classifyMediaUrl(url) {
  if (typeof url !== "string" || !url.trim()) return null;
  const raw = url.trim();
  let u;
  try {
    u = new URL(raw.startsWith("//") ? `https:${raw}` : raw);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  const host = u.hostname.toLowerCase();
  if (OFFICIAL_PLAYER_HOSTS.some((d) => hostIs(host, d))) return null;
  for (const [cls, domains] of HOST_CLASSES) {
    if (domains.some((d) => hostIs(host, d))) return cls;
  }
  return "cliphosts";
}

function tokens(text) {
  return String(text ?? "")
    .split(/\r?\n/)
    .flatMap((line) => line.replace(/#.*$/, "").split(/[\s,]+/))
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
}

// The classes that are off, plus what was ignored:
//   off       Set of MEDIA_CLASSES ("all" is expanded to every class)
//   unknown   names that are not a class (a typo turns nothing off, so the caller warns)
//   fileError why the file could not be read, else null (a missing file is not an error)
// Sources, merged: env MEDIA_OFF (comma list) and the file (default
// ~/.config/hidescore/media-off). `file: null` skips the file.
export function readMediaOffDetailed({ env = process.env, file = DEFAULT_MEDIA_OFF_FILE, read = readFileSync } = {}) {
  const names = tokens(env?.MEDIA_OFF);
  let fileError = null;
  if (file) {
    try {
      names.push(...tokens(read(file, "utf8")));
    } catch (e) {
      if (e?.code !== "ENOENT") fileError = `${file}: ${e?.message || e}`;
    }
  }
  const off = new Set();
  const unknown = [];
  for (const name of names) {
    if (name === "all") MEDIA_CLASSES.forEach((c) => off.add(c));
    else if (MEDIA_CLASSES.includes(name)) off.add(name);
    else if (!unknown.includes(name)) unknown.push(name);
  }
  return { off, unknown, fileError };
}

export function readMediaOff(opts) {
  return readMediaOffDetailed(opts).off;
}

const isOff = (off, cls) => !!cls && !!off && (off.has("all") || off.has(cls));

// New items with every play URL of an off class set to null, plus how many
// items lost one. Never mutates; an item that changes is copied, any other is
// returned as is. Only playbackUrl / videoUrl change: articleUrl, headline,
// images, youtubeVideoId and embedUrl are left exactly as they were.
export function applyMediaPolicyCounted(items, off) {
  let stripped = 0;
  const out = (Array.isArray(items) ? items : []).map((item) => {
    if (!item || typeof item !== "object") return item;
    let next = null;
    for (const field of PLAY_FIELDS) {
      if (item[field] && isOff(off, classifyMediaUrl(item[field]))) {
        next ??= { ...item };
        next[field] = null;
      }
    }
    if (!next) return item;
    stripped++;
    return next;
  });
  return { items: out, stripped };
}

export function applyMediaPolicy(items, off) {
  return applyMediaPolicyCounted(items, off).items;
}

// "mlb,espn", "all" when every class is off, "-" when none is.
export function describeMediaOff(off) {
  const on = MEDIA_CLASSES.filter((c) => isOff(off, c));
  if (on.length === 0) return "-";
  return on.length === MEDIA_CLASSES.length ? "all" : on.join(",");
}

// The one line each bake prints.
export function mediaOffLogLine(off, stripped) {
  return `MEDIA-OFF classes=${describeMediaOff(off)} stripped=${stripped}`;
}
