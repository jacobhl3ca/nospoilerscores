// Runs as `postbuild`: writes out/build.json = {"id": NEXT_PUBLIC_BUILD_SHA}.
// A resumed tab compares it with the id baked into its bundle and reloads once
// when they differ (src/lib/buildCheck.ts). A local build with no SHA writes
// "dev", which the client never reloads for.
import { writeFileSync, existsSync } from "node:fs";

const out = new URL("../out/", import.meta.url);
if (!existsSync(out)) {
  console.error("write-build-json: out/ is missing; did next build run?");
  process.exit(1);
}
const id = process.env.NEXT_PUBLIC_BUILD_SHA || "dev";
writeFileSync(new URL("build.json", out), JSON.stringify({ id }) + "\n");
console.log(`write-build-json: out/build.json id=${id}`);
