// Two title rules for uploaders whose titles do not name the fixture the
// usual way (added 2026-10-17). Pure helpers, shared by the bake
// (scripts/prebake-news.mjs) and the monitor (scripts/check-highlight-fallbacks.mjs).
// The worker (public/_worker.js) keeps a hand copy of the tennis half — see
// TENNIS_TOUR_TITLE_CHANNELS there.

// ── Saudi Pro League: the fixture is in the DESCRIPTION ──────────────────
// The SPL channel titles each match package with the story ("Al Ettifaq
// secure valuable away win at NEOM SC | Powered by Toyota", "Hamdallah breaks
// ALL-TIME record in style 🔥"), often naming one club or none. Its
// description carries the fixture on a line of its own, home club first:
// "NEOM SC v Al Ettifaq highlights | ملخص مباراة نيوم و الاتفاق" (every match
// package of Matchday 9, read 2026-10-17). 0 of 11 Saudi games baked in the
// week before this, because every gate read the title.
export const DESCRIPTION_MATCH_CHANNELS = new Set([
  "الدوري السعودي للمحترفين - Saudi Pro League",
]);

export function isDescriptionMatchChannel(channel) {
  return DESCRIPTION_MATCH_CHANNELS.has(String(channel ?? ""));
}

// The "Home v Away highlights" line of a description, as a title the team
// gates can read, or null. The Arabic half after " | " is dropped.
const MATCH_LINE_RX = /^\s*(.{2,60}?)\s+v\.?\s+(.{2,60}?)\s+highlights\b/i;
export function descriptionMatchLine(description) {
  for (const raw of String(description ?? "").split(/\r?\n/)) {
    const m = raw.match(MATCH_LINE_RX);
    if (m) return `${m[1].trim()} v ${m[2].trim()} highlights`;
  }
  return null;
}

// ── Tennis tour: surname-only titles, and roundups ───────────────────────
// Tennis TV (ATP) and the WTA post one cut per match of every 1000 event.
// Tennis TV often titles with the surname only ("Zverev vs Davidovich
// Fokina"), so a player also matches on the last word of the name. Both also
// post day and round roundups that name several matches; those are not one
// match's package and are refused:
//   "Zverev vs Davidovich Fokina, Jodar vs Medvedev 🍿 | Shanghai 2026 Semi-Finals Highlights"
//   "Tsitsipas Faces Medvedev, Botic Plays Jodar; Ruud & Paul Feature | Shanghai 2026 Highlights Day 8"
export const TENNIS_TOUR_TITLE_CHANNELS = new Set(["Tennis TV", "WTA"]);

export function isTennisTourChannel(channel) {
  return TENNIS_TOUR_TITLE_CHANNELS.has(String(channel ?? ""));
}

export function isTennisRoundupTitle(title) {
  const t = String(title ?? "");
  const head = t.split("|")[0];
  if (/[,;]/.test(head)) return true;
  if ((head.match(/\bvs?\b\.?/gi) ?? []).length > 1) return true;
  if (/\bday\s*\d+\b/i.test(t)) return true;
  // A round roundup says the round in the plural ("Semi-Finals Highlights");
  // a single match says "Shanghai 2026 Highlights" or "2026 Wuhan Semifinal".
  return /\b(?:quarter|semi)[- ]?finals\s+highlights\b/i.test(t);
}

// The last word of a player's name, when it is long enough to stand alone
// ("alexander zverev" → "zverev"), else null. Input is already normalized.
export function playerSurname(normalizedName) {
  const words = String(normalizedName ?? "").split(/[^a-z0-9]+/).filter(Boolean);
  if (words.length < 2) return null;
  const last = words[words.length - 1];
  return last.length >= 4 ? last : null;
}

export function titleHasWord(normalizedTitle, word) {
  if (!word) return false;
  const esc = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${esc}([^a-z0-9]|$)`).test(normalizedTitle);
}

// Title tokens for a tour event: its city, plus the names its uploaders use
// where the city alone is not in the title. Mirrors tennisTourTitleTokens in
// src/lib/youtube.ts.
const TOUR_TITLE_EXTRA = {
  Canada: ["montreal", "toronto", "canadian open", "national bank open"],
  "Monte-Carlo": ["monte carlo"],
  "Indian Wells": ["indian wells"],
  "ATP Finals": ["atp finals", "nitto atp finals"],
  "WTA Finals": ["wta finals"],
};
export function tennisTourTitleTokens(city) {
  if (!city) return [];
  return [...new Set([String(city).toLowerCase(), ...(TOUR_TITLE_EXTRA[city] ?? [])])];
}
