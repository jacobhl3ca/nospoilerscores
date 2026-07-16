"use client"; // Error boundaries must be Client Components

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";
import { autoRecoverRuntimeError, recoverRuntimeError } from "@/lib/runtimeRecovery";

// Route-level error boundary for the page segment. Without this, an uncaught
// render error in the (large, client-heavy) page white-screened the whole app
// behind Next's bare fallback. This shows a branded, recoverable card instead.
// It wraps page.tsx but NOT the root layout — layout-level failures would need
// a separate global-error.tsx.
export default function Error({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  // Next 16.2 recovery prop: re-fetches + re-renders the boundary's contents.
  unstable_retry: () => void;
}) {
  useEffect(() => {
    // Surface the failure in the console for debugging (digest links it to any
    // server-side log), and report it to Sentry for crash visibility.
    console.error(error);
    Sentry.captureException(error);
    // BootBeacon may already have fired before a stale mixed-version chunk
    // crashes during render. Heal that case once; a real code bug settles on
    // this fallback after the guarded retry instead of reload-looping.
    const timer = window.setTimeout(() => autoRecoverRuntimeError(), 750);
    return () => window.clearTimeout(timer);
  }, [error]);

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6 text-center" style={{ background: "var(--bg)", color: "var(--text)" }}>
      <h1 className="text-2xl font-bold mb-2">Something went wrong</h1>
      <p className="mb-5" style={{ color: "var(--text-muted)" }}>
        That didn&apos;t load right. Try again — your scores are still hidden.
      </p>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => unstable_retry()}
          className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          style={{ background: "var(--accent)", color: "#ffffff" }}
        >
          Try again
        </button>
        <button
          type="button"
          onClick={() => recoverRuntimeError("/")}
          className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--accent)" }}
        >
          Back to HideScore
        </button>
      </div>
    </main>
  );
}
