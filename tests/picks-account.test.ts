import assert from "node:assert/strict";
import test from "node:test";

import { parseAccount, parseSaved, reconcilePicks, type Saved, type Sent } from "../src/lib/picksAccount.ts";

// Jacob 9/24: the bracket he submitted on the PC did not show on his phone.
// The account carries the token and the submitted picks; every device adopts
// the token and never mints its own over it.

const A = "aaaaaaaaaaaaaaaaaaaaaaaa";
const B = "bbbbbbbbbbbbbbbbbbbbbbbb";
const sent = (at: string, name = "JH", ws = "147"): Sent => ({ name, picks: { ws }, at });
const posted = (s: Sent): Saved => ({ name: s.name, draft: s.picks, sent: s, posted: true });
const T1 = "2026-09-24T20:00:00.000Z";
const T2 = "2026-09-25T09:00:00.000Z";

test("the PC that submitted seeds an empty account with its token and entry", () => {
  const out = reconcilePicks(null, A, { "mlb-2026": posted(sent(T1)) });
  assert.equal(out.token, A);
  assert.deepEqual(out.local, {});
  assert.deepEqual(out.push, { token: A, boards: { "mlb-2026": sent(T1) } });
});

test("a device with no token and no entry sends nothing", () => {
  assert.deepEqual(reconcilePicks(null, null, {}), { token: null, local: {}, push: null });
  // A token with only an unsubmitted draft is nothing to share either.
  const draft: Saved = { name: "JH", draft: { ws: "147" }, sent: sent(T1), posted: false };
  assert.equal(reconcilePicks(null, A, { "mlb-2026": draft }).push, null);
});

test("the phone adopts the account token and shows the submitted bracket", () => {
  const acct = { token: A, boards: { "mlb-2026": sent(T1) } };
  const out = reconcilePicks(acct, null, {});
  assert.equal(out.token, A);
  assert.deepEqual(out.local, { "mlb-2026": posted(sent(T1)) });
  assert.equal(out.push, null);
});

test("a phone that minted its own token gives it up, and its own entry never goes up", () => {
  const acct = { token: A, boards: { "mlb-2026": sent(T1) } };
  const out = reconcilePicks(acct, B, { "mlb-2026": posted(sent(T2, "JH2", "119")) });
  assert.equal(out.token, A);
  assert.deepEqual(out.local, { "mlb-2026": posted(sent(T1)) });
  assert.equal(out.push, null);
});

test("same token: the newer side wins, both ways", () => {
  const acct = { token: A, boards: { "mlb-2026": sent(T1) } };
  const up = reconcilePicks(acct, A, { "mlb-2026": posted(sent(T2, "JH", "119")) });
  assert.deepEqual(up.local, {});
  assert.deepEqual(up.push, { token: A, boards: { "mlb-2026": sent(T2, "JH", "119") } });

  const acct2 = { token: A, boards: { "mlb-2026": sent(T2, "JH", "119") } };
  const down = reconcilePicks(acct2, A, { "mlb-2026": posted(sent(T1)) });
  assert.deepEqual(down.local, { "mlb-2026": posted(sent(T2, "JH", "119")) });
  assert.equal(down.push, null);
});

test("in step already: nothing changes", () => {
  const acct = { token: A, boards: { "mlb-2026": sent(T1) } };
  assert.deepEqual(reconcilePicks(acct, A, { "mlb-2026": posted(sent(T1)) }), { token: A, local: {}, push: null });
});

test("parsers drop malformed records", () => {
  assert.equal(parseAccount(null), null);
  assert.equal(parseAccount({ token: "short", boards: {} }), null);
  assert.deepEqual(parseAccount({ token: A, boards: { "mlb-2026": sent(T1), "nba-2026": sent(T1), "mlb-2025": { name: 1 } } }), {
    token: A,
    boards: { "mlb-2026": sent(T1) },
  });
  assert.deepEqual(parseSaved("{bad"), { name: "", draft: {}, sent: null, posted: false });
  assert.equal(parseSaved(JSON.stringify({ name: "JH", draft: {}, sent: { name: "JH", picks: {} }, posted: true })).sent, null);
});
