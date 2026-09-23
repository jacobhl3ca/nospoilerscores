// Preferences that belong to ONE device and never ride the account sync.
//
// The signed-in prefs blob is one copy for every device. Single-column view is
// a choice about the SCREEN, not the person: Jacob set it on the PC (a wide
// board he wanted stacked), it synced to the phone, and the phone had no
// portrait toggle to turn it back off (9/22). So these keys are stripped from
// every push, and a pull keeps this device's own value whatever the server
// holds (older blobs still carry them from before this change).
//
// Pure + import-free (type-only import) so `node --experimental-strip-types`
// can test it.

import type { Preferences } from "./preferences";

export const DEVICE_LOCAL_PREF_KEYS = ["singleColumn", "newsSingleColumn"] as const;

type DeviceLocalKey = (typeof DEVICE_LOCAL_PREF_KEYS)[number];

/** The blob to send to the server: same prefs, device-only keys removed. */
export function withoutDeviceLocalPrefs<T extends Partial<Preferences>>(prefs: T): Omit<T, DeviceLocalKey> {
  const out = { ...prefs };
  for (const key of DEVICE_LOCAL_PREF_KEYS) delete out[key];
  return out;
}

/** After a merge with the server copy, put this device's own values back. */
export function keepDeviceLocalPrefs<T extends Partial<Preferences>>(merged: T, local: Partial<Preferences>): T {
  const out = { ...merged };
  for (const key of DEVICE_LOCAL_PREF_KEYS) {
    if (local[key] === undefined) delete out[key];
    else out[key] = local[key] as T[typeof key];
  }
  return out;
}
