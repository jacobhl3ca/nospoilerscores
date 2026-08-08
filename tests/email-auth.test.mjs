import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("email-code storage is hash-only, single-row, and rate indexed", async () => {
  const migration = await readFile(new URL("../migrations/0001_email_login_codes.sql", import.meta.url), "utf8");
  assert.match(migration, /email_key TEXT PRIMARY KEY/);
  assert.match(migration, /code_hash TEXT NOT NULL/);
  assert.doesNotMatch(migration, /\bcode TEXT\b/);
  assert.match(migration, /kind, key_hash, created_at/);
});

test("worker enforces the Islander email-code security boundaries", async () => {
  const worker = await readFile(new URL("../public/_worker.js", import.meta.url), "utf8");
  assert.match(worker, /crypto\.getRandomValues/);
  assert.match(worker, /subtle\.digest\("SHA-256"/);
  assert.match(worker, /attempts >= 5/);
  assert.match(worker, /now \+ 10 \* 60 \* 1000/);
  assert.match(worker, /DELETE FROM email_login_codes[\s\S]*code_hash = \?[\s\S]*expires_at >= \?/);
  assert.match(worker, /DELETE FROM email_login_codes WHERE expires_at < \?/);
  assert.match(worker, /providers: \{ apple:.*google:.*email:/);
});

test("client exposes the two bridge-free email steps", async () => {
  const client = await readFile(new URL("../src/lib/prefsSync.ts", import.meta.url), "utf8");
  const settings = await readFile(new URL("../src/components/SettingsPanel.tsx", import.meta.url), "utf8");
  assert.match(client, /\/auth\/email\/request/);
  assert.match(client, /\/auth\/email\/verify/);
  assert.match(settings, /autoComplete="one-time-code"/);
});
