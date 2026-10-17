import { expect, test, type Page } from "@playwright/test";

// GitHub #57: six Sentry events on / arrived titled "<unknown>": no exception
// type, no value, no message. The source is not known. The guard on main is
// beforeSend → labelBlankEvent (src/lib/sentryEvents.ts), which fills such an
// event from the original value. tests/sentry-events.test.ts covers the
// helper; this spec covers the wiring: it raises a blank error in the real
// page, catches the envelope the SDK posts, and reads the event in it.
// Nothing leaves the machine: the ingest route answers locally.

type SentryEvent = {
  message?: string | { formatted?: string };
  exception?: { values?: { type?: string; value?: string }[] };
  tags?: Record<string, string>;
  breadcrumbs?: { category?: string; message?: string; data?: Record<string, unknown> }[];
};

async function captureEvents(page: Page) {
  const events: SentryEvent[] = [];
  await page.route(/ingest\.(us\.)?sentry\.io/, async (route) => {
    const body = route.request().postData() ?? "";
    // An envelope is newline-separated JSON: header, then item header + payload pairs.
    const lines = body.split("\n").filter(Boolean);
    for (let i = 1; i + 1 < lines.length; i += 2) {
      try {
        if (JSON.parse(lines[i]).type === "event") events.push(JSON.parse(lines[i + 1]));
      } catch { /* not JSON (compressed or binary) — skip */ }
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });
  return events;
}

const title = (e: SentryEvent) => {
  const v = e.exception?.values?.[0];
  if (v && (v.value || (v.type && v.type !== "Error"))) return `${v.type}: ${v.value}`;
  return typeof e.message === "string" ? e.message : e.message?.formatted ?? "";
};

for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) {
  test(`a blank window error reaches Sentry with a title at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const events = await captureEvents(page);
    await page.goto("/");
    // The SDK installs its global handlers in instrumentation-client.
    await expect.poll(() => page.evaluate(() => typeof (window as unknown as { __SENTRY__?: unknown }).__SENTRY__), { timeout: 30_000 }).toBe("object");

    // An `error` event with no message and no error object: the shape Sentry
    // titles "<unknown>" when nothing fills it.
    await page.evaluate(() => { window.dispatchEvent(new ErrorEvent("error", { message: "" })); });

    await expect.poll(() => events.length, { timeout: 15_000 }).toBeGreaterThan(0);
    const ev = events[events.length - 1];
    expect(title(ev)).toMatch(/^NonError: Non-Error captured: /);
    expect(ev.tags?.non_error).toBe("blank");
    const crumb = ev.breadcrumbs?.find((b) => b.category === "non-error");
    expect(crumb?.data).toMatchObject({ visibility: expect.any(String), online: expect.any(Boolean) });
  });
}
