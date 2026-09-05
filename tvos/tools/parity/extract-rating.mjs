/**
 * Carves the rating block out of src/lib/espn.ts and transpiles it to plain JS.
 *
 * The website's module graph can't be imported by Node directly (it uses
 * value-position imports for types, which Node's type stripping can't erase),
 * and copying the algorithm into the harness would defeat the point of a parity
 * test. So the harness lifts the exact source text — from SPORT_RATING_CONFIG
 * through the end of calculateRating, which is self-contained apart from the
 * `Sport` type — and runs tsc over it. If anyone renames those anchors, this
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

export function buildRatingModule(espnPath) {
  const src = readFileSync(espnPath, "utf8");
  // The closeness curve is a leaf module of its own (so the website can unit-
  // test it) and the rating block references it by name, so it rides along —
  // verbatim, for the same no-copies reason as the block itself.
  const margin = readFileSync(join(dirname(espnPath), "marginCloseness.ts"), "utf8");
  const start = src.indexOf("const SPORT_RATING_CONFIG");
  if (start < 0) throw new Error("extract-rating: SPORT_RATING_CONFIG not found in espn.ts");
  const fn = src.indexOf("function calculateRating(", start);
  if (fn < 0) throw new Error("extract-rating: calculateRating not found after SPORT_RATING_CONFIG");
  const end = endOfBlock(src, fn);

  const body = [
    "type Sport = string;",
    margin,
    src.slice(start, end),
    "export { calculateRating };",
  ].join("\n\n");

  mkdirSync(WORK, { recursive: true });
  writeFileSync(join(WORK, "rating.ts"), body);
  execFileSync("npx", ["tsc", join(WORK, "rating.ts"),
    "--outDir", WORK, "--module", "esnext", "--target", "es2022", "--noCheck"],
    { stdio: ["ignore", "ignore", "inherit"] });
  writeFileSync(join(WORK, "package.json"), JSON.stringify({ type: "module" }));
  return join(WORK, "rating.js");
}
