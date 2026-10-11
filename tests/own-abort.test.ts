import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { abortOwn, isAbortError, isOwnAbort, OWN_ABORT_PATTERN } from "../src/lib/abort.ts";

// GitHub #252 / #261: fetches HideScore cancels on purpose rejected with a
// nameless AbortError that reached Sentry. abortOwn() names the abort, so the
// Sentry ignore rule matches ours and nothing else.

async function rejectionOf(p: Promise<unknown>): Promise<unknown> {
  try {
    await p;
  } catch (e) {
    return e;
  }
  assert.fail("expected a rejection");
}

test("a fetch we abort rejects with our named AbortError", async () => {
  const ctrl = new AbortController();
  abortOwn(ctrl);
  const e = await rejectionOf(fetch("http://127.0.0.1:9/never", { signal: ctrl.signal }));
  assert.equal((e as Error).name, "AbortError");
  assert.ok(isAbortError(e));
  assert.ok(isOwnAbort(e));
  // Sentry formats a stackless DOMException as "Error: AbortError: <message>".
  assert.match(`Error: AbortError: ${(e as Error).message}`, OWN_ABORT_PATTERN);
});

test("a bare abort() — the browser's, Next's, or a third party's — is not ours", async () => {
  const ctrl = new AbortController();
  ctrl.abort();
  const e = await rejectionOf(fetch("http://127.0.0.1:9/never", { signal: ctrl.signal }));
  assert.ok(isAbortError(e));
  assert.equal(isOwnAbort(e), false);
  assert.doesNotMatch("AbortError: signal is aborted without reason", OWN_ABORT_PATTERN);
  assert.doesNotMatch("Error: AbortError: The operation was aborted.", OWN_ABORT_PATTERN);
});

test("non-abort values are not abort errors", () => {
  assert.equal(isAbortError(new Error("boom")), false);
  assert.equal(isAbortError(undefined), false);
  assert.equal(isAbortError("AbortError"), false);
  assert.equal(isOwnAbort(new TypeError("Failed to fetch")), false);
});

test("Sentry ignores our aborts, and every abort in src goes through abortOwn", async () => {
  const init = await readFile(new URL("../src/instrumentation-client.ts", import.meta.url), "utf8");
  assert.match(init, /OWN_ABORT_PATTERN/);
  const { execFileSync } = await import("node:child_process");
  let bare = "";
  try {
    bare = execFileSync("grep", ["-rnE", "\\.abort\\(\\)", "src", "--include=*.ts", "--include=*.tsx"], {
      cwd: new URL("..", import.meta.url),
      encoding: "utf8",
    });
  } catch {
    bare = ""; // grep exits 1 on no match
  }
  const code = bare.split("\n").filter((l) => l && !/^src\/lib\/abort\.ts:/.test(l));
  assert.deepEqual(code, []);
});
