// Competition climbing (World Climbing Series / IFSC World Cups), added
// 2026-10-03. The pure half of the climbing column: row labels, the day
// subtitle, which rounds are shown, and the stream URL helpers. No imports, so
// the unit tests load it under plain node.
//
// The data is /api/climbing (public/_worker.js), which reads the
// sportclimbing/ifsc-calendar schedule and reduces each finished final to one
// 0-100 rating. ⛔ Nothing here may name an athlete: a semi or final start list
// shows who advanced, and that is a result.

export type ClimbDiscipline = "boulder" | "lead" | "speed";
export type ClimbKind = "qualification" | "semi-final" | "final";
export type ClimbCategory = "men" | "women";

// Where "Watch live" goes before World Climbing has listed the round's own
// stream: the channel's live tab, which shows whatever is on now.
export const CLIMB_LIVE_FALLBACK = "https://www.youtube.com/@worldclimbing/live";

// The exact YouTube author_name of World Climbing's channel (@worldclimbing),
// read off oembed on 2026-10-03 for four 2026 streams.
export const CLIMB_CHANNEL = "World Climbing";

const DISCIPLINE_WORD: Record<ClimbDiscipline, string> = { boulder: "Boulder", lead: "Lead", speed: "Speed" };
const KIND_WORDS: Record<ClimbKind, string[]> = {
  qualification: ["Qualification", "Quals", "Q"],
  "semi-final": ["Semi-final", "Semi", "SF"],
  final: ["Final", "Final", "F"],
};

// Longest first, for the tile's one-line fit ladder (FittedLine):
//   "Women's Lead Semi-final" → "Women's Lead Semi" → "W Lead Semi" → "W Lead SF"
export function climbRoundLabelVariants(r: { category: ClimbCategory; discipline: ClimbDiscipline; kind: ClimbKind }): string[] {
  const who = r.category === "women" ? "Women's" : "Men's";
  const w = r.category === "women" ? "W" : "M";
  const d = DISCIPLINE_WORD[r.discipline];
  const [full, short, tiny] = KIND_WORDS[r.kind];
  const out = [`${who} ${d} ${full}`, `${who} ${d} ${short}`, `${w} ${d} ${short}`, `${w} ${d} ${tiny}`];
  return out.filter((v, i) => out.indexOf(v) === i);
}

export function climbRoundLabel(r: { category: ClimbCategory; discipline: ClimbDiscipline; kind: ClimbKind }): string {
  return climbRoundLabelVariants(r)[0];
}

// Semi-finals and finals always show. A qualification shows only when it has
// a stream (speed quals usually do; boulder and lead quals almost never).
export function climbRoundShown(r: { kind: ClimbKind; streamUrl: string | null }): boolean {
  return r.kind !== "qualification" || !!r.streamUrl;
}

export function climbVisibleRounds<T extends { kind: ClimbKind; streamUrl: string | null }>(rounds: T[]): T[] {
  return rounds.filter(climbRoundShown);
}

export function climbNotStreamedCount(rounds: { kind: ClimbKind; streamUrl: string | null }[]): number {
  return rounds.filter((r) => !climbRoundShown(r)).length;
}

export function climbNotStreamedLabel(n: number): string {
  if (n <= 0) return "";
  return `${n} round${n === 1 ? "" : "s"} not streamed`;
}

export function climbDayLabel(dayIndex: number, dayCount: number): string {
  if (!(dayCount > 1) || !(dayIndex >= 1)) return "";
  return `Day ${dayIndex} of ${dayCount}`;
}

// "Speed & Lead" in the order the day's rounds run.
export function climbDisciplinesLabel(disciplines: ClimbDiscipline[]): string {
  const seen: ClimbDiscipline[] = [];
  for (const d of disciplines) if (!seen.includes(d)) seen.push(d);
  return seen.map((d) => DISCIPLINE_WORD[d]).join(" & ");
}

// The column's italic subtitle: "Salt Lake City · Boulder · Day 2 of 3".
export function climbSubtitle(location: string, disciplines: ClimbDiscipline[], dayIndex: number, dayCount: number): string {
  return [location, climbDisciplinesLabel(disciplines), climbDayLabel(dayIndex, dayCount)].filter(Boolean).join(" · ");
}

// Shorter renderings for a narrow column, longest first.
export function climbSubtitleVariants(location: string, disciplines: ClimbDiscipline[], dayIndex: number, dayCount: number): string[] {
  const day = climbDayLabel(dayIndex, dayCount);
  const dis = climbDisciplinesLabel(disciplines);
  const shortDay = dayCount > 1 && dayIndex >= 1 ? `Day ${dayIndex}/${dayCount}` : "";
  const out = [
    climbSubtitle(location, disciplines, dayIndex, dayCount),
    [location, dis, shortDay].filter(Boolean).join(" · "),
    [location, shortDay].filter(Boolean).join(" · "),
    location,
  ].filter(Boolean);
  return out.filter((v, i) => out.indexOf(v) === i);
}

// The 11-character YouTube id inside youtu.be/<id>, watch?v=<id>, /live/<id>
// or /embed/<id>. Null for anything else (a channel /live tab has no id).
export function climbStreamVideoId(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = String(url).match(/(?:youtu\.be\/|[?&]v=|\/live\/|\/embed\/)([A-Za-z0-9_-]{11})(?![A-Za-z0-9_-])/);
  return m ? m[1] : null;
}

// One line for the detail sheet: "Blocked on YouTube in 58 regions".
export function climbBlockedNote(blockedRegions: string[] | null | undefined): string {
  const n = blockedRegions?.length ?? 0;
  if (!n) return "";
  return `Blocked on YouTube in ${n} region${n === 1 ? "" : "s"}`;
}
