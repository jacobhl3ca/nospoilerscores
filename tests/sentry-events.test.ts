import assert from "node:assert/strict";
import test from "node:test";

import { describeNonError, labelBlankEvent, toReportableError } from "../src/lib/sentryEvents.ts";

// GitHub #57: Sentry titled six events "<unknown>" because what was thrown or
// rejected was not an Error and carried nothing to print.

test("a blank event is labelled with what was actually thrown", () => {
  const ev = labelBlankEvent({} as { message?: string }, { type: "error", target: { nodeName: "SCRIPT", src: "https://x.test/a.js" } });
  assert.equal(ev.message, "Non-Error captured: Object (type=error) on <script> https://x.test/a.js");
});

test("a blank exception entry gets a type and a value", () => {
  const ev = labelBlankEvent({ exception: { values: [{}] } }, undefined);
  assert.deepEqual(ev.exception.values[0], { type: "NonError", value: "Non-Error captured: undefined" });
});

test("events that already have a title pass through untouched", () => {
  const withValue = { exception: { values: [{ type: "TypeError", value: "x is null" }] } };
  assert.deepEqual(labelBlankEvent(structuredClone(withValue), {}), withValue);
  assert.deepEqual(labelBlankEvent({ message: "hello" }, {}), { message: "hello" });
  const realError = { exception: { values: [{ type: "Error", value: "" }] } };
  assert.deepEqual(labelBlankEvent(structuredClone(realError), new Error("")), realError);
});

test("toReportableError wraps non-Errors and keeps real ones", () => {
  const real = new TypeError("boom");
  assert.equal(toReportableError(real), real);
  const dom = new DOMException("nope", "InvalidStateError");
  assert.equal(toReportableError(dom), dom);
  const wrapped = toReportableError({ code: 3 });
  assert.ok(wrapped instanceof Error);
  assert.equal(wrapped.name, "NonError");
  assert.equal(wrapped.message, "Non-Error thrown: Object with keys: code");
  assert.equal(toReportableError(undefined).message, "Non-Error thrown: undefined");
  assert.equal(toReportableError("").message, "Non-Error thrown: empty string");
});

test("describeNonError covers primitives, class instances and long strings", () => {
  assert.equal(describeNonError(null), "null");
  assert.equal(describeNonError(42), "number 42");
  assert.equal(describeNonError(new (class Foo {})()), "Foo with no keys");
  assert.ok(describeNonError("a".repeat(500)).length < 220);
});
