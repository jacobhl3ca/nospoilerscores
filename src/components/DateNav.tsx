"use client";

import { useRef, useEffect, useState } from "react";

interface DateNavProps {
  selectedDate: string; // YYYYMMDD
  onDateChange: (date: string) => void;
}

function toYYYYMMDD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

function parseYMD(yyyymmdd: string): Date {
  const y = +yyyymmdd.slice(0, 4);
  const m = +yyyymmdd.slice(4, 6) - 1;
  const d = +yyyymmdd.slice(6, 8);
  return new Date(y, m, d);
}

function formatDayName(yyyymmdd: string): string {
  return parseYMD(yyyymmdd).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

// Get current date in ET (America/New_York), shifted so the "day" doesn't roll
// over until 1AM ET. This keeps late-night games on "today" instead of jumping
// to "yesterday" at midnight.
function getNowET(): Date {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "0";
  const etHour = parseInt(get("hour"), 10);
  const etMinute = parseInt(get("minute"), 10);
  const etYear = parseInt(get("year"), 10);
  const etMonth = parseInt(get("month"), 10) - 1;
  const etDay = parseInt(get("day"), 10);
  const d = new Date(etYear, etMonth, etDay);
  // Before 1AM ET → still count as previous day
  if (etHour < 1) {
    d.setDate(d.getDate() - 1);
  }
  return d;
}

export function getDateString(daysOffset: number): string {
  const d = getNowET();
  d.setDate(d.getDate() + daysOffset);
  return toYYYYMMDD(d);
}

// Export for use in smart default offset calculation
export function getETHour(): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "0";
  return parseInt(get("hour"), 10);
}

export function getETMinute(): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "0";
  return parseInt(get("minute"), 10);
}

// Custom calendar dropdown — starts Monday, blue weekends
function CalendarDropdown({ selectedDate, onDateChange, onClose }: DateNavProps & { onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [viewDate, setViewDate] = useState(() => parseYMD(selectedDate));

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [onClose]);

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();

  const firstOfMonth = new Date(year, month, 1);
  // Monday = 0, Sunday = 6
  const startDay = (firstOfMonth.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const prevMonth = () => setViewDate(new Date(year, month - 1, 1));
  const nextMonth = () => setViewDate(new Date(year, month + 1, 1));

  const todayStr = getDateString(0);
  const dayHeaders = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

  const cells: (number | null)[] = [];
  for (let i = 0; i < startDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const monthLabel = firstOfMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  return (
    <div
      ref={ref}
      className="absolute top-full mt-2 right-0 z-50 rounded-xl shadow-lg p-3 w-64"
      style={{ background: "var(--bg)", border: "1px solid var(--border)" }}
    >
      <div className="flex items-center justify-between mb-2">
        <button onClick={prevMonth} className="w-7 h-7 flex items-center justify-center rounded-full cursor-pointer transition-colors hover:bg-[var(--bg-card)]" style={{ color: "var(--text-muted)" }}>
          {"<"}
        </button>
        <span className="text-sm font-semibold" style={{ color: "var(--text)" }}>{monthLabel}</span>
        <button onClick={nextMonth} className="w-7 h-7 flex items-center justify-center rounded-full cursor-pointer transition-colors hover:bg-[var(--bg-card)]" style={{ color: "var(--text-muted)" }}>
          {">"}
        </button>
      </div>
      <div className="grid grid-cols-7 gap-0.5 text-center">
        {dayHeaders.map((dh, i) => (
          <div
            key={dh}
            className="text-[10px] font-medium py-1"
            style={{ color: i >= 5 ? "var(--accent)" : "var(--text-muted)" }}
          >
            {dh}
          </div>
        ))}
        {cells.map((day, i) => {
          if (day === null) return <div key={`empty-${i}`} />;
          const dateStr = toYYYYMMDD(new Date(year, month, day));
          const isSelected = dateStr === selectedDate;
          const isToday = dateStr === todayStr;
          const dow = (i % 7); // 0=Mon ... 6=Sun
          const isWeekend = dow >= 5;

          return (
            <button
              key={dateStr}
              onClick={() => { onDateChange(dateStr); onClose(); }}
              className="w-8 h-8 flex items-center justify-center rounded-full text-xs cursor-pointer transition-colors"
              style={
                isSelected
                  ? { background: "var(--accent)", color: "white", fontWeight: 700 }
                  : {
                      color: isWeekend ? "var(--accent)" : "var(--text)",
                      fontWeight: isToday ? 700 : 400,
                      ...(isToday && !isSelected ? { textDecoration: "underline", textUnderlineOffset: "2px" } : {}),
                    }
              }
              onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = "var(--bg-card-hover)"; }}
              onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = "transparent"; }}
            >
              {day}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Exported for use in toolbar
export { CalendarDropdown };

export default function DateNav({ selectedDate, onDateChange }: DateNavProps) {
  const yesterday = getDateString(-1);
  const today = getDateString(0);
  const tomorrow = getDateString(1);

  const isStandardDate = selectedDate === yesterday || selectedDate === today || selectedDate === tomorrow;
  const isBeforeYesterday = !isStandardDate && selectedDate < yesterday;
  const isAfterTomorrow = !isStandardDate && selectedDate > tomorrow;

  const dateButtons: { date: string; label: string; shortLabel?: string }[] = [];

  if (isBeforeYesterday) {
    dateButtons.push({ date: selectedDate, label: formatDayName(selectedDate) });
  }

  dateButtons.push({ date: yesterday, label: "Yesterday", shortLabel: "Yst" });
  dateButtons.push({ date: today, label: "Today", shortLabel: "Today" });
  dateButtons.push({ date: tomorrow, label: "Tomorrow", shortLabel: "Tmrw" });

  if (isAfterTomorrow) {
    dateButtons.push({ date: selectedDate, label: formatDayName(selectedDate) });
  }

  // NOTE: Calendar icon was here next to Tomorrow — commented out, moved to toolbar instead.
  // Revisit positioning as low-priority item later.

  return (
    <div className="flex gap-0.5 sm:gap-1 items-center justify-center">
      {dateButtons.map((btn) => {
        const isSelected = selectedDate === btn.date;
        return (
          <button
            key={btn.date}
            onClick={() => onDateChange(btn.date)}
            className="date-nav-btn px-1.5 sm:px-3 py-1 sm:py-1.5 rounded text-[11px] sm:text-sm whitespace-nowrap transition-colors"
            style={
              isSelected
                ? { background: "var(--bg-card-hover)", color: "var(--text)", fontWeight: 600 }
                : { color: "var(--text-muted)", background: "transparent" }
            }
          >
            <span className="hidden sm:inline">{btn.label}</span>
            <span className="sm:hidden">{btn.shortLabel || btn.label}</span>
          </button>
        );
      })}
    </div>
  );
}
