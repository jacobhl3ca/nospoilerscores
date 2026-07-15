"use client";

import { useEffect } from "react";

/**
 * Boot beacon for the self-heal watchdog.
 *
 * Sets a global flag once the React tree has hydrated. The inline watchdog
 * script in <head> checks this flag ~8s after load: if it is still unset, the
 * app failed to boot (blank screen — the classic "stale service-worker cache
 * serving HTML that references JS chunks that no longer exist" wedge that
 * strands the Capacitor WebView). The watchdog then unregisters the service
 * worker, clears caches, and reloads once — recovering the user with no manual
 * "delete & reinstall the app" step.
 *
 * Rendered inside <body> in the root layout, so if any chunk the app tree needs
 * fails to load, this effect never runs and the watchdog fires.
 */
export default function BootBeacon() {
  useEffect(() => {
    try {
      (window as unknown as { __HS_OK?: number }).__HS_OK = 1;
      document.documentElement.setAttribute("data-booted", "1");
    } catch {
      /* no-op */
    }
  }, []);
  return null;
}
