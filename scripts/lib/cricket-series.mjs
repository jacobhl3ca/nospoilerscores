// International cricket series discovery (added 2026-09-27).
//
// ESPN's cricket API is keyed by ESPNcricinfo SERIES id, and there is no
// "all internationals" feed. The one place that lists every series with a
// match on right now is the scoreboard header:
//   https://site.web.api.espn.com/apis/v2/scoreboard/header?sport=cricket
// → sports[0].leagues[] = one entry per live series ({ id, name, events[] }),
// each event carrying `class.internationalClassId` ("0" = domestic) and its two
// competitors by name. Read 2026-09-27: 24203 Australia tour of South Africa,
// 24289 West Indies tour of India, 23802 Sri Lanka tour of England and 24796
// West Indies Women in Zimbabwe, next to County Championship, CSA T20,
// President's Trophy, Hong Kong club cricket and an Under-19 Test.
//
// The header only shows series with a match on or around today, so the bake
// MERGES each run into the previous file and keeps a series until a few days
// after its last scheduled day. The worker (/api/cricket-intl) reads the file
// to know which series scoreboards to ask for a given date.
//
// Shared by scripts/prebake-news.mjs (the bake) and the unit test. The worker
// keeps its own copy of FULL_MEMBERS and isInternationalEvent — keep in sync.

// The twelve ICC full members. Associates (Nepal, Netherlands, USA …) are left
// out on purpose: their fixtures crowd the column with games few US fans look
// for, and the header mixes them with domestic "A" and club sides.
export const FULL_MEMBERS = new Set([
  "Afghanistan", "Australia", "Bangladesh", "England", "India", "Ireland",
  "New Zealand", "Pakistan", "South Africa", "Sri Lanka", "West Indies", "Zimbabwe",
]);

// "Zimbabwe Women" → "Zimbabwe". "India Under-19s", "Nigeria A" and "India A"
// keep their suffix, so they never match a full member.
export function nationOf(name) {
  return String(name ?? "").trim().replace(/\s+Women$/, "");
}

// A match between two full members, in an international class. The class check
// drops tour games against a board XI ("Other match", class 0) that sit inside
// an international series.
export function isInternationalEvent(event) {
  const cls = event?.class ?? event?.competitions?.[0]?.class ?? {};
  if (String(cls.internationalClassId ?? "0") === "0") return false;
  const comps = event?.competitors ?? event?.competitions?.[0]?.competitors ?? [];
  if (comps.length !== 2) return false;
  return comps.every((c) => FULL_MEMBERS.has(nationOf(c?.displayName ?? c?.team?.displayName)));
}

// header JSON → [{ id, name }] for every series with at least one qualifying
// match in it right now.
export function pickInternationalSeries(header) {
  const leagues = header?.sports?.[0]?.leagues ?? [];
  const out = [];
  for (const lg of leagues) {
    const id = String(lg?.id ?? "").trim();
    if (!/^\d+$/.test(id)) continue;
    if (!(lg.events ?? []).some(isInternationalEvent)) continue;
    out.push({ id, name: String(lg.name ?? "") });
  }
  return out;
}

// prev = the last file's series[], fresh = this run's [{ id, name, start, end }].
// Keep every fresh series, and every earlier one whose last day is no more than
// `keepDays` behind today (a Test series has rest days the header skips).
export function mergeSeries(prev, fresh, todayIso, keepDays = 3) {
  const cutoff = new Date(Date.parse(`${todayIso}T00:00:00Z`) - keepDays * 86400_000).toISOString().slice(0, 10);
  const byId = new Map();
  for (const s of prev ?? []) {
    if (s?.id && (s.end ?? "") >= cutoff) byId.set(s.id, s);
  }
  for (const s of fresh ?? []) byId.set(s.id, { ...byId.get(s.id), ...s });
  return [...byId.values()].sort((a, b) => (a.start ?? "").localeCompare(b.start ?? "") || a.id.localeCompare(b.id));
}
