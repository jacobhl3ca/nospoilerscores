import assert from "node:assert/strict";
import test from "node:test";

import { raceDetailsUrl } from "../src/lib/raceDetails.ts";

test("IndyCar ticket links fall back to the ESPN series schedule", () => {
  assert.equal(
    raceDetailsUrl("indycar", "https://www.vividseats.com/indycar-tickets--sports-auto-racing/performer/123"),
    "https://www.espn.com/racing/schedule/_/series/indycar",
  );
});

test("missing racing links fall back to the matching ESPN schedule", () => {
  assert.equal(
    raceDetailsUrl("nascar"),
    "https://www.espn.com/racing/schedule/_/series/nascar-cup",
  );
  assert.equal(raceDetailsUrl("f1"), "https://www.espn.com/f1/schedule");
});

test("ESPN event links remain the preferred details destination", () => {
  const eventUrl = "https://www.espn.com/racing/race/_/series/indycar/id/20260809";
  assert.equal(raceDetailsUrl("indycar", eventUrl), eventUrl);
});

test("lookalike hosts cannot bypass the ESPN host check", () => {
  assert.equal(
    raceDetailsUrl("indycar", "https://espn.com.example.test/tickets"),
    "https://www.espn.com/racing/schedule/_/series/indycar",
  );
});
