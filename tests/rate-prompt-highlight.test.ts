import assert from "node:assert/strict";
import test from "node:test";

import { noteAppOpen, noteHighlightWatched } from "../src/lib/rateApp.ts";

// Own file: rateApp.ts asks at most once per module load, so this case needs
// a fresh module rather than one rate-prompt.test.ts has already asked in.

const KEY = "nss-rate-prompt";

test("existing user: a finished highlight in the seeded session asks once", async () => {
  const store = new Map<string, string>([["nss-leagues", "[]"]]);
  (globalThis as unknown as { window: unknown }).window = {
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      get length() {
        return store.size;
      },
      key: (i: number) => [...store.keys()][i] ?? null,
    },
    Capacitor: {
      isNativePlatform: () => true,
      isPluginAvailable: (name: string) => name === "InAppReview",
    },
  };

  noteAppOpen();
  assert.equal(JSON.parse(store.get(KEY) ?? "null").lastAskedMs, null);

  noteHighlightWatched();
  const asked = JSON.parse(store.get(KEY) ?? "null").lastAskedMs;
  assert.equal(typeof asked, "number");

  // A second highlight in the same load does not ask again.
  await new Promise((r) => setTimeout(r, 5));
  noteHighlightWatched();
  assert.equal(JSON.parse(store.get(KEY) ?? "null").lastAskedMs, asked);
});
