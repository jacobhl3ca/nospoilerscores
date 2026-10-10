/**
 * Carves the rating block out of src/lib/espn.ts and transpiles it to plain JS.
 *
 * The website's module graph can't be imported by Node directly (it uses
 * value-position imports for types, which Node's type stripping can't erase),
 * and copying the algorithm into the harness would defeat the point of a parity
 * test. So the harness lifts the exact source text — from SPORT_RATING_CONFIG
 * through the end of calculateRating — plus marginCloseness.ts and the named
 * helpers in HELPERS, and runs tsc over it. If anyone renames those anchors, this
 * throws rather than silently testing nothing.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, dirname } from "node:path";

const WORK = "/tmp/hs-parity-ts";

/** Index just past the brace-balanced body that starts at or after `from`. */
function endOfBlock(src, from) {
  let i = src.indexOf("{", from);
  if (i < 0) throw new Error("extract-rating: no block found");
  let depth = 0, str = null, line = false, block = false;
  for (let j = i; j < src.length; j++) {
    const c = src[j], n = src[j + 1];
    if (line) { if (c === "\n") line = false; continue; }
    if (block) { if (c === "*" && n === "/") { block = false; j++; } continue; }
    if (str) { if (c === "\\") { j++; continue; } if (c === str) str = null; continue; }
    if (c === "/" && n === "/") { line = true; j++; continue; }
    if (c === "/" && n === "*") { block = true; j++; continue; }
    if (c === '"' || c === "'" || c === "`") { str = c; continue; }
    if (c === "{") depth++;
    else if (c === "}") { depth--; if (depth === 0) return j + 1; }
  }
  throw new Error("extract-rating: unbalanced block");
}

/**
 * Source text of one top-level declaration in espn.ts, found by name. Handles
 * `const X = …;` (one statement), `type X = { … };` and `function X(…) { … }`,
 * with or without `export`. Throws if the name is gone, so a rename fails loudly.
 */
function liftDecl(src, name) {
  const m = new RegExp(`^(?:export )?(const|type|function) ${name}\\b`, "m").exec(src);
  if (!m) throw new Error(`extract-rating: ${name} not found in espn.ts`);
  const from = m.index;
  if (m[1] === "function") return src.slice(from, endOfBlock(src, src.indexOf(")", from)));
  const semi = src.indexOf(";\n", from);
  const brace = src.indexOf("{", from);
  // A brace before the end of the first line opens an object-shaped type/value.
  if (brace >= 0 && brace < src.indexOf("\n", from)) {
    const close = endOfBlock(src, from);
    return src.slice(from, src.indexOf(";", close) + 1);
  }
  return src.slice(from, semi + 1);
}

// Top-level helpers the rating block reads that live OUTSIDE it in espn.ts.
// When calculateRating starts calling a new one, add it here; the name check
// in buildRatingModule names it if you forget.
const HELPERS = [
  "CRICKET_SPORTS", "CricketEventLike", "cricketScheduledDays", "isMultiDayCricket",
  "LiveTimeCapMode", "LIVE_TIME_CAP", "liveTimeCap",
];

export function buildRatingModule(espnPath) {
  const src = readFileSync(espnPath, "utf8");
  const start = src.indexOf("const SPORT_RATING_CONFIG");
  if (start < 0) throw new Error("extract-rating: SPORT_RATING_CONFIG not found in espn.ts");
  const fn = src.indexOf("function calculateRating(", start);
  if (fn < 0) throw new Error("extract-rating: calculateRating not found after SPORT_RATING_CONFIG");
  const end = endOfBlock(src, fn);

  // The block calls marginCloseness and reads FOOTBALL_CLOSENESS, which espn.ts
  // imports from the leaf module ./marginCloseness. Inline that module (it has
  // no imports of its own) so the carved-out block resolves them.
  const closeness = readFileSync(join(dirname(espnPath), "marginCloseness.ts"), "utf8");
  const block = src.slice(start, end);
  // liftDecl would find these again inside the block; take only the ones outside it.
  const outside = src.slice(0, start) + src.slice(end);

  const body = [
    "type Sport = string;",
    closeness,
    ...HELPERS.map((name) => liftDecl(outside, name)),
    block,
    "export { calculateRating };",
  ].join("\n\n");

  mkdirSync(WORK, { recursive: true });
  writeFileSync(join(WORK, "rating.ts"), body);

  // --noCheck below skips type errors, so an identifier the block uses but the
  // module lacks would only surface as a ReferenceError mid-run (that is how
  // "FOOTBALL_CLOSENESS is not defined" shipped). Type-check once and fail on
  // unresolved names only (TS2304/TS2552); other type noise is irrelevant here.
  let check = "";
  try {
    execFileSync("npx", ["tsc", join(WORK, "rating.ts"), "--noEmit", "--module", "esnext",
      "--target", "es2022", "--lib", "es2022,dom", "--skipLibCheck"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch (e) { check = String(e.stdout ?? "") + String(e.stderr ?? ""); }
  const missing = [...new Set([...check.matchAll(/rating\.ts\(\d+,\d+\): error TS(?:2304|2552): Cannot find name '([^']+)'/g)].map((x) => x[1]))];
  if (missing.length) {
    throw new Error(`extract-rating: the rating block uses names it does not define: ${missing.join(", ")}. Add them to HELPERS.`);
  }

  execFileSync("npx", ["tsc", join(WORK, "rating.ts"),
    "--outDir", WORK, "--module", "esnext", "--target", "es2022", "--noCheck"],
    { stdio: ["ignore", "ignore", "inherit"] });
  writeFileSync(join(WORK, "package.json"), JSON.stringify({ type: "module" }));
  return join(WORK, "rating.js");
}
