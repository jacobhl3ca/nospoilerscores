// Postponed, canceled and suspended games (Jacob 10/17).
//
// ESPN keeps a rained-out game on its original day with state "post", score
// 0-0 and shortDetail "Postponed". The board used to drop it, so on Fri Oct 16
// the ALCS Game 4 rainout left the MLB column with no word on why. These games
// now travel in their own list (LeagueData.calledGames), never in Game[]: about
// 15 places read `state === "post"` or `rating`, and a 0-0 "post" game would
// rate 100 and sort, prefetch and count as a final.
//
// Pure, no React, `.ts` imports only: `node --test` loads it directly, and it
// must not import espn.ts.

import { getTimeZone } from "./etDay.ts";
import { startTimeLabel } from "./gameTime.ts";

export type CalledKind = "postponed" | "canceled" | "suspended";

// The same includes() test espn.ts has always used to drop these events, plus
// the British spelling ESPN uses on some feeds.
export function calledKind(statusName: string | null | undefined): CalledKind | null {
  const s = (statusName ?? "").toUpperCase();
  if (s.includes("POSTPONED")) return "postponed";
  if (s.includes("CANCELED") || s.includes("CANCELLED")) return "canceled";
  if (s.includes("SUSPENDED")) return "suspended";
  return null;
}

// Cause words ESPN puts in front of "- Makeup on …" ("ALCS - Game 4 Rain -
// Makeup on Oct 18"). Kept short on purpose: a word not on the list shows no
// reason rather than a guess.
const REASON_WORDS = [
  "rain", "weather", "inclement weather", "snow", "heat", "storm", "storms",
  "thunderstorm", "thunderstorms", "lightning", "smoke", "air quality", "power",
  "power outage", "fog", "wind", "flooding", "hurricane", "cold",
];
const REASON_RE = new RegExp(`\\b(${[...REASON_WORDS].sort((a, b) => b.length - a.length).join("|")})\\b`, "i");
const MAKEUP_ON_RE = /\bMakeup on ([A-Z][a-z]{2,8}\.? \d{1,2})\b/i;
const MAKEUP_TAIL_RE = /\s+-\s+Makeup on [A-Z][a-z]{2,8}\.? \d{1,2}\s*$/i;

const titleCase = (s: string) => s.replace(/\b[a-z]/g, (c) => c.toUpperCase());

export function parseCalledNote(headline: string | null | undefined): { reason: string | null; makeup: string | null } {
  const text = headline ?? "";
  // With a makeup tail, the cause sits just before it ("Game 4 Rain - Makeup
  // on …"): read only that segment, so a round name never gives a cause.
  const tail = text.match(MAKEUP_TAIL_RE);
  const scope = tail ? text.slice(0, tail.index).split(" - ").pop() ?? "" : text;
  const reasonMatch = scope.match(REASON_RE);
  const makeupMatch = text.match(MAKEUP_ON_RE);
  return {
    reason: reasonMatch ? titleCase(reasonMatch[1].toLowerCase()) : null,
    makeup: makeupMatch ? makeupMatch[1] : null,
  };
}

// ESPN appends the rainout to the round label: the called game reads
// "ALCS - Game 4 Rain - Makeup on Oct 18", and the game that replays it reads
// "ALCS - Game 5 Makeup of Oct 16". Display only — parseGame keeps the raw
// label, because highlight search keys must not change.
export function cleanRoundLabel(label: string): string {
  let out = label;
  if (MAKEUP_TAIL_RE.test(out)) {
    out = out.replace(MAKEUP_TAIL_RE, "");
    // The cause words before the tail, listed or not ("Rain", "Field
    // Conditions"): cut whatever follows the game number, else a listed cause.
    out = /\bGame \d+\b/i.test(out)
      ? out.replace(/(\bGame \d+)\s+[^-]+$/i, "$1")
      : out.replace(new RegExp(`\\s+${REASON_RE.source}\\s*$`, "i"), "");
  }
  return out.replace(/\s+Makeup of [A-Z][a-z]{2,8}\.? \d{1,2}\s*$/i, "").trim();
}

// Pull the next game between the same two teams out of a list, either
// home/away order: the first one that starts after the called game. Any state,
// so a past day viewed after the replay still names it.
export function findNextMeeting<T extends { state: string; date: string; homeTeam: { id: string }; awayTeam: { id: string } }>(
  called: { date: string; homeTeam: { id: string }; awayTeam: { id: string } },
  games: readonly T[],
): T | null {
  const a = called.homeTeam.id;
  const b = called.awayTeam.id;
  if (!a || !b) return null;
  const after = Date.parse(called.date);
  const hits = games
    .filter((g) => (g.homeTeam.id === a && g.awayTeam.id === b) || (g.homeTeam.id === b && g.awayTeam.id === a))
    .filter((g) => !Number.isFinite(after) || Date.parse(g.date) > after)
    .sort((x, y) => Date.parse(x.date) - Date.parse(y.date));
  return hits[0] ?? null;
}

function ymdInZone(atMs: number, tz: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(atMs));
  } catch {
    return new Date(atMs).toISOString().slice(0, 10);
  }
}

function hourInZone(atMs: number, tz: string): number {
  try {
    return +new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", hourCycle: "h23" }).format(new Date(atMs));
  } catch {
    return new Date(atMs).getHours();
  }
}

// The card's last line: "Next game: Sat Oct 17, 8:00 PM", "Next game: tonight,
// 8:00 PM" when that game is today, ESPN's makeup date when no next game was
// found, else "New date not set yet".
export function nextGameText(called: { next: string | null; nextStatus?: string | null; makeup: string | null }, nowMs: number = Date.now(), tz: string = getTimeZone()): string {
  if (called.next) {
    const atMs = Date.parse(called.next);
    if (Number.isFinite(atMs)) {
      const time = startTimeLabel({ date: called.next, statusDetail: called.nextStatus ?? "" }, tz);
      const timePart = time && time !== "TBD" ? `, ${time}` : "";
      if (ymdInZone(atMs, tz) === ymdInZone(nowMs, tz)) {
        return `Next game: ${hourInZone(atMs, tz) >= 17 ? "tonight" : "today"}${timePart}`;
      }
      let day: string;
      try {
        const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short", month: "short", day: "numeric" }).formatToParts(new Date(atMs));
        const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
        day = `${get("weekday")} ${get("month")} ${get("day")}`;
      } catch {
        day = new Date(atMs).toDateString().slice(0, 10);
      }
      return `Next game: ${day}${timePart}`;
    }
  }
  if (called.makeup) return `Next game: ${called.makeup}`;
  return "New date not set yet";
}
