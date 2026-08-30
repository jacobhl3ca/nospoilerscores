import { readFileSync } from "node:fs";
const ts = JSON.parse(readFileSync(new URL("./ts-ratings.json", import.meta.url), "utf8"));
const sw = JSON.parse(readFileSync(new URL("./swift-ratings.json", import.meta.url), "utf8"));

const key = (r) => `${r.league}:${r.id}`;
const swMap = new Map(sw.map((r) => [key(r), r.rating]));

let compared = 0, mismatched = 0, missing = 0;
const examples = [];
for (const row of ts) {
  if (!swMap.has(key(row))) { missing++; continue; }
  compared++;
  const a = row.rating ?? null;
  const b = swMap.get(key(row)) ?? null;
  if (a !== b) {
    mismatched++;
    if (examples.length < 25) examples.push(`${key(row)}  ts=${a}  swift=${b}`);
  }
}

console.log(`compared ${compared} games · ${mismatched} mismatched · ${missing} not parsed by Swift`);
if (examples.length) console.log(examples.join("\n"));
// A game the Swift parser drops entirely is a real defect too — it would be an
// empty card on the TV — so it fails the run alongside a rating mismatch.
process.exit(mismatched === 0 && missing === 0 ? 0 : 1);
