import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_TIME_ZONE, getDeviceTimeZone, getEtServiceDate, getTimeZone, isValidTimeZone, setServiceTimeZone } from "../src/lib/etDay.ts";
import { formatInZone } from "../src/lib/whiparound.ts";

// GitHub #79: some browsers report "Etc/Unknown" as the device zone, and the
// same runtime then rejects it as a timeZone option. Every
// toLocale*({ timeZone: getTimeZone() }) threw
// "RangeError: Invalid time zone specified: Etc/Unknown".

// Make this runtime report a device zone, the way a browser with no tz data does.
function withDeviceZone<T>(tz: string, fn: () => T): T {
  const proto = Intl.DateTimeFormat.prototype;
  const real = proto.resolvedOptions;
  proto.resolvedOptions = function (this: Intl.DateTimeFormat) {
    return { ...real.call(this), timeZone: tz };
  };
  try {
    return fn();
  } finally {
    proto.resolvedOptions = real;
  }
}

test("Etc/Unknown is rejected by Intl in this runtime (the precondition of #79)", () => {
  assert.throws(() => new Date().toLocaleString("en-US", { timeZone: "Etc/Unknown" }), RangeError);
  assert.equal(isValidTimeZone("Etc/Unknown"), false);
  assert.equal(isValidTimeZone(""), false);
  assert.equal(isValidTimeZone(undefined), false);
  assert.equal(isValidTimeZone("America/Chicago"), true);
});

test("a device that reports Etc/Unknown falls back to the default zone", () => {
  setServiceTimeZone(undefined);
  withDeviceZone("Etc/Unknown", () => {
    assert.equal(getDeviceTimeZone(), DEFAULT_TIME_ZONE);
    assert.equal(getTimeZone(), DEFAULT_TIME_ZONE);
    // The calls that threw now format.
    assert.doesNotThrow(() => new Date().toLocaleString("en-US", { timeZone: getTimeZone() }));
    assert.doesNotThrow(() => new Intl.DateTimeFormat("en-CA", { timeZone: getTimeZone() }).format(new Date()));
    assert.doesNotThrow(() => getEtServiceDate());
    assert.match(formatInZone(Date.UTC(2026, 9, 9, 17, 0), getTimeZone()), /^1:00\s?PM$/);
  });
});

test("an invalid override over an Etc/Unknown device still lands on the default zone", () => {
  setServiceTimeZone("Etc/Unknown");
  try {
    withDeviceZone("Etc/Unknown", () => assert.equal(getTimeZone(), DEFAULT_TIME_ZONE));
  } finally {
    setServiceTimeZone(undefined);
  }
});

test("a valid device zone and a valid override are unchanged", () => {
  setServiceTimeZone(undefined);
  withDeviceZone("Europe/London", () => assert.equal(getTimeZone(), "Europe/London"));
  setServiceTimeZone("Asia/Tokyo");
  try {
    withDeviceZone("Etc/Unknown", () => assert.equal(getTimeZone(), "Asia/Tokyo"));
  } finally {
    setServiceTimeZone(undefined);
  }
});
