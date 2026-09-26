"use client";

import { useState } from "react";
import type { CalendarEvent } from "@/lib/calendarLink";
import { googleCalendarUrl, icsDataUrl, icsHttpsUrl, icsFileName } from "@/lib/calendarLink";
import { fillReminderLink } from "@/lib/reminderLink";
import { openExternal, openAppScheme, isNativeApp } from "@/lib/openExternal";

// "Add to calendar" + "Remind me" for an UPCOMING game, rendered by both detail
// sheets (GameDetailModal, EventDetailModal). Lives in the modals only: the
// score cards have a height contract (upcoming 103px / finished 113px, every
// card on a board equal — see GameCard) and a new row would break it.
//
// Add to calendar opens a small inline row of two targets rather than a menu:
// Google Calendar (a prefilled event URL — the Google Calendar app picks it up
// on iOS when installed) and Apple / Outlook (an .ics). On the web the .ics is
// a data: download; inside the Capacitor wrapper SFSafariViewController takes
// only http(s), so the same text is served back by the worker's /api/ics.
//
// Remind me is personal and off by default — it shows only when Settings →
// Reminder link holds a template with a game placeholder (lib/reminderLink.ts).

const secondary = {
  background: "var(--bg-card)",
  border: "1px solid var(--border)",
  color: "var(--text)",
} as const;

export default function CalendarButtons({
  event,
  reminderTemplate,
  onClose,
}: {
  event: CalendarEvent | null;
  reminderTemplate?: string;
  onClose: () => void;
}) {
  const [open, setOpen] = useState(false);
  // Snapshot the clock and the platform once per mount (the sheet mounts fresh
  // on every open), so render stays pure and the minute count is stable while
  // the sheet is up.
  const [now] = useState(() => Date.now());
  const [native] = useState(() => isNativeApp());
  if (!event) return null;

  const startsInFuture = new Date(event.startIso).getTime() > now;
  const reminder = startsInFuture ? fillReminderLink(reminderTemplate, event, now) : null;

  return (
    <div className="mt-4 flex flex-col gap-2">
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="w-full py-2 rounded-lg text-sm font-medium cursor-pointer"
          style={secondary}
          aria-label={`Add to calendar: ${event.title}`}
          aria-expanded={false}
        >
          Add to calendar
        </button>
      ) : (
        <div className="flex gap-2" role="group" aria-label="Add to calendar">
          <button
            type="button"
            onClick={() => { openExternal(googleCalendarUrl(event)); onClose(); }}
            className="flex-1 py-2 rounded-lg text-sm font-medium cursor-pointer"
            style={secondary}
            aria-label={`Add to Google Calendar: ${event.title}`}
          >
            Google Calendar
          </button>
          {native ? (
            <button
              type="button"
              onClick={() => { openExternal(icsHttpsUrl(event)); onClose(); }}
              className="flex-1 py-2 rounded-lg text-sm font-medium cursor-pointer"
              style={secondary}
              aria-label={`Download .ics for Apple or Outlook: ${event.title}`}
            >
              Apple / Outlook (.ics)
            </button>
          ) : (
            <a
              href={icsDataUrl(event)}
              download={icsFileName(event)}
              // Let the default action start the download, then close on the
              // next tick so unmounting the anchor cannot cancel it.
              onClick={() => { setTimeout(onClose, 0); }}
              className="flex-1 py-2 rounded-lg text-sm font-medium cursor-pointer text-center"
              style={secondary}
              aria-label={`Download .ics for Apple or Outlook: ${event.title}`}
            >
              Apple / Outlook (.ics)
            </a>
          )}
        </div>
      )}
      {reminder ? (
        <button
          type="button"
          onClick={() => { openAppScheme(reminder.url); onClose(); }}
          className="w-full py-2 rounded-lg text-sm font-medium cursor-pointer"
          style={secondary}
          aria-label={`Remind me in ${reminder.minutes} minute${reminder.minutes === 1 ? "" : "s"}: ${event.title}`}
        >
          Remind me ({reminder.minutes} min)
        </button>
      ) : null}
    </div>
  );
}
