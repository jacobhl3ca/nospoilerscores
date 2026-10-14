import assert from "node:assert/strict";
import test from "node:test";

import { isAppLinkHost } from "../src/lib/openExternal.ts";

// Add to calendar → Google Calendar (10/13): the prefilled event URL is an app
// link, so the native wrapper hands it to the Google Calendar app.

test("a Google Calendar render URL counts as an app-link host", () => {
  assert.equal(
    isAppLinkHost("https://calendar.google.com/calendar/render?action=TEMPLATE&text=Mets%20at%20Tigers"),
    true,
  );
});

test("other Google hosts stay in the browser", () => {
  assert.equal(isAppLinkHost("https://www.google.com/search?q=mets"), false);
});
