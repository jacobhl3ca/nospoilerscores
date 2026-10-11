// Turning values that are not Errors into something Sentry can title.
//
// GitHub #57: six events on / arrived titled "<unknown>" — no exception type,
// no value, no message. Sentry builds that shape when the thing thrown or
// rejected is not an Error and carries nothing to print: a script/media
// `error` Event, an empty object, a bare onerror with no message. Nothing in
// HideScore's own source throws or rejects a non-Error (checked 2026-10-09),
// so the thrower is not known yet. These helpers make the next one name itself:
// the error boundaries wrap a non-Error in a real Error, and beforeSend fills a
// blank event from the original value.

const MAX = 200;

function clip(s: string): string {
  return s.length > MAX ? `${s.slice(0, MAX)}…` : s;
}

/** A short, safe description of any thrown or rejected value. */
export function describeNonError(value: unknown): string {
  if (value === undefined) return "undefined";
  if (value === null) return "null";
  if (typeof value === "string") return value ? `string "${clip(value)}"` : "empty string";
  if (typeof value !== "object" && typeof value !== "function") return `${typeof value} ${clip(String(value))}`;
  const ctor = (value as { constructor?: { name?: unknown } }).constructor?.name;
  const name = typeof ctor === "string" && ctor ? ctor : "Object";
  const ev = value as { type?: unknown; target?: unknown };
  if (typeof ev.type === "string" && "target" in ev) {
    const t = ev.target as { nodeName?: unknown; src?: unknown; href?: unknown; currentSrc?: unknown } | null;
    const node = t && typeof t.nodeName === "string" ? ` on <${t.nodeName.toLowerCase()}>` : "";
    const srcRaw = t && (t.currentSrc || t.src || t.href);
    const src = typeof srcRaw === "string" && srcRaw ? ` ${clip(srcRaw)}` : "";
    return `${name} (type=${ev.type})${node}${src}`;
  }
  let keys: string[] = [];
  try {
    keys = Object.keys(value as object).slice(0, 10);
  } catch {
    /* exotic object — name only */
  }
  return keys.length ? `${name} with keys: ${keys.join(", ")}` : `${name} with no keys`;
}

/** The value as an Error Sentry can title. Errors and DOMExceptions pass through. */
export function toReportableError(value: unknown): Error {
  if (value instanceof Error) return value;
  if (typeof DOMException !== "undefined" && value instanceof DOMException) return value as unknown as Error;
  const e = new Error(`Non-Error thrown: ${describeNonError(value)}`, { cause: value });
  e.name = "NonError";
  return e;
}

interface MinimalEvent {
  message?: string;
  exception?: { values?: Array<{ type?: string; value?: string }> };
}

/**
 * For Sentry's beforeSend: when an event has no message and no exception
 * type or value (the shape Sentry titles "<unknown>"), fill it from the
 * original value so the issue says what was thrown. Other events pass
 * through untouched.
 */
export function labelBlankEvent<E extends MinimalEvent>(event: E, originalException: unknown): E {
  if (event.message || originalException instanceof Error) return event;
  const values = event.exception?.values;
  if (values?.some((v) => v.value || (v.type && v.type !== "Error"))) return event;
  const desc = `Non-Error captured: ${describeNonError(originalException)}`;
  if (values && values.length) {
    values[0].type = "NonError";
    values[0].value = desc;
  } else {
    event.message = desc;
  }
  return event;
}
