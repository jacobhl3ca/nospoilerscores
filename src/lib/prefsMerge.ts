// Pure helpers for the signed-in prefs pull (mergeRemotePreferences in
// HomeContent). Import-free so `node --experimental-strip-types` can test them.

/**
 * The starting point of a pull: install defaults, then the account copy.
 *
 * The account copy is canonical for EVERY key. A key it omits means "default",
 * because JSON drops undefined, so a pick reset to Auto is simply absent from
 * the blob. The merge used to start from this device's blob instead, so a
 * device that still held the old pick kept it, and its next save pushed the
 * pick back to every other device. That is how news column 3 kept coming back
 * as CFL after it was reset (Jacob 9/25).
 */
export function accountPrefsBase<T extends object>(defaults: T, remote: Partial<T>): T {
  return { ...defaults, ...remote };
}

/**
 * Same settings, whatever the key order. A pull that changes nothing must not
 * re-save and re-push, and the merged object's keys come out in a different
 * order from the stored blob's.
 */
export function samePrefs(a: unknown, b: unknown): boolean {
  return stableJson(a) === stableJson(b);
}

function stableJson(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) => {
    if (!v || typeof v !== "object" || Array.isArray(v)) return v;
    const obj = v as Record<string, unknown>;
    return Object.fromEntries(Object.keys(obj).sort().map((k) => [k, obj[k]]));
  });
}

/**
 * The per-card news values (each card's Headlines / Media / Posts) through a
 * pull: the one key this device keeps when the account copy has none.
 *
 * An account copy with no `newsCardPrefs` key was written before the per-card
 * buttons existed, or by a device that never used them. Reading that as
 * "default" put every card back on the toolbar's Headlines value 1-3 s after
 * load, so a card set to hide its headlines showed them (Jacob 10/10). A set
 * the user emptied is `{}`, which the account copy does hold, so a real clear
 * still reaches every device.
 */
export function carryCardPrefs<T extends object>(local: T | undefined, remote: T | undefined): T | undefined {
  return remote === undefined ? local : remote;
}
