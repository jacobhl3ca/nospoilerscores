const RUNTIME_RECOVERY_KEY = "hs-runtime-recovery-v13";
const RUNTIME_RECOVERY_PAGE = "/recover-v13.html";

function currentPath(): string {
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

function recoveryUrl(returnTo: string): string {
  return `${RUNTIME_RECOVERY_PAGE}?return=${encodeURIComponent(returnTo)}`;
}

/**
 * A render error can happen after the boot beacon has already fired, so the
 * normal stale-chunk watchdog cannot see it. Route through the cache-clearing
 * recovery document once per tab, then return to the same URL. sessionStorage
 * prevents a genuine application bug from creating a reload loop.
 */
export function autoRecoverRuntimeError(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (window.sessionStorage.getItem(RUNTIME_RECOVERY_KEY)) return false;
    window.sessionStorage.setItem(RUNTIME_RECOVERY_KEY, String(Date.now()));
  } catch {
    // Without a loop guard, leave recovery to the explicit button below.
    return false;
  }
  window.location.replace(recoveryUrl(currentPath()));
  return true;
}

/** Explicit recovery action used by the fallback UI. */
export function recoverRuntimeError(returnTo?: string): void {
  if (typeof window === "undefined") return;
  window.location.replace(recoveryUrl(returnTo ?? currentPath()));
}
