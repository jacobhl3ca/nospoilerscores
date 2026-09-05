import test from "node:test";
import assert from "node:assert/strict";
import worker from "../public/_worker.js";

// The alerts dashboard bakes its cards to R2 under `alerts/`. Two of those keys
// are personal — `_dashboard.json` carries the Priorities card (health, money,
// travel) and `_prefs.json` the synced card order — and they were world-readable
// on hidescore.com until 2026-09-05. They are served same-origin by
// alerts.hidescore.com instead, which is behind CF Access.
//
// The rest are deal listings scraped from public subreddits, and six local
// deal-notify crons curl them from this route, so those must keep working.
// Asserted through the real worker, not by grepping the source.

function stubEnv() {
  const asked = [];
  return {
    asked,
    DATA: {
      async get(key) {
        asked.push(key);
        return { body: JSON.stringify({ served: key }) };
      },
    },
    ASSETS: {
      async fetch() {
        return new Response("STATIC", { status: 404 });
      },
    },
  };
}

async function route(path) {
  const env = stubEnv();
  const res = await worker.fetch(new Request(`https://hidescore.com${path}`), env);
  const body = await res.text();
  return { fromR2: body.includes('"served"'), asked: env.asked };
}

test("personal alerts payloads are never served publicly", async () => {
  for (const path of [
    "/alerts/_dashboard.json",
    "/alerts/_prefs.json",
    "/alerts/_anything-else.json",
    "/alerts/nested/_dashboard.json", // a nested key must not sneak past the check
  ]) {
    const { fromR2, asked } = await route(path);
    assert.equal(fromR2, false, `${path} must not be served from R2`);
    assert.deepEqual(asked, [], `${path} must not even be read from the bucket`);
  }
});

test("public deal feeds still serve — six deal-notify crons depend on them", async () => {
  for (const key of ["hdd", "bpcs", "fmf", "hardwareswap", "chefknives-bst"]) {
    const { fromR2, asked } = await route(`/alerts/${key}.json`);
    assert.equal(fromR2, true, `/alerts/${key}.json must still be public`);
    assert.deepEqual(asked, [`alerts/${key}.json`]);
  }
});

test("the other R2-backed feeds are untouched", async () => {
  for (const [path, key] of [
    ["/news/prebaked.json", "news/prebaked.json"],
    ["/espn-airings.json", "espn-airings.json"],
    ["/prime-asins.json", "prime-asins.json"],
    ["/big-inning-schedule.json", "big-inning-schedule.json"],
  ]) {
    const { fromR2, asked } = await route(path);
    assert.equal(fromR2, true, `${path} must still be served from R2`);
    assert.deepEqual(asked, [key]);
  }
});
