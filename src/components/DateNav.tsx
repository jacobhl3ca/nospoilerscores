"use client";

interface DateNavProps {
  selectedDate: string; // YYYYMMDD
  onDateChange: (date: string) => void;
}

function formatDate(yyyymmdd: string): string {
  const y = yyyymmdd.slice(0, 4);
  const m = yyyymmdd.slice(4, 6);
  const d = yyyymmdd.slice(6, 8);
  const date = new Date(`${y}-${m}-${d}T12:00:00`);
  const today = new Date();
  today.setHours(12, 0, 0, 0);

  const diffDays = Math.round((today.getTime() - date.getTime()) / 86400000);

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays === -1) return "Tomorrow";

  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export function getDateString(daysOffset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysOffset);
  return d.toISOString().slice(0, 10).replace(/-/g, "");
}

export default function DateNav({ selectedDate, onDateChange }: DateNavProps) {
  // Yesterday, Today, Tomorrow
  const dates = [-1, 0, 1].map((offset) => getDateString(offset));

  return (
    <div className="flex gap-1 justify-center">
      {dates.map((date) => (
        <button
          key={date}
          onClick={() => onDateChange(date)}
          className={`px-3 py-1.5 rounded text-sm transition-colors ${
            selectedDate === date
              ? "bg-white/15 text-white font-medium"
              : "text-gray-400 hover:text-white hover:bg-white/5"
          }`}
        >
          {formatDate(date)}
        </button>
      ))}
    </div>
  );
}
