// A Sentry breadcrumb from plain library code. instrumentation-client.ts plugs
// Sentry.addBreadcrumb in at boot; until then (and in unit tests) a breadcrumb
// goes nowhere. This keeps @sentry/nextjs out of the lib/ modules that the
// node unit tests import.

export type Breadcrumb = {
  category: string;
  message: string;
  level?: "info" | "warning" | "error";
  data?: Record<string, unknown>;
};

let sink: ((b: Breadcrumb) => void) | null = null;

/** instrumentation-client.ts wires Sentry in; tests pass a collector or null. */
export function setBreadcrumbSink(fn: ((b: Breadcrumb) => void) | null): void {
  sink = fn;
}

/** Leave a breadcrumb. Never throws. */
export function breadcrumb(b: Breadcrumb): void {
  try {
    sink?.(b);
  } catch {
    /* a breadcrumb must never break the caller */
  }
}

/** "InvalidStateError: The object is in an invalid state." for any thrown value. */
export function describeThrown(e: unknown): string {
  if (e && typeof e === "object") {
    const { name, message } = e as { name?: unknown; message?: unknown };
    if (typeof name === "string" || typeof message === "string") {
      return [name, message].filter((s) => typeof s === "string" && s).join(": ");
    }
  }
  return String(e);
}
