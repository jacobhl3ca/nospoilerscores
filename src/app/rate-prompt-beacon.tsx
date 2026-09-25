"use client";

import { useEffect } from "react";
import { noteAppOpen } from "@/lib/rateApp";

/**
 * Records this app open as a session for the in-app rating prompt (see
 * src/lib/rateApp.ts) and, if this is the 3rd+ distinct session and we're
 * outside the local re-ask window, requests the native review sheet.
 *
 * Mounted once in the root layout, next to BootBeacon — a no-op on the web,
 * since noteAppOpen() bails out immediately when Capacitor.isNativePlatform()
 * is false.
 */
export default function RatePromptBeacon() {
  useEffect(() => {
    noteAppOpen();
  }, []);
  return null;
}
