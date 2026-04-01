"use client";

import { useRef } from "react";

interface DateNavProps {
  selectedDate: string; // YYYYMMDD
  onDateChange: (date: string) => void;
}

function toYYYYMMDD(d: Date): string {
  return d.toISOString().slice(0, 10).replace(/-/g, "");
}

function toInputFormat(yyyymmdd: string): string {
  return `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;
}

function formatDayName(yyyymmdd: string): string {
  const y = yyyymmdd.slice(0, 4);
  const m = yyyymmdd.slice(4, 6);
  const d = yyyymmdd.slice(6, 8);
  return new Date(`${y}-${m}-${d}T12:00:00`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export function getDateString(daysOffset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysOffset);
  return toYYYYMMDD(d);
}

export default function DateNav({ selectedDate, onDateChange }: DateNavProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const yesterday = getDateString(-1);
  const today = getDateString(0);
  const tomorrow = getDateString(1);

  const isStandardDate = selectedDate === yesterday || selectedDate === today || selectedDate === tomorrow;
  const isBeforeYesterday = !isStandardDate && selectedDate < yesterday;
  const isAfterTomorrow = !isStandardDate && selectedDate > tomorrow;

  const dateButtons: { date: string; label: string; shortLabel?: string }[] = [];

  // Custom date before yesterday
  if (isBeforeYesterday) {
    dateButtons.push({ date: selectedDate, label: formatDayName(selectedDate) });
  }

  dateButtons.push({ date: yesterday, label: "Yesterday", shortLabel: "Yst" });
  dateButtons.push({ date: today, label: "Today", shortLabel: "Today" });
  dateButtons.push({ date: tomorrow, label: "Tomorrow", shortLabel: "Tmrw" });

  // Custom date after tomorrow
  if (isAfterTomorrow) {
    dateButtons.push({ date: selectedDate, label: formatDayName(selectedDate) });
  }

  const handleCalendarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value; // YYYY-MM-DD
    if (val) {
      onDateChange(val.replace(/-/g, ""));
    }
  };

  return (
    <div className="flex gap-0.5 sm:gap-1 items-center justify-center">
      {dateButtons.map((btn) => (
        <button
          key={btn.date}
          onClick={() => onDateChange(btn.date)}
          className="date-nav-btn px-1.5 sm:px-3 py-1 sm:py-1.5 rounded text-[11px] sm:text-sm whitespace-nowrap transition-all"
          style={
            selectedDate === btn.date
              ? { background: "var(--bg-card-hover)", color: "var(--text)", fontWeight: 500 }
              : { color: "var(--text-secondary)" }
          }
        >
          <span className="hidden sm:inline">{btn.label}</span>
          <span className="sm:hidden">{btn.shortLabel || btn.label}</span>
        </button>
      ))}
      <button
        onClick={() => inputRef.current?.showPicker()}
        className="date-nav-btn w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center rounded-full transition-all flex-shrink-0"
        style={{ background: "var(--bg-card)", color: "var(--text-secondary)" }}
        title="Pick a date"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
      </button>
      <input
        ref={inputRef}
        type="date"
        value={toInputFormat(selectedDate)}
        onChange={handleCalendarChange}
        className="sr-only"
        tabIndex={-1}
      />
    </div>
  );
}
